import { classifyChiefIntent } from "@/lib/chief-agent/intent";

export type GoogleChatEventPayload = {
  type?: string;
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
    argumentText?: string;
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

type ConversationRow = {
  message_text: string;
  intent: string | null;
  response_summary: string | null;
  created_at: string;
};

type Queryable = {
  from: (table: string) => any;
};

export type ChiefAgentPlanIntent =
  | "chat"
  | "pending_approvals"
  | "task_status"
  | "upcoming_posts"
  | "approve_task"
  | "reject_task"
  | "reschedule_item"
  | "help"
  | "ignore";

export type ChiefAgentPlan = {
  intent: ChiefAgentPlanIntent;
  reply: string;
  taskId: string | null;
  itemId: string | null;
  date: string | null;
  comments: string | null;
  confidence: "high" | "medium" | "low";
};

export type ChiefAgentSnapshot = {
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    currentStage: string | null;
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
  const { data: tasksData } = await supabase
    .from("content_tasks")
    .select("id, title, status, current_stage, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  const tasks = (tasksData ?? []) as TaskRow[];
  const taskIds = tasks.map((task) => task.id);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

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

  const today = new Date().toISOString().slice(0, 10);
  const { data: calendarData } = await supabase
    .from("calendar_items")
    .select("id, planned_date, topic_title, topic, status, content_task_id")
    .eq("workspace_id", workspaceId)
    .gte("planned_date", today)
    .order("planned_date", { ascending: true })
    .limit(12);

  const calendarItems = (calendarData ?? []) as CalendarRow[];

  return {
    recentTasks: tasks.slice(0, 8).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      currentStage: task.current_stage,
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
  if (fallback.intent !== "chat" || fallback.confidence !== "low") {
    return fallback;
  }
  const key = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    return fallback;
  }

  const prompt = [
    "Você é o Agente Chefe do AgentBee, atuando em um grupo interno do Google Chat.",
    "Fale sempre em português do Brasil, em tom humano, objetivo, cordial e operacional.",
    "Você pode conversar naturalmente, responder dúvidas do time e executar ações operacionais quando a instrução estiver clara.",
    "Ações permitidas: listar aprovações pendentes, resumir status de tarefas, listar próximas postagens, aprovar task, reprovar task, reagendar item do calendário.",
    "Só escolha aprovar/reprovar/reagendar quando o pedido estiver explícito e o alvo estiver claro nos dados.",
    "Nunca invente IDs, datas, aprovações, tarefas ou status.",
    "Se faltar contexto para agir, responda pedindo confirmação ou esclarecimento.",
    "Se a mensagem for apenas social ou aberta, responda como um gerente operacional útil usando os dados fornecidos.",
    "Retorne somente JSON válido.",
  ].join(" ");

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
            instructions: {
              response_shape: {
                intent:
                  "chat | pending_approvals | task_status | upcoming_posts | approve_task | reject_task | reschedule_item | help | ignore",
                reply: "string",
                taskId: "string|null",
                itemId: "string|null",
                date: "YYYY-MM-DD|null",
                comments: "string|null",
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

    const parsed = JSON.parse(content) as Partial<ChiefAgentPlan>;
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

  const lines = snapshot.recentTasks.map(
    (task) =>
      `• ${task.title} — status ${task.status}${task.currentStage ? ` — etapa ${task.currentStage}` : ""}`,
  );

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
    .map((item) => `• ${item.plannedDate} — ${item.title} (${item.status})`)
    .join("\n")}`;
}

export function formatHelpReply() {
  return [
    "Posso agir como chefe operacional aqui no grupo.",
    "Exemplos do que você pode me pedir:",
    "• o que está pendente hoje?",
    "• me dá um status das tarefas",
    "• quais são as próximas postagens?",
    "• aprova a task <id>",
    "• reprova a task <id> porque o CTA está fraco",
    "• reagenda o item <id> para 2026-04-20",
  ].join("\n");
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
      confidence: "medium",
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
        confidence: "low",
      };
  }
}

function normalizeChiefAgentPlan(
  plan: Partial<ChiefAgentPlan>,
  snapshot: ChiefAgentSnapshot,
  fallback: ChiefAgentPlan,
): ChiefAgentPlan {
  const allowedIntents: ChiefAgentPlanIntent[] = [
    "chat",
    "pending_approvals",
    "task_status",
    "upcoming_posts",
    "approve_task",
    "reject_task",
    "reschedule_item",
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

  const taskId = typeof plan.taskId === "string" ? plan.taskId.trim() : null;
  const itemId = typeof plan.itemId === "string" ? plan.itemId.trim() : null;
  const date = typeof plan.date === "string" ? plan.date.trim() : null;
  const comments = typeof plan.comments === "string" ? plan.comments.trim() : null;
  const reply =
    typeof plan.reply === "string" && plan.reply.trim().length > 0
      ? plan.reply.trim()
      : fallback.reply;

  if (intent === "approve_task" || intent === "reject_task") {
    if (!taskId || !snapshot.pendingApprovals.some((approval) => approval.taskId === taskId)) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Consigo aprovar ou reprovar por aqui, mas preciso que você cite a task certa. Se quiser, eu te mando a lista das aprovações pendentes.",
        taskId: null,
        confidence: "low",
      };
    }
  }

  if (intent === "reschedule_item") {
    const validDate = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
    if (!itemId || !validDate) {
      return {
        ...fallback,
        intent: "chat",
        reply:
          "Para reagendar eu preciso do item e da nova data no formato YYYY-MM-DD. Se quiser, eu também posso listar as próximas postagens.",
        itemId: null,
        date: null,
        confidence: "low",
      };
    }
  }

  return {
    intent,
    reply,
    taskId,
    itemId,
    date,
    comments,
    confidence,
  };
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
