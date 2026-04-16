/**
 * Classificação de intenção do Agente Chefe — sem SQL livre; apenas consultas parametrizadas planejadas.
 */

export type ChiefIntent =
  | { kind: "pending_approvals" }
  | { kind: "task_status"; query?: string }
  | { kind: "campaign_status"; query?: string }
  | { kind: "approve_task"; taskId: string }
  | { kind: "reject_task"; taskId: string; comments?: string }
  | { kind: "reschedule_item"; itemId: string; date: string }
  | { kind: "upcoming_posts" }
  | { kind: "help" }
  | { kind: "unknown" };

const patterns: Array<{ test: RegExp; intent: ChiefIntent }> = [
  {
    test: /aprova(ç|c)(a|õ)es?\s*pendentes|o que.*aprovar|pendente.*aprova/i,
    intent: { kind: "pending_approvals" },
  },
  {
    test: /status.*campanha|campanha/i,
    intent: { kind: "campaign_status" },
  },
  {
    test: /status|andamento|o que.*fazendo|atras/i,
    intent: { kind: "task_status" },
  },
  {
    test: /ajuda|help|comandos/i,
    intent: { kind: "help" },
  },
];

export function classifyChiefIntent(message: string): ChiefIntent {
  const t = message.trim();
  const approve = t.match(/\baprovar\s+([a-f0-9-]{8,})/i);
  if (approve?.[1]) {
    return { kind: "approve_task", taskId: approve[1] };
  }

  const reject = t.match(/\b(reprovar|rejeitar)\s+([a-f0-9-]{8,})(?:\s+(.+))?/i);
  if (reject?.[2]) {
    return {
      kind: "reject_task",
      taskId: reject[2],
      comments: reject[3]?.trim(),
    };
  }

  const reschedule = t.match(
    /\breagendar\s+([a-f0-9-]{8,})\s+(\d{4}-\d{2}-\d{2})/i,
  );
  if (reschedule?.[1] && reschedule[2]) {
    return {
      kind: "reschedule_item",
      itemId: reschedule[1],
      date: reschedule[2],
    };
  }

  if (/proximas?\s+postagens|calend[aá]rio|agenda/i.test(t)) {
    return { kind: "upcoming_posts" };
  }

  for (const p of patterns) {
    if (p.test.test(t)) return p.intent;
  }
  return { kind: "unknown" };
}
