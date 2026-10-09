import { createHash, createHmac } from "node:crypto";

/** Remove acentos, caixa e pontuação para comparar nomes. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|eireli|epp|s\/?a|mei)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface NormalizedPhone {
  e164: string;
  isMobile: boolean;
}

/**
 * Normaliza telefones brasileiros para E.164 (+55DDXXXXXXXXX).
 * Retorna null se o número não for reconhecível — nunca "completa" dígitos faltantes.
 */
export function normalizeBrPhone(raw: string | null | undefined): NormalizedPhone | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  const local = digits.slice(2);
  const isMobile = local.length === 9 && local.startsWith("9");
  if (local.length === 9 && !isMobile) return null;
  return { e164: `+55${digits}`, isMobile };
}

export function slugify(text: string, max = 40): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "empresa"
  );
}

export function shortHash(value: string, len = 6): string {
  return createHash("sha256").update(value).digest("hex").slice(0, len);
}

/** Hash usado na lista de supressão (não guarda o contato em texto puro). */
export function contactHash(value: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", `suppression:${secret}`).update(value.trim().toLowerCase()).digest("hex");
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatBrPhone(e164: string): string {
  const d = e164.replace(/^\+55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
