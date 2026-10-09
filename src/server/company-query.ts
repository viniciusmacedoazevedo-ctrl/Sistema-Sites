import type { Prisma } from "@prisma/client";
import { CRM_LABEL, PRESENCE_LABEL } from "@/lib/labels";

export interface CompanyFilters {
  q?: string;
  crm?: string;
  presenca?: string;
  cidade?: string;
  simulacao?: string;
  ordem?: string;
  pagina?: string;
}

export function companyWhere(f: CompanyFilters): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = {};
  if (f.q) where.OR = [{ name: { contains: f.q, mode: "insensitive" } }, { address: { contains: f.q, mode: "insensitive" } }, { phoneNormalized: { contains: f.q.replace(/\D/g, "") || f.q } }];
  if (f.crm && f.crm in CRM_LABEL) where.crmStatus = f.crm as Prisma.CompanyWhereInput["crmStatus"];
  if (f.presenca && f.presenca in PRESENCE_LABEL) where.presenceStatus = f.presenca as Prisma.CompanyWhereInput["presenceStatus"];
  if (f.cidade) where.city = { contains: f.cidade, mode: "insensitive" };
  if (f.simulacao !== "1") where.isSimulated = false;
  return where;
}

export function companyOrder(ordem?: string): Prisma.CompanyOrderByWithRelationInput[] {
  switch (ordem) {
    case "nome":
      return [{ name: "asc" }];
    case "atividade":
      return [{ lastActivityAt: "desc" }];
    case "recentes":
      return [{ createdAt: "desc" }];
    default:
      return [{ score: { sort: "desc", nulls: "last" } }, { name: "asc" }];
  }
}
