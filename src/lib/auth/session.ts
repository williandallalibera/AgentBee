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

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  if (!memberships?.length) {
    return { supabase, user, workspaceId: null, role: null };
  }

  const activeMembership =
    memberships.find((member) => member.workspace_id === wsId) ?? memberships[0];

  if (!activeMembership) {
    return { supabase, user, workspaceId: null, role: null };
  }

  return {
    supabase,
    user,
    workspaceId: activeMembership.workspace_id,
    role: activeMembership.role as WorkspaceRole,
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
