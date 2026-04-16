/**
 * LinkedIn API — validacao e publicacao (MVP: stub com validacao basica).
 */

export async function testLinkedInConnection(input: {
  accessToken: string;
  organizationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.accessToken) {
    return { ok: false, error: "Access token vazio" };
  }

  if (!input.organizationId) {
    return { ok: false, error: "Organization ID obrigatorio" };
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
  return {
    ok: false,
    error: `Publicacao LinkedIn (organizacao ${input.organizationId}) requer Marketing Developer Platform, escopos de escrita e fluxo OAuth aprovado.`,
  };
}
