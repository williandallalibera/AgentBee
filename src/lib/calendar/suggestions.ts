import type { SupabaseClient } from "@supabase/supabase-js";

type CampaignRow = {
  id: string;
  name: string;
  objective: string | null;
  status: string;
};

const STOPWORDS = new Set([
  "para",
  "com",
  "uma",
  "das",
  "dos",
  "que",
  "como",
  "mais",
  "sobre",
  "entre",
  "pela",
  "pelo",
  "deve",
  "muito",
  "essa",
  "esse",
  "isso",
  "agentbee",
  "kolmena",
]);

function extractPlaybookKeywords(playbookText: string): string[] {
  const words = playbookText
    .toLowerCase()
    .replace(/[^a-z0-9à-ú\s]/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !STOPWORDS.has(word));

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function buildThemes(input: {
  campaign: CampaignRow;
  keywords: string[];
  perCampaign: number;
}) {
  const objective = input.campaign.objective?.trim() || "fortalecer resultado de marketing";
  const fallbackKeywords = ["eficiência", "automação", "processos", "governança"];
  const keywords = input.keywords.length > 0 ? input.keywords : fallbackKeywords;

  const themes: Array<{ title: string; brief: string }> = [];
  for (let i = 0; i < input.perCampaign; i += 1) {
    const keyword = keywords[i % keywords.length];
    themes.push({
      title: `${input.campaign.name}: ${keyword} aplicado`,
      brief: `Campanha: ${input.campaign.name}. Objetivo: ${objective}. Tema sugerido: ${keyword} aplicado ao contexto da campanha.`,
    });
  }
  return themes;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export type GenerateCalendarSuggestionsCoreParams = {
  workspaceId: string;
  weeksAhead?: number;
  postsPerWeek?: number;
  /** Se definido, só gera para esta campanha (deve pertencer ao workspace). */
  campaignId?: string | null;
};

export type GenerateCalendarSuggestionsCoreResult =
  | { ok: true; created: number }
  | { error: string };

/**
 * Gera e insere sugestões de itens de calendário editorial (usado pelo painel e pelo Agente Chefe no Google Chat).
 */
export async function generateCalendarSuggestionsCore(
  supabase: Pick<SupabaseClient, "from">,
  params: GenerateCalendarSuggestionsCoreParams,
): Promise<GenerateCalendarSuggestionsCoreResult> {
  const weeksAhead = Math.min(Math.max(params.weeksAhead ?? 4, 1), 12);
  const postsPerWeek = Math.min(Math.max(params.postsPerWeek ?? 2, 1), 7);
  const perCampaign = weeksAhead * postsPerWeek;

  let query = supabase
    .from("campaigns")
    .select("id, name, objective, status, brands!inner(workspace_id)")
    .in("status", ["active", "draft", "paused"])
    .eq("brands.workspace_id", params.workspaceId)
    .order("created_at", { ascending: false });

  if (params.campaignId?.trim()) {
    query = query.eq("id", params.campaignId.trim());
  }

  const { data: campaigns, error: campErr } = await query;

  if (campErr) {
    return { error: campErr.message };
  }

  const campaignRows = (campaigns ?? []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
  })) as CampaignRow[];

  if (campaignRows.length === 0) {
    return {
      error: params.campaignId
        ? "Campanha não encontrada ou indisponível para gerar calendário."
        : "Nenhuma campanha disponível para gerar calendário.",
    };
  }

  const { data: docs } = await supabase
    .from("playbook_documents")
    .select("content_markdown")
    .eq("workspace_id", params.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const playbookText = docs?.map((doc) => doc.content_markdown).join("\n\n") ?? "";
  const keywords = extractPlaybookKeywords(playbookText);

  const start = addDays(new Date(), 1);
  const end = addDays(start, weeksAhead * 7);

  const { data: existingItems } = await supabase
    .from("calendar_items")
    .select("campaign_id, planned_date")
    .eq("workspace_id", params.workspaceId)
    .gte("planned_date", toDateOnly(start))
    .lte("planned_date", toDateOnly(end));

  const occupied = new Set(
    (existingItems ?? []).map((item) => `${item.campaign_id}:${item.planned_date}`),
  );

  const itemsToInsert: Array<Record<string, unknown>> = [];
  for (const campaign of campaignRows) {
    const themes = buildThemes({ campaign, keywords, perCampaign });
    for (let i = 0; i < themes.length; i += 1) {
      const plannedDate = toDateOnly(addDays(start, Math.floor((i * 7) / postsPerWeek)));
      const dedupeKey = `${campaign.id}:${plannedDate}`;
      if (occupied.has(dedupeKey)) continue;
      occupied.add(dedupeKey);

      itemsToInsert.push({
        workspace_id: params.workspaceId,
        campaign_id: campaign.id,
        planned_date: plannedDate,
        channel_type: "instagram",
        format_type: "social_post",
        objective_type: "awareness",
        topic: themes[i]?.title ?? "Tema sugerido",
        topic_title: themes[i]?.title ?? "Tema sugerido",
        topic_brief: themes[i]?.brief ?? "Sugestão criada automaticamente.",
        status: "planned",
      });
    }
  }

  if (itemsToInsert.length === 0) {
    return { ok: true, created: 0 };
  }

  const { error } = await supabase.from("calendar_items").insert(itemsToInsert);
  if (error) return { error: error.message };

  return { ok: true, created: itemsToInsert.length };
}
