import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Matches `incidents.status` values used in the demo flow. */
export type IncidentStatus =
  | "queued"
  | "investigating"
  | "reproducing"
  | "reproduced"
  | "fixing"
  | "awaiting_approval"
  | "resolved"
  | "failed";

export type Database = {
  public: {
    Tables: {
      incidents: {
        Row: {
          id: string;
          status: string;
          external_sentry_id: string | null;
          payload_summary: string | null;
          display_diff: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          status?: IncidentStatus | string;
          external_sentry_id?: string | null;
          payload_summary?: string | null;
          display_diff?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          status?: IncidentStatus | string;
          external_sentry_id?: string | null;
          payload_summary?: string | null;
          display_diff?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      execution_logs: {
        Row: {
          id: string;
          incident_id: string;
          message: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          incident_id: string;
          message: string;
          kind: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          incident_id?: string;
          message?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "execution_logs_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "incidents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type IncidentInsert = Database["public"]["Tables"]["incidents"]["Insert"];
export type ExecutionLogInsert =
  Database["public"]["Tables"]["execution_logs"]["Insert"];

function requireEnv(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY"): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

/** Typed browser/server client (uses anon key from env). */
export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
  );
}

export async function getIncidentById(
  client: SupabaseClient<Database>,
  incidentId: string,
): Promise<Database["public"]["Tables"]["incidents"]["Row"] | null> {
  const { data, error } = await client
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function insertIncident(
  client: SupabaseClient<Database>,
  row: IncidentInsert,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("incidents")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw error;
  }
  return data;
}

export type IncidentUpdate = Database["public"]["Tables"]["incidents"]["Update"];

export async function updateIncident(
  client: SupabaseClient<Database>,
  incidentId: string,
  patch: IncidentUpdate,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("incidents")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incidentId)
    .select("id")
    .single();

  if (error) {
    throw error;
  }
  return data;
}

export async function updateIncidentStatus(
  client: SupabaseClient<Database>,
  incidentId: string,
  status: IncidentStatus,
): Promise<{ id: string }> {
  return updateIncident(client, incidentId, { status });
}

export async function appendExecutionLog(
  client: SupabaseClient<Database>,
  log: ExecutionLogInsert,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from("execution_logs")
    .insert(log)
    .select("id")
    .single();

  if (error) {
    throw error;
  }
  return data;
}
