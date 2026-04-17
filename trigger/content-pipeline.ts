import { task, wait } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import {
  auditContent,
  generateContentProposal,
  generateCopyAndCarousel,
} from "../src/lib/integrations/openai";
import { sendGoogleChatMessage } from "../src/lib/integrations/google-chat";
import { sendApprovalEmail } from "../src/lib/integrations/email";

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

    const { data: playbookDocs } = await supabase
      .from("playbook_documents")
      .select("content_markdown")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false })
      .limit(3);

    const playbookExcerpt =
      playbookDocs?.map((d) => d.content_markdown).join("\n\n") ||
      "Playbook vazio — preencha no painel antes de gerar conteúdo.";

    await supabase
      .from("content_tasks")
      .update({
        status: "researching",
        current_stage: "research",
      })
      .eq("id", payload.taskId);

    const { data: researcher } = await supabase
      .from("agents")
      .select("id")
      .eq("workspace_id", wsId)
      .eq("role", "researcher")
      .maybeSingle();

    if (researcher?.id) {
      await supabase.from("agent_runs").insert({
        agent_id: researcher.id,
        task_id: payload.taskId,
        stage: "research",
        status: "success",
        output_summary: "Pesquisa sintetizada (MVP).",
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

    const { data: approval1, error: a1Err } = await supabase
      .from("approvals")
      .insert({
        task_id: payload.taskId,
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

    const { data: gc } = await supabase
      .from("integrations")
      .select("config_metadata_json")
      .eq("workspace_id", wsId)
      .eq("provider", "google_chat")
      .maybeSingle();

    const webhook = (gc?.config_metadata_json as { webhook_url?: string } | null)
      ?.webhook_url;

    if (webhook) {
      await sendGoogleChatMessage(webhook, {
        title: "Preciso de uma revisão rápida da direção desta peça",
        subtitle: taskRow.title,
        lines: [
          ...proposal.summary_markdown.slice(0, 500).split("\n").slice(0, 6),
          "",
          `Se estiver ok, me respondam aqui com "aprovar ${payload.taskId}".`,
          `Se precisarem de ajuste, podem responder "reprovar ${payload.taskId} <motivo>".`,
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
    });

    const auditResult = await auditContent({
      playbookExcerpt,
      copy: gen.copy_markdown,
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

    await supabase.from("agent_runs").insert({
      agent_id: researcher?.id ?? null,
      task_id: payload.taskId,
      stage: "audit",
      status: "success",
      output_summary: auditResult.notes,
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

    if (webhook) {
      await sendGoogleChatMessage(webhook, {
        title: "Versão final pronta para aprovação",
        subtitle: taskRow.title,
        lines: [
          gen.copy_markdown.slice(0, 400),
          "",
          `Se estiver aprovado, me respondam aqui com "aprovar ${payload.taskId}".`,
          `Se quiserem ajuste, podem responder "reprovar ${payload.taskId} <motivo>".`,
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

    await supabase.from("publications").insert({
      task_id: payload.taskId,
      channel_type: calendarItem?.channel_type ?? "instagram",
      scheduled_at: scheduledAt,
      status: "pending",
    });

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

    return { ok: true, taskId: payload.taskId };
  },
});
