import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { sendGoogleChatMessage } from "../src/lib/integrations/google-chat";
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
    }> = [];

    if (payload.publicationId) {
      const { data } = await supabase
        .from("publications")
        .select("id, task_id, channel_type, scheduled_at, media_urls_json")
        .eq("id", payload.publicationId)
        .eq("status", "pending")
        .maybeSingle();
      if (data) rows = [data as (typeof rows)[0]];
    } else {
      const { data } = await supabase
        .from("publications")
        .select("id, task_id, channel_type, scheduled_at, media_urls_json")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(lim);
      rows = (data ?? []) as typeof rows;
    }

    const results: string[] = [];

    for (const pub of rows) {
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
          scheduledAt: pub.scheduled_at ? new Date(pub.scheduled_at) : undefined,
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
          scheduledAt: pub.scheduled_at ? new Date(pub.scheduled_at) : undefined,
        });
        externalPostId = r.externalPostId;
        err = r.error;
      } else {
        err = `Canal não suportado: ${pub.channel_type}`;
      }

      if (err || !externalPostId) {
        await supabase
          .from("publications")
          .update({
            status: "failed",
            last_error: err ?? "falha sem id externo",
          })
          .eq("id", pub.id);
        results.push(`pub ${pub.id}: falha — ${err ?? "sem post id"}`);
        if (googleChatWebhook) {
          await sendGoogleChatMessage(googleChatWebhook, {
            title: "Falha ao publicar",
            subtitle: taskRow.title as string,
            lines: [`Canal: ${pub.channel_type}`, err ?? "erro desconhecido"],
          });
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
        })
        .eq("id", pub.id);

      await supabase
        .from("content_tasks")
        .update({ status: "published", current_stage: "publish" })
        .eq("id", pub.task_id);

      results.push(`pub ${pub.id}: ok ${externalPostId}`);

      if (googleChatWebhook) {
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "Publicado nas redes",
          subtitle: taskRow.title as string,
          lines: [
            `Canal: ${pub.channel_type}`,
            `ID externo: ${externalPostId}`,
          ],
        });
      }
    }

    return { processed: rows.length, results };
  },
});
