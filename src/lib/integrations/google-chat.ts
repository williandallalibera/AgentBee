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
  const host = input.forwardedHost?.trim();
  if (host) {
    const proto = input.forwardedProto?.trim() || "https";
    return buildGoogleChatEndpointUrl(`${proto}://${host}`);
  }

  if (input.requestUrl) {
    const url = new URL(input.requestUrl);
    return buildGoogleChatEndpointUrl(url.origin);
  }

  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    return buildGoogleChatEndpointUrl(publicAppUrl);
  }

  return buildGoogleChatEndpointUrl("http://localhost:3000");
}

export function getGoogleChatAuthAudience(input: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}) {
  const configured = process.env.GOOGLE_CHAT_AUTH_AUDIENCE?.trim();
  if (configured) return configured;
  return resolvePublishedGoogleChatEndpoint(input);
}

/**
 * Candidatos de `aud` para validar o Bearer do Google Chat.
 * O JWT exige correspondência exata com o que está em "Authentication audience" no Cloud Console
 * (URL com ou sem barra final, ou número do projeto).
 */
export function buildGoogleChatAudienceCandidates(input: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): string[] {
  const configured = process.env.GOOGLE_CHAT_AUTH_AUDIENCE?.trim();
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER?.trim();
  const set = new Set<string>();

  if (configured) {
    addGoogleChatAudienceVariants(configured, set);
  } else {
    addGoogleChatAudienceVariants(resolvePublishedGoogleChatEndpoint(input), set);
  }

  if (projectNumber) {
    set.add(projectNumber);
  }

  return Array.from(set);
}

function addGoogleChatAudienceVariants(primary: string, set: Set<string>) {
  const t = primary.trim();
  if (!t) return;
  set.add(t);
  if (t.endsWith("/")) {
    set.add(t.replace(/\/+$/, ""));
  } else {
    set.add(`${t}/`);
  }
}

export async function verifyGoogleChatRequest(input: {
  authorizationHeader: string | null;
  legacyToken: string | null;
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): Promise<GoogleChatVerificationResult> {
  const expectedLegacyToken = process.env.GOOGLE_CHAT_VERIFICATION_TOKEN?.trim();
  const bearerToken = extractBearerToken(input.authorizationHeader);
  const audienceCandidates = bearerToken
    ? buildGoogleChatAudienceCandidates({
        requestUrl: input.requestUrl,
        forwardedHost: input.forwardedHost,
        forwardedProto: input.forwardedProto,
      })
    : [];
  const primaryAudience = audienceCandidates[0] ?? null;

  if (expectedLegacyToken && input.legacyToken) {
    if (verifyGoogleChatToken(input.legacyToken, expectedLegacyToken)) {
      return { ok: true, mode: "legacy_token", audience: null };
    }

    // Em algumas configurações híbridas, o Google Chat envia token legado e bearer.
    // Se o legado falhar mas houver bearer, tentamos validar por bearer para evitar falso negativo.
    if (bearerToken && audienceCandidates.length > 0) {
      const bearerResult = await verifyGoogleChatBearerToken(bearerToken, audienceCandidates);
      return {
        ...bearerResult,
        mode: "bearer",
        audience: primaryAudience,
        error: bearerResult.ok
          ? undefined
          : `Token legado inválido e bearer também falhou: ${bearerResult.error ?? "Unauthorized"}`,
      };
    }

    return {
      ok: false,
      mode: "legacy_token",
      audience: null,
      error: "Token de verificação do Google Chat inválido.",
    };
  }

  if (bearerToken && audienceCandidates.length > 0) {
    const bearerResult = await verifyGoogleChatBearerToken(bearerToken, audienceCandidates);
    return {
      ...bearerResult,
      mode: "bearer",
      audience: primaryAudience,
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

type GoogleChatBearerVerificationResult =
  | { ok: true }
  | { ok: false; error: string };

async function verifyGoogleChatBearerToken(
  token: string,
  audiences: string[],
): Promise<GoogleChatBearerVerificationResult> {
  const uniq = [...new Set(audiences.filter(Boolean))];
  const oidcErrors: string[] = [];

  for (const audience of uniq) {
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
      oidcErrors.push(`aud=${audience}: emissor OIDC inesperado`);
    } catch (error) {
      oidcErrors.push(
        `aud=${audience}: ${error instanceof Error ? error.message : "OIDC inválido"}`,
      );
    }
  }

  for (const audience of uniq) {
    const projectJwtResult = await verifyProjectNumberJwt(token, audience);
    if (projectJwtResult.ok) {
      return { ok: true };
    }
  }

  const hint =
    " Confira no Google Cloud → Chat API → Configuration se 'Authentication audience' é URL idêntica a um dos candidatos (com/sem barra final) ou defina GOOGLE_CHAT_AUTH_AUDIENCE / GOOGLE_CHAT_PROJECT_NUMBER.";
  return {
    ok: false,
    error: `${oidcErrorsSummary(oidcErrors)}${hint}`,
  };
}

function oidcErrorsSummary(errors: string[]): string {
  const head = errors.slice(0, 2).join(" | ");
  return head || "Falha ao validar bearer token do Google Chat.";
}

async function verifyProjectNumberJwt(
  token: string,
  audience: string,
): Promise<GoogleChatBearerVerificationResult> {
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

