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
    redirect("/integrations?oauth_error=instagram_denied");
  }

  let workspaceId: string;
  try {
    const s = await verifyWorkspaceOAuthState(state);
    if (s.provider !== "instagram") throw new Error("provider");
    workspaceId = s.workspaceId;
  } catch {
    redirect("/integrations?oauth_error=instagram_state");
  }

  const clientId = process.env.META_APP_ID?.trim();
  const clientSecret = process.env.META_APP_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUri = `${appUrl}/api/oauth/instagram/callback`;

  if (!clientId || !clientSecret) {
    redirect("/integrations?oauth_error=instagram_config");
  }

  const tokenUrl =
    `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&code=${encodeURIComponent(code)}`;

  const tokenRes = await fetch(tokenUrl);
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: { message?: string };
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    redirect("/integrations?oauth_error=instagram_token");
  }

  const accessToken = tokenJson.access_token;

  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
  );
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{
      id?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>;
  };

  let instagramAccountId = "";
  const firstPage = pagesJson.data?.[0];
  if (firstPage?.instagram_business_account?.id) {
    instagramAccountId = firstPage.instagram_business_account.id;
  }

  const supabase = createServiceSupabaseClient();
  const { data: existing } = await supabase
    .from("integrations")
    .select("config_metadata_json")
    .eq("workspace_id", workspaceId)
    .eq("provider", "instagram")
    .maybeSingle();

  const prev = (existing?.config_metadata_json ?? {}) as Record<string, unknown>;

  await supabase.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: "instagram",
      status: "connected",
      config_metadata_json: {
        ...prev,
        access_token: accessToken,
        instagram_account_id: instagramAccountId || prev.instagram_account_id || "",
        page_id: firstPage?.id ?? prev.page_id ?? "",
      },
      last_tested_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );

  redirect("/integrations?oauth_ok=instagram");
}
