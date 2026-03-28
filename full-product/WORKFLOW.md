# Agentic build loop — human steps

This folder’s build pipeline is: **`python full-product/main.py`** (from repo root) → Tech Lead prompt → **you implement in Cursor** → press ENTER → QA audit. Repeat per task.

## Before you start

1. Copy `.env.example` to `.env` at the **repository root** and set `ANTHROPIC_API_KEY` for CrewAI.
2. Install Python deps: `./venv/bin/pip install -r full-product/requirements.txt` (venv at repo root).
3. Task list: by default `main.py` loads **`full-product/tasks.json`**. Override with `TASKS_FILE=my-tasks.json` (file name relative to `full-product/`).

## Each task step (repeat)

### A. Run the orchestrator

1. In a terminal at the **repository root**, run:

   ```bash
   ./venv/bin/python full-product/main.py
   ```

   Or:

   ```bash
   ./full-product/run.sh
   ```

2. Wait for **CURSOR PROMPT (Tech Lead)**. That block is what you will feed to Cursor.

### B. Your actions in Cursor (required)

1. **Open a new Agent chat** (recommended) or Composer **for this step only**—do not mix multiple task steps in one thread.
2. **Attach context with `@`**:
   - `@TDD.md`
   - `@PRD.md`
   - Each path listed under “FILES TO MODIFY” for this step (e.g. `@README.md`, `@app/api/...`).
3. Paste the **implementation** portion of the Tech Lead output (or the full prompt if it is already concise).
4. Let the agent apply edits; **save all files**.
5. Run any checks named in that step’s **success criteria** (e.g. `npm run dev`, `tsc --noEmit`) and fix obvious failures before QA.

### C. Return to the terminal (required)

1. Focus the terminal where `main.py` is waiting.
2. **Press ENTER** when files are saved and you are ready for automated QA.

### D. After QA

- Read **QA AUDIT**. If **FAIL**, open Cursor with `@` the same files plus `@TDD.md`, paste the **follow-up prompt** from the audit, fix, save, then run **`./venv/bin/python full-product/main.py` again** for that step—or continue if your process allows re-auditing only (today the script moves forward; for a strict re-run, restart the script or add a note in your runbook).

## Optional: verbose CrewAI traces

```bash
CREWAI_VERBOSE=1 ./venv/bin/python full-product/main.py
```

## Where this is encoded

- **Cursor behavior** (always-on hints for the IDE assistant): `.cursor/rules/traceback-agentic-workflow.mdc`
- **Orchestrator** (prompt shape and pauses): `full-product/main.py`
