import { jwtVerify, SignJWT } from "jose";

/** Sessão assinada (JWT HS256) em cookie httpOnly. Compatível com o runtime Edge (middleware). */
export const SESSION_COOKIE = "sh_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 16 caracteres).");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("sitehunter")
    .sign(key());
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "sitehunter", algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
