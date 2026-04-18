import { redirect } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { signWorkspaceOAuthState } from "@/lib/oauth/workspace-oauth-state";

export const dynamic = "force-dynamic";

/**
 * Inicia OAuth LinkedIn — redireciona para autorização.
 */
export async function GET() {
  const { workspaceId } = await requireWorkspaceMember();
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI?.trim() || `${appUrl}/api/oauth/linkedin/callback`;

  if (!clientId || !appUrl) {
    redirect("/integrations?oauth_error=linkedin_config");
  }

  const state = await signWorkspaceOAuthState({
    workspaceId,
    provider: "linkedin",
  });

  const scope = [
    "openid",
    "profile",
    "email",
    "w_organization_social",
    "r_organization_social",
  ].join(" ");

  const url =
    `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(scope)}`;

  redirect(url);
}
