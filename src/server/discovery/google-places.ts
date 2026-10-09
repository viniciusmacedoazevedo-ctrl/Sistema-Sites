import { PermanentError, WaitingConfigError } from "../errors";
import { buildTextQuery, type DiscoveryAdapter, type DiscoveryPage, type DiscoveryQuery, type RawPlace } from "./types";

/**
 * Google Places API (New) — Text Search.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 * Apenas os campos necessários são solicitados (FieldMask) para reduzir custo.
 * Atribuição exigida pelos termos: os dados são exibidos com "Dados: Google Maps".
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  userRatingCount?: number;
}

export function mapGooglePlace(p: GooglePlace): RawPlace | null {
  const name = p.displayName?.text?.trim();
  if (!p.id || !name) return null;
  const comp = (type: string, short = false) => {
    const c = p.addressComponents?.find((a) => a.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? undefined;
  };
  return {
    source: "google_places",
    sourceId: p.id,
    name,
    category: p.primaryTypeDisplayName?.text,
    address: p.formattedAddress,
    neighborhood: comp("sublocality_level_1") ?? comp("sublocality"),
    city: comp("administrative_area_level_2") ?? comp("locality"),
    state: comp("administrative_area_level_1", true),
    country: comp("country", true),
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber,
    website: p.websiteUri,
    sourceUrl: p.googleMapsUri,
    businessStatus: p.businessStatus,
    openingHours: p.regularOpeningHours?.weekdayDescriptions,
    ratingCount: p.userRatingCount,
    attribution: "Dados: Google Maps",
  };
}

export class GooglePlacesAdapter implements DiscoveryAdapter {
  id = "google_places";
  isSimulation = false;

  constructor(
    private apiKey: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: DiscoveryQuery): Promise<DiscoveryPage> {
    if (!this.apiKey) {
      throw new WaitingConfigError("GOOGLE_PLACES_API_KEY não configurada. Defina a variável de ambiente no servidor e no worker.");
    }
    const body: Record<string, unknown> = {
      textQuery: buildTextQuery(query),
      languageCode: "pt-BR",
      regionCode: query.country.length === 2 ? query.country : "BR",
      pageSize: 20,
    };
    if (query.pageToken) body.pageToken = query.pageToken;

    const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 429) throw new Error("Google Places: limite de requisições atingido (429). Nova tentativa com espera.");
    if (res.status === 401 || res.status === 403) {
      const text = await res.text();
      throw new WaitingConfigError(`Google Places recusou a chave (${res.status}). Verifique se a "Places API (New)" está ativada e a cobrança configurada. ${text.slice(0, 300)}`);
    }
    if (res.status === 400) throw new PermanentError(`Google Places: requisição inválida. ${(await res.text()).slice(0, 300)}`);
    if (!res.ok) throw new Error(`Google Places: erro HTTP ${res.status}`);

    const json = (await res.json()) as { places?: GooglePlace[]; nextPageToken?: string };
    const places = (json.places ?? []).map(mapGooglePlace).filter((p): p is RawPlace => p !== null);
    return { places, nextPageToken: json.nextPageToken, billableRequests: 1 };
  }
}
