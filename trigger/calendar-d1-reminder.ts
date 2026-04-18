import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { sendGoogleChatCard } from "../src/lib/integrations/google-chat";
import { buildCalendarItemCard } from "../src/lib/integrations/google-chat-cards";

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function tomorrowDate() {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  return toDateOnly(now);
}

export const calendarD1Reminder = schedules.task({
  id: "calendar-d1-reminder",
  cron: {
    pattern: "0 9 * * *",
    timezone: "America/Sao_Paulo",
    environments: ["STAGING", "PRODUCTION"],
  },
  run: async () => {
    const supabase = serviceSupabase();
    const targetDate = tomorrowDate();
    const nowIso = new Date().toISOString();

    const { data: items } = await supabase
      .from("calendar_items")
      .select("id, workspace_id, campaign_id, content_task_id, planned_date, topic_title, topic, status, reminder_count, last_reminder_at")
      .eq("planned_date", targetDate)
      .in("status", ["planned", "awaiting_approval", "rescheduled", "approved", "blocked"]);

    if (!items || items.length === 0) {
      return { ok: true, checked: 0, blocked: 0 };
    }

    const integrationCache = new Map<string, string | null>();
    let blockedCount = 0;

    for (const item of items) {
      let finalApprovalStatus: string | null = null;
      if (item.content_task_id) {
        const { data: approval } = await supabase
          .from("approvals")
          .select("status")
          .eq("task_id", item.content_task_id)
          .eq("approval_type", "final_delivery")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        finalApprovalStatus = approval?.status ?? null;
      }

      const isApproved = finalApprovalStatus === "approved";
      if (isApproved) {
        await supabase
          .from("calendar_items")
          .update({
            status: "approved",
            d1_checked_at: nowIso,
            blocked_at: null,
            blocked_reason: null,
          })
          .eq("id", item.id);
        continue;
      }

      blockedCount += 1;

      await supabase
        .from("calendar_items")
        .update({
          status: "blocked",
          blocked_at: nowIso,
          blocked_reason: "D-1 sem aprovação final",
          last_reminder_at: nowIso,
          reminder_count: (item.reminder_count ?? 0) + 1,
        })
        .eq("id", item.id);

      if (item.content_task_id) {
        await supabase
          .from("publications")
          .update({
            status: "disabled",
            blocked_by_d1: true,
            d1_blocked_at: nowIso,
            d1_last_reminder_at: nowIso,
            d1_reminder_count: 1,
          })
          .eq("task_id", item.content_task_id)
          .in("status", ["pending", "scheduled"]);
      }

      const cachedWebhook = integrationCache.get(item.workspace_id);
      let webhookUrl = cachedWebhook ?? null;
      if (!integrationCache.has(item.workspace_id)) {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config_metadata_json")
          .eq("workspace_id", item.workspace_id)
          .eq("provider", "google_chat")
          .maybeSingle();
        webhookUrl =
          (integration?.config_metadata_json as { webhook_url?: string } | null)
            ?.webhook_url ?? null;
        integrationCache.set(item.workspace_id, webhookUrl);
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const approvalLink = item.content_task_id
        ? `${appUrl}/approvals/${item.content_task_id}/final`
        : `${appUrl}/calendar`;

      if (webhookUrl) {
        const card = buildCalendarItemCard({
          itemId: item.id,
          date: item.planned_date,
          title: item.topic_title ?? item.topic ?? "Postagem planejada",
          taskId: item.content_task_id,
          approvalWebUrl: approvalLink,
        });
        await sendGoogleChatCard(webhookUrl, card, {
          title: "Atenção: bloqueei uma publicação por falta de aprovação final",
          subtitle: item.topic_title ?? item.topic ?? "Postagem planejada",
          lines: [
            `Data planejada: ${item.planned_date}`,
            "A publicação ficou bloqueada até a aprovação final passar.",
            item.content_task_id
              ? `Ou respondam "aprovar ${item.content_task_id}".`
              : "Posso ajudar a destravar isso por aqui.",
            `Reagendar: "reagendar ${item.id} <yyyy-mm-dd>" ou botão no card.`,
          ],
          linkUrl: approvalLink,
          linkLabel: "Resolver agora",
        });
      }

      await supabase.from("audit_logs").insert({
        workspace_id: item.workspace_id,
        entity_type: "calendar_item",
        entity_id: item.id,
        action: "d1_blocked_and_reminded",
        actor_type: "system",
        actor_id: "calendar-d1-reminder",
        metadata_json: {
          planned_date: item.planned_date,
          content_task_id: item.content_task_id,
          reminder_count: (item.reminder_count ?? 0) + 1,
        },
      });
    }

    return { ok: true, checked: items.length, blocked: blockedCount };
  },
});
