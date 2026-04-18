import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AGENTS } from "@/lib/agents/defaults";

export async function ensureWorkspaceAgents(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data: existing } = await supabase
    .from("agents")
    .select("role")
    .eq("workspace_id", workspaceId);
  const have = new Set((existing ?? []).map((r: { role: string }) => r.role));
  const rows = DEFAULT_AGENTS.filter((a) => !have.has(a.role)).map((a) => ({
    workspace_id: workspaceId,
    name: a.name,
    role: a.role,
    department: a.department,
    autonomy_level: a.autonomy_level,
    instructions_markdown: a.instructions_markdown,
  }));
  if (rows.length === 0) return;
  await supabase.from("agents").insert(rows);
}

export async function getAgentIdByRole(
  supabase: SupabaseClient,
  workspaceId: string,
  role: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("role", role)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
