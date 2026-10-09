import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "@/lib/session";
import { audit } from "@/server/audit";
import { clearLoginFailures, clientIp, isLoginThrottled, registerLoginFailure, verifyCredentials } from "@/server/auth";

const schema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const ip = await clientIp();
  if (await isLoginThrottled(ip)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
  const ok = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!ok) {
    await registerLoginFailure(ip);
    await audit("login.falhou", { actor: parsed.data.username.slice(0, 50), ip });
    return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }
  await clearLoginFailures(ip);
  await audit("login.ok", { actor: parsed.data.username, ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(parsed.data.username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
