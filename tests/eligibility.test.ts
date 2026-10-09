import { describe, expect, it } from "vitest";
import { evaluateEligibility, type EligibilityInput } from "@/server/messaging/eligibility";

const base: EligibilityInput = {
  mode: "REAL",
  channel: "WHATSAPP",
  autoSendEnabled: true,
  company: { isSimulated: false, doNotContact: false, phoneNormalized: "+5511987654321", phoneIsMobile: true, email: null, sourceUrl: "https://maps.google.com/?cid=1" },
  recipientSuppressed: false,
  consent: { basis: "formulário do site em 01/10", revokedAt: null },
  alreadyContactedRecipient: false,
  sentTodayOnChannel: 0,
  dailyLimit: 10,
  channelConfigured: true,
  whatsappTemplateConfigured: true,
  emailLegalBasisConfirmed: true,
  hasOptOutLink: true,
};

describe("regras de envio", () => {
  it("permite envio com opt-in, canal configurado e dentro do limite", () => {
    const r = evaluateEligibility(base);
    expect(r.decision).toBe("SEND");
    expect(r.consentBasis).toMatch(/opt-in/);
  });

  it("telefone público sem opt-in NÃO autoriza WhatsApp, e sugere alternativa", () => {
    const r = evaluateEligibility({ ...base, consent: null });
    expect(r.decision).toBe("BLOCK");
    expect(r.reason).toMatch(/opt-in/);
    expect(r.alternative).toMatch(/manualmente/);
  });

  it("opt-in revogado bloqueia", () => {
    expect(evaluateEligibility({ ...base, consent: { basis: "x", revokedAt: new Date() } }).decision).toBe("BLOCK");
  });

  it("supressão, não contatar e duplicidade sempre bloqueiam (mesmo em simulação)", () => {
    expect(evaluateEligibility({ ...base, recipientSuppressed: true }).decision).toBe("BLOCK");
    expect(evaluateEligibility({ ...base, company: { ...base.company, doNotContact: true } }).decision).toBe("BLOCK");
    expect(evaluateEligibility({ ...base, alreadyContactedRecipient: true }).decision).toBe("BLOCK");
    expect(evaluateEligibility({ ...base, mode: "SIMULATION", recipientSuppressed: true }).decision).toBe("BLOCK");
  });

  it("simulação nunca envia", () => {
    expect(evaluateEligibility({ ...base, mode: "SIMULATION" }).decision).toBe("SIMULATE");
    expect(evaluateEligibility({ ...base, company: { ...base.company, isSimulated: true } }).decision).toBe("SIMULATE");
  });

  it("envio automático desligado → rascunho; limite diário → adiado; sem template → aguardando configuração", () => {
    expect(evaluateEligibility({ ...base, autoSendEnabled: false }).decision).toBe("BLOCK");
    expect(evaluateEligibility({ ...base, sentTodayOnChannel: 10 }).decision).toBe("DEFER");
    expect(evaluateEligibility({ ...base, whatsappTemplateConfigured: false }).decision).toBe("WAITING_CONFIG");
    expect(evaluateEligibility({ ...base, channelConfigured: false }).decision).toBe("WAITING_CONFIG");
  });

  it("telefone fixo não é elegível para WhatsApp", () => {
    expect(evaluateEligibility({ ...base, company: { ...base.company, phoneIsMobile: false } }).decision).toBe("BLOCK");
  });

  it("e-mail exige base legal confirmada e link de descadastro", () => {
    const email = { ...base, channel: "EMAIL" as const, consent: null, company: { ...base.company, email: "contato@empresa.com.br" } };
    expect(evaluateEligibility(email).decision).toBe("SEND");
    expect(evaluateEligibility({ ...email, emailLegalBasisConfirmed: false }).decision).toBe("WAITING_CONFIG");
    expect(evaluateEligibility({ ...email, hasOptOutLink: false }).decision).toBe("WAITING_CONFIG");
    expect(evaluateEligibility({ ...email, company: { ...email.company, email: null } }).decision).toBe("BLOCK");
  });
});
