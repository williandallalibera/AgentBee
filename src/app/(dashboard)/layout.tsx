import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardFrame } from "@/components/layout/dashboard-frame";
import { getSessionUser, WORKSPACE_COOKIE } from "@/lib/auth/session";
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

  const cookieStore = await cookies();
  let currentId = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;

  if (!currentId && workspaces.length > 0) {
    currentId = workspaces[0]!.id;
    cookieStore.set(WORKSPACE_COOKIE, currentId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (workspaces.length === 0) {
    redirect("/onboarding");
  }

  const currentUserName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "Admin User";
  const currentUserEmail = user.email ?? "workspace@agentbee.app";

  return (
    <DashboardFrame
      currentUser={{
        name: currentUserName,
        email: currentUserEmail,
      }}
    >
      {children}
    </DashboardFrame>
  );
}
