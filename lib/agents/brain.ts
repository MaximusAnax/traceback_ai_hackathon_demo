import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

import type { MockSandboxHandle } from "@/lib/services/sandbox-mock";
import type { Database } from "@/supabase/mutations";

const MAX_ROUNDS = 3;

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are a staff-level TypeScript engineer. You reproduce and fix bugs using tests.
You may call read_files, run_shell_command, and write_file to inspect the repo, run npm test, and apply a minimal fix.
Prefer small, typed changes. When done, summarize the fix in plain text.`;

/** Shown when the Anthropic API fails or the model never returns a final answer — keeps the demo running. */
export const STATIC_FALLBACK_PATCH = `--- a/src/example.ts
+++ b/src/example.ts
@@ -1,4 +1,4 @@
 export function normalize(x: unknown): string {
-  return String(x ?? "").trim();
+  return String(x ?? "").trim().toLowerCase();
 }
 // Mock patch: tighten handling so tests expecting lowercase pass. Replace with real edit after API recovery.
`;

export type FixLoopIncident = Pick<
  Database["public"]["Tables"]["incidents"]["Row"],
  "id" | "status" | "external_sentry_id" | "payload_summary"
>;

export type FixLoopResult = {
  suggestedPatch: string;
  /** Anthropic API calls performed (1–3). */
  rounds: number;
  /** False when every API call failed and fallback patch was used. */
  completedViaApi: boolean;
  /** True when the third API round returned tool_use and no further call was allowed. */
  stoppedAtRoundLimit: boolean;
};

const SANDBOX_TOOLS: Tool[] = [
  {
    name: "read_files",
    description:
      "Read file contents from the sandbox workspace. Pass paths relative to the repo root.",
    input_schema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "File paths to read",
        },
      },
      required: ["paths"],
    },
  },
  {
    name: "run_shell_command",
    description:
      "Run a shell command in the sandbox (e.g. npm test, npm install, git status).",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command as a single string",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file in the sandbox workspace.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Target path" },
        content: { type: "string", description: "Full file contents" },
      },
      required: ["path", "content"],
    },
  },
];

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function buildUserMessage(incident: FixLoopIncident, repoUrl: string): string {
  const lines = [
    `Incident id: ${incident.id}`,
    `External Sentry id: ${incident.external_sentry_id ?? "(none)"}`,
    `Repo: ${repoUrl}`,
    "",
    "Stack / context (from payload):",
    incident.payload_summary?.trim() || "(no summary)",
  ];
  return lines.join("\n");
}

function parsePaths(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const raw = (input as { paths?: unknown }).paths;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((p) => String(p));
}

function parseCommand(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "";
  }
  const c = (input as { command?: unknown }).command;
  return typeof c === "string" ? c : "";
}

function parseWrite(input: unknown): { path: string; content: string } {
  if (!input || typeof input !== "object") {
    return { path: "", content: "" };
  }
  const o = input as { path?: unknown; content?: unknown };
  return {
    path: typeof o.path === "string" ? o.path : "",
    content: typeof o.content === "string" ? o.content : "",
  };
}

async function dispatchTool(
  name: string,
  input: unknown,
  sandbox: MockSandboxHandle,
): Promise<string> {
  switch (name) {
    case "read_files": {
      const paths = parsePaths(input);
      const { output } = await sandbox.readFiles(paths);
      return output;
    }
    case "run_shell_command": {
      const command = parseCommand(input);
      const { output } = await sandbox.runShellCommand(command);
      return output;
    }
    case "write_file": {
      const { path, content } = parseWrite(input);
      const { output } = await sandbox.writeFile(path, content);
      return output;
    }
    default:
      return `(unknown tool: ${name})`;
  }
}

async function runToolUses(
  blocks: ContentBlock[],
  sandbox: MockSandboxHandle,
): Promise<ToolResultBlockParam[]> {
  const toolUses = blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
  const results: ToolResultBlockParam[] = [];

  for (const tu of toolUses) {
    try {
      const content = await dispatchTool(tu.name, tu.input, sandbox);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content,
      });
    } catch (err) {
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: err instanceof Error ? err.message : String(err),
        is_error: true,
      });
    }
  }

  return results;
}

/**
 * Single-provider fix loop: Anthropic Messages API with three tools backed by the mock sandbox.
 * At most **3** API rounds; tool results are fed back as `tool_result` blocks. On API failure, returns {@link STATIC_FALLBACK_PATCH}.
 */
export async function runFixLoop(
  incident: FixLoopIncident,
  sandbox: MockSandboxHandle,
): Promise<FixLoopResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      suggestedPatch: STATIC_FALLBACK_PATCH,
      rounds: 0,
      completedViaApi: false,
      stoppedAtRoundLimit: false,
    };
  }

  const client = new Anthropic({ apiKey });

  const messages: MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage(incident, sandbox.repoUrl),
    },
  ];

  let lastAssistantText = "";
  let stoppedAtRoundLimit = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    try {
      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: SANDBOX_TOOLS,
        messages,
      });

      const text = extractTextFromBlocks(response.content);
      if (text) {
        lastAssistantText = text;
      }

      if (response.stop_reason !== "tool_use") {
        return {
          suggestedPatch: lastAssistantText || STATIC_FALLBACK_PATCH,
          rounds: round + 1,
          completedViaApi: true,
          stoppedAtRoundLimit: false,
        };
      }

      messages.push({
        role: "assistant",
        content: response.content,
      });

      const toolResults = await runToolUses(response.content, sandbox);
      messages.push({
        role: "user",
        content: toolResults,
      });

      if (round === MAX_ROUNDS - 1) {
        stoppedAtRoundLimit = true;
        break;
      }
    } catch (err) {
      console.error("runFixLoop Anthropic error:", err);
      return {
        suggestedPatch: STATIC_FALLBACK_PATCH,
        rounds: round + 1,
        completedViaApi: false,
        stoppedAtRoundLimit: false,
      };
    }
  }

  return {
    suggestedPatch: lastAssistantText || STATIC_FALLBACK_PATCH,
    rounds: MAX_ROUNDS,
    completedViaApi: true,
    stoppedAtRoundLimit,
  };
}
