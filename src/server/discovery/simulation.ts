import { shortHash } from "@/lib/normalize";
import type { DiscoveryAdapter, DiscoveryPage, DiscoveryQuery, RawPlace } from "./types";

/**
 * Fonte FICTÍCIA usada apenas no modo simulação. Todos os registros são marcados como
 * "[SIMULAÇÃO]" e usam telefones/sites inexistentes; nunca são contatados.
 */
export class SimulationDiscoveryAdapter implements DiscoveryAdapter {
  id = "simulacao";
  isSimulation = true;

  async search(query: DiscoveryQuery): Promise<DiscoveryPage> {
    const page = query.pageToken ? Number(query.pageToken) : 0;
    const perPage = 8;
    const totalPages = 2;
    const places: RawPlace[] = Array.from({ length: perPage }, (_, i) => {
      const n = page * perPage + i + 1;
      const seed = `${query.niche}|${query.city}|${n}`;
      const variant = n % 4; // 0: sem site, 1: site ok, 2: site com problema, 3: só rede social
      return {
        source: "simulacao",
        sourceId: `sim-${shortHash(seed, 12)}`,
        name: `[SIMULAÇÃO] ${query.searchTerm.replace(/^\w/, (c) => c.toUpperCase())} Exemplo ${n}`,
        category: query.searchTerm,
        address: `Rua Fictícia, ${100 + n} — ${query.neighborhood ?? "Centro"}, ${query.city}`,
        neighborhood: query.neighborhood ?? "Centro",
        city: query.city,
        state: query.state,
        country: query.country,
        // Faixa 0000 não é atribuída a assinantes; ainda assim, simulação nunca envia mensagens.
        phone: n % 5 === 0 ? undefined : `+55 11 9${String(n).padStart(4, "0")}-0000`,
        website:
          variant === 1 ? `https://exemplo-simulacao-${n}.invalid` : variant === 2 ? `http://site-quebrado-${n}.invalid` : variant === 3 ? `https://instagram.com/simulacao${n}` : undefined,
        sourceUrl: undefined,
        businessStatus: "OPERATIONAL",
        openingHours: n % 2 === 0 ? ["segunda-feira: 08:00–18:00", "sábado: 08:00–12:00"] : undefined,
        ratingCount: n * 3,
        attribution: "Dados fictícios (modo simulação)",
      };
    });
    return { places, nextPageToken: page + 1 < totalPages ? String(page + 1) : undefined, billableRequests: 0 };
  }
}
