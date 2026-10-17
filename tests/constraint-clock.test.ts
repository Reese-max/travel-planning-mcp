import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import type { Constraint, TripItem } from '../src/domain/types.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

const ITEM_ID = '88888888-8888-4888-8888-888888888888';
const BASE_PLACE_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_PLACE_ID = '33333333-3333-4333-8333-333333333333';
const DATE = '2026-10-20';

class ClockStore extends MemoryStore {
  constructor(public constraint: Constraint) { super(); }
  override getConstraintsForTrip(): Constraint[] { return [structuredClone(this.constraint)]; }
}

interface FixtureOptions {
  type: Constraint['type'];
  parameters: Record<string, unknown>;
  strength?: Constraint['strength'];
  date?: string;
  start?: string;
  end?: string;
  baseTimezone?: string | null;
  basePlaceId?: string;
  note?: TripItem;
}

function fixture(options: FixtureOptions) {
  const db = new ClockStore({ constraint_id: 'canonical-clock-check', type: options.type,
    parameters: options.parameters, strength: options.strength ?? 'hard', enabled: true,
    scope: { trip: true }, created_by: 'user' });
  const trip = db.getTrip(demoTripId)!;
  const item = trip.days[0]!.items.find((candidate) => candidate.item_id === ITEM_ID)!;
  const date = options.date ?? DATE;
  item.start_at = options.start ?? `${date}T18:30:00+09:00`;
  item.end_at = options.end ?? `${date}T19:00:00+09:00`;
  item.route = { mode: 'walking', distance_meters: 0, duration_minutes: 0, source: 'synthetic-test' };
  const day = { date, items: options.note ? [item, options.note] : [item],
    ...(options.basePlaceId ? { base_place_id: options.basePlaceId } : {}) };
  trip.start_date = date;
  trip.end_date = date;
  trip.days = [day];
  trip.reservation_ids = [];
  db.saveTrip(trip);
  if (options.baseTimezone !== undefined) {
    const base = db.getPlace(BASE_PLACE_ID)!;
    db.savePlace({ ...base, location: { ...base.location, timezone: options.baseTimezone } });
  }
  const activity = db.getPlace(ACTIVITY_PLACE_ID)!;
  db.savePlace({ ...activity,
    planning: { ...activity.planning, estimated_cost: { amount: 0, currency: 'JPY' } } });
  const service = new ProposalService(db);
  const proposal = service.create({ tripId: demoTripId, operations: [{ operation: 'update',
    target_type: 'trip_item', target_id: ITEM_ID, to: { notes: 'Reviewed synthetic update' } }] });
  const validate = () => service.validate(proposal.proposal_id).validation!;
  return { db, service, proposal, validate };
}

const clockSources = ['constraint', 'day base place'] as const;
function tokyoOptions(source: typeof clockSources[number], type: Constraint['type'], parameters: Record<string, unknown>) {
  // Give the fallback a different zone when the constraint explicitly names Tokyo:
  // explicit policy context must take precedence over the day's base place.
  return source === 'constraint'
    ? { type, parameters: { ...parameters, timezone: 'Asia/Tokyo' },
        basePlaceId: BASE_PLACE_ID, baseTimezone: 'America/Los_Angeles' }
    : { type, parameters, basePlaceId: BASE_PLACE_ID, baseTimezone: 'Asia/Tokyo' };
}

describe('canonical constraint clock', () => {
  it.each(clockSources)('rejects equivalent 21:00 Tokyo / 12:00 UTC deadlines using the %s clock', (source) => {
    const results = ['2026-10-20T21:00:00+09:00', '2026-10-20T12:00:00Z'].map((end) =>
      fixture({ ...tokyoOptions(source, 'return_by', { time: '20:00' }),
        start: '2026-10-20T11:00:00Z', end }).validate());
    expect(results.map((result) => result.valid)).toEqual([false, false]);
    for (const result of results) {
      expect(result.hard_constraint_violations.join(' ')).toContain('return_by');
      expect(result.hard_constraint_violations.join(' ')).not.toContain('cannot be evaluated safely');
    }
  });

  it.each(clockSources)('accepts equivalent 19:00 Tokyo / 10:00 UTC deadlines using the %s clock', (source) => {
    const results = ['2026-10-20T19:00:00+09:00', '2026-10-20T10:00:00Z'].map((end) =>
      fixture({ ...tokyoOptions(source, 'return_by', { time: '20:00' }),
        start: '2026-10-20T09:30:00Z', end }).validate());
    expect(results.map((result) => result.valid)).toEqual([true, true]);
  });

  it.each(clockSources)('checks start_after against one instant using the %s clock', (source) => {
    const options = tokyoOptions(source, 'start_after', { time: '08:00' });
    for (const [starts, valid] of [
      [['2026-10-20T07:00:00+09:00', '2026-10-19T22:00:00Z'], false],
      [['2026-10-20T09:00:00+09:00', '2026-10-20T00:00:00Z'], true]
    ] as const) {
      const results = starts.map((start) => fixture({ ...options, start,
        end: '2026-10-20T01:00:00Z' }).validate().valid);
      expect(results).toEqual([valid, valid]);
    }
  });

  it.each(clockSources)('checks both time_window boundaries using the %s clock', (source) => {
    const options = tokyoOptions(source, 'time_window', { start: '08:00', end: '20:00' });
    const representations = [
      { start: '2026-10-20T09:00:00+09:00', end: '2026-10-20T19:00:00+09:00' },
      { start: '2026-10-20T00:00:00Z', end: '2026-10-20T10:00:00Z' }
    ];
    expect(representations.map((timing) => fixture({ ...options, ...timing }).validate().valid))
      .toEqual([true, true]);
    const late = ['2026-10-20T20:30:00+09:00', '2026-10-20T11:30:00Z'];
    expect(late.map((end) => fixture({ ...options, start: '2026-10-20T09:00:00+09:00', end }).validate().valid))
      .toEqual([false, false]);
  });

  const temporalCases: Array<[Constraint['type'], Record<string, unknown>]> = [
    ['return_by', { time: '20:00' }],
    ['start_after', { time: '08:00' }],
    ['time_window', { start: '08:00', end: '20:00' }]
  ];

  it.each(temporalCases)('blocks hard %s when the day has no authoritative timezone', (type, parameters) => {
    // The item and its referenced attraction both carry Tokyo evidence; neither
    // is the policy's day clock when no day base place was designated.
    const { db, service, proposal, validate } = fixture({ type, parameters });
    const before = db.getTrip(demoTripId);
    expect(validate().hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
    expect(validate().valid).toBe(false);
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow();
    expect(() => service.apply(proposal.proposal_id)).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
  });

  it.each(temporalCases)('warns for soft %s when the day timezone is missing', (type, parameters) => {
    const result = fixture({ type, parameters, strength: 'soft' }).validate();
    expect(result.valid).toBe(true);
    expect(result.soft_constraint_warnings.join(' ')).toContain('cannot be evaluated safely');
  });

  it.each(temporalCases)('blocks hard %s when the canonical day timezone is invalid', (type, parameters) => {
    const result = fixture({ type, parameters, basePlaceId: BASE_PLACE_ID,
      baseTimezone: 'Not/A_Real_Zone' }).validate();
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
  });

  it.each(temporalCases)('warns for soft %s when the canonical day timezone is invalid', (type, parameters) => {
    const result = fixture({ type, parameters, strength: 'soft', basePlaceId: BASE_PLACE_ID,
      baseTimezone: 'Not/A_Real_Zone' }).validate();
    expect(result.valid).toBe(true);
    expect(result.soft_constraint_warnings.join(' ')).toContain('cannot be evaluated safely');
  });

  it.each([null, ''] as const)('does not infer Tokyo from +09:00 when the designated base timezone is %s', (baseTimezone) => {
    const result = fixture({ type: 'return_by', parameters: { time: '20:00' },
      basePlaceId: BASE_PLACE_ID, baseTimezone }).validate();
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
  });

  it('fails closed when the designated day base place cannot be resolved', () => {
    const result = fixture({ type: 'return_by', parameters: { time: '20:00' },
      basePlaceId: 'unresolved-base-place' }).validate();
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
  });

  const dstCases: Array<[string, Constraint['type'], Record<string, unknown>, string, string, string]> = [
    ['fall fold', 'return_by', { time: '01:30' }, '2026-11-01', '2026-11-01T00:00:00-04:00', '2026-11-01T00:30:00-04:00'],
    ['fall fold', 'start_after', { time: '01:30' }, '2026-11-01', '2026-11-01T02:00:00-05:00', '2026-11-01T02:30:00-05:00'],
    ['fall fold', 'time_window', { start: '00:00', end: '01:30' }, '2026-11-01', '2026-11-01T00:00:00-04:00', '2026-11-01T00:30:00-04:00'],
    ['spring gap', 'return_by', { time: '02:30' }, '2026-03-08', '2026-03-08T01:00:00-05:00', '2026-03-08T01:30:00-05:00'],
    ['spring gap', 'start_after', { time: '02:30' }, '2026-03-08', '2026-03-08T03:00:00-04:00', '2026-03-08T03:30:00-04:00'],
    ['spring gap', 'time_window', { start: '01:00', end: '02:30' }, '2026-03-08', '2026-03-08T01:00:00-05:00', '2026-03-08T01:30:00-05:00']
  ];

  it.each(dstCases)('cannot safely evaluate the %s boundary for %s', (_transition, type, parameters, date, start, end) => {
    const result = fixture({ type, parameters: { ...parameters, timezone: 'America/New_York' },
      date, start, end }).validate();
    expect(result.valid).toBe(false);
    expect(result.hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
  });
});

describe('duration-bearing notes are operational activities', () => {
  const applicableCases: Array<[Constraint['type'], Record<string, unknown>]> = [
    ['return_by', { time: '20:00', timezone: 'Asia/Tokyo' }],
    ['start_after', { time: '08:00', timezone: 'Asia/Tokyo' }],
    ['time_window', { start: '08:00', end: '20:00', timezone: 'Asia/Tokyo' }],
    ['max_walking_distance', { kilometers: 0 }],
    ['transport_mode', { allowed: ['walking'] }],
    ['max_daily_budget', { amount: 0, currency: 'JPY' }]
  ];

  it.each(applicableCases)('requires missing activity evidence for a 120-minute note under hard %s', (type, parameters) => {
    const note: TripItem = { item_id: 'duration-bearing-note', type: 'note',
      title: 'Two-hour activity awaiting details', duration_minutes: 120, locked: false };
    const { db, service, proposal, validate } = fixture({ type, parameters, note });
    const before = db.getTrip(demoTripId);
    expect(validate().valid).toBe(false);
    expect(validate().hard_constraint_violations.join(' ')).toContain('cannot be evaluated safely');
    expect(() => service.approve({ proposalId: proposal.proposal_id, actorId: 'operator', channel: 'ui' })).toThrow();
    expect(db.getTrip(demoTripId)).toEqual(before);
    expect(db.listTripVersions(demoTripId)).toEqual([1]);
  });

  it.each(applicableCases)('allows ordinary metadata notes and explicit duration zero under %s', (type, parameters) => {
    for (const duration of [undefined, 0]) {
      const note: TripItem = { item_id: 'metadata-note', type: 'note', title: 'Remember an umbrella',
        locked: false, ...(duration === undefined ? {} : { duration_minutes: duration }) };
      const result = fixture({ type, parameters, note }).validate();
      expect(result.valid).toBe(true);
      expect(result.hard_constraint_violations).toEqual([]);
    }
  });
});
