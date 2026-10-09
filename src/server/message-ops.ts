import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { audit } from "./audit";
import { advanceCrm, logEvent } from "./crm";
import { evaluateForCompany } from "./pipeline";
import { enqueue } from "./queue";

/** Reavalia uma mensagem bloqueada/rascunho (ex.: após registrar opt-in) e enfileira se elegível. */
export async function releaseMessage(id: string, actor: string) {
  const msg = await prisma.message.findUniqueOrThrow({ where: { id }, include: { company: true, run: true } });
  if (!["DRAFT", "BLOCKED", "WAITING_CONFIG"].includes(msg.status)) throw new Error("Só é possível liberar rascunhos ou mensagens bloqueadas.");
  const settings = await getSettings();
  const mode = msg.run?.mode ?? (msg.company.isSimulated ? "SIMULATION" : "REAL");
  const channels: ("WHATSAPP" | "EMAIL")[] = msg.channel === "MANUAL" ? ["WHATSAPP", "EMAIL"] : [msg.channel as "WHATSAPP" | "EMAIL"];
  let last = null;
  for (const channel of channels) {
    const r = await evaluateForCompany(msg.company, channel, mode, settings, msg.id);
    last = r;
    if (r.decision === "SEND" || r.decision === "DEFER") {
      await prisma.message.update({ where: { id }, data: { channel, recipient: r.recipient, status: "QUEUED", blockReason: null, consentBasis: r.consentBasis } });
      await enqueue({ type: "SEND_MESSAGE", companyId: msg.companyId, idempotencyKey: `${msg.id}:SEND:manual:${Date.now()}`, priority: 70, maxAttempts: 4 });
      await audit("mensagem.liberada", { actor, entity: "Message", entityId: id });
      return { queued: true, reason: r.reason };
    }
  }
  await prisma.message.update({ where: { id }, data: { blockReason: last?.reason ?? null, status: last?.decision === "WAITING_CONFIG" ? "WAITING_CONFIG" : "BLOCKED" } });
  return { queued: false, reason: last?.reason };
}

export async function markManuallySent(id: string, actor: string) {
  const msg = await prisma.message.findUniqueOrThrow({ where: { id }, include: { company: true } });
  if (msg.company.isSimulated) throw new Error("Empresa fictícia (simulação).");
  if (["SENT", "DELIVERED", "READ"].includes(msg.status)) return;
  await prisma.message.update({ where: { id }, data: { status: "SENT", sentAt: msg.sentAt ?? new Date(), error: null, blockReason: msg.status === "NEEDS_VERIFICATION" ? null : msg.blockReason } });
  await logEvent(msg.companyId, "MENSAGEM_ENVIADA", `${msg.status === "NEEDS_VERIFICATION" ? "Envio confirmado manualmente" : "Enviada manualmente pelo operador"}`, msg.channel);
  await advanceCrm(msg.companyId, "CONTATO_REALIZADO", "Aguardar resposta; acompanhar em 3 dias úteis.");
  await audit("mensagem.marcada_enviada", { actor, entity: "Message", entityId: id });
}

/** Operador verificou no provedor que a mensagem NÃO foi entregue: volta para a fila. */
export async function confirmNotSent(id: string, actor: string) {
  const msg = await prisma.message.findUniqueOrThrow({ where: { id } });
  if (msg.status !== "NEEDS_VERIFICATION") throw new Error("Apenas mensagens em verificação.");
  await prisma.message.update({ where: { id }, data: { status: "QUEUED", error: null } });
  await enqueue({ type: "SEND_MESSAGE", companyId: msg.companyId, idempotencyKey: `${msg.id}:SEND:verified:${Date.now()}`, priority: 70, maxAttempts: 4 });
  await audit("mensagem.reenfileirada_apos_verificacao", { actor, entity: "Message", entityId: id });
}

export async function cancelMessage(id: string, actor: string) {
  await prisma.message.updateMany({ where: { id, status: { in: ["DRAFT", "BLOCKED", "WAITING_CONFIG", "QUEUED", "NEEDS_VERIFICATION"] } }, data: { status: "CANCELED" } });
  await audit("mensagem.cancelada", { actor, entity: "Message", entityId: id });
}

export async function updateMessageBody(id: string, body: string, actor: string) {
  const res = await prisma.message.updateMany({ where: { id, status: { in: ["DRAFT", "BLOCKED", "WAITING_CONFIG"] } }, data: { body, bodySource: "editada manualmente" } });
  if (res.count === 0) throw new Error("Só é possível editar mensagens ainda não enviadas.");
  await audit("mensagem.editada", { actor, entity: "Message", entityId: id });
}
