import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { WaitingConfigError } from "@/server/errors";
import { claimNextJob, enqueue, failJob, recoverStaleJobs, retryJobs } from "@/server/queue";
import { resetDb } from "./helpers";

async function makeRun(status: "RUNNING" | "PAUSED" = "RUNNING") {
  return prisma.run.create({ data: { name: "t", mode: "SIMULATION", status, config: {} } });
}

describe("fila persistente", () => {
  beforeEach(resetDb);

  it("enfileirar com a mesma chave não duplica", async () => {
    expect(await enqueue({ type: "X", idempotencyKey: "k1" })).toBe(true);
    expect(await enqueue({ type: "X", idempotencyKey: "k1" })).toBe(false);
    expect(await prisma.job.count()).toBe(1);
  });

  it("captura concorrente entrega cada tarefa a um único worker", async () => {
    for (let i = 0; i < 20; i++) await enqueue({ type: "X", idempotencyKey: `k${i}` });
    const claimed = await Promise.all(Array.from({ length: 30 }, (_, i) => claimNextJob(`w${i}`)));
    const ids = claimed.filter(Boolean).map((j) => j!.id);
    expect(ids.length).toBe(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("não captura tarefas de execuções pausadas", async () => {
    const run = await makeRun("PAUSED");
    await enqueue({ type: "X", idempotencyKey: "p1", runId: run.id });
    expect(await claimNextJob("w")).toBeNull();
    await prisma.run.update({ where: { id: run.id }, data: { status: "RUNNING" } });
    expect(await claimNextJob("w")).not.toBeNull();
  });

  it("recupera tarefas travadas após queda do worker", async () => {
    await enqueue({ type: "X", idempotencyKey: "s1" });
    const job = await claimNextJob("morto");
    await prisma.job.update({ where: { id: job!.id }, data: { lockedAt: new Date(Date.now() - 3_600_000) } });
    expect(await recoverStaleJobs(60_000)).toBe(1);
    const again = await claimNextJob("vivo");
    expect(again?.id).toBe(job!.id);
    expect(again?.attempts).toBe(2);
  });

  it("falhas: retentativa com espera, limite de tentativas e 'aguardando configuração'", async () => {
    await enqueue({ type: "X", idempotencyKey: "f1", maxAttempts: 2 });
    let job = await claimNextJob("w");
    await failJob(job!, new Error("instável"));
    let row = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } });
    expect(row.status).toBe("PENDING");
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.job.update({ where: { id: row.id }, data: { runAt: new Date() } });
    job = await claimNextJob("w");
    await failJob(job!, new Error("instável"));
    row = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } });
    expect(row.status).toBe("FAILED");

    await enqueue({ type: "X", idempotencyKey: "f2" });
    const j2 = await claimNextJob("w");
    await failJob(j2!, new WaitingConfigError("sem chave"));
    expect((await prisma.job.findUniqueOrThrow({ where: { id: j2!.id } })).status).toBe("WAITING_CONFIG");
    expect(await retryJobs({ id: j2!.id })).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: j2!.id } })).status).toBe("PENDING");
  });
});
