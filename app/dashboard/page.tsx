"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { Database } from "@/supabase/mutations";

type SnapshotIncident = Database["public"]["Tables"]["incidents"]["Row"];

type LogRow = {
  id: string;
  message: string;
  kind: string;
  created_at: string;
};

const POLL_MS = 1500;

const FLOW: { status: string; label: string }[] = [
  { status: "queued", label: "Queued" },
  { status: "investigating", label: "Ingest" },
  { status: "reproducing", label: "Reproduce" },
  { status: "reproduced", label: "Captured" },
  { status: "fixing", label: "Fix" },
  { status: "awaiting_approval", label: "Review" },
  { status: "resolved", label: "Done" },
];

function rank(status: string): number {
  const i = FLOW.findIndex((s) => s.status === status);
  return i === -1 ? -1 : i;
}

function EngineRoomContent() {
  const searchParams = useSearchParams();
  const incidentId =
    searchParams.get("incident") ?? searchParams.get("incident_id");

  const [incident, setIncident] = useState<SnapshotIncident | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    const res = await fetch(
      `/api/demo/snapshot?incident_id=${encodeURIComponent(incidentId)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as {
      ok: boolean;
      incident: SnapshotIncident | null;
      logs: LogRow[];
      error?: string;
    };
    if (!data.ok || !res.ok) {
      setError(data.error ?? "Snapshot failed");
      return;
    }
    if (!data.incident) {
      setError("Incident not found for this id.");
      setIncident(null);
      setLogs([]);
      return;
    }
    setError(null);
    setIncident(data.incident);
    setLogs(data.logs ?? []);
  }, [incidentId]);

  useEffect(() => {
    if (!incidentId) {
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [incidentId, load]);

  const onApprove = async () => {
    if (!incidentId) {
      return;
    }
    setBusy("approve");
    try {
      const res = await fetch("/api/demo/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_id: incidentId,
          display_diff: incident?.display_diff ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Approve failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onRetry = async () => {
    if (!incidentId) {
      return;
    }
    setBusy("retry");
    try {
      const res = await fetch("/api/demo/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Retry failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!incidentId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
          Open this page with{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
            ?incident=&lt;incident-uuid&gt;
          </code>{" "}
          after creating an incident (e.g. via{" "}
          <code className="font-mono text-sm">POST /api/sentry</code>).
        </p>
      </div>
    );
  }

  const status = incident?.status ?? "…";
  const currentRank = rank(status);
  const failed = status === "failed";

  return (
    <div className="grid flex-1 gap-4 p-4 lg:grid-cols-2 lg:gap-6 lg:p-6">
      <section className="flex min-h-[320px] flex-col rounded-xl border border-zinc-200 bg-zinc-950 shadow-sm dark:border-zinc-800">
        <div className="border-b border-zinc-800 px-4 py-2 font-mono text-xs text-zinc-500">
          execution_logs —{" "}
          <span className="text-emerald-500/90">polling {POLL_MS}ms</span>
        </div>
        <pre className="max-h-[min(70vh,560px)] flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-emerald-400 selection:bg-emerald-900">
          {logs.length === 0 ? (
            <span className="text-zinc-600">No logs yet…</span>
          ) : (
            logs.map((row) => (
              <div key={row.id} className="mb-3 whitespace-pre-wrap break-words">
                <span className="text-zinc-500">
                  [{row.kind}] {new Date(row.created_at).toLocaleTimeString()}
                </span>
                {"\n"}
                {row.message}
              </div>
            ))
          )}
        </pre>
      </section>

      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Status
          </h2>
          {failed && (
            <p className="mb-4 rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
              Incident marked <strong>failed</strong>. Use Retry after fixing the
              worker or data.
            </p>
          )}
          {error && (
            <p className="mb-4 rounded-lg bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
              {error}
            </p>
          )}
          <ol className="flex flex-wrap gap-2">
            {FLOW.map((step, idx) => {
              const done = currentRank > idx;
              const active = currentRank === idx;
              return (
                <li
                  key={step.status}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    active
                      ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                      : done
                        ? "border-zinc-600 bg-zinc-800/60 text-zinc-300"
                        : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  <span
                    className={
                      done
                        ? "text-emerald-500"
                        : active
                          ? "text-emerald-400"
                          : "text-zinc-600"
                    }
                  >
                    {done ? "✓" : active ? "●" : "○"}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 font-mono text-xs text-zinc-500">
            current: <span className="text-zinc-200">{status}</span>
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Proposed diff
          </h2>
          <pre className="max-h-64 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-200">
            {incident?.display_diff?.trim()
              ? incident.display_diff
              : "(no diff stored — run POST /api/worker/process)"}
          </pre>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void onApprove()}
            disabled={!!busy || !incident}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => void onRetry()}
            disabled={!!busy || !incident}
            className="rounded-lg border border-zinc-600 bg-transparent px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "retry" ? "Retrying…" : "Retry"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EngineRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12 text-zinc-500">
          Loading…
        </div>
      }
    >
      <EngineRoomContent />
    </Suspense>
  );
}
