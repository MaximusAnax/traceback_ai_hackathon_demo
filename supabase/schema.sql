-- TraceBack AI — demo schema (apply manually in Supabase SQL editor)
-- Tables: incidents (source of truth), execution_logs (terminal-style feed)

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'investigating',
  external_sentry_id text,
  payload_summary text,
  display_diff text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you created this table before `display_diff` existed, run once in the SQL editor:
-- alter table public.incidents add column if not exists display_diff text;

create index if not exists incidents_external_sentry_id_idx
  on public.incidents (external_sentry_id);

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  message text not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists execution_logs_incident_id_created_at_idx
  on public.execution_logs (incident_id, created_at);
