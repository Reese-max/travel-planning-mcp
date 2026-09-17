import type { TransportMode } from '../domain/types.js';
import type { ProviderDescriptor } from './place-provider.js';

export interface RouteRequest {
  from_place_id: string;
  to_place_id: string;
  mode: TransportMode;
}

export interface RouteResult {
  from_place_id: string;
  to_place_id: string;
  mode: TransportMode;
  distance_meters: number;
  duration_minutes: number;
  source: string;
  calculated_at: string;
  warning?: string;
}

export interface RouteProvider {
  readonly descriptor: ProviderDescriptor;
  calculate(request: RouteRequest): RouteResult | Promise<RouteResult>;
}
