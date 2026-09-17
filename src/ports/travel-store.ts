import type {
  ApprovalReceipt,
  AuditEvent,
  ChangeProposal,
  Constraint,
  Place,
  Reservation,
  Trip
} from '../domain/types.js';

export interface IdempotencyRecord {
  scope: string;
  key: string;
  fingerprint: string;
  status: number;
  body: unknown;
  created_at: string;
}

/**
 * Persistence boundary used by domain/services.
 *
 * The current MemoryStore implements this interface. Durable implementations
 * (PostgreSQL, SQLite, etc.) should preserve the same versioning and approval
 * semantics rather than leaking database concerns into planner code.
 */
export interface TravelStore {
  listTrips(): Trip[];
  getTrip(tripId: string, version?: number): Trip | undefined;
  saveTrip(trip: Trip, replaceCurrent?: boolean): void;
  listTripVersions(tripId: string): number[];

  getPlace(placeId: string): Place | undefined;
  searchPlaces(query: string, limit?: number): Place[];

  getReservation(reservationId: string): Reservation | undefined;
  getConstraintsForTrip(trip: Trip): Constraint[];

  getProposal(proposalId: string): ChangeProposal | undefined;
  saveProposal(proposal: ChangeProposal): void;
  setProposalStatus(
    proposalId: string,
    status: ChangeProposal['status'],
    extra?: Partial<
      Pick<
        ChangeProposal,
        | 'approval'
        | 'approved_at'
        | 'rejected_at'
        | 'rejection_reason'
        | 'applied_at'
        | 'applied_trip_version'
      >
    >
  ): ChangeProposal | undefined;
  approveProposal(proposalId: string, receipt: ApprovalReceipt): ChangeProposal | undefined;

  appendAudit(event: AuditEvent): void;
  listAuditForTrip(tripId: string): AuditEvent[];

  getIdempotency(scope: string, key: string): IdempotencyRecord | undefined;
  saveIdempotency(record: IdempotencyRecord): void;
}
