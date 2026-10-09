import Link from "next/link";
import { prisma } from "@/lib/db";
import { RUN_STAGE_LABEL, RUN_STATUS_LABEL } from "@/lib/labels";
import { AutoRefresh } from "@/components/client";
import { Badge, Card, Empty, PageHeader, dt, usd } from "@/components/ui";

export const metadata = { title: "Execuções" };

export default async function RunsPage() {
  const runs = await prisma.run.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { companies: true } } } });
  const costs = await prisma.costEntry.groupBy({ by: ["runId"], _sum: { estimatedCost: true } });
  const costOf = Object.fromEntries(costs.map((c) => [c.runId, c._sum.estimatedCost ?? 0]));
  const attention = await prisma.job.groupBy({ by: ["runId"], where: { status: { in: ["FAILED", "WAITING_CONFIG", "WAITING_AUTH"] } }, _count: true });
  const attOf = Object.fromEntries(attention.map((a) => [a.runId, a._count]));
  return (
    <>
      <PageHeader title="Histórico de execuções" actions={<><AutoRefresh active={runs.some((r) => r.status === "RUNNING")} /><Link href="/automacao" className="btn-primary">Nova execução</Link></>} />
      <Card>
        {runs.length === 0 ? (
          <Empty>Nenhuma execução registrada.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Execução</th><th>Modo</th><th>Status</th><th>Etapa</th><th>Empresas</th><th>Gasto</th><th>Atenção</th><th>Início</th><th>Fim</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="font-medium text-white hover:text-blue-300" href={`/execucoes/${r.id}`}>{r.name}</Link></td>
                    <td>{r.mode === "SIMULATION" ? <Badge status="SIMULATED" label="Simulação" /> : <Badge status="RUNNING" label="Real" />}</td>
                    <td><Badge status={r.status} label={RUN_STATUS_LABEL[r.status]} /></td>
                    <td className="text-slate-400">{RUN_STAGE_LABEL[r.stage]}</td>
                    <td className="tabular-nums">{r._count.companies}</td>
                    <td className="tabular-nums">{usd(costOf[r.id] ?? 0)}</td>
                    <td>{attOf[r.id] ? <Badge status="WAITING_CONFIG" label={`${attOf[r.id]} tarefa(s)`} /> : <span className="text-slate-600">—</span>}</td>
                    <td className="whitespace-nowrap text-slate-400">{dt(r.startedAt)}</td>
                    <td className="whitespace-nowrap text-slate-400">{dt(r.finishedAt)}</td>
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
