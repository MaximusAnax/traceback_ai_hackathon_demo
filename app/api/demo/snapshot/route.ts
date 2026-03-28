import { NextResponse } from "next/server";

import { createSupabaseClient } from "@/supabase/mutations";
import type { Database } from "@/supabase/mutations";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type SnapshotLog = Pick<
  Database["public"]["Tables"]["execution_logs"]["Row"],
  "id" | "message" | "kind" | "created_at"
>;

export type SnapshotIncident = Database["public"]["Tables"]["incidents"]["Row"];

/**
 * Polling endpoint: incident row + execution_logs (oldest first) for the Engine Room UI.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const incidentId =
    searchParams.get("incident_id") ?? searchParams.get("incident");

  if (!incidentId || !isUuid(incidentId)) {
    return NextResponse.json(
      { ok: false, error: "incident_id query must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    const client = createSupabaseClient();

    const { data: incident, error: incErr } = await client
      .from("incidents")
      .select("*")
      .eq("id", incidentId)
      .maybeSingle();

    if (incErr) {
      throw incErr;
    }

    const { data: logs, error: logErr } = await client
      .from("execution_logs")
      .select("id, message, kind, created_at")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: true });

    if (logErr) {
      throw logErr;
    }

    return NextResponse.json({
      ok: true,
      incident: incident ?? null,
      logs: logs ?? [],
    });
  } catch (err) {
    console.error("demo snapshot:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, incident: null, logs: [] },
      { status: 500 },
    );
  }
}
