# Full-product scope (CrewAI + ideal build plan)

This folder holds the **original agentic build loop** for the *ideal* TraceBack AI implementation (full task graph in `tasks.json`, CrewAI orchestration, Tech Lead / QA prompts). It is **optional** for the hackathon **demo** track, which lives at the repository root (Next.js app, `demo_tasks.json`).

## Contents

| File | Purpose |
|------|---------|
| `main.py` | CrewAI: Tech Lead → human implements in Cursor → QA audit per step |
| `tasks.json` | Full multi-step build plan (not the demo checklist) |
| `requirements.txt` | Python dependencies for CrewAI |
| `WORKFLOW.md` | Human-facing steps for the loop |
| `run.sh` | Runs `main.py` using `./venv` at the **repo root** |

## Setup

1. From the **repository root**, create a Python virtualenv (once):

   ```bash
   python3 -m venv venv
   ./venv/bin/pip install -r full-product/requirements.txt
   ```

2. Copy `.env.example` to `.env` at the repo root and set `ANTHROPIC_API_KEY` (used by CrewAI).

## Run

From the repository root:

```bash
./full-product/run.sh
```

Or:

```bash
./venv/bin/python full-product/main.py
```

Optional: `TASKS_FILE=demo_tasks.json` only works if you copy or symlink that file into `full-product/` or point `TASKS_FILE` at a path; by default `tasks.json` beside `main.py` is used.

## Product specs

`PRD.md` and `TDD.md` stay at the **repository root** and are shared by both the demo app and this orchestrator.
