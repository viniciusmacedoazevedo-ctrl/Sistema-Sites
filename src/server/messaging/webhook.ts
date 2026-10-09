import { createHmac, timingSafeEqual } from "node:crypto";

/** Valida o cabeçalho X-Hub-Signature-256 enviado pela Meta (HMAC-SHA256 com o App Secret). */
export function validSignature(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}
