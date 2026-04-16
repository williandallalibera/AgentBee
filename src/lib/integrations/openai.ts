/**
 * Adaptador OpenAI — chaves apenas no servidor / Trigger.
 * Usa Responses API quando OPENAI_API_KEY está definida.
 */

export type ProposalResult = {
  summary_markdown: string;
  strategy_json: Record<string, unknown>;
  research_summary_json: Record<string, unknown>;
};

export async function generateContentProposal(input: {
  playbookExcerpt: string;
  taskTitle: string;
  campaignObjective?: string | null;
}): Promise<ProposalResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return mockProposal(input);
  }

  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é estrategista de marketing B2B para a Kolmena Latam. Responda sempre em português do Brasil. Retorne apenas JSON válido.",
      },
      {
        role: "user",
        content: `Playbook (trecho):\n${input.playbookExcerpt.slice(0, 12000)}\n\nTítulo da peça: ${input.taskTitle}\nObjetivo da campanha: ${input.campaignObjective ?? "não informado"}\n\nRetorne um objeto JSON com chaves: summary_markdown (string markdown), strategy_json (objeto com tema, objetivo, canal, formato, cta, justificativa), research_summary_json (objeto com bullets de pesquisa simulada).`,
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

  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Com base no playbook:\n${input.playbookExcerpt.slice(0, 8000)}\n\nProposta aprovada:\n${input.proposalSummary}\n\nResponda JSON com copy_markdown e carousel_structure_json (slides com title/body).`,
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
}): Promise<{ ok: boolean; notes: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: true, notes: "Auditoria offline (sem OPENAI_API_KEY)." };
  }
  const body = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Playbook:\n${input.playbookExcerpt.slice(0, 4000)}\n\nCopy:\n${input.copy}\n\nResponda JSON { ok: boolean, notes: string }.`,
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
