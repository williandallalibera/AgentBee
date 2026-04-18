"use server";

import type { ApprovalsQueueRow } from "@/types/approvals-queue";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { wait } from "@trigger.dev/sdk/v3";
import { revalidatePath } from "next/cache";

export type ApprovalAction =
  | "approve"
  | "revision"
  | "new_direction"
  | "cancel";

export async function submitApprovalDecision(input: {
  taskId: string;
  phase: "initial" | "final";
  decision: ApprovalAction;
  comments?: string;
}) {
  const { supabase, user, workspaceId } = await requireWorkspaceMember();

  const type =
    input.phase === "initial" ? "initial_summary" : "final_delivery";

  const { data: approval } = await supabase
    .from("approvals")
    .select("id, wait_token_id, task_id, approval_type")
    .eq("task_id", input.taskId)
    .eq("approval_type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approval || approval.approval_type !== type) {
    return { error: "Aprovação não encontrada" };
  }

  const { data: task } = await supabase
    .from("content_tasks")
    .select("workspace_id")
    .eq("id", input.taskId)
    .single();

  if (!task || task.workspace_id !== workspaceId) {
    return { error: "Acesso negado" };
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    return { error: "TRIGGER_SECRET_KEY ausente — não é possível retomar o pipeline." };
  }

  if (!approval.wait_token_id) {
    return { error: "Token de espera não encontrado (pipeline antigo?)" };
  }

  const payload = {
    action: input.decision,
    comments: input.comments,
  };

  await wait.completeToken(approval.wait_token_id, payload);

  const status =
    input.decision === "approve"
      ? "approved"
      : input.decision === "cancel"
        ? "cancelled"
        : "rejected";

  await supabase
    .from("approvals")
    .update({
      status,
      approver_user_id: user.id,
      responded_at: new Date().toISOString(),
      comments: input.comments ?? null,
    })
    .eq("id", approval.id);

  const { data: taskWithCalendar } = await supabase
    .from("content_tasks")
    .select("calendar_item_id")
    .eq("id", input.taskId)
    .maybeSingle();

  if (taskWithCalendar?.calendar_item_id) {
    if (input.phase === "final" && input.decision === "approve") {
      await supabase
        .from("calendar_items")
        .update({
          status: "approved",
          d1_checked_at: new Date().toISOString(),
          blocked_at: null,
          blocked_reason: null,
        })
        .eq("id", taskWithCalendar.calendar_item_id);
    } else if (input.phase === "final" && input.decision !== "approve") {
      await supabase
        .from("calendar_items")
        .update({
          status: "blocked",
          blocked_at: new Date().toISOString(),
          blocked_reason: "Aprovação final rejeitada",
        })
        .eq("id", taskWithCalendar.calendar_item_id);
    } else if (input.phase === "initial" && input.decision === "approve") {
      await supabase
        .from("calendar_items")
        .update({ status: "awaiting_approval" })
        .eq("id", taskWithCalendar.calendar_item_id);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/approvals");
  revalidatePath(`/content/${input.taskId}`);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function listPendingApprovalsForUser(): Promise<ApprovalsQueueRow[]> {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: tasks } = await supabase
    .from("content_tasks")
    .select("id, title, status, campaign_id, campaigns(id, name)")
    .eq("workspace_id", workspaceId);

  const ids = tasks?.map((t) => t.id) ?? [];
  if (ids.length === 0) return [];

  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, approval_type, status, task_id, created_at")
    .eq("status", "pending")
    .in("task_id", ids)
    .order("created_at", { ascending: false });

  const taskMap = new Map(tasks?.map((t) => [t.id, t]) ?? []);

  return (approvals ?? []).map((a) => {
    const task = taskMap.get(a.task_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = task as any;
    const campaign =
      t?.campaigns && typeof t.campaigns === "object"
        ? { id: String(t.campaigns.id), name: String(t.campaigns.name ?? "") }
        : null;
    return {
      ...a,
      task: task
        ? {
            ...task,
            campaign,
          }
        : undefined,
    };
  });
}
