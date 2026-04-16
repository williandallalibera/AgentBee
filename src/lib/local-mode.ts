export const localUser = {
  id: "local-user",
  email: "local@agentbee.dev",
};

export const localWorkspaces = [
  { id: "local-workspace", name: "Kolmena Local" },
];

export const localAgents = [
  {
    id: "agent-chief",
    name: "Agente Chefe",
    role: "chief",
    department: "leadership",
    autonomy_level: 2,
    is_active: true,
    instructions_markdown: "Coordena o time e responde status no Google Chat.",
  },
  {
    id: "agent-planner",
    name: "Agente Planner",
    role: "planner",
    department: "marketing",
    autonomy_level: 2,
    is_active: true,
    instructions_markdown: "Planeja pauta, canal, formato e objetivo.",
  },
  {
    id: "agent-copy",
    name: "Agente Copywriter",
    role: "copywriter",
    department: "marketing",
    autonomy_level: 2,
    is_active: true,
    instructions_markdown: "Escreve headline, legenda e CTA.",
  },
];

export const localTasks = [
  {
    id: "task-1",
    title: "Carrossel sobre eficiência operacional com IA",
    status: "awaiting_initial_approval",
    current_stage: "initial_approval",
    updated_at: new Date().toISOString(),
  },
  {
    id: "task-2",
    title: "Post institucional sobre o AgentBee",
    status: "creating",
    current_stage: "copy_art",
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

export const localApprovals = [
  {
    id: "approval-1",
    approval_type: "initial_summary",
    task_id: "task-1",
    task: localTasks[0],
  },
];

export const localProposals = {
  "task-1": {
    summary_markdown:
      "# Resumo de proposta\n\nTema: eficiência operacional com IA\nObjetivo: gerar autoridade\nCanal: Instagram\nFormato: carrossel\nCTA: falar com a Kolmena",
  },
};

export const localVersions = {
  "task-1": {
    copy_markdown:
      "## Eficiência operacional com IA\n\nEmpresas não precisam de mais ferramentas, precisam de processos mais inteligentes.\n\nCTA: fale com a Kolmena.",
  },
};

export const localIntegrations = [
  { id: "int-1", provider: "openai", status: "local", last_tested_at: null },
  { id: "int-2", provider: "google_chat", status: "local", last_tested_at: null },
  { id: "int-3", provider: "instagram", status: "local", last_tested_at: null },
  { id: "int-4", provider: "linkedin", status: "local", last_tested_at: null },
];

export const localPlaybookDocuments = [
  {
    id: "doc-1",
    title: "Tom de voz",
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    content_markdown:
      "Fale com clareza, autoridade e pragmatismo. Evite jargao desnecessario e sempre conecte tecnologia a resultado operacional.",
  },
  {
    id: "doc-2",
    title: "Promessa de valor",
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    content_markdown:
      "A Kolmena transforma operacoes de marketing em processos repetiveis, observaveis e mais eficientes com agentes de IA.",
  },
];

export const localCampaigns = [
  {
    id: "campaign-1",
    name: "Lideranca em IA aplicada",
    status: "active",
    objective:
      "Gerar autoridade para a Kolmena com conteudos sobre automacao, eficiencia e operacao assistida por IA.",
  },
  {
    id: "campaign-2",
    name: "AgentBee MVP Launch",
    status: "draft",
    objective:
      "Estruturar o discurso de produto para demonstracoes comerciais e onboarding de clientes piloto.",
  },
];

export const localCalendarItems = [
  {
    id: "cal-1",
    workspace_id: "local-workspace",
    campaign_id: "campaign-1",
    campaign_name: "Lideranca em IA aplicada",
    planned_date: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 10),
    channel_type: "instagram",
    topic_title: "Lideranca em IA aplicada: eficiencia aplicado",
    topic_brief: "Post para reforcar autoridade em automacao e ganho operacional.",
    status: "awaiting_approval",
    content_task_id: "task-1",
    reminder_count: 0,
  },
  {
    id: "cal-2",
    workspace_id: "local-workspace",
    campaign_id: "campaign-2",
    campaign_name: "AgentBee MVP Launch",
    planned_date: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString().slice(0, 10),
    channel_type: "linkedin",
    topic_title: "AgentBee MVP Launch: processos aplicado",
    topic_brief: "Conteudo educativo para ativar interesse comercial no MVP.",
    status: "planned",
    content_task_id: null,
    reminder_count: 0,
  },
];

export const localLogs = [
  {
    id: "log-1",
    created_at: new Date().toISOString(),
    action: "local_mode_enabled",
    entity_type: "system",
    entity_id: null,
  },
];
