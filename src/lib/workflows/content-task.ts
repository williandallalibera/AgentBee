import type { ContentTaskStatus } from "@/lib/types/database";

const transitions: Record<ContentTaskStatus, ContentTaskStatus[]> = {
  draft: ["researching", "cancelled"],
  researching: ["planning", "error", "cancelled"],
  planning: ["awaiting_initial_approval", "error", "cancelled"],
  awaiting_initial_approval: ["creating", "researching", "planning", "cancelled"],
  creating: ["awaiting_final_approval", "in_revision", "error", "cancelled"],
  awaiting_final_approval: ["approved", "in_revision", "cancelled"],
  in_revision: ["creating", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["published", "error", "cancelled"],
  published: [],
  error: ["researching", "planning", "cancelled"],
  cancelled: [],
};

export function canTransition(
  from: ContentTaskStatus,
  to: ContentTaskStatus,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export const STAGE_LABELS: Record<string, string> = {
  research: "Pesquisa",
  plan: "Planejamento",
  initial_approval: "Aprovação inicial",
  copy_art: "Copy e arte",
  audit: "Auditoria",
  final_approval: "Aprovação final",
  publish: "Publicação",
};
