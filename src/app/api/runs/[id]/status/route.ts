import { prisma } from "@/lib/db";
import { api } from "@/server/api";
import { runProgress } from "@/server/progress";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const run = await prisma.run.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, stage: true, notice: true, error: true } });
  return { run, progress: await runProgress(id) };
});
