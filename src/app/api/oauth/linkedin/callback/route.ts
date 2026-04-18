import { redirect } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { verifyWorkspaceOAuthState } from "@/lib/oauth/workspace-oauth-state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err || !code || !state) {
    redirect("/integrations?oauth_error=linkedin_denied");
  }

  let workspaceId: string;
  try {
    const s = await verifyWorkspaceOAuthState(state);
    if (s.provider !== "linkedin") throw new Error("provider");
    workspaceId = s.workspaceId;
  } catch {
    redirect("/integrations?oauth_error=linkedin_state");
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI?.trim() || `${appUrl}/api/oauth/linkedin/callback`;

  if (!clientId || !clientSecret) {
    redirect("/integrations?oauth_error=linkedin_config");
  }

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    redirect("/integrations?oauth_error=linkedin_token");
  }

  const supabase = createServiceSupabaseClient();
  const { data: existing } = await supabase
    .from("integrations")
    .select("config_metadata_json")
    .eq("workspace_id", workspaceId)
    .eq("provider", "linkedin")
    .maybeSingle();

  const prev = (existing?.config_metadata_json ?? {}) as Record<string, unknown>;

  await supabase.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: "linkedin",
      status: "connected",
      config_metadata_json: {
        ...prev,
        access_token: tokenJson.access_token,
        token_expires_in: tokenJson.expires_in ?? null,
        organization_id: typeof prev.organization_id === "string" ? prev.organization_id : "",
      },
      last_tested_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );

  redirect("/integrations?oauth_ok=linkedin");
}
