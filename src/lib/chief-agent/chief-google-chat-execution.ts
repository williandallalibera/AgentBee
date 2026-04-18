import { tasks, wait } from "@trigger.dev/sdk/v3";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  buildApprovalCard,
  buildCalendarDeepLink,
  type ApprovalCardStage,
} from "@/lib/integrations/google-chat-cards";
import { sendGoogleChatCard } from "@/lib/integrations/google-chat";
import {
  formatCampaignStatusReply,
  formatHelpReply,
  formatPendingApprovalsReply,
  formatTaskDetailReplyFromChief,
  formatTaskStatusReply,
  formatUpcomingPostsReply,
  executeCampaignLifecycleFromChief,
  executeCreateCampaignFromChief,
  executeCreateTaskFromChief,
  executeGenerateCalendarFromChief,
  executeStartTaskFromChief,
  type ChiefAgentPlan,
  type ChiefAgentSnapshot,
} from "@/lib/chief-agent/agent";

export type ServiceSupabase = ReturnType<typeof createServiceSupabaseClient>;

const PENDING_APPROVAL_LIST_CARD_LIMIT = 8;

/** Um card por pendência (mesmos botões do pipeline) — webhook do espaço. */
export async function sendPendingApprovalCardsFromSnapshot(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  snapshot: ChiefAgentSnapshot;
  webhookUrl: string | null | undefined;
}) {
  const webhook = input.webhookUrl?.trim();
  if (!webhook || input.snapshot.pendingApprovals.length === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const seenTask = new Set<string>();
  let sent = 0;

  for (const approval of input.snapshot.pendingApprovals) {
    if (sent >= PENDING_APPROVAL_LIST_CARD_LIMIT) break;
    if (seenTask.has(approval.taskId)) continue;
    seenTask.add(approval.taskId);

    const taskId = approval.taskId;
    const stage: ApprovalCardStage =
      approval.approvalType === "final_delivery" ||
      approval.taskStatus === "awaiting_final_approval"
        ? "final"
        : "initial";

    const { data: version } = await input.supabase
      .from("content_versions")
      .select("copy_markdown, visual_draft_url")
      .eq("task_id", taskId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: taskMeta } = await input.supabase
      .from("content_tasks")
      .select("calendar_item_id")
      .eq("id", taskId)
      .maybeSingle();
    let calId = taskMeta?.calendar_item_id;
    if (typeof calId !== "string" || !calId.trim()) {
      const { data: calRow } = await input.supabase
        .from("calendar_items")
        .select("id")
        .eq("content_task_id", taskId)
        .order("planned_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      calId = calRow?.id ?? null;
    }
    const calendarUrl =
      typeof calId === "string" && calId.trim() ? buildCalendarDeepLink(appUrl, calId) : null;

    const webUrl =
      stage === "final"
        ? `${appUrl}/approvals/${taskId}/final`
        : `${appUrl}/approvals/${taskId}/initial`;

    const phaseHint =
      approval.approvalType === "initial_summary"
        ? "Aprovação inicial — resumo da proposta."
        : approval.approvalType === "final_delivery"
          ? "Aprovação final — copy e arte."
          : `Tipo: ${approval.approvalType}`;
    const copy = version?.copy_markdown?.trim();
    const caption = [phaseHint, copy].filter(Boolean).join("\n\n").slice(0, 4000);

    const card = buildApprovalCard({
      taskId,
      stage,
      title: approval.title,
      caption: caption || phaseHint,
      imageUrl: version?.visual_draft_url ?? null,
      webUrl,
      calendarUrl,
    });

    await sendGoogleChatCard(webhook, card, {
      title: "Aprovação pendente",
      subtitle: approval.title,
      lines: [
        stage === "final" ? "Fase: aprovação final" : "Fase: aprovação inicial",
        `Task: ${taskId}`,
      ],
      linkUrl: webUrl,
    });
    sent += 1;
  }
}

export async function executeChiefAgentPlan(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  plan: ChiefAgentPlan;
  snapshot: ChiefAgentSnapshot;
  /** Quando definido, intent `pending_approvals` também envia cards ao espaço. */
  googleChatWebhook?: string | null;
}): Promise<string> {
  switch (input.plan.intent) {
    case "pending_approvals": {
      const base = formatPendingApprovalsReply(input.snapshot);
      if (input.snapshot.pendingApprovals.length === 0) return base;
      await sendPendingApprovalCardsFromSnapshot({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        snapshot: input.snapshot,
        webhookUrl: input.googleChatWebhook,
      });
      if (input.googleChatWebhook?.trim()) {
        return `${base}\n\nEnviei no espaço um card por pendência com *Aprovar*, *Pedir ajuste*, *Nova direção*, *Cancelar fluxo* e link para o painel.`;
      }
      return base;
    }
    case "task_status":
      return formatTaskStatusReply(input.snapshot);
    case "upcoming_posts":
      return formatUpcomingPostsReply(input.snapshot);
    case "campaign_status":
      return formatCampaignStatusReply(input.snapshot);
    case "help":
      return formatHelpReply();
    case "approve_task":
      return await applyApprovalDecisionFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.taskId,
        decision: "approve",
        comments: input.plan.comments,
      });
    case "reject_task":
      return await applyApprovalDecisionFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.taskId,
        decision: "revision",
        comments: input.plan.comments,
      });
    case "new_direction_task":
      return await applyApprovalDecisionFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.taskId,
        decision: "new_direction",
        comments: input.plan.comments,
      });
    case "retry_publication":
      return await retryPublicationFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        publicationId: input.plan.publicationId ?? null,
      });
    case "chief_preview_post":
      return await chiefPreviewPostInChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.taskId,
        snapshot: input.snapshot,
      });
    case "chief_explain":
      return chiefExplainFromSnapshot(input.snapshot, input.plan.explainTopic);
    case "chief_list_failures":
      return await chiefListFailures({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        sinceHours: input.plan.failuresSinceHours ?? 48,
      });
    case "chief_focus":
      return await chiefFocusDetail({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.focusTaskId ?? input.plan.taskId,
        campaignId: input.plan.focusCampaignId ?? null,
        snapshot: input.snapshot,
      });
    case "cancel_task":
      return await cancelPendingApprovalFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        taskId: input.plan.taskId,
        comments: input.plan.comments,
      });
    case "reschedule_item":
      return await rescheduleCalendarItemFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        itemId: input.plan.itemId,
        date: input.plan.date,
      });
    case "create_campaign": {
      if (!input.plan.campaignDraft) {
        return input.plan.reply;
      }
      const created = await executeCreateCampaignFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.campaignDraft,
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${created}` : created;
    }
    case "generate_calendar": {
      const p = input.plan.generateCalendarParams ?? {
        weeksAhead: 4,
        postsPerWeek: 2,
        campaignId: null,
      };
      const out = await executeGenerateCalendarFromChief(
        input.supabase,
        input.workspaceId,
        p,
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${out}` : out;
    }
    case "start_task": {
      if (!input.plan.itemId) return input.plan.reply;
      const out = await executeStartTaskFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.itemId,
        input.plan.startTaskTriggerPipeline !== false,
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${out}` : out;
    }
    case "create_task": {
      if (!input.plan.createTaskParams) return input.plan.reply;
      const out = await executeCreateTaskFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.createTaskParams,
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${out}` : out;
    }
    case "pause_campaign": {
      if (!input.plan.targetCampaignId) return input.plan.reply;
      const out = await executeCampaignLifecycleFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.targetCampaignId,
        "pause",
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${out}` : out;
    }
    case "resume_campaign": {
      if (!input.plan.targetCampaignId) return input.plan.reply;
      const out = await executeCampaignLifecycleFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.targetCampaignId,
        "resume",
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${out}` : out;
    }
    case "task_detail": {
      if (!input.plan.taskId) return input.plan.reply;
      const detail = await formatTaskDetailReplyFromChief(
        input.supabase,
        input.workspaceId,
        input.plan.taskId,
      );
      const head = input.plan.reply?.trim() ?? "";
      return head.length > 0 ? `${head}\n\n${detail}` : detail;
    }
    case "ignore":
      return "Fico por aqui se precisarem de mim.";
    case "chat":
    default:
      return input.plan.reply;
  }
}

async function cancelPendingApprovalFromGoogleChat(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  taskId: string | null;
  comments: string | null;
}): Promise<string> {
  if (!input.taskId) {
    return "Preciso que você indique a task certa para eu agir.";
  }

  const { data: task } = await input.supabase
    .from("content_tasks")
    .select("id, title, workspace_id")
    .eq("id", input.taskId)
    .maybeSingle();

  if (!task || task.workspace_id !== input.workspaceId) {
    return "Não encontrei essa task no workspace atual.";
  }

  const { data: approval } = await input.supabase
    .from("approvals")
    .select("id, wait_token_id, approval_type")
    .eq("task_id", task.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approval) {
    return `Não há aprovação pendente para «${task.title}». Só consigo cancelar o fluxo quando o pipeline está aguardando decisão (como no painel).`;
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    return "TRIGGER_SECRET_KEY não está configurada, então eu não consigo cancelar o fluxo por aqui.";
  }

  if (!approval.wait_token_id) {
    return "A aprovação pendente não tem wait token. Parece um fluxo antigo ou incompleto.";
  }

  const decisionComments = input.comments?.trim() || "Cancelado via Google Chat";

  await wait.completeToken(approval.wait_token_id, {
    action: "cancel",
    comments: decisionComments,
  });

  await input.supabase
    .from("approvals")
    .update({
      status: "cancelled",
      channel_type: "google_chat",
      comments: decisionComments,
      responded_at: new Date().toISOString(),
    })
    .eq("id", approval.id);

  await input.supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    entity_type: "content_task",
    entity_id: task.id,
    action: "cancelled_via_google_chat",
    actor_type: "system",
    actor_id: "google-chat-webhook",
    metadata_json: {
      approval_type: approval.approval_type,
      comments: decisionComments,
    },
  });

  return `Fluxo cancelado para «${task.title}» (task ${task.id}).`;
}

async function applyApprovalDecisionFromGoogleChat(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  taskId: string | null;
  decision: "approve" | "revision" | "new_direction";
  comments: string | null;
}) {
  if (!input.taskId) {
    return "Preciso que você indique a task certa para eu agir.";
  }

  const { data: task } = await input.supabase
    .from("content_tasks")
    .select("id, title, workspace_id, calendar_item_id")
    .eq("id", input.taskId)
    .maybeSingle();

  if (!task || task.workspace_id !== input.workspaceId) {
    return "Não encontrei essa task no workspace atual.";
  }

  const { data: approval } = await input.supabase
    .from("approvals")
    .select("id, wait_token_id, approval_type")
    .eq("task_id", task.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approval) {
    return `Não encontrei aprovação pendente para "${task.title}".`;
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    return "TRIGGER_SECRET_KEY não está configurada, então eu não consigo retomar o pipeline por aqui.";
  }

  if (!approval.wait_token_id) {
    return "A aprovação pendente não tem wait token. Parece um fluxo antigo ou incompleto.";
  }

  const decisionComments =
    input.comments?.trim() ||
    (input.decision === "approve"
      ? "Aprovado via Google Chat"
      : input.decision === "new_direction"
        ? "Nova direção solicitada via Google Chat"
        : "Solicitado ajuste via Google Chat");

  const tokenAction =
    input.decision === "new_direction" ? "new_direction" : input.decision;

  await wait.completeToken(approval.wait_token_id, {
    action: tokenAction as "approve" | "revision" | "new_direction" | "cancel",
    comments: decisionComments,
  });

  await input.supabase
    .from("approvals")
    .update({
      status:
        input.decision === "approve" ? "approved" : "rejected",
      channel_type: "google_chat",
      comments: decisionComments,
      responded_at: new Date().toISOString(),
    })
    .eq("id", approval.id);

  if (approval.approval_type === "initial_summary") {
    await input.supabase
      .from("content_tasks")
      .update({
        status:
          input.decision === "approve" ? "creating" : "in_revision",
        current_stage: input.decision === "approve" ? "copy_art" : "plan",
      })
      .eq("id", task.id);

    if (
      task.calendar_item_id &&
      (input.decision === "revision" || input.decision === "new_direction")
    ) {
      await input.supabase
        .from("calendar_items")
        .update({
          status: "rescheduled",
          blocked_reason: decisionComments,
        })
        .eq("id", task.calendar_item_id);
    }

    await input.supabase.from("audit_logs").insert({
      workspace_id: input.workspaceId,
      entity_type: "content_task",
      entity_id: task.id,
      action:
        input.decision === "approve"
          ? "initial_approved_via_google_chat"
          : "initial_rejected_via_google_chat",
      actor_type: "system",
      actor_id: "google-chat-webhook",
      metadata_json: { comments: decisionComments },
    });

    return input.decision === "approve"
      ? `Direção inicial aprovada para "${task.title}". Vou liberar a equipe para gerar a versão final.`
      : `Direção inicial devolvida para ajustes em "${task.title}". Registrei o feedback.`;
  }

  await input.supabase
    .from("content_tasks")
    .update({
      status:
        input.decision === "approve" ? "approved" : "in_revision",
      current_stage: input.decision === "approve" ? "publish" : "copy_art",
    })
    .eq("id", task.id);

  if (task.calendar_item_id) {
    await input.supabase
      .from("calendar_items")
      .update(
        input.decision === "approve"
          ? {
              status: "approved",
              d1_checked_at: new Date().toISOString(),
              blocked_at: null,
              blocked_reason: null,
            }
          : {
              status: "blocked",
              blocked_at: new Date().toISOString(),
              blocked_reason: decisionComments,
            },
      )
      .eq("id", task.calendar_item_id);
  }

  await input.supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    entity_type: "content_task",
    entity_id: task.id,
    action:
      input.decision === "approve"
        ? "final_approved_via_google_chat"
        : "final_rejected_via_google_chat",
    actor_type: "system",
    actor_id: "google-chat-webhook",
    metadata_json: { comments: decisionComments },
  });

  return input.decision === "approve"
    ? `Versão final aprovada para "${task.title}". Vou seguir com o fluxo de publicação.`
    : `Versão final devolvida para ajustes em "${task.title}". Registrei o feedback.`;
}

async function rescheduleCalendarItemFromGoogleChat(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  itemId: string | null;
  date: string | null;
}) {
  if (!input.itemId || !input.date) {
    return "Para reagendar, eu preciso do item e da nova data no formato YYYY-MM-DD.";
  }

  const { data: item } = await input.supabase
    .from("calendar_items")
    .select("id, topic_title, topic, workspace_id")
    .eq("id", input.itemId)
    .maybeSingle();

  if (!item || item.workspace_id !== input.workspaceId) {
    return "Não encontrei esse item do calendário no workspace atual.";
  }

  const { error } = await input.supabase
    .from("calendar_items")
    .update({
      planned_date: input.date,
      status: "rescheduled",
      blocked_at: null,
      blocked_reason: null,
    })
    .eq("id", item.id);

  if (error) {
    return `Não consegui reagendar esse item: ${error.message}`;
  }

  await input.supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    entity_type: "calendar_item",
    entity_id: item.id,
    action: "rescheduled_via_google_chat",
    actor_type: "system",
    actor_id: "google-chat-webhook",
    metadata_json: { planned_date: input.date },
  });

  const title = item.topic_title ?? item.topic ?? item.id;
  return `Reagendei "${title}" para ${input.date}.`;
}

async function retryPublicationFromGoogleChat(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  publicationId: string | null;
}): Promise<string> {
  if (!input.publicationId?.trim()) {
    return "Preciso do id da publicação para reenviar.";
  }
  if (!process.env.TRIGGER_SECRET_KEY?.trim()) {
    return "TRIGGER_SECRET_KEY não está configurada — não consigo reenfileirar a publicação.";
  }

  const { data: pub } = await input.supabase
    .from("publications")
    .select("id, task_id, status")
    .eq("id", input.publicationId.trim())
    .maybeSingle();

  if (!pub?.task_id) {
    return "Publicação não encontrada.";
  }

  const { data: task } = await input.supabase
    .from("content_tasks")
    .select("id, workspace_id, title")
    .eq("id", pub.task_id)
    .maybeSingle();

  if (!task || task.workspace_id !== input.workspaceId) {
    return "Essa publicação não pertence ao workspace atual.";
  }

  await input.supabase
    .from("publications")
    .update({
      status: "pending",
      last_error: null,
      retry_count: 0,
      next_attempt_at: null,
    })
    .eq("id", pub.id);

  try {
    await tasks.trigger("publish-social", { publicationId: pub.id as string });
  } catch (e) {
    return `Não consegui disparar publish-social: ${e instanceof Error ? e.message : "erro"}.`;
  }

  return `Reenfileirei a publicação (${pub.id}) para «${task.title}».`;
}

async function chiefPreviewPostInChat(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  taskId: string | null;
  snapshot: ChiefAgentSnapshot;
}): Promise<string> {
  if (!input.taskId?.trim()) {
    return "Use chief_preview_post com task_id (UUID da tarefa).";
  }

  const detail = await formatTaskDetailReplyFromChief(
    input.supabase,
    input.workspaceId,
    input.taskId.trim(),
  );

  const { data: gc } = await input.supabase
    .from("integrations")
    .select("config_metadata_json")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", "google_chat")
    .maybeSingle();
  const webhook = (
    gc?.config_metadata_json as { webhook_url?: string } | null
  )?.webhook_url?.trim();

  if (!webhook) {
    return `${detail}\n\n(Webhook do Google Chat não configurado — não enviei card.)`;
  }

  const { data: task } = await input.supabase
    .from("content_tasks")
    .select("id, title, status, calendar_item_id")
    .eq("id", input.taskId.trim())
    .maybeSingle();

  const { data: version } = await input.supabase
    .from("content_versions")
    .select("copy_markdown, visual_draft_url")
    .eq("task_id", input.taskId.trim())
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: pend } = await input.supabase
    .from("approvals")
    .select("approval_type")
    .eq("task_id", input.taskId.trim())
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stage =
    pend?.approval_type === "final_delivery" || task?.status === "awaiting_final_approval"
      ? "final"
      : "initial";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const webUrl =
    stage === "final"
      ? `${appUrl}/approvals/${input.taskId}/final`
      : `${appUrl}/approvals/${input.taskId}/initial`;

  let calId = task?.calendar_item_id;
  if (typeof calId !== "string" || !calId.trim()) {
    const { data: calRow } = await input.supabase
      .from("calendar_items")
      .select("id")
      .eq("content_task_id", input.taskId.trim())
      .order("planned_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    calId = calRow?.id ?? null;
  }
  const calendarUrl =
    typeof calId === "string" && calId.trim() ? buildCalendarDeepLink(appUrl, calId) : null;

  const card = buildApprovalCard({
    taskId: input.taskId.trim(),
    stage,
    title: task?.title ?? "Preview",
    caption: (version?.copy_markdown ?? detail).slice(0, 4000),
    imageUrl: version?.visual_draft_url ?? null,
    webUrl,
    calendarUrl,
  });

  await sendGoogleChatCard(webhook, card, {
    title: "Preview da peça",
    subtitle: task?.title ?? "",
    lines: [detail.slice(0, 800)],
    linkUrl: webUrl,
  });

  return "Enviei um card no espaço com o preview (copy + arte, se houver).";
}

function chiefExplainFromSnapshot(snapshot: ChiefAgentSnapshot, topic: string | null | undefined) {
  const t = topic?.trim() || "o playbook e a operação";
  const pb = snapshot.playbookExcerpt?.trim() || "(playbook vazio)";
  return [
    `Sobre *${t}* — com base no playbook e no snapshot atual:`,
    "",
    pb.slice(0, 3500),
    "",
    `Pendências: ${snapshot.pendingApprovals.length}. Próximos slots no calendário: ${snapshot.upcomingPosts.length}.`,
  ].join("\n");
}

async function chiefListFailures(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  sinceHours: number;
}): Promise<string> {
  const since = new Date(Date.now() - input.sinceHours * 3600 * 1000).toISOString();

  const { data: pubs } = await input.supabase
    .from("publications")
    .select("id, last_error, channel_type, created_at, task_id")
    .eq("status", "failed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(12);

  const taskIds = [...new Set((pubs ?? []).map((p) => p.task_id))];
  const taskTitles = new Map<string, string>();
  if (taskIds.length > 0) {
    const { data: tasksData } = await input.supabase
      .from("content_tasks")
      .select("id, title, workspace_id")
      .in("id", taskIds)
      .eq("workspace_id", input.workspaceId);
    for (const row of tasksData ?? []) {
      taskTitles.set(row.id, row.title);
    }
  }

  const pubLines = (pubs ?? [])
    .filter((p) => taskTitles.has(p.task_id))
    .map(
      (p) =>
        `• pub ${p.id} (${p.channel_type}) task «${taskTitles.get(p.task_id)}»: ${p.last_error ?? "erro"}`,
    );

  const { data: runs } = await input.supabase
    .from("agent_runs")
    .select("id, stage, error_message, finished_at, task_id")
    .eq("status", "error")
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(12);

  const runTaskIds = [...new Set((runs ?? []).map((r) => r.task_id).filter(Boolean) as string[])];
  const runTitles = new Map<string, string>();
  if (runTaskIds.length > 0) {
    const { data: t2 } = await input.supabase
      .from("content_tasks")
      .select("id, title, workspace_id")
      .in("id", runTaskIds)
      .eq("workspace_id", input.workspaceId);
    for (const row of t2 ?? []) {
      runTitles.set(row.id, row.title);
    }
  }

  const runLines = (runs ?? [])
    .filter((r) => r.task_id && runTitles.has(r.task_id))
    .map(
      (r) =>
        `• run ${r.stage} task «${runTitles.get(r.task_id!)}»: ${r.error_message ?? "erro"}`,
    );

  if (pubLines.length === 0 && runLines.length === 0) {
    return `Nenhuma falha registrada nas últimas ${input.sinceHours}h neste workspace.`;
  }

  return ["Falhas recentes:", "", ...pubLines, ...runLines].join("\n");
}

async function chiefFocusDetail(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  taskId: string | null;
  campaignId: string | null;
  snapshot: ChiefAgentSnapshot;
}): Promise<string> {
  const parts: string[] = [];
  if (input.taskId?.trim()) {
    parts.push(
      await formatTaskDetailReplyFromChief(
        input.supabase,
        input.workspaceId,
        input.taskId.trim(),
      ),
    );
  }
  const campaignIdTrimmed = input.campaignId?.trim();
  if (campaignIdTrimmed) {
    const c = input.snapshot.recentCampaigns.find((x) => x.id === campaignIdTrimmed);
    if (c) {
      parts.push(`Campanha em foco: ${c.name} (${c.status}) — ${c.objective ?? "sem objetivo"}`);
    } else {
      parts.push(`Campanha ${campaignIdTrimmed} não está no snapshot recente.`);
    }
  }
  if (parts.length === 0) {
    return "Use chief_focus com focus_task_id ou focus_campaign_id.";
  }
  return parts.join("\n\n—\n\n");
}
