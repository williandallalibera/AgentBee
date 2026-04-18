/**
 * Adaptador OpenAI — chaves apenas no servidor / Trigger.
 * Usa Responses API quando OPENAI_API_KEY está definida.
 */

export type ProposalResult = {
  summary_markdown: string;
  strategy_json: Record<string, unknown>;
  research_summary_json: Record<string, unknown>;
};

const PLAYBOOK_CHARS_PROPOSAL = 16_000;
const PLAYBOOK_CHARS_COPY = 12_000;
const PLAYBOOK_CHARS_AUDIT = 10_000;
const PLAYBOOK_CHARS_SPECIALIST = 10_000;
const WEB_RESEARCH_CHARS = 12_000;

export async function generateContentProposal(input: {
  playbookExcerpt: string;
  webResearchMarkdown?: string;
  taskTitle: string;
  campaignObjective?: string | null;
}): Promise<ProposalResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return mockProposal(input);
  }

  const webBlock =
    input.webResearchMarkdown?.trim().length ?
      `\n\n---\nPesquisa / contexto de mercado (use para enriquecer; o playbook acima é identidade da marca):\n${input.webResearchMarkdown.trim().slice(0, WEB_RESEARCH_CHARS)}\n`
 : "";

  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é estrategista de marketing B2B. Responda em português do Brasil. Retorne apenas JSON válido. " +
          "O playbook descreve a empresa (tom, produto, restrições). A seção de pesquisa traz fatos e referências externas — integre com critério, sem copiar texto de terceiros. " +
          "Em research_summary_json use bullets objetivos (tendências, ângulos, riscos) citando que se baseiam na pesquisa quando houver.",
      },
      {
        role: "user",
        content:
          `Playbook — identidade e diretrizes da marca:\n${input.playbookExcerpt.slice(0, PLAYBOOK_CHARS_PROPOSAL)}` +
          webBlock +
          `\n\nTítulo da peça: ${input.taskTitle}\nObjetivo da campanha: ${input.campaignObjective ?? "não informado"}\n\n` +
          `Retorne um objeto JSON com chaves: summary_markdown (string markdown), strategy_json (objeto com tema, objetivo, canal, formato, cta, justificativa), research_summary_json (objeto com bullets: array de strings ou objeto rico com fontes_resumidas).`,
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI error", err);
    return mockProposal(input);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return mockProposal(input);
  }

  const parsed = JSON.parse(text) as {
    summary_markdown?: string;
    strategy_json?: Record<string, unknown>;
    research_summary_json?: Record<string, unknown>;
  };

  return {
    summary_markdown:
      parsed.summary_markdown ?? `# Proposta\n\n${input.taskTitle}`,
    strategy_json: parsed.strategy_json ?? {},
    research_summary_json: parsed.research_summary_json ?? {},
  };
}

export async function generateCopyAndCarousel(input: {
  playbookExcerpt: string;
  proposalSummary: string;
  webResearchMarkdown?: string;
}): Promise<{
  copy_markdown: string;
  carousel_structure_json: Record<string, unknown>;
}> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      copy_markdown: `## ${input.proposalSummary.slice(0, 80)}\n\nLegenda MVP (configure OPENAI_API_KEY para geração completa).\n\n#Kolmena`,
      carousel_structure_json: {
        slides: [
          { title: "Slide 1", body: "Gancho" },
          { title: "Slide 2", body: "Insight" },
          { title: "Slide 3", body: "CTA" },
        ],
      },
    };
  }

  const web =
    input.webResearchMarkdown?.trim().length ?
      `\nContexto de pesquisa (referência):\n${input.webResearchMarkdown.trim().slice(0, 8000)}\n`
      : "";

  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content:
          `Playbook:\n${input.playbookExcerpt.slice(0, PLAYBOOK_CHARS_COPY)}\n` +
          web +
          `\nProposta aprovada:\n${input.proposalSummary}\n\n` +
          `Responda JSON com copy_markdown e carousel_structure_json (slides com title/body). Tom alinhado ao playbook; gancho forte no primeiro slide.`,
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      copy_markdown: input.proposalSummary,
      carousel_structure_json: { slides: [] },
    };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as {
    copy_markdown?: string;
    carousel_structure_json?: Record<string, unknown>;
  };
  return {
    copy_markdown: parsed.copy_markdown ?? "",
    carousel_structure_json: parsed.carousel_structure_json ?? {},
  };
}

export async function auditContent(input: {
  playbookExcerpt: string;
  copy: string;
  webResearchMarkdown?: string;
}): Promise<{ ok: boolean; notes: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: true, notes: "Auditoria offline (sem OPENAI_API_KEY)." };
  }
  const web =
    input.webResearchMarkdown?.trim().length ?
      `\nNotas de pesquisa (consistência):\n${input.webResearchMarkdown.trim().slice(0, 4000)}\n`
      : "";
  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content:
          `Playbook:\n${input.playbookExcerpt.slice(0, PLAYBOOK_CHARS_AUDIT)}\n` +
          web +
          `\nCopy:\n${input.copy}\n\nResponda JSON { ok: boolean, notes: string }.`,
      },
    ],
    response_format: { type: "json_object" },
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: true, notes: "Falha na chamada de auditoria." };
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(text) as { ok: boolean; notes: string };
}

function mockProposal(input: {
  taskTitle: string;
  webResearchMarkdown?: string;
}): ProposalResult {
  return {
    summary_markdown: `# Resumo de proposta — ${input.taskTitle}

**Canal sugerido:** Instagram  
**Formato:** Carrossel  
**CTA:** Fale com a Kolmena  

*(Configure \`OPENAI_API_KEY\` ou integração OpenAI no painel para geração com IA.)*`,
    strategy_json: {
      tema: input.taskTitle,
      objetivo: "Engajamento e autoridade",
      canal: "instagram",
      formato: "carrossel",
      cta: "Agendar conversa",
      justificativa: "Alinhado ao posicionamento institucional (MVP).",
    },
    research_summary_json: {
      bullets: [
        "Tendência: conteúdo educativo curto",
        "Referência: tom consultivo B2B",
        input.webResearchMarkdown?.trim()
          ? "Contexto externo fornecido acima (modo mock — configure APIs)"
          : "Configure SERPER_API_KEY para pesquisa web ao vivo",
      ],
    },
  };
}

export async function testOpenAiConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY não configurada" };
  }
  const res = await fetch("https://api.openai.com/v1/models?limit=1", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

/** Especialista por papel — saída estruturada para agent_runs.output_json */
export async function runAgentSpecialistStage(input: {
  role: string;
  playbookExcerpt: string;
  taskTitle: string;
  contextJson: Record<string, unknown>;
}): Promise<{ summary: string; structured: Record<string, unknown> }> {
  const key = process.env.OPENAI_API_KEY;
  const base = {
    summary: `[${input.role}] Etapa registrada para «${input.taskTitle}».`,
    structured: {
      role: input.role,
      highlights: Object.keys(input.contextJson).slice(0, 8),
    },
  };
  if (!key) return base;

  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é um agente especializado em marketing B2B. Responda em português do Brasil. Retorne apenas JSON válido com chaves summary (string curta) e structured (objeto com bullets, riscos, sugestões).",
      },
      {
        role: "user",
        content: `Papel: ${input.role}\nTítulo da peça: ${input.taskTitle}\nPlaybook (trecho):\n${input.playbookExcerpt.slice(0, PLAYBOOK_CHARS_SPECIALIST)}\nContexto anterior (JSON):\n${JSON.stringify(input.contextJson).slice(0, 10_000)}`,
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return base;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return base;
  try {
    const parsed = JSON.parse(text) as {
      summary?: string;
      structured?: Record<string, unknown>;
    };
    return {
      summary: parsed.summary ?? base.summary,
      structured: parsed.structured ?? base.structured,
    };
  } catch {
    return base;
  }
}

/**
 * Gera imagem 1024x1024 (DALL·E 3) e devolve bytes PNG quando possível.
 */
export async function generateSocialImageBytes(input: {
  prompt: string;
  /** Texto derivado de artes modelo (visão) — reforça estilo sem enviar a imagem ao DALL·E */
  visualStyleNotes?: string;
}): Promise<Uint8Array | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const style = input.visualStyleNotes?.trim()
    ? `\n\nDiretriz de estilo a respeitar (referências do cliente):\n${input.visualStyleNotes.trim().slice(0, 2000)}`
    : "";
  const fullPrompt = `${input.prompt.slice(0, 2800)}${style}`.slice(0, 3500);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}
