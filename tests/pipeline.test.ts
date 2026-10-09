import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { setDeps } from "@/server/deps";
import type { DiscoveryAdapter, RawPlace } from "@/server/discovery/types";
import { upsertPlace } from "@/server/pipeline";
import type { PresenceResult } from "@/server/presence";
import { cancelRun, pauseRun, resumeRun, startRun } from "@/server/runs";
import { claimNextJob } from "@/server/queue";
import { drain, failIfCalled, resetDb, settings, useDeps } from "./helpers";

const baseConfig = {
  mode: "SIMULATION" as const,
  country: "BR",
  state: "SP",
  regions: [{ city: "Campinas", neighborhood: "" }],
  niches: ["barbearia"],
  maxCompanies: 12,
  maxSites: 4,
  runSpendLimitUsd: 1,
  channels: ["WHATSAPP" as const],
  useAi: true,
  criteria: { minScore: 40, requirePhone: true, includeFunctionalSites: false },
};

function place(i: number, extra: Partial<RawPlace> = {}): RawPlace {
  return {
    source: "google_places",
    sourceId: `place-${i}`,
    name: `Barbearia Teste ${i}`,
    address: `Rua ${i}, Campinas - SP`,
    city: "Campinas",
    state: "SP",
    country: "BR",
    phone: `+55 19 9${String(8000 + i).padStart(4, "0")}-${String(1000 + i)}`,
    businessStatus: "OPERATIONAL",
    ratingCount: 30,
    attribution: "Dados: Google Maps",
    ...extra,
  };
}

function fakeDiscovery(pages: RawPlace[][]): DiscoveryAdapter & { calls: number } {
  return {
    id: "fake",
    isSimulation: false,
    calls: 0,
    async search(q) {
      this.calls++;
      const idx = q.pageToken ? Number(q.pageToken) : 0;
      return { places: pages[idx] ?? [], nextPageToken: idx + 1 < pages.length ? String(idx + 1) : undefined, billableRequests: 1 };
    },
  };
}

const notFound = async (): Promise<PresenceResult> => ({ status: "NOT_FOUND", summary: "sem site", issues: [], checkedAt: new Date().toISOString() });

afterAll(() => setDeps(null));

describe("automação ponta a ponta — modo simulação", () => {
  beforeEach(resetDb);

  it("percorre todas as etapas sem publicar, enviar ou gastar", async () => {
    useDeps({
      ai: failIfCalled("IA"),
      publisher: failIfCalled("publicador"),
      verifyUrl: failIfCalled("verificação de URL"),
      whatsapp: { configured: true, send: failIfCalled("WhatsApp") },
      email: { configured: true, send: failIfCalled("e-mail") },
    });
    const run = await startRun(baseConfig);
    await drain();

    const done = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.stage).toBe("DONE");
    const companies = await prisma.company.findMany();
    expect(companies.length).toBe(12);
    expect(companies.every((c) => c.isSimulated && c.name.startsWith("[SIMULAÇÃO]"))).toBe(true);
    expect(companies.every((c) => c.score !== null)).toBe(true);

    const sites = await prisma.demoSite.findMany();
    expect(sites.length).toBe(4);
    expect(sites.every((s) => s.status === "SIMULATED" && s.publicUrl === null && s.html?.includes("não oficial"))).toBe(true);

    const messages = await prisma.message.findMany();
    expect(messages.length).toBe(4);
    expect(messages.every((m) => m.status === "SIMULATED" && m.sentAt === null)).toBe(true);
    expect(await prisma.costEntry.aggregate({ _sum: { estimatedCost: true } })).toMatchObject({ _sum: { estimatedCost: null } });
    const failed = await prisma.job.findMany({ where: { status: { in: ["FAILED", "WAITING_CONFIG"] } } });
    expect(failed).toEqual([]);
    expect((done.report as { companiesFound: number }).companiesFound).toBe(12);
  });

  it("pausar impede o andamento; retomar continua; cancelar encerra", async () => {
    useDeps({});
    const run = await startRun(baseConfig);
    await pauseRun(run.id);
    expect(await claimNextJob("w")).toBeNull();
    await resumeRun(run.id);
    await drain(3);
    await cancelRun(run.id);
    await drain();
    const r = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(r.status).toBe("CANCELED");
    expect(await prisma.job.count({ where: { runId: run.id, status: "PENDING" } })).toBe(0);
  });
});

describe("automação ponta a ponta — modo real com integrações simuladas (mocks)", () => {
  beforeEach(resetDb);

  async function realSetup(overrides: Record<string, unknown> = {}) {
    const s = await getSettings();
    await settings({
      prices: { ...s.prices, "google_places:text_search": 0.03, "whatsapp:template_message": 0.05, "internal:publish": 0 },
      autoSendEnabled: true,
      whatsappTemplateName: "demo_site_v1",
      ...overrides,
    });
  }

  it("publica, verifica o link e só envia WhatsApp para quem tem opt-in", async () => {
    await realSetup();
    const sent: string[] = [];
    const discovery = fakeDiscovery([[place(1), place(2), place(3)]]);
    useDeps({
      discovery: () => discovery,
      presence: notFound,
      ai: () => null,
      publisher: () => ({ id: "internal", publish: async ({ slug }) => ({ publicUrl: `https://sitehunter.test/d/${slug}`, providerRef: slug }), unpublish: async () => {} }),
      verifyUrl: async () => ({ ok: true, detail: "HTTP 200" }),
      whatsapp: {
        configured: true,
        send: async (input) => {
          sent.push(input.to);
          expect(input.template?.name).toBe("demo_site_v1");
          return { providerMessageId: `wamid.${sent.length}` };
        },
      },
    });
    await prisma.consent.create({ data: { channel: "WHATSAPP", contact: "+5519980011001", basis: "pediu orçamento pelo formulário", evidence: "print 01/10" } });

    const run = await startRun({ ...baseConfig, mode: "REAL", maxSites: 3 });
    await drain();

    const sites = await prisma.demoSite.findMany();
    expect(sites.map((s) => s.status)).toEqual(["PUBLISHED", "PUBLISHED", "PUBLISHED"]);
    expect(sites.every((s) => s.publicUrl?.startsWith("https://sitehunter.test/d/"))).toBe(true);
    expect(sent).toEqual(["+5519980011001"]);

    const msgs = await prisma.message.findMany({ include: { company: true } });
    const sentMsg = msgs.find((m) => m.status === "SENT")!;
    expect(sentMsg.consentBasis).toMatch(/opt-in/);
    expect(sentMsg.body).toContain(sentMsg.company.name);
    const blocked = msgs.filter((m) => m.status === "BLOCKED");
    expect(blocked).toHaveLength(2);
    expect(blocked[0].blockReason).toMatch(/opt-in/);
    expect(blocked[0].alternative).toBeTruthy();

    const company = await prisma.company.findUniqueOrThrow({ where: { id: sentMsg.companyId } });
    expect(company.crmStatus).toBe("CONTATO_REALIZADO");
    const costs = await prisma.costEntry.aggregate({ _sum: { estimatedCost: true } });
    expect(costs._sum.estimatedCost).toBeCloseTo(0.03 + 0.05, 5);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("COMPLETED");
  });

  it("não reenvia: segunda execução, tarefa repetida e envio interrompido", async () => {
    await realSetup();
    const send = vi.fn(async () => ({ providerMessageId: `wamid.${Math.random()}` }));
    useDeps({
      discovery: () => fakeDiscovery([[place(1)]]),
      presence: notFound,
      ai: () => null,
      publisher: () => ({ id: "internal", publish: async ({ slug }) => ({ publicUrl: `https://sitehunter.test/d/${slug}`, providerRef: slug }), unpublish: async () => {} }),
      verifyUrl: async () => ({ ok: true, detail: "ok" }),
      whatsapp: { configured: true, send },
    });
    await prisma.consent.create({ data: { channel: "WHATSAPP", contact: "+5519980011001", basis: "opt-in" } });
    await startRun({ ...baseConfig, mode: "REAL" });
    await drain();
    expect(send).toHaveBeenCalledTimes(1);

    // Mesma empresa em nova execução: não recebe outra abordagem.
    await startRun({ ...baseConfig, mode: "REAL" });
    await drain();
    expect(send).toHaveBeenCalledTimes(1);

    // Simula queda durante o envio: mensagem fica "SENDING" e a tarefa é repetida.
    const msg = await prisma.message.findFirstOrThrow();
    await prisma.message.update({ where: { id: msg.id }, data: { status: "SENDING" } });
    await prisma.job.updateMany({ where: { type: "SEND_MESSAGE" }, data: { status: "PENDING", runAt: new Date() } });
    await prisma.run.updateMany({ data: { status: "RUNNING" } });
    await drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe("NEEDS_VERIFICATION");
  });

  it("erro de rede no envio não gera reenvio automático", async () => {
    await realSetup();
    const send = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    useDeps({
      discovery: () => fakeDiscovery([[place(1)]]),
      presence: notFound,
      ai: () => null,
      publisher: () => ({ id: "internal", publish: async ({ slug }) => ({ publicUrl: `https://x.test/d/${slug}`, providerRef: slug }), unpublish: async () => {} }),
      verifyUrl: async () => ({ ok: true, detail: "ok" }),
      whatsapp: { configured: true, send },
    });
    await prisma.consent.create({ data: { channel: "WHATSAPP", contact: "+5519980011001", basis: "opt-in" } });
    await startRun({ ...baseConfig, mode: "REAL" });
    await drain();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await prisma.message.findFirstOrThrow()).status).toBe("NEEDS_VERIFICATION");
  });

  it("publicação não confirmada não é registrada como publicada", async () => {
    await realSetup();
    useDeps({
      discovery: () => fakeDiscovery([[place(1)]]),
      presence: notFound,
      ai: () => null,
      publisher: () => ({ id: "internal", publish: async ({ slug }) => ({ publicUrl: `https://x.test/d/${slug}`, providerRef: slug }), unpublish: async () => {} }),
      verifyUrl: async () => ({ ok: false, detail: "HTTP 404" }),
      whatsapp: { configured: true, send: failIfCalled("WhatsApp") },
    });
    await startRun({ ...baseConfig, mode: "REAL" });
    await drain();
    const site = await prisma.demoSite.findFirstOrThrow();
    expect(site.status).toBe("PUBLISH_FAILED");
    expect(await prisma.message.count()).toBe(0);
    expect(await prisma.job.count({ where: { type: "PUBLISH_SITE", status: "FAILED" } })).toBe(1);
  });

  it("sem chave do Google: descoberta aguarda configuração, sem custos", async () => {
    useDeps({ ai: () => null });
    await realSetup();
    const run = await startRun({ ...baseConfig, mode: "REAL" });
    await drain();
    const jobs = await prisma.job.findMany({ where: { runId: run.id, type: "DISCOVER" } });
    expect(jobs.every((j) => j.status === "WAITING_CONFIG")).toBe(true);
    expect(jobs[0].lastError).toMatch(/GOOGLE_PLACES_API_KEY/);
    expect(await prisma.costEntry.count()).toBe(0);
  });

  it("limite de gastos da execução interrompe novas buscas pagas", async () => {
    await realSetup();
    const discovery = fakeDiscovery([[place(1), place(2)], [place(3), place(4)], [place(5)]]);
    useDeps({ discovery: () => discovery, presence: notFound, ai: () => null });
    const run = await startRun({ ...baseConfig, mode: "REAL", maxSites: 0, runSpendLimitUsd: 0.05 });
    await drain();
    expect(discovery.calls).toBe(1);
    const r = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(r.budgetExceeded).toBe(true);
    expect(await prisma.job.count({ where: { runId: run.id, type: "DISCOVER", status: "SKIPPED" } })).toBe(1);
  });

  it("paginação respeita a quantidade máxima de empresas", async () => {
    await realSetup();
    const discovery = fakeDiscovery([[place(1), place(2), place(3)], [place(4), place(5), place(6)], [place(7)]]);
    useDeps({ discovery: () => discovery, presence: notFound, ai: () => null });
    await startRun({ ...baseConfig, mode: "REAL", maxCompanies: 4, maxSites: 0 });
    await drain();
    expect(await prisma.company.count()).toBe(4);
    expect(discovery.calls).toBe(2);
  });
});

describe("deduplicação", () => {
  beforeEach(resetDb);

  it("une registros pela fonte, telefone ou nome+cidade", async () => {
    const s = await getSettings();
    const a = await upsertPlace(place(1), "barbearia", s, false);
    expect(a.created).toBe(true);
    const sameSource = await upsertPlace({ ...place(1), name: "Barbearia Teste 1 (novo nome)" }, "barbearia", s, false);
    expect(sameSource.created).toBe(false);
    const samePhone = await upsertPlace({ ...place(1), source: "outra_fonte", sourceId: "x1" }, "barbearia", s, false);
    expect(samePhone.company.id).toBe(a.company.id);
    const sameName = await upsertPlace({ ...place(9), name: "BARBEARIA TESTE 1 LTDA", phone: undefined, source: "outra", sourceId: "y" }, "barbearia", s, false);
    expect(sameName.company.id).toBe(a.company.id);
    expect(await prisma.company.count()).toBe(1);
  });
});
