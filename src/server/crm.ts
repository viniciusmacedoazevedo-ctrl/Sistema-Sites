import type { CrmStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const AUTO_ORDER: CrmStatus[] = ["NOVO_LEAD", "ANALISADO", "DEMO_GERADA", "DEMO_PUBLICADA", "CONTATO_PREPARADO", "CONTATO_REALIZADO"];

/** Avança o status do CRM automaticamente, sem regredir nem sobrescrever status manuais. */
export async function advanceCrm(companyId: string, to: CrmStatus, nextAction?: string | null) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { crmStatus: true } });
  if (!company) return;
  const fromIdx = AUTO_ORDER.indexOf(company.crmStatus);
  const toIdx = AUTO_ORDER.indexOf(to);
  const data: { crmStatus?: CrmStatus; lastActivityAt: Date; nextAction?: string | null } = { lastActivityAt: new Date() };
  if (fromIdx !== -1 && toIdx > fromIdx) data.crmStatus = to;
  if (nextAction !== undefined && fromIdx !== -1) data.nextAction = nextAction;
  await prisma.company.update({ where: { id: companyId }, data });
}

export async function logEvent(companyId: string, type: string, content?: string | null, channel?: string | null) {
  await prisma.contactEvent.create({ data: { companyId, type, content: content ?? null, channel: channel ?? null } });
}
