import { z } from "zod";
import { resolveNiche, type NicheProfile } from "@/lib/niches";
import { shortHash } from "@/lib/normalize";
import type { AiClient } from "../ai";

export const siteContentSchema = z.object({
  heroTitle: z.string().min(3).max(90),
  heroSubtitle: z.string().min(10).max(220),
  about: z.string().min(40).max(700),
  services: z.array(z.object({ name: z.string().min(2).max(60), description: z.string().min(10).max(200) })).min(3).max(6),
  benefits: z.array(z.object({ title: z.string().min(2).max(60), description: z.string().min(10).max(200) })).min(3).max(4),
  ctaText: z.string().min(3).max(40),
  seoTitle: z.string().min(10).max(70),
  seoDescription: z.string().min(50).max(170),
  toConfirm: z.array(z.string().max(160)).max(8),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

/** Dados verificados da empresa que podem ser usados nos textos. */
export interface CompanyFacts {
  id: string;
  name: string;
  niche: string | null;
  category: string | null;
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  hasPhone: boolean;
  hasAddress: boolean;
  openingHours: string[] | null;
}

/**
 * Frases que indicam informação inventada (preços, tempo de mercado, prêmios, avaliações...).
 * Se a IA produzir algo assim, o conteúdo é descartado e o template seguro é usado.
 */
const INVENTED_CLAIMS = [
  /R\$\s?\d/i,
  /\b\d+\s*(anos|décadas)\s+(de|no)\b/i,
  /\bdesde\s+(19|20)\d{2}\b/i,
  /\bpremiad[ao]s?\b|\bprêmio/i,
  /\bcertificad[ao]s?\b|\bcertificação/i,
  /\bgaranti(a|do|da|mos)\b/i,
  /\bmelhor(es)?\s+d[ao]s?\s+(cidade|região|bairro|brasil)/i,
  /\bn[º°o]\.?\s?1\b|\bnúmero\s+1\b|\blíder\b/i,
  /\bdepoimento|\bestrelas\b|\bavaliaç(ão|ões)\s+(5|cinco)/i,
  /\b\d+\s*(mil|\+)\s*(clientes|atendimentos)/i,
  /\b\d{1,3}\s?%/,
];

export function findInventedClaims(text: string): string[] {
  return INVENTED_CLAIMS.filter((re) => re.test(text)).map((re) => re.source);
}

function pick<T>(arr: readonly T[], seed: string, salt = ""): T {
  const n = parseInt(shortHash(seed + salt, 8), 16);
  return arr[n % arr.length];
}

function where(f: CompanyFacts) {
  return f.neighborhood && f.city ? `${f.neighborhood}, ${f.city}` : (f.city ?? "sua região");
}

/** Conteúdo determinístico, sem custo e sem afirmações não verificadas. */
export function templateContent(f: CompanyFacts): SiteContent {
  const niche: NicheProfile = resolveNiche(f.niche ?? "servicos-locais");
  const loc = where(f);
  const heroTitles = [
    `${f.name}: ${niche.heroAngle}`,
    `${niche.heroAngle.replace(/^\w/, (c) => c.toUpperCase())} em ${loc}`,
    `Conheça a ${f.name}`,
  ];
  const subtitles = [
    `Atendimento em ${loc}. Fale com a equipe e tire suas dúvidas.`,
    `Informações, serviços e contato da ${f.name} em um só lugar.`,
    `Entre em contato e descubra como a ${f.name} pode ajudar você.`,
  ];
  const abouts = [
    `A ${f.name} atende clientes em ${loc}, oferecendo serviços de ${niche.label.toLowerCase()}. Este texto é uma apresentação inicial e pode ser ajustado com a história, os diferenciais e os detalhes reais da empresa.`,
    `Localizada em ${loc}, a ${f.name} trabalha com ${niche.heroAngle}. Esta seção pode contar a trajetória da empresa, sua equipe e o que a torna especial — informações a serem confirmadas com os responsáveis.`,
  ];
  const ctas = ["Fale conosco", "Entre em contato", "Solicite atendimento", "Pedir informações"];
  const toConfirm = [
    "Lista de serviços oferecidos (os itens exibidos são sugestões do segmento)",
    "Texto de apresentação e diferenciais da empresa",
    "Fotos reais do estabelecimento e dos trabalhos",
  ];
  if (!f.openingHours?.length) toConfirm.push("Horário de funcionamento");
  if (!f.hasPhone) toConfirm.push("Telefone/WhatsApp para contato");
  if (!f.hasAddress) toConfirm.push("Endereço completo");

  return {
    heroTitle: pick(heroTitles, f.id, "h").slice(0, 90),
    heroSubtitle: pick(subtitles, f.id, "s"),
    about: pick(abouts, f.id, "a"),
    services: niche.services.slice(0, 6).map((name) => ({ name, description: `Consulte a ${f.name} para saber como funciona e solicitar um orçamento.` })),
    benefits: niche.benefits.slice(0, 4).map((title) => ({ title, description: `${title} para quem procura ${niche.label.toLowerCase()} em ${f.city ?? "sua cidade"}.` })),
    ctaText: pick(ctas, f.id, "c"),
    seoTitle: `${f.name} — ${niche.label} em ${f.city ?? "sua cidade"}`.slice(0, 70),
    seoDescription: `${f.name}: ${niche.heroAngle} em ${loc}. Veja serviços, localização e formas de contato.`.slice(0, 170).padEnd(50, "."),
    toConfirm,
  };
}

const SYSTEM = `Você escreve textos em português do Brasil para sites de demonstração de pequenas empresas locais.
REGRAS OBRIGATÓRIAS:
- Use SOMENTE os fatos fornecidos. Não invente: preços, tempo de mercado, anos de experiência, prêmios, certificações, número de clientes, avaliações, depoimentos, garantias, promoções ou nomes de pessoas.
- Os serviços devem ser típicos do segmento e serão exibidos como "a confirmar com a empresa"; descreva-os de forma neutra, sem prometer resultados.
- Tom profissional, claro, acolhedor; frases curtas. Sem emojis. Sem superlativos como "o melhor".
- Em "toConfirm", liste o que precisa ser confirmado com a empresa.`;

export async function aiContent(f: CompanyFacts, ai: AiClient) {
  const niche = resolveNiche(f.niche ?? "servicos-locais");
  const facts = {
    nome: f.name,
    segmento: niche.label,
    categoria_informada_pela_fonte: f.category,
    cidade: f.city,
    bairro: f.neighborhood,
    estado: f.state,
    possui_telefone: f.hasPhone,
    possui_endereco: f.hasAddress,
    horario_informado: f.openingHours ?? null,
    servicos_tipicos_do_segmento: niche.services,
  };
  const result = await ai.generateJson({
    schema: siteContentSchema,
    system: SYSTEM,
    prompt: `Escreva o conteúdo do site de demonstração para esta empresa. Fatos verificados (JSON):\n${JSON.stringify(facts, null, 2)}`,
  });
  const all = JSON.stringify(result.data);
  const invented = findInventedClaims(all);
  if (!all.includes(f.name)) invented.push("nome da empresa ausente");
  return { ...result, invented };
}

/** Gera conteúdo com IA quando disponível; cai para o template seguro em caso de falha ou suspeita de invenção. */
export async function generateSiteContent(f: CompanyFacts, ai: AiClient | null) {
  if (!ai) return { content: templateContent(f), source: "template", inputTokens: 0, outputTokens: 0, warning: null as string | null };
  try {
    const r = await aiContent(f, ai);
    if (r.invented.length > 0) {
      return { content: templateContent(f), source: "template", inputTokens: r.inputTokens, outputTokens: r.outputTokens, warning: `Texto da IA descartado por possível informação não verificada (${r.invented.join(", ")}).` };
    }
    return { content: r.data, source: `ia:${ai.model}`, inputTokens: r.inputTokens, outputTokens: r.outputTokens, warning: null };
  } catch (e) {
    return { content: templateContent(f), source: "template", inputTokens: 0, outputTokens: 0, warning: `Falha na IA, usado template: ${(e as Error).message}` };
  }
}
