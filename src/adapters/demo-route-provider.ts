import type { TransportMode } from '../domain/types.js';
import type { RouteProvider, RouteRequest, RouteResult } from '../ports/route-provider.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

const SPEED_KMH: Record<TransportMode, number> = {
  walking: 4.8,
  bike: 14,
  transit: 24,
  rail: 40,
  taxi: 28,
  car: 28
};

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadius = 6_371_000;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(h)));
}

export class DemoRouteProvider implements RouteProvider {
  readonly descriptor = {
    id: 'demo-haversine-estimate',
    live: false,
    description: 'Heuristic distance/time estimate for development only; not live routing.'
  } as const;

  constructor(private readonly db: TravelStore = store) {}

  calculate(request: RouteRequest): RouteResult {
    const from = this.db.getPlace(request.from_place_id);
    const to = this.db.getPlace(request.to_place_id);
    if (!from) throw new Error(`Place not found: ${request.from_place_id}`);
    if (!to) throw new Error(`Place not found: ${request.to_place_id}`);

    const straightLine = haversineMeters(from.location, to.location);
    const routeFactor = request.mode === 'walking' || request.mode === 'bike' ? 1.25 : 1.4;
    const distance = Math.max(1, Math.round(straightLine * routeFactor));
    const hours = distance / 1000 / SPEED_KMH[request.mode];

    return {
      from_place_id: request.from_place_id,
      to_place_id: request.to_place_id,
      mode: request.mode,
      distance_meters: distance,
      duration_minutes: Math.max(1, Math.round(hours * 60)),
      source: this.descriptor.id,
      calculated_at: new Date().toISOString(),
      warning: 'Estimated route only. Replace the RouteProvider with a live adapter before production use.'
    };
  }
}

export const routeProvider = new DemoRouteProvider();
