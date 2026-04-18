import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { sendGoogleChatCard } from "../src/lib/integrations/google-chat";
import { buildDigestCard, type DigestLine } from "../src/lib/integrations/google-chat-cards";

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const dailyDigest = schedules.task({
  id: "daily-digest",
  cron: {
    pattern: "30 7 * * *",
    timezone: "America/Sao_Paulo",
    environments: ["DEVELOPMENT", "STAGING", "PRODUCTION"],
  },
  run: async () => {
    const supabase = serviceSupabase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, config_metadata_json")
      .eq("provider", "google_chat");

    const linesByWs = new Map<string, DigestLine[]>();

    const { data: pending } = await supabase
      .from("approvals")
      .select("workspace_id, task_id, approval_type, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(80);

    for (const row of pending ?? []) {
      const ws = row.workspace_id as string;
      if (!linesByWs.has(ws)) linesByWs.set(ws, []);
      const arr = linesByWs.get(ws)!;
      if (arr.filter((l) => l.kind === "approval").length >= 8) continue;
      arr.push({
        kind: "approval",
        text: `Aprovação pendente (${row.approval_type}) — task ${row.task_id}`,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: todayPubs } = await supabase
      .from("publications")
      .select("workspace_id, channel_type, scheduled_at, status")
      .gte("scheduled_at", `${today}T00:00:00.000Z`)
      .lte("scheduled_at", `${today}T23:59:59.999Z`)
      .eq("status", "pending")
      .limit(60);

    for (const row of todayPubs ?? []) {
      const ws = row.workspace_id as string;
      if (!ws) continue;
      if (!linesByWs.has(ws)) linesByWs.set(ws, []);
      const arr = linesByWs.get(ws)!;
      if (arr.filter((l) => l.kind === "publish").length >= 6) continue;
      arr.push({
        kind: "publish",
        text: `Publicação prevista hoje: ${row.channel_type} (${row.status})`,
      });
    }

    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const { data: failed } = await supabase
      .from("publications")
      .select("workspace_id, channel_type, last_error")
      .eq("status", "failed")
      .gte("created_at", `${yesterday}T00:00:00.000Z`)
      .limit(80);

    for (const row of failed ?? []) {
      const ws = row.workspace_id as string;
      if (!ws) continue;
      if (!linesByWs.has(ws)) linesByWs.set(ws, []);
      const arr = linesByWs.get(ws)!;
      if (arr.filter((l) => l.kind === "failure").length >= 5) continue;
      arr.push({
        kind: "failure",
        text: `Falha ontem/hoje (${row.channel_type}): ${(row.last_error ?? "").slice(0, 120)}`,
      });
    }

    let sent = 0;
    for (const integ of integrations ?? []) {
      const wsId = integ.workspace_id as string;
      const webhook = (integ.config_metadata_json as { webhook_url?: string } | null)
        ?.webhook_url;
      if (!webhook?.trim()) continue;
      const lines = linesByWs.get(wsId) ?? [];
      const card = buildDigestCard(lines, `${appUrl}/dashboard`);
      await sendGoogleChatCard(webhook.trim(), card, {
        title: "AgentBee — resumo matinal",
        subtitle: today,
        lines: lines.map((l) => l.text),
        linkUrl: `${appUrl}/dashboard`,
        linkLabel: "Abrir painel",
      });
      sent += 1;
    }

    return { ok: true, workspaces: sent };
  },
});
