import { describe, expect, it } from "vitest";
import { checkPresence, isPrivateIp, isSocialUrl } from "@/server/presence";

const allowHost = async () => {};

function fetchSeq(responses: Record<string, Response | (() => Response)>) {
  return (async (input: string | URL) => {
    const url = String(input);
    const r = responses[url];
    if (!r) throw new Error(`fetch inesperado: ${url}`);
    return typeof r === "function" ? r() : r;
  }) as unknown as typeof fetch;
}

const goodHtml = `<!doctype html><html><head><title>Barbearia do Zé</title><meta name="viewport" content="width=device-width"></head><body>${"conteúdo ".repeat(60)}</body></html>`;

describe("verificação de presença digital", () => {
  it("sem site informado → 'não identificado', sem afirmar inexistência", async () => {
    const r = await checkPresence(null);
    expect(r.status).toBe("NOT_FOUND");
    expect(r.summary).toMatch(/não garante/);
  });

  it("rede social não conta como site próprio", async () => {
    expect(isSocialUrl("https://www.instagram.com/barbearia")).toBe(true);
    const r = await checkPresence("https://instagram.com/x", { fetchImpl: fetchSeq({}), assertHost: allowHost });
    expect(r).toMatchObject({ status: "NOT_FOUND", socialOnly: true });
  });

  it("site funcional", async () => {
    const r = await checkPresence("https://ze.com.br", {
      assertHost: allowHost,
      fetchImpl: fetchSeq({ "https://ze.com.br/robots.txt": new Response("", { status: 404 }), "https://ze.com.br/": new Response(goodHtml, { status: 200 }) }),
    });
    expect(r.status).toBe("FUNCTIONAL");
  });

  it("detecta problemas básicos (sem viewport, erro HTTP)", async () => {
    const r = await checkPresence("https://ze.com.br", {
      assertHost: allowHost,
      fetchImpl: fetchSeq({ "https://ze.com.br/robots.txt": new Response("", { status: 404 }), "https://ze.com.br/": new Response("<html><title>x</title></html>", { status: 200 }) }),
    });
    expect(r.status).toBe("PROBLEMS");
    expect(r.issues.join(" ")).toMatch(/viewport/);
    const r500 = await checkPresence("https://ze.com.br", {
      assertHost: allowHost,
      fetchImpl: fetchSeq({ "https://ze.com.br/robots.txt": new Response("", { status: 404 }), "https://ze.com.br/": new Response("", { status: 503 }) }),
    });
    expect(r500.status).toBe("PROBLEMS");
  });

  it("respeita robots.txt e bloqueio de acesso → inconclusivo", async () => {
    const r = await checkPresence("https://ze.com.br", {
      assertHost: allowHost,
      fetchImpl: fetchSeq({ "https://ze.com.br/robots.txt": new Response("User-agent: *\nDisallow: /", { status: 200 }) }),
    });
    expect(r.status).toBe("INCONCLUSIVE");
  });

  it("bloqueia redirecionamento para rede interna (SSRF)", async () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    const r = await checkPresence("https://ze.com.br", {
      assertHost: async (u) => {
        if (u.hostname === "127.0.0.1") throw new Error("Endereço privado não permitido");
      },
      fetchImpl: fetchSeq({
        "https://ze.com.br/robots.txt": new Response("", { status: 404 }),
        "https://ze.com.br/": new Response("", { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
      }),
    });
    expect(r.status).not.toBe("FUNCTIONAL");
  });
});
