import { prisma } from "@/lib/db";

export const STAGE_ORDER = [
  "DISCOVER",
  "NORMALIZE",
  "CHECK_PRESENCE",
  "SCORE",
  "GENERATE_CONTENT",
  "BUILD_SITE",
  "VALIDATE_SITE",
  "PUBLISH_SITE",
  "GENERATE_MESSAGE",
  "CHECK_ELIGIBILITY",
  "SEND_MESSAGE",
  "FINALIZE",
];

export async function runProgress(runId: string) {
  const rows = await prisma.job.groupBy({ by: ["type", "status"], where: { runId }, _count: true });
  const byType: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    byType[r.type] ??= {};
    byType[r.type][r.status] = r._count;
  }
  const stages = STAGE_ORDER.map((type) => {
    const s = byType[type] ?? {};
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const finished = total - (s.PENDING ?? 0) - (s.RUNNING ?? 0);
    return { type, total, finished, counts: s };
  });
  const all = stages.reduce((a, s) => a + s.total, 0);
  const done = stages.reduce((a, s) => a + s.finished, 0);
  const attention = stages.reduce((a, s) => a + (s.counts.FAILED ?? 0) + (s.counts.WAITING_CONFIG ?? 0) + (s.counts.WAITING_AUTH ?? 0), 0);
  return { stages, all, done, attention };
}

export async function dashboardStats() {
  const startDay = new Date();
  startDay.setHours(0, 0, 0, 0);
  const startMonth = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
  const count = async (isSimulated: boolean) => {
    const co = { isSimulated };
    const [companies, notFound, sitesGenerated, sitesPublished, msgsPrepared, msgsSent] = await Promise.all([
      prisma.company.count({ where: co }),
      prisma.company.count({ where: { ...co, presenceStatus: "NOT_FOUND" } }),
      prisma.demoSite.count({ where: { html: { not: null }, company: co } }),
      prisma.demoSite.count({ where: { status: "PUBLISHED", company: co } }),
      prisma.message.count({ where: { company: co } }),
      prisma.message.count({ where: { status: { in: ["SENT", "DELIVERED", "READ"] }, company: co } }),
    ]);
    return { companies, notFound, sitesGenerated, sitesPublished, msgsPrepared, msgsSent };
  };
  const [real, sim, replies, errors, costToday, costMonth, usage, waiting] = await Promise.all([
    count(false),
    count(true),
    prisma.contactEvent.count({ where: { type: "RESPOSTA_RECEBIDA" } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.costEntry.aggregate({ _sum: { estimatedCost: true }, where: { createdAt: { gte: startDay } } }),
    prisma.costEntry.aggregate({ _sum: { estimatedCost: true }, where: { createdAt: { gte: startMonth } } }),
    prisma.costEntry.groupBy({ by: ["provider", "operation"], _sum: { units: true, estimatedCost: true }, where: { createdAt: { gte: startMonth } } }),
    prisma.job.count({ where: { status: { in: ["WAITING_CONFIG", "WAITING_AUTH"] } } }),
  ]);
  return {
    ...real,
    sim,
    replies,
    errors,
    waiting,
    costToday: costToday._sum.estimatedCost ?? 0,
    costMonth: costMonth._sum.estimatedCost ?? 0,
    usage: usage.map((u) => ({ key: `${u.provider}:${u.operation}`, units: u._sum.units ?? 0, cost: u._sum.estimatedCost ?? 0 })),
  };
}
