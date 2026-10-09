import { env } from "@/lib/env";
import { getAiClient, type AiClient } from "./ai";
import { GooglePlacesAdapter } from "./discovery/google-places";
import { SimulationDiscoveryAdapter } from "./discovery/simulation";
import type { DiscoveryAdapter } from "./discovery/types";
import { SmtpSender, WhatsAppCloudSender, type EmailSendInput, type SendResult, type WhatsAppSendInput } from "./messaging/channels";
import { checkPresence, simulatePresence, type PresenceResult } from "./presence";
import { getPublisher } from "./publish";
import type { Publisher } from "./publish/types";

/** Dependências externas injetáveis (substituídas por mocks nos testes). */
export interface Deps {
  discovery(simulation: boolean): DiscoveryAdapter;
  presence(website: string | null, simulation: boolean): Promise<PresenceResult>;
  ai(): AiClient | null;
  publisher(id: string): Publisher;
  verifyUrl(url: string): Promise<{ ok: boolean; detail: string }>;
  whatsapp: { configured: boolean; send(input: WhatsAppSendInput): Promise<SendResult> };
  email: { configured: boolean; send(input: EmailSendInput): Promise<SendResult> };
  browserValidation: boolean;
}

async function verifyUrl(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    return { ok: res.status === 200, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export function defaultDeps(): Deps {
  return {
    discovery: (simulation) => (simulation ? new SimulationDiscoveryAdapter() : new GooglePlacesAdapter(env.googlePlacesKey)),
    presence: async (website, simulation) => (simulation ? simulatePresence(website) : checkPresence(website)),
    ai: () => getAiClient(),
    publisher: (id) => getPublisher(id),
    verifyUrl,
    whatsapp: new WhatsAppCloudSender(),
    email: new SmtpSender(),
    browserValidation: true,
  };
}

let current: Deps | null = null;

export function getDeps(): Deps {
  if (!current) current = defaultDeps();
  return current;
}

export function setDeps(deps: Partial<Deps> | null) {
  current = deps ? { ...defaultDeps(), ...deps } : null;
}
