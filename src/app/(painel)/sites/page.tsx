import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_STATUS_LABEL } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { ActionButton } from "@/components/client";
import { Badge, Card, Empty, PageHeader, dt } from "@/components/ui";
import type { SiteStatus } from "@prisma/client";

export const metadata = { title: "Demonstrações" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const settings = await getSettings();
  const where = status && status in SITE_STATUS_LABEL ? { status: status as SiteStatus } : {};
  const [sites, published] = await Promise.all([
    prisma.demoSite.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { company: { select: { name: true, city: true, isSimulated: true } } } }),
    prisma.demoSite.count({ where: { status: "PUBLISHED" } }),
  ]);
  return (
    <>
      <PageHeader title="Demonstrações de sites" subtitle={`${published} publicada(s) de no máximo ${settings.maxPublishedSites} · publicação: ${settings.publisher === "vercel" ? "Vercel" : "servidor próprio (/d/…)"} · retenção ${settings.demoRetentionDays} dias`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/sites" className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!status ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600"}`}>Todas</Link>
        {Object.entries(SITE_STATUS_LABEL).map(([k, v]) => (
          <Link key={k} href={`/sites?status=${k}`} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${status === k ? "bg-blue-600 text-white ring-blue-500" : "text-slate-300 ring-ink-600"}`}>{v}</Link>
        ))}
      </div>
      <Card>
        {sites.length === 0 ? (
          <Empty>Nenhuma demonstração.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Empresa</th><th>Status</th><th>Link</th><th>Template / texto</th><th>Atualizada</th><th>Ações</th></tr></thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td><Link className="font-medium text-white hover:text-blue-300" href={`/sites/${s.id}`}>{s.company.name}</Link><p className="text-xs text-slate-500">{s.company.city}</p></td>
                    <td><Badge status={s.status} label={SITE_STATUS_LABEL[s.status]} /></td>
                    <td className="max-w-56 truncate">{s.publicUrl && s.status === "PUBLISHED" ? <a className="text-blue-300 hover:underline" href={s.publicUrl} target="_blank" rel="noreferrer">{s.publicUrl.replace(/^https?:\/\//, "")}</a> : <span className="text-slate-600">—</span>}</td>
                    <td className="text-xs text-slate-400">{s.template} · {s.contentSource}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dt(s.updatedAt)}</td>
                    <td className="whitespace-nowrap space-x-1">
                      <Link className="btn-secondary !px-2.5 !py-1 !text-xs" href={`/sites/${s.id}`}>Prévia</Link>
                      {s.status === "PUBLISHED" && <ActionButton small url={`/api/sites/${s.id}/unpublish`} label="Despublicar" confirm="Despublicar esta demonstração?" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
