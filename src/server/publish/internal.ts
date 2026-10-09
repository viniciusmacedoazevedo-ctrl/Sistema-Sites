import { WaitingConfigError } from "../errors";
import type { Publisher, PublishInput, PublishResult } from "./types";

/**
 * Publicação interna: a demonstração é servida pelo próprio servidor em /d/<slug>,
 * lendo o HTML do banco. O link é estável e o status "publicado" controla o acesso
 * (despublicar → a rota passa a responder 410).
 */
export class InternalPublisher implements Publisher {
  id = "internal";
  constructor(
    private baseUrl: string | undefined,
    private fetchImpl: typeof fetch = fetch,
    private verify = true,
  ) {}

  async publish({ slug }: PublishInput): Promise<PublishResult> {
    if (!this.baseUrl) throw new WaitingConfigError("PUBLIC_BASE_URL não configurada: defina a URL pública do servidor para publicar demonstrações.");
    return { publicUrl: `${this.baseUrl}/d/${slug}`, providerRef: `internal:${slug}` };
  }

  /** Confirma que o link responde após a publicação (não declara publicado sem verificar). */
  async verifyLive(url: string): Promise<{ ok: boolean; detail: string }> {
    if (!this.verify) return { ok: true, detail: "verificação desativada" };
    try {
      const res = await this.fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(15_000), redirect: "follow" });
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async unpublish(): Promise<void> {
    // Nada externo a remover: a rota /d/<slug> consulta o status no banco.
  }
}
