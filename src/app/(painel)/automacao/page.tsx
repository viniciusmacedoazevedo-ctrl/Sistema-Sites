import { integrationStatus } from "@/lib/env";
import { NICHES } from "@/lib/niches";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { AutomationForm } from "./form";

export const metadata = { title: "Iniciar automação" };

export default async function AutomationPage() {
  const settings = await getSettings();
  const integrations = Object.fromEntries(integrationStatus().map((i) => [i.id, i.configured]));
  return (
    <>
      <PageHeader title="Configurar e iniciar automação" subtitle="Escolha regiões, nichos e limites. O trabalho continua no servidor mesmo se você fechar esta página." />
      <AutomationForm
        niches={NICHES.map((n) => ({ id: n.id, label: n.label }))}
        defaults={{ runSpendLimitUsd: settings.defaultRunSpendLimitUsd, dailySpendLimitUsd: settings.dailySpendLimitUsd, autoSendEnabled: settings.autoSendEnabled, useAi: settings.useAi }}
        integrations={integrations}
      />
    </>
  );
}
