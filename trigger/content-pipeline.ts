import { task, wait, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import {
  auditContent,
  generateContentProposal,
  generateCopyAndCarousel,
  generateSocialImageBytes,
  runAgentSpecialistStage,
} from "../src/lib/integrations/openai";
import { runWebResearchForContentTask } from "../src/lib/integrations/web-research";
import { buildVisualStyleNotesFromReferences } from "../src/lib/integrations/visual-reference-styles";
import { sendGoogleChatCard, sendGoogleChatMessage } from "../src/lib/integrations/google-chat";
import { buildApprovalCard, buildCalendarDeepLink } from "../src/lib/integrations/google-chat-cards";
import { sendApprovalEmail } from "../src/lib/integrations/email";
import { ensureWorkspaceAgents, getAgentIdByRole } from "../src/lib/agents/ensure-workspace-agents";
import { uploadSocialAssetPng } from "../src/lib/storage/social-art";

type ApprovalDecision = {
  action: "approve" | "revision" | "new_direction" | "cancel";
  comments?: string;
};

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function audit(
  supabase: ReturnType<typeof serviceSupabase>,
  input: {
    workspaceId: string | null;
    entityType: string;
    entityId: string | null;
    action: string;
    actorType: "user" | "system" | "agent";
    actorId: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    actor_type: input.actorType,
    actor_id: input.actorId,
    metadata_json: input.metadata ?? {},
  });
}

export const contentPipeline = task({
  id: "content-pipeline",
  maxDuration: 3600,
  run: async (payload: { taskId: string }) => {
    const supabase = serviceSupabase();
    const { data: taskRow, error: tErr } = await supabase
      .from("content_tasks")
      .select("id, workspace_id, title, campaign_id, calendar_item_id, status")
      .eq("id", payload.taskId)
      .single();

    if (tErr || !taskRow) {
      throw new Error(`Tarefa não encontrada: ${payload.taskId}`);
    }

    let campaignObjective: string | null = null;
    if (taskRow.campaign_id) {
      const { data: camp } = await supabase
        .from("campaigns")
        .select("objective")
        .eq("id", taskRow.campaign_id)
        .maybeSingle();
      campaignObjective = camp?.objective ?? null;
    }

    const wsId = taskRow.workspace_id as string;

    const { data: gcIntegration } = await supabase
      .from("integrations")
      .select("config_metadata_json")
      .eq("workspace_id", wsId)
      .eq("provider", "google_chat")
      .maybeSingle();

    const googleChatWebhook = (
      gcIntegration?.config_metadata_json as { webhook_url?: string } | null
    )?.webhook_url;

    const { data: playbookDocs } = await supabase
      .from("playbook_documents")
      .select("title, content_markdown")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false })
      .limit(12);

    const playbookExcerpt =
      playbookDocs?.length ?
        playbookDocs
          .map((d) => `## ${d.title}\n${d.content_markdown}`)
          .join("\n\n")
          .slice(0, 28_000)
      : "Playbook vazio — preencha no painel antes de gerar conteúdo.";

    const webPack = await runWebResearchForContentTask({
      taskTitle: taskRow.title as string,
      campaignObjective,
    });
    const webResearchMarkdown = webPack.markdown;

    await supabase
      .from("content_tasks")
      .update({
        status: "researching",
        current_stage: "research",
      })
      .eq("id", payload.taskId);

    await ensureWorkspaceAgents(supabase, wsId);

    const researcherId = await getAgentIdByRole(supabase, wsId, "researcher");
    const researchOut = await runAgentSpecialistStage({
      role: "researcher",
      playbookExcerpt,
      taskTitle: taskRow.title,
      contextJson: {
        campaign_objective: campaignObjective,
        web_research: webResearchMarkdown.slice(0, 12_000),
        web_research_source: webPack.source,
      },
    });
    if (researcherId) {
      await supabase.from("agent_runs").insert({
        workspace_id: wsId,
        agent_id: researcherId,
        task_id: payload.taskId,
        stage: "research",
        status: "success",
        output_summary: researchOut.summary,
        output_json: researchOut.structured,
        input_json: {
          task_title: taskRow.title,
          web_query: webPack.query,
          web_source: webPack.source,
        },
        finished_at: new Date().toISOString(),
      });
    }

    await supabase
      .from("content_tasks")
      .update({ status: "planning", current_stage: "plan" })
      .eq("id", payload.taskId);

    const proposal = await generateContentProposal({
      playbookExcerpt,
      taskTitle: taskRow.title,
      campaignObjective,
    });

    const plannerId = await getAgentIdByRole(supabase, wsId, "planner");
    const planOut = await runAgentSpecialistStage({
      role: "planner",
      playbookExcerpt,
      taskTitle: taskRow.title,
      contextJson: {
        proposal_excerpt: proposal.summary_markdown.slice(0, 2500),
        strategy: proposal.strategy_json,
      },
    });
    if (plannerId) {
      await supabase.from("agent_runs").insert({
        workspace_id: wsId,
        agent_id: plannerId,
        task_id: payload.taskId,
        stage: "plan",
        status: "success",
        output_summary: planOut.summary,
        output_json: planOut.structured,
        finished_at: new Date().toISOString(),
      });
    }

    const { data: proposalRow, error: pErr } = await supabase
      .from("content_proposals")
      .insert({
        task_id: payload.taskId,
        summary_markdown: proposal.summary_markdown,
        strategy_json: proposal.strategy_json,
        research_summary_json: proposal.research_summary_json,
        status: "pending_approval",
      })
      .select("id")
      .single();

    if (pErr || !proposalRow) throw new Error(pErr?.message ?? "Falha na proposta");

    await supabase
      .from("content_tasks")
      .update({
        status: "awaiting_initial_approval",
        current_stage: "initial_approval",
      })
      .eq("id", payload.taskId);

    if (taskRow.calendar_item_id) {
      await supabase
        .from("calendar_items")
        .update({ status: "awaiting_approval" })
        .eq("id", taskRow.calendar_item_id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const approvalLink = `${appUrl}/approvals/${payload.taskId}/initial`;
    let calendarItemId =
      typeof taskRow.calendar_item_id === "string" ? taskRow.calendar_item_id : null;
    if (!calendarItemId) {
      const { data: calRow } = await supabase
        .from("calendar_items")
        .select("id")
        .eq("content_task_id", payload.taskId)
        .order("planned_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      calendarItemId = calRow?.id ?? null;
    }
    const calendarUrl = calendarItemId ? buildCalendarDeepLink(appUrl, calendarItemId) : null;

    const { data: approval1, error: a1Err } = await supabase
      .from("approvals")
      .insert({
        task_id: payload.taskId,
        workspace_id: wsId,
        approval_type: "initial_summary",
        target_id: proposalRow.id,
        status: "pending",
        channel_type: "web",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (a1Err || !approval1) throw new Error(a1Err?.message ?? "Falha ao criar aprovação");

    const token1 = await wait.createToken({
      idempotencyKey: `task-${payload.taskId}-initial`,
      timeout: "7d",
      tags: [`workspace-${wsId}`, `task-${payload.taskId}`],
    });

    await supabase
      .from("approvals")
      .update({ wait_token_id: token1.id })
      .eq("id", approval1.id);

    if (googleChatWebhook) {
      const card = buildApprovalCard({
        taskId: payload.taskId,
        stage: "initial",
        title: taskRow.title as string,
        caption: proposal.summary_markdown,
        imageUrl: null,
        webUrl: approvalLink,
        calendarUrl,
      });
      await sendGoogleChatCard(googleChatWebhook, card, {
        title: "Preciso de uma revisão rápida da direção desta peça",
        subtitle: taskRow.title as string,
        lines: [
          ...proposal.summary_markdown.slice(0, 500).split("\n").slice(0, 6),
          "",
          `Se estiver ok: botão Aprovar no card ou "aprovar ${payload.taskId}".`,
          `Ajuste: "reprovar ${payload.taskId} <motivo>".`,
        ],
        linkUrl: approvalLink,
      });
    }

    await sendApprovalEmail({
      to: process.env.APPROVAL_FALLBACK_EMAIL ?? "ops@example.com",
      subject: `[AgentBee] Aprovar direção: ${taskRow.title}`,
      html: `<p>Resumo:</p><pre>${proposal.summary_markdown.slice(0, 2000)}</pre><p><a href="${approvalLink}">Abrir aprovação</a></p>`,
    });

    await audit(supabase, {
      workspaceId: wsId,
      entityType: "content_task",
      entityId: payload.taskId,
      action: "initial_approval_requested",
      actorType: "system",
      actorId: "content-pipeline",
    });

    const firstResult = await wait.forToken<ApprovalDecision>(token1).unwrap();

    if (firstResult.action === "cancel") {
      await supabase
        .from("content_tasks")
        .update({ status: "cancelled" })
        .eq("id", payload.taskId);
      if (taskRow.calendar_item_id) {
        await supabase
          .from("calendar_items")
          .update({ status: "cancelled", blocked_reason: "Cancelado na aprovação inicial" })
          .eq("id", taskRow.calendar_item_id);
      }
      await audit(supabase, {
        workspaceId: wsId,
        entityType: "content_task",
        entityId: payload.taskId,
        action: "cancelled_at_initial",
        actorType: "user",
        actorId: null,
      });
      if (googleChatWebhook) {
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "Tarefa cancelada na aprovação inicial",
          subtitle: taskRow.title,
          lines: [`Task ${payload.taskId}`, "Fluxo encerrado."],
        });
      }
      return { ok: false, phase: "initial_cancelled" };
    }

    if (
      firstResult.action === "new_direction" ||
      firstResult.action === "revision"
    ) {
      await supabase
        .from("content_tasks")
        .update({ status: "in_revision", current_stage: "plan" })
        .eq("id", payload.taskId);
      if (taskRow.calendar_item_id) {
        await supabase
          .from("calendar_items")
          .update({
            status: "rescheduled",
            blocked_reason: "Nova direção solicitada na aprovação inicial",
          })
          .eq("id", taskRow.calendar_item_id);
      }
      if (googleChatWebhook) {
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "Ajuste pedido na direção inicial",
          subtitle: taskRow.title,
          lines: [
            firstResult.comments ? `Feedback: ${firstResult.comments}` : "Solicitaram ajuste na proposta.",
            `Task ${payload.taskId} — acompanhem no painel ou peçam novo status aqui.`,
          ],
        });
      }
      return { ok: false, phase: "needs_revision", comments: firstResult.comments };
    }

    await supabase
      .from("content_proposals")
      .update({ status: "approved" })
      .eq("id", proposalRow.id);

    await supabase
      .from("approvals")
      .update({
        status: "approved",
        responded_at: new Date().toISOString(),
        comments: firstResult.comments ?? null,
      })
      .eq("id", approval1.id);

    await supabase
      .from("content_tasks")
      .update({ status: "creating", current_stage: "copy_art" })
      .eq("id", payload.taskId);

    const gen = await generateCopyAndCarousel({
      playbookExcerpt,
      proposalSummary: proposal.summary_markdown,
      webResearchMarkdown,
    });

    const auditResult = await auditContent({
      playbookExcerpt,
      copy: gen.copy_markdown,
      webResearchMarkdown,
    });

    const { data: versionRow, error: vErr } = await supabase
      .from("content_versions")
      .insert({
        task_id: payload.taskId,
        copy_markdown: gen.copy_markdown,
        carousel_structure_json: gen.carousel_structure_json,
        status: "pending_final",
      })
      .select("id")
      .single();

    if (vErr || !versionRow) throw new Error(vErr?.message ?? "Versão não criada");

    const copywriterId = await getAgentIdByRole(supabase, wsId, "copywriter");
    const copySpec = await runAgentSpecialistStage({
      role: "copywriter",
      playbookExcerpt,
      taskTitle: taskRow.title,
      contextJson: {
        copy_excerpt: gen.copy_markdown.slice(0, 4000),
        carousel: gen.carousel_structure_json,
      },
    });
    if (copywriterId) {
      await supabase.from("agent_runs").insert({
        workspace_id: wsId,
        agent_id: copywriterId,
        task_id: payload.taskId,
        stage: "copy_art",
        status: "success",
        output_summary: copySpec.summary,
        output_json: copySpec.structured,
        finished_at: new Date().toISOString(),
      });
    }

    const artDirectorId = await getAgentIdByRole(supabase, wsId, "art_director");
    const artBrief = await runAgentSpecialistStage({
      role: "art_director",
      playbookExcerpt,
      taskTitle: taskRow.title,
      contextJson: {
        carousel: gen.carousel_structure_json,
        copy_excerpt: gen.copy_markdown.slice(0, 1500),
      },
    });
    let visualUrl: string | null = null;
    const visualStyleNotes = await buildVisualStyleNotesFromReferences({
      supabase,
      workspaceId: wsId,
    });
    const imageBytes = await generateSocialImageBytes({
      prompt: `Imagem quadrada para post em rede social B2B, moderna e limpa, sem texto minúsculo ilegível. Conceito: ${artBrief.summary}. Peça: ${taskRow.title}.`,
      visualStyleNotes: visualStyleNotes || undefined,
    });
    if (imageBytes) {
      visualUrl = await uploadSocialAssetPng({
        supabase,
        workspaceId: wsId,
        taskId: payload.taskId,
        bytes: imageBytes,
      });
    }
    if (visualUrl) {
      await supabase
        .from("content_versions")
        .update({ visual_draft_url: visualUrl })
        .eq("id", versionRow.id);
    }
    if (artDirectorId) {
      await supabase.from("agent_runs").insert({
        workspace_id: wsId,
        agent_id: artDirectorId,
        task_id: payload.taskId,
        stage: "visual",
        status: visualUrl ? "success" : "skipped",
        output_summary: visualUrl
          ? `Arte gerada: ${visualUrl}`
          : "Arte não gerada (sem API de imagem ou falha de upload).",
        output_json: { ...artBrief.structured, visual_draft_url: visualUrl },
        finished_at: new Date().toISOString(),
      });
    }

    const auditorId = await getAgentIdByRole(supabase, wsId, "auditor");
    await supabase.from("agent_runs").insert({
      workspace_id: wsId,
      agent_id: auditorId,
      task_id: payload.taskId,
      stage: "audit",
      status: auditResult.ok ? "success" : "error",
      output_summary: auditResult.notes,
      output_json: { ok: auditResult.ok, notes: auditResult.notes },
      finished_at: new Date().toISOString(),
    });

    await supabase
      .from("content_tasks")
      .update({
        status: "awaiting_final_approval",
        current_stage: "final_approval",
      })
      .eq("id", payload.taskId);

    const finalLink = `${appUrl}/approvals/${payload.taskId}/final`;

    const { data: approval2, error: a2Err } = await supabase
      .from("approvals")
      .insert({
        task_id: payload.taskId,
        workspace_id: wsId,
        approval_type: "final_delivery",
        target_id: versionRow.id,
        status: "pending",
        channel_type: "web",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (a2Err || !approval2) throw new Error(a2Err?.message ?? "Falha aprovação final");

    const token2 = await wait.createToken({
      idempotencyKey: `task-${payload.taskId}-final`,
      timeout: "7d",
      tags: [`workspace-${wsId}`, `task-${payload.taskId}`],
    });

    await supabase
      .from("approvals")
      .update({ wait_token_id: token2.id })
      .eq("id", approval2.id);

    if (googleChatWebhook) {
      const card = buildApprovalCard({
        taskId: payload.taskId,
        stage: "final",
        title: taskRow.title as string,
        caption: gen.copy_markdown,
        imageUrl: visualUrl,
        webUrl: finalLink,
        calendarUrl,
      });
      await sendGoogleChatCard(googleChatWebhook, card, {
        title: "Versão final pronta para aprovação",
        subtitle: taskRow.title as string,
        lines: [
          gen.copy_markdown.slice(0, 400),
          "",
          `Aprovar: botão no card ou "aprovar ${payload.taskId}".`,
          `Ajuste: "reprovar ${payload.taskId} <motivo>".`,
        ],
        linkUrl: finalLink,
      });
    }

    await sendApprovalEmail({
      to: process.env.APPROVAL_FALLBACK_EMAIL ?? "ops@example.com",
      subject: `[AgentBee] Aprovar versão final: ${taskRow.title}`,
      html: `<pre>${gen.copy_markdown}</pre><p><a href="${finalLink}">Abrir aprovação final</a></p>`,
    });

    const secondResult = await wait.forToken<ApprovalDecision>(token2).unwrap();

    if (secondResult.action === "cancel") {
      await supabase
        .from("content_tasks")
        .update({ status: "cancelled" })
        .eq("id", payload.taskId);
      if (taskRow.calendar_item_id) {
        await supabase
          .from("calendar_items")
          .update({ status: "cancelled", blocked_reason: "Cancelado na aprovação final" })
          .eq("id", taskRow.calendar_item_id);
      }
      if (googleChatWebhook) {
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "Tarefa cancelada na aprovação final",
          subtitle: taskRow.title,
          lines: [`Task ${payload.taskId}`, "Fluxo encerrado."],
        });
      }
      return { ok: false, phase: "final_cancelled" };
    }

    if (
      secondResult.action === "revision" ||
      secondResult.action === "new_direction"
    ) {
      await supabase
        .from("content_tasks")
        .update({ status: "in_revision", current_stage: "copy_art" })
        .eq("id", payload.taskId);
      if (taskRow.calendar_item_id) {
        await supabase
          .from("calendar_items")
          .update({
            status: "blocked",
            blocked_at: new Date().toISOString(),
            blocked_reason: "Ajustes solicitados na aprovação final",
          })
          .eq("id", taskRow.calendar_item_id);
      }
      if (googleChatWebhook) {
        await sendGoogleChatMessage(googleChatWebhook, {
          title: "Ajuste pedido na versão final",
          subtitle: taskRow.title,
          lines: [
            secondResult.comments
              ? `Feedback: ${secondResult.comments}`
              : "Solicitaram ajuste na peça final.",
            `Task ${payload.taskId}`,
          ],
        });
      }
      return { ok: false, phase: "final_needs_revision" };
    }

    await supabase
      .from("content_versions")
      .update({ status: "approved" })
      .eq("id", versionRow.id);

    await supabase
      .from("approvals")
      .update({
        status: "approved",
        responded_at: new Date().toISOString(),
      })
      .eq("id", approval2.id);

    await supabase
      .from("content_tasks")
      .update({
        status: "approved",
        current_stage: "publish",
      })
      .eq("id", payload.taskId);

    const { data: calendarItem } = taskRow.calendar_item_id
      ? await supabase
          .from("calendar_items")
          .select("planned_date, channel_type")
          .eq("id", taskRow.calendar_item_id)
          .maybeSingle()
      : { data: null };

    const scheduledAt = calendarItem?.planned_date
      ? `${calendarItem.planned_date}T09:00:00.000Z`
      : null;

    const { data: versionForPub } = await supabase
      .from("content_versions")
      .select("visual_draft_url")
      .eq("id", versionRow.id)
      .maybeSingle();
    const pubMedia: string[] = [];
    const vu = versionForPub?.visual_draft_url;
    if (typeof vu === "string" && vu.startsWith("http")) {
      pubMedia.push(vu);
    }

    const { data: publicationRow } = await supabase
      .from("publications")
      .insert({
        task_id: payload.taskId,
        workspace_id: wsId,
        channel_type: calendarItem?.channel_type ?? "instagram",
        scheduled_at: scheduledAt,
        status: "pending",
        media_urls_json: pubMedia,
      })
      .select("id")
      .single();

    const publisherId = await getAgentIdByRole(supabase, wsId, "publisher");
    if (publisherId) {
      await supabase.from("agent_runs").insert({
        workspace_id: wsId,
        agent_id: publisherId,
        task_id: payload.taskId,
        stage: "publish",
        status: "success",
        output_summary: publicationRow?.id
          ? `Publicação enfileirada (${publicationRow.id})`
          : "Publicação enfileirada",
        output_json: { publication_id: publicationRow?.id ?? null },
        finished_at: new Date().toISOString(),
      });
    }

    if (publicationRow?.id && process.env.TRIGGER_SECRET_KEY?.trim()) {
      const pubId = publicationRow.id as string;
      const schedulerOff = process.env.SOCIAL_AUTO_SCHEDULER_ENABLED?.trim() === "false";
      const nowMs = Date.now();
      const targetMs = scheduledAt ? new Date(scheduledAt).getTime() : nowMs;
      const delayMs = Math.max(0, targetMs - nowMs);
      try {
        if (schedulerOff || delayMs < 60_000) {
          await tasks.trigger("publish-social", { publicationId: pubId });
        } else {
          const handle = await tasks.trigger(
            "publish-social",
            { publicationId: pubId },
            { delay: new Date(targetMs) },
          );
          const runId = handle && typeof (handle as { id?: string }).id === "string"
            ? (handle as { id: string }).id
            : null;
          if (runId) {
            await supabase
              .from("publications")
              .update({ scheduled_trigger_run_id: runId })
              .eq("id", pubId);
          }
        }
      } catch (e) {
        console.warn("publish_social_trigger_failed", e);
      }
    }

    await supabase
      .from("content_tasks")
      .update({ status: "scheduled" })
      .eq("id", payload.taskId);

    if (taskRow.calendar_item_id) {
      await supabase
        .from("calendar_items")
        .update({
          status: "approved",
          d1_checked_at: new Date().toISOString(),
          blocked_at: null,
          blocked_reason: null,
          content_task_id: payload.taskId,
        })
        .eq("id", taskRow.calendar_item_id);
    }

    await audit(supabase, {
      workspaceId: wsId,
      entityType: "content_task",
      entityId: payload.taskId,
      action: "pipeline_completed",
      actorType: "system",
      actorId: "content-pipeline",
    });

    if (googleChatWebhook) {
      await sendGoogleChatMessage(googleChatWebhook, {
        title: "Peça aprovada e agendada",
        subtitle: taskRow.title,
        lines: [
          `Task ${payload.taskId}`,
          calendarItem?.planned_date
            ? `Data planejada no calendário: ${calendarItem.planned_date} (${calendarItem.channel_type ?? "canal"}).`
            : "Sem data no calendário — revisem no painel.",
          "Publicação disparada na fila (task publish-social) quando Trigger e integrações Instagram/LinkedIn estiverem configurados.",
        ],
      });
    }

    return { ok: true, taskId: payload.taskId };
  },
});
