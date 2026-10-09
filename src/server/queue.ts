import { Prisma, type Job } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BudgetExceededError, PermanentError, SkipJobError, WaitingAuthError, WaitingConfigError } from "./errors";

/**
 * Fila persistente baseada no PostgreSQL.
 * - Cada tarefa tem uma chave de idempotência única: enfileirar duas vezes não duplica ações.
 * - A captura usa FOR UPDATE SKIP LOCKED, permitindo vários workers.
 * - Tarefas travadas por um worker que morreu voltam para a fila (recoverStaleJobs).
 * - Tarefas de execuções pausadas/canceladas não são capturadas.
 */

export interface EnqueueInput {
  type: string;
  idempotencyKey: string;
  runId?: string | null;
  companyId?: string | null;
  payload?: Prisma.InputJsonValue;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
}

export async function enqueue(input: EnqueueInput): Promise<boolean> {
  const res = await prisma.job.createMany({
    data: [
      {
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        runId: input.runId ?? null,
        companyId: input.companyId ?? null,
        payload: input.payload ?? {},
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 3,
        runAt: input.runAt ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
  return res.count === 1;
}

export async function enqueueMany(inputs: EnqueueInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const res = await prisma.job.createMany({
    data: inputs.map((input) => ({
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      runId: input.runId ?? null,
      companyId: input.companyId ?? null,
      payload: input.payload ?? {},
      priority: input.priority ?? 100,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt ?? new Date(),
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Captura atomicamente a próxima tarefa disponível. */
export async function claimNextJob(workerId: string): Promise<Job | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId},
      attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (
      SELECT j.id FROM "Job" j
      LEFT JOIN "Run" r ON r.id = j."runId"
      WHERE j.status = 'PENDING' AND j."runAt" <= NOW()
        AND (j."runId" IS NULL OR r.status = 'RUNNING')
      ORDER BY j.priority ASC, j."runAt" ASC, j."createdAt" ASC
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  if (rows.length === 0) return null;
  return prisma.job.findUnique({ where: { id: rows[0].id } });
}

/** Devolve à fila tarefas cujo worker parou de responder (reinício, queda). */
export async function recoverStaleJobs(staleAfterMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stale = await prisma.job.findMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    select: { id: true, attempts: true, maxAttempts: true },
  });
  for (const job of stale) {
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING", lockedAt: { lt: cutoff } },
      data: exhausted
        ? { status: "FAILED", lockedAt: null, lockedBy: null, finishedAt: new Date(), lastError: "Tempo esgotado: o worker parou durante a execução." }
        : { status: "PENDING", lockedAt: null, lockedBy: null, lastError: "Recuperada após o worker parar durante a execução." },
    });
  }
  return stale.length;
}

export async function completeJob(job: Job, result?: Prisma.InputJsonValue) {
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "COMPLETED", result: result ?? Prisma.JsonNull, lockedAt: null, lockedBy: null, finishedAt: new Date(), lastError: null },
  });
}

/** Reagenda sem contar como tentativa (ex.: aguardando outras tarefas). */
export async function rescheduleJob(job: Job, delayMs: number) {
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "PENDING", attempts: { decrement: 1 }, runAt: new Date(Date.now() + delayMs), lockedAt: null, lockedBy: null },
  });
}

export function backoffMs(attempt: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const base = { lockedAt: null, lockedBy: null, lastError: message.slice(0, 2000) };

  if (error instanceof WaitingConfigError) {
    await prisma.job.update({ where: { id: job.id }, data: { ...base, status: "WAITING_CONFIG", finishedAt: new Date() } });
    return;
  }
  if (error instanceof WaitingAuthError) {
    await prisma.job.update({ where: { id: job.id }, data: { ...base, status: "WAITING_AUTH", finishedAt: new Date() } });
    return;
  }
  if (error instanceof BudgetExceededError || error instanceof SkipJobError) {
    await prisma.job.update({ where: { id: job.id }, data: { ...base, status: "SKIPPED", finishedAt: new Date() } });
    return;
  }
  if (error instanceof PermanentError || job.attempts >= job.maxAttempts) {
    await prisma.job.update({ where: { id: job.id }, data: { ...base, status: "FAILED", finishedAt: new Date() } });
    return;
  }
  await prisma.job.update({
    where: { id: job.id },
    data: { ...base, status: "PENDING", runAt: new Date(Date.now() + backoffMs(job.attempts)) },
  });
}

/** Coloca de volta na fila tarefas que aguardavam configuração/autorização ou falharam. */
export async function retryJobs(where: Prisma.JobWhereInput): Promise<number> {
  const res = await prisma.job.updateMany({
    where: { ...where, status: { in: ["WAITING_CONFIG", "WAITING_AUTH", "FAILED"] } },
    data: { status: "PENDING", attempts: 0, runAt: new Date(), finishedAt: null, lastError: null },
  });
  return res.count;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tempo limite excedido (${Math.round(ms / 1000)}s) em ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
