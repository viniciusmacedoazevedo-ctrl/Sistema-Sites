import { prisma } from "@/lib/db";
import { api } from "@/server/api";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = api<Ctx>(async (_req, { params, user }) => {
  const { id } = await params;
  await prisma.consent.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit("optin.revogado", { actor: user, entity: "Consent", entityId: id });
  return { ok: true };
});
