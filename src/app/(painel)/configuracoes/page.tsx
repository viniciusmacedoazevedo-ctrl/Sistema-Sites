import { integrationStatus } from "@/lib/env";
import { PRICE_CATALOG, getSettings } from "@/lib/settings";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SettingsForm } from "./form";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const settings = await getSettings();
  const integrations = integrationStatus();
  return (
    <>
      <PageHeader title="Configurações" subtitle="Chaves de API ficam em variáveis de ambiente no servidor (nunca no navegador). Aqui você ajusta limites, preços e regras." />
      <Card title="Integrações (variáveis de ambiente)" className="mb-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Integração</th><th>Status</th><th>Variáveis</th><th>Custo</th><th>Observação</th></tr></thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium text-slate-200">{i.label}</td>
                  <td><Badge status={i.configured ? "COMPLETED" : "WAITING_CONFIG"} label={i.configured ? "Configurada" : "Não configurada"} /></td>
                  <td className="text-xs text-slate-400"><code>{i.envVars.join(", ")}</code></td>
                  <td className="text-xs text-slate-400">{i.cost}</td>
                  <td className="text-xs text-slate-400">{i.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Depois de alterar variáveis de ambiente, reinicie o painel e o worker. Veja o README para o passo a passo de cada integração.</p>
      </Card>
      <SettingsForm initial={settings} catalog={PRICE_CATALOG.map((p) => ({ ...p }))} />
    </>
  );
}
