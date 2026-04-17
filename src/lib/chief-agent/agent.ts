import { createContentTaskCore } from "@/lib/content/create-task-core";
import { generateCalendarSuggestionsCore } from "@/lib/calendar/suggestions";
import { createTaskFromCalendarItemCore } from "@/lib/calendar/task-from-calendar-item";
import { classifyChiefIntent } from "@/lib/chief-agent/intent";
import { tasks } from "@trigger.dev/sdk/v3";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GoogleChatEventPayload = {
  type?: string;
  /** Alguns proxies ou versões do payload podem enviar o tipo com este nome. */
  eventType?: string;
  token?: string;
  space?: {
    name?: string;
    displayName?: string;
    singleUserBotDm?: boolean;
  };
  thread?: {
    name?: string;
  };
  user?: {
    name?: string;
    displayName?: string;
  };
  message?: {
    name?: string;
    text?: string;
    /** Texto sem a menção ao bot (Google Chat). */
    argumentText?: string;
    /** Texto formatado com menções `<users/...>`. */
    formattedText?: string;
    /** Texto alternativo quando a mensagem é principalmente mídia/card. */
    fallbackText?: string;
    thread?: {
      name?: string;
    };
    sender?: {
      name?: string;
      displayName?: string;
      type?: string;
    };
  };
};

type IntegrationRow = {
  id: string;
  workspace_id: string;
  config_metadata_json?: Record<string, unknown> | null;
  created_at?: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  current_stage: string | null;
  updated_at: string;
};

type ApprovalRow = {
  id: string;
  task_id: string;
  approval_type: string;
  status: string;
  created_at: string;
};

type CalendarRow = {
  id: string;
  planned_date: string;
  topic_title: string | null;
  topic: string | null;
  status: string;
  content_task_id: string | null;
};

type PlaybookRow = {
  content_markdown: string;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  objective: string | null;
};

type ConversationRow = {
  message_text: string;
  intent: string | null;
  response_summary: string | null;
  created_at: string;
};

type Queryable = {
  from: SupabaseClient["from"];
};

export type ChiefAgentPlanIntent =
  | "chat"
  | "pending_approvals"
  | "task_status"
  | "campaign_status"
  | "upcoming_posts"
  | "approve_task"
  | "reject_task"
  | "cancel_task"
  | "reschedule_item"
  | "create_campaign"
  | "generate_calendar"
  | "start_task"
  | "create_task"
  | "pause_campaign"
  | "resume_campaign"
  | "task_detail"
  | "help"
  | "ignore";

/** Plano extraído pelo modelo para criar campanha + calendário no workspace. */
export type CampaignDraftPayload = {
  name: string;
  objective: string | null;
  channels: Array<"instagram" | "linkedin">;
  /** Slots iniciais no calendário editorial (máx. 16). */
  slotCount: number;
  /** Cria tarefas de conteúdo e dispara o pipeline Trigger para os primeiros N slots. */
  autoStartTasks: boolean;
  autoStartCount: number;
};

export type GenerateCalendarParamsPayload = {
  weeksAhead?: number;
  postsPerWeek?: number;
  campaignId?: string | null;
};

export type CreateTaskParamsPayload = {
  title: string;
  campaignId?: string | null;
  triggerPipeline: boolean;
};

export type ChiefAgentPlan = {
  intent: ChiefAgentPlanIntent;
  reply: string;
  taskId: string | null;
  itemId: string | null;
  date: string | null;
  comments: string | null;
  confidence: "high" | "medium" | "low";
  campaignDraft: CampaignDraftPayload | null;
  /** Intenção generate_calendar */
  generateCalendarParams?: GenerateCalendarParamsPayload | null;
  /** Intenção create_task */
  createTaskParams?: CreateTaskParamsPayload | null;
  /** Intenção start_task — padrão true se omitido */
  startTaskTriggerPipeline?: boolean | null;
  /** Intenções pause_campaign / resume_campaign — UUID da campanha (use snapshot.recentCampaigns). */
  targetCampaignId?: string | null;
};

export type ChiefAgentSnapshot = {
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    currentStage: string | null;
    initialApprovalUrl: string | null;
    finalApprovalUrl: string | null;
  }>;
  pendingApprovals: Array<{
    id: string;
    taskId: string;
    title: string;
    approvalType: string;
    taskStatus: string;
    createdAt: string;
  }>;
  upcomingPosts: Array<{
    id: string;
    plannedDate: string;
    title: string;
    status: string;
    taskId: string | null;
  }>;
  blockedItems: Array<{
    id: string;
    plannedDate: string;
    title: string;
    status: string;
    taskId: string | null;
  }>;
  /** Trecho do playbook do workspace para contexto do agente (pode ser vazio). */
  playbookExcerpt: string;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    objective: string | null;
  }>;
};

type ConversationTurn = {
  user: string;
  agent: string | null;
  createdAt: string;
};

export async function resolveGoogleChatWorkspace(
  supabase: Queryable,
  payload: GoogleChatEventPayload,
): Promise<IntegrationRow | null> {
  const { data } = await supabase
    .from("integrations")
    .select("id, workspace_id, config_metadata_json, created_at")
    .eq("provider", "google_chat")
    .order("created_at", { ascending: true })
    .limit(20);

  const integrations = (data ?? []) as IntegrationRow[];
  if (integrations.length === 0) return null;

  const spaceName = payload.space?.name?.trim();
  const spaceDisplayName = payload.space?.displayName?.trim();

  const matched = integrations.find((integration) =>
    matchesGoogleChatSpace(integration.config_metadata_json, spaceName, spaceDisplayName),
  );
  if (matched) return matched;

  if (integrations.length === 1) {
    return integrations[0] ?? null;
  }

  const unbound = integrations.find((integration) => {
    const config = integration.config_metadata_json ?? {};
    return !readConfigString(config, "space_name") && !readConfigString(config, "space_display_name");
  });

  return unbound ?? null;
}

export async function captureObservedGoogleChatSpace(
  supabase: Queryable,
  integration: IntegrationRow,
  payload: GoogleChatEventPayload,
) {
  const current = integration.config_metadata_json ?? {};
  const next = { ...current };
  let changed = false;

  if (payload.space?.name && !readConfigString(current, "space_name")) {
    next.space_name = payload.space.name;
    changed = true;
  }

  if (payload.space?.displayName && !readConfigString(current, "space_display_name")) {
    next.space_display_name = payload.space.displayName;
    changed = true;
  }

  if (!changed) return;

  await supabase
    .from("integrations")
    .update({
      config_metadata_json: next,
      last_tested_at: new Date().toISOString(),
    })
    .eq("id", integration.id);
}

export async function loadChiefAgentSnapshot(
  supabase: Queryable,
  workspaceId: string,
): Promise<ChiefAgentSnapshot> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: tasksData },
    { data: playbookDocs },
    { data: brandRows },
    { data: calendarData },
  ] = await Promise.all([
    supabase
      .from("content_tasks")
      .select("id, title, status, current_stage, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("playbook_documents")
      .select("content_markdown")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase.from("brands").select("id").eq("workspace_id", workspaceId),
    supabase
      .from("calendar_items")
      .select("id, planned_date, topic_title, topic, status, content_task_id")
      .eq("workspace_id", workspaceId)
      .gte("planned_date", today)
      .order("planned_date", { ascending: true })
      .limit(12),
  ]);

  const tasks = (tasksData ?? []) as TaskRow[];
  const taskIds = tasks.map((task) => task.id);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const brandIds = (brandRows ?? []).map((row: { id: string }) => row.id);
  let campaignsData: CampaignRow[] = [];
  if (brandIds.length > 0) {
    const { data: campRows } = await supabase
      .from("campaigns")
      .select("id, name, status, objective")
      .in("brand_id", brandIds)
      .order("created_at", { ascending: false })
      .limit(12);
    campaignsData = (campRows ?? []) as CampaignRow[];
  }

  const playbookExcerpt = ((playbookDocs ?? []) as PlaybookRow[])
    .map((row) => row.content_markdown)
    .join("\n\n")
    .slice(0, 8000);

  let pendingApprovals: ApprovalRow[] = [];
  if (taskIds.length > 0) {
    const { data: approvalsData } = await supabase
      .from("approvals")
      .select("id, task_id, approval_type, status, created_at")
      .eq("status", "pending")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false })
      .limit(12);
    pendingApprovals = (approvalsData ?? []) as ApprovalRow[];
  }

  const calendarItems = (calendarData ?? []) as CalendarRow[];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  return {
    recentTasks: tasks.slice(0, 8).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      currentStage: task.current_stage,
      initialApprovalUrl: appUrl ? `${appUrl}/approvals/${task.id}/initial` : null,
      finalApprovalUrl: appUrl ? `${appUrl}/approvals/${task.id}/final` : null,
    })),
    pendingApprovals: pendingApprovals.map((approval) => {
      const task = taskMap.get(approval.task_id);
      return {
        id: approval.id,
        taskId: approval.task_id,
        title: task?.title ?? approval.task_id,
        approvalType: approval.approval_type,
        taskStatus: task?.status ?? "unknown",
        createdAt: approval.created_at,
      };
    }),
    upcomingPosts: calendarItems.map((item) => ({
      id: item.id,
      plannedDate: item.planned_date,
      title: item.topic_title ?? item.topic ?? "Tema sem título",
      status: item.status,
      taskId: item.content_task_id,
    })),
    blockedItems: calendarItems
      .filter((item) => ["blocked", "rescheduled", "awaiting_approval"].includes(item.status))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        plannedDate: item.planned_date,
        title: item.topic_title ?? item.topic ?? "Tema sem título",
        status: item.status,
        taskId: item.content_task_id,
      })),
    playbookExcerpt,
    recentCampaigns: campaignsData.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective ?? null,
    })),
  };
}

export async function loadChiefConversationHistory(
  supabase: Queryable,
  workspaceId: string,
  externalThreadId: string | null,
): Promise<ConversationTurn[]> {
  const builder = supabase
    .from("chief_agent_conversations")
    .select("message_text, intent, response_summary, created_at")
    .eq("workspace_id", workspaceId)
    .eq("external_channel", "google_chat");

  const { data } = externalThreadId
    ? await builder
        .eq("external_thread_id", externalThreadId)
        .order("created_at", { ascending: false })
        .limit(8)
    : await builder.order("created_at", { ascending: false }).limit(8);

  const rows = (data ?? []) as ConversationRow[];
  return rows
    .slice()
    .reverse()
    .map((row) => ({
      user: row.message_text,
      agent: row.response_summary,
      createdAt: row.created_at,
    }));
}

export async function planChiefAgentResponse(input: {
  text: string;
  userName: string | null;
  spaceDisplayName: string | null;
  snapshot: ChiefAgentSnapshot;
  history: ConversationTurn[];
  apiKey?: string | null;
  model?: string | null;
}): Promise<ChiefAgentPlan> {
  const fallback = fallbackChiefAgentPlan(input.text, input.snapshot);
  const key = input.apiKey ?? process.env.OPENAI_API_KEY;

  const looksLikeCreateCampaign =
    /\b(crie|criar|monte|montar|planeje|planege|planejar|elabore|elaborar|inicie|iniciar|fa(ç|c)a uma campanha|fazer uma campanha|vamos criar uma campanha|nova campanha)\b/i.test(
      input.text,
    ) && /\bcampanhas?\b/i.test(input.text);

  /** Pedido explícito de sugestões no calendário (evita cair só em "próximas postagens"). */
  const looksLikeGenerateCalendar =
    /\bcalend[aá]rio\s+de\s+sugest/i.test(input.text) ||
    /\b(gerar|monte|crie)\s+.{0,40}(sugest(ão|ões)|slots).{0,40}(calend|agenda)/i.test(
      input.text,
    ) ||
    /\bsugest(ão|ões)\s+(de\s+)?(post|publica)/i.test(input.text);

  const looksLikeOperations =
    /\b(gerar|gera|sugest|preench|enche)\s+.{0,40}(calend|agenda)/i.test(input.text) ||
    /\b(sugest(õ|o)es)\s+(de\s+)?(calend|post)/i.test(input.text) ||
    /\b(iniciar|come(ç|c)ar|disparar|rodar)\s+.{0,40}(tarefa|pipeline|produ(ç|c))/i.test(
      input.text,
    ) ||
    /\b(criar|nova)\s+(uma\s+)?tarefa\b/i.test(input.text) ||
    /\b(pausar|retomar)\s+.{0,30}campanha/i.test(input.text) ||
    /\b(detalhe|detalhes|ver)\s+.{0,30}(tarefa|task)\b/i.test(input.text);

  const looksLikeCancel =
    /\b(cancelar|cancela)\s+(?:a\s+)?(?:task\s+)?([a-f0-9-]{8,})/i.test(input.text) ||
    /\b(cancelar|cancela)\s+(?:o\s+)?fluxo/i.test(input.text);

  if (
    !key &&
    (looksLikeCreateCampaign || looksLikeGenerateCalendar || looksLikeOperations || looksLikeCancel)
  ) {
    return {
      ...fallback,
      intent: "chat",
      reply:
        "Para eu operar pelo chat (calendário, tarefas, campanhas, pipeline), configure a integração OpenAI neste workspace (Integrações → OpenAI). Sem isso o painel web continua disponível para gestão.",
      campaignDraft: null,
      confidence: "low",
    };
  }

  /** Pedidos operacionais e conversa geral passam pela LLM quando há chave. */
  const useLlm =
    Boolean(key) &&
    (fallback.intent === "chat" ||
      fallback.intent === "help" ||
      looksLikeCreateCampaign ||
      looksLikeGenerateCalendar ||
      looksLikeOperations ||
      looksLikeCancel);
  if (!useLlm) {
    return fallback;
  }

  const playbookHint =
    input.snapshot.playbookExcerpt.trim().length > 0
      ? " Use o trecho de playbook fornecido como referência de tom, voz e diretrizes quando fizer sentido; não invente fatos que não estejam no playbook nem no snapshot."
      : "";

  const prompt = [
    "Você é o Agente Chefe do AgentBee, atuando em um grupo interno do Google Chat.",
    "Fale sempre em português do Brasil, em tom humano, objetivo, cordial e operacional.",
    "Você pode conversar naturalmente, responder dúvidas do time e executar ações operacionais quando a instrução estiver clara.",
    "Ações permitidas: listar aprovações, status de tarefas e campanhas, próximas postagens, aprovar/reprovar/cancelar task (cancel_task encerra o fluxo no ponto de aprovação — equivalente a Cancelar no painel), reagendar item, criar campanha (create_campaign), gerar sugestões no calendário (generate_calendar), criar tarefa avulsa (create_task), iniciar produção a partir de um slot do calendário (start_task + itemId do item), pausar/retomar campanha (pause_campaign / resume_campaign + targetCampaignId do snapshot), detalhar uma tarefa (task_detail + taskId).",
    "Para create_campaign: campaignDraft com nome, objetivo, canais, slotCount, autoStartTasks, autoStartCount.",
    "Para generate_calendar: generateCalendarParams { weeksAhead 1-12, postsPerWeek 1-7, campaignId opcional UUID }. Para create_task: createTaskParams { title, campaignId opcional, triggerPipeline }. Para start_task: itemId = UUID do calendar_items; startTaskTriggerPipeline boolean (default true). Para pause/resume: targetCampaignId UUID em recentCampaigns.",
    "Só escolha aprovar/reprovar/cancelar/reagendar quando o pedido estiver explícito e o alvo estiver claro nos dados. cancel_task só com taskId que tenha aprovação pendente no snapshot.",
    "Nunca invente IDs, datas, aprovações, tarefas ou status.",
    "Se faltar contexto para agir, responda pedindo confirmação ou esclarecimento.",
    "Se a mensagem for apenas social ou aberta, responda como um gerente operacional útil usando os dados fornecidos.",
    playbookHint,
    "Retorne somente JSON válido.",
  ]
    .filter(Boolean)
    .join(" ");

  const body = {
    model:
      input.model ??
      process.env.OPENAI_CHIEF_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            actor: input.userName ?? "Usuário",
            space: input.spaceDisplayName ?? "Google Chat",
            latest_message: input.text,
            recent_history: input.history.map((turn) => ({
              user: turn.user,
              agent: turn.agent,
              created_at: turn.createdAt,
            })),
            workspace_snapshot: input.snapshot,
            playbook_excerpt: input.snapshot.playbookExcerpt || null,
            instructions: {
              response_shape: {
                intent:
                  "chat | pending_approvals | task_status | campaign_status | upcoming_posts | approve_task | reject_task | cancel_task | reschedule_item | create_campaign | generate_calendar | start_task | create_task | pause_campaign | resume_campaign | task_detail | help | ignore",
                reply: "string — resumo operacional",
                taskId: "string|null — content_tasks.id (approve, reject, cancel_task, task_detail)",
                itemId: "string|null — calendar_items.id (start_task, reschedule)",
                date: "YYYY-MM-DD|null",
                comments: "string|null",
                campaignDraft:
                  "{ name, objective, channels, slotCount, autoStartTasks, autoStartCount } | null",
                generateCalendarParams:
                  "{ weeksAhead?: number, postsPerWeek?: number, campaignId?: string|null } | null",
                createTaskParams:
                  "{ title: string, campaignId?: string|null, triggerPipeline: boolean } | null",
                startTaskTriggerPipeline: "boolean|null",
                targetCampaignId: "string|null — campaigns.id para pause/resume",
                confidence: "high | medium | low",
              },
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: { type: "json_object" },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return fallback;
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return normalizeChiefAgentPlan(parsed, input.snapshot, fallback);
  } catch {
    return fallback;
  }
}

export function formatPendingApprovalsReply(snapshot: ChiefAgentSnapshot) {
  if (snapshot.pendingApprovals.length === 0) {
    return "No momento não há aprovações pendentes por aqui.";
  }

  const lines = snapshot.pendingApprovals.map((approval) => {
    const phase =
      approval.approvalType === "initial_summary"
        ? "aprovação inicial"
        : approval.approvalType === "final_delivery"
          ? "aprovação final"
          : approval.approvalType;
    return `• ${approval.title} — ${phase} — task ${approval.taskId}`;
  });

  return `Tenho ${snapshot.pendingApprovals.length} aprovação(ões) pendente(s):\n${lines.join("\n")}`;
}

export function formatTaskStatusReply(snapshot: ChiefAgentSnapshot) {
  if (snapshot.recentTasks.length === 0) {
    return "Ainda não encontrei tarefas recentes neste workspace.";
  }

  const lines = snapshot.recentTasks.map((task) => {
    const links =
      task.initialApprovalUrl && task.finalApprovalUrl
        ? ` — aprovações: inicial ${task.initialApprovalUrl} | final ${task.finalApprovalUrl}`
        : "";
    return `• ${task.title} — id ${task.id} — ${task.status}${
      task.currentStage ? ` — etapa ${task.currentStage}` : ""
    }${links}`;
  });

  const blockedSummary =
    snapshot.blockedItems.length > 0
      ? `\n\nItens com atenção:\n${snapshot.blockedItems
          .map((item) => `• ${item.title} — ${item.status} — ${item.plannedDate}`)
          .join("\n")}`
      : "";

  return `Resumo operacional mais recente:\n${lines.join("\n")}${blockedSummary}`;
}

export function formatUpcomingPostsReply(snapshot: ChiefAgentSnapshot) {
  if (snapshot.upcomingPosts.length === 0) {
    return "Não há postagens agendadas para os próximos dias.";
  }

  return `Próximas postagens:\n${snapshot.upcomingPosts
    .map(
      (item) =>
        `• ${item.plannedDate} — ${item.title} (${item.status}) — calendário id ${item.id}`,
    )
    .join("\n")}`;
}

export function formatCampaignStatusReply(snapshot: ChiefAgentSnapshot) {
  if (snapshot.recentCampaigns.length === 0) {
    return "Ainda não há campanhas cadastradas neste workspace.";
  }

  const lines = snapshot.recentCampaigns.map((c) => {
    const obj = c.objective ? ` — ${c.objective}` : "";
    return `• ${c.name} — ${c.status}${obj}`;
  });

  return `Campanhas:\n${lines.join("\n")}`;
}

export function formatHelpReply() {
  return [
    "Exemplos: pendências, status, campanhas, próximas postagens (com id do calendário), aprovar/reprovar/cancelar task (com id), reagendar item (YYYY-MM-DD), criar campanha, gerar sugestões de calendário, criar/iniciar tarefa, pausar/retomar campanha, detalhe de tarefa por id.",
    "Com OpenAI no workspace, interpreto pedidos em linguagem natural e executo no sistema (pipeline via Trigger quando configurado).",
  ].join(" ");
}

function fallbackChiefAgentPlan(
  text: string,
  snapshot: ChiefAgentSnapshot,
): ChiefAgentPlan {
  const normalized = text.trim().toLowerCase();
  if (/\bpendente|pendencias|pendências|travado|travada|bloqueado|bloqueada\b/.test(normalized)) {
    return {
      intent: snapshot.pendingApprovals.length > 0 ? "pending_approvals" : "task_status",
      reply:
        snapshot.pendingApprovals.length > 0
          ? formatPendingApprovalsReply(snapshot)
          : formatTaskStatusReply(snapshot),
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      confidence: "medium",
    };
  }

  const isCampaignListQuery =
    /\bcampanhas?\b/i.test(normalized) &&
    /\b(quais|lista|mostre|mostrar|status|situa(ç|c)ao|andamento|existem|tem alguma|cadastradas|ativas)\b/i.test(
      normalized,
    );

  if (isCampaignListQuery) {
    return {
      intent: "campaign_status",
      reply: formatCampaignStatusReply(snapshot),
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      confidence: "high",
    };
  }

  if (/\bstatus|andamento|resumo|atualiza|atualização|como está|como esta\b/.test(normalized)) {
    return {
      intent: "task_status",
      reply: formatTaskStatusReply(snapshot),
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      confidence: "medium",
    };
  }

  if (/\b(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(normalized)) {
    return {
      intent: "chat",
      reply:
        snapshot.pendingApprovals.length > 0
          ? `Bom ter você por aqui. Estou acompanhando ${snapshot.pendingApprovals.length} aprovação(ões) pendente(s) neste momento.`
          : "Estou por aqui e acompanhando a operação. Se quiser, eu posso te resumir tarefas, aprovações ou calendário.",
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      confidence: "medium",
    };
  }

  const intent = classifyChiefIntent(text);
  switch (intent.kind) {
    case "pending_approvals":
      return {
        intent: "pending_approvals",
        reply: formatPendingApprovalsReply(snapshot),
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "task_status":
      return {
        intent: "task_status",
        reply: formatTaskStatusReply(snapshot),
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "campaign_status":
      return {
        intent: "campaign_status",
        reply: formatCampaignStatusReply(snapshot),
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "upcoming_posts":
      return {
        intent: "upcoming_posts",
        reply: formatUpcomingPostsReply(snapshot),
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "approve_task":
      return {
        intent: "approve_task",
        reply: "Posso aprovar, vou verificar a pendência correta dessa task.",
        taskId: intent.taskId,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "reject_task":
      return {
        intent: "reject_task",
        reply: "Vou registrar a rejeição e devolver para ajuste.",
        taskId: intent.taskId,
        itemId: null,
        date: null,
        comments: intent.comments ?? null,
        campaignDraft: null,
        confidence: "high",
      };
    case "cancel_task":
      return {
        intent: "cancel_task",
        reply: "Vou cancelar essa task no ponto de aprovação e encerrar o fluxo no pipeline.",
        taskId: intent.taskId,
        itemId: null,
        date: null,
        comments: intent.comments ?? null,
        campaignDraft: null,
        confidence: "high",
      };
    case "reschedule_item":
      return {
        intent: "reschedule_item",
        reply: "Vou reagendar esse item no calendário.",
        taskId: null,
        itemId: intent.itemId,
        date: intent.date,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "help":
      return {
        intent: "help",
        reply: formatHelpReply(),
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "high",
      };
    case "unknown":
    default:
      return {
        intent: "chat",
        reply:
          snapshot.pendingApprovals.length > 0
            ? `Estou acompanhando ${snapshot.pendingApprovals.length} aprovação(ões) pendente(s). Se quiser, eu posso te resumir o que está travado agora.`
            : "Estou por aqui. Posso te atualizar sobre aprovações, tarefas, calendário ou executar ações no fluxo.",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
  }
}

function parseGenerateCalendarParamsFromPlan(
  plan: Record<string, unknown>,
): GenerateCalendarParamsPayload {
  const raw = plan.generateCalendarParams ?? plan.generate_calendar_params;
  if (!raw || typeof raw !== "object") {
    return { weeksAhead: 4, postsPerWeek: 2, campaignId: null };
  }
  const o = raw as Record<string, unknown>;
  let weeksAhead =
    typeof o.weeksAhead === "number"
      ? o.weeksAhead
      : typeof o.weeks_ahead === "number"
        ? o.weeks_ahead
        : 4;
  let postsPerWeek =
    typeof o.postsPerWeek === "number"
      ? o.postsPerWeek
      : typeof o.posts_per_week === "number"
        ? o.posts_per_week
        : 2;
  weeksAhead = Math.min(Math.max(Math.floor(weeksAhead), 1), 12);
  postsPerWeek = Math.min(Math.max(Math.floor(postsPerWeek), 1), 7);
  let campaignId: string | null = null;
  if (typeof o.campaignId === "string") campaignId = o.campaignId.trim() || null;
  else if (typeof o.campaign_id === "string") campaignId = o.campaign_id.trim() || null;
  return { weeksAhead, postsPerWeek, campaignId };
}

function parseCreateTaskParamsFromPlan(plan: Record<string, unknown>): CreateTaskParamsPayload | null {
  const raw = plan.createTaskParams ?? plan.create_task_params;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  const campaignId =
    typeof o.campaignId === "string"
      ? o.campaignId.trim() || null
      : typeof o.campaign_id === "string"
        ? o.campaign_id.trim() || null
        : null;
  const tp = o.triggerPipeline ?? o.trigger_pipeline;
  const triggerPipeline = typeof tp === "boolean" ? tp : false;
  return { title, campaignId, triggerPipeline };
}

function resolveCampaignIdForLifecycle(
  snapshot: ChiefAgentSnapshot,
  raw: string | null | undefined,
): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (/^[a-f0-9-]{36}$/i.test(t)) {
    return snapshot.recentCampaigns.some((c) => c.id === t) ? t : null;
  }
  const lower = t.toLowerCase();
  const match = snapshot.recentCampaigns.find(
    (c) => c.name.toLowerCase() === lower || c.name.toLowerCase().includes(lower),
  );
  return match?.id ?? null;
}

function parseCampaignDraftFromPlan(
  plan: Partial<ChiefAgentPlan> & Record<string, unknown>,
): CampaignDraftPayload | null {
  const raw = plan.campaignDraft ?? plan.campaign_draft;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;

  const channelsAcc: Array<"instagram" | "linkedin"> = [];
  if (Array.isArray(o.channels)) {
    for (const c of o.channels) {
      if (c === "instagram" || c === "linkedin") {
        channelsAcc.push(c);
        continue;
      }
      if (typeof c === "string") {
        const x = c.toLowerCase();
        if (x.includes("insta") || x === "ig") channelsAcc.push("instagram");
        if (x.includes("linked")) channelsAcc.push("linkedin");
      }
    }
  }
  const channels =
    [...new Set(channelsAcc)].length > 0
      ? [...new Set(channelsAcc)]
      : (["instagram", "linkedin"] as const);

  let slotCount = 4;
  const sc = o.slotCount ?? o.slot_count;
  if (typeof sc === "number" && Number.isFinite(sc)) {
    slotCount = sc;
  }
  slotCount = Math.min(Math.max(Math.floor(slotCount), 2), 16);

  const autoStartTasksRaw = o.autoStartTasks ?? o.auto_start_tasks;
  const autoStartTasks =
    typeof autoStartTasksRaw === "boolean" ? autoStartTasksRaw : true;

  let autoStartCount = 2;
  const asc = o.autoStartCount ?? o.auto_start_count;
  if (typeof asc === "number" && Number.isFinite(asc)) {
    autoStartCount = asc;
  }
  autoStartCount = Math.min(Math.max(Math.floor(autoStartCount), 0), 4);

  const objective =
    typeof o.objective === "string" ? (o.objective.trim() || null) : null;

  return {
    name,
    objective,
    channels: channels as Array<"instagram" | "linkedin">,
    slotCount,
    autoStartTasks,
    autoStartCount,
  };
}

/** Exposto para testes — valida JSON do modelo + snapshot. */
export function normalizeChiefAgentPlan(
  plan: Record<string, unknown>,
  snapshot: ChiefAgentSnapshot,
  fallback: ChiefAgentPlan,
): ChiefAgentPlan {
  const allowedIntents: ChiefAgentPlanIntent[] = [
    "chat",
    "pending_approvals",
    "task_status",
    "campaign_status",
    "upcoming_posts",
    "approve_task",
    "reject_task",
    "cancel_task",
    "reschedule_item",
    "create_campaign",
    "generate_calendar",
    "start_task",
    "create_task",
    "pause_campaign",
    "resume_campaign",
    "task_detail",
    "help",
    "ignore",
  ];

  const intent = allowedIntents.includes(plan.intent as ChiefAgentPlanIntent)
    ? (plan.intent as ChiefAgentPlanIntent)
    : fallback.intent;

  const confidence =
    plan.confidence === "high" || plan.confidence === "medium" || plan.confidence === "low"
      ? plan.confidence
      : fallback.confidence;

  const rawTaskId = typeof plan.taskId === "string" ? plan.taskId.trim() : null;
  const rawItemId = typeof plan.itemId === "string" ? plan.itemId.trim() : null;
  const date = typeof plan.date === "string" ? plan.date.trim() : null;
  const comments = typeof plan.comments === "string" ? plan.comments.trim() : null;
  const reply =
    typeof plan.reply === "string" && plan.reply.trim().length > 0
      ? plan.reply.trim()
      : fallback.reply;

  const campaignDraft = parseCampaignDraftFromPlan(plan);
  const generateCalParams = parseGenerateCalendarParamsFromPlan(plan);
  const rawTarget =
    (typeof plan.targetCampaignId === "string" ? plan.targetCampaignId : null) ??
    (typeof plan.target_campaign_id === "string" ? plan.target_campaign_id : null);
  const lifecycleCampaignId = resolveCampaignIdForLifecycle(snapshot, rawTarget);

  const stpRaw = plan.startTaskTriggerPipeline ?? plan.start_task_trigger_pipeline;
  const startTaskTriggerPipeline =
    typeof stpRaw === "boolean" ? stpRaw : null;

  if (intent === "approve_task" || intent === "reject_task" || intent === "cancel_task") {
    const taskId = rawTaskId;
    if (!taskId || !snapshot.pendingApprovals.some((approval) => approval.taskId === taskId)) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Consigo aprovar, reprovar ou cancelar o fluxo quando houver aprovação pendente e você citar a task certa (veja a lista de pendências).",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId,
      itemId: null,
      date: null,
      comments,
      campaignDraft: null,
      confidence,
    };
  }

  if (intent === "reschedule_item") {
    const validDate = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
    const itemId = rawItemId;
    if (!itemId || !validDate) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Para reagendar eu preciso do item e da nova data no formato YYYY-MM-DD. Se quiser, eu também posso listar as próximas postagens.",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId: null,
      itemId,
      date,
      comments,
      campaignDraft: null,
      confidence,
    };
  }

  if (intent === "create_campaign") {
    if (!campaignDraft) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Entendi que você quer uma campanha nova, mas faltou tema/nome ou canais claros. Exemplo: «Crie campanha de soja para a Kolmena no Instagram e LinkedIn».",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft,
      confidence,
    };
  }

  if (intent === "generate_calendar") {
    return {
      intent,
      reply,
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      generateCalendarParams: generateCalParams,
      confidence,
    };
  }

  if (intent === "start_task") {
    const itemId = rawItemId;
    if (!itemId || !/^[a-f0-9-]{36}$/i.test(itemId)) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Para iniciar a produção preciso do ID do item do calendário (veja em «próximas postagens» no snapshot). Ex.: copie o id do slot em upcomingPosts.",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId: null,
      itemId,
      date: null,
      comments: null,
      campaignDraft: null,
      startTaskTriggerPipeline: startTaskTriggerPipeline ?? true,
      confidence,
    };
  }

  if (intent === "create_task") {
    const createTParams = parseCreateTaskParamsFromPlan(plan);
    if (!createTParams) {
      return {
        ...fallback,
        intent: "chat",
        reply: "Para criar a tarefa preciso de um título claro na mensagem.",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      createTaskParams: createTParams,
      confidence,
    };
  }

  if (intent === "pause_campaign" || intent === "resume_campaign") {
    if (!lifecycleCampaignId) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Não identifiquei a campanha. Use o ID listado em recentCampaigns ou o nome exatamente como no painel.",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId: null,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      targetCampaignId: lifecycleCampaignId,
      confidence,
    };
  }

  if (intent === "task_detail") {
    const taskId = rawTaskId;
    if (!taskId || !/^[a-f0-9-]{36}$/i.test(taskId)) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Para detalhar uma tarefa, envie o ID (UUID) da content task — aparece no resumo de tarefas com «id …».",
        taskId: null,
        itemId: null,
        date: null,
        comments: null,
        campaignDraft: null,
        confidence: "low",
      };
    }
    return {
      intent,
      reply,
      taskId,
      itemId: null,
      date: null,
      comments: null,
      campaignDraft: null,
      confidence,
    };
  }

  return {
    intent,
    reply,
    taskId: rawTaskId,
    itemId: rawItemId,
    date,
    comments,
    campaignDraft: null,
    confidence,
  };
}

function chiefAddDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function chiefToDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Cria campanha, slots no calendário e opcionalmente dispara o pipeline Trigger nas primeiras peças.
 */
export async function executeCreateCampaignFromChief(
  supabase: Queryable,
  workspaceId: string,
  draft: CampaignDraftPayload,
): Promise<string> {
  const name = draft.name.trim();
  if (!name) {
    return "Não consegui criar a campanha: nome vazio.";
  }

  const { data: brandRow } = await supabase
    .from("brands")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (!brandRow?.id) {
    return "Não encontrei marca neste workspace — conclua o onboarding antes de criar campanhas pelo chat.";
  }

  const { data: campaignRow, error: cErr } = await supabase
    .from("campaigns")
    .insert({
      brand_id: brandRow.id,
      name,
      objective: draft.objective?.trim() || null,
      status: "active",
    })
    .select("id")
    .single();

  if (cErr || !campaignRow) {
    return `Não consegui salvar a campanha agora: ${cErr?.message ?? "erro desconhecido"}.`;
  }

  const campaignId = campaignRow.id as string;

  const rawCh = (draft.channels ?? []).filter(
    (c) => c === "instagram" || c === "linkedin",
  );
  const channels =
    rawCh.length > 0
      ? [...new Set(rawCh)]
      : (["instagram", "linkedin"] as const);

  const slotCount = draft.slotCount;
  const start = chiefAddDays(new Date(), 1);

  const rows: Array<Record<string, unknown>> = [];
  const slotTitles: string[] = [];

  for (let i = 0; i < slotCount; i += 1) {
    const ch = channels[i % channels.length] as string;
    const plannedDate = chiefToDateOnly(chiefAddDays(start, i * 3));
    const label = ch === "linkedin" ? "LinkedIn" : "Instagram";
    const title = `${name} — ${label} — ${i + 1}`;
    slotTitles.push(title);
    rows.push({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      planned_date: plannedDate,
      channel_type: ch,
      format_type: "social_post",
      objective_type: "awareness",
      topic: title,
      topic_title: title,
      topic_brief:
        draft.objective?.trim() ||
        `Campanha «${name}». Peça ${i + 1} para ${label}, alinhada ao pedido no Google Chat.`,
      status: "planned",
    });
  }

  const { data: insertedItems, error: calErr } = await supabase
    .from("calendar_items")
    .insert(rows)
    .select("id");

  if (calErr || !insertedItems?.length) {
    return `Campanha criada (${name}), mas falhou ao montar o calendário: ${calErr?.message ?? "sem linhas retornadas"}.`;
  }

  const autoStart = draft.autoStartTasks !== false;
  const startN = Math.min(
    draft.autoStartCount,
    insertedItems.length,
  );

  const triggered: string[] = [];
  const hasTrigger = Boolean(process.env.TRIGGER_SECRET_KEY?.trim());

  if (autoStart && startN > 0 && hasTrigger) {
    for (let i = 0; i < startN; i += 1) {
      const itemId = insertedItems[i]?.id as string | undefined;
      const taskTitle = slotTitles[i] ?? `${name} — ${i + 1}`;
      if (!itemId) continue;

      const { data: task, error: tErr } = await supabase
        .from("content_tasks")
        .insert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          calendar_item_id: itemId,
          title: taskTitle,
          status: "draft",
          current_stage: "briefing",
          requested_by: null,
        })
        .select("id")
        .single();

      if (tErr || !task) continue;

      await supabase
        .from("calendar_items")
        .update({
          content_task_id: task.id,
          status: "awaiting_approval",
        })
        .eq("id", itemId);

      try {
        await tasks.trigger("content-pipeline", { taskId: task.id });
        triggered.push(task.id);
      } catch {
        /* falha isolada: campanha + calendário já existem */
      }
    }
  }

  let pipelineNote = "";
  if (autoStart && startN > 0 && !hasTrigger) {
    pipelineNote =
      "\n\nConfigure TRIGGER_SECRET_KEY no deploy para eu disparar o pipeline automaticamente; os slots já estão no calendário para iniciar manualmente.";
  } else if (autoStart && startN > 0 && triggered.length > 0) {
    pipelineNote = `\n\nDisparei o pipeline em ${triggered.length} tarefa(s): ${triggered.join(", ")}. Avisos de aprovação seguem o fluxo normal (e-mail/Google Chat se configurado).`;
  } else if (autoStart && startN > 0 && triggered.length === 0) {
    pipelineNote =
      "\n\nTentei iniciar tarefas no pipeline, mas houve falha ao criar as linhas — confira no painel em Conteúdo / Calendário.";
  }

  const chLabel = channels.join(" e ");
  return (
    `Campanha «${name}» criada (id ${campaignId}). ` +
      `${insertedItems.length} post(s) no calendário (${chLabel}).` +
      pipelineNote
  );
}

export async function executeGenerateCalendarFromChief(
  supabase: Queryable,
  workspaceId: string,
  params: GenerateCalendarParamsPayload,
): Promise<string> {
  const result = await generateCalendarSuggestionsCore(supabase, {
    workspaceId,
    weeksAhead: params.weeksAhead,
    postsPerWeek: params.postsPerWeek,
    campaignId: params.campaignId,
  });
  if ("error" in result) {
    return `Não consegui gerar o calendário: ${result.error}`;
  }
  if (result.created === 0) {
    return "Nenhum slot novo foi criado (datas já ocupadas ou nada a adicionar).";
  }
  return `Gerei ${result.created} sugestão(ões) no calendário editorial. Confira no painel ou peça as próximas postagens aqui.`;
}

export async function executeStartTaskFromChief(
  supabase: Queryable,
  workspaceId: string,
  calendarItemId: string,
  triggerPipeline: boolean,
): Promise<string> {
  const result = await createTaskFromCalendarItemCore(supabase, {
    workspaceId,
    calendarItemId,
    requestedByUserId: null,
  });
  if ("error" in result) {
    return result.error;
  }
  if (result.alreadyLinked) {
    return `Esse slot já está ligado à tarefa ${result.taskId}.`;
  }
  const hasTrigger = Boolean(process.env.TRIGGER_SECRET_KEY?.trim());
  if (triggerPipeline && hasTrigger) {
    try {
      await tasks.trigger("content-pipeline", { taskId: result.taskId });
      return `Tarefa ${result.taskId} criada a partir do calendário e o pipeline de conteúdo foi iniciado.`;
    } catch (e) {
      return `Tarefa ${result.taskId} criada, mas falhou ao disparar o pipeline: ${e instanceof Error ? e.message : "erro"}.`;
    }
  }
  if (triggerPipeline && !hasTrigger) {
    return `Tarefa ${result.taskId} criada. Configure TRIGGER_SECRET_KEY no servidor para eu disparar o pipeline automaticamente.`;
  }
  return `Tarefa ${result.taskId} criada (pipeline não disparado — use «disparar» se precisar).`;
}

export async function executeCreateTaskFromChief(
  supabase: Queryable,
  workspaceId: string,
  params: CreateTaskParamsPayload,
): Promise<string> {
  const result = await createContentTaskCore(supabase, {
    workspaceId,
    title: params.title,
    campaignId: params.campaignId ?? null,
    requestedByUserId: null,
  });
  if ("error" in result) {
    return result.error;
  }
  const hasTrigger = Boolean(process.env.TRIGGER_SECRET_KEY?.trim());
  if (params.triggerPipeline && hasTrigger) {
    try {
      await tasks.trigger("content-pipeline", { taskId: result.taskId });
      return `Tarefa ${result.taskId} criada e pipeline iniciado.`;
    } catch (e) {
      return `Tarefa ${result.taskId} criada; falha ao iniciar pipeline: ${e instanceof Error ? e.message : "erro"}.`;
    }
  }
  if (params.triggerPipeline && !hasTrigger) {
    return `Tarefa ${result.taskId} criada. Configure TRIGGER_SECRET_KEY para disparar o pipeline pelo chat.`;
  }
  return `Tarefa ${result.taskId} criada (rascunho). Peça para iniciar o pipeline quando quiser.`;
}

export async function executeCampaignLifecycleFromChief(
  supabase: Queryable,
  workspaceId: string,
  campaignId: string,
  action: "pause" | "resume",
): Promise<string> {
  const { data: brands } = await supabase
    .from("brands")
    .select("id")
    .eq("workspace_id", workspaceId);
  const brandIds = (brands ?? []).map((b: { id: string }) => b.id);
  if (brandIds.length === 0) {
    return "Workspace sem marca — não consigo alterar campanhas.";
  }

  const { data: row } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("id", campaignId)
    .in("brand_id", brandIds)
    .maybeSingle();

  if (!row) {
    return "Campanha não encontrada neste workspace.";
  }

  const nextStatus = action === "pause" ? "paused" : "active";
  const { error } = await supabase
    .from("campaigns")
    .update({ status: nextStatus })
    .eq("id", campaignId);

  if (error) {
    return `Não consegui atualizar a campanha: ${error.message}`;
  }

  return action === "pause"
    ? `Campanha «${row.name}» pausada.`
    : `Campanha «${row.name}» retomada (ativa).`;
}

export async function formatTaskDetailReplyFromChief(
  supabase: Queryable,
  workspaceId: string,
  taskId: string,
): Promise<string> {
  const { data: task } = await supabase
    .from("content_tasks")
    .select("id, title, status, current_stage, updated_at, campaign_id")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!task) {
    return "Não encontrei essa tarefa neste workspace.";
  }

  const { data: pending } = await supabase
    .from("approvals")
    .select("approval_type, status, created_at")
    .eq("task_id", taskId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const initialUrl = appUrl ? `${appUrl}/approvals/${taskId}/initial` : null;
  const finalUrl = appUrl ? `${appUrl}/approvals/${taskId}/final` : null;

  const pendLines =
    (pending ?? []).length > 0
      ? (pending ?? [])
          .map(
            (p: { approval_type: string; status: string }) =>
              `• ${p.approval_type} (${p.status})`,
          )
          .join("\n")
      : "• nenhuma aprovação pendente registrada";

  return [
    `Tarefa: ${task.title}`,
    `id: ${task.id}`,
    `status: ${task.status}${task.current_stage ? ` — etapa ${task.current_stage}` : ""}`,
    `atualizado: ${task.updated_at}`,
    "",
    "Aprovações pendentes:",
    pendLines,
    "",
    initialUrl ? `Aprovação inicial: ${initialUrl}` : "",
    finalUrl ? `Aprovação final: ${finalUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function matchesGoogleChatSpace(
  config: Record<string, unknown> | null | undefined,
  spaceName: string | undefined,
  spaceDisplayName: string | undefined,
) {
  if (!config) return false;

  const configuredSpaceName = readConfigString(config, "space_name");
  const configuredSpaceDisplayName = readConfigString(config, "space_display_name");

  if (spaceName && configuredSpaceName && spaceName === configuredSpaceName) {
    return true;
  }

  if (
    spaceDisplayName &&
    configuredSpaceDisplayName &&
    spaceDisplayName.toLowerCase() === configuredSpaceDisplayName.toLowerCase()
  ) {
    return true;
  }

  return false;
}

function readConfigString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stripGoogleChatMentions(raw: string) {
  return raw
    .replace(/<users\/[^>]+>/g, "")
    .replace(/<space\/[^>]+>/g, "")
    .trim();
}

/** Resolve o tipo de interação (MESSAGE, ADDED_TO_SPACE, etc.). */
export function resolveGoogleChatEventType(
  payload: GoogleChatEventPayload,
): string | undefined {
  return payload.type ?? payload.eventType ?? (payload.message ? "MESSAGE" : undefined);
}

/** Texto enviado pelo usuário no Google Chat (menções removidas quando necessário). */
export function extractIncomingText(payload: GoogleChatEventPayload) {
  const arg = payload.message?.argumentText?.trim();
  if (arg) return arg;

  const text = payload.message?.text?.trim();
  if (text) return stripGoogleChatMentions(text);

  const formatted = payload.message?.formattedText?.trim();
  if (formatted) return stripGoogleChatMentions(formatted);

  const fallback = payload.message?.fallbackText?.trim();
  if (fallback) return stripGoogleChatMentions(fallback);

  return "";
}
