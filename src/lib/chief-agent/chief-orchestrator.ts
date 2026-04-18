import { tasks } from "@trigger.dev/sdk/v3";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  formatCampaignStatusReply,
  formatPendingApprovalsReply,
  formatTaskDetailReplyFromChief,
  formatTaskStatusReply,
  formatUpcomingPostsReply,
  loadChiefAgentSnapshot,
  normalizeChiefAgentPlan,
  planChiefAgentResponse,
  type CampaignDraftPayload,
  type ChiefAgentPlan,
  type ChiefAgentSnapshot,
  type ConversationTurn,
  type GenerateCalendarParamsPayload,
} from "@/lib/chief-agent/agent";
import { executeChiefAgentPlan, type ServiceSupabase } from "@/lib/chief-agent/chief-google-chat-execution";

/** Ferramentas só-leitura: podem rodar em paralelo na mesma rodada do modelo. */
const CHIEF_READ_ONLY_TOOLS = new Set([
  "chief_refresh_snapshot",
  "chief_list_pending_approvals",
  "chief_list_task_status",
  "chief_list_campaigns",
  "chief_list_upcoming_posts",
  "chief_get_task_detail",
  "chief_explain",
  "chief_list_failures",
  "chief_focus",
]);

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

const CHIEF_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "chief_refresh_snapshot",
      description:
        "Recarrega o estado operacional do workspace (tarefas, aprovações, calendário, campanhas). Use quando precisar de dados atualizados após outra ação.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_list_pending_approvals",
      description: "Lista aprovações pendentes com IDs de task.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_list_task_status",
      description: "Resumo das tarefas recentes e itens bloqueados.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_list_campaigns",
      description: "Lista campanhas do workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_list_upcoming_posts",
      description: "Próximas postagens no calendário editorial.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_get_task_detail",
      description: "Detalhes de uma content task por UUID.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string", description: "UUID da content_tasks" } },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_approve_task",
      description: "Aprova a pendência atual da task (retoma o pipeline Trigger).",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          comments: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_reject_task",
      description: "Reprova / pede revisão na aprovação atual.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          comments: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_cancel_task_flow",
      description: "Cancela o fluxo no ponto de espera do Trigger (equivalente a Cancelar no painel).",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          comments: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_reschedule_calendar",
      description: "Reagenda um item do calendário.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          new_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["item_id", "new_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_create_campaign",
      description:
        "Cria campanha, slots no calendário e opcionalmente dispara pipelines. Use para operações imediatas; para muitas tarefas em paralelo prefira chief_defer_heavy_operation.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          objective: { type: "string" },
          channels: {
            type: "array",
            items: { type: "string", enum: ["instagram", "linkedin"] },
          },
          slot_count: { type: "integer", description: "2 a 16" },
          auto_start_tasks: { type: "boolean" },
          auto_start_count: { type: "integer", description: "0 a 4" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_generate_calendar",
      description: "Gera sugestões de slots no calendário editorial.",
      parameters: {
        type: "object",
        properties: {
          weeks_ahead: { type: "integer" },
          posts_per_week: { type: "integer" },
          campaign_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_create_task",
      description: "Cria tarefa de conteúdo avulsa.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          campaign_id: { type: "string" },
          trigger_pipeline: { type: "boolean" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_start_task_from_calendar",
      description: "Cria task a partir de um calendar_items e opcionalmente dispara pipeline.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          trigger_pipeline: { type: "boolean" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_pause_campaign",
      description: "Pausa campanha por UUID (ou nome reconhecido no snapshot).",
      parameters: {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_resume_campaign",
      description: "Reativa campanha por UUID (ou nome reconhecido no snapshot).",
      parameters: {
        type: "object",
        properties: { campaign_id: { type: "string" } },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_defer_heavy_operation",
      description:
        "Enfileira criação de campanha ou geração grande de calendário em background; o usuário recebe mensagem no Google Chat ao terminar.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["create_campaign", "generate_calendar"] },
          campaign: {
            type: "object",
            description: "Para create_campaign",
            properties: {
              name: { type: "string" },
              objective: { type: "string" },
              channels: { type: "array", items: { type: "string" } },
              slot_count: { type: "integer" },
              auto_start_tasks: { type: "boolean" },
              auto_start_count: { type: "integer" },
            },
          },
          calendar: {
            type: "object",
            description: "Para generate_calendar",
            properties: {
              weeks_ahead: { type: "integer" },
              posts_per_week: { type: "integer" },
              campaign_id: { type: "string" },
            },
          },
        },
               required: ["operation"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_preview_post",
      description:
        "Envia um card no Google Chat com preview da copy e da arte (se existir) para uma content task.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_explain",
      description:
        "Explica um tópico usando o playbook e o snapshot (sem SQL livre).",
      parameters: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_list_failures",
      description: "Lista publicações com falha e agent_runs com erro nas últimas horas.",
      parameters: {
        type: "object",
        properties: { since_hours: { type: "integer", description: "1 a 168, default 48" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_retry_publication",
      description: "Reenfileira uma publicação falha (dispara publish-social).",
      parameters: {
        type: "object",
        properties: { publication_id: { type: "string" } },
        required: ["publication_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "chief_focus",
      description:
        "Retorna detalhe expandido de uma task e/ou campanha para fixar contexto na conversa.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          campaign_id: { type: "string" },
        },
      },
    },
  },
];

type OrchestratorCtx = {
  supabase: ServiceSupabase;
  workspaceId: string;
  googleChatWebhook: string | null;
};

let snapshotCache: ChiefAgentSnapshot | null = null;

const CHIEF_TOOL_PLAN_FALLBACK: ChiefAgentPlan = {
  intent: "chat",
  reply: "Não consegui validar essa ação com os dados atuais.",
  taskId: null,
  itemId: null,
  date: null,
  comments: null,
  campaignDraft: null,
  publicationId: null,
  explainTopic: null,
  failuresSinceHours: null,
  focusTaskId: null,
  focusCampaignId: null,
  confidence: "low",
};

async function runNormalizedPlan(
  ctx: OrchestratorCtx,
  snapshot: ChiefAgentSnapshot,
  raw: Record<string, unknown>,
) {
  const plan = normalizeChiefAgentPlan(raw, snapshot, CHIEF_TOOL_PLAN_FALLBACK);
  return executeChiefAgentPlan({
    supabase: ctx.supabase,
    workspaceId: ctx.workspaceId,
    plan,
    snapshot,
  });
}

async function executeChiefTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: OrchestratorCtx,
): Promise<string> {
  const snapshot = snapshotCache ?? (await loadChiefAgentSnapshot(ctx.supabase, ctx.workspaceId));
  snapshotCache = snapshot;

  try {
    switch (name) {
      case "chief_refresh_snapshot": {
        snapshotCache = await loadChiefAgentSnapshot(ctx.supabase, ctx.workspaceId);
        return JSON.stringify(snapshotCache, null, 0).slice(0, chiefSnapshotJsonChars());
      }
      case "chief_list_pending_approvals":
        return formatPendingApprovalsReply(snapshot);
      case "chief_list_task_status":
        return formatTaskStatusReply(snapshot);
      case "chief_list_campaigns":
        return formatCampaignStatusReply(snapshot);
      case "chief_list_upcoming_posts":
        return formatUpcomingPostsReply(snapshot);
      case "chief_get_task_detail": {
        const taskId = String(rawArgs.task_id ?? "").trim();
        if (!taskId) return JSON.stringify({ error: "task_id obrigatório" });
        return await formatTaskDetailReplyFromChief(ctx.supabase, ctx.workspaceId, taskId);
      }
      case "chief_approve_task":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "approve_task",
          reply: "Ok.",
          taskId: String(rawArgs.task_id ?? "").trim() || null,
          comments: rawArgs.comments != null ? String(rawArgs.comments) : null,
          confidence: "high",
        });
      case "chief_reject_task":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "reject_task",
          reply: "Registrando reprovação.",
          taskId: String(rawArgs.task_id ?? "").trim() || null,
          comments: rawArgs.comments != null ? String(rawArgs.comments) : null,
          confidence: "high",
        });
      case "chief_cancel_task_flow":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "cancel_task",
          reply: "Cancelando fluxo.",
          taskId: String(rawArgs.task_id ?? "").trim() || null,
          comments: rawArgs.comments != null ? String(rawArgs.comments) : null,
          confidence: "high",
        });
      case "chief_reschedule_calendar":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "reschedule_item",
          reply: "Reagendando.",
          itemId: String(rawArgs.item_id ?? "").trim() || null,
          date: String(rawArgs.new_date ?? "").trim() || null,
          confidence: "high",
        });
      case "chief_create_campaign": {
        const draft: CampaignDraftPayload = {
          name: String(rawArgs.name ?? "").trim(),
          objective: rawArgs.objective != null ? String(rawArgs.objective).trim() || null : null,
          channels: normalizeChannels(rawArgs.channels),
          slotCount: clampInt(rawArgs.slot_count, 4, 2, 16),
          autoStartTasks: rawArgs.auto_start_tasks !== false,
          autoStartCount: clampInt(rawArgs.auto_start_count, 2, 0, 4),
        };
        if (!draft.name) return JSON.stringify({ error: "name obrigatório" });
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "create_campaign",
          reply: "Criando campanha.",
          campaignDraft: draft,
          confidence: "high",
        });
      }
      case "chief_generate_calendar": {
        const params: GenerateCalendarParamsPayload = {
          weeksAhead: clampInt(rawArgs.weeks_ahead, 4, 1, 12),
          postsPerWeek: clampInt(rawArgs.posts_per_week, 2, 1, 7),
          campaignId:
            typeof rawArgs.campaign_id === "string" && rawArgs.campaign_id.trim()
              ? rawArgs.campaign_id.trim()
              : null,
        };
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "generate_calendar",
          reply: "Gerando calendário.",
          generateCalendarParams: params,
          confidence: "high",
        });
      }
      case "chief_create_task":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "create_task",
          reply: "Criando tarefa.",
          createTaskParams: {
            title: String(rawArgs.title ?? "").trim(),
            campaignId:
              typeof rawArgs.campaign_id === "string" && rawArgs.campaign_id.trim()
                ? rawArgs.campaign_id.trim()
                : null,
            triggerPipeline: rawArgs.trigger_pipeline === true,
          },
          confidence: "high",
        });
      case "chief_start_task_from_calendar":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "start_task",
          reply: "Iniciando produção.",
          itemId: String(rawArgs.item_id ?? "").trim() || null,
          startTaskTriggerPipeline: rawArgs.trigger_pipeline !== false,
          confidence: "high",
        });
      case "chief_pause_campaign":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "pause_campaign",
          reply: "Pausando campanha.",
          targetCampaignId: String(rawArgs.campaign_id ?? "").trim() || null,
          confidence: "high",
        });
      case "chief_resume_campaign":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "resume_campaign",
          reply: "Retomando campanha.",
          targetCampaignId: String(rawArgs.campaign_id ?? "").trim() || null,
          confidence: "high",
        });
      case "chief_defer_heavy_operation": {
        const op = String(rawArgs.operation ?? "");
        if (!process.env.TRIGGER_SECRET_KEY?.trim()) {
          return "TRIGGER_SECRET_KEY não configurada — não consigo processar em background.";
        }
        if (op === "create_campaign") {
          const c = rawArgs.campaign as Record<string, unknown> | undefined;
          if (!c || typeof c !== "object") {
            return JSON.stringify({ error: "campaign obrigatório" });
          }
          const draft: CampaignDraftPayload = {
            name: String(c.name ?? "").trim(),
            objective: c.objective != null ? String(c.objective).trim() || null : null,
            channels: normalizeChannels(c.channels),
            slotCount: clampInt(c.slot_count, 8, 2, 16),
            autoStartTasks: c.auto_start_tasks !== false,
            autoStartCount: clampInt(c.auto_start_count, 2, 0, 4),
          };
          if (!draft.name) return JSON.stringify({ error: "campaign.name obrigatório" });
          await tasks.trigger("chief-async-ops", {
            workspaceId: ctx.workspaceId,
            operation: "create_campaign",
            campaignDraft: draft,
            googleChatWebhook: ctx.googleChatWebhook ?? null,
            announcePrefix: "Processamento em background concluído.",
          });
          return "Enfileirei a criação da campanha. Você receberá o resultado neste espaço em instantes.";
        }
        if (op === "generate_calendar") {
          const cal = rawArgs.calendar as Record<string, unknown> | undefined;
          const params: GenerateCalendarParamsPayload = {
            weeksAhead: clampInt(cal?.weeks_ahead, 4, 1, 12),
            postsPerWeek: clampInt(cal?.posts_per_week, 2, 1, 7),
            campaignId:
              cal && typeof cal.campaign_id === "string" && cal.campaign_id.trim()
                ? cal.campaign_id.trim()
                : null,
          };
          await tasks.trigger("chief-async-ops", {
            workspaceId: ctx.workspaceId,
            operation: "generate_calendar",
            generateParams: params,
            googleChatWebhook: ctx.googleChatWebhook ?? null,
            announcePrefix: "Geração de calendário em background concluída.",
          });
          return "Enfileirei a geração de sugestões no calendário. Aviso quando terminar.";
        }
        return JSON.stringify({ error: "operation inválida" });
      }
      case "chief_preview_post":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "chief_preview_post",
          reply: "Enviando preview.",
          taskId: String(rawArgs.task_id ?? "").trim() || null,
          confidence: "high",
        });
      case "chief_explain":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "chief_explain",
          reply: "Segue explicação.",
          explainTopic: rawArgs.topic != null ? String(rawArgs.topic) : null,
          confidence: "high",
        });
      case "chief_list_failures":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "chief_list_failures",
          reply: "Falhas recentes:",
          failuresSinceHours: clampInt(rawArgs.since_hours, 48, 1, 168),
          confidence: "high",
        });
      case "chief_retry_publication":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "retry_publication",
          reply: "Reenfileirando publicação.",
          publicationId: String(rawArgs.publication_id ?? "").trim() || null,
          confidence: "high",
        });
      case "chief_focus":
        return await runNormalizedPlan(ctx, snapshot, {
          intent: "chief_focus",
          reply: "Contexto em foco:",
          focusTaskId: String(rawArgs.task_id ?? "").trim() || null,
          focusCampaignId: String(rawArgs.campaign_id ?? "").trim() || null,
          confidence: "high",
        });
      default:
        return JSON.stringify({ error: `ferramenta desconhecida: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({
      error: e instanceof Error ? e.message : "erro ao executar ferramenta",
    });
  }
}

function clampInt(v: unknown, def: number, min: number, max: number) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : def;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeChannels(raw: unknown): Array<"instagram" | "linkedin"> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ["instagram", "linkedin"];
  }
  const out: Array<"instagram" | "linkedin"> = [];
  for (const x of raw) {
    const s = String(x).toLowerCase();
    if (s === "instagram" || s === "ig") out.push("instagram");
    if (s === "linkedin" || s === "li") out.push("linkedin");
  }
  return [...new Set(out)].length > 0 ? [...new Set(out)] : ["instagram", "linkedin"];
}

function chiefToolsDisabled() {
  return process.env.CHIEF_USE_TOOLS?.trim() === "false";
}

function chiefMaxMessageChars() {
  const raw = process.env.CHIEF_MAX_MESSAGE_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10_000;
  return Number.isFinite(n) && n >= 2000 && n <= 32_000 ? n : 10_000;
}

function chiefSnapshotJsonChars() {
  const raw = process.env.CHIEF_SNAPSHOT_JSON_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 36_000;
  return Number.isFinite(n) && n >= 8000 && n <= 100_000 ? n : 36_000;
}

function chiefThreadSummaryChars() {
  const raw = process.env.CHIEF_THREAD_SUMMARY_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10_000;
  return Number.isFinite(n) && n >= 2000 && n <= 24_000 ? n : 10_000;
}

function chiefToolRoundLimit() {
  const raw = process.env.CHIEF_TOOL_ROUNDS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 12;
  return Number.isFinite(n) && n >= 3 && n <= 24 ? n : 12;
}

function trimHistoryText(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncado — aumente CHIEF_MAX_MESSAGE_CHARS se precisar do texto completo]`;
}

function buildHistoryMessages(history: ConversationTurn[]) {
  const max = chiefMaxMessageChars();
  const lines: ChatMessage[] = [];
  for (const turn of history) {
    lines.push({ role: "user", content: trimHistoryText(turn.user, max) });
    if (turn.agent) {
      lines.push({ role: "assistant", content: trimHistoryText(turn.agent, max) });
    }
  }
  return lines;
}

function parseToolArgs(tc: { function: { arguments: string } }) {
  try {
    return JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runToolCallsWithParallelReads(
  toolCalls: NonNullable<ChatMessage["tool_calls"]>,
  ctx: OrchestratorCtx,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const ordered = toolCalls.filter((tc) => tc.type === "function");
  const reads = ordered.filter((tc) => CHIEF_READ_ONLY_TOOLS.has(tc.function.name));
  const writes = ordered.filter((tc) => !CHIEF_READ_ONLY_TOOLS.has(tc.function.name));

  if (reads.length > 0) {
    const readOut = await Promise.all(
      reads.map(async (tc) => {
        const out = await executeChiefTool(tc.function.name, parseToolArgs(tc), ctx);
        return { id: tc.id, out };
      }),
    );
    for (const { id, out } of readOut) {
      results.set(id, out);
    }
  }

  for (const tc of writes) {
    const out = await executeChiefTool(tc.function.name, parseToolArgs(tc), ctx);
    results.set(tc.id, out);
  }

  return results;
}

/** Limite (ms) para responder cedo no webhook do Google Chat enquanto OpenAI/tools terminam em background. */
export function chiefGoogleChatAckDeadlineMs() {
  const raw = process.env.CHIEF_GOOGLE_CHAT_ACK_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 3000;
  return Number.isFinite(n) && n >= 500 && n <= 25_000 ? n : 3000;
}

/** Mensagem síncrona quando o turno excede o limite — o resultado completo segue via webhook do espaço. */
export function chiefGoogleChatAckMessage() {
  return "Anotado, trabalhando nisso...";
}

export async function runChiefGoogleChatTurn(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  text: string;
  userName: string | null;
  spaceDisplayName: string | null;
  externalThreadId: string | null;
  history: ConversationTurn[];
  threadSummary: string;
  openAiApiKey: string | null;
  openAiModel: string | null;
  googleChatWebhook: string | null;
}): Promise<{ reply: string; intent: string }> {
  const snapshot = await loadChiefAgentSnapshot(input.supabase, input.workspaceId);
  snapshotCache = snapshot;

  if (chiefToolsDisabled() || !input.openAiApiKey?.trim()) {
    const plan = await planChiefAgentResponse({
      text: input.text,
      userName: input.userName,
      spaceDisplayName: input.spaceDisplayName,
      snapshot,
      history: input.history,
      apiKey: input.openAiApiKey,
      model: input.openAiModel,
    });
    const reply = await executeChiefAgentPlan({
      supabase: input.supabase,
      workspaceId: input.workspaceId,
      plan,
      snapshot,
    });
    return { reply, intent: plan.intent };
  }

  const model =
    input.openAiModel ??
    process.env.OPENAI_CHIEF_MODEL ??
    process.env.OPENAI_MODEL ??
    "gpt-4o-mini";

  const sumLim = chiefThreadSummaryChars();
  const summaryBlock =
    input.threadSummary.trim().length > 0
      ? `\nResumo de contexto (thread longa — use junto com o histórico recente):\n${input.threadSummary.slice(0, sumLim)}\n`
      : "";

  const snapLim = chiefSnapshotJsonChars();
  const toneLine = snapshot.chiefPersonaTone?.trim()
    ? `Tom de voz do chefe (persona): ${snapshot.chiefPersonaTone.trim().slice(0, 500)}`
    : "";

  const systemPrompt = [
    "Você é o Agente Chefe do AgentBee no Google Chat. Português do Brasil.",
    ...(toneLine ? [toneLine] : []),
    "Use as ferramentas para dados reais e ações. Nunca invente IDs ou status.",
    "Multitarefa: se o usuário pedir várias coisas de uma vez (ex.: «status, pendências e próximas postagens»), na **mesma** resposta emita **várias** function calls — uma por necessidade — em paralelo quando forem consultas (listagens). Não responda só a primeira parte.",
    "Depois de obter resultados das ferramentas, una tudo numa resposta única, organizada (títulos curtos ou bullets).",
    "Se o pedido for apenas conversa ou dúvida geral sem dado do sistema, responda sem ferramentas.",
    "Para operações muito grandes (muitas campanhas/slots), use chief_defer_heavy_operation.",
    "Ações que alteram estado (aprovar, criar campanha, etc.) podem ir na mesma rodada que leituras, mas evite misturar duas escritas dependentes sem ver o resultado da primeira.",
    summaryBlock,
    `Snapshot inicial (pode estar desatualizado — use chief_refresh_snapshot após mudanças): ${JSON.stringify(snapshot).slice(0, snapLim)}`,
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...buildHistoryMessages(input.history),
    {
      role: "user",
      content: `Usuário: ${input.userName ?? "—"}\nEspaço: ${input.spaceDisplayName ?? "—"}\nMensagem: ${input.text}`,
    },
  ];

  const ctx: OrchestratorCtx = {
    supabase: input.supabase,
    workspaceId: input.workspaceId,
    googleChatWebhook: input.googleChatWebhook,
  };

  const maxIterations = chiefToolRoundLimit();
  let lastAssistantText: string | null = null;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        tools: CHIEF_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: true,
        temperature: 0.35,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("chief_orchestrator_openai_error", errText);
      break;
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: ChatMessage;
        finish_reason?: string;
      }>;
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) break;

    if (msg.content?.trim()) {
      lastAssistantText = msg.content.trim();
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      return {
        reply: lastAssistantText ?? "Não consegui elaborar uma resposta agora.",
        intent: "chief_tools",
      };
    }

    messages.push({
      role: "assistant",
      content: msg.content,
      tool_calls: toolCalls,
    });

    const resultById = await runToolCallsWithParallelReads(toolCalls, ctx);
    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultById.get(tc.id) ?? "",
      });
    }
  }

  if (lastAssistantText) {
    return { reply: lastAssistantText, intent: "chief_tools" };
  }

  const plan = await planChiefAgentResponse({
    text: input.text,
    userName: input.userName,
    spaceDisplayName: input.spaceDisplayName,
    snapshot: snapshotCache ?? snapshot,
    history: input.history,
    apiKey: input.openAiApiKey,
    model: input.openAiModel,
  });
  const reply = await executeChiefAgentPlan({
    supabase: input.supabase,
    workspaceId: input.workspaceId,
    plan,
    snapshot: snapshotCache ?? snapshot,
  });
  return { reply, intent: plan.intent };
}

export async function maybeSummarizeChiefThread(input: {
  supabase: ServiceSupabase;
  workspaceId: string;
  externalThreadId: string | null;
  history: ConversationTurn[];
  apiKey: string | null;
  model: string | null;
}) {
  const minTurns = Number.parseInt(process.env.CHIEF_SUMMARY_MIN_TURNS?.trim() ?? "8", 10);
  const threshold = Number.isFinite(minTurns) && minTurns >= 4 ? minTurns : 8;
  if (!input.apiKey?.trim() || input.history.length < threshold) return;

  const model =
    input.model ?? process.env.OPENAI_CHIEF_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const transcript = input.history
    .slice(-36)
    .map((t) => `U: ${t.user}\nA: ${t.agent ?? "—"}`)
    .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `Resuma o fio operacional abaixo em até 18 linhas curtas: decisões, IDs (UUID) citados, pendências, campanhas e próximos passos. Português BR. Preserve nomes próprios e números de task.\n\n${transcript.slice(0, 28_000)}`,
          },
        ],
        temperature: 0.25,
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) return;
    await upsertChiefThreadSummaryFromModule(input.supabase, input.workspaceId, input.externalThreadId, summary);
  } catch {
    /* ignore */
  }
}

async function upsertChiefThreadSummaryFromModule(
  supabase: ServiceSupabase,
  workspaceId: string,
  externalThreadId: string | null,
  summaryText: string,
) {
  const threadKey = externalThreadId ?? "";
  await supabase.from("chief_thread_summaries").upsert(
    {
      workspace_id: workspaceId,
      external_channel: "google_chat",
      external_thread_id: threadKey,
      summary_text: summaryText.slice(0, 20_000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,external_channel,external_thread_id" },
  );
}
