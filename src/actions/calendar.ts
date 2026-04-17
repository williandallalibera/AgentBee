"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { generateCalendarSuggestionsCore } from "@/lib/calendar/suggestions";
import { createTaskFromCalendarItemCore } from "@/lib/calendar/task-from-calendar-item";

export async function generateCalendarSuggestions(input?: {
  weeksAhead?: number;
  postsPerWeek?: number;
}) {
  const { supabase, workspaceId } = await requireWorkspaceMember();
  const weeksAhead = Math.min(Math.max(input?.weeksAhead ?? 4, 1), 12);
  const postsPerWeek = Math.min(Math.max(input?.postsPerWeek ?? 2, 1), 7);

  const result = await generateCalendarSuggestionsCore(supabase, {
    workspaceId,
    weeksAhead,
    postsPerWeek,
  });

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidatePath("/campaigns");
  return result;
}

export async function generateCalendarSuggestionsFromForm(): Promise<void> {
  const result = await generateCalendarSuggestions();
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}

export async function createTaskFromCalendarItem(input: { calendarItemId: string }) {
  const { supabase, user, workspaceId } = await requireWorkspaceMember();

  const result = await createTaskFromCalendarItemCore(supabase, {
    workspaceId,
    calendarItemId: input.calendarItemId,
    requestedByUserId: user.id,
  });

  if ("error" in result) {
    return result;
  }

  revalidatePath("/calendar");
  revalidatePath("/content");
  return { ok: true, taskId: result.taskId };
}

export async function createTaskFromCalendarItemForm(
  formData: FormData,
): Promise<void> {
  const calendarItemId = String(formData.get("calendar_item_id") ?? "");
  const result = await createTaskFromCalendarItem({ calendarItemId });
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}

export async function rescheduleCalendarItem(input: {
  calendarItemId: string;
  plannedDate: string;
}) {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { error } = await supabase
    .from("calendar_items")
    .update({
      planned_date: input.plannedDate,
      status: "rescheduled",
      blocked_at: null,
      blocked_reason: null,
    })
    .eq("id", input.calendarItemId)
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function rescheduleCalendarItemForm(formData: FormData): Promise<void> {
  const calendarItemId = String(formData.get("calendar_item_id") ?? "");
  const plannedDate = String(formData.get("planned_date") ?? "");
  const result = await rescheduleCalendarItem({ calendarItemId, plannedDate });
  if ("error" in result && result.error) {
    throw new Error(result.error);
  }
}
