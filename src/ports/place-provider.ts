import type { Place } from '../domain/types.js';

export interface PlaceSearchRequest {
  query: string;
  limit: number;
}

export interface ProviderDescriptor {
  id: string;
  live: boolean;
  description: string;
}

export interface PlaceSearchResult {
  provider: ProviderDescriptor;
  places: Place[];
}

export interface PlaceProvider {
  readonly descriptor: ProviderDescriptor;
  get(placeId: string): Place | undefined | Promise<Place | undefined>;
  search(request: PlaceSearchRequest): PlaceSearchResult | Promise<PlaceSearchResult>;
}
