import { z } from "zod";
import { normalizeBrPhone, normalizeEmail } from "@/lib/normalize";
import { api, json } from "@/server/api";
import { audit } from "@/server/audit";
import { suppressContacts } from "@/server/data-ops";

export const POST = api(async (req, { user }) => {
  const { contact, reason } = z.object({ contact: z.string().min(3).max(200), reason: z.string().max(200).default("bloqueio manual") }).parse(await json(req));
  const value = normalizeBrPhone(contact)?.e164 ?? normalizeEmail(contact);
  if (!value) throw new Error("Informe um telefone ou e-mail válido.");
  const label = value.includes("@") ? `${value.slice(0, 2)}…@${value.split("@")[1]}` : `…${value.slice(-4)}`;
  await suppressContacts([value], reason, label);
  await audit("bloqueio.adicionado", { actor: user, details: { label } });
  return { ok: true };
});
