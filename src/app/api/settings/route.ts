import { saveSettings } from "@/lib/settings";
import { api, json } from "@/server/api";
import { audit } from "@/server/audit";

export const PUT = api(async (req, { user }) => {
  const saved = await saveSettings(await json(req));
  await audit("configuracoes.alteradas", { actor: user });
  return saved;
});
