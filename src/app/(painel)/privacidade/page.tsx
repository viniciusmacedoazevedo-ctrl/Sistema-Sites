import { prisma } from "@/lib/db";
import { ActionButton } from "@/components/client";
import { Card, PageHeader, dt } from "@/components/ui";
import { SuppressionForm } from "./form";

export const metadata = { title: "Privacidade e bloqueios" };

export default async function PrivacyPage() {
  const [suppressions, logs, simulated] = await Promise.all([
    prisma.suppression.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 150 }),
    prisma.company.count({ where: { isSimulated: true } }),
  ]);
  return (
    <>
      <PageHeader title="Privacidade, bloqueios e auditoria" subtitle="Lista de supressão, exclusão de dados e registro de ações" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Lista de bloqueio / descadastro">
          <p className="mb-3 text-sm text-slate-400">Contatos bloqueados nunca recebem mensagens e são ignorados em novas buscas. Guardamos apenas um hash (não o número/e-mail).</p>
          <SuppressionForm />
          <div className="mt-4 max-h-96 overflow-auto">
            <table className="table">
              <thead><tr><th>Identificação</th><th>Motivo</th><th>Data</th><th></th></tr></thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr key={s.id}>
                    <td className="text-slate-300">{s.label ?? "(hash)"}</td>
                    <td className="text-xs text-slate-400">{s.reason}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dt(s.createdAt)}</td>
                    <td><ActionButton small url={`/api/suppressions/${s.id}`} method="DELETE" label="Remover" confirm="Remover da lista de bloqueio? Só faça isso se a pessoa pediu para voltar a ser contatada." /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Exclusão e retenção de dados">
          <ul className="space-y-4 text-sm text-slate-300">
            <li>
              <p className="mb-2">Para excluir uma empresa específica (site, mensagens e histórico), abra a ficha dela e use <strong>Excluir dados</strong>.</p>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Remover todos os dados fictícios de simulação ({simulated} empresas)</span>
              <ActionButton url="/api/privacy/purge-simulation" label="Remover simulações" variant="danger" confirm="Remover todas as empresas e execuções de simulação?" />
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Aplicar retenção agora (remove dados de fonte vencidos sem relacionamento e despublica demos antigas)</span>
              <ActionButton url="/api/privacy/maintenance" label="Executar retenção" />
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Apagar registros de auditoria com mais de 180 dias</span>
              <ActionButton url="/api/privacy/purge-audit" label="Limpar auditoria antiga" />
            </li>
          </ul>
        </Card>
        <Card title="Registro de auditoria" className="lg:col-span-2">
          <div className="max-h-[480px] overflow-auto">
            <table className="table">
              <thead><tr><th>Data</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-slate-500">{dt(l.createdAt)}</td>
                    <td className="text-xs">{l.actor}</td>
                    <td className="text-slate-200">{l.action}</td>
                    <td className="max-w-md truncate text-xs text-slate-400">{l.details ? JSON.stringify(l.details) : ""}{l.ip ? ` · ${l.ip}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
