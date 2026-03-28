import { NextResponse } from "next/server";

import { auditDiff } from "@/lib/agents/auditor";
import { runFixLoop } from "@/lib/agents/brain";
import { startSandbox } from "@/lib/services/sandbox-mock";
import {
  appendExecutionLog,
  createSupabaseClient,
  getIncidentById,
  updateIncident,
} from "@/supabase/mutations";

const DEFAULT_DEMO_REPO =
  process.env.DEMO_REPO_URL ?? "https://github.com/demo/traceback-ai";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Demo worker: incident → reproducing → mock sandbox → Claude loop → heuristic audit →
 * persist proposed diff → awaiting_approval. No Slack, E2B, or GitHub.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Expected an object body" },
      { status: 400 },
    );
  }

  const incidentId = (body as { incident_id?: unknown }).incident_id;
  if (typeof incidentId !== "string" || !isUuid(incidentId)) {
    return NextResponse.json(
      { ok: false, error: "incident_id must be a valid UUID string" },
      { status: 400 },
    );
  }

  const client = createSupabaseClient();
  const existing = await getIncidentById(client, incidentId);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Incident not found" },
      { status: 404 },
    );
  }

  try {
    await updateIncident(client, incidentId, { status: "reproducing" });

    const sandbox = startSandbox(DEFAULT_DEMO_REPO, {
      incidentId,
      supabase: client,
    });

    await sandbox.runShellCommand(`git clone ${DEFAULT_DEMO_REPO} .`);
    await sandbox.runShellCommand("npm install");
    await sandbox.runShellCommand("npm test -- traceback_repro.test.ts");

    const fixResult = await runFixLoop(
      {
        id: existing.id,
        status: existing.status,
        external_sentry_id: existing.external_sentry_id,
        payload_summary: existing.payload_summary,
      },
      sandbox,
    );

    const audit = auditDiff(fixResult.suggestedPatch);

    await updateIncident(client, incidentId, {
      display_diff: fixResult.suggestedPatch,
    });

    await appendExecutionLog(client, {
      incident_id: incidentId,
      kind: "audit",
      message: [
        `Heuristic auditor: ${audit.approved ? "APPROVED" : "FLAGGED"}`,
        audit.reason,
      ].join("\n"),
    });

    await updateIncident(client, incidentId, { status: "awaiting_approval" });

    return NextResponse.json(
      {
        ok: true,
        incident_id: incidentId,
        audit,
        fix_loop_rounds: fixResult.rounds,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("worker process:", err);

    try {
      await appendExecutionLog(client, {
        incident_id: incidentId,
        kind: "worker_error",
        message,
      });
    } catch (logErr) {
      console.error("worker process log failed:", logErr);
    }

    try {
      await updateIncident(client, incidentId, { status: "failed" });
    } catch (updateErr) {
      console.error("worker failed status update:", updateErr);
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
