import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/layout/dashboard-frame";
import { getActiveWorkspaceId, getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/env";

export default async function DashboardGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (isLocalMode()) {
    return (
      <DashboardFrame
        localMode
        currentUser={{
          name: "Admin Local",
          email: "admin@agentbee.local",
        }}
        workspaceId={null}
        pendingApprovalsCount={0}
      >
        {children}
      </DashboardFrame>
    );
  }

  const { supabase, user } = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, slug)")
    .eq("user_id", user.id);

  const workspaces =
    memberships
      ?.map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = (m as any).workspaces;
        return w ? { id: w.id as string, name: w.name as string } : null;
      })
      .filter(Boolean) ?? [];

  if (workspaces.length === 0) {
    redirect("/onboarding");
  }

  const currentUserName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Admin User";
  const currentUserEmail = user.email ?? "workspace@agentbee.app";

  const cookieWs = await getActiveWorkspaceId();
  const activeRow =
    memberships?.find((m) => m.workspace_id === cookieWs) ?? memberships?.[0];
  const workspaceId = activeRow?.workspace_id ?? null;

  let pendingApprovalsCount = 0;
  if (workspaceId) {
    const { count } = await supabase
      .from("approvals")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending");
    pendingApprovalsCount = count ?? 0;
  }

  return (
    <DashboardFrame
      currentUser={{
        name: currentUserName,
        email: currentUserEmail,
      }}
      workspaceId={workspaceId}
      pendingApprovalsCount={pendingApprovalsCount}
    >
      {children}
    </DashboardFrame>
  );
}
