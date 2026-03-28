import os
import json
from pathlib import Path

from dotenv import load_dotenv
from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools.base_tool import BaseTool
from pydantic import BaseModel, Field

# This file lives in `full-product/`; repository root is one level up (Next.js app, PRD, TDD).
FULL_PRODUCT_DIR = Path(__file__).resolve().parent
REPO_ROOT = FULL_PRODUCT_DIR.parent

# Task JSON lives next to this script (e.g. tasks.json). Override with TASKS_FILE.
TASKS_FILE = os.environ.get("TASKS_FILE", "tasks.json")

# Injected into Tech Lead tasks so generated prompts match optimal Cursor usage (@ context, Agent mode, one step per thread).
CURSOR_PROMPT_RULES = """
The human uses Cursor IDE with an AI assistant. Your deliverable MUST use this structure:

### 1) Human setup (do this before pasting the implementation block)
- Open a **new Agent chat** (or Composer) dedicated to **this step only**.
- Add context with `@`: always `@TDD.md` and `@PRD.md`, plus `@` each path from FILES TO MODIFY (split paths on commas; strip whitespace).
- Do not paste long excerpts from those docs into the chat—the human attaches them with `@`.

### 2) Implementation prompt (this is what they paste into Cursor)
- Clear goal, exact files to touch, explicit non-goals if any, and how to verify (commands from success criteria).
- Reference architecture by file/section name only (e.g. "TDD §5 Folder Structure"), not multi-page quotes.

### 3) After implementation
- They save files, run any checks from success criteria, then return to the terminal running `python full-product/main.py` (repo root) and press ENTER for QA.

Also mention they can read `full-product/WORKFLOW.md` for the same checklist in prose.
"""

def _crew_verbose() -> bool:
    """Full CrewAI traces (tools, chain-of-thought). Off by default to avoid huge repeats."""
    return os.environ.get("CREWAI_VERBOSE", "").strip().lower() in ("1", "true", "yes")


def _print_phase_output(title: str, result) -> None:
    """Print the crew's final answer once (avoids duplicate dumps when verbose is off)."""
    raw = getattr(result, "raw", None) or str(result)
    text = raw.strip() if isinstance(raw, str) else str(raw).strip()
    print("\n" + "─" * 72)
    print(f"  {title}")
    print("─" * 72)
    print(text if text else "(empty)")
    print()


class ReadProjectFileInput(BaseModel):
    file_path: str = Field(
        ...,
        description="Path to the file to read, relative to the project root (e.g. PRD.md).",
    )


class ProjectFileReadTool(BaseTool):
    """Read UTF-8 text files under the repo; paths outside the project are rejected."""

    name: str = "read_file"
    description: str = (
        "Read the full contents of a text file in the project. "
        "Pass file_path relative to the project root."
    )
    args_schema: type[BaseModel] = ReadProjectFileInput
    root_dir: str = Field(..., description="Absolute project root path")

    def _run(self, file_path: str) -> str:
        root = Path(self.root_dir).resolve()
        target = (root / file_path).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            return f"Error: access denied (path outside project): {file_path}"
        if not target.is_file():
            return f"Error: not a file or missing: {file_path}"
        try:
            return target.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return f"Error: file is not valid UTF-8 text: {file_path}"
        except OSError as e:
            return f"Error: {e}"

# --------------------------------------------------------
# 0. Setup & Brain Initialization
# --------------------------------------------------------
load_dotenv(REPO_ROOT / ".env")
load_dotenv()

# Claude 3.5 snapshots (e.g. …20241022) can 404 once retired; use a current Sonnet ID.
claude_llm = LLM(
    model="anthropic/claude-sonnet-4-5",
    temperature=0.1,
    api_key=os.environ.get("ANTHROPIC_API_KEY"),
)

# This tool allows the agents to physically read your project files
file_read_tool = ProjectFileReadTool(root_dir=str(REPO_ROOT))

# --------------------------------------------------------
# 1. Agent Definitions (The "Brain Trust")
# --------------------------------------------------------

cto = Agent(
    role='CTO & Product Mastermind',
    goal='Ensure 100% alignment with the PRD and manage the project lifecycle.',
    backstory="""You are the ultimate authority on the 'Why' and 'What'. 
    You must constantly reference the PRD.md to ensure the team never drifts from 
    the MVP. You oversee the Tech Lead and approve high-level architectural 
    decisions. If a feature isn't in the PRD, you veto it.""",
    tools=[file_read_tool],
    allow_delegation=False,
    verbose=_crew_verbose(),
    llm=claude_llm
)

tech_lead = Agent(
    role='Lead Systems Architect',
    goal='Translate the TDD into strict, copy-pasteable prompts for the Human-Cursor developer.',
    backstory="""You are the master of 'How'. You own the TDD.md.
    You write prompts the human pastes into Cursor's Agent (or Composer) with @TDD.md @PRD.md @target files attached.
    Every deliverable MUST follow the three-part structure: (1) Human setup with @ mentions, (2) Implementation prompt, (3) After implementation.
    Be concise: do not paste large blocks from PRD.md or TDD.md—cite paths and section names only.""",
    tools=[file_read_tool],
    allow_delegation=False,
    verbose=_crew_verbose(),
    llm=claude_llm
)

qa_reviewer = Agent(
    role='Senior QA & Auditor',
    goal='Verify code perfection and enforce Success Criteria after the human executes.',
    backstory="""You are a cynical perfectionist. You audit the files that the human 
    just modified using Cursor. You reference the TDD.md and the task's Success Criteria. 
    If the code has bugs, misses the spec, or lacks documentation, you REJECT it and 
    output exactly what the human needs to tell Cursor to fix it. Nothing passes without 
    your explicit approval.
    Be concise: never paste entire files or duplicate their contents in your reply—use Pass/Fail, bullet findings, and at most two short excerpts (under 15 lines each) as evidence.""",
    tools=[file_read_tool],
    allow_delegation=False,
    verbose=_crew_verbose(),
    llm=claude_llm
)

# --------------------------------------------------------
# 2. Execution engine (localized crews + hard pause per step)
# --------------------------------------------------------

_tasks_path = (FULL_PRODUCT_DIR / TASKS_FILE).resolve()
if not _tasks_path.is_file():
    raise FileNotFoundError(
        f"Task file not found: {_tasks_path}. Set TASKS_FILE or add {TASKS_FILE}."
    )
with open(_tasks_path, "r", encoding="utf-8") as file:
    execution_plan = json.load(file)

if __name__ == "__main__":
    print("## Starting the Cursor-Integrated Agentic Build Loop...")
    print(f"## Task list: {TASKS_FILE}  |  {len(execution_plan)} step(s)")
    if not _crew_verbose():
        print(
            "## Quiet mode: only final outputs print below. "
            "Set CREWAI_VERBOSE=1 for full CrewAI traces.\n"
        )
    else:
        print()

    last_qa_result = None
    for step_index, step in enumerate(execution_plan, start=1):
        task_name = step['task_name']
        print("\n" + "=" * 72)
        print(f"  STEP {step_index} / {len(execution_plan)}  —  {task_name}")
        print("=" * 72 + "\n")

        prep_task = Task(
            description=f"""
        TASK TO PREPARE: {step['task_name']}
        PREREQUISITES: {step['prerequisites']}
        FILES TO MODIFY: {step['files_to_modify']}
        INTENDED LOGIC: {step['developer_prompt']}

        {CURSOR_PROMPT_RULES}

        Write the deliverable for the human so they can follow it in Cursor. Success criteria for later QA:
        {step['success_criteria']}
        """,
            expected_output="A clean, highly specific prompt meant to be pasted into Cursor.",
            agent=tech_lead,
        )

        print("— Tech Lead: generating Cursor prompt —\n")
        prep_out = Crew(
            agents=[tech_lead], tasks=[prep_task], verbose=_crew_verbose()
        ).kickoff()
        _print_phase_output("CURSOR PROMPT (Tech Lead)", prep_out)

        print("\n" + "-" * 72)
        print("  HUMAN WORK BLOCK — your actions (details: full-product/WORKFLOW.md)")
        print("-" * 72)
        print("  1. New Agent chat (or Composer) for THIS step only.")
        print("  2. Attach context: @TDD.md  @PRD.md  @<each file from FILES TO MODIFY above>")
        print("  3. Paste the Tech Lead \"Implementation\" section; save; run checks from success criteria.")
        print("  4. Come back here and press ENTER below for automated QA.")
        print("-" * 72)
        input("\nPress ENTER when ready for QA Audit...")

        qa_task = Task(
            description=f"""
        The human has just used Cursor to implement '{step['task_name']}'.
        Use your file reading tool to inspect these specific files: {step['files_to_modify']}.

        Check them strictly against these success criteria:
        {step['success_criteria']}

        Output a compact audit: verdict (PASS or FAIL), bullet list of checks, and if FAIL the exact
        follow-up prompt for Cursor. Do not paste entire file contents in your answer—at most two short excerpts.
        """,
            expected_output="A Pass/Fail audit report. If Fail, provide the exact prompt the human should feed back into Cursor to fix it.",
            agent=qa_reviewer,
        )

        print("\n— QA Reviewer: auditing files —\n")
        last_qa_result = Crew(
            agents=[qa_reviewer], tasks=[qa_task], verbose=_crew_verbose()
        ).kickoff()
        _print_phase_output("QA AUDIT", last_qa_result)

    print("\n\n########################")
    print("## BUILD LOOP COMPLETE ##")
    print("########################")
    if last_qa_result is not None:
        print("Last QA verdict is in the 'QA AUDIT' section above.\n")