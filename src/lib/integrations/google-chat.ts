/**
 * Google Chat — envio via webhook de espaço (configurável por workspace em integrations).
 */

import { createRemoteJWKSet, decodeProtectedHeader, importX509, jwtVerify } from "jose";

const GOOGLE_CHAT_ISSUER_EMAIL = "chat@system.gserviceaccount.com";
const GOOGLE_OIDC_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const GOOGLE_CHAT_X509_URL =
  "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";

type GoogleChatVerificationResult = {
  ok: boolean;
  mode: "bearer" | "legacy_token" | "none";
  audience: string | null;
  error?: string;
};

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

export function buildGoogleChatEndpointUrl(appUrl: string) {
  return `${appUrl.replace(/\/$/, "")}/api/webhooks/google-chat`;
}

export function buildGoogleChatLegacySetupUrl(appUrl: string) {
  return `${buildGoogleChatEndpointUrl(appUrl)}?token=<GOOGLE_CHAT_VERIFICATION_TOKEN>`;
}

export function resolvePublishedGoogleChatEndpoint(input: {
  requestUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}) {
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    return buildGoogleChatEndpointUrl(publicAppUrl);
  }

  const host = input.forwardedHost?.trim();
  if (host) {
    const proto = input.forwardedProto?.trim() || "https";
    return buildGoogleChatEndpointUrl(`${proto}://${host}`);
  }

  if (input.requestUrl) {
    const url = new URL(input.requestUrl);
    return buildGoogleChatEndpointUrl(url.origin);
  }

  return buildGoogleChatEndpointUrl("http://localhost:3000");
}

export function getGoogleChatAuthAudience(requestUrl: string) {
  const configured = process.env.GOOGLE_CHAT_AUTH_AUDIENCE?.trim();
  if (configured) return configured;
  return resolvePublishedGoogleChatEndpoint({ requestUrl });
}

export async function verifyGoogleChatRequest(input: {
  authorizationHeader: string | null;
  legacyToken: string | null;
  requestUrl: string;
}): Promise<GoogleChatVerificationResult> {
  const expectedLegacyToken = process.env.GOOGLE_CHAT_VERIFICATION_TOKEN?.trim();
  if (expectedLegacyToken) {
    return verifyGoogleChatToken(input.legacyToken, expectedLegacyToken)
      ? { ok: true, mode: "legacy_token", audience: null }
      : {
          ok: false,
          mode: "legacy_token",
          audience: null,
          error: "Token de verificação do Google Chat inválido.",
        };
  }

  const bearerToken = extractBearerToken(input.authorizationHeader);
  if (bearerToken) {
    const audience = getGoogleChatAuthAudience(input.requestUrl);
    const bearerResult = await verifyGoogleChatBearerToken(bearerToken, audience);
    return {
      ...bearerResult,
      mode: "bearer",
      audience,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return { ok: true, mode: "none", audience: null };
  }

  return {
    ok: false,
    mode: "none",
    audience: null,
    error:
      "Requisição sem autenticação do Google Chat. Configure o app com bearer auth ou use o token legado.",
  };
}

async function verifyGoogleChatBearerToken(token: string, audience: string) {
  try {
    const { payload } = await jwtVerify(token, GOOGLE_OIDC_JWKS, {
      audience,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    const emailVerified = payload.email_verified === true;
    if (email === GOOGLE_CHAT_ISSUER_EMAIL && emailVerified) {
      return { ok: true };
    }
  } catch (error) {
    const projectJwtResult = await verifyProjectNumberJwt(token, audience);
    if (projectJwtResult.ok) {
      return projectJwtResult;
    }

    return {
      ok: false,
      error: combineGoogleChatErrors(
        error,
        projectJwtResult.error ?? "Falha ao validar bearer token do Google Chat.",
      ),
    };
  }

  return {
    ok: false,
    error:
      "Bearer token do Google Chat não pertence ao emissor esperado chat@system.gserviceaccount.com.",
  };
}

async function verifyProjectNumberJwt(token: string, audience: string) {
  try {
    const header = decodeProtectedHeader(token);
    if (!header.kid || typeof header.kid !== "string") {
      return { ok: false, error: "JWT do Google Chat sem kid no cabeçalho." };
    }

    const response = await fetch(GOOGLE_CHAT_X509_URL, {
      cache: "force-cache",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Falha ao baixar certificados do Google Chat (${response.status}).`,
      };
    }

    const certs = (await response.json()) as Record<string, string>;
    const cert = certs[header.kid];
    if (!cert) {
      return { ok: false, error: "Certificado do Google Chat não encontrado para este kid." };
    }

    const key = await importX509(cert, header.alg ?? "RS256");
    await jwtVerify(token, key, {
      audience,
      issuer: GOOGLE_CHAT_ISSUER_EMAIL,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao validar JWT por número de projeto do Google Chat.",
    };
  }
}

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, value] = authorizationHeader.split(/\s+/, 2);
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value.trim() || null;
}

function combineGoogleChatErrors(first: unknown, second: string) {
  const firstMessage = first instanceof Error ? first.message : "Falha ao validar ID token.";
  return `${firstMessage} ${second}`.trim();
}
