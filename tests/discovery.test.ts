import { describe, expect, it, vi } from "vitest";
import { GooglePlacesAdapter } from "@/server/discovery/google-places";
import { WaitingConfigError } from "@/server/errors";

const query = { niche: "barbearia", searchTerm: "barbearia", city: "Campinas", state: "SP", country: "BR" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Google Places (New) — Text Search", () => {
  it("exige chave de API", async () => {
    await expect(new GooglePlacesAdapter(undefined).search(query)).rejects.toBeInstanceOf(WaitingConfigError);
  });

  it("envia FieldMask, mapeia campos e devolve token de paginação", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        places: [
          {
            id: "ChIJ123",
            displayName: { text: "Barbearia Central" },
            formattedAddress: "Rua A, 10 - Centro, Campinas - SP",
            addressComponents: [
              { longText: "Centro", types: ["sublocality_level_1", "sublocality"] },
              { longText: "Campinas", types: ["administrative_area_level_2"] },
              { longText: "São Paulo", shortText: "SP", types: ["administrative_area_level_1"] },
              { longText: "Brasil", shortText: "BR", types: ["country"] },
            ],
            internationalPhoneNumber: "+55 19 99999-1234",
            googleMapsUri: "https://maps.google.com/?cid=1",
            primaryTypeDisplayName: { text: "Barbearia" },
            businessStatus: "OPERATIONAL",
            userRatingCount: 42,
          },
          { id: "semnome" },
        ],
        nextPageToken: "TOKEN2",
      }),
    );
    const adapter = new GooglePlacesAdapter("KEY", fetchMock as unknown as typeof fetch);
    const page = await adapter.search(query);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("KEY");
    expect(headers["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(headers["X-Goog-FieldMask"]).toContain("nextPageToken");
    expect(JSON.parse(init.body as string).textQuery).toBe("barbearia, Campinas, SP, BR");
    expect(page.places).toHaveLength(1);
    expect(page.places[0]).toMatchObject({ sourceId: "ChIJ123", name: "Barbearia Central", city: "Campinas", state: "SP", neighborhood: "Centro", phone: "+55 19 99999-1234", website: undefined });
    expect(page.nextPageToken).toBe("TOKEN2");
    expect(page.billableRequests).toBe(1);
  });

  it("repassa pageToken na página seguinte", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ places: [] }));
    await new GooglePlacesAdapter("KEY", fetchMock as unknown as typeof fetch).search({ ...query, pageToken: "TOKEN2" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).pageToken).toBe("TOKEN2");
  });

  it("chave recusada vira 'aguardando configuração'; 429 é erro temporário", async () => {
    const forbidden = new GooglePlacesAdapter("KEY", (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch);
    await expect(forbidden.search(query)).rejects.toBeInstanceOf(WaitingConfigError);
    const limited = new GooglePlacesAdapter("KEY", (async () => new Response("", { status: 429 })) as unknown as typeof fetch);
    await expect(limited.search(query)).rejects.toThrow(/429/);
  });
});
