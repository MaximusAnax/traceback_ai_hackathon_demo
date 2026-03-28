# TraceBack AI — hackathon demo reference

This document describes **what the demo in this repository actually does** at implementation time: behavior, data flow, APIs, and how it differs from the full product described in `PRD.md` and `TDD.md`. Use it when you need a single place to recall demo scope and wiring.

The build checklist for the demo track lives in **`demo_tasks.json`**. Quick install and curl examples are in **`README.md`**.

---

## 1. Purpose and scope

The demo is a **short, judge-friendly vertical slice**: ingest an error-shaped payload, record an **incident**, run a **mock** sandbox that writes **terminal-style logs**, use **Claude** (Anthropic SDK only) in a **capped tool loop**, run a **heuristic** diff audit (no second LLM), and let a human **Approve** or **Retry** from the **Engine Room** UI. **No** Slack, E2B, GitHub API, or OpenAI SDK in this track.

| Full vision (`PRD.md` / `TDD.md`) | This demo |
| --- | --- |
| Real Sentry + real sandbox + PR flow | Mock-friendly ingest + fake sandbox + in-app approval |
| Slack / Discord, GitHub PR | `POST /api/demo/approve` and `/api/demo/retry` |
| Secondary auditor LLM | `lib/agents/auditor.ts` — rules only |
| E2B / Realtime (in TDD) | `lib/services/sandbox-mock.ts`; UI uses HTTP polling |

---

## 2. End-to-end flow

1. **Ingest** — `POST /api/sentry` with JSON (Sentry-like shape is optional; fields are parsed defensively). Creates a row in `incidents` with status `investigating` (see `app/api/sentry/route.ts`).
2. **Process** — `POST /api/worker/process` with `{ "incident_id": "<uuid>" }`. The worker sets status `reproducing`, runs the mock sandbox (canned clone / npm / test output + logs), runs **`runFixLoop`** (Claude with tools mapped to the mock sandbox, max **3** rounds), runs **`auditDiff`** on the suggested patch text, stores the patch in `incidents.display_diff`, appends an audit line to `execution_logs`, then sets status **`awaiting_approval`**. On unhandled errors it logs to `execution_logs`, sets status **`failed`**, and returns 500.
3. **Human gate** — From the dashboard, **Approve** calls `POST /api/demo/approve` (sets **`resolved`**, optionally refreshes `display_diff` from the body). **Retry** calls `POST /api/demo/retry` (sets **`investigating`** for another pass).
4. **UI** — `GET /api/demo/snapshot?incident_id=<uuid>` returns the incident row and ordered `execution_logs`. The Engine Room page polls about every **1.5s** and shows a status stepper plus log terminal plus diff.

---

## 3. Data model (demo)

Defined in **`supabase/schema.sql`** and typed in **`supabase/mutations.ts`**.

**`incidents`**

- `id` (UUID), `status` (text), `external_sentry_id`, `payload_summary`, `display_diff`, `created_at`, `updated_at`.

**`execution_logs`**

- `id`, `incident_id` (FK), `message`, `kind`, `created_at`.

Statuses used in code include: `queued`, `investigating`, `reproducing`, `reproduced`, `fixing`, `awaiting_approval`, `resolved`, `failed` (see `IncidentStatus` in `supabase/mutations.ts`). The dashboard stepper (`app/dashboard/page.tsx`) maps a subset of these to labels (e.g. Ingest → Review → Done).

Apply **`supabase/schema.sql`** in the Supabase SQL editor so tables exist before ingest/worker runs.

---

## 4. HTTP API summary

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/api/sentry` | Parse JSON; optional mock check: header `sentry-hook-signature` must equal `SENTRY_WEBHOOK_SECRET` when that env is set. Insert incident; **200** `{ incident_id }`. |
| `POST` | `/api/worker/process` | Body `{ "incident_id": "<uuid>" }`. Runs sandbox + brain + auditor; **200** `{ ok, incident_id, audit, fix_loop_rounds }`. |
| `GET` | `/api/demo/snapshot` | Query `incident_id` or `incident` (UUID). **200** `{ ok, incident, logs }`. |
| `POST` | `/api/demo/approve` | Body `{ "incident_id", "display_diff"? }`. Sets **`resolved`**. |
| `POST` | `/api/demo/retry` | Body `{ "incident_id" }`. Sets **`investigating`**. |

---

## 5. Environment variables

| Variable | Role in demo |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (required for API routes that touch DB). |
| `SUPABASE_ANON_KEY` | Anon key (required). |
| `ANTHROPIC_API_KEY` | Claude calls in **`lib/agents/brain.ts`** (worker). |
| `ANTHROPIC_MODEL` | Optional override; default `claude-sonnet-4-20250514`. |
| `SENTRY_WEBHOOK_SECRET` | Optional; if set, `sentry-hook-signature` must match exactly. |
| `DEMO_REPO_URL` | Optional; default in worker is `https://github.com/demo/traceback-ai` (used as mock repo URL string). |

Restart **`npm run dev`** after changing `.env` so server routes pick up changes.

---

## 6. Key modules

- **`lib/services/sandbox-mock.ts`** — Fake sandbox: `startSandbox` returns a handle whose `runShellCommand` / `readFiles` / `writeFile` produce **canned** output and optionally **`appendExecutionLog`** for the Engine Room.
- **`lib/agents/brain.ts`** — Anthropic tool loop (`read_files`, `run_shell_command`, `write_file`), max **3** rounds; on API failure uses **`STATIC_FALLBACK_PATCH`** so the demo can still complete.
- **`lib/agents/auditor.ts`** — **`auditDiff(diff)`**: heuristics only (empty diff, large deletions, many `any`-like patterns). No network.

---

## 7. UI (Engine Room)

- **Route:** `/dashboard?incident=<uuid>` (also accepts `incident_id` in query per snapshot usage).
- **Behavior:** Client-side fetch to `/api/demo/snapshot` on an interval (**~1500 ms**); Approve/Retry POST to demo routes as above.

---

## 8. Optional / out of repo demo path

**`full-product/`** holds a CrewAI-oriented workflow and full **`tasks.json`** — not required to run or explain this hackathon demo.

---

## 9. Document map

| File | Use when |
| --- | --- |
| **`README.md`** | Install, run, curl smoke tests |
| **`DEMO.md`** (this file) | Demo behavior and architecture reference |
| **`demo_tasks.json`** | Ordered build tasks |
| **`PRD.md` / `TDD.md`** | Product and technical vision (full scope; may diverge from demo) |
