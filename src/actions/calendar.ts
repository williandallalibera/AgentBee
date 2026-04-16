"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceMember } from "@/lib/auth/session";

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

export async function generateCalendarSuggestions(input?: {
  weeksAhead?: number;
  postsPerWeek?: number;
}) {
  const { supabase, workspaceId } = await requireWorkspaceMember();
  const weeksAhead = Math.min(Math.max(input?.weeksAhead ?? 4, 1), 12);
  const postsPerWeek = Math.min(Math.max(input?.postsPerWeek ?? 2, 1), 7);
  const perCampaign = weeksAhead * postsPerWeek;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, objective, status, brands!inner(workspace_id)")
    .in("status", ["active", "draft", "paused"])
    .eq("brands.workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const campaignRows = (campaigns ?? []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
  })) as CampaignRow[];

  if (campaignRows.length === 0) {
    return { error: "Nenhuma campanha disponível para gerar calendário." };
  }

  const { data: docs } = await supabase
    .from("playbook_documents")
    .select("content_markdown")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const playbookText = docs?.map((doc) => doc.content_markdown).join("\n\n") ?? "";
  const keywords = extractPlaybookKeywords(playbookText);

  const start = addDays(new Date(), 1);
  const end = addDays(start, weeksAhead * 7);

  const { data: existingItems } = await supabase
    .from("calendar_items")
    .select("campaign_id, planned_date")
    .eq("workspace_id", workspaceId)
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
        workspace_id: workspaceId,
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

  revalidatePath("/calendar");
  revalidatePath("/campaigns");
  return { ok: true, created: itemsToInsert.length };
}

export async function generateCalendarSuggestionsFromForm(): Promise<void> {
  const result = await generateCalendarSuggestions();
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}

export async function createTaskFromCalendarItem(input: { calendarItemId: string }) {
  const { supabase, user, workspaceId } = await requireWorkspaceMember();

  const { data: item } = await supabase
    .from("calendar_items")
    .select("id, workspace_id, campaign_id, content_task_id, topic_title, topic")
    .eq("id", input.calendarItemId)
    .maybeSingle();

  if (!item || item.workspace_id !== workspaceId) {
    return { error: "Item de calendário não encontrado." };
  }

  if (item.content_task_id) {
    return { ok: true, taskId: item.content_task_id };
  }

  const title =
    item.topic_title?.trim() || item.topic?.trim() || "Tarefa gerada do calendário";

  const { data: task, error: taskError } = await supabase
    .from("content_tasks")
    .insert({
      workspace_id: workspaceId,
      campaign_id: item.campaign_id,
      calendar_item_id: item.id,
      title,
      status: "draft",
      requested_by: user.id,
      current_stage: "briefing",
    })
    .select("id")
    .single();

  if (taskError || !task) {
    return { error: taskError?.message ?? "Falha ao criar tarefa." };
  }

  await supabase
    .from("calendar_items")
    .update({
      content_task_id: task.id,
      status: "awaiting_approval",
    })
    .eq("id", item.id);

  revalidatePath("/calendar");
  revalidatePath("/content");
  return { ok: true, taskId: task.id };
}

export async function createTaskFromCalendarItemForm(
  formData: FormData,
): Promise<void> {
  const calendarItemId = String(formData.get("calendar_item_id") ?? "");
  const result = await createTaskFromCalendarItem({ calendarItemId });
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}

export async function rescheduleCalendarItem(input: {
  calendarItemId: string;
  plannedDate: string;
}) {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { error } = await supabase
    .from("calendar_items")
    .update({
      planned_date: input.plannedDate,
      status: "rescheduled",
      blocked_at: null,
      blocked_reason: null,
    })
    .eq("id", input.calendarItemId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function rescheduleCalendarItemForm(formData: FormData): Promise<void> {
  const calendarItemId = String(formData.get("calendar_item_id") ?? "");
  const plannedDate = String(formData.get("planned_date") ?? "");
  const result = await rescheduleCalendarItem({ calendarItemId, plannedDate });
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}
