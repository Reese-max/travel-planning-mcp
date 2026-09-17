import type {
  ApprovalReceipt,
  AuditEvent,
  ChangeProposal,
  Constraint,
  Place,
  Reservation,
  Trip
} from '../domain/types.js';
import { seedConstraints, seedPlaces, seedProposals, seedReservations, seedTrip } from '../data/seed.js';
import type { IdempotencyRecord, TravelStore } from '../ports/travel-store.js';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function idempotencyMapKey(scope: string, key: string): string {
  return `${scope}\u0000${key}`;
}

export class MemoryStore implements TravelStore {
  private readonly trips = new Map<string, Trip>();
  private readonly tripVersions = new Map<string, Map<number, Trip>>();
  private readonly places = new Map<string, Place>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly constraints = new Map<string, Constraint>();
  private readonly proposals = new Map<string, ChangeProposal>();
  private readonly auditEvents: AuditEvent[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  constructor() {
    for (const place of seedPlaces) this.places.set(place.place_id, copy(place));
    for (const reservation of seedReservations) this.reservations.set(reservation.reservation_id, copy(reservation));
    for (const constraint of seedConstraints) this.constraints.set(constraint.constraint_id, copy(constraint));
    for (const proposal of seedProposals) this.proposals.set(proposal.proposal_id, copy(proposal));
    this.saveTrip(seedTrip, false);
  }

  listTrips(): Trip[] {
    return [...this.trips.values()]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(copy);
  }

  getTrip(tripId: string, version?: number): Trip | undefined {
    if (version !== undefined) {
      const historic = this.tripVersions.get(tripId)?.get(version);
      return historic ? copy(historic) : undefined;
    }
    const trip = this.trips.get(tripId);
    return trip ? copy(trip) : undefined;
  }

  saveTrip(trip: Trip, replaceCurrent = true): void {
    this.assertTripInvariants(trip);
    const snapshot = copy(trip);
    let versions = this.tripVersions.get(trip.trip_id);
    if (!versions) {
      versions = new Map<number, Trip>();
      this.tripVersions.set(trip.trip_id, versions);
    }
    versions.set(trip.version, snapshot);
    if (replaceCurrent || !this.trips.has(trip.trip_id)) {
      this.trips.set(trip.trip_id, snapshot);
    }
  }

  listTripVersions(tripId: string): number[] {
    return [...(this.tripVersions.get(tripId)?.keys() ?? [])].sort((a, b) => a - b);
  }

  getPlace(placeId: string): Place | undefined {
    const value = this.places.get(placeId);
    return value ? copy(value) : undefined;
  }

  savePlace(place: Place): void {
    this.places.set(place.place_id, copy(place));
  }

  searchPlaces(query: string, limit = 10): Place[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return [...this.places.values()]
      .filter((place) => {
        const names = [place.name, ...Object.values(place.localized_names ?? {})];
        return (
          names.some((name) => name.toLocaleLowerCase().includes(normalized)) ||
          place.categories.some((category) => category.toLocaleLowerCase().includes(normalized))
        );
      })
      .slice(0, Math.max(1, Math.min(limit, 25)))
      .map(copy);
  }

  getReservation(reservationId: string): Reservation | undefined {
    const value = this.reservations.get(reservationId);
    return value ? copy(value) : undefined;
  }

  getConstraintsForTrip(trip: Trip): Constraint[] {
    return (trip.constraint_ids ?? [])
      .map((id) => this.constraints.get(id))
      .filter((value): value is Constraint => value !== undefined)
      .map(copy);
  }

  getProposal(proposalId: string): ChangeProposal | undefined {
    const value = this.proposals.get(proposalId);
    return value ? copy(value) : undefined;
  }

  saveProposal(proposal: ChangeProposal): void {
    this.proposals.set(proposal.proposal_id, copy(proposal));
  }

  setProposalStatus(
    proposalId: string,
    status: ChangeProposal['status'],
    extra: Partial<
      Pick<
        ChangeProposal,
        | 'approval'
        | 'approved_at'
        | 'rejected_at'
        | 'rejection_reason'
        | 'applied_at'
        | 'applied_trip_version'
      >
    > = {}
  ): ChangeProposal | undefined {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return undefined;
    const updated: ChangeProposal = { ...proposal, status, ...extra };
    this.proposals.set(proposalId, copy(updated));
    return copy(updated);
  }

  approveProposal(proposalId: string, receipt: ApprovalReceipt): ChangeProposal | undefined {
    return this.setProposalStatus(proposalId, 'approved', {
      approval: receipt,
      approved_at: receipt.approved_at
    });
  }

  appendAudit(event: AuditEvent): void {
    this.auditEvents.push(copy(event));
  }

  listAuditForTrip(tripId: string): AuditEvent[] {
    return this.auditEvents
      .filter((event) => event.trip_id === tripId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(copy);
  }

  getIdempotency(scope: string, key: string): IdempotencyRecord | undefined {
    const value = this.idempotency.get(idempotencyMapKey(scope, key));
    return value ? copy(value) : undefined;
  }

  saveIdempotency(record: IdempotencyRecord): void {
    this.idempotency.set(idempotencyMapKey(record.scope, record.key), copy(record));
  }

  private assertTripInvariants(trip: Trip): void {
    for (const day of trip.days) {
      for (const item of day.items) {
        if (!item.reservation_id) continue;
        const reservation = this.reservations.get(item.reservation_id);
        if (!reservation) {
          throw new Error(
            `Trip item ${item.item_id} references unknown reservation ${item.reservation_id}.`
          );
        }

        if (!reservation.fixed) continue;
        if (!item.locked) {
          throw new Error(
            `Trip item ${item.item_id} references fixed reservation ${reservation.reservation_id} but is not locked.`
          );
        }
        if (item.start_at !== reservation.start_at) {
          throw new Error(
            `Trip item ${item.item_id} cannot change start time of fixed reservation ${reservation.reservation_id}.`
          );
        }
        if ((item.end_at ?? null) !== (reservation.end_at ?? null)) {
          throw new Error(
            `Trip item ${item.item_id} cannot change end time of fixed reservation ${reservation.reservation_id}.`
          );
        }
      }
    }
  }
}

export const store = new MemoryStore();
