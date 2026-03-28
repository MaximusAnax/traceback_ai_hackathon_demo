/**
 * Lightweight diff gate for the hackathon demo — pure heuristics, no network.
 * Replace this module with an LLM-backed reviewer later without changing call sites.
 */

export type AuditResult = {
  approved: boolean;
  reason: string;
};

/** Tunable thresholds — isolate here for a future LLM swap. */
const MAX_DELETION_LINES = 250;
const MIN_LINES_FOR_RATIO_CHECK = 40;
/** Flag if removed lines dwarf additions (possible mass delete / nuked file). */
const DELETION_TO_ADDITION_RATIO = 10;

const MAX_ANY_PATTERNS = 4;

const ANY_PATTERN =
  /:\s*any\b|\bas\s+any\b|<\s*any\s*>|\bArray\s*<\s*any\s*>|\bReadonlyArray\s*<\s*any\s*>/gi;

function trimDiff(diff: string): string {
  return diff.trim();
}

function isEffectivelyEmpty(diff: string): boolean {
  return trimDiff(diff).length === 0;
}

/** Count `+` / `-` lines in unified-diff style hunks (ignores `---` / `+++` file headers). */
function countHunkLineChanges(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (/^---\s/.test(line) || /^\+\+\+\s/.test(line)) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
    } else if (line.startsWith("-")) {
      removed += 1;
    }
  }

  return { added, removed };
}

function countSuspiciousAnyInDiff(diff: string): number {
  const matches = diff.match(ANY_PATTERN);
  return matches?.length ?? 0;
}

function hasSuspiciousDeletions(diff: string): boolean {
  const { added, removed } = countHunkLineChanges(diff);
  if (removed > MAX_DELETION_LINES) {
    return true;
  }
  if (removed < MIN_LINES_FOR_RATIO_CHECK) {
    return false;
  }
  const baseline = Math.max(added, 1);
  return removed / baseline >= DELETION_TO_ADDITION_RATIO;
}

/**
 * Heuristic audit of a proposed patch. Suitable to swap for an LLM auditor later.
 */
export function auditDiff(diff: string): AuditResult {
  if (isEffectivelyEmpty(diff)) {
    return { approved: false, reason: "Diff is empty." };
  }

  if (hasSuspiciousDeletions(diff)) {
    return {
      approved: false,
      reason:
        "Suspicious volume of deletions relative to additions (possible mass delete or file wipe).",
    };
  }

  const anyCount = countSuspiciousAnyInDiff(diff);
  if (anyCount > MAX_ANY_PATTERNS) {
    return {
      approved: false,
      reason: `Too many \`any\`-style typings in the diff (${anyCount} matches; max ${MAX_ANY_PATTERNS}).`,
    };
  }

  return {
    approved: true,
    reason: "Heuristic checks passed (non-empty diff, bounded deletions, few `any` patterns).",
  };
}
