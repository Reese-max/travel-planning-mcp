import type { PlaceProvider, PlaceSearchRequest, PlaceSearchResult } from '../ports/place-provider.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';
import { GooglePlaceProvider } from './google-place-provider.js';

export class DemoPlaceProvider implements PlaceProvider {
  readonly descriptor = {
    id: 'demo-local',
    live: false,
    description: 'Local seeded place data for development and tests only.'
  } as const;

  constructor(private readonly db: TravelStore = store) {}

  get(placeId: string) {
    return this.db.getPlace(placeId);
  }

  search(request: PlaceSearchRequest): PlaceSearchResult {
    return {
      provider: this.descriptor,
      places: this.db.searchPlaces(request.query, request.limit)
    };
  }
}

function configuredPlaceProvider(): PlaceProvider {
  const provider = (process.env.PLACE_PROVIDER ?? 'demo').toLowerCase();
  if (provider === 'demo') return new DemoPlaceProvider();
  if (provider === 'google') {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error('PLACE_PROVIDER=google requires GOOGLE_MAPS_API_KEY.');
    return new GooglePlaceProvider(apiKey);
  }
  throw new Error(`Unsupported PLACE_PROVIDER: ${provider}`);
}

export const placeProvider = configuredPlaceProvider();
