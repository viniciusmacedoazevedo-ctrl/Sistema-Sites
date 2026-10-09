import { describe, expect, it } from "vitest";
import type { AiClient } from "@/server/ai";
import { findInventedClaims, generateSiteContent, templateContent, type CompanyFacts } from "@/server/content/site-content";
import { renderSite } from "@/server/sitegen/render";
import { browserCheck, validateHtml } from "@/server/sitegen/validate";

const facts: CompanyFacts = {
  id: "c1",
  name: "Barbearia Navalha de Ouro",
  niche: "barbearia",
  category: "Barbearia",
  city: "Campinas",
  neighborhood: "Cambuí",
  state: "SP",
  hasPhone: true,
  hasAddress: true,
  openingHours: ["segunda-feira: 09:00–19:00"],
};

function fakeAi(data: unknown): AiClient {
  return { model: "fake", generateJson: async () => ({ data, inputTokens: 1000, outputTokens: 500 }) } as unknown as AiClient;
}

function render(content = templateContent(facts), overrides: Partial<Parameters<typeof renderSite>[0]> = {}) {
  return renderSite({
    companyId: "c1",
    name: facts.name,
    niche: "barbearia",
    city: "Campinas",
    state: "SP",
    address: "Rua Coronel Quirino, 100 - Cambuí, Campinas - SP",
    phoneE164: "+5519987654321",
    phoneIsMobile: true,
    openingHours: facts.openingHours,
    mapsUrl: "https://maps.google.com/?cid=1",
    attribution: "Dados: Google Maps",
    content,
    whatsappButton: true,
    senderName: "Vinícius",
    senderCompany: "",
    removalUrl: "https://sitehunter.test/descadastro?t=abc",
    ...overrides,
  });
}

describe("geração de conteúdo", () => {
  it("template não contém afirmações inventadas e marca o que precisa confirmar", () => {
    const c = templateContent(facts);
    expect(findInventedClaims(JSON.stringify(c))).toEqual([]);
    expect(c.toConfirm.length).toBeGreaterThan(0);
    expect(JSON.stringify(c)).toContain(facts.name);
  });

  it("conteúdos variam entre empresas e nichos (não é página idêntica)", () => {
    const a = templateContent(facts);
    const b = templateContent({ ...facts, id: "outra", name: "Clínica Sorriso", niche: "clinica-odontologica" });
    expect(a.services).not.toEqual(b.services);
    expect(render().template).toBeDefined();
  });

  it("descarta texto da IA com informação não verificada", async () => {
    const invented = { ...templateContent(facts), about: `A ${facts.name} tem 20 anos de experiência e é premiada.` };
    const r = await generateSiteContent(facts, fakeAi(invented));
    expect(r.source).toBe("template");
    expect(r.warning).toMatch(/descartado/);
    expect(r.inputTokens).toBe(1000);
  });

  it("usa texto da IA quando seguro", async () => {
    const ok = { ...templateContent(facts), about: `A ${facts.name} atende clientes no Cambuí, em Campinas, com foco em cortes e barba. Detalhes a confirmar.` };
    const r = await generateSiteContent(facts, fakeAi(ok));
    expect(r.source).toBe("ia:fake");
  });

  it("falha da IA cai para template sem quebrar", async () => {
    const broken = { model: "x", generateJson: async () => { throw new Error("timeout"); } } as unknown as AiClient;
    const r = await generateSiteContent(facts, broken);
    expect(r.source).toBe("template");
  });
});

describe("site gerado e validação", () => {
  it("site gerado passa na validação estática e contém aviso de demonstração", () => {
    const { html } = render();
    const report = validateHtml(html);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(html).toContain("não oficial");
    expect(html).toContain("noindex");
    expect(html).toContain("https://wa.me/5519987654321");
  });

  it("escapa HTML vindo de dados externos", () => {
    const { html } = render(templateContent({ ...facts, name: '<script>alert(1)</script>' }), { name: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(validateHtml(html).ok).toBe(true);
  });

  it("sem telefone celular não cria botão de WhatsApp", () => {
    const { html } = render(undefined, { phoneIsMobile: false, phoneE164: "+551934567890" });
    expect(html).not.toContain("wa.me");
    expect(html).toContain("tel:+551934567890");
  });

  it("reprova HTML quebrado, sem aviso, com âncora inexistente ou com segredo", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-segredo-de-teste-123";
    const bad = `<html><head><title>x</title></head><body><a href="#nada">x</a><a>y</a><h1>a</h1><h1>b</h1>sk-ant-segredo-de-teste-123 undefined</body></html>`;
    const r = validateHtml(bad);
    delete process.env.ANTHROPIC_API_KEY;
    expect(r.ok).toBe(false);
    const checks = r.issues.map((i) => i.check);
    for (const c of ["estrutura", "seo", "responsividade", "demonstracao", "links", "segredos", "conteudo"]) expect(checks).toContain(c);
  });

  it("teste em navegador real: sem rolagem horizontal no celular", async () => {
    const r = await browserCheck(render().html);
    if (!r.ran) {
      console.warn("Navegador indisponível, teste ignorado:", r.note);
      return;
    }
    expect(r.mobileOverflow).toBe(false);
  });
});
