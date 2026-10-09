import { z } from "zod";
import { resolveNiche } from "@/lib/niches";
import { shortHash } from "@/lib/normalize";
import type { AiClient } from "../ai";
import { findInventedClaims } from "../content/site-content";

export interface MessageFacts {
  companyId: string;
  name: string;
  niche: string | null;
  city: string | null;
  presenceStatus: string;
  socialOnly: boolean;
  demoUrl: string | null;
  senderName: string;
  senderCompany: string;
}

const messageSchema = z.object({ body: z.string().min(80).max(700) });

function pick<T>(arr: T[], seed: string) {
  return arr[parseInt(shortHash(seed, 8), 16) % arr.length];
}

function observation(f: MessageFacts): string {
  if (f.presenceStatus === "NOT_FOUND" && f.socialOnly) return "vi que vocês aparecem nas redes sociais, mas não encontrei um site próprio";
  if (f.presenceStatus === "NOT_FOUND") return "não encontrei um site de vocês nas buscas que fiz";
  if (f.presenceStatus === "PROBLEMS") return "tentei acessar o site de vocês e notei alguns pontos que poderiam ser melhorados";
  return "pensei em uma forma de deixar a presença online de vocês ainda mais completa";
}

/** Mensagem por template (sem custo), com variações e sem afirmações inventadas. */
export function templateMessage(f: MessageFacts): string {
  const niche = resolveNiche(f.niche ?? "servicos-locais");
  const intro = f.senderCompany ? `Meu nome é ${f.senderName}, da ${f.senderCompany}.` : `Meu nome é ${f.senderName}.`;
  const where = f.city ? ` aí em ${f.city}` : "";
  const openers = [`Olá, pessoal da ${f.name}! Tudo bem?`, `Oi! Tudo bem por aí na ${f.name}?`, `Olá! Falo com a ${f.name}?`];
  const middles = [
    `Encontrei a ${f.name}${where} e ${observation(f)}.`,
    `Estava pesquisando ${niche.label.toLowerCase()}${where}, encontrei a ${f.name} e ${observation(f)}.`,
  ];
  const offer = f.demoUrl
    ? `Preparei uma demonstração de como poderia ficar um site para vocês: ${f.demoUrl}`
    : `Preparei uma ideia de site para vocês e posso enviar o link se tiverem interesse.`;
  const why = pick(
    [
      "Um site ajuda clientes a encontrar serviços, horários e contato com facilidade.",
      "Um site próprio facilita que novos clientes conheçam o trabalho de vocês e entrem em contato.",
    ],
    f.companyId + "w",
  );
  const close = pick(
    [
      "Se gostarem da ideia, posso explicar como funcionaria para transformar a demonstração em um site oficial. Se não tiverem interesse, é só me avisar que não envio mais mensagens.",
      "Se fizer sentido, posso explicar os próximos passos sem compromisso. Caso não queiram receber mensagens, basta responder PARAR.",
    ],
    f.companyId + "c",
  );
  return [pick(openers, f.companyId + "o"), `${intro} ${pick(middles, f.companyId + "m")}`, offer, why, close].join("\n\n");
}

const SYSTEM = `Você escreve mensagens comerciais curtas em português do Brasil, de uma pessoa real para uma pequena empresa local, apresentando uma demonstração de site.
REGRAS: mencione o nome correto da empresa; seja natural, educado e breve (até ~110 palavras); não invente nada sobre a empresa; não diga que a empresa aprovou o site; não prometa resultados (vendas, clientes, posição no Google); não use emojis em excesso (no máximo 1); inclua o link exatamente como fornecido, se houver; termine oferecendo explicar mais e dizendo que, se não houver interesse, basta avisar para não receber mais mensagens.`;

export async function composeMessage(f: MessageFacts, ai: AiClient | null) {
  if (!ai) return { body: templateMessage(f), source: "template", inputTokens: 0, outputTokens: 0, warning: null as string | null };
  try {
    const r = await ai.generateJson({
      schema: messageSchema,
      system: SYSTEM,
      maxTokens: 2000,
      prompt: `Dados (JSON): ${JSON.stringify({
        remetente: f.senderName,
        empresa_remetente: f.senderCompany || null,
        empresa_destino: f.name,
        segmento: resolveNiche(f.niche ?? "servicos-locais").label,
        cidade: f.city,
        observacao_verificada: observation(f),
        link_demonstracao: f.demoUrl,
      })}`,
    });
    const body = r.data.body.trim();
    const problems = findInventedClaims(body);
    if (!body.includes(f.name)) problems.push("nome ausente");
    if (f.demoUrl && !body.includes(f.demoUrl)) problems.push("link ausente");
    if (/aprovad|oficial d[ao] (sua|vossa)/i.test(body)) problems.push("sugere aprovação");
    if (problems.length) {
      return { body: templateMessage(f), source: "template", inputTokens: r.inputTokens, outputTokens: r.outputTokens, warning: `Mensagem da IA descartada (${problems.join(", ")}).` };
    }
    return { body, source: `ia:${ai.model}`, inputTokens: r.inputTokens, outputTokens: r.outputTokens, warning: null };
  } catch (e) {
    return { body: templateMessage(f), source: "template", inputTokens: 0, outputTokens: 0, warning: `Falha na IA: ${(e as Error).message}` };
  }
}

export function emailFooter(opts: { senderName: string; senderCompany: string; senderAddress: string; optOutUrl: string | null }) {
  return [
    "",
    "—",
    [opts.senderName, opts.senderCompany].filter(Boolean).join(" · "),
    opts.senderAddress,
    opts.optOutUrl ? `Não quer receber mais mensagens? Descadastre-se: ${opts.optOutUrl}` : "Para não receber mais mensagens, responda este e-mail com DESCADASTRAR.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
