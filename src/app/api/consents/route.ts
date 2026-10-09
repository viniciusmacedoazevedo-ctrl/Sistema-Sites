import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeBrPhone, normalizeEmail } from "@/lib/normalize";
import { api, json } from "@/server/api";
import { audit } from "@/server/audit";

const schema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  contact: z.string().min(3).max(200),
  basis: z.string().min(5).max(300),
  evidence: z.string().max(500).optional(),
});

/** Registra um opt-in (autorização de contato) com base e evidência. */
export const POST = api(async (req, { user }) => {
  const d = schema.parse(await json(req));
  const contact = d.channel === "WHATSAPP" ? normalizeBrPhone(d.contact)?.e164 : normalizeEmail(d.contact);
  if (!contact) throw new Error(d.channel === "WHATSAPP" ? "Telefone inválido." : "E-mail inválido.");
  const consent = await prisma.consent.upsert({
    where: { channel_contact: { channel: d.channel, contact } },
    create: { channel: d.channel, contact, basis: d.basis, evidence: d.evidence },
    update: { basis: d.basis, evidence: d.evidence, revokedAt: null },
  });
  await audit("optin.registrado", { actor: user, entity: "Consent", entityId: consent.id, details: { channel: d.channel, basis: d.basis } });
  return { ok: true };
});
