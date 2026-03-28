import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engine Room | TraceBack AI",
  description: "Demo incident terminal and approval controls",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-full flex flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold tracking-tight">Engine Room</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          TraceBack AI — demo monitor (polling). Append{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
            ?incident=&lt;uuid&gt;
          </code>{" "}
          to the URL.
        </p>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
