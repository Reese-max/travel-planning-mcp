import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import type { Constraint, Money, Reservation } from '../src/domain/types.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

class ConstraintStore extends MemoryStore {
  reservationPrices = new Map<string, Money>();
  constructor(public constraint: Constraint) { super(); }
  override getConstraintsForTrip(): Constraint[] { return [this.constraint]; }
  override getReservation(id: string): Reservation | undefined {
    const reservation = super.getReservation(id);
    const price = this.reservationPrices.get(id);
    return reservation && price ? { ...reservation, price } : reservation;
  }
}

function fixture(type: Constraint['type'], parameters: Record<string, unknown>, strength: Constraint['strength'] = 'hard') {
  const db = new ConstraintStore({ constraint_id: 'safety-check', type, parameters, strength,
    enabled: true, scope: { trip: true }, created_by: 'user' });
  const service = new ProposalService(db);
  const proposal = service.create({ tripId: demoTripId, operations: [{ operation: 'move',
    target_type: 'trip_item', target_id: '88888888-8888-4888-8888-888888888888',
    to: { start_at: '2026-10-20T16:00:00+09:00', end_at: '2026-10-20T17:30:00+09:00' } }] });
  return { db, service, proposal };
}

describe('constraint safety', () => {
  it.each<Constraint['type']>(['fixed_item', 'must_visit', 'avoid_place', 'avoid_category',
    'return_by', 'start_after', 'time_window', 'max_places_per_day', 'max_walking_distance',
    'max_daily_budget', 'transport_mode'])('blocks a hard %s with missing parameters', (type) => {
    const { db, service, proposal } = fixture(type, {});
    const before = db.getTrip(demoTripId);
    const result = service.validate(proposal.proposal_id);
    expect(result.validation?.valid).toBe(false);
    expect(result.validation?.hard_constraint_violations.join(' ')).toContain('cannot be evaluated');
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
  });

  it.each<[Constraint['type'], Record<string, unknown>]>([
    ['return_by', { time: '99:99' }], ['start_after', { time: '9:00' }],
    ['time_window', { start: '18:00', end: '09:00' }],
    ['max_daily_budget', { amount: -1, currency: 'JPY' }],
    ['max_walking_distance', { kilometers: Number.NaN }],
    ['max_places_per_day', { count: 2.5 }], ['avoid_place', { place_id: ' ' }],
    ['transport_mode', { allowed: ['teleport'] }]
  ])('blocks malformed %s parameters', (type, parameters) => {
    const { service, proposal } = fixture(type, parameters);
    expect(service.validate(proposal.proposal_id).validation?.valid).toBe(false);
  });

  it('keeps an unevaluable soft constraint as a warning', () => {
    const { service, proposal } = fixture('return_by', {}, 'soft');
    const result = service.validate(proposal.proposal_id);
    expect(result.validation?.valid).toBe(true);
    expect(result.validation?.soft_constraint_warnings.join(' ')).toContain('cannot be evaluated');
  });

  it('accepts the canonical transport modes and zero-valued limits', () => {
    for (const [type, parameters] of [
      ['transport_mode', { allowed: ['walking', 'transit', 'rail', 'taxi', 'car', 'bike'] }],
      ['max_walking_distance', { kilometers: 0 }],
      ['max_daily_budget', { amount: 0, currency: 'JPY' }]
    ] as Array<[Constraint['type'], Record<string, unknown>]>) {
      const { db, service, proposal } = fixture(type, parameters);
      // Explicit known zeros are evaluable; missing route/price data is not zero.
      const trip = db.getTrip(demoTripId)!;
      for (const day of trip.days) for (const item of day.items) {
        item.route = { mode: 'walking', distance_meters: 0, duration_minutes: 0, source: 'synthetic-test' };
        if (item.place_id) {
          const place = db.getPlace(item.place_id)!;
          db.savePlace({ ...place, planning: { ...place.planning, estimated_cost: { amount: 0, currency: 'JPY' } } });
        }
        if (item.reservation_id) db.reservationPrices.set(item.reservation_id, { amount: 0, currency: 'JPY' });
      }
      db.saveTrip(trip);
      expect(service.validate(proposal.proposal_id).validation?.valid).toBe(true);
    }
  });

  it.each(['hard', 'soft'] as const)('honors %s strength for mixed-currency budgets', (strength) => {
    const { db, service, proposal } = fixture('max_daily_budget', { amount: 1000, currency: 'JPY' }, strength);
    const place = db.getPlace('33333333-3333-4333-8333-333333333333')!;
    db.savePlace({ ...place, planning: { ...place.planning, estimated_cost: { amount: 10, currency: 'USD' } } });
    const result = service.validate(proposal.proposal_id);
    expect(result.validation?.valid).toBe(strength === 'soft');
    const messages = strength === 'hard' ? result.validation?.hard_constraint_violations : result.validation?.soft_constraint_warnings;
    expect(messages?.join(' ')).toContain('mixed currencies');
  });

  it('rechecks hard constraints at approval and apply without writing a trip', () => {
    const { db, service, proposal } = fixture('return_by', { time: '23:00' });
    service.validate(proposal.proposal_id);
    db.constraint.parameters = {};
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow(/no longer valid/);
    db.constraint.parameters = { time: '23:00' };
    service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' });
    db.constraint.parameters = {};
    expect(() => service.apply(proposal.proposal_id)).toThrow();
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
    expect(db.getProposal(proposal.proposal_id)?.status).toBe('approved');
  });
});
