import { prisma } from "@/lib/db";
import { getSettings, PRICE_CATALOG, type PriceKey, type Settings } from "@/lib/settings";
import { BudgetExceededError, WaitingConfigError } from "./errors";

/**
 * Controle de gastos:
 *  - antes de cada operação paga, `assertBudget` verifica preço conhecido e limites (execução e diário);
 *  - depois, `recordCost` registra o consumo real (ex.: tokens efetivamente usados).
 * Em modo simulação nenhuma operação paga é executada, então nada é cobrado.
 */

export function priceOf(settings: Settings, key: PriceKey): number | null {
  const value = settings.prices[key];
  return typeof value === "number" ? value : null;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function spentToday(): Promise<number> {
  const agg = await prisma.costEntry.aggregate({ _sum: { estimatedCost: true }, where: { createdAt: { gte: startOfDay() } } });
  return agg._sum.estimatedCost ?? 0;
}

export async function spentOnRun(runId: string): Promise<number> {
  const agg = await prisma.costEntry.aggregate({ _sum: { estimatedCost: true }, where: { runId } });
  return agg._sum.estimatedCost ?? 0;
}

export interface BudgetCheck {
  runId: string | null;
  runLimitUsd: number | null;
  key: PriceKey;
  /** Unidades na mesma unidade do preço (ex.: requisições, ou milhões de tokens). */
  estimatedUnits: number;
}

export async function assertBudget(check: BudgetCheck, settingsArg?: Settings): Promise<number> {
  const settings = settingsArg ?? (await getSettings());
  const price = priceOf(settings, check.key);
  const meta = PRICE_CATALOG.find((p) => p.key === check.key);
  if (price === null) {
    if (settings.blockUnknownPrices) {
      throw new WaitingConfigError(
        `Preço de "${meta?.label ?? check.key}" não configurado. Consulte ${meta?.url || "o provedor"} e preencha em Configurações → Custos (ou desative o bloqueio de preços desconhecidos).`,
      );
    }
    return 0;
  }
  const estimated = price * check.estimatedUnits;
  const today = await spentToday();
  if (today + estimated > settings.dailySpendLimitUsd) {
    if (check.runId) await markBudgetExceeded(check.runId, `Limite diário de gastos atingido (US$ ${settings.dailySpendLimitUsd.toFixed(2)}). Novas operações pagas foram interrompidas.`);
    throw new BudgetExceededError(`Limite diário de gastos (US$ ${settings.dailySpendLimitUsd.toFixed(2)}) seria ultrapassado.`);
  }
  if (check.runId && check.runLimitUsd !== null) {
    const run = await spentOnRun(check.runId);
    if (run + estimated > check.runLimitUsd) {
      await markBudgetExceeded(check.runId, `Limite de gastos da execução atingido (US$ ${check.runLimitUsd.toFixed(2)}). Novas operações pagas foram interrompidas; tarefas sem custo continuam.`);
      throw new BudgetExceededError(`Limite da execução (US$ ${check.runLimitUsd.toFixed(2)}) seria ultrapassado.`);
    }
  }
  return estimated;
}

async function markBudgetExceeded(runId: string, notice: string) {
  await prisma.run.updateMany({ where: { id: runId }, data: { budgetExceeded: true, notice } });
}

export async function recordCost(input: { runId: string | null; key: PriceKey; units: number; settings?: Settings }) {
  const settings = input.settings ?? (await getSettings());
  const price = priceOf(settings, input.key);
  const [provider, operation] = input.key.split(":");
  await prisma.costEntry.create({
    data: {
      runId: input.runId,
      provider,
      operation,
      units: input.units,
      unitPrice: price,
      estimatedCost: price === null ? 0 : price * input.units,
      priceKnown: price !== null,
    },
  });
}

export interface RunEstimateInput {
  mode: "SIMULATION" | "REAL";
  queries: number;
  maxCompanies: number;
  maxSites: number;
  channels: string[];
  useAi: boolean;
  publisher: "internal" | "vercel";
}

export interface EstimateLine {
  item: string;
  units: number;
  unitLabel: string;
  unitPrice: number | null;
  cost: number | null;
  note: string;
}

/** Estimativa de pior caso antes de iniciar uma execução. */
export function estimateRun(input: RunEstimateInput, settings: Settings) {
  const lines: EstimateLine[] = [];
  if (input.mode === "SIMULATION") {
    return { lines: [{ item: "Modo simulação", units: 0, unitLabel: "-", unitPrice: 0, cost: 0, note: "Nenhuma API paga é chamada." }], total: 0, unknown: false };
  }
  const pagesPerQuery = Math.min(3, Math.ceil(Math.max(1, input.maxCompanies) / 20));
  const requests = input.queries * pagesPerQuery;
  const add = (item: string, key: PriceKey, units: number, unitLabel: string, note: string) => {
    const p = priceOf(settings, key);
    lines.push({ item, units, unitLabel, unitPrice: p, cost: p === null ? null : p * units, note });
  };
  add("Busca de empresas (Google Places)", "google_places:text_search", requests, "requisições", `${input.queries} busca(s) × até ${pagesPerQuery} página(s) de 20 resultados`);
  if (input.useAi) {
    // Estimativa conservadora: ~2.500 tokens de entrada e ~1.500 de saída por empresa (site + mensagem).
    add("IA — entrada", "anthropic:input_mtok", (input.maxSites * 2500) / 1e6, "M tokens", "≈2.500 tokens por empresa");
    add("IA — saída", "anthropic:output_mtok", (input.maxSites * 1500) / 1e6, "M tokens", "≈1.500 tokens por empresa");
  } else {
    lines.push({ item: "Conteúdo por templates", units: input.maxSites, unitLabel: "sites", unitPrice: 0, cost: 0, note: "Sem IA: custo zero" });
  }
  add("Publicação", input.publisher === "vercel" ? "vercel:deployment" : "internal:publish", input.maxSites, "publicações", input.publisher === "vercel" ? "Vercel" : "Servidor próprio");
  lines.push({ item: "Armazenamento", units: input.maxSites, unitLabel: "sites", unitPrice: null, cost: 0, note: "Poucos KB por site no banco; normalmente dentro do plano do banco" });
  if (input.channels.includes("WHATSAPP")) add("WhatsApp (somente contatos com opt-in)", "whatsapp:template_message", input.maxSites, "mensagens (máximo)", "Somente envios autorizados são feitos");
  if (input.channels.includes("EMAIL")) add("E-mail (somente elegíveis)", "smtp:email", input.maxSites, "e-mails (máximo)", "Somente envios autorizados são feitos");
  const unknown = lines.some((l) => l.cost === null);
  const total = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  return { lines, total, unknown };
}
