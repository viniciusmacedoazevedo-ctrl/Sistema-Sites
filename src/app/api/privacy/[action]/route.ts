import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { api } from "@/server/api";
import { audit } from "@/server/audit";
import { maintenance } from "@/server/pipeline";

type Ctx = { params: Promise<{ action: string }> };

export const POST = api<Ctx>(async (_req, { params, user }) => {
  const { action } = await params;
  if (action === "purge-simulation") {
    const companies = await prisma.company.deleteMany({ where: { isSimulated: true } });
    const runs = await prisma.run.deleteMany({ where: { mode: "SIMULATION", status: { in: ["COMPLETED", "CANCELED", "FAILED"] } } });
    await audit("privacidade.simulacoes_removidas", { actor: user, details: { companies: companies.count, runs: runs.count } });
    return { companies: companies.count, runs: runs.count };
  }
  if (action === "maintenance") {
    const r = await maintenance(await getSettings());
    await audit("privacidade.manutencao", { actor: user, details: r });
    return r;
  }
  if (action === "purge-audit") {
    const r = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    return { deleted: r.count };
  }
  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
});
