import { describe, expect, it } from "vitest";
import { normalizeBrPhone, normalizeName, slugify } from "@/lib/normalize";

describe("normalização", () => {
  it("normaliza telefones brasileiros e identifica celular", () => {
    expect(normalizeBrPhone("(11) 98765-4321")).toEqual({ e164: "+5511987654321", isMobile: true });
    expect(normalizeBrPhone("+55 11 3456-7890")).toEqual({ e164: "+551134567890", isMobile: false });
    expect(normalizeBrPhone("011 98765 4321")).toEqual({ e164: "+5511987654321", isMobile: true });
  });

  it("não inventa dígitos para números inválidos", () => {
    expect(normalizeBrPhone("12345")).toBeNull();
    expect(normalizeBrPhone("(11) 8765-432")).toBeNull();
    expect(normalizeBrPhone("(11) 88765-4321")).toBeNull();
    expect(normalizeBrPhone(undefined)).toBeNull();
  });

  it("normaliza nomes para deduplicação", () => {
    expect(normalizeName("Barbearia São João LTDA")).toBe("barbearia sao joao");
    expect(normalizeName("BARBEARIA  são-joão")).toBe("barbearia sao joao");
  });

  it("gera slugs seguros", () => {
    expect(slugify("Salão da Ana & Cia!")).toBe("salao-da-ana-cia");
    expect(slugify("***")).toBe("empresa");
  });
});
