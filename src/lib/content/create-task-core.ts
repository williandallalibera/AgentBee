import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateContentTaskCoreParams = {
  workspaceId: string;
  title: string;
  campaignId?: string | null;
  requestedByUserId: string | null;
};

export type CreateContentTaskCoreResult =
  | { ok: true; taskId: string }
  | { error: string };

export async function createContentTaskCore(
  supabase: Pick<SupabaseClient, "from">,
  params: CreateContentTaskCoreParams,
): Promise<CreateContentTaskCoreResult> {
  const title = params.title.trim();
  if (!title) {
    return { error: "Título obrigatório" };
  }

  const insertPayload: Record<string, unknown> = {
    workspace_id: params.workspaceId,
    title,
    campaign_id: params.campaignId ?? null,
    status: "draft",
    current_stage: "briefing",
  };
  if (params.requestedByUserId) {
    insertPayload.requested_by = params.requestedByUserId;
  }

  const { data, error } = await supabase
    .from("content_tasks")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { ok: true, taskId: data.id as string };
}
