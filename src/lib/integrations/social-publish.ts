/**
 * Publicação real Instagram (Graph) e LinkedIn (UGC) — usado pelo Trigger publish-social.
 * Requer tokens OAuth gravados em integrations.config_metadata_json por workspace.
 */

const FB_GRAPH = "https://graph.facebook.com/v21.0";

async function fetchImageBytes(imageUrl: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(imageUrl, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function guessImageContentType(url: string, fallback: string) {
  const u = url.toLowerCase();
  if (u.includes(".png")) return "image/png";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".gif")) return "image/gif";
  return fallback;
}

type LinkedInRegisterResponse = {
  value?: {
    asset?: string;
    uploadMechanism?: Record<string, { uploadUrl?: string; headers?: Record<string, string> }>;
  };
  message?: string;
};

async function linkedInRegisterAndUploadImage(input: {
  accessToken: string;
  ownerUrn: string;
  imageUrl: string;
}): Promise<{ assetUrn?: string; error?: string }> {
  const buf = await fetchImageBytes(input.imageUrl);
  if (!buf) {
    return { error: "LinkedIn: não foi possível baixar imageUrl." };
  }

  const registerBody = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: input.ownerUrn,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
      supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
    },
  };

  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(registerBody),
  });

  const regJson = (await regRes.json()) as LinkedInRegisterResponse;
  if (!regRes.ok) {
    return {
      error: regJson.message ?? `LinkedIn registerUpload ${regRes.status}`,
    };
  }

  const mechanism = regJson.value?.uploadMechanism?.[
    "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
  ];
  const uploadUrl = mechanism?.uploadUrl;
  const asset = regJson.value?.asset;
  if (!uploadUrl || !asset) {
    return { error: "LinkedIn: resposta registerUpload sem uploadUrl/asset." };
  }

  const contentType = guessImageContentType(input.imageUrl, "image/jpeg");
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...mechanism.headers,
    },
    body: buf,
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    return { error: `LinkedIn upload binário: ${t.slice(0, 400)}` };
  }

  return { assetUrn: asset };
}

export async function publishInstagramFeedPost(input: {
  accessToken: string;
  instagramAccountId: string;
  imageUrl: string;
  caption: string;
  /** Agendamento é feito pelo Trigger.dev (delay); aqui sempre publicação imediata. */
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

  void input.scheduledAt;

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

  return { ok: true, externalPostId: pubJson.id };
}

export async function publishLinkedInOrganizationPost(input: {
  accessToken: string;
  organizationId: string;
  text: string;
  imageUrl?: string;
  /** Publicação imediata; agendamento via Trigger delay. */
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string; postUrl?: string }> {
  if (!input.accessToken?.trim() || !input.organizationId?.trim()) {
    return { ok: false, error: "LinkedIn: access_token ou organization_id ausente." };
  }

  void input.scheduledAt;

  const orgId = input.organizationId.replace(/^urn:li:organization:/, "");
  const authorUrn = `urn:li:organization:${orgId}`;

  let shareMediaCategory: "NONE" | "IMAGE" = "NONE";
  let mediaPayload: Array<Record<string, unknown>> | undefined;

  if (input.imageUrl?.trim()) {
    const up = await linkedInRegisterAndUploadImage({
      accessToken: input.accessToken,
      ownerUrn: authorUrn,
      imageUrl: input.imageUrl.trim(),
    });
    if (up.assetUrn) {
      shareMediaCategory = "IMAGE";
      mediaPayload = [
        {
          status: "READY",
          media: up.assetUrn,
          title: { text: " " },
        },
      ];
    } else if (up.error) {
      console.warn("linkedin_image_fallback_text_only", up.error);
    }
  }

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: input.text.slice(0, 3000) },
    shareMediaCategory,
  };
  if (shareMediaCategory === "IMAGE" && mediaPayload) {
    shareContent.media = mediaPayload;
  }

  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": shareContent,
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

  const id = json.id ?? "linkedin_ugc";
  return {
    ok: true,
    externalPostId: id,
    postUrl: id.startsWith("urn:li:ugcPost:") ? `https://www.linkedin.com/feed/update/${id}/` : undefined,
  };
}
