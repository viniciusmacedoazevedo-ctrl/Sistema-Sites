import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, PRESENCE_LABEL, RUN_STAGE_LABEL, RUN_STATUS_LABEL } from "@/lib/labels";
import { resolveNiche } from "@/lib/niches";
import { ActionButton, AutoRefresh } from "@/components/client";
import { Badge, Card, Notice, PageHeader, Progress, dt, usd } from "@/components/ui";
import { spentOnRun } from "@/server/costs";
import { runProgress } from "@/server/progress";
import { parseConfig } from "@/server/runs";

export const metadata = { title: "Execução" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.run.findUnique({ where: { id } });
  if (!run) notFound();
  const cfg = parseConfig(run);
  const [progress, spent, companies, attention] = await Promise.all([
    runProgress(id),
    spentOnRun(id),
    prisma.runCompany.findMany({ where: { runId: id }, include: { company: { include: { site: true } } }, orderBy: { company: { score: "desc" } }, take: 200 }),
    prisma.job.findMany({ where: { runId: id, status: { in: ["FAILED", "WAITING_CONFIG", "WAITING_AUTH", "SKIPPED"] } }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const estimate = run.estimate as { total: number; unknown: boolean } | null;
  const live = run.status === "RUNNING";

  return (
    <>
      <PageHeader
        title={run.name}
        subtitle={`${run.mode === "SIMULATION" ? "SIMULAÇÃO — nada é publicado ou enviado" : "Execução real"} · criada em ${dt(run.createdAt)}`}
        actions={
          <>
            <AutoRefresh active={live} intervalMs={2000} />
            {run.status === "RUNNING" && <ActionButton url={`/api/runs/${id}/pause`} label="Pausar" />}
            {run.status === "PAUSED" && <ActionButton url={`/api/runs/${id}/resume`} label="Retomar" variant="primary" />}
            {["RUNNING", "PAUSED"].includes(run.status) && <ActionButton url={`/api/runs/${id}/cancel`} label="Cancelar" variant="danger" confirm="Cancelar esta execução?" />}
            {attention.some((j) => j.status !== "SKIPPED") && run.status !== "CANCELED" && <ActionButton url={`/api/runs/${id}/retry`} label="Reprocessar pendências" variant="primary" />}
          </>
        }
      />

      <div className="mb-4 space-y-2">
        {run.notice && <Notice kind="warn">{run.notice}</Notice>}
        {run.error && <Notice kind="error">{run.error}</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Progresso" className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge status={run.status} label={RUN_STATUS_LABEL[run.status]} />
            <span className="text-sm text-slate-400">Etapa: {RUN_STAGE_LABEL[run.stage]}</span>
          </div>
          <Progress value={progress.done} total={progress.all} />
          <p className="mt-1 mb-4 text-xs text-slate-400">{progress.done} de {progress.all} tarefas finalizadas</p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Etapa</th><th>Total</th><th>Concluídas</th><th>Em andamento/fila</th><th>Atenção</th></tr></thead>
              <tbody>
                {progress.stages.filter((s) => s.total > 0).map((s) => (
                  <tr key={s.type}>
                    <td className="text-slate-200">{JOB_TYPE_LABEL[s.type] ?? s.type}</td>
                    <td className="tabular-nums">{s.total}</td>
                    <td className="tabular-nums text-emerald-300">{s.counts.COMPLETED ?? 0}</td>
                    <td className="tabular-nums text-blue-300">{(s.counts.PENDING ?? 0) + (s.counts.RUNNING ?? 0)}</td>
                    <td className="space-x-1">
                      {(["FAILED", "WAITING_CONFIG", "WAITING_AUTH", "SKIPPED", "CANCELED"] as const).map((k) => (s.counts[k] ? <Badge key={k} status={k} label={`${JOB_STATUS_LABEL[k]}: ${s.counts[k]}`} /> : null))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Configuração e custos">
          <dl className="space-y-2 text-sm">
            <Row k="Nichos" v={cfg.niches.map((n) => resolveNiche(n).label).join(", ")} />
            <Row k="Regiões" v={cfg.regions.map((r) => [r.neighborhood, r.city].filter(Boolean).join(", ")).join(" · ") + ` · ${[cfg.state, cfg.country].filter(Boolean).join("/")}`} />
            <Row k="Máx. empresas / sites" v={`${cfg.maxCompanies} / ${cfg.maxSites}`} />
            <Row k="Critérios" v={`pontuação ≥ ${cfg.criteria.minScore}${cfg.criteria.requirePhone ? ", com telefone" : ""}${cfg.criteria.includeFunctionalSites ? ", inclui sites funcionais" : ""}`} />
            <Row k="Canais" v={cfg.channels.length ? cfg.channels.join(", ") : "nenhum (apenas rascunhos)"} />
            <Row k="IA" v={cfg.useAi ? "habilitada" : "desligada"} />
            <Row k="Estimativa" v={estimate ? `${usd(estimate.total)}${estimate.unknown ? " + itens a verificar" : ""}` : "—"} />
            <Row k="Gasto registrado" v={`${usd(spent)} de ${usd(cfg.runSpendLimitUsd)}`} />
          </dl>
        </Card>
      </div>

      {attention.length > 0 && (
        <Card title="Tarefas que precisam de atenção" className="mt-6">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Etapa</th><th>Status</th><th>Motivo</th><th>Tentativas</th></tr></thead>
              <tbody>
                {attention.map((j) => (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap">{JOB_TYPE_LABEL[j.type] ?? j.type}</td>
                    <td><Badge status={j.status} label={JOB_STATUS_LABEL[j.status]} /></td>
                    <td className="max-w-xl text-slate-300">{j.lastError}</td>
                    <td className="tabular-nums">{j.attempts}/{j.maxAttempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={`Empresas desta execução (${companies.length})`} className="mt-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Empresa</th><th>Pontuação</th><th>Presença digital</th><th>Selecionada</th><th>Demonstração</th></tr></thead>
            <tbody>
              {companies.map(({ company: c, selected }) => (
                <tr key={c.id}>
                  <td><Link href={`/empresas/${c.id}`} className="font-medium text-white hover:text-blue-300">{c.name}</Link><p className="text-xs text-slate-500">{c.city}</p></td>
                  <td className="tabular-nums">{c.score ?? "—"}</td>
                  <td><Badge status={c.presenceStatus} label={PRESENCE_LABEL[c.presenceStatus]} /></td>
                  <td>{selected ? <Badge status="COMPLETED" label="Sim" /> : <span className="text-slate-600">—</span>}</td>
                  <td>{c.site?.publicUrl ? <a className="text-blue-300 hover:underline" href={c.site.publicUrl} target="_blank" rel="noreferrer">abrir</a> : c.site ? <Link className="text-slate-300 hover:underline" href={`/sites/${c.site.id}`}>prévia</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-800 pb-2">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right text-slate-200">{v}</dd>
    </div>
  );
}
