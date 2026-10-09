import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Aceita o hash bcrypt puro ou codificado em base64 (evita problemas com "$" em arquivos .env). */
export function decodePasswordHash(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/^['"]|['"]$/g, "");
  if (v.startsWith("$2")) return v;
  try {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    return decoded.startsWith("$2") ? decoded : null;
  } catch {
    return null;
  }
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USERNAME?.trim() || "admin";
  const hash = decodePasswordHash(process.env.ADMIN_PASSWORD_HASH);
  if (!hash) return false;
  const a = Buffer.from(username);
  const b = Buffer.from(expectedUser);
  const userOk = a.length === b.length && timingSafeEqual(a, b);
  const passOk = await bcrypt.compare(password, hash);
  return userOk && passOk;
}

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

/** Limita tentativas de login por IP (persistente no banco). Retorna true se bloqueado. */
export async function isLoginThrottled(ip: string): Promise<boolean> {
  const row = await prisma.authThrottle.findUnique({ where: { key: `login:${ip}` } });
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() > WINDOW_MS) return false;
  return row.count >= MAX_ATTEMPTS;
}

export async function registerLoginFailure(ip: string) {
  const k = `login:${ip}`;
  const row = await prisma.authThrottle.findUnique({ where: { key: k } });
  if (!row || Date.now() - row.windowStart.getTime() > WINDOW_MS) {
    await prisma.authThrottle.upsert({ where: { key: k }, create: { key: k, count: 1, windowStart: new Date() }, update: { count: 1, windowStart: new Date() } });
  } else {
    await prisma.authThrottle.update({ where: { key: k }, data: { count: { increment: 1 } } });
  }
}

export async function clearLoginFailures(ip: string) {
  await prisma.authThrottle.deleteMany({ where: { key: `login:${ip}` } });
}

/** Usuário da sessão atual (rotas de API e páginas do servidor). */
export async function currentUser(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autenticado");
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "desconhecido";
}
