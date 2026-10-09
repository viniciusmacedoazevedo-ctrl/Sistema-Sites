import Link from "next/link";
import { prisma } from "@/lib/db";
import { RUN_STAGE_LABEL, RUN_STATUS_LABEL } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { ActionButton, AutoRefresh } from "@/components/client";
import { Badge, Card, Empty, Notice, PageHeader, Progress, Stat, dt, usd } from "@/components/ui";
import { dashboardStats, runProgress } from "@/server/progress";

export const metadata = { title: "Dashboard" };

function simHint(n: number) {
  return n ? `+${n} em simulação` : undefined;
}

export default async function Dashboard() {
  const [stats, settings, active, recent] = await Promise.all([
    dashboardStats(),
    getSettings(),
    prisma.run.findMany({ where: { status: { in: ["RUNNING", "PAUSED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.run.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const progress = await Promise.all(active.map((r) => runProgress(r.id)));
  const usageLabel: Record<string, string> = {
    "google_places:text_search": "Google Places (requisições)",
    "anthropic:input_mtok": "IA — entrada (M tokens)",
    "anthropic:output_mtok": "IA — saída (M tokens)",
    "whatsapp:template_message": "WhatsApp (mensagens)",
    "smtp:email": "E-mails",
    "vercel:deployment": "Vercel (deploys)",
    "internal:publish": "Publicação interna",
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da prospecção automatizada"
        actions={
          <>
            <AutoRefresh active={active.some((r) => r.status === "RUNNING")} />
            <Link href="/automacao" className="btn-primary">INICIAR AUTOMAÇÃO</Link>
          </>
        }
      />

      {!settings.autoSendEnabled && (
        <div className="mb-4">
          <Notice>Envio automático está <strong>desativado</strong>: as mensagens ficam como rascunho até você ativar em Configurações.</Notice>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-6 grid gap-4">
          {active.map((run, i) => (
            <Card key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge status={run.status} label={RUN_STATUS_LABEL[run.status]} />
                    {run.mode === "SIMULATION" && <Badge status="SIMULATED" label="SIMULAÇÃO" />}
                    <span className="text-xs text-slate-400">{RUN_STAGE_LABEL[run.stage]}</span>
                  </div>
                  <Link href={`/execucoes/${run.id}`} className="mt-1 block truncate font-semibold text-white hover:text-blue-300">{run.name}</Link>
                </div>
                <div className="flex gap-2">
                  {run.status === "RUNNING" ? <ActionButton url={`/api/runs/${run.id}/pause`} label="Pausar" /> : <ActionButton url={`/api/runs/${run.id}/resume`} label="Retomar" variant="primary" />}
                  <ActionButton url={`/api/runs/${run.id}/cancel`} label="Cancelar" variant="danger" confirm="Cancelar esta execução? Tarefas pendentes não serão executadas." />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={progress[i].done} total={progress[i].all} />
                <p className="mt-1 text-xs text-slate-400">{progress[i].done} de {progress[i].all} tarefas concluídas{progress[i].attention ? ` · ${progress[i].attention} precisam de atenção` : ""}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Empresas encontradas" value={stats.companies} hint={simHint(stats.sim.companies)} href="/empresas" />
        <Stat label="Sem site identificado" value={stats.notFound} hint={`nas fontes consultadas${stats.sim.notFound ? ` · ${simHint(stats.sim.notFound)}` : ""}`} href="/empresas?presenca=NOT_FOUND" />
        <Stat label="Demonstrações geradas" value={stats.sitesGenerated} hint={simHint(stats.sim.sitesGenerated)} href="/sites" />
        <Stat label="Demonstrações publicadas" value={stats.sitesPublished} accent="green" href="/sites?status=PUBLISHED" />
        <Stat label="Mensagens preparadas" value={stats.msgsPrepared} hint={simHint(stats.sim.msgsPrepared)} href="/mensagens" />
        <Stat label="Mensagens enviadas" value={stats.msgsSent} accent="green" href="/mensagens?status=SENT" />
        <Stat label="Respostas recebidas" value={stats.replies} hint="via webhook do WhatsApp" accent="green" />
        <Stat label="Erros" value={stats.errors} accent={stats.errors ? "red" : "blue"} hint={stats.waiting ? `${stats.waiting} aguardando configuração` : undefined} href="/execucoes" />
        <Stat label="Gasto hoje" value={usd(stats.costToday)} hint={`limite diário ${usd(settings.dailySpendLimitUsd)}`} accent="amber" />
        <Stat label="Gasto no mês" value={usd(stats.costMonth)} hint="estimado com os preços configurados" accent="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Últimas execuções" className="lg:col-span-2" actions={<Link className="text-sm text-blue-300 hover:underline" href="/execucoes">Ver todas</Link>}>
          {recent.length === 0 ? (
            <Empty>
              Nenhuma execução ainda. <Link className="text-blue-300 underline" href="/automacao">Configure e inicie a primeira</Link> — comece pelo modo simulação.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Execução</th><th>Status</th><th>Início</th></tr></thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td><Link href={`/execucoes/${r.id}`} className="font-medium text-white hover:text-blue-300">{r.name}</Link>{r.mode === "SIMULATION" && <span className="ml-2"><Badge status="SIMULATED" label="simulação" /></span>}</td>
                      <td><Badge status={r.status} label={RUN_STATUS_LABEL[r.status]} /></td>
                      <td className="whitespace-nowrap text-slate-400">{dt(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Consumo de APIs no mês">
          {stats.usage.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum consumo registrado.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.usage.map((u) => (
                <li key={u.key} className="flex justify-between gap-2">
                  <span className="text-slate-300">{usageLabel[u.key] ?? u.key}</span>
                  <span className="tabular-nums text-slate-400">{u.units.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} · {usd(u.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
