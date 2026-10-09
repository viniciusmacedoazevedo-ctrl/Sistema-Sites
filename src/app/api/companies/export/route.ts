import { prisma } from "@/lib/db";
import { CRM_LABEL, PRESENCE_LABEL } from "@/lib/labels";
import { api } from "@/server/api";
import { audit } from "@/server/audit";
import { companyOrder, companyWhere, type CompanyFilters } from "@/server/company-query";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita injeção de fórmulas em planilhas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = api(async (req, { user }) => {
  const f = Object.fromEntries(new URL(req.url).searchParams) as CompanyFilters;
  const rows = await prisma.company.findMany({ where: companyWhere(f), orderBy: companyOrder(f.ordem), include: { site: true }, take: 10_000 });
  const header = ["Nome", "Categoria", "Cidade", "Endereço", "Telefone", "E-mail", "Site informado", "Presença digital", "Pontuação", "Status CRM", "Demonstração", "Próxima ação", "Observações", "Fonte", "Coletado em"];
  const lines = rows.map((c) =>
    [c.name, c.category, c.city, c.address, c.phoneNormalized, c.email, c.website, PRESENCE_LABEL[c.presenceStatus], c.score, CRM_LABEL[c.crmStatus], c.site?.status === "PUBLISHED" ? c.site.publicUrl : "", c.nextAction, c.notes, c.attribution, c.collectedAt.toISOString()]
      .map(csv)
      .join(";"),
  );
  await audit("crm.exportado", { actor: user, details: { rows: rows.length } });
  return new Response("﻿" + [header.map(csv).join(";"), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sitehunter-crm-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
