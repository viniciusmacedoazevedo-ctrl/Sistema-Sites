import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "@/lib/db";
import { processJob, JOB_TIMEOUT_MS } from "@/server/pipeline";
import { claimNextJob, enqueue, failJob, recoverStaleJobs, withTimeout } from "@/server/queue";

/**
 * Worker de tarefas em segundo plano. Rode com `npm run worker` em um servidor
 * (Railway, Render, Fly.io, VPS...). Pode haver mais de uma instância.
 */
const WORKER_ID = `${hostname()}-${process.pid}-${randomUUID().slice(0, 6)}`;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2));
const STALE_AFTER_MS = 6 * 60_000;
const IDLE_MS = 1500;

let stopping = false;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), `[worker ${WORKER_ID}]`, ...args);
}

async function loop(slot: number) {
  while (!stopping) {
    let job;
    try {
      job = await claimNextJob(WORKER_ID);
    } catch (e) {
      log(`slot ${slot}: erro ao capturar tarefa`, (e as Error).message);
      await sleep(5000);
      continue;
    }
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    const started = Date.now();
    try {
      const outcome = await withTimeout(processJob(job), JOB_TIMEOUT_MS[job.type] ?? 60_000, job.type);
      if (outcome === "done") log(`✔ ${job.type} ${job.companyId ?? ""} (${Date.now() - started}ms)`);
    } catch (e) {
      log(`✖ ${job.type} ${job.companyId ?? ""} tentativa ${job.attempts}/${job.maxAttempts}: ${(e as Error).message}`);
      await failJob(job, e).catch((err) => log("falha ao registrar erro", err));
    }
  }
}

async function housekeeping() {
  while (!stopping) {
    try {
      const recovered = await recoverStaleJobs(STALE_AFTER_MS);
      if (recovered) log(`recuperadas ${recovered} tarefa(s) travadas`);
      const hourKey = new Date().toISOString().slice(0, 13);
      await enqueue({ type: "MAINTENANCE", idempotencyKey: `MAINTENANCE:${hourKey}`, priority: 500, maxAttempts: 1 });
    } catch (e) {
      log("housekeeping:", (e as Error).message);
    }
    await sleep(60_000);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log(`iniciado com ${CONCURRENCY} slot(s)`);
  // Ao reiniciar, tarefas deste host que ficaram "em andamento" voltam para a fila.
  await recoverStaleJobs(STALE_AFTER_MS);
  const loops = [housekeeping(), ...Array.from({ length: CONCURRENCY }, (_, i) => loop(i))];
  await Promise.all(loops);
  await prisma.$disconnect();
  log("encerrado");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`recebido ${sig}, finalizando tarefas em andamento...`);
    stopping = true;
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
