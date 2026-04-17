import { NextResponse } from "next/server";
import { wait } from "@trigger.dev/sdk/v3";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  captureObservedGoogleChatSpace,
  formatHelpReply,
  formatPendingApprovalsReply,
  formatTaskStatusReply,
  formatUpcomingPostsReply,
  loadChiefAgentSnapshot,
  loadChiefConversationHistory,
  planChiefAgentResponse,
  resolveGoogleChatWorkspace,
  type GoogleChatEventPayload,
} from "@/lib/chief-agent/agent";

/**
 * Webhook Google Chat — recebe eventos interativos do app e responde em tempo real.
 */
export async function POST(request: Request) {
  let payload: GoogleChatEventPayload;
  try {
    payload = (await request.json()) as GoogleChatEventPayload;
  } catch {
    return NextResponse.json({ text: "Payload inválido." });
  }

  const expected = process.env.GOOGLE_CHAT_VERIFICATION_TOKEN;
  const token =
    request.headers.get("x-goog-chat-token") ??
    new URL(request.url).searchParams.get("token") ??
    payload.token;
  if (expected && token !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payload.type === "REMOVED_FROM_SPACE") {
    return NextResponse.json({});
  }

  const supabase = createServiceSupabaseClient();
  const integration = await resolveGoogleChatWorkspace(supabase, payload);

  if (!integration) {
    return NextResponse.json({
      text:
        "Ainda não consegui vincular este espaço do Google Chat ao workspace correto do AgentBee. " +
        "Se houver só um workspace com Google Chat ativo, me adicione novamente ao grupo depois do deploy. " +
        "Se houver mais de um, precisamos mapear este espaço explicitamente.",
    });
  }

  await captureObservedGoogleChatSpace(supabase, integration, payload);

  if (payload.type === "ADDED_TO_SPACE") {
    const spaceName = payload.space?.singleUserBotDm
      ? "neste chat"
      : payload.space?.displayName
        ? `em ${payload.space.displayName}`
        : "neste espaço";
    return NextResponse.json({
      text:
        `AgentBee conectado ${spaceName}. ` +
        "Posso acompanhar aprovações, responder dúvidas operacionais, resumir o calendário e agir no fluxo quando vocês pedirem.",
    });
  }

  const text = extractIncomingText(payload);
  if (!text) {
    return NextResponse.json({ text: formatHelpReply() });
  }

  const workspaceId = integration.workspace_id;
  const externalThreadId = extractThreadId(payload);
  const userName = payload.user?.displayName ?? payload.message?.sender?.displayName ?? null;

  try {
    const snapshot = await loadChiefAgentSnapshot(supabase, workspaceId);
    const { data: openAiIntegration } = await supabase
      .from("integrations")
      .select("config_metadata_json")
      .eq("workspace_id", workspaceId)
      .eq("provider", "openai")
      .maybeSingle();
    const history = await loadChiefConversationHistory(
      supabase,
      workspaceId,
      externalThreadId,
    );
    const openAiConfig = (openAiIntegration?.config_metadata_json ?? {}) as {
      api_key?: string;
      model?: string;
    };
    const plan = await planChiefAgentResponse({
      text,
      userName,
      spaceDisplayName: payload.space?.displayName ?? null,
      snapshot,
      history,
      apiKey: openAiConfig.api_key ?? null,
      model: openAiConfig.model ?? null,
    });

    const reply = await executeChiefAgentPlan({
      supabase,
      workspaceId,
      text,
      plan,
      snapshot,
    });

    await supabase.from("chief_agent_conversations").insert({
      workspace_id: workspaceId,
      external_channel: "google_chat",
      external_thread_id: externalThreadId,
      message_text: text,
      intent: plan.intent,
      response_summary: reply,
    });

    return NextResponse.json({ text: reply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao processar a conversa.";
    return NextResponse.json({
      text: `Tive um problema ao processar isso agora: ${message}`,
    });
  }
}

async function executeChiefAgentPlan(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  workspaceId: string;
  text: string;
  plan: Awaited<ReturnType<typeof planChiefAgentResponse>>;
  snapshot: Awaited<ReturnType<typeof loadChiefAgentSnapshot>>;
}) {
  switch (input.plan.intent) {
    case "pending_approvals":
      return formatPendingApprovalsReply(input.snapshot);
    case "task_status":
      return formatTaskStatusReply(input.snapshot);
    case "upcoming_posts":
      return formatUpcomingPostsReply(input.snapshot);
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
    case "reschedule_item":
      return await rescheduleCalendarItemFromGoogleChat({
        supabase: input.supabase,
        workspaceId: input.workspaceId,
        itemId: input.plan.itemId,
        date: input.plan.date,
      });
    case "ignore":
      return "Fico por aqui se precisarem de mim.";
    case "chat":
    default:
      return input.plan.reply;
  }
}

async function applyApprovalDecisionFromGoogleChat(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  workspaceId: string;
  taskId: string | null;
  decision: "approve" | "revision";
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
      : "Solicitado ajuste via Google Chat");

  await wait.completeToken(approval.wait_token_id, {
    action: input.decision,
    comments: decisionComments,
  });

  await input.supabase
    .from("approvals")
    .update({
      status: input.decision === "approve" ? "approved" : "rejected",
      channel_type: "google_chat",
      comments: decisionComments,
      responded_at: new Date().toISOString(),
    })
    .eq("id", approval.id);

  if (approval.approval_type === "initial_summary") {
    await input.supabase
      .from("content_tasks")
      .update({
        status: input.decision === "approve" ? "creating" : "in_revision",
        current_stage: input.decision === "approve" ? "copy_art" : "plan",
      })
      .eq("id", task.id);

    if (task.calendar_item_id && input.decision === "revision") {
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
      status: input.decision === "approve" ? "approved" : "in_revision",
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
  supabase: ReturnType<typeof createServiceSupabaseClient>;
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

function extractIncomingText(payload: GoogleChatEventPayload) {
  return (payload.message?.argumentText ?? payload.message?.text ?? "").trim();
}

function extractThreadId(payload: GoogleChatEventPayload) {
  return payload.message?.thread?.name ?? payload.thread?.name ?? null;
}
