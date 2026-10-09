import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET não configurado");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", `optout:${secret()}`).update(payload).digest("base64url").slice(0, 32);
}

/** Token assinado para links de descadastro / pedido de remoção (sem expiração). */
export function optOutToken(companyId: string): string {
  return `${companyId}.${sign(companyId)}`;
}

export function verifyOptOutToken(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function optOutUrl(baseUrl: string | undefined, companyId: string): string | null {
  return baseUrl ? `${baseUrl}/descadastro?t=${encodeURIComponent(optOutToken(companyId))}` : null;
}
