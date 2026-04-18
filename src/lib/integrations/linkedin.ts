/**
 * LinkedIn API — validação e publicação (UGC organização).
 */

import { publishLinkedInOrganizationPost } from "@/lib/integrations/social-publish";

export async function testLinkedInConnection(input: {
  accessToken: string;
  organizationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.accessToken?.trim()) {
    return { ok: false, error: "Access token vazio" };
  }

  if (!input.organizationId?.trim()) {
    return { ok: false, error: "Organization ID obrigatório" };
  }

  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  if (!res.ok) {
    return { ok: false, error: (await res.text()).slice(0, 400) };
  }
  return { ok: true };
}

export async function scheduleLinkedInPost(input: {
  organizationId: string;
  accessToken: string;
  text: string;
  articleUrl?: string;
  imageUrl?: string;
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string }> {
  void input.articleUrl;
  return publishLinkedInOrganizationPost({
    accessToken: input.accessToken,
    organizationId: input.organizationId,
    text: input.text,
    imageUrl: input.imageUrl,
    scheduledAt: input.scheduledAt,
  });
}
