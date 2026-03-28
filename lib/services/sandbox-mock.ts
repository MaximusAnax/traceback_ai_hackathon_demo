import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appendExecutionLog,
  createSupabaseClient,
  type Database,
} from "@/supabase/mutations";

export type MockSandboxOptions = {
  /** When set, canned output is also written to `execution_logs` for the Engine Room UI. */
  incidentId?: string;
  /** Defaults to `createSupabaseClient()` when `incidentId` is set. */
  supabase?: SupabaseClient<Database>;
};

export type MockSandboxHandle = {
  readonly repoUrl: string;
  runShellCommand: (command: string) => Promise<{ output: string }>;
  readFiles: (paths: string[]) => Promise<{ output: string }>;
  writeFile: (path: string, content: string) => Promise<{ output: string }>;
};

type Ctx = {
  repoUrl: string;
  repoSlug: string;
  files: Map<string, string>;
  testRuns: number;
  options: MockSandboxOptions;
};

function slugFromUrl(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const base = u.pathname.replace(/\.git$/i, "").split("/").filter(Boolean).pop();
    return base ?? "repo";
  } catch {
    return "repo";
  }
}

async function persistLog(
  ctx: Ctx,
  message: string,
  kind: string,
): Promise<void> {
  const { incidentId, supabase } = ctx.options;
  if (!incidentId) {
    return;
  }
  const client = supabase ?? createSupabaseClient();
  await appendExecutionLog(client, {
    incident_id: incidentId,
    message,
    kind,
  });
}

function cloneOutput(repoUrl: string, slug: string): string {
  return [
    `$ git clone ${repoUrl} /workspace/${slug}`,
    "Cloning into '/workspace/" + slug + "'...",
    "remote: Enumerating objects: 1240, done.",
    "remote: Counting objects: 100% (1240/1240), done.",
    "Receiving objects: 100% (1240/1240), 1.42 MiB | 4.20 MiB/s, done.",
    "Resolving deltas: 100% (890/890), done.",
  ].join("\n");
}

function npmInstallOutput(slug: string): string {
  return [
    `$ cd /workspace/${slug} && npm install`,
    "",
    "added 372 packages, and audited 373 packages in 12s",
    "",
    "92 packages are looking for funding",
    "  run `npm fund` for details",
    "",
    "found 0 vulnerabilities",
  ].join("\n");
}

function npmTestOutput(attempt: number): string {
  if (attempt === 1) {
    return [
      `$ npm test -- traceback_repro.test.ts`,
      "",
      " RUN  v2.1.0 /workspace/repo",
      "",
      " ❯ traceback_repro.test.ts (1 test | 1 failed) 42ms",
      "   × reproduces Sentry exception 40ms",
      "     → expected 'ok' to be 'nope'",
      "",
      "⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "AssertionError: expected 'ok' to be 'nope'",
      " ❯ traceback_repro.test.ts:18:12",
      "",
      " Test Files  1 failed (1)",
      "      Tests  1 failed (1)",
      "   Duration  1.12s (transform 120ms, setup 0ms, collect 80ms, tests 42ms)",
    ].join("\n");
  }

  return [
    `$ npm test -- traceback_repro.test.ts`,
    "",
    " RUN  v2.1.0 /workspace/repo",
    "",
    " ✓ traceback_repro.test.ts (1 test) 38ms",
    "   ✓ reproduces Sentry exception 36ms",
    "",
    " Test Files  1 passed (1)",
    "      Tests  1 passed (1)",
    "   Duration  980ms (transform 110ms, setup 0ms, collect 75ms, tests 38ms)",
  ].join("\n");
}

function createHandle(ctx: Ctx): MockSandboxHandle {
  return {
    repoUrl: ctx.repoUrl,

    async runShellCommand(command: string) {
      const cmd = command.trim();
      const slug = ctx.repoSlug;
      let kind = "shell";
      let output: string;

      if (/git\s+clone/i.test(cmd) || /^clone\b/i.test(cmd)) {
        kind = "clone";
        output = cloneOutput(ctx.repoUrl, slug);
      } else if (/npm\s+(ci|install)/i.test(cmd)) {
        kind = "npm_install";
        output = npmInstallOutput(slug);
      } else if (/npm\s+test|vitest|jest|pnpm\s+test/.test(cmd)) {
        kind = "repro_test";
        ctx.testRuns += 1;
        output = npmTestOutput(ctx.testRuns);
      } else {
        output = [
          `$ ${cmd}`,
          `(mock) command completed with exit code 0`,
        ].join("\n");
      }

      await persistLog(ctx, output, kind);
      return { output };
    },

    async readFiles(paths: string[]) {
      const lines: string[] = ["$ read_files " + paths.map((p) => JSON.stringify(p)).join(" ")];
      for (const p of paths) {
        const body = ctx.files.get(p);
        if (body === undefined) {
          lines.push(`--- ${p} ---`, "(mock) file not found");
        } else {
          lines.push(`--- ${p} ---`, body);
        }
      }
      const output = lines.join("\n");
      await persistLog(ctx, output, "read_files");
      return { output };
    },

    async writeFile(path: string, content: string) {
      ctx.files.set(path, content);
      const output = [
        `$ write_file ${path}`,
        `wrote ${content.split("\n").length} line(s) (${content.length} bytes)`,
        "(mock) filesystem updated",
      ].join("\n");
      await persistLog(ctx, output, "write_file");
      return { output };
    },
  };
}

/**
 * Pure TypeScript mock sandbox: no child_process, no cloud SDK.
 * Each call returns terminal-style output; when `incidentId` is set, the same text is stored in `execution_logs`.
 */
export function startSandbox(
  repoUrl: string,
  options: MockSandboxOptions = {},
): MockSandboxHandle {
  const ctx: Ctx = {
    repoUrl,
    repoSlug: slugFromUrl(repoUrl),
    files: new Map<string, string>(),
    testRuns: 0,
    options,
  };

  return createHandle(ctx);
}
