import type { RouteSnapshot, TransportMode } from '../domain/types.js';
import { store, type MemoryStore } from '../store/memory-store.js';

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

export interface RouteEstimate extends RouteSnapshot {
  from_place_id: string;
  to_place_id: string;
  warning: string;
}

export class RouteService {
  constructor(private readonly db: MemoryStore = store) {}

  estimate(fromPlaceId: string, toPlaceId: string, mode: TransportMode): RouteEstimate {
    const from = this.db.getPlace(fromPlaceId);
    const to = this.db.getPlace(toPlaceId);
    if (!from) throw new Error(`Place not found: ${fromPlaceId}`);
    if (!to) throw new Error(`Place not found: ${toPlaceId}`);

    const straightLine = haversineMeters(from.location, to.location);
    const routeFactor = mode === 'walking' || mode === 'bike' ? 1.25 : 1.4;
    const distance = Math.max(1, Math.round(straightLine * routeFactor));
    const hours = distance / 1000 / SPEED_KMH[mode];

    return {
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
      mode,
      distance_meters: distance,
      duration_minutes: Math.max(1, Math.round(hours * 60)),
      source: 'demo-haversine-estimate',
      calculated_at: new Date().toISOString(),
      warning: 'Estimated route only. Replace this adapter with Google Routes, TDX, OSM routing, or another live provider before production use.'
    };
  }
}

export const routeService = new RouteService();
