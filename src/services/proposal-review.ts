import { createHash } from 'node:crypto';
import type { ChangeProposal, Money, ProposalValidation, Trip, TripItem } from '../domain/types.js';
import type { TravelStore } from '../ports/travel-store.js';

export class ProposalReviewConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'ProposalReviewConflictError'; }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export const reviewHash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
const string = (value: unknown): string | null => typeof value === 'string' ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const metadataOnly = (item: TripItem): boolean => item.type === 'note' && item.start_at == null && item.end_at == null && !('source_timing' in item) && !item.place_id && !item.reservation_id && !item.route && (!('duration_minutes' in item) || item.duration_minutes === 0);
const routeModes = ['walking', 'transit', 'rail', 'taxi', 'car', 'bike'];
function project(item: TripItem, date: string, position: number) {
  return {
    item_id: item.item_id, date, position, type: item.type,
    title: string(item.title), place_id: string(item.place_id), reservation_id: string(item.reservation_id),
    start_at: string(item.start_at), end_at: string(item.end_at), duration_minutes: number(item.duration_minutes), locked: item.locked,
    route: item.route && routeModes.includes(item.route.mode) ? { mode: item.route.mode, duration_minutes: number(item.route.duration_minutes), distance_meters: number(item.route.distance_meters), source: string(item.route.source), calculated_at: string(item.route.calculated_at), live: 'UNKNOWN' as const } : null,
    source_timing: item.source_timing ? { provider: string(item.source_timing.provider), source_id: string(item.source_timing.source_id), local_date: string(item.source_timing.local_date), local_time: string(item.source_timing.local_time), timezone: string(item.source_timing.timezone) } : null
  };
}
function indexed(trip: Trip) {
  const items = new Map<string, { date: string; position: number; item: TripItem }>();
  for (const day of trip.days) for (const [position, item] of day.items.entries()) {
    if (items.has(item.item_id)) throw new ProposalReviewConflictError('Duplicate itinerary item identity prevents an unambiguous review.');
    items.set(item.item_id, { date: day.date, position, item });
    if (items.size > 2000) throw new ProposalReviewConflictError('Proposal review item limit exceeded.');
  }
  return items;
}
export function assertReviewInputLimits(proposal: ChangeProposal, base: Trip, current: Trip): void {
  if (proposal.operations.length > 1000) throw new ProposalReviewConflictError('Proposal review operation limit exceeded.');
  indexed(base); indexed(current);
  for (const value of [proposal, base, current]) if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 1_000_000) throw new ProposalReviewConflictError('Proposal review input size limit exceeded.');
}
function snapshot(trip: Trip) {
  indexed(trip);
  return { trip_id: trip.trip_id, version: trip.version, title: trip.title, start_date: trip.start_date, end_date: trip.end_date,
    days: trip.days.map(day => ({ date: day.date, items: day.items.map((item, position) => project(item, day.date, position)) })) };
}
const fields = ['type', 'title', 'place_id', 'reservation_id', 'start_at', 'end_at', 'duration_minutes', 'locked', 'notes', 'route', 'source_timing'] as const;
function changes(before: Trip, after: Trip) {
  const left = indexed(before), right = indexed(after);
  // Compare the relative order of surviving same-day identities. Inserting or
  // removing another item changes absolute indexes without moving these items.
  const ranks = (source: typeof left, other: typeof left) => {
    const result = new Map<string, number>(), counts = new Map<string, number>();
    for (const [id, value] of source) if (other.get(id)?.date === value.date) {
      const rank = counts.get(value.date) ?? 0; result.set(id, rank); counts.set(value.date, rank + 1);
    }
    return result;
  };
  const oldRanks = ranks(left, right), newRanks = ranks(right, left);
  const added = [...right].filter(([id]) => !left.has(id)).map(([, value]) => project(value.item, value.date, value.position));
  const removed = [...left].filter(([id]) => !right.has(id)).map(([, value]) => project(value.item, value.date, value.position));
  const moved: Array<{ item_id: string; before: ReturnType<typeof project>; after: ReturnType<typeof project>; changed_fields: string[]; redacted_fields: string[] }> = [];
  const updated: typeof moved = [];
  for (const [id, old] of left) {
    const next = right.get(id); if (!next) continue;
    const changed: string[] = fields.filter(field => canonical(old.item[field]) !== canonical(next.item[field]));
    if (old.date !== next.date) changed.unshift('date');
    else if (oldRanks.get(id) !== newRanks.get(id)) changed.unshift('position');
    if (!changed.length) continue;
    const row = { item_id: id, before: project(old.item, old.date, old.position), after: project(next.item, next.date, next.position), changed_fields: changed, redacted_fields: changed.includes('notes') ? ['notes'] : [] };
    if (old.date !== next.date || changed.some(field => ['position', 'start_at', 'end_at'].includes(field))) moved.push(row); else updated.push(row);
  }
  const byId = <T extends { item_id: string }>(items: T[]) => items.sort((a, b) => a.item_id.localeCompare(b.item_id));
  return { added: byId(added), removed: byId(removed), moved: byId(moved), updated: byId(updated) };
}
function routeEvidence(trip: Trip) {
  let travel = 0, walking = 0;
  const missing: string[] = [], observations: Array<{ item_id: string; source: string | null; calculated_at: string | null; live: 'UNKNOWN' }> = [];
  for (const { item } of indexed(trip).values()) {
    if (metadataOnly(item)) continue;
    const route = item.route;
    if (!route || number(route.duration_minutes) === null || number(route.distance_meters) === null || !routeModes.includes(route.mode)) { missing.push(item.item_id); continue; }
    const nextTravel = travel + route.duration_minutes;
    const nextWalking = walking + (route.mode === 'walking' ? route.distance_meters / 1000 : 0);
    if (!Number.isFinite(nextTravel) || !Number.isFinite(nextWalking)) { missing.push(item.item_id); continue; }
    travel = nextTravel; walking = nextWalking;
    observations.push({ item_id: item.item_id, source: string(route.source), calculated_at: string(route.calculated_at), live: 'UNKNOWN' });
  }
  return { travel, walking, missing: missing.sort(), observations };
}
function costEvidence(trip: Trip, db: TravelStore) {
  const totals: Record<string, number> = {}, missing: string[] = [];
  const overflow = new Set<string>();
  for (const { item } of indexed(trip).values()) {
    if (metadataOnly(item)) continue;
    // One recorded amount per item; a reservation price takes precedence over a
    // place estimate rather than charging both for the same itinerary entry.
    const cost: Money | null | undefined = item.reservation_id ? db.getReservation(item.reservation_id)?.price : item.place_id ? db.getPlace(item.place_id)?.planning?.estimated_cost : undefined;
    if (!cost || number(cost.amount) === null || !/^[A-Z]{3}$/.test(cost.currency)) { missing.push(item.item_id); continue; }
    const next = (totals[cost.currency] ?? 0) + cost.amount;
    if (overflow.has(cost.currency) || !Number.isFinite(next)) { delete totals[cost.currency]; overflow.add(cost.currency); missing.push(item.item_id); continue; }
    totals[cost.currency] = next;
  }
  return { totals, missing: missing.sort() };
}
function impact(before: Trip, after: Trip, db: TravelStore, diff: ReturnType<typeof changes>) {
  const a = routeEvidence(before), b = routeEvidence(after);
  const left = indexed(before), right = indexed(after);
  const itineraryChanged = diff.moved.length > 0 || [...diff.added, ...diff.removed].some(row => !metadataOnly((right.get(row.item_id) ?? left.get(row.item_id))!.item)) || diff.updated.some(row => row.changed_fields.some(field => ['place_id', 'reservation_id', 'route', 'duration_minutes', 'type', 'source_timing'].includes(field)));
  const completeRoutes = !a.missing.length && !b.missing.length;
  // Existing embedded routes are not recomputed for a changed itinerary.
  const routeKnown = completeRoutes && !itineraryChanged;
  const routeMetric = (key: 'travel' | 'walking') => ({ status: routeKnown ? 'RECORDED_ESTIMATE' as const : 'UNKNOWN' as const, before_known: a[key], after_known: b[key], delta: routeKnown ? Number((b[key] - a[key]).toFixed(6)) : null, reason: routeKnown ? null : completeRoutes ? 'Routes were not recalculated for the changed itinerary.' : 'Route evidence is incomplete.', missing_before: a.missing, missing_after: b.missing });
  const x = costEvidence(before, db), y = costEvidence(after, db), currencies = [...new Set([...Object.keys(x.totals), ...Object.keys(y.totals)])].sort();
  const costKnown = !x.missing.length && !y.missing.length && currencies.length === 1;
  const currency = costKnown ? currencies[0]! : null;
  return { travel_minutes: routeMetric('travel'), walking_km: routeMetric('walking'), route_observations: { before: a.observations, after: b.observations },
    cost: { status: costKnown ? 'RECORDED_ESTIMATE' as const : 'UNKNOWN' as const, basis: 'Current recorded planning estimates or reservation prices; not a live quote or historical price revision.', currency, before_known: x.totals, after_known: y.totals, delta: currency ? (y.totals[currency] ?? 0) - (x.totals[currency] ?? 0) : null, missing_before: x.missing, missing_after: y.missing, reason: costKnown ? null : currencies.length > 1 ? 'Mixed currencies are not converted.' : 'Cost evidence is incomplete.' } };
}

export function buildProposalReview(input: { proposal: ChangeProposal; base: Trip; current: Trip; simulated: Trip; validation: ProposalValidation; db: TravelStore }) {
  const { proposal, base, current, simulated, validation, db } = input;
  const diff = changes(base, simulated);
  const data = {
    schema_version: 'proposal-review/v1', read_only: true, proposal_id: proposal.proposal_id, trip_id: proposal.trip_id,
    lifecycle_status: proposal.status, base_trip_version: proposal.base_trip_version, current_trip_version: current.version, stale: current.version !== proposal.base_trip_version,
    before: snapshot(base), after: snapshot(simulated), after_is_simulation: true,
    changes: diff, impact: impact(base, simulated, db, diff), validation: structuredClone(validation),
    operator_approval_attached: !!proposal.approval, approval_authority: false, writeback_supported: false,
    source_identity: base.import_source ? { provider: base.import_source.provider, instance_id: base.import_source.instance_id ?? null, source_trip_id: base.import_source.source_trip_id } : null,
    receipt: { observed_at: validation.validated_at ?? null, proposal_hash: reviewHash(proposal), base_trip_hash: reviewHash(base), current_trip_hash: reviewHash(current), simulated_trip_hash: reviewHash(simulated) }
  };
  const result = { ...data, review_id: reviewHash(data) };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 1_000_000) throw new ProposalReviewConflictError('Proposal review response size limit exceeded.');
  return result;
}
