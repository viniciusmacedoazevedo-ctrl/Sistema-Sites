import { api, json } from "@/server/api";
import { estimateForConfig, runConfigSchema } from "@/server/runs";

export const POST = api(async (req) => estimateForConfig(runConfigSchema.parse(await json(req))));
