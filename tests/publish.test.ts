import { describe, expect, it, vi } from "vitest";
import { WaitingConfigError } from "@/server/errors";
import { InternalPublisher } from "@/server/publish/internal";
import { VercelPublisher } from "@/server/publish/vercel";

describe("publicação", () => {
  it("interna exige PUBLIC_BASE_URL e gera link estável", async () => {
    await expect(new InternalPublisher(undefined).publish({ slug: "abc", html: "" })).rejects.toBeInstanceOf(WaitingConfigError);
    const r = await new InternalPublisher("https://meu.app").publish({ slug: "barbearia-x-1a2b3c", html: "" });
    expect(r.publicUrl).toBe("https://meu.app/d/barbearia-x-1a2b3c");
  });

  it("Vercel: cria deploy, aguarda READY e usa o alias estável do projeto", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/v13/deployments?") || url.endsWith("/v13/deployments")) {
        const body = JSON.parse(init!.body as string);
        expect(body.name).toBe("sh-barbearia-x");
        expect(body.files[0].file).toBe("index.html");
        return new Response(JSON.stringify({ id: "dpl_1", url: "sh-barbearia-x-abc.vercel.app", readyState: "BUILDING" }), { status: 200 });
      }
      return new Response(JSON.stringify({ readyState: "READY", alias: ["sh-barbearia-x.vercel.app"] }), { status: 200 });
    });
    const p = new VercelPublisher("TOKEN", "team_1", fetchMock as unknown as typeof fetch, 1);
    const r = await p.publish({ slug: "barbearia-x", html: "<html></html>" });
    expect(r.publicUrl).toBe("https://sh-barbearia-x.vercel.app");
    expect(calls[0]).toContain("teamId=team_1");
    await p.unpublish({ slug: "barbearia-x", providerRef: r.providerRef });
    expect(calls.at(-1)).toMatch(/^DELETE .*\/v9\/projects\/sh-barbearia-x/);
  });

  it("Vercel sem token → aguardando configuração; deploy com erro não é declarado publicado", async () => {
    await expect(new VercelPublisher(undefined, undefined).publish({ slug: "x", html: "" })).rejects.toBeInstanceOf(WaitingConfigError);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("dpl_2") ? new Response(JSON.stringify({ readyState: "ERROR" })) : new Response(JSON.stringify({ id: "dpl_2", url: "x.vercel.app", readyState: "QUEUED" })),
    );
    await expect(new VercelPublisher("T", undefined, fetchMock as unknown as typeof fetch, 1).publish({ slug: "x", html: "" })).rejects.toThrow(/ERROR/);
  });
});
