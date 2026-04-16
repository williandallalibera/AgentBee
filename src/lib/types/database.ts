export type WorkspaceRole = "admin";

export type ContentTaskStatus =
  | "draft"
  | "researching"
  | "planning"
  | "awaiting_initial_approval"
  | "creating"
  | "awaiting_final_approval"
  | "in_revision"
  | "approved"
  | "scheduled"
  | "published"
  | "error"
  | "cancelled";

export type CalendarItemStatus =
  | "planned"
  | "awaiting_approval"
  | "approved"
  | "blocked"
  | "rescheduled"
  | "published"
  | "cancelled";

export type PublicationChannel = "instagram" | "linkedin" | "google_chat";

export type IntegrationProvider =
  | "openai"
  | "google_chat"
  | "google_workspace"
  | "instagram"
  | "linkedin";
