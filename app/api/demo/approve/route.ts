import { NextResponse } from "next/server";

import {
  createSupabaseClient,
  type IncidentUpdate,
  updateIncident,
} from "@/supabase/mutations";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

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

  const patch: IncidentUpdate = {
    status: "resolved",
  };

  if ("display_diff" in (body as object)) {
    const raw = (body as { display_diff?: unknown }).display_diff;
    if (raw === null) {
      patch.display_diff = null;
    } else if (typeof raw === "string") {
      patch.display_diff = raw;
    } else {
      return NextResponse.json(
        { ok: false, error: "display_diff must be a string or null" },
        { status: 400 },
      );
    }
  }

  try {
    const client = createSupabaseClient();
    await updateIncident(client, incidentId, patch);
    return NextResponse.json({ ok: true, incident_id: incidentId }, { status: 200 });
  } catch (err) {
    console.error("demo approve:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update incident" },
      { status: 500 },
    );
  }
}
