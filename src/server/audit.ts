import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function audit(action: string, opts: { actor?: string; entity?: string; entityId?: string; details?: Prisma.InputJsonValue; ip?: string | null } = {}) {
  try {
    await prisma.auditLog.create({
      data: { actor: opts.actor ?? "sistema", action, entity: opts.entity, entityId: opts.entityId, details: opts.details, ip: opts.ip ?? null },
    });
  } catch (e) {
    console.error("[audit] falha ao registrar", e);
  }
}
