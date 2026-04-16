import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "@/lib/types/database";

const WORKSPACE_COOKIE = "agentbee_workspace_id";

export async function getSessionUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireUser() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getActiveWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(WORKSPACE_COOKIE)?.value;
  if (!raw) return null;
  return raw;
}

export async function requireWorkspace() {
  const { supabase, user } = await requireUser();
  const wsId = await getActiveWorkspaceId();
  if (!wsId) {
    return { supabase, user, workspaceId: null as string | null, role: null as WorkspaceRole | null };
  }
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wsId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return { supabase, user, workspaceId: null, role: null };
  }

  return {
    supabase,
    user,
    workspaceId: wsId,
    role: member.role as WorkspaceRole,
  };
}

export async function requireWorkspaceMember() {
  const ctx = await requireWorkspace();
  if (!ctx.workspaceId || !ctx.role) {
    redirect("/onboarding");
  }
  return ctx as typeof ctx & {
    workspaceId: string;
    role: WorkspaceRole;
  };
}

export { WORKSPACE_COOKIE };
