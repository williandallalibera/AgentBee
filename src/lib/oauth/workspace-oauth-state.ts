import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  const raw = process.env.APPROVAL_JWT_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error("APPROVAL_JWT_SECRET deve ter pelo menos 16 caracteres para OAuth state.");
  }
  return new TextEncoder().encode(raw);
}

export async function signWorkspaceOAuthState(input: {
  workspaceId: string;
  provider: "linkedin" | "instagram";
}): Promise<string> {
  return new SignJWT({
    workspaceId: input.workspaceId,
    provider: input.provider,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(getSecret());
}

export async function verifyWorkspaceOAuthState(token: string): Promise<{
  workspaceId: string;
  provider: string;
}> {
  const { payload } = await jwtVerify(token, getSecret());
  const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : "";
  const provider = typeof payload.provider === "string" ? payload.provider : "";
  if (!workspaceId || !provider) {
    throw new Error("State OAuth inválido");
  }
  return { workspaceId, provider };
}
