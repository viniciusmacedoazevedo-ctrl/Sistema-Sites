import { prisma } from "@/lib/db";
import { CRM_LABEL, PRESENCE_LABEL } from "@/lib/labels";
import { resolveNiche } from "@/lib/niches";
import { Card, PageHeader, usd } from "@/components/ui";

export const metadata = { title: "Relatórios" };

const FUNNEL = ["NOVO_LEAD", "ANALISADO", "DEMO_GERADA", "DEMO_PUBLICADA", "CONTATO_PREPARADO", "CONTATO_REALIZADO", "RESPONDEU", "INTERESSADO", "NEGOCIACAO", "CLIENTE"] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = Math.min(365, Math.max(1, Number(dias ?? 30)));
  const since = new Date(Date.now() - days * 86_400_000);
  const real = { isSimulated: false };
  const [crm, presence, byNiche, costs, costsByDay, sent, replies, runs] = await Promise.all([
    prisma.company.groupBy({ by: ["crmStatus"], where: real, _count: true }),
    prisma.company.groupBy({ by: ["presenceStatus"], where: { ...real, createdAt: { gte: since } }, _count: true }),
    prisma.company.groupBy({ by: ["niche"], where: { ...real, createdAt: { gte: since } }, _count: true, _avg: { score: true } }),
    prisma.costEntry.groupBy({ by: ["provider", "operation"], where: { createdAt: { gte: since } }, _sum: { estimatedCost: true, units: true } }),
    prisma.$queryRaw<{ day: Date; cost: number }[]>`SELECT date_trunc('day', "createdAt") AS day, SUM("estimatedCost")::float AS cost FROM "CostEntry" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.message.groupBy({ by: ["channel"], where: { sentAt: { gte: since } }, _count: true }),
    prisma.contactEvent.count({ where: { type: "RESPOSTA_RECEBIDA", createdAt: { gte: since } } }),
    prisma.run.count({ where: { createdAt: { gte: since }, mode: "REAL" } }),
  ]);
  const crmOf = Object.fromEntries(crm.map((c) => [c.crmStatus, c._count]));
  // Funil acumulado: quem chegou a cada etapa (inclui quem passou dela).
  const reached = FUNNEL.map((s, i) => ({ s, n: FUNNEL.slice(i).reduce((a, k) => a + (crmOf[k] ?? 0), 0) }));
  const max = Math.max(1, reached[0]?.n ?? 1);
  const totalCost = costs.reduce((a, c) => a + (c._sum.estimatedCost ?? 0), 0);
  const totalSent = sent.reduce((a, s) => a + s._count, 0);
  const maxDay = Math.max(0.0001, ...costsByDay.map((d) => d.cost));

  return (
    <>
      <PageHeader
        title="Relatórios de resultados"
        subtitle={`Últimos ${days} dias · apenas dados reais (simulações excluídas)`}
        actions={[7, 30, 90].map((d) => (
          <a key={d} href={`/relatorios?dias=${d}`} className={d === days ? "btn-primary" : "btn-secondary"}>{d} dias</a>
        ))}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Funil comercial (acumulado)">
          <div className="space-y-2">
            {reached.map(({ s, n }) => (
              <div key={s}>
                <div className="flex justify-between text-xs text-slate-400"><span>{CRM_LABEL[s]}</span><span className="tabular-nums">{n}</span></div>
                <div className="h-2 rounded-full bg-ink-700"><div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${(n / max) * 100}%` }} /></div>
              </div>
            ))}
            <p className="pt-2 text-xs text-slate-500">Fora do funil: sem interesse {crmOf.SEM_INTERESSE ?? 0} · não contatar {crmOf.NAO_CONTATAR ?? 0}</p>
          </div>
        </Card>

        <Card title="Indicadores do período">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Kpi k="Execuções reais" v={runs} />
            <Kpi k="Mensagens enviadas" v={totalSent} />
            <Kpi k="Respostas recebidas" v={replies} />
            <Kpi k="Taxa de resposta" v={totalSent ? `${((replies / totalSent) * 100).toFixed(1)}%` : "—"} />
            <Kpi k="Gasto estimado" v={usd(totalCost)} />
            <Kpi k="Custo por demonstração publicada" v={reached[3].n ? usd(totalCost / reached[3].n) : "—"} />
          </dl>
        </Card>

        <Card title="Presença digital das empresas encontradas">
          <ul className="space-y-1 text-sm">
            {presence.map((p) => <li key={p.presenceStatus} className="flex justify-between"><span className="text-slate-300">{PRESENCE_LABEL[p.presenceStatus]}</span><span className="tabular-nums">{p._count}</span></li>)}
            {presence.length === 0 && <li className="text-slate-500">Sem dados no período.</li>}
          </ul>
        </Card>

        <Card title="Por nicho">
          <table className="table">
            <thead><tr><th>Nicho</th><th>Empresas</th><th>Pontuação média</th></tr></thead>
            <tbody>
              {byNiche.map((n) => <tr key={n.niche ?? "-"}><td>{n.niche ? resolveNiche(n.niche).label : "—"}</td><td className="tabular-nums">{n._count}</td><td className="tabular-nums">{n._avg.score?.toFixed(0) ?? "—"}</td></tr>)}
            </tbody>
          </table>
        </Card>

        <Card title="Gastos por dia" className="lg:col-span-2">
          {costsByDay.length === 0 ? (
            <p className="text-sm text-slate-500">Sem gastos registrados.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {costsByDay.map((d) => (
                <div key={String(d.day)} className="group relative flex-1">
                  <div className="rounded-t bg-blue-500/70 group-hover:bg-blue-400" style={{ height: `${Math.max(2, (d.cost / maxDay) * 150)}px` }} title={`${new Date(d.day).toLocaleDateString("pt-BR")}: ${usd(d.cost)}`} />
                </div>
              ))}
            </div>
          )}
          <table className="table mt-4">
            <thead><tr><th>Recurso</th><th>Unidades</th><th>Gasto estimado</th></tr></thead>
            <tbody>
              {costs.map((c) => <tr key={`${c.provider}:${c.operation}`}><td>{c.provider} · {c.operation}</td><td className="tabular-nums">{(c._sum.units ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td><td className="tabular-nums">{usd(c._sum.estimatedCost ?? 0)}</td></tr>)}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function Kpi({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-850 p-3">
      <dt className="text-xs text-slate-400">{k}</dt>
      <dd className="mt-1 text-xl font-bold text-white tabular-nums">{v}</dd>
    </div>
  );
}
