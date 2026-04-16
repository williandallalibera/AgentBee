import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  createTaskFromCalendarItemForm,
  generateCalendarSuggestionsFromForm,
  rescheduleCalendarItemForm,
} from "@/actions/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocalMode } from "@/lib/env";
import { localCalendarItems, localCampaigns } from "@/lib/local-mode";

type CalendarItemView = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  planned_date: string;
  channel_type: string;
  topic_title: string | null;
  topic_brief: string | null;
  status: string;
  content_task_id: string | null;
  reminder_count: number;
};

export default async function CalendarPage() {
  if (isLocalMode()) {
    return (
      <CalendarPageView
        localMode
        items={localCalendarItems}
        campaigns={localCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
        }))}
      />
    );
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: campaignsData } = await supabase
    .from("campaigns")
    .select("id, name, brands!inner(workspace_id)")
    .eq("brands.workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const campaigns = (campaignsData ?? []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
  }));

  const { data: itemsData } = await supabase
    .from("calendar_items")
    .select("id, campaign_id, planned_date, channel_type, topic_title, topic_brief, topic, status, content_task_id, reminder_count, campaigns(name)")
    .eq("workspace_id", workspaceId)
    .order("planned_date", { ascending: true });

  const items: CalendarItemView[] = (itemsData ?? []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relation = item.campaigns as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaignName = relation?.name ?? (Array.isArray(relation) ? (relation[0] as any)?.name : undefined) ?? "Campanha";
    return {
      id: item.id,
      campaign_id: item.campaign_id,
      campaign_name: campaignName,
      planned_date: item.planned_date,
      channel_type: item.channel_type,
      topic_title: item.topic_title ?? item.topic ?? "Tema sugerido",
      topic_brief: item.topic_brief ?? "",
      status: item.status,
      content_task_id: item.content_task_id,
      reminder_count: item.reminder_count ?? 0,
    };
  });

  return <CalendarPageView items={items} campaigns={campaigns} />;
}

function CalendarPageView({
  items,
  campaigns,
  localMode = false,
}: {
  items: CalendarItemView[];
  campaigns: Array<{ id: string; name: string }>;
  localMode?: boolean;
}) {
  const grouped = campaigns.map((campaign) => ({
    ...campaign,
    items: items.filter((item) => item.campaign_id === campaign.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Calendário
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Visualize o calendário geral e por campanha, com controle de aprovação D-1.
        </p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Planejamento automático</CardTitle>
          <CardDescription>
            {localMode
              ? "Preview local ativo: sem persistência."
              : "Gera temas sugeridos por campanha com base no playbook."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form action={localMode ? undefined : generateCalendarSuggestionsFromForm}>
            <Button type={localMode ? "button" : "submit"} disabled={localMode}>
              Gerar temas no calendário
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Calendário geral</CardTitle>
          <CardDescription>
            Todos os itens do workspace em ordem cronológica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item no calendário.</p>
          ) : (
            items.map((item) => (
              <CalendarItemRow key={item.id} item={item} localMode={localMode} />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Calendário por campanha</CardTitle>
          <CardDescription>
            Organização dedicada para campanhas simultâneas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma campanha encontrada.</p>
          ) : (
            grouped.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded border border-gray-200 p-4 dark:border-gray-700"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {campaign.name}
                </h3>
                <div className="mt-3 space-y-3">
                  {campaign.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sem itens desta campanha no período atual.
                    </p>
                  ) : (
                    campaign.items.map((item) => (
                      <CalendarItemRow key={item.id} item={item} localMode={localMode} compact />
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarItemRow({
  item,
  localMode,
  compact = false,
}: {
  item: CalendarItemView;
  localMode: boolean;
  compact?: boolean;
}) {
  return (
    <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-gray-900 dark:text-white">{item.topic_title}</p>
        <Badge variant="outline">{item.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.campaign_name} · {new Date(item.planned_date).toLocaleDateString("pt-BR")} ·{" "}
        {item.channel_type}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{item.topic_brief}</p>
      {item.reminder_count > 0 ? (
        <p className="mt-1 text-xs text-amber-600">
          Lembretes D-1 enviados: {item.reminder_count}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-[auto_minmax(0,1fr)]">
        <form action={localMode ? undefined : createTaskFromCalendarItemForm}>
          <input type="hidden" name="calendar_item_id" value={item.id} />
          <Button
            type={localMode ? "button" : "submit"}
            size="sm"
            variant="outline"
            disabled={localMode || Boolean(item.content_task_id)}
          >
            {item.content_task_id ? "Tarefa vinculada" : "Criar tarefa"}
          </Button>
        </form>
        {!compact ? (
          <form action={localMode ? undefined : rescheduleCalendarItemForm} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="calendar_item_id" value={item.id} />
            <div className="space-y-1">
              <Label htmlFor={`date-${item.id}`}>Reagendar</Label>
              <Input
                id={`date-${item.id}`}
                type="date"
                name="planned_date"
                defaultValue={item.planned_date}
                disabled={localMode}
                className="h-8"
              />
            </div>
            <Button
              type={localMode ? "button" : "submit"}
              size="sm"
              disabled={localMode}
            >
              Salvar data
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
