import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { normalizeBrPhone } from "@/lib/normalize";
import { logEvent } from "@/server/crm";
import { optOutCompany } from "@/server/data-ops";
import { validSignature } from "@/server/messaging/webhook";

/**
 * Webhook da WhatsApp Cloud API: recebe respostas e status de entrega.
 * Configure no app da Meta: URL = <PUBLIC_BASE_URL>/api/webhooks/whatsapp, token = WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && env.whatsapp.verifyToken && p.get("hub.verify_token") === env.whatsapp.verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

const STOP_WORDS = /^\s*(parar|pare|sair|stop|cancelar|descadastrar|remover|não quero|nao quero)\b/i;

interface WaPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: { from: string; id: string; type: string; text?: { body?: string } }[];
        statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), env.whatsapp.appSecret)) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  const payload = JSON.parse(raw) as WaPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const st of value.statuses ?? []) {
        const map: Record<string, "DELIVERED" | "READ" | "FAILED" | "SENT"> = { delivered: "DELIVERED", read: "READ", failed: "FAILED", sent: "SENT" };
        const status = map[st.status];
        if (status) await prisma.message.updateMany({ where: { providerMessageId: st.id }, data: { status, error: st.errors?.[0]?.title ?? undefined } });
      }
      for (const m of value.messages ?? []) {
        const phone = normalizeBrPhone(`+${m.from}`)?.e164;
        if (!phone) continue;
        const company = await prisma.company.findFirst({ where: { phoneNormalized: phone, isSimulated: false } });
        if (!company) continue;
        const text = m.text?.body ?? `[${m.type}]`;
        await logEvent(company.id, "RESPOSTA_RECEBIDA", text.slice(0, 2000), "WHATSAPP");
        if (STOP_WORDS.test(text)) {
          await optOutCompany(company.id, "resposta PARAR no WhatsApp");
        } else if (["CONTATO_REALIZADO", "CONTATO_PREPARADO", "DEMO_PUBLICADA"].includes(company.crmStatus)) {
          await prisma.company.update({ where: { id: company.id }, data: { crmStatus: "RESPONDEU", nextAction: "Responder a mensagem recebida (janela de 24h aberta).", lastActivityAt: new Date() } });
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
