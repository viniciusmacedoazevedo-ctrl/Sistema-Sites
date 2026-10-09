import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { assertBudget, estimateRun, recordCost } from "@/server/costs";
import { BudgetExceededError, WaitingConfigError } from "@/server/errors";
import { resetDb, settings } from "./helpers";

describe("controle de gastos", () => {
  beforeEach(resetDb);

  it("preço não configurado bloqueia operação paga (não inventa preço)", async () => {
    await expect(assertBudget({ runId: null, runLimitUsd: null, key: "google_places:text_search", estimatedUnits: 1 })).rejects.toBeInstanceOf(WaitingConfigError);
    await settings({ blockUnknownPrices: false });
    await expect(assertBudget({ runId: null, runLimitUsd: null, key: "google_places:text_search", estimatedUnits: 1 })).resolves.toBe(0);
  });

  it("limite por execução e limite diário interrompem novas operações", async () => {
    const s = await settings({ prices: { ...(await getSettings()).prices, "google_places:text_search": 0.04 }, dailySpendLimitUsd: 1 });
    const run = await prisma.run.create({ data: { name: "r", mode: "REAL", status: "RUNNING", config: {} } });
    await recordCost({ runId: run.id, key: "google_places:text_search", units: 10, settings: s }); // 0.40
    await expect(assertBudget({ runId: run.id, runLimitUsd: 0.42, key: "google_places:text_search", estimatedUnits: 1 }, s)).rejects.toBeInstanceOf(BudgetExceededError);
    const updated = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(updated.budgetExceeded).toBe(true);
    expect(updated.notice).toMatch(/Limite de gastos da execução/);

    await recordCost({ runId: null, key: "google_places:text_search", units: 15, settings: s }); // total dia 1.00
    await expect(assertBudget({ runId: null, runLimitUsd: null, key: "google_places:text_search", estimatedUnits: 1 }, s)).rejects.toThrow(/diário/);
  });

  it("estimativa sinaliza preços desconhecidos e simulação custa zero", async () => {
    const s = await getSettings();
    const real = estimateRun({ mode: "REAL", queries: 2, maxCompanies: 40, maxSites: 10, channels: ["WHATSAPP"], useAi: true, publisher: "internal" }, s);
    expect(real.unknown).toBe(true);
    expect(real.lines.find((l) => l.item.startsWith("Busca"))!.units).toBe(4);
    const sim = estimateRun({ mode: "SIMULATION", queries: 2, maxCompanies: 40, maxSites: 10, channels: [], useAi: true, publisher: "internal" }, s);
    expect(sim.total).toBe(0);
  });
});
