import { env } from "@/lib/env";
import { InternalPublisher } from "./internal";
import type { Publisher } from "./types";
import { VercelPublisher } from "./vercel";

export function getPublisher(id: string): Publisher {
  if (id === "vercel") return new VercelPublisher(env.vercelToken, env.vercelTeamId);
  return new InternalPublisher(env.publicBaseUrl);
}

export { InternalPublisher, VercelPublisher };
