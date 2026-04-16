/** Time inicial do MVP (PRD §10) — seed por workspace */
export const DEFAULT_AGENTS = [
  {
    name: "Agente Pesquisador de Conteúdo",
    role: "researcher",
    department: "marketing",
    autonomy_level: 2,
    instructions_markdown:
      "Pesquisa tendências, referências, concorrentes e ganchos com base no Playbook.",
  },
  {
    name: "Agente Estrategista / Social Media Planner",
    role: "planner",
    department: "marketing",
    autonomy_level: 2,
    instructions_markdown:
      "Monta planejamento editorial e alinha ao calendário e objetivos.",
  },
  {
    name: "Agente Copywriter",
    role: "copywriter",
    department: "marketing",
    autonomy_level: 2,
    instructions_markdown:
      "Cria headlines, legendas, CTAs e estrutura textual.",
  },
  {
    name: "Agente Diretor de Arte / Carrossel",
    role: "art_director",
    department: "creative",
    autonomy_level: 2,
    instructions_markdown:
      "Gera drafts visuais a partir de templates e estrutura de slides.",
  },
  {
    name: "Agente Auditor de Qualidade",
    role: "auditor",
    department: "quality",
    autonomy_level: 1,
    instructions_markdown:
      "Valida aderência ao playbook, clareza e consistência.",
  },
  {
    name: "Agente Aprovador / Notificador",
    role: "notifier",
    department: "operations",
    autonomy_level: 1,
    instructions_markdown:
      "Envia solicitações de aprovação por Google Chat e e-mail.",
  },
  {
    name: "Agente Publicador",
    role: "publisher",
    department: "operations",
    autonomy_level: 3,
    instructions_markdown:
      "Agenda e publica conteúdos já aprovados.",
  },
  {
    name: "Agente Chefe",
    role: "chief",
    department: "leadership",
    autonomy_level: 2,
    instructions_markdown:
      "Interface conversacional no Google Chat — status e delegação segura.",
  },
] as const;
