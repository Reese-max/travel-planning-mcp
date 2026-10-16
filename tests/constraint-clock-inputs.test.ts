import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import type { Constraint, TripItem } from '../src/domain/types.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

const ITEM_ID = '88888888-8888-4888-8888-888888888888';
const BASE_PLACE_ID = '22222222-2222-4222-8222-222222222222';

class InputStore extends MemoryStore {
  constructor(public constraint: Constraint) { super(); }
  override getConstraintsForTrip(): Constraint[] { return [structuredClone(this.constraint)]; }
}

function fixture(type: Constraint['type'], parameters: Record<string, unknown>, strength: Constraint['strength'] = 'hard') {
  const db = new InputStore({ constraint_id: 'clock-input-check', type, parameters, strength,
    enabled: true, scope: { trip: true }, created_by: 'user' });
  const trip = db.getTrip(demoTripId)!;
  const item = trip.days[0]!.items.find((candidate) => candidate.item_id === ITEM_ID)!;
  item.start_at = '2026-10-20T18:00:00+09:00';
  item.end_at = '2026-10-20T19:00:00+09:00';
  trip.days = [{ date: '2026-10-20', base_place_id: BASE_PLACE_ID, items: [item] }];
  trip.reservation_ids = [];
  db.saveTrip(trip);
  const service = new ProposalService(db);
  const update = (to: Record<string, unknown>) => service.create({ tripId: demoTripId,
    operations: [{ operation: 'update', target_type: 'trip_item', target_id: ITEM_ID, to }] });
  return { db, service, update };
}

describe('constraint clock input boundaries', () => {
  it.each([null, undefined, '', 'Not/A_Real_Zone', 9])('never falls back from explicit invalid timezone %s', (timezone) => {
    for (const strength of ['hard', 'soft'] as const) {
      const { service, update } = fixture('return_by', { time: '20:00', timezone }, strength);
      const result = service.validate(update({ notes: 'Synthetic review' }).proposal_id).validation!;
      expect(result.valid).toBe(strength === 'soft');
      const messages = strength === 'hard' ? result.hard_constraint_violations : result.soft_constraint_warnings;
      expect(messages.join(' ')).toContain('cannot be evaluated safely');
    }
  });

  it.each([
    ['return_by', { time: '20:00', end: '23:00', timezone: 'Asia/Tokyo' },
      { start_at: '2026-10-20T18:00:00+09:00', end_at: '2026-10-20T21:00:00+09:00' }],
    ['start_after', { time: '08:00', start: '05:00', timezone: 'Asia/Tokyo' },
      { start_at: '2026-10-20T07:00:00+09:00', end_at: '2026-10-20T09:00:00+09:00' }]
  ] as Array<[Constraint['type'], Record<string, unknown>, Record<string, unknown>]>)('uses only canonical parameters for %s', (type, parameters, timing) => {
    const { service, update } = fixture(type, parameters);
    const result = service.validate(update(timing).proposal_id).validation!;
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).not.toContain('cannot be evaluated safely');
  });

  it.each(['2026-10-20T20:00:00.000000001+09:00', '2026-10-20T11:00:00.000000001Z'])('rejects an instant fractionally beyond the upper boundary: %s', (end_at) => {
    const { service, update } = fixture('return_by', { time: '20:00', timezone: 'Asia/Tokyo' });
    expect(service.validate(update({ end_at }).proposal_id).validation!.valid).toBe(false);
  });

  it.each(['2026-10-20T20:00:00.000000000+09:00', '2026-10-20T11:00:00.000000000Z'])('accepts the exact inclusive upper boundary: %s', (end_at) => {
    const { service, update } = fixture('return_by', { time: '20:00', timezone: 'Asia/Tokyo' });
    expect(service.validate(update({ end_at }).proposal_id).validation!.valid).toBe(true);
  });
});

describe('unknown proposal fields cannot become metadata exemptions', () => {
  it.each([120, -1, NaN, Infinity, -Infinity, null, undefined, '0', '120', {}, []])('requires activity evidence for present duration %s', (duration_minutes) => {
    const { db, service } = fixture('return_by', { time: '20:00', timezone: 'Asia/Tokyo' });
    const trip = db.getTrip(demoTripId)!;
    const note: TripItem = { item_id: 'proposal-note', type: 'note', title: 'Synthetic note', locked: false };
    trip.days[0]!.items.push(note);
    db.saveTrip(trip);
    // Operation to-fields are unknown records at the HTTP proposal boundary.
    const proposal = service.create({ tripId: demoTripId, operations: [{ operation: 'update',
      target_type: 'trip_item', target_id: note.item_id, to: { duration_minutes } }] });
    const before = db.getTrip(demoTripId);
    const result = service.validate(proposal.proposal_id).validation!;
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow();
    expect(() => service.apply(proposal.proposal_id)).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
  });
});
