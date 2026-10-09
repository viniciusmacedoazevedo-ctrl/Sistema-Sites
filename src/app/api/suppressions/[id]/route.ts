import { prisma } from "@/lib/db";
import { api } from "@/server/api";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params;
  await prisma.suppression.delete({ where: { id } });
  await audit("bloqueio.removido", { actor: user, entity: "Suppression", entityId: id });
  return { ok: true };
});
