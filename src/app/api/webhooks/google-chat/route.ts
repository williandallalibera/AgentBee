import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { classifyChiefIntent } from "@/lib/chief-agent/intent";
import { wait } from "@trigger.dev/sdk/v3";

/**
 * Webhook Google Chat — POST com payload do Apps Script / Chat API.
 * Em produção, valide o token do app (GOOGLE_CHAT_VERIFICATION_TOKEN).
 */
export async function POST(request: Request) {
  const expected = process.env.GOOGLE_CHAT_VERIFICATION_TOKEN;
  const token =
    request.headers.get("x-goog-chat-token") ??
    new URL(request.url).searchParams.get("token");
  if (expected && token !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { message?: { text?: string; argumentText?: string } };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ text: "Payload inválido" });
  }

  const text =
    payload.message?.argumentText ?? payload.message?.text ?? "";
  const intent = classifyChiefIntent(text);
  const supabase = createServiceSupabaseClient();
  const { data: integration } = await supabase
    .from("integrations")
    .select("workspace_id")
    .eq("provider", "google_chat")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspaceId = integration?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({
      text: "Integração Google Chat não vinculada a workspace.",
    });
  }

  await supabase.from("chief_agent_conversations").insert({
    workspace_id: workspaceId,
    external_channel: "google_chat",
    message_text: text,
    intent: intent.kind,
  });

  if (intent.kind === "pending_approvals") {
    const { data: wsTasks } = await supabase
      .from("content_tasks")
      .select("id")
      .eq("workspace_id", workspaceId);
    const taskIds = wsTasks?.map((task) => task.id) ?? [];

    if (taskIds.length === 0) {
      return NextResponse.json({ text: "Nenhuma tarefa no workspace." });
    }

    const { data: approvals } = await supabase
      .from("approvals")
      .select("id, task_id, approval_type, status")
      .eq("status", "pending")
      .in("task_id", taskIds)
      .limit(10);
    const n = approvals?.length ?? 0;
    const lines = approvals
      ?.map((approval) => `• ${approval.approval_type} | task ${approval.task_id}`)
      .join("\n");
    return NextResponse.json({
      text:
        n === 0
          ? "Não há aprovações pendentes."
          : `Há ${n} aprovação(ões) pendente(s):\n${lines}`,
    });
  }

  if (intent.kind === "help") {
    return NextResponse.json({
      text: "Comandos: aprovar <task_id>, reprovar <task_id> <motivo>, reagendar <calendar_item_id> <yyyy-mm-dd>, aprovações pendentes, status e próximas postagens.",
    });
  }

  if (intent.kind === "task_status") {
    const { data: tasks } = await supabase
      .from("content_tasks")
      .select("title, status")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(5);
    const lines =
      tasks?.map((t) => `• ${t.title}: ${t.status}`).join("\n") ??
      "Nenhuma tarefa.";
    return NextResponse.json({
      text: `Últimas tarefas:\n${lines}`,
    });
  }

  if (intent.kind === "upcoming_posts") {
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: items } = await supabase
      .from("calendar_items")
      .select("id, planned_date, topic_title, topic, status")
      .eq("workspace_id", workspaceId)
      .gte("planned_date", today)
      .lte("planned_date", nextWeek)
      .order("planned_date", { ascending: true })
      .limit(10);

    if (!items || items.length === 0) {
      return NextResponse.json({ text: "Sem postagens agendadas para os próximos 7 dias." });
    }

    return NextResponse.json({
      text: `Próximas postagens:\n${items
        .map(
          (item) =>
            `• ${item.planned_date} | ${item.topic_title ?? item.topic ?? "Tema"} (${item.status})`,
        )
        .join("\n")}`,
    });
  }

  if (intent.kind === "reschedule_item") {
    const { error } = await supabase
      .from("calendar_items")
      .update({
        planned_date: intent.date,
        status: "rescheduled",
        blocked_at: null,
        blocked_reason: null,
      })
      .eq("id", intent.itemId)
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json({ text: `Falha ao reagendar: ${error.message}` });
    }

    return NextResponse.json({
      text: `Item ${intent.itemId} reagendado para ${intent.date}.`,
    });
  }

  if (intent.kind === "approve_task" || intent.kind === "reject_task") {
    const { data: task } = await supabase
      .from("content_tasks")
      .select("id, workspace_id, calendar_item_id")
      .eq("id", intent.taskId)
      .maybeSingle();

    if (!task || task.workspace_id !== workspaceId) {
      return NextResponse.json({ text: "Task não encontrada no workspace atual." });
    }

    const { data: approval } = await supabase
      .from("approvals")
      .select("id, wait_token_id")
      .eq("task_id", task.id)
      .eq("approval_type", "final_delivery")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!approval) {
      return NextResponse.json({ text: "Não há aprovação final pendente para essa task." });
    }

    const decision =
      intent.kind === "approve_task"
        ? { action: "approve" as const, comments: "Aprovado via Google Chat" }
        : {
            action: "revision" as const,
            comments: intent.comments ?? "Reprovado via Google Chat",
          };

    if (approval.wait_token_id && process.env.TRIGGER_SECRET_KEY) {
      await wait.completeToken(approval.wait_token_id, decision);
    }

    await supabase
      .from("approvals")
      .update({
        status: intent.kind === "approve_task" ? "approved" : "rejected",
        channel_type: "google_chat",
        comments: decision.comments,
        responded_at: new Date().toISOString(),
      })
      .eq("id", approval.id);

    await supabase
      .from("content_tasks")
      .update({
        status: intent.kind === "approve_task" ? "approved" : "in_revision",
      })
      .eq("id", task.id);

    if (task.calendar_item_id) {
      await supabase
        .from("calendar_items")
        .update(
          intent.kind === "approve_task"
            ? {
                status: "approved",
                d1_checked_at: new Date().toISOString(),
                blocked_at: null,
                blocked_reason: null,
              }
            : {
                status: "blocked",
                blocked_at: new Date().toISOString(),
                blocked_reason: decision.comments,
              },
        )
        .eq("id", task.calendar_item_id);
    }

    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      entity_type: "content_task",
      entity_id: task.id,
      action: intent.kind === "approve_task" ? "approved_via_google_chat" : "rejected_via_google_chat",
      actor_type: "system",
      actor_id: "google-chat-webhook",
      metadata_json: { comments: decision.comments },
    });

    return NextResponse.json({
      text:
        intent.kind === "approve_task"
          ? `Task ${intent.taskId} aprovada com sucesso.`
          : `Task ${intent.taskId} enviada para revisão.`,
    });
  }

  return NextResponse.json({
    text: "Comando não reconhecido. Use: ajuda",
  });
}
