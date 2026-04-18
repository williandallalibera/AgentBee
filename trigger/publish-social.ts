import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { sendGoogleChatCard, sendGoogleChatMessage } from "../src/lib/integrations/google-chat";
import { buildPublicationResultCard } from "../src/lib/integrations/google-chat-cards";
import {
  publishInstagramFeedPost,
  publishLinkedInOrganizationPost,
} from "../src/lib/integrations/social-publish";

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const MAX_RETRIES = 6;
const BACKOFF_MINUTES_BASE = 2;

function integrationsPageUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  return base ? `${base}/integrations` : null;
}

function chiefNarrationLine(input: {
  ok: boolean;
  title: string;
  channel: string;
  postUrl?: string;
  error?: string;
  persona: string | null;
}) {
  const tone = input.persona?.trim() ? `${input.persona.trim().slice(0, 200)} ` : "";
  if (input.ok) {
    return `${tone}Postei *${input.title}* no ${input.channel}.${input.postUrl ? ` Link: ${input.postUrl}` : ""} Quer que eu prepare o próximo slot do calendário?`;
  }
  return `${tone}Não consegui publicar *${input.title}* no ${input.channel}. ${input.error ?? ""} Confira token da integração ou tente «Reenviar» no card. Reautentique Instagram/LinkedIn no painel se necessário.`;
}

export const publishSocial = task({
  id: "publish-social",
  maxDuration: 600,
  run: async (payload: { publicationId?: string; limit?: number }) => {
    const supabase = serviceSupabase();
    const lim = Math.min(Math.max(payload.limit ?? 5, 1), 20);

    let rows: Array<{
      id: string;
      task_id: string;
      channel_type: string;
      scheduled_at: string | null;
      media_urls_json: unknown;
      retry_count: number | null;
      next_attempt_at: string | null;
    }> = [];

    if (payload.publicationId) {
      const { data } = await supabase
        .from("publications")
        .select(
          "id, task_id, channel_type, scheduled_at, media_urls_json, retry_count, next_attempt_at",
        )
        .eq("id", payload.publicationId)
        .eq("status", "pending")
        .maybeSingle();
      if (data) rows = [data as (typeof rows)[0]];
    } else {
      const { data } = await supabase
        .from("publications")
        .select(
          "id, task_id, channel_type, scheduled_at, media_urls_json, retry_count, next_attempt_at",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(lim);
      rows = (data ?? []) as typeof rows;
    }

    const results: string[] = [];
    const nowIso = new Date().toISOString();

    for (const pub of rows) {
      if (pub.next_attempt_at && new Date(pub.next_attempt_at).getTime() > Date.now()) {
        results.push(`pub ${pub.id}: aguardando next_attempt_at`);
        continue;
      }

      await supabase
        .from("publications")
        .update({ last_attempt_at: nowIso })
        .eq("id", pub.id);

      const { data: taskRow } = await supabase
        .from("content_tasks")
        .select("id, workspace_id, title")
        .eq("id", pub.task_id)
        .maybeSingle();

      if (!taskRow) {
        await supabase
          .from("publications")
          .update({
            status: "failed",
            last_error: "content_task não encontrada",
          })
          .eq("id", pub.id);
        continue;
      }

      const wsId = taskRow.workspace_id as string;

      const { data: chiefRow } = await supabase
        .from("agents")
        .select("persona_tone")
        .eq("workspace_id", wsId)
        .eq("role", "chief")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      const persona =
        chiefRow && typeof (chiefRow as { persona_tone?: string }).persona_tone === "string"
          ? (chiefRow as { persona_tone: string }).persona_tone
          : null;

      const { data: version } = await supabase
        .from("content_versions")
        .select("copy_markdown, visual_draft_url")
        .eq("task_id", pub.task_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const caption = (version?.copy_markdown ?? taskRow.title ?? "").slice(0, 2200);
      const mediaUrls = Array.isArray(pub.media_urls_json)
        ? (pub.media_urls_json as string[])
        : [];
      const imageUrl =
        (typeof version?.visual_draft_url === "string" && version.visual_draft_url) ||
        mediaUrls.find((u) => typeof u === "string" && u.startsWith("http")) ||
        "";

      const { data: gcIntegration } = await supabase
        .from("integrations")
        .select("config_metadata_json")
        .eq("workspace_id", wsId)
        .eq("provider", "google_chat")
        .maybeSingle();
      const googleChatWebhook = (
        gcIntegration?.config_metadata_json as { webhook_url?: string } | null
      )?.webhook_url;

      let externalPostId: string | undefined;
      let postUrl: string | undefined;
      let err: string | undefined;

      if (pub.channel_type === "instagram") {
        const { data: igInt } = await supabase
          .from("integrations")
          .select("config_metadata_json")
          .eq("workspace_id", wsId)
          .eq("provider", "instagram")
          .maybeSingle();
        const meta = (igInt?.config_metadata_json ?? {}) as {
          access_token?: string;
          instagram_account_id?: string;
          ig_user_id?: string;
        };
        const r = await publishInstagramFeedPost({
          accessToken: meta.access_token ?? "",
          instagramAccountId:
            meta.instagram_account_id?.trim() || meta.ig_user_id?.trim() || "",
          imageUrl: imageUrl || "https://dummyimage.com/1080x1080/3c8dbc/fff.png&text=AgentBee",
          caption,
          scheduledAt: undefined,
        });
        externalPostId = r.externalPostId;
        err = r.error;
      } else if (pub.channel_type === "linkedin") {
        const { data: liInt } = await supabase
          .from("integrations")
          .select("config_metadata_json")
          .eq("workspace_id", wsId)
          .eq("provider", "linkedin")
          .maybeSingle();
        const meta = (liInt?.config_metadata_json ?? {}) as {
          access_token?: string;
          organization_id?: string;
        };
        const r = await publishLinkedInOrganizationPost({
          accessToken: meta.access_token ?? "",
          organizationId: meta.organization_id ?? "",
          text: caption,
          imageUrl: imageUrl || undefined,
          scheduledAt: undefined,
        });
        externalPostId = r.externalPostId;
        err = r.error;
        postUrl = r.postUrl;
      } else {
        err = `Canal não suportado: ${pub.channel_type}`;
      }

      if (err || !externalPostId) {
        const attempt = (pub.retry_count ?? 0) + 1;
        if (attempt < MAX_RETRIES) {
          const backoffMs =
            BACKOFF_MINUTES_BASE * 60_000 * Math.pow(2, Math.min(attempt - 1, 5));
          const nextAt = new Date(Date.now() + backoffMs).toISOString();
          await supabase
            .from("publications")
            .update({
              status: "pending",
              last_error: err ?? "falha sem id externo",
              retry_count: attempt,
              next_attempt_at: nextAt,
            })
            .eq("id", pub.id);
          results.push(`pub ${pub.id}: retry ${attempt}/${MAX_RETRIES} — ${err ?? ""}`);
        } else {
          await supabase
            .from("publications")
            .update({
              status: "failed",
              last_error: err ?? "falha sem id externo",
              retry_count: attempt,
              next_attempt_at: null,
            })
            .eq("id", pub.id);
          results.push(`pub ${pub.id}: falha — ${err ?? "sem post id"}`);
        }

        if (googleChatWebhook) {
          if (attempt >= MAX_RETRIES) {
                       const card = buildPublicationResultCard({
              publicationId: pub.id,
              taskTitle: taskRow.title as string,
              channel: pub.channel_type,
              status: "failed",
              errorMessage: err ?? "erro",
              integrationsUrl: integrationsPageUrl(),
            });
            await sendGoogleChatCard(googleChatWebhook, card, {
              title: "Falha ao publicar",
              subtitle: taskRow.title as string,
              lines: [`Canal: ${pub.channel_type}`, err ?? "erro desconhecido"],
            });
            await sendGoogleChatMessage(googleChatWebhook, {
              title: "AgentBee",
              subtitle: taskRow.title as string,
              lines: [
                chiefNarrationLine({
                  ok: false,
                  title: taskRow.title as string,
                  channel: pub.channel_type,
                  error: err,
                  persona,
                }),
              ],
            });
          } else {
            await sendGoogleChatMessage(googleChatWebhook, {
              title: "Publicação — retry automático",
              subtitle: taskRow.title as string,
              lines: [
                `Tentativa ${attempt}/${MAX_RETRIES} falhou (${pub.channel_type}): ${err ?? "erro"}.`,
                "Tentarei novamente com backoff.",
              ],
            });
          }
        }
        continue;
      }

      await supabase
        .from("publications")
        .update({
          status: "published",
          external_post_id: externalPostId,
          published_at: new Date().toISOString(),
          last_error: null,
          retry_count: 0,
          next_attempt_at: null,
        })
        .eq("id", pub.id);

      await supabase
        .from("content_tasks")
        .update({ status: "published", current_stage: "publish" })
        .eq("id", pub.task_id);

      results.push(`pub ${pub.id}: ok ${externalPostId}`);

      if (googleChatWebhook) {
        const card = buildPublicationResultCard({
          publicationId: pub.id,
          taskTitle: taskRow.title as string,
          channel: pub.channel_type,
          status: "published",
          postUrl: postUrl ?? null,
        });
        await sendGoogleChatCard(googleChatWebhook, card, {
          title: "Publicado nas redes",
          subtitle: taskRow.title as string,
          lines: [`Canal: ${pub.channel_type}`, `ID externo: ${externalPostId}`],
        });
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "AgentBee",
          subtitle: taskRow.title as string,
          lines: [
            chiefNarrationLine({
              ok: true,
              title: taskRow.title as string,
              channel: pub.channel_type,
              postUrl,
              persona,
            }),
          ],
        });
      }
    }

    return { processed: rows.length, results };
  },
});

/** Rede de segurança: republica pendentes que passaram do horário ou perderam o delayed trigger. */
export const publicationsSweeper = schedules.task({
  id: "publications-sweeper",
  cron: {
    pattern: "*/10 * * * *",
    timezone: "America/Sao_Paulo",
    environments: ["DEVELOPMENT", "STAGING", "PRODUCTION"],
  },
  run: async () => {
    if (process.env.SOCIAL_AUTO_SCHEDULER_ENABLED?.trim() === "false") {
      return { ok: true, skipped: true };
    }
    const supabase = serviceSupabase();
    const nowMs = Date.now();
    const cutoffMs = nowMs - 2 * 60_000;
    const { data: candidates } = await supabase
      .from("publications")
      .select("id, scheduled_at, next_attempt_at")
      .eq("status", "pending")
      .limit(80);

    const ids = (candidates ?? [])
      .filter((row) => {
        const nextAt = row.next_attempt_at
          ? new Date(row.next_attempt_at as string).getTime()
          : 0;
        if (nextAt > nowMs) return false;
        if (!row.scheduled_at) return true;
        return new Date(row.scheduled_at as string).getTime() <= cutoffMs;
      })
      .map((r) => r.id as string)
      .slice(0, 25);

    let triggered = 0;
    for (const id of ids) {
      try {
        await tasks.trigger("publish-social", { publicationId: id });
        triggered += 1;
      } catch {
        /* ignore */
      }
    }
    return { ok: true, checked: ids.length, triggered };
  },
});
