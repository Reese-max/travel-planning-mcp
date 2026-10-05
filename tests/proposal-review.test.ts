import { expect, it, vi } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import type { Trip, TripItem } from '../src/domain/types.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { reviewHash } from '../src/services/proposal-review.js';
import { MemoryStore } from '../src/store/memory-store.js';
const ID = '88888888-8888-4888-8888-888888888888';
function setup(items?: TripItem[]) {
  const db = new MemoryStore(), trip = db.getTrip(demoTripId)!;
  if (items) { trip.days = [{ date: trip.start_date, items }, { date: trip.end_date, items: [] }]; trip.constraint_ids = []; trip.reservation_ids = []; trip.place_ids = []; db.saveTrip(trip); }
  const service = new ProposalService(db);
  return { db, service, trip };
}
function create(service: ProposalService, id = ID) { return service.create({ tripId: demoTripId, operations: [{ operation: 'update', target_type: 'trip_item', target_id: id, from: { title: 'FORGED_BEFORE', notes: 'SECRET_FROM' }, to: { title: 'Synthetic revised title', notes: 'SECRET_NOTES' } }] }); }
const item = (id: string, fields: Partial<TripItem> = {}): TripItem => ({ item_id: id, type: 'place', locked: false, title: 'Synthetic original', ...fields });
it('derives both snapshots from server base, omits notes/booking secrets and binds source hashes', () => {
  const { db, service, trip } = setup(); const p = create(service); const audit = db.listAuditForTrip(demoTripId); const r = service.review(p.proposal_id);
  expect(r.changes.updated[0]!.before.title).toBe(trip.days.flatMap(d => d.items).find(i => i.item_id === ID)!.title);
  expect(r.changes.updated[0]!.after.title).toBe('Synthetic revised title');
  expect(r.changes.updated[0]!.redacted_fields).toEqual(['notes']);
  expect(JSON.stringify(r)).not.toMatch(/SECRET_|FORGED_BEFORE|confirmation_code|APPROVAL_API_KEY/);
  const { review_id, ...payload } = r; expect(review_id).toBe(reviewHash(payload));
  expect(r.receipt.base_trip_hash).toBe(reviewHash(trip)); expect(r.receipt.proposal_hash).toBe(reviewHash(p));
  expect(r.approval_authority).toBe(false); expect(r.writeback_supported).toBe(false);
  expect(db.getTrip(demoTripId)).toEqual(trip); expect(db.getProposal(p.proposal_id)).toEqual(p); expect(db.listAuditForTrip(demoTripId)).toEqual(audit);
});
it('groups actual added removed moved and updated items deterministically rather than trusting operation.from', () => {
  const { db, service, trip } = setup([item('a'), item('b'), item('c')]);
  const p = service.create({ tripId: demoTripId, operations: [
    { operation: 'add', target_type: 'trip_item', to: { date: trip.start_date, item: item('d') } },
    { operation: 'remove', target_type: 'trip_item', target_id: 'a' },
    { operation: 'move', target_type: 'trip_item', target_id: 'b', to: { date: trip.end_date } },
    { operation: 'update', target_type: 'trip_item', target_id: 'c', to: { title: 'Synthetic update' } }
  ] });
  const r = service.review(p.proposal_id); expect(r.changes.added.map(x => x.item_id)).toEqual(['d']); expect(r.changes.removed.map(x => x.item_id)).toEqual(['a']); expect(r.changes.moved.map(x => x.item_id)).toEqual(['b']); expect(r.changes.updated.map(x => x.item_id)).toEqual(['c']);
  expect(r.before.version).toBe(r.after.version); expect(r.after_is_simulation).toBe(true); expect(db.getTrip(demoTripId)).toEqual(trip);
});
it.each(['approved', 'rejected', 'applied', 'expired'] as const)('observes protected %s without reopening lifecycle or writing audit', status => {
  const { db, service } = setup(); const p = create(service); db.setProposalStatus(p.proposal_id, status); const stored = db.getProposal(p.proposal_id)!; const audit = db.listAuditForTrip(demoTripId); service.review(p.proposal_id); expect(db.getProposal(p.proposal_id)).toEqual(stored); expect(db.listAuditForTrip(demoTripId)).toEqual(audit);
});
it('preserves original before/after after trip advances and revalidates against current version', () => {
  const { db, service, trip } = setup(); const p = create(service); db.saveTrip({ ...trip, version: trip.version + 1, title: 'Synthetic current v2' }); const r = service.review(p.proposal_id); expect(r.stale).toBe(true); expect(r.current_trip_version).toBe(trip.version + 1); expect(r.before.title).toBe(trip.title); expect(r.validation.valid).toBe(false); expect(r.validation.conflicts.join(' ')).toMatch(/Stale/); expect(db.getTrip(demoTripId)!.title).toBe('Synthetic current v2');
});
it('refuses missing original history instead of inferring a before state from current', () => {
  const { db, service } = setup(); const p = create(service); db.saveProposal({ ...p, base_trip_version: 99 }); expect(() => service.review(p.proposal_id)).toThrow(/Original proposal base version is unavailable/);
});
it('current constraint changes are reevaluated, not an old stored successful validation', () => {
  const { db, service } = setup(); const p = create(service); service.validate(p.proposal_id); vi.spyOn(db, 'getConstraintsForTrip').mockReturnValue([{ constraint_id: 'OWN-SYNTHETIC-FRESH-CONSTRAINT', type: 'max_places_per_day', enabled: true, strength: 'hard', scope: { trip: true }, parameters: { max: 0 }, created_by: 'user' }]); const stored = db.getProposal(p.proposal_id)!; const r = service.review(p.proposal_id); expect(r.validation.valid).toBe(false); expect(r.validation.hard_constraint_violations.join(' ')).toMatch(/max_places/); expect(db.getProposal(p.proposal_id)).toEqual(stored);
});
it('fixed booking move is reported and not represented as an applied change', () => {
  const { service } = setup(); const p = service.create({ tripId: demoTripId, operations: [{ operation: 'move', target_type: 'trip_item', target_id: '77777777-7777-4777-8777-777777777777', to: { date: '2026-10-21' } }] }); const r = service.review(p.proposal_id); expect(r.validation.valid).toBe(false); expect(r.validation.hard_constraint_violations.join(' ')).toMatch(/fixed|locked/); expect(r.changes.moved).toEqual([]);
});
it('missing route and cost evidence remains UNKNOWN with null delta rather than zero', () => {
  const { service } = setup([item('a')]); const r = service.review(create(service, 'a').proposal_id); expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.travel_minutes.delta).toBeNull(); expect(r.impact.walking_km.delta).toBeNull(); expect(r.impact.cost.status).toBe('UNKNOWN'); expect(r.impact.cost.delta).toBeNull();
});
it('embedded routes retain source/freshness but moving them cannot claim recalculated travel delta', () => {
  const { service, trip } = setup([item('a', { route: { mode: 'walking', duration_minutes: 4, distance_meters: 200, source: 'SYNTHETIC_ESTIMATE', calculated_at: '2026-10-05T00:00:00Z' } })]); const p = service.create({ tripId: demoTripId, operations: [{ operation: 'move', target_type: 'trip_item', target_id: 'a', to: { date: trip.end_date } }] }); const r = service.review(p.proposal_id); expect(r.impact.travel_minutes.before_known).toBe(4); expect(r.impact.travel_minutes.delta).toBeNull(); expect(r.impact.route_observations.before[0]).toMatchObject({ source: 'SYNTHETIC_ESTIMATE', calculated_at: '2026-10-05T00:00:00Z', live: 'UNKNOWN' });
});
it('known zero route/cost remains recorded estimate and never becomes live', () => {
  const { db, service } = setup([item('a', { place_id: '33333333-3333-4333-8333-333333333333', route: { mode: 'walking', duration_minutes: 0, distance_meters: 0, source: 'fixture' } })]); const place = db.getPlace('33333333-3333-4333-8333-333333333333')!; db.savePlace({ ...place, planning: { estimated_cost: { amount: 0, currency: 'JPY' } } }); const r = service.review(create(service, 'a').proposal_id); expect(r.impact.travel_minutes.status).toBe('RECORDED_ESTIMATE'); expect(r.impact.travel_minutes.delta).toBe(0); expect(r.impact.cost.delta).toBe(0); expect(r.impact.cost.currency).toBe('JPY');
});
it.each([null, '0', 1] as const)('a note with present duration %s does not silently become free metadata', duration => {
  const { service } = setup([item('a', { type: 'note', duration_minutes: duration as unknown as number })]); const r = service.review(create(service, 'a').proposal_id); expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.cost.delta).toBeNull();
});
it('mixed currencies produce UNKNOWN without invented FX conversion', () => {
  const { db, service } = setup([item('a', { place_id: '33333333-3333-4333-8333-333333333333' }), item('b', { place_id: '22222222-2222-4222-8222-222222222222' })]); for (const [id, currency] of [['33333333-3333-4333-8333-333333333333', 'JPY'], ['22222222-2222-4222-8222-222222222222', 'USD']]) { const place = db.getPlace(id!)!; db.savePlace({ ...place, planning: { estimated_cost: { amount: 5, currency: currency! } } }); } const r = service.review(create(service, 'a').proposal_id); expect(r.impact.cost.delta).toBeNull(); expect(r.impact.cost.reason).toMatch(/Mixed currencies/);
});
it('numeric aggregate overflow cannot grant a known metric or serialize a fake null total', () => {
  const { service } = setup([item('a', { route: { mode: 'walking', duration_minutes: Number.MAX_VALUE, distance_meters: 0 } }), item('b', { route: { mode: 'walking', duration_minutes: Number.MAX_VALUE, distance_meters: 0 } })]); const r = service.review(create(service, 'a').proposal_id); expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.travel_minutes.delta).toBeNull(); expect(Number.isFinite(r.impact.travel_minutes.before_known)).toBe(true);
});
it('duplicate item identities refuse rather than silently collapse displayed changes', () => {
  const { db, service, trip } = setup([item('a'), item('a')]); const p = create(service, 'a'); expect(() => service.review(p.proposal_id)).toThrow(/Duplicate/); expect(db.getTrip(demoTripId)).toEqual(trip);
});
it('model-provided impact numbers cannot override server-derived unknown estimates', () => {
  const { db, service } = setup([item('a')]); const p = create(service, 'a'); db.saveProposal({ ...p, impact: { estimated_cost_delta: -999, travel_minutes_delta: -999 } }); const r = service.review(p.proposal_id); expect(r.impact.travel_minutes.delta).toBeNull(); expect(r.impact.cost.delta).toBeNull(); expect(JSON.stringify(r.impact)).not.toContain('-999');
});
it('a bounded read refuses too many operations before simulation and writes no state', () => {
  const { db, service } = setup([item('a')]); const p = create(service, 'a'); const oversized = { ...p, operations: Array.from({ length: 1001 }, () => p.operations[0]!) }; db.saveProposal(oversized); const audit = db.listAuditForTrip(demoTripId); expect(() => service.review(p.proposal_id)).toThrow(/operation limit/); expect(db.getProposal(p.proposal_id)).toEqual(oversized); expect(db.listAuditForTrip(demoTripId)).toEqual(audit);
});

it.each([undefined, '2026-10-20T10:00:00+09:00'])('reports same-day equal-clock reorder %s as moved and cannot grant an unchanged route delta', start_at => {
  const route = { mode: 'walking' as const, duration_minutes: 4, distance_meters: 200, source: 'SYNTHETIC' };
  const { service, trip } = setup([item('a', { route, start_at }), item('b', { route, start_at })]);
  const p = service.create({ tripId: demoTripId, operations: [{ operation: 'move', target_type: 'trip_item', target_id: 'a', to: { date: trip.start_date } }] });
  const r = service.review(p.proposal_id);
  expect(r.before.days[0]!.items.map(i => i.item_id)).toEqual(['a', 'b']);
  expect(r.after.days[0]!.items.map(i => i.item_id)).toEqual(['b', 'a']);
  expect(r.changes.moved.map(i => i.item_id)).toEqual(['a', 'b']);
  expect(r.changes.moved[0]!.changed_fields).toContain('position');
  expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.travel_minutes.delta).toBeNull();
});
it('retains a genuine metadata-only note as zero recorded route evidence', () => {
  const { service } = setup([item('a', { type: 'note', duration_minutes: 0 })]);
  const r = service.review(create(service, 'a').proposal_id); expect(r.impact.travel_minutes.status).toBe('RECORDED_ESTIMATE'); expect(r.impact.travel_minutes.delta).toBe(0);
});
it('adding a timed routed note cannot claim that routes were recalculated', () => {
  const { service, trip } = setup([]);
  const p = service.create({ tripId: demoTripId, operations: [{ operation: 'add', target_type: 'trip_item', to: { date: trip.start_date, item: item('a', { type: 'note', start_at: '2026-10-20T10:00:00+09:00', route: { mode: 'walking', duration_minutes: 1, distance_meters: 1 } }) } }] });
  const r = service.review(p.proposal_id); expect(r.impact.travel_minutes.after_known).toBe(1); expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.travel_minutes.delta).toBeNull();
});
it.each([{ source_timing: null }, { start_at: '' }, { end_at: '' }])('present malformed activity timing %j cannot grant a free metadata zero', fields => {
  const { service } = setup([item('a', { type: 'note', ...fields })]);
  const r = service.review(create(service, 'a').proposal_id);
  expect(r.impact.travel_minutes.status).toBe('UNKNOWN'); expect(r.impact.travel_minutes.delta).toBeNull();
});
it('projects only scalar timing fields and refuses nested route mode privacy payloads', () => {
  const { service, trip } = setup([]);
  const p = service.create({ tripId: demoTripId, operations: [{ operation: 'add', target_type: 'trip_item', to: { date: trip.start_date, item: item('a', { route: { mode: { booking_reference: 'SECRET_NESTED_MODE' }, duration_minutes: 1, distance_meters: 1 } as unknown as TripItem['route'], source_timing: { provider: { booking_reference: 'SECRET_NESTED_PROVIDER' }, source_id: ['SECRET_NESTED_ID'], local_date: { notes: 'SECRET_NESTED_DATE' }, local_time: ['SECRET_NESTED_TIME'], timezone: { note: 'SECRET_NESTED_ZONE' } } as unknown as TripItem['source_timing'] }) } }] });
  const r = service.review(p.proposal_id);
  expect(JSON.stringify(r)).not.toContain('SECRET_NESTED');
  expect(r.after.days[0]!.items[0]!.route).toBeNull();
  expect(r.after.days[0]!.items[0]!.source_timing).toEqual({ provider: null, source_id: null, local_date: null, local_time: null, timezone: null });
  expect(r.impact.travel_minutes.status).toBe('UNKNOWN');
});
