import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          TraceBack AI
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Hackathon demo: mock Sentry ingest, worker orchestration, Claude brain, heuristic
          audit, and in-browser approval—no Slack or GitHub required.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          Open Engine Room
        </Link>
        <span className="self-center text-sm text-zinc-500">
          Add{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
            ?incident=&lt;uuid&gt;
          </code>{" "}
          after you create an incident.
        </span>
      </div>
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="font-medium text-zinc-800 dark:text-zinc-200">Demo flow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            <code className="font-mono text-xs">POST /api/sentry</code> — create incident
          </li>
          <li>
            <code className="font-mono text-xs">POST /api/worker/process</code> — run pipeline
          </li>
          <li>
            Dashboard → Approve / Retry
          </li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          See <code className="font-mono">README.md</code> and{" "}
          <code className="font-mono">demo_tasks.json</code>.
        </p>
      </section>
    </main>
  );
}
