"use server";

import { requireWorkspaceMember } from "@/lib/auth/session";
import { tasks } from "@trigger.dev/sdk/v3";

export async function triggerContentPipeline(taskId: string) {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: task } = await supabase
    .from("content_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!task) {
    return { error: "Tarefa não encontrada" };
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    return {
      error:
        "Trigger.dev não configurado (TRIGGER_SECRET_KEY). Configure em .env e no painel Trigger.",
    };
  }

  await tasks.trigger("content-pipeline", { taskId });
  return { ok: true };
}
