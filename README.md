# TraceBack AI — hackathon demo

An AI-assisted debugging flow for the hackathon: ingest an error payload, run a **mock** sandbox with terminal-style logs, use **Claude** (Anthropic) as the fix brain, apply a **heuristic** diff audit (no second LLM), and drive **Approve / Retry** from the **Engine Room** dashboard—no Slack, E2B SDK, GitHub API, or OpenAI SDK required for this track.

**Product vision** (full stack: Sentry → E2B → dual LLM → Slack → GitHub PR) is documented in **`PRD.md`** and **`TDD.md`** at the repo root. This README describes the **3-hour demo** aligned with **`demo_tasks.json`**.

## Quick start (demo)

### Prerequisites

- Node.js 18+ and npm
- Supabase project (URL + anon key)
- Anthropic API key (Claude)

### Install & env

```bash
npm install
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `ANTHROPIC_API_KEY` | Yes | Claude “brain” in worker |
| `SENTRY_WEBHOOK_SECRET` | No | Optional mock Sentry signature |
| `DEMO_REPO_URL` | No | Mock clone URL for worker (default in code) |

Apply **`supabase/schema.sql`** in the Supabase SQL editor (see `demo_tasks.json` task 2). If you added `display_diff` later, run the `ALTER TABLE` note in that file once.

### Run

```bash
npm run dev
```

- App: **http://localhost:3000**
- Ingest: `POST /api/sentry`
- Worker: `POST /api/worker/process` with `{ "incident_id": "<uuid>" }`
- **Engine Room:** **http://localhost:3000/dashboard?incident=<uuid>**

### Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Demo architecture

1. **Ingest:** `POST /api/sentry` → `incidents`
2. **Worker:** `POST /api/worker/process` → mock sandbox logs → Claude loop → heuristic audit → `awaiting_approval`
3. **Human gate:** `POST /api/demo/approve` / `POST /api/demo/retry`
4. **UI:** Polling snapshot at `GET /api/demo/snapshot?incident_id=…`

## Repo layout (demo)

```
traceback_ai/
├── PRD.md                 # Product spec (root — shared)
├── TDD.md                 # Architecture (root — shared)
├── demo_tasks.json        # Demo build checklist
├── app/                   # Next.js App Router
├── lib/                   # brain, auditor, sandbox-mock
├── supabase/              # schema.sql, mutations.ts
├── full-product/          # Optional: CrewAI + full tasks.json (see below)
└── package.json
```

## Full-product / CrewAI orchestrator (optional)

The **ideal-scope** Cursor + CrewAI loop (`main.py`, full `tasks.json`, Python deps) lives under **`full-product/`**. Use it only if you are driving the long-form build plan—not required to run the demo.

See **`full-product/README.md`** and **`full-product/WORKFLOW.md`**.

## Contributing

1. Fork and clone.
2. Branch: `git checkout -b feature/your-change`.
3. Focused commits; PR with a short description.

## License

MIT
