/**
 * Google Chat — envio via webhook de espaço (configurável por workspace em integrations).
 */

export async function sendGoogleChatMessage(
  webhookUrl: string,
  payload: {
    title: string;
    subtitle?: string;
    lines: string[];
    linkUrl?: string;
    linkLabel?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const text = [
    `*${payload.title}*`,
    payload.subtitle ? `_${payload.subtitle}_` : "",
    "",
    ...payload.lines,
    payload.linkUrl
      ? `\n<${payload.linkUrl}|${payload.linkLabel ?? "Abrir no AgentBee"}>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return { ok: false, error: await res.text() };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro de rede",
    };
  }
}

export function verifyGoogleChatToken(
  token: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  return token === expected;
}
