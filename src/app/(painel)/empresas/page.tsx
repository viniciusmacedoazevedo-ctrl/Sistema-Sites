import Link from "next/link";
import { prisma } from "@/lib/db";
import { CRM_LABEL, PRESENCE_LABEL, SITE_STATUS_LABEL } from "@/lib/labels";
import { Badge, Card, Empty, PageHeader, dt } from "@/components/ui";
import { companyOrder, companyWhere, type CompanyFilters } from "@/server/company-query";

export const metadata = { title: "Empresas / CRM" };
const PAGE = 50;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<CompanyFilters> }) {
  const f = await searchParams;
  const page = Math.max(1, Number(f.pagina ?? 1));
  const where = companyWhere(f);
  const [total, companies, byStatus] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({ where, orderBy: companyOrder(f.ordem), skip: (page - 1) * PAGE, take: PAGE, include: { site: { select: { status: true, publicUrl: true } } } }),
    prisma.company.groupBy({ by: ["crmStatus"], where: companyWhere({ simulacao: f.simulacao }), _count: true }),
  ]);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };
  const countOf = Object.fromEntries(byStatus.map((b) => [b.crmStatus, b._count]));

  return (
    <>
      <PageHeader title="Empresas e CRM" subtitle={`${total} empresa(s) · dados de fontes públicas permitidas, com atribuição`} actions={<a className="btn-secondary" href={`/api/companies/export${qs({ pagina: undefined })}`}>Exportar CSV</a>} />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={qs({ crm: undefined, pagina: undefined })} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!f.crm ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600"}`}>Todos</Link>
        {Object.entries(CRM_LABEL).map(([k, v]) => (
          <Link key={k} href={qs({ crm: k, pagina: undefined })} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ring-1 ring-inset ${f.crm === k ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600 hover:ring-blue-500/50"}`}>
            {v} <span className="opacity-60">{countOf[k] ?? 0}</span>
          </Link>
        ))}
      </div>

      <Card>
        <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={f.q} placeholder="Buscar nome, endereço ou telefone" className="input lg:col-span-2" />
          <input name="cidade" defaultValue={f.cidade} placeholder="Cidade" className="input" />
          <select name="presenca" defaultValue={f.presenca ?? ""} className="input">
            <option value="">Presença: todas</option>
            {Object.entries(PRESENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="ordem" defaultValue={f.ordem ?? ""} className="input">
            <option value="">Ordenar: pontuação</option>
            <option value="atividade">Última atividade</option>
            <option value="recentes">Mais recentes</option>
            <option value="nome">Nome</option>
          </select>
          <div className="flex items-center gap-3">
            {f.crm && <input type="hidden" name="crm" value={f.crm} />}
            <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" name="simulacao" value="1" defaultChecked={f.simulacao === "1"} /> Incluir simulação</label>
            <button className="btn-primary">Filtrar</button>
          </div>
        </form>

        {companies.length === 0 ? (
          <Empty>Nenhuma empresa encontrada com estes filtros.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Empresa</th><th>Pontuação</th><th>Presença digital</th><th>Demonstração</th><th>Status CRM</th><th>Próxima ação</th><th>Atividade</th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="min-w-48">
                      <Link href={`/empresas/${c.id}`} className="font-medium text-white hover:text-blue-300">{c.name}</Link>
                      <p className="text-xs text-slate-500">{[c.category, c.city].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="tabular-nums font-semibold text-blue-200">{c.score ?? "—"}</td>
                    <td><Badge status={c.presenceStatus} label={PRESENCE_LABEL[c.presenceStatus]} /></td>
                    <td>{c.site ? (c.site.publicUrl && c.site.status === "PUBLISHED" ? <a className="text-blue-300 hover:underline" href={c.site.publicUrl} target="_blank" rel="noreferrer">publicada</a> : <Badge status={c.site.status} label={SITE_STATUS_LABEL[c.site.status]} />) : "—"}</td>
                    <td><Badge status={c.crmStatus} label={CRM_LABEL[c.crmStatus]} /></td>
                    <td className="max-w-xs text-xs text-slate-400">{c.nextAction ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dt(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>Página {page} de {Math.ceil(total / PAGE)}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn-secondary" href={qs({ pagina: String(page - 1) })}>Anterior</Link>}
              {page * PAGE < total && <Link className="btn-secondary" href={qs({ pagina: String(page + 1) })}>Próxima</Link>}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
