import type { Constraint, Place, Reservation, Trip } from '../domain/types.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

export interface TripContext {
  trip: Trip;
  places: Place[];
  reservations: Reservation[];
  constraints: Constraint[];
  versions: number[];
}

export class TripContextService {
  constructor(private readonly db: TravelStore = store) {}

  get(tripId: string, version?: number): TripContext {
    const trip = this.db.getTrip(tripId, version);
    if (!trip) throw new Error(`Trip not found: ${tripId}${version ? ` v${version}` : ''}`);

    const places = (trip.place_ids ?? [])
      .map((id) => this.db.getPlace(id))
      .filter((value): value is Place => value !== undefined);

    const reservations = (trip.reservation_ids ?? [])
      .map((id) => this.db.getReservation(id))
      .filter((value): value is Reservation => value !== undefined);

    return {
      trip,
      places,
      reservations,
      constraints: this.db.getConstraintsForTrip(trip),
      versions: this.db.listTripVersions(tripId)
    };
  }
}

export const tripContextService = new TripContextService();
