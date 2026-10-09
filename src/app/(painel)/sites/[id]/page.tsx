import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SITE_STATUS_LABEL } from "@/lib/labels";
import { ActionButton } from "@/components/client";
import { Badge, Card, Notice, PageHeader, dt } from "@/components/ui";
import type { SiteContent } from "@/server/content/site-content";
import type { ValidationReport } from "@/server/sitegen/validate";

export const metadata = { title: "Demonstração" };

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await prisma.demoSite.findUnique({ where: { id }, include: { company: true } });
  if (!site) notFound();
  const report = site.validation as ValidationReport | null;
  const content = site.content as SiteContent | null;
  const canPublish = !site.company.isSimulated && ["VALIDATED", "UNPUBLISHED", "PUBLISH_FAILED"].includes(site.status);

  return (
    <>
      <PageHeader
        title={`Demonstração — ${site.company.name}`}
        subtitle={`Slug estável: ${site.slug}`}
        actions={
          <>
            <Link className="btn-secondary" href={`/empresas/${site.companyId}`}>Ficha da empresa</Link>
            <a className="btn-secondary" href={`/api/sites/${site.id}/preview`} target="_blank" rel="noreferrer">Abrir prévia</a>
            <ActionButton url={`/api/sites/${site.id}/rebuild`} label="Regerar e validar" />
            {canPublish && <ActionButton url={`/api/sites/${site.id}/publish`} label="Publicar" variant="primary" confirm="Publicar esta demonstração em link público?" />}
            {site.status === "PUBLISHED" && <ActionButton url={`/api/sites/${site.id}/unpublish`} label="Despublicar" confirm="Despublicar?" />}
            <ActionButton url={`/api/sites/${site.id}/delete`} label="Excluir" variant="danger" redirectTo="/sites" confirm="Excluir esta demonstração? (será despublicada antes)" />
          </>
        }
      />
      {site.error && <div className="mb-4"><Notice kind="warn">{site.error}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Prévia" className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-ink-700 bg-white">
            <iframe title="Prévia" src={`/api/sites/${site.id}/preview`} sandbox="" className="h-[720px] w-full" />
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Status">
            <div className="space-y-2 text-sm">
              <Badge status={site.status} label={SITE_STATUS_LABEL[site.status]} />
              {site.publicUrl && site.status === "PUBLISHED" && <p><a className="break-all text-blue-300 hover:underline" href={site.publicUrl} target="_blank" rel="noreferrer">{site.publicUrl}</a></p>}
              <p className="text-slate-400">Publicador: {site.publisher ?? "—"} · Publicado: {dt(site.publishedAt)}</p>
              <p className="text-slate-400">Template: {site.template} · Texto: {site.contentSource}</p>
            </div>
          </Card>
          <Card title="Validação">
            {report ? (
              <div className="space-y-2 text-sm">
                <Badge status={report.ok ? "COMPLETED" : "FAILED"} label={report.ok ? "Aprovado" : "Reprovado"} />
                <p className="text-xs text-slate-400">Verificações: {report.checks.join(", ")} · {Math.round(report.sizeBytes / 1024)} KB</p>
                {report.browser && <p className="text-xs text-slate-400">Navegador: {report.browser.ran ? (report.browser.mobileOverflow ? "rolagem horizontal no celular" : "OK em 375px") : `não executado (${report.browser.note})`}</p>}
                <ul className="space-y-1">
                  {report.issues.map((i, n) => (
                    <li key={n} className={i.level === "error" ? "text-red-300" : "text-amber-300"}>{i.level === "error" ? "Erro" : "Aviso"} ({i.check}): {i.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Ainda não validado.</p>
            )}
          </Card>
          {content?.toConfirm?.length ? (
            <Card title="Confirmar com a empresa">
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">{content.toConfirm.map((t) => <li key={t}>{t}</li>)}</ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
