/**
 * Instagram Graph API — publicação/agendamento (MVP: stub com validação de token).
 */

export async function testInstagramConnection(_accessToken: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  /* Em produção: GET graph.facebook.com/me/accounts com token */
  if (!_accessToken) {
    return { ok: false, error: "Token vazio" };
  }
  return {
    ok: true,
  };
}

export async function scheduleInstagramPost(input: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  scheduledAt?: Date;
}): Promise<{ ok: boolean; externalPostId?: string; error?: string }> {
  return {
    ok: false,
    error: `Publicação Instagram (conta ${input.igUserId}) requer Graph API e permissões no app.`,
  };
}
