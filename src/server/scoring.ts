import { getNiche, resolveNiche } from "@/lib/niches";
import type { PresenceResult } from "./presence";

export interface ScoreReason {
  points: number;
  text: string;
}

export interface ScoreInput {
  niche: string | null;
  presence: Pick<PresenceResult, "status" | "socialOnly" | "issues">;
  hasPhone: boolean;
  phoneIsMobile: boolean;
  hasEmail: boolean;
  hasAddress: boolean;
  hasOpeningHours: boolean;
  ratingCount: number | null;
  businessStatus: string | null;
}

export interface ScoreResult {
  score: number;
  reasons: ScoreReason[];
  excluded: boolean;
}

/**
 * Pontuação de oportunidade (0–100), explicável: cada ponto vem com o motivo.
 */
export function scoreCompany(input: ScoreInput): ScoreResult {
  const reasons: ScoreReason[] = [];
  const add = (points: number, text: string) => reasons.push({ points, text });

  if (input.businessStatus && input.businessStatus !== "OPERATIONAL") {
    add(0, `Empresa marcada pela fonte como "${input.businessStatus}" — excluída.`);
    return { score: 0, reasons, excluded: true };
  }

  switch (input.presence.status) {
    case "NOT_FOUND":
      if (input.presence.socialOnly) add(35, "Presença apenas em rede social: um site próprio pode complementar.");
      else add(40, "Nenhum site identificado nas fontes consultadas.");
      break;
    case "PROBLEMS":
      add(30, `Site identificado com possíveis problemas (${(input.presence.issues ?? []).slice(0, 3).join("; ") || "ver detalhes"}).`);
      break;
    case "INCONCLUSIVE":
      add(15, "Verificação do site inconclusiva.");
      break;
    case "FUNCTIONAL":
      add(0, "Já possui site funcional — menor potencial.");
      break;
    default:
      add(0, "Presença digital ainda não verificada.");
  }

  const niche = input.niche ? resolveNiche(input.niche) : getNiche(null);
  add(niche.siteBenefit, `Nicho "${niche.label}": benefício típico de um site (${niche.siteBenefit}/15).`);

  if (input.hasPhone) {
    if (input.phoneIsMobile) add(15, "Telefone comercial celular informado (canal de contato possível, sujeito às regras).");
    else add(8, "Telefone comercial fixo informado.");
  } else {
    add(0, "Sem telefone informado — contato mais difícil.");
  }
  if (input.hasEmail) add(5, "E-mail comercial conhecido.");
  if (input.hasAddress) add(5, "Endereço informado pela fonte.");
  if (input.hasOpeningHours) add(5, "Horário de funcionamento informado pela fonte.");

  const rc = input.ratingCount ?? 0;
  if (rc >= 50) add(15, `Negócio ativo com ${rc} avaliações públicas na fonte.`);
  else if (rc >= 10) add(10, `Negócio com ${rc} avaliações públicas na fonte.`);
  else if (rc > 0) add(4, `Poucas avaliações públicas (${rc}).`);

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score, reasons, excluded: false };
}

export interface SelectionCriteria {
  minScore: number;
  requirePhone: boolean;
  includeFunctionalSites: boolean;
}

export function meetsCriteria(
  c: { score: number | null; phoneNormalized: string | null; presenceStatus: string; doNotContact: boolean },
  criteria: SelectionCriteria,
): { ok: boolean; reason?: string } {
  if (c.doNotContact) return { ok: false, reason: "Marcada como não contatar" };
  if (c.score === null) return { ok: false, reason: "Sem pontuação" };
  if (c.score < criteria.minScore) return { ok: false, reason: `Pontuação ${c.score} abaixo do mínimo ${criteria.minScore}` };
  if (criteria.requirePhone && !c.phoneNormalized) return { ok: false, reason: "Sem telefone válido" };
  if (!criteria.includeFunctionalSites && c.presenceStatus === "FUNCTIONAL") return { ok: false, reason: "Já possui site funcional" };
  return { ok: true };
}
