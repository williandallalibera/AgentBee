/**
 * Publicação real Instagram (Graph) e LinkedIn (UGC) — usado pelo Trigger publish-social.
 * Requer tokens OAuth gravados em integrations.config_metadata_json por workspace.
 */

const FB_GRAPH = "https://graph.facebook.com/v21.0";

export async function publishInstagramFeedPost(input: {
  accessToken: string;
  instagramAccountId: string;
  imageUrl: string;
  caption: string;
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string }> {
  if (!input.accessToken?.trim() || !input.instagramAccountId?.trim()) {
    return {
      ok: false,
      error: "Instagram: access_token ou instagram_account_id ausente na integração.",
    };
  }
  if (!input.imageUrl?.trim()) {
    return { ok: false, error: "Instagram: image_url pública obrigatória." };
  }

  const params = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption.slice(0, 2200),
    access_token: input.accessToken,
  });

  const createRes = await fetch(
    `${FB_GRAPH}/${encodeURIComponent(input.instagramAccountId)}/media?${params}`,
    { method: "POST" },
  );
  const createJson = (await createRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!createRes.ok || !createJson.id) {
    return {
      ok: false,
      error:
        createJson.error?.message ??
        (await createRes.text()).slice(0, 500) ??
        "Falha ao criar container de mídia",
    };
  }

  const pubParams = new URLSearchParams({
    creation_id: createJson.id,
    access_token: input.accessToken,
  });
  const pubRes = await fetch(
    `${FB_GRAPH}/${encodeURIComponent(input.instagramAccountId)}/media_publish?${pubParams}`,
    { method: "POST" },
  );
  const pubJson = (await pubRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!pubRes.ok || !pubJson.id) {
    return {
      ok: false,
      error: pubJson.error?.message ?? "Falha ao publicar mídia no Instagram",
    };
  }

  void input.scheduledAt;
  return { ok: true, externalPostId: pubJson.id };
}

export async function publishLinkedInOrganizationPost(input: {
  accessToken: string;
  organizationId: string;
  text: string;
  imageUrl?: string;
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string }> {
  if (!input.accessToken?.trim() || !input.organizationId?.trim()) {
    return { ok: false, error: "LinkedIn: access_token ou organization_id ausente." };
  }

  if (input.scheduledAt && input.scheduledAt.getTime() > Date.now() + 60_000) {
    return {
      ok: false,
      error:
        "LinkedIn: agendamento futuro via API não está habilitado — publique sem data futura ou use publicação imediata.",
    };
  }

  const orgId = input.organizationId.replace(/^urn:li:organization:/, "");
  const authorUrn = `urn:li:organization:${orgId}`;

  void input.imageUrl;

  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: input.text.slice(0, 3000) },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    id?: string;
    message?: string;
    error?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok) {
    const msg =
      json.message ??
      json.error ??
      json.errors?.[0]?.message ??
      (await res.text()).slice(0, 500);
    return { ok: false, error: msg };
  }

  return { ok: true, externalPostId: json.id ?? "linkedin_ugc" };
}
