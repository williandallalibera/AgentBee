/**
 * Pesquisa web para enriquecer propostas (Serper/Google).
 * Sem SERPER_API_KEY, retorna aviso — não bloqueia o pipeline.
 */

export type WebResearchResult = {
  markdown: string;
  query: string;
  source: "serper" | "none";
};

type SerperOrganic = { title?: string; snippet?: string; link?: string };

function buildQuery(taskTitle: string, campaignObjective: string | null | undefined): string {
  const t = taskTitle.replace(/\s+/g, " ").trim();
  const obj = (campaignObjective ?? "").replace(/\s+/g, " ").trim();
  const base = `${t} marketing conteúdo redes sociais`;
  if (obj.length > 0) {
    return `${base} ${obj}`.slice(0, 240);
  }
  return base.slice(0, 240);
}

export async function runWebResearchForContentTask(input: {
  taskTitle: string;
  campaignObjective?: string | null;
}): Promise<WebResearchResult> {
  const query = buildQuery(input.taskTitle, input.campaignObjective);
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) {
    return {
      query,
      source: "none",
      markdown:
        "*Pesquisa web ao vivo não configurada.* Defina `SERPER_API_KEY` no ambiente (https://serper.dev) para trazer resultados do Google. " +
        "Até lá, use apenas o playbook e o conhecimento interno do modelo, sem inventar dados de mercado específicos.",
    };
  }

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 8,
        gl: "br",
        hl: "pt-br",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return {
        query,
        source: "none",
        markdown: `*Pesquisa web falhou (${res.status}).* Detalhe: ${err.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { organic?: SerperOrganic[] };
    const organic = data.organic ?? [];
    if (organic.length === 0) {
      return {
        query,
        source: "serper",
        markdown: `*Busca:* «${query}» — sem resultados orgânicos retornados.`,
      };
    }
    const lines = organic.map((o, i) => {
      const title = o.title ?? "Sem título";
      const snip = (o.snippet ?? "").replace(/\s+/g, " ").trim();
      const link = o.link ?? "";
      return `${i + 1}. **${title}**${snip ? ` — ${snip}` : ""}${link ? `\n   Fonte: ${link}` : ""}`;
    });
    return {
      query,
      source: "serper",
      markdown:
        `*Pesquisa web (Google via Serper)* — consulta: «${query}»\n\n` +
        lines.join("\n\n") +
        "\n\nUse estes trechos como *inspiração e contexto de mercado*; cite tendências com cuidado e não copie texto de terceiros.",
    };
  } catch (e) {
    return {
      query,
      source: "none",
      markdown: `*Erro de rede na pesquisa web:* ${e instanceof Error ? e.message : "falha desconhecida"}`,
    };
  }
}
