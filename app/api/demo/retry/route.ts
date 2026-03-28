import { NextResponse } from "next/server";

import {
  createSupabaseClient,
  updateIncident,
} from "@/supabase/mutations";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Demo retry: put the incident back in the queue for another agent pass. */
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

  try {
    const client = createSupabaseClient();
    await updateIncident(client, incidentId, { status: "investigating" });
    return NextResponse.json({ ok: true, incident_id: incidentId }, { status: 200 });
  } catch (err) {
    console.error("demo retry:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update incident" },
      { status: 500 },
    );
  }
}
