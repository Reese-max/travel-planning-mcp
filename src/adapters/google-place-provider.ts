import { createHash } from 'node:crypto';
import type { PlaceProvider, PlaceSearchRequest, PlaceSearchResult } from '../ports/place-provider.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

interface GooglePlaceText {
  text?: string;
  languageCode?: string;
}

interface GooglePlaceLocation {
  latitude?: number;
  longitude?: number;
}

interface GooglePlaceResponse {
  id?: string;
  displayName?: GooglePlaceText;
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  location?: GooglePlaceLocation;
}

interface GoogleTextSearchResponse {
  places?: GooglePlaceResponse[];
}

type FetchLike = typeof fetch;

function canonicalUuid(namespace: string, value: string): string {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  const variant = Number.parseInt(hex[16] ?? '0', 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const compact = hex.join('');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export class GooglePlaceProvider implements PlaceProvider {
  readonly descriptor = {
    id: 'google-places-new',
    live: true,
    description: 'Live Google Places API (New) Text Search with normalized canonical Place objects.'
  } as const;

  constructor(
    private readonly apiKey: string,
    private readonly db: TravelStore = store,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is required for GooglePlaceProvider.');
  }

  get(placeId: string) {
    return this.db.getPlace(placeId);
  }

  async search(request: PlaceSearchRequest): Promise<PlaceSearchResult> {
    const response = await this.fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
        'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types'
      },
      body: JSON.stringify({
        textQuery: request.query,
        maxResultCount: Math.max(1, Math.min(request.limit, 20))
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Places request failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = (await response.json()) as GoogleTextSearchResponse;
    const retrievedAt = new Date().toISOString();
    const places = (payload.places ?? [])
      .filter((place) => place.id && place.displayName?.text && place.location?.latitude !== undefined && place.location?.longitude !== undefined)
      .slice(0, request.limit)
      .map((place) => {
        const googleId = place.id!;
        const canonicalId = canonicalUuid('google-place', googleId);
        const categories = [place.primaryType, ...(place.types ?? [])]
          .filter((value): value is string => Boolean(value))
          .filter((value, index, array) => array.indexOf(value) === index);

        const normalized = {
          place_id: canonicalId,
          name: place.displayName!.text!,
          localized_names: place.displayName?.languageCode
            ? { [place.displayName.languageCode]: place.displayName.text! }
            : undefined,
          categories: categories.length > 0 ? categories : ['place'],
          location: {
            lat: place.location!.latitude!,
            lng: place.location!.longitude!,
            address: place.formattedAddress ?? null
          },
          external_ids: {
            google_place_id: googleId
          },
          source: {
            provider: this.descriptor.id,
            source_id: googleId,
            retrieved_at: retrievedAt
          }
        };

        this.db.savePlace(normalized);
        return normalized;
      });

    return { provider: this.descriptor, places };
  }
}
