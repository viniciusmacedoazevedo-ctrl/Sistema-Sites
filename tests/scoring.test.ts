import { describe, expect, it } from "vitest";
import { meetsCriteria, scoreCompany } from "@/server/scoring";

const base = { niche: "barbearia", hasPhone: true, phoneIsMobile: true, hasEmail: false, hasAddress: true, hasOpeningHours: true, ratingCount: 60, businessStatus: "OPERATIONAL" };

describe("pontuação de oportunidade", () => {
  it("prioriza empresas sem site identificado e explica cada ponto", () => {
    const noSite = scoreCompany({ ...base, presence: { status: "NOT_FOUND", issues: [] } });
    const withSite = scoreCompany({ ...base, presence: { status: "FUNCTIONAL", issues: [] } });
    expect(noSite.score).toBeGreaterThan(withSite.score);
    expect(noSite.reasons.every((r) => r.text.length > 5)).toBe(true);
    expect(noSite.reasons.reduce((s, r) => s + r.points, 0)).toBe(noSite.score);
  });

  it("site com problemas pontua mais que site funcional e menos que sem site", () => {
    const p = scoreCompany({ ...base, presence: { status: "PROBLEMS", issues: ["Sem HTTPS"] } }).score;
    expect(p).toBeLessThan(scoreCompany({ ...base, presence: { status: "NOT_FOUND", issues: [] } }).score);
    expect(p).toBeGreaterThan(scoreCompany({ ...base, presence: { status: "FUNCTIONAL", issues: [] } }).score);
  });

  it("exclui empresas fechadas", () => {
    const r = scoreCompany({ ...base, businessStatus: "CLOSED_PERMANENTLY", presence: { status: "NOT_FOUND", issues: [] } });
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("aplica critérios mínimos", () => {
    const criteria = { minScore: 50, requirePhone: true, includeFunctionalSites: false };
    expect(meetsCriteria({ score: 80, phoneNormalized: "+5511987654321", presenceStatus: "NOT_FOUND", doNotContact: false }, criteria).ok).toBe(true);
    expect(meetsCriteria({ score: 40, phoneNormalized: "+5511987654321", presenceStatus: "NOT_FOUND", doNotContact: false }, criteria).ok).toBe(false);
    expect(meetsCriteria({ score: 80, phoneNormalized: null, presenceStatus: "NOT_FOUND", doNotContact: false }, criteria).ok).toBe(false);
    expect(meetsCriteria({ score: 80, phoneNormalized: "+5511987654321", presenceStatus: "FUNCTIONAL", doNotContact: false }, criteria).ok).toBe(false);
    expect(meetsCriteria({ score: 80, phoneNormalized: "+5511987654321", presenceStatus: "NOT_FOUND", doNotContact: true }, criteria).ok).toBe(false);
  });
});
