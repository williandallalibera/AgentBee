import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateTaskFromCalendarItemCoreParams = {
  workspaceId: string;
  calendarItemId: string;
  /** null quando a ação vem do webhook (Google Chat). */
  requestedByUserId: string | null;
};

export type CreateTaskFromCalendarItemCoreResult =
  | { ok: true; taskId: string; alreadyLinked?: boolean }
  | { error: string };

/**
 * Cria `content_task` a partir de um slot do calendário (paridade com a server action do painel).
 */
export async function createTaskFromCalendarItemCore(
  supabase: Pick<SupabaseClient, "from">,
  params: CreateTaskFromCalendarItemCoreParams,
): Promise<CreateTaskFromCalendarItemCoreResult> {
  const { data: item } = await supabase
    .from("calendar_items")
    .select("id, workspace_id, campaign_id, content_task_id, topic_title, topic")
    .eq("id", params.calendarItemId)
    .maybeSingle();

  if (!item || item.workspace_id !== params.workspaceId) {
    return { error: "Item de calendário não encontrado." };
  }

  if (item.content_task_id) {
    return { ok: true, taskId: item.content_task_id, alreadyLinked: true };
  }

  const title =
    item.topic_title?.trim() || item.topic?.trim() || "Tarefa gerada do calendário";

  const insertPayload: Record<string, unknown> = {
    workspace_id: params.workspaceId,
    campaign_id: item.campaign_id,
    calendar_item_id: item.id,
    title,
    status: "draft",
    current_stage: "briefing",
  };
  if (params.requestedByUserId) {
    insertPayload.requested_by = params.requestedByUserId;
  }

  const { data: task, error: taskError } = await supabase
    .from("content_tasks")
    .insert(insertPayload)
    .select("id")
    .single();

  if (taskError || !task) {
    return { error: taskError?.message ?? "Falha ao criar tarefa." };
  }

  await supabase
    .from("calendar_items")
    .update({
      content_task_id: task.id,
      status: "awaiting_approval",
    })
    .eq("id", item.id);

  return { ok: true, taskId: task.id as string };
}
