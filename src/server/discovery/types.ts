export interface DiscoveryQuery {
  niche: string;
  searchTerm: string;
  city: string;
  state?: string;
  country: string;
  neighborhood?: string;
  pageToken?: string;
}

/** Registro bruto devolvido por uma fonte. Apenas dados que a fonte informou. */
export interface RawPlace {
  source: string;
  sourceId: string;
  name: string;
  category?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  website?: string;
  sourceUrl?: string;
  businessStatus?: string;
  openingHours?: string[];
  ratingCount?: number;
  attribution: string;
}

export interface DiscoveryPage {
  places: RawPlace[];
  nextPageToken?: string;
  /** Número de requisições pagas feitas para obter a página. */
  billableRequests: number;
}

export interface DiscoveryAdapter {
  id: string;
  isSimulation: boolean;
  search(query: DiscoveryQuery): Promise<DiscoveryPage>;
}

export function buildTextQuery(q: DiscoveryQuery): string {
  return [q.searchTerm, q.neighborhood ? `em ${q.neighborhood}` : null, q.city, q.state, q.country].filter(Boolean).join(", ");
}
