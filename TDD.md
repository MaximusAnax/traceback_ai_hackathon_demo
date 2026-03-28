## 1. System Architecture & High-Level Data Flow

The system operates as an **Event-Driven State Machine**. We avoid complex long-polling by using Supabase Realtime to bridge the gap between the headless backend and the "Engine Room" demo UI.

1. **Ingestion:** Sentry Webhook $\rightarrow$ Next.js API $\rightarrow$ Supabase `incidents` table.
2. **Orchestration:** Supabase Edge Function triggers **Claude 4.6 Sonnet**.
3. **Sandbox:** Claude uses **E2B SDK** to:
    - Clone Repo.
    - Inject Mocks.
    - Run `traceback_repro.test.ts`.
    - Iterate on source code.
4. **Verification:** **GPT-5.4 Mini** (Auditor) reviews the final `git diff`.
5. **Collaboration:** Slack Bolt SDK posts to a thread; waits for "Approve" via `interactions` table.
6. **Resolution:** GitHub API pushes a branch and opens a PR.

---

## 2. Data Schema (Supabase/PostgreSQL)

We keep it flat and lean. This is the absolute minimum to support the MVP.

SQL

# 

- `- Core Table: Incidents (The "Source of Truth")CREATE TABLE incidents ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), external_sentry_id TEXT UNIQUE, status TEXT DEFAULT 'investigating', - 'investigating', 'reproduced', 'fixing', 'awaiting_approval', 'resolved', 'failed' stack_trace JSONB, context_metadata JSONB, - File paths, line numbers, repo name slack_thread_ts TEXT, - To keep the conversation in one place github_pr_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
- Table: Execution_Logs (For the "Engine Room" Terminal Demo)CREATE TABLE execution_logs ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), incident_id UUID REFERENCES incidents(id), step_name TEXT, - 'npm_install', 'repro_test', 'llm_fix' content TEXT, - Raw stdout or LLM reasoning is_error BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
- Table: Attempts (Tracking the Fix Loop)CREATE TABLE fix_attempts ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), incident_id UUID REFERENCES incidents(id), diff_content TEXT, test_output TEXT, attempt_number INT, was_successful BOOLEAN DEFAULT FALSE
);`

---

## 3. The "Agentic Loop" (Claude 4.6 + E2B)

Claude 4.6 Sonnet will be initialized with a **System Prompt** that defines it as a Senior Staff Engineer. It will have access to three primary tools via the E2B Sandbox:

- **`read_files(paths: string[])`**: To grab the buggy file and its dependencies.
- **`run_shell_command(command: string)`**: To run `npm test`, `tsc`, or `eslint`.
- **`write_file(path: string, content: string)`**: To create the repro test and apply the fix.

### The Repro Protocol

To avoid environment variable hell, the agent **must** wrap the reproduction in a test file that mocks external services:

1. Read the stack trace variables from the Sentry payload.
2. Generate a Vitest/Jest file that manually sets those variables in a `beforeEach` block.
3. Assert the exact failure seen in Sentry.

---

## 4. Component Roadmap

### A. Backend (Next.js + Edge Functions)

| **Endpoint** | **Method** | **Responsibility** |
| --- | --- | --- |
| `/api/webhooks/sentry` | POST | Verify signature, parse exception, insert to `incidents`. |
| `/api/webhooks/slack` | POST | Handle "Approve/Retry" actions; update Supabase. |
| `/api/worker/process` | POST | The main loop (E2B session management + Claude). |

### B. The "Engine Room" (Frontend - Next.js)

A single-page dashboard for the demo judges.

- **Left Side:** Real-time feed of `execution_logs` (the terminal feel).
- **Right Side:** A visual "Step Progress" bar (Sentry $\rightarrow$ Repro $\rightarrow$ Fix $\rightarrow$ Audit $\rightarrow$ PR).

---

## 5. Folder Structure

This structure ensures that the "Agent Logic" is decoupled from the "Infrastructure Logic."

Plaintext

# 

`/traceback-ai
├── /app
│   ├── /api
│   │   ├── /sentry      # Webhook ingestion
│   │   └── /slack       # Interaction handlers
│   └── /dashboard       # The "Engine Room" UI
├── /lib
│   ├── /agents
│   │   ├── brain.ts     # Claude 4.6 Sonnet Logic
│   │   └── auditor.ts   # GPT-5.4 Mini Gatekeeper
│   ├── /services
│   │   ├── e2b.ts       # Sandbox orchestration
│   │   ├── github.ts    # PR creation logic
│   │   └── slack.ts     # Message formatting
│   └── /utils
│       └── context.ts   # File-tree & dependency mapper
├── /supabase
│   └── mutations.ts     # Direct DB interactions
└── /tests
    └── mocks/           # Static templates for the LLM to use`

---

## 6. Execution "Mic Drop" Strategy (The PR)

When the Auditor (GPT-5.4 Mini) approves the fix:

1. **Branch Name:** `fix/traceback-[sentry-id]`
2. **Commit Message:** `fix: resolve [Error Name] via TraceBack AI`
3. **PR Body:** A generated summary including:
    - **The "Why":** Explanation of the root cause.
    - **The "How":** Description of the fix logic.
    - **Verification:** A screenshot or log snippet of the passing `traceback_repro.test.ts`.

---

## 7. Immediate Next Steps

To hit that 45-second MTTR target, we need to pre-build the E2B image immediately.