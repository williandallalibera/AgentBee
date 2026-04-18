/**
 * Instagram Graph API — validação e publicação.
 */

import { publishInstagramFeedPost } from "@/lib/integrations/social-publish";

export async function testInstagramConnection(accessToken: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Token vazio" };
  }
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) {
    return { ok: false, error: (await res.text()).slice(0, 400) };
  }
  return { ok: true };
}

export async function scheduleInstagramPost(input: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string }> {
  return publishInstagramFeedPost({
    accessToken: input.accessToken,
    instagramAccountId: input.igUserId,
    imageUrl: input.imageUrl,
    caption: input.caption,
    scheduledAt: input.scheduledAt,
  });
}
