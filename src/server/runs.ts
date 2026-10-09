import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveNiche } from "@/lib/niches";
import { getSettings } from "@/lib/settings";
import { estimateRun } from "./costs";
import { enqueue, enqueueMany } from "./queue";

export const runConfigSchema = z.object({
  name: z.string().trim().max(120).optional(),
  mode: z.enum(["SIMULATION", "REAL"]),
  country: z.string().trim().min(2).max(56).default("BR"),
  state: z.string().trim().max(56).optional().default(""),
  regions: z
    .array(z.object({ city: z.string().trim().min(2).max(80), neighborhood: z.string().trim().max(80).optional().default("") }))
    .min(1)
    .max(10),
  niches: z.array(z.string().trim().min(2).max(80)).min(1).max(10),
  maxCompanies: z.number().int().min(1).max(500),
  maxSites: z.number().int().min(0).max(200),
  runSpendLimitUsd: z.number().min(0).max(10000),
  channels: z.array(z.enum(["WHATSAPP", "EMAIL"])).max(2).default([]),
  useAi: z.boolean().default(true),
  criteria: z
    .object({
      minScore: z.number().int().min(0).max(100).default(50),
      requirePhone: z.boolean().default(true),
      includeFunctionalSites: z.boolean().default(false),
    })
    .default({ minScore: 50, requirePhone: true, includeFunctionalSites: false }),
});

export type RunConfig = z.infer<typeof runConfigSchema>;

export function discoveryQueries(cfg: RunConfig) {
  const out: { niche: string; searchTerm: string; city: string; neighborhood?: string; state?: string; country: string }[] = [];
  for (const nicheId of cfg.niches) {
    const niche = resolveNiche(nicheId);
    for (const r of cfg.regions) {
      out.push({ niche: niche.id, searchTerm: niche.searchTerm, city: r.city, neighborhood: r.neighborhood || undefined, state: cfg.state || undefined, country: cfg.country });
    }
  }
  return out;
}

export async function estimateForConfig(cfg: RunConfig) {
  const settings = await getSettings();
  return estimateRun(
    {
      mode: cfg.mode,
      queries: discoveryQueries(cfg).length,
      maxCompanies: cfg.maxCompanies,
      maxSites: cfg.maxSites,
      channels: cfg.channels,
      useAi: cfg.useAi && settings.useAi,
      publisher: settings.publisher,
    },
    settings,
  );
}

/** Cria a execução e enfileira as primeiras tarefas. Daí em diante tudo roda no worker. */
export async function startRun(input: unknown) {
  const cfg = runConfigSchema.parse(input);
  const estimate = await estimateForConfig(cfg);
  const niches = cfg.niches.map((n) => resolveNiche(n).label).join(", ");
  const cities = cfg.regions.map((r) => r.city).join(", ");
  const run = await prisma.run.create({
    data: {
      name: cfg.name || `${niches} — ${cities}`,
      mode: cfg.mode,
      status: "RUNNING",
      config: cfg as unknown as Prisma.InputJsonValue,
      estimate: estimate as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
      notice:
        cfg.mode === "REAL" && estimate.unknown
          ? "Alguns preços não estão configurados; as operações correspondentes ficarão aguardando configuração se o bloqueio de preços desconhecidos estiver ativo."
          : null,
    },
  });
  const queries = discoveryQueries(cfg);
  await enqueueMany(
    queries.map((q, i) => ({
      type: "DISCOVER",
      runId: run.id,
      idempotencyKey: `${run.id}:DISCOVER:${i}:0`,
      payload: { ...q, queryIndex: i, page: 0 },
      priority: 10,
      maxAttempts: 4,
    })),
  );
  await enqueue({ type: "RUN_ADVANCE", runId: run.id, idempotencyKey: `${run.id}:RUN_ADVANCE`, priority: 200, maxAttempts: 1_000_000, runAt: new Date(Date.now() + 2000) });
  return run;
}

export async function pauseRun(id: string) {
  return prisma.run.updateMany({ where: { id, status: "RUNNING" }, data: { status: "PAUSED" } });
}

export async function resumeRun(id: string) {
  return prisma.run.updateMany({ where: { id, status: "PAUSED" }, data: { status: "RUNNING" } });
}

export async function cancelRun(id: string) {
  await prisma.run.updateMany({ where: { id, status: { in: ["RUNNING", "PAUSED", "PENDING"] } }, data: { status: "CANCELED", finishedAt: new Date() } });
  await prisma.job.updateMany({ where: { runId: id, status: { in: ["PENDING", "WAITING_CONFIG", "WAITING_AUTH"] } }, data: { status: "CANCELED", finishedAt: new Date() } });
  // Mensagens ainda não enviadas desta execução são canceladas (nunca as já enviadas).
  await prisma.message.updateMany({ where: { runId: id, status: { in: ["QUEUED", "DRAFT"] } }, data: { status: "CANCELED" } });
}

export function parseConfig(run: { config: Prisma.JsonValue }): RunConfig {
  return runConfigSchema.parse(run.config);
}
