import { NextResponse } from "next/server";
import { wait } from "@trigger.dev/sdk/v3";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  buildGoogleChatAudienceCandidates,
  resolvePublishedGoogleChatEndpoint,
  verifyGoogleChatRequest,
} from "@/lib/integrations/google-chat";
import {
  normalizeChatWebhookPayload,
  shouldUseWorkspaceAddonResponseFormat,
  workspaceAddonCreateTextMessage,
} from "@/lib/integrations/google-chat-workspace-addon";
import {
  captureObservedGoogleChatSpace,
  formatHelpReply,
  formatPendingApprovalsReply,
  formatTaskStatusReply,
  formatUpcomingPostsReply,
  formatCampaignStatusReply,
  executeCampaignLifecycleFromChief,
  executeCreateCampaignFromChief,
  executeCreateTaskFromChief,
  executeGenerateCalendarFromChief,
  executeStartTaskFromChief,
  formatTaskDetailReplyFromChief,
  loadChiefAgentSnapshot,
  loadChiefConversationHistory,
  planChiefAgentResponse,
  extractIncomingText,
  resolveGoogleChatEventType,
  resolveGoogleChatWorkspace,
  type GoogleChatEventPayload,
} from "@/lib/chief-agent/agent";

/** Limite de tempo no edge/serverless (OpenAI + Supabase deve caber em <30s para o Google). */
export const maxDuration = 60;

/** Sempre executar no servidor; o Google Chat envia POST com eventos em tempo real. */
export const dynamic = "force-dynamic";

/**
 * Webhook Google Chat — recebe eventos interativos do app e responde em tempo real.
 */
export async function GET(request: Request) {
  const endpointUrl = resolvePublishedGoogleChatEndpoint({
    requestUrl: request.url,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });
  const legacyTokenConfigured = Boolean(process.env.GOOGLE_CHAT_VERIFICATION_TOKEN?.trim());
  const bearerAudienceConfigured = Boolean(process.env.GOOGLE_CHAT_AUTH_AUDIENCE?.trim());
  const publicAppUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim());

  return NextResponse.json({
    ok: true,
    provider: "google_chat",
    auth_mode: legacyTokenConfigured ? "legacy_token" : "bearer_fallback",
    endpoint_url: endpointUrl,
    verification: {
      legacy_token_configured: legacyTokenConfigured,
      bearer_audience_configured: bearerAudienceConfigured,
    },
    deploy_hints: {
      next_public_app_url_configured: publicAppUrlConfigured,
    },
    troubleshooting: {
      A_bot_not_replying:
        "Confira URL + token no Google Cloud, eventos de mensagem e menção ao bot em espaços. GET nesta URL só valida que o app está no ar.",
      B_outbound_only:
        "Alertas automáticos usam o webhook do espaço em Integrações (não este endpoint).",
      C_generic_replies:
        "Respostas usam dados do workspace (tarefas, calendário) e playbook quando configurados.",
      D_bearer_audience:
        "Se o app usa só Bearer (sem ?token=), o 'aud' do JWT deve coincidir com a URL do endpoint no Cloud Console (com ou sem barra final) ou com GOOGLE_CHAT_AUTH_AUDIENCE / GOOGLE_CHAT_PROJECT_NUMBER.",
    },
    audience_candidates: buildGoogleChatAudienceCandidates({
      requestUrl: request.url,
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
    }),
    workspace_addon_message_format: shouldUseWorkspaceAddonResponseFormat()
      ? "workspace_addon_hostAppDataAction (padrão)"
      : "chat_api_plain_text — defina assim com GOOGLE_CHAT_WORKSPACE_ADDON=false",
  });
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    console.warn("google_chat_post_invalid_json");
    const addonFmt = shouldUseWorkspaceAddonResponseFormat();
    return NextResponse.json(
      addonFmt
        ? workspaceAddonCreateTextMessage("Payload inválido.")
        : { text: "Payload inválido." },
    );
  }

  const useAddonResponse = shouldUseWorkspaceAddonResponseFormat();
  const payload = normalizeChatWebhookPayload(rawBody) as GoogleChatEventPayload;

  const jsonMessage = (text: string, init?: ResponseInit) =>
    NextResponse.json(
      useAddonResponse ? workspaceAddonCreateTextMessage(text) : { text },
      init,
    );

  const eventTypeEarly = resolveGoogleChatEventType(payload);
  let requestHost = "";
  try {
    requestHost = new URL(request.url).hostname;
  } catch {
    requestHost = "invalid_url";
  }
  console.info("google_chat_post_received", {
    eventType: eventTypeEarly ?? "unknown",
    hasSpace: Boolean(payload.space?.name),
    hasMessage: Boolean(payload.message),
    hasAuthorization: Boolean(request.headers.get("authorization")),
    hasLegacyHeader: Boolean(request.headers.get("x-goog-chat-token")),
    hasTokenInQuery: new URL(request.url).searchParams.has("token"),
    requestHost,
  });

  const token =
    request.headers.get("x-goog-chat-token") ??
    new URL(request.url).searchParams.get("token") ??
    payload.token ??
    null;
  const verification = await verifyGoogleChatRequest({
    authorizationHeader: request.headers.get("authorization"),
    legacyToken: token,
    requestUrl: request.url,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });
  if (!verification.ok) {
    console.warn("google_chat_auth_failed", {
      eventType: eventTypeEarly,
      mode: verification.mode,
      audience: verification.audience,
      hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
      hasLegacyToken: Boolean(token),
      error: verification.error ?? "Unauthorized",
    });
    const status = verification.mode === "bearer" ? 401 : 403;
    const detail = verification.error ?? "Unauthorized";
    const authFailText =
      status === 403
        ? `Falha na verificação do webhook (403). ${detail} Confira se a URL do app no Google Cloud Console termina com o token completo (o mesmo valor de GOOGLE_CHAT_VERIFICATION_TOKEN no deploy) e se não há espaço ou caractere cortado.`
        : `Falha na verificação do webhook (401). ${detail} Se usa autenticação Bearer, confira GOOGLE_CHAT_AUTH_AUDIENCE e o domínio público do app.`;
    return jsonMessage(authFailText, { status });
  }

  const eventType = eventTypeEarly;

  if (eventType === "REMOVED_FROM_SPACE") {
    return NextResponse.json({});
  }

  const supabase = createServiceSupabaseClient();
  const integration = await resolveGoogleChatWorkspace(supabase, payload);

  if (!integration) {
    return jsonMessage(
      "Ainda não consegui vincular este espaço do Google Chat ao workspace correto do AgentBee. " +
        "Se houver só um workspace com Google Chat ativo, me adicione novamente ao grupo depois do deploy. " +
        "Se houver mais de um, precisamos mapear este espaço explicitamente.",
    );
  }

  await captureObservedGoogleChatSpace(supabase, integration, payload);

  console.info("google_chat_inbound", {
    eventType: eventType ?? "unknown",
    hasSpace: Boolean(payload.space?.name),
    hasMessage: Boolean(payload.message),
  });

  if (eventType === "ADDED_TO_SPACE") {
    const spaceName = payload.space?.singleUserBotDm
      ? "neste chat"
      : payload.space?.displayName
        ? `em ${payload.space.displayName}`
        : "neste espaço";
    return jsonMessage(
      `AgentBee conectado ${spaceName}. ` +
        "Posso acompanhar aprovações, responder dúvidas operacionais, resumir o calendário e agir no fluxo quando vocês pedirem.",
    );
  }

  const text = extractIncomingText(payload);
  if (!text) {
    if (eventType === "CARD_CLICKED") {
      return jsonMessage(
        "Recebi um clique em card. Esta versão do AgentBee ainda não trata botões; envie uma mensagem de texto ou use @AgentBee com um pedido.",
      );
    }
    if (eventType === "APP_HOME") {
      return jsonMessage(
        "AgentBee: no espaço, mencione o bot (@…) e peça status, aprovações ou calendário. Em DM pode enviar a mensagem direto.",
      );
    }
    if (eventType === "APP_COMMAND") {
      return jsonMessage(formatHelpReply());
    }
    return jsonMessage(formatHelpReply());
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

    console.info("google_chat_reply_sent", {
      workspaceId,
      intent: plan.intent,
      thread: Boolean(externalThreadId),
    });

    await supabase.from("chief_agent_conversations").insert({
      workspace_id: workspaceId,
      external_channel: "google_chat",
      external_thread_id: externalThreadId,
      message_text: text,
      intent: plan.intent,
      response_summary: reply,
    });

    return jsonMessage(reply);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao processar a conversa.";
    return jsonMessage(`Tive um problema ao processar isso agora: ${message}`);
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

/**
 * Cancela o fluxo no ponto de espera do Trigger (equivalente a «Cancelar» no painel de aprovações).
 * O `content-pipeline` atualiza task/calendário ao consumir o token com action cancel.
 */
async function cancelPendingApprovalFromGoogleChat(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
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

function extractThreadId(payload: GoogleChatEventPayload) {
  return payload.message?.thread?.name ?? payload.thread?.name ?? null;
}
