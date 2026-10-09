import { api, json } from "@/server/api";
import { audit } from "@/server/audit";
import { startRun } from "@/server/runs";

export const POST = api(async (req, { user }) => {
  const run = await startRun(await json(req));
  await audit("execucao.iniciada", { actor: user, entity: "Run", entityId: run.id, details: { mode: run.mode } });
  return { id: run.id };
});
