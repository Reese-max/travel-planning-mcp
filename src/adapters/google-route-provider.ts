import type { TransportMode } from '../domain/types.js';
import type { RouteProvider, RouteRequest, RouteResult } from '../ports/route-provider.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

type FetchLike = typeof fetch;

interface GoogleRouteResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
}

const GOOGLE_MODE: Record<TransportMode, 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT'> = {
  walking: 'WALK',
  transit: 'TRANSIT',
  rail: 'TRANSIT',
  taxi: 'DRIVE',
  car: 'DRIVE',
  bike: 'BICYCLE'
};

function durationToMinutes(value: string | undefined): number {
  if (!value) throw new Error('Google Routes response did not include duration.');
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  if (!match?.[1]) throw new Error(`Unsupported Google Routes duration: ${value}`);
  return Math.max(1, Math.round(Number(match[1]) / 60));
}

export class GoogleRouteProvider implements RouteProvider {
  readonly descriptor = {
    id: 'google-routes-v2',
    live: true,
    description: 'Live Google Routes API v2 computeRoutes adapter using normalized canonical place coordinates.'
  } as const;

  constructor(
    private readonly apiKey: string,
    private readonly db: TravelStore = store,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is required for GoogleRouteProvider.');
  }

  async calculate(request: RouteRequest): Promise<RouteResult> {
    const from = this.db.getPlace(request.from_place_id);
    const to = this.db.getPlace(request.to_place_id);
    if (!from) throw new Error(`Place not found: ${request.from_place_id}`);
    if (!to) throw new Error(`Place not found: ${request.to_place_id}`);

    const body: Record<string, unknown> = {
      origin: {
        location: {
          latLng: {
            latitude: from.location.lat,
            longitude: from.location.lng
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: to.location.lat,
            longitude: to.location.lng
          }
        }
      },
      travelMode: GOOGLE_MODE[request.mode],
      computeAlternativeRoutes: false,
      units: 'METRIC'
    };

    if (request.mode === 'car' || request.mode === 'taxi') {
      body.routingPreference = 'TRAFFIC_AWARE';
    }

    const response = await this.fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
        'x-goog-fieldmask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Routes request failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = (await response.json()) as GoogleRouteResponse;
    const route = payload.routes?.[0];
    if (!route?.distanceMeters) throw new Error('Google Routes returned no usable route.');

    return {
      from_place_id: request.from_place_id,
      to_place_id: request.to_place_id,
      mode: request.mode,
      distance_meters: route.distanceMeters,
      duration_minutes: durationToMinutes(route.duration),
      source: this.descriptor.id,
      calculated_at: new Date().toISOString(),
      ...(request.mode === 'rail'
        ? { warning: 'Rail mode currently maps to Google TRANSIT and may include non-rail transit segments.' }
        : {})
    };
  }
}
