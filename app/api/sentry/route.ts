import { NextResponse } from "next/server";

import { createSupabaseClient, insertIncident } from "@/supabase/mutations";

const SUMMARY_MAX_LEN = 12_000;

/** Literal header compare when `SENTRY_WEBHOOK_SECRET` is set — not real HMAC. */
function verifyMockSentrySignature(request: Request): boolean {
  const secret = process.env.SENTRY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return true;
  }
  const sig = request.headers.get("sentry-hook-signature");
  return sig === secret;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pickString(v: unknown): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return null;
}

/** Best-effort extraction of Sentry / issue identifiers from varied webhook shapes. */
function extractExternalSentryId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const direct = pickString(body.issue_id) ?? pickString(body.issueId);
  if (direct) {
    return direct;
  }

  const data = body.data;
  if (!isRecord(data)) {
    return null;
  }

  const issue = data.issue;
  if (isRecord(issue)) {
    const fromIssue =
      pickString(issue.id) ??
      pickString(issue.short_id) ??
      pickString(issue.shortId);
    if (fromIssue) {
      return fromIssue;
    }
  }

  const event = data.event;
  if (isRecord(event)) {
    const fromEvent = pickString(event.issue_id) ?? pickString(event.issueId);
    if (fromEvent) {
      return fromEvent;
    }
  }

  return null;
}

/** Concatenate stack / context snippets from optional nested fields. */
function extractStackContextSummary(body: unknown): string {
  const parts: string[] = [];

  const push = (s: string | null | undefined) => {
    const t = s?.trim();
    if (t) {
      parts.push(t);
    }
  };

  if (!isRecord(body)) {
    return "";
  }

  push(pickString(body.message) ?? undefined);

  const data = body.data;
  if (!isRecord(data)) {
    return joinParts(parts);
  }

  const event = data.event;
  if (isRecord(event)) {
    push(pickString(event.message) ?? undefined);
    push(pickString(event.title) ?? undefined);

    const exc = event.exception;
    if (isRecord(exc)) {
      const values = exc.values;
      if (Array.isArray(values)) {
        for (const entry of values) {
          if (!isRecord(entry)) {
            continue;
          }
          push(pickString(entry.type) ?? undefined);
          push(pickString(entry.value) ?? undefined);
          const st = entry.stacktrace;
          if (isRecord(st)) {
            const frames = st.frames;
            if (Array.isArray(frames)) {
              for (const fr of frames.slice(-20)) {
                if (!isRecord(fr)) {
                  continue;
                }
                const line = [pickString(fr.filename), pickString(fr.function), pickString(fr.lineno)]
                  .filter(Boolean)
                  .join(":");
                push(line || undefined);
              }
            }
          }
        }
      }
    }
  }

  return joinParts(parts);
}

function joinParts(parts: string[]): string {
  const text = parts.join("\n").trim();
  if (text.length <= SUMMARY_MAX_LEN) {
    return text;
  }
  return `${text.slice(0, SUMMARY_MAX_LEN)}…`;
}

export async function POST(request: Request) {
  if (!verifyMockSentrySignature(request)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const externalSentryId = extractExternalSentryId(body);
  const summary = extractStackContextSummary(body);

  try {
    const client = createSupabaseClient();
    const { id } = await insertIncident(client, {
      status: "investigating",
      external_sentry_id: externalSentryId,
      payload_summary: summary.length > 0 ? summary : null,
    });
    return NextResponse.json({ incident_id: id }, { status: 200 });
  } catch (err) {
    console.error("sentry ingest:", err);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
