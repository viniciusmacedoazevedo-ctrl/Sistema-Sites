import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { api, json } from "@/server/api";
import { audit } from "@/server/audit";
import { logEvent } from "@/server/crm";
import { deleteCompany, optOutCompany } from "@/server/data-ops";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  crmStatus: z.enum(["NOVO_LEAD", "ANALISADO", "DEMO_GERADA", "DEMO_PUBLICADA", "CONTATO_PREPARADO", "CONTATO_REALIZADO", "RESPONDEU", "INTERESSADO", "NEGOCIACAO", "CLIENTE", "SEM_INTERESSE", "NAO_CONTATAR"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  doNotContact: z.boolean().optional(),
  note: z.string().max(2000).optional(),
});

export const PATCH = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params;
  const data = patchSchema.parse(await json(req));
  const before = await prisma.company.findUniqueOrThrow({ where: { id } });
  let email: string | null | undefined = undefined;
  if (data.email !== undefined) {
    email = data.email ? normalizeEmail(data.email) : null;
    if (data.email && !email) throw new Error("E-mail inválido.");
  }
  if (data.crmStatus === "NAO_CONTATAR" || data.doNotContact) {
    await optOutCompany(id, `manual por ${user}`);
  }
  await prisma.company.update({
    where: { id },
    data: {
      crmStatus: data.crmStatus === "NAO_CONTATAR" ? undefined : data.crmStatus,
      notes: data.notes,
      nextAction: data.nextAction,
      email,
      lastActivityAt: new Date(),
    },
  });
  if (data.crmStatus && data.crmStatus !== before.crmStatus) await logEvent(id, "STATUS_ALTERADO", `${before.crmStatus} → ${data.crmStatus}`);
  if (data.note) await logEvent(id, "OBSERVACAO", data.note);
  await audit("empresa.editada", { actor: user, entity: "Company", entityId: id, details: { fields: Object.keys(data) } });
  return { ok: true };
});

export const DELETE = api<Ctx>(async (req, { params, user }) => {
  const { id } = await params;
  const keep = new URL(req.url).searchParams.get("manterBloqueio") !== "0";
  await deleteCompany(id, { keepSuppressed: keep, actor: user });
  return { ok: true };
});
