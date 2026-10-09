import { PermanentError, WaitingConfigError } from "../errors";
import type { Publisher, PublishInput, PublishResult } from "./types";

/**
 * Publicação na Vercel via REST API (deploy de arquivos estáticos).
 * Um projeto por empresa ("sh-<slug>") → domínio de produção estável <projeto>.vercel.app.
 * Docs: https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment
 */
export class VercelPublisher implements Publisher {
  id = "vercel";
  constructor(
    private token: string | undefined,
    private teamId: string | undefined,
    private fetchImpl: typeof fetch = fetch,
    private pollIntervalMs = 3000,
  ) {}

  private url(path: string) {
    const u = new URL(`https://api.vercel.com${path}`);
    if (this.teamId) u.searchParams.set("teamId", this.teamId);
    return u.toString();
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  static projectName(slug: string) {
    return `sh-${slug}`.slice(0, 95);
  }

  async publish({ slug, html }: PublishInput): Promise<PublishResult> {
    if (!this.token) throw new WaitingConfigError("VERCEL_TOKEN não configurado. Crie um token em vercel.com/account/tokens ou use a publicação interna.");
    const name = VercelPublisher.projectName(slug);
    const res = await this.fetchImpl(this.url("/v13/deployments"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        name,
        target: "production",
        files: [
          { file: "index.html", data: html },
          { file: "robots.txt", data: "User-agent: *\nDisallow: /\n" },
        ],
        projectSettings: { framework: null },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 401 || res.status === 403) throw new WaitingConfigError(`Vercel recusou o token (${res.status}).`);
    if (res.status === 429) throw new Error("Vercel: limite de requisições (429).");
    if (res.status >= 400 && res.status < 500) throw new PermanentError(`Vercel: erro ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (!res.ok) throw new Error(`Vercel: erro HTTP ${res.status}`);
    const dep = (await res.json()) as { id: string; url: string; readyState?: string };

    // Aguarda o deploy ficar pronto (estático costuma levar poucos segundos).
    let state = dep.readyState;
    let aliases: string[] = [];
    for (let i = 0; i < 40 && state !== "READY"; i++) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      const s = await this.fetchImpl(this.url(`/v13/deployments/${dep.id}`), { headers: this.headers(), signal: AbortSignal.timeout(20_000) });
      if (!s.ok) continue;
      const body = (await s.json()) as { readyState?: string; alias?: string[] };
      state = body.readyState;
      aliases = body.alias ?? [];
      if (state === "ERROR" || state === "CANCELED") throw new Error(`Vercel: deploy terminou com estado ${state}`);
    }
    if (state !== "READY") throw new Error("Vercel: deploy não ficou pronto a tempo.");
    const stable = aliases.find((a) => a.startsWith(`${name}.`)) ?? aliases[0] ?? dep.url;
    return { publicUrl: `https://${stable}`, providerRef: `vercel:${name}` };
  }

  async unpublish({ slug, providerRef }: { slug: string; providerRef: string | null }): Promise<void> {
    if (!this.token) throw new WaitingConfigError("VERCEL_TOKEN não configurado; não é possível remover o projeto na Vercel.");
    const name = providerRef?.replace(/^vercel:/, "") || VercelPublisher.projectName(slug);
    const res = await this.fetchImpl(this.url(`/v9/projects/${encodeURIComponent(name)}`), { method: "DELETE", headers: this.headers(), signal: AbortSignal.timeout(30_000) });
    if (!res.ok && res.status !== 404) throw new Error(`Vercel: falha ao remover projeto (${res.status}).`);
  }
}
