import { redirect } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { signWorkspaceOAuthState } from "@/lib/oauth/workspace-oauth-state";

export const dynamic = "force-dynamic";

/**
 * Inicia OAuth Meta (Facebook) para Instagram Graph.
 */
export async function GET() {
  const { workspaceId } = await requireWorkspaceMember();
  const clientId = process.env.META_APP_ID?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUri = `${appUrl}/api/oauth/instagram/callback`;

  if (!clientId || !appUrl) {
    redirect("/integrations?oauth_error=instagram_config");
  }

  const state = await signWorkspaceOAuthState({
    workspaceId,
    provider: "instagram",
  });

  const scope = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ].join(",");

  const url =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(scope)}`;

  redirect(url);
}
