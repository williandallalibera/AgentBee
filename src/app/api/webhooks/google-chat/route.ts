import { NextResponse } from "next/server";
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
  extractCardActionAsCommand,
  extractIncomingText,
  formatHelpReply,
  loadChiefConversationHistory,
  loadChiefThreadSummary,
  resolveGoogleChatEventType,
  resolveGoogleChatWorkspace,
  type GoogleChatEventPayload,
} from "@/lib/chief-agent/agent";
import {
  maybeSummarizeChiefThread,
  runChiefGoogleChatTurn,
} from "@/lib/chief-agent/chief-orchestrator";

/** Limite de tempo no edge/serverless (OpenAI + Supabase deve caber em <30s para o Google). */
export const maxDuration = 60;

/** Sempre executar no servidor; o Google Chat envia eventos em tempo real. */
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

  let text = extractIncomingText(payload);
  if (!text && eventType === "CARD_CLICKED") {
    text = extractCardActionAsCommand(payload);
  }
  if (!text) {
    if (eventType === "CARD_CLICKED") {
      return jsonMessage(
        "Não reconheci a ação deste botão. Configure actionMethodName chief_approve / chief_reject / chief_cancel com parâmetro taskId, ou envie «aprovar UUID» em texto.",
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
    const { data: openAiIntegration } = await supabase
      .from("integrations")
      .select("config_metadata_json")
      .eq("workspace_id", workspaceId)
      .eq("provider", "openai")
      .maybeSingle();

    const { data: gcMeta } = await supabase
      .from("integrations")
      .select("config_metadata_json")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_chat")
      .maybeSingle();
    const googleChatWebhook = (
      gcMeta?.config_metadata_json as { webhook_url?: string } | null
    )?.webhook_url?.trim() || null;

    const history = await loadChiefConversationHistory(
      supabase,
      workspaceId,
      externalThreadId,
    );
    const threadSummary = await loadChiefThreadSummary(supabase, workspaceId, externalThreadId);

    const openAiConfig = (openAiIntegration?.config_metadata_json ?? {}) as {
      api_key?: string;
      model?: string;
    };

    const { reply, intent } = await runChiefGoogleChatTurn({
      supabase,
      workspaceId,
      text,
      userName,
      spaceDisplayName: payload.space?.displayName ?? null,
      externalThreadId,
      history,
      threadSummary,
      openAiApiKey: openAiConfig.api_key ?? null,
      openAiModel: openAiConfig.model ?? null,
      googleChatWebhook,
    });

    console.info("google_chat_reply_sent", {
      workspaceId,
      intent,
      thread: Boolean(externalThreadId),
    });

    await supabase.from("chief_agent_conversations").insert({
      workspace_id: workspaceId,
      external_channel: "google_chat",
      external_thread_id: externalThreadId,
      message_text: text,
      intent,
      response_summary: reply,
    });

    const historyAfter = await loadChiefConversationHistory(
      supabase,
      workspaceId,
      externalThreadId,
      32,
    );
    void maybeSummarizeChiefThread({
      supabase,
      workspaceId,
      externalThreadId,
      history: historyAfter,
      apiKey: openAiConfig.api_key ?? null,
      model: openAiConfig.model ?? null,
    });

    return jsonMessage(reply);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao processar a conversa.";
    return jsonMessage(`Tive um problema ao processar isso agora: ${message}`);
  }
}

function extractThreadId(payload: GoogleChatEventPayload) {
  return payload.message?.thread?.name ?? payload.thread?.name ?? null;
}
