import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import type { Constraint, Reservation, TripItem } from '../src/domain/types.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

const ITEM_ID = '88888888-8888-4888-8888-888888888888';
const PLACE_ID = '33333333-3333-4333-8333-333333333333';
const evidenceCases: Array<[Constraint['type'], Record<string, unknown>]> = [
  ['return_by', { time: '20:00' }],
  ['start_after', { time: '08:00' }],
  ['time_window', { start: '08:00', end: '20:00' }],
  ['max_daily_budget', { amount: 0, currency: 'JPY' }],
  ['max_walking_distance', { kilometers: 0 }],
  ['transport_mode', { allowed: ['walking', 'transit', 'rail', 'taxi', 'car', 'bike'] }]
];

class EvidenceStore extends MemoryStore {
  reservationEvidence?: Reservation;
  constructor(public constraint: Constraint) { super(); }
  override getConstraintsForTrip(): Constraint[] { return [structuredClone(this.constraint)]; }
  override getReservation(id: string): Reservation | undefined {
    return this.reservationEvidence?.reservation_id === id
      ? structuredClone(this.reservationEvidence) : super.getReservation(id);
  }
}

function fixture(type: Constraint['type'], parameters: Record<string, unknown>, strength: Constraint['strength'] = 'hard') {
  const db = new EvidenceStore({ constraint_id: 'evidence-check', type, parameters, strength,
    enabled: true, scope: { trip: true }, created_by: 'user' });
  const trip = db.getTrip(demoTripId)!;
  const item = trip.days[0]!.items.find((candidate) => candidate.item_id === ITEM_ID)!;
  item.route = { mode: 'walking', distance_meters: 0, duration_minutes: 0, source: 'synthetic-test' };
  trip.days = [{ date: '2026-10-20', items: [item] }];
  trip.reservation_ids = [];
  db.saveTrip(trip);
  const place = db.getPlace(PLACE_ID)!;
  db.savePlace({ ...place, planning: { ...place.planning, estimated_cost: { amount: 0, currency: 'JPY' } } });
  const service = new ProposalService(db);
  const create = () => service.create({ tripId: demoTripId, operations: [{ operation: 'update',
    target_type: 'trip_item', target_id: ITEM_ID, to: { notes: 'Synthetic reviewed update' } }] });
  return { db, service, create };
}

function removeEvidence(db: EvidenceStore, type: Constraint['type']) {
  const trip = db.getTrip(demoTripId)!;
  const item = trip.days[0]!.items[0]!;
  if (['return_by', 'start_after', 'time_window'].includes(type)) {
    item.start_at = null;
    item.end_at = null;
    // Exactly the import-like shape: a wall clock without a timezone is not an absolute instant.
    Object.assign(item, { source_timing: { provider: 'trip', source_id: '30',
      local_date: '2026-10-20', local_time: '09:00', timezone: null } });
  } else if (type === 'max_daily_budget') {
    const place = db.getPlace(PLACE_ID)!;
    db.savePlace({ ...place, planning: { ...place.planning, estimated_cost: null } });
  } else item.route = null;
  db.saveTrip(trip);
}

describe('constraint evidence safety', () => {
  it.each(evidenceCases)('blocks hard %s with unknown itinerary evidence and writes no trip version', (type, parameters) => {
    const { db, service, create } = fixture(type, parameters);
    removeEvidence(db, type);
    const before = db.getTrip(demoTripId);
    const proposal = create();
    const result = service.validate(proposal.proposal_id);
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow();
    expect(() => service.apply(proposal.proposal_id)).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
  });

  it.each(evidenceCases)('warns for soft %s with unknown evidence', (type, parameters) => {
    const { db, service, create } = fixture(type, parameters, 'soft');
    removeEvidence(db, type);
    const result = service.validate(create().proposal_id);
    expect(result.validation?.valid).toBe(true);
    expect(result.validation?.soft_constraint_warnings.join(' ')).toContain('cannot be evaluated safely');
  });

  it.each(evidenceCases)('accepts known evidence for %s, including explicit zero cost/distance', (type, parameters) => {
    const { service, create } = fixture(type, parameters);
    const proposal = create();
    expect(service.validate(proposal.proposal_id).validation?.valid).toBe(true);
    service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' });
    expect(service.apply(proposal.proposal_id).trip.version).toBe(2);
  });

  it.each([
    '2026-10-20T16:00:00', 'not-a-date', '2026-10-20T99:99:00+09:00', '2026-02-30T16:00:00+09:00'
  ])('rejects unusable temporal evidence %s instead of guessing a timezone', (value) => {
    const { db, service, create } = fixture('time_window', { start: '08:00', end: '20:00' });
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.start_at = value;
    trip.days[0]!.items[0]!.end_at = value;
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.hard_constraint_violations.join(' '))
      .toContain('cannot be evaluated safely');
  });

  it.each(['return_by', 'time_window'] as const)('requires an actual end time for %s', (type) => {
    const parameters = type === 'return_by' ? { time: '20:00' } : { start: '08:00', end: '20:00' };
    const { db, service, create } = fixture(type, parameters);
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.end_at = null;
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });

  it.each(['2026-10-20T20:00:00.001+09:00', '2026-10-21T00:00:00+09:00'])('does not truncate a deadline violation at %s', (end) => {
    const { db, service, create } = fixture('return_by', { time: '20:00' });
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.end_at = end;
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });

  it('accepts an exact deadline with a zero fractional component', () => {
    const { db, service, create } = fixture('return_by', { time: '20:00' });
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.end_at = '2026-10-20T20:00:00.000+09:00';
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
  });

  it.each(evidenceCases)('rechecks newly scoped unknown evidence at approval and apply for %s', (type, parameters) => {
    const { db, service, create } = fixture(type, parameters);
    const trip = db.getTrip(demoTripId)!;
    const unknownPlace = { ...db.getPlace(PLACE_ID)!, place_id: 'synthetic-unpriced', planning: {} };
    db.savePlace(unknownPlace);
    const unknown: TripItem = { ...trip.days[0]!.items[0]!, item_id: 'synthetic-unknown',
      place_id: unknownPlace.place_id, start_at: null, end_at: null, route: null };
    trip.days[0]!.items.push(unknown);
    db.saveTrip(trip);
    const before = db.getTrip(demoTripId);
    db.constraint.scope.item_ids = [ITEM_ID];
    const proposal = create();
    expect(service.validate(proposal.proposal_id).validation?.valid).toBe(true);
    db.constraint.scope.item_ids = [ITEM_ID, unknown.item_id];
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' }))
      .toThrow(/no longer valid/);
    db.constraint.scope.item_ids = [ITEM_ID];
    service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' });
    db.constraint.scope.item_ids = [ITEM_ID, unknown.item_id];
    expect(() => service.apply(proposal.proposal_id)).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
    expect(db.getProposal(proposal.proposal_id)?.status).toBe('approved');
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('rejects invalid price evidence %s', (amount) => {
    const { db, service, create } = fixture('max_daily_budget', { amount: 100, currency: 'JPY' });
    const place = db.getPlace(PLACE_ID)!;
    db.savePlace({ ...place, planning: { estimated_cost: { amount, currency: 'JPY' } } });
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });

  it('rejects missing price references and malformed currency evidence', () => {
    const { db, service, create } = fixture('max_daily_budget', { amount: 100, currency: 'JPY' });
    const place = db.getPlace(PLACE_ID)!;
    db.savePlace({ ...place, planning: { estimated_cost: { amount: 0, currency: '' } } });
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.place_id = null;
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.hard_constraint_violations.join(' ')).toContain('no priced');
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('rejects invalid walking distance evidence %s', (distance) => {
    const { db, service, create } = fixture('max_walking_distance', { kilometers: 1 });
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items[0]!.route!.distance_meters = distance;
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });

  it('requires reservation prices and accepts an explicitly free reservation', () => {
    const { db, service, create } = fixture('max_daily_budget', { amount: 0, currency: 'JPY' });
    const reservation = db.getReservation('44444444-4444-4444-8444-444444444444')!;
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items.push({ item_id: 'synthetic-reservation', type: 'reservation',
      reservation_id: reservation.reservation_id, locked: true, start_at: reservation.start_at,
      end_at: reservation.end_at });
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
    db.reservationEvidence = { ...reservation, price: { amount: 0, currency: 'JPY' } };
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
  });

  it.each(['max_walking_distance', 'transport_mode'] as const)('does not invent routes for non-travel note/free-time items under %s', (type) => {
    const parameters = type === 'transport_mode' ? { allowed: ['walking'] } : { kilometers: 0 };
    const { db, service, create } = fixture(type, parameters);
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items.push({ item_id: 'synthetic-note', type: 'note', locked: false },
      { item_id: 'synthetic-free-time', type: 'free_time', locked: false });
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
  });

  it.each(evidenceCases.slice(0, 3))('distinguishes metadata notes from imported unscheduled activities under %s', (type, parameters) => {
    const { db, service, create } = fixture(type, parameters);
    const trip = db.getTrip(demoTripId)!;
    const note: TripItem = { item_id: 'synthetic-note', type: 'note', locked: false, title: 'Remember an umbrella' };
    trip.days[0]!.items.push(note);
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
    Object.assign(note, { source_timing: { provider: 'trip', local_date: '2026-10-20', local_time: '09:00', timezone: null } });
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });

  it('does not assume free_time is free of cost, while excluding a pure metadata note', () => {
    const { db, service, create } = fixture('max_daily_budget', { amount: 0, currency: 'JPY' });
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items.push({ item_id: 'synthetic-note', type: 'note', locked: false });
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
    const freeTime: TripItem = { item_id: 'synthetic-free-time', type: 'free_time', locked: false };
    trip.days[0]!.items.push(freeTime);
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
    freeTime.place_id = PLACE_ID; // Explicit zero estimate, not a type-name assumption.
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(true);
  });

  it.each(['max_walking_distance', 'transport_mode'] as const)('requires evidence for a note/free-time item that references a travel activity under %s', (type) => {
    const parameters = type === 'transport_mode' ? { allowed: ['walking'] } : { kilometers: 0 };
    const { db, service, create } = fixture(type, parameters);
    const trip = db.getTrip(demoTripId)!;
    trip.days[0]!.items.push({ item_id: 'synthetic-free-time', type: 'free_time', place_id: PLACE_ID, locked: false });
    db.saveTrip(trip);
    expect(service.validate(create().proposal_id).validation?.valid).toBe(false);
  });
});
