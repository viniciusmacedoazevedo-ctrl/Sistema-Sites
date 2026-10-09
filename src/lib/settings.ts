import { z } from "zod";
import { prisma } from "./db";

/**
 * Catálogo de preços. Valores padrão nulos significam "preço não configurado":
 * o usuário deve consultar a página oficial e preencher em Configurações.
 * Nenhum preço é inventado aqui.
 */
export const PRICE_CATALOG = [
  {
    key: "google_places:text_search",
    label: "Google Places — Text Search (por requisição/página)",
    unit: "USD por requisição",
    defaultPrice: null as number | null,
    url: "https://developers.google.com/maps/billing-and-pricing/pricing",
    note: "Os campos telefone/site entram em SKU de maior custo. Verifique o preço atual e a cota gratuita mensal.",
  },
  {
    key: "anthropic:input_mtok",
    label: "Anthropic — tokens de entrada (por milhão)",
    unit: "USD por 1M tokens",
    defaultPrice: 0.1 as number | null,
    url: "https://www.anthropic.com/pricing",
    note: "Valor padrão de claude-haiku-5-5 (≤100K tokens de prompt) conforme documentação de out/2026. Confira antes de usar.",
  },
  {
    key: "anthropic:output_mtok",
    label: "Anthropic — tokens de saída (por milhão)",
    unit: "USD por 1M tokens",
    defaultPrice: 0.5 as number | null,
    url: "https://www.anthropic.com/pricing",
    note: "Valor padrão de claude-haiku-5-5 conforme documentação de out/2026. Se trocar o modelo, atualize.",
  },
  {
    key: "vercel:deployment",
    label: "Vercel — publicação (por deploy)",
    unit: "USD por deploy",
    defaultPrice: null as number | null,
    url: "https://vercel.com/pricing",
    note: "Normalmente incluso no plano; informe 0 se for o seu caso.",
  },
  {
    key: "internal:publish",
    label: "Publicação interna (/d/<slug>)",
    unit: "USD por publicação",
    defaultPrice: 0 as number | null,
    url: "",
    note: "Servida pelo próprio servidor. Custo marginal desprezível (hospedagem já paga).",
  },
  {
    key: "whatsapp:template_message",
    label: "WhatsApp — mensagem de modelo (marketing)",
    unit: "USD por mensagem",
    defaultPrice: null as number | null,
    url: "https://developers.facebook.com/docs/whatsapp/pricing",
    note: "Preço varia por país e categoria. Verifique a tabela da Meta.",
  },
  {
    key: "smtp:email",
    label: "E-mail via SMTP",
    unit: "USD por e-mail",
    defaultPrice: null as number | null,
    url: "",
    note: "Depende do seu provedor. Informe 0 se estiver dentro da franquia.",
  },
] as const;

export type PriceKey = (typeof PRICE_CATALOG)[number]["key"];

export const settingsSchema = z.object({
  senderName: z.string().trim().min(1).max(80),
  senderCompany: z.string().trim().max(120),
  senderContact: z.string().trim().max(160),
  senderAddress: z.string().trim().max(200),
  autoSendEnabled: z.boolean(),
  channelDailyLimits: z.object({ WHATSAPP: z.number().int().min(0).max(1000), EMAIL: z.number().int().min(0).max(2000) }),
  emailLegalBasisConfirmed: z.boolean(),
  whatsappTemplateName: z.string().trim().max(120),
  whatsappTemplateLanguage: z.string().trim().max(10),
  dailySpendLimitUsd: z.number().min(0).max(10000),
  defaultRunSpendLimitUsd: z.number().min(0).max(10000),
  blockUnknownPrices: z.boolean(),
  prices: z.record(z.string(), z.number().min(0).nullable()),
  publisher: z.enum(["internal", "vercel"]),
  maxPublishedSites: z.number().int().min(0).max(5000),
  demoRetentionDays: z.number().int().min(1).max(3650),
  placesDataRetentionDays: z.number().int().min(1).max(3650),
  demoWhatsappButton: z.boolean(),
  useAi: z.boolean(),
  browserValidation: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  senderName: "Vinícius",
  senderCompany: "",
  senderContact: "",
  senderAddress: "",
  autoSendEnabled: false,
  channelDailyLimits: { WHATSAPP: 20, EMAIL: 30 },
  emailLegalBasisConfirmed: false,
  whatsappTemplateName: "",
  whatsappTemplateLanguage: "pt_BR",
  dailySpendLimitUsd: 5,
  defaultRunSpendLimitUsd: 2,
  blockUnknownPrices: true,
  prices: Object.fromEntries(PRICE_CATALOG.map((p) => [p.key, p.defaultPrice])),
  publisher: "internal",
  maxPublishedSites: 100,
  demoRetentionDays: 90,
  placesDataRetentionDays: 30,
  demoWhatsappButton: true,
  useAi: true,
  browserValidation: true,
};

const KEY = "app";

export async function getSettings(): Promise<Settings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Partial<Settings>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    channelDailyLimits: { ...DEFAULT_SETTINGS.channelDailyLimits, ...(stored.channelDailyLimits ?? {}) },
    prices: { ...DEFAULT_SETTINGS.prices, ...(stored.prices ?? {}) },
  };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(input: unknown): Promise<Settings> {
  const current = await getSettings();
  const data = settingsSchema.parse({ ...current, ...(input as object) });
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: data },
    update: { value: data },
  });
  return data;
}
