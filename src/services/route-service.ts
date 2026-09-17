import { routeProvider } from '../adapters/demo-route-provider.js';
import type { TransportMode } from '../domain/types.js';
import type { ProviderDescriptor } from '../ports/place-provider.js';
import type { RouteProvider, RouteResult } from '../ports/route-provider.js';

export class RouteService {
  constructor(private readonly provider: RouteProvider = routeProvider) {}

  get descriptor(): ProviderDescriptor {
    return this.provider.descriptor;
  }

  async estimate(fromPlaceId: string, toPlaceId: string, mode: TransportMode): Promise<RouteResult> {
    return await this.provider.calculate({
      from_place_id: fromPlaceId,
      to_place_id: toPlaceId,
      mode
    });
  }
}

export const routeService = new RouteService();
