import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { audit } from "@/server/audit";
import { retryRun } from "@/server/data-ops";
import { cancelRun, pauseRun, resumeRun } from "@/server/runs";

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = api<Ctx>(async (_req, { params, user }) => {
  const { id, action } = await params;
  switch (action) {
    case "pause":
      await pauseRun(id);
      break;
    case "resume":
      await resumeRun(id);
      break;
    case "cancel":
      await cancelRun(id);
      break;
    case "retry": {
      const count = await retryRun(id, user);
      return { retried: count };
    }
    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
  await audit(`execucao.${action}`, { actor: user, entity: "Run", entityId: id });
  return { ok: true };
});
