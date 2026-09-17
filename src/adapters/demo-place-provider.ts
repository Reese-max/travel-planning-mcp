import type { PlaceProvider, PlaceSearchRequest, PlaceSearchResult } from '../ports/place-provider.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

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

export const placeProvider = new DemoPlaceProvider();
