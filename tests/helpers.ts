import { prisma } from "@/lib/db";
import { saveSettings } from "@/lib/settings";
import { processJob } from "@/server/pipeline";
import { claimNextJob, failJob } from "@/server/queue";
import { setDeps, type Deps } from "@/server/deps";

export async function resetDb() {
  const tables = ["Job", "RunCompany", "Message", "ContactEvent", "DemoSite", "CostEntry", "Company", "Run", "Consent", "Suppression", "AuditLog", "AuthThrottle", "Setting"];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

/** Processa a fila até esvaziar (equivalente ao worker, de forma síncrona). */
export async function drain(maxJobs = 2000, opts: { untilTime?: boolean } = {}) {
  let processed = 0;
  for (; processed < maxJobs; processed++) {
    let job = await claimNextJob("test");
    if (!job) {
      // Tarefas reagendadas para alguns segundos à frente (RUN_ADVANCE, paginação) são antecipadas.
      const soon = await prisma.job.updateMany({ where: { status: "PENDING", runAt: { gt: new Date(), lt: new Date(Date.now() + 60_000) } }, data: { runAt: new Date() } });
      if (soon.count === 0 && !opts.untilTime) break;
      job = await claimNextJob("test");
      if (!job) break;
    }
    try {
      await processJob(job);
    } catch (e) {
      await failJob(job, e);
    }
  }
  return processed;
}

export function useDeps(partial: Partial<Deps>) {
  setDeps({ browserValidation: false, ...partial });
}

export async function settings(partial: Record<string, unknown>) {
  return saveSettings(partial);
}

export function failIfCalled(name: string) {
  return () => {
    throw new Error(`${name} não deveria ser chamado`);
  };
}
