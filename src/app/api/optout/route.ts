import { NextResponse } from "next/server";
import { optOutCompany } from "@/server/data-ops";
import { verifyOptOutToken } from "@/server/messaging/tokens";

/** Endpoint público de descadastro (token assinado; sem autenticação). Também aceita List-Unsubscribe=One-Click. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const body = await req.json().catch(() => ({}));
    token = typeof body.t === "string" ? body.t : null;
  }
  const companyId = token ? verifyOptOutToken(token) : null;
  if (!companyId) return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  await optOutCompany(companyId, "link de descadastro");
  return NextResponse.json({ ok: true });
}
