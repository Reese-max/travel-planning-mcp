import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TripReadClient } from '../src/adapters/trip-read-client.js';
import type { ExternalTripPreview } from '../src/services/external-trip-import-service.js';
import {
  ExternalImportApprovalError,
  ExternalImportConflictError,
  ExternalImportPreviewError,
  ExternalTripImportService
} from '../src/services/external-trip-import-service.js';
import { MemoryStore } from '../src/store/memory-store.js';
import {
  EXTERNAL_TRIP_ID,
  TRIP_INSTANCE_ID,
  jsonResponse,
  readOnlyPreview,
  tripFixture
} from './helpers/trip-fixture.js';

const APPROVAL = { actorId: 'operator@example.test', travelerDisplayName: 'Trip Owner' };

function serviceWith(db = new MemoryStore()): { db: MemoryStore; service: ExternalTripImportService } {
  return { db, service: new ExternalTripImportService(db) };
}

async function previewFromSource(source: Record<string, unknown>): Promise<ExternalTripPreview> {
  const client = new TripReadClient({
    baseUrl: 'https://trip.example.test',
    apiToken: 'TEST-SECRET',
    instanceId: TRIP_INSTANCE_ID,
    fetchImpl: (async () => jsonResponse(source)) as unknown as typeof fetch
  });
  return (await client.previewTrip(EXTERNAL_TRIP_ID)) as unknown as ExternalTripPreview;
}

async function preview(overrides: Parameters<typeof readOnlyPreview>[0] = {}): Promise<ExternalTripPreview> {
  return (await readOnlyPreview(overrides)) as unknown as ExternalTripPreview;
}

describe('canonical external trip import', () => {
  it('requires an explicit operator approval before any canonical write', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();

    expect(() => service.importPreview(snapshot, { actorId: '   ', travelerDisplayName: 'Trip Owner' }))
      .toThrow(ExternalImportApprovalError);
    expect(() => service.importPreview(snapshot, { actorId: 'operator', travelerDisplayName: '  ' }))
      .toThrow(ExternalImportApprovalError);

    expect(db.getTrip(snapshot.mapped_trip_id)).toBeUndefined();
    expect(db.listAuditForTrip(snapshot.mapped_trip_id)).toEqual([]);
  });

  it('creates canonical trip v1 with preserved source identity and imported_at', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();

    const report = service.importPreview(snapshot, APPROVAL);
    expect(report.status).toBe('imported');
    expect(report.source).toBe('trip');
    expect(report.source_trip_id).toBe(String(EXTERNAL_TRIP_ID));
    expect(report.source_fingerprint).toBe(snapshot.source_fingerprint);

    const trip = db.getTrip(report.trip.trip_id)!;
    expect(trip.version).toBe(1);
    expect(trip.status).toBe('draft');
    expect(trip.title).toBe(snapshot.title);
    expect(trip.start_date).toBe('2026-10-20');
    expect(trip.end_date).toBe('2026-10-20');
    expect(trip.travelers).toEqual([
      expect.objectContaining({ display_name: 'Trip Owner', role: 'owner' })
    ]);
    expect(trip.import_source).toMatchObject({
      provider: 'trip',
      instance_id: TRIP_INSTANCE_ID,
      source_trip_id: String(EXTERNAL_TRIP_ID),
      source_fingerprint: snapshot.source_fingerprint,
      imported_by: 'operator@example.test',
      approved_by: 'operator@example.test'
    });
    expect(trip.import_source?.imported_at).toBe(trip.created_at);
    expect(trip.created_at).toBe(trip.updated_at);

    const events = db.listAuditForTrip(trip.trip_id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'external_trip_imported',
      actor_type: 'operator',
      actor_id: 'operator@example.test'
    });
    expect(events[0]!.metadata).toMatchObject({
      source: 'trip',
      instance_id: TRIP_INSTANCE_ID,
      source_trip_id: String(EXTERNAL_TRIP_ID),
      source_fingerprint: snapshot.source_fingerprint
    });
  });

  it('never invents dates, times, timezones, or reservations for unresolved source data', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();

    const report = service.importPreview(snapshot, APPROVAL);
    const trip = db.getTrip(report.trip.trip_id)!;

    expect(trip.days).toHaveLength(1);
    const items = trip.days[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ locked: true, start_at: null, end_at: null });
    expect(items[0]!.place_id).toBe(trip.place_ids?.[0]);
    expect(items[0]!.source_timing).toEqual({
      provider: 'trip',
      source_id: '30',
      local_date: '2026-10-20',
      local_time: '09:00',
      timezone: null
    });
    expect(trip.reservation_ids ?? []).toEqual([]);
    expect(report.counts.reservations).toBe(0);
    expect(db.getReservation(snapshot.days[0]!.unresolved_bookings[0]!.mapped_reservation_id)).toBeUndefined();

    const codes = report.unresolved_fields.map((field) => field.code);
    expect(codes).toContain('MISSING_DATE');
    expect(codes).toContain('BOOKING_TIMING_UNKNOWN');
    expect(codes).toContain('TIMEZONE_UNKNOWN');
    expect(report.warnings.some((warning) => /not live verification/i.test(warning))).toBe(true);
    expect(report.conflicts).toEqual([]);
    expect(JSON.stringify(trip)).not.toContain('PRIVATE-');
  });

  it('is idempotent for the same snapshot and refuses a silent re-import of changed source data', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();

    const first = service.importPreview(snapshot, APPROVAL);
    const second = service.importPreview(snapshot, APPROVAL);

    expect(second.status).toBe('duplicate');
    expect(second.trip.trip_id).toBe(first.trip.trip_id);
    expect(second.trip.version).toBe(1);
    expect(second.imported_at).toBe(first.imported_at);
    expect(db.listTripVersions(first.trip.trip_id)).toEqual([1]);
    expect(db.listAuditForTrip(first.trip.trip_id)).toHaveLength(1);

    const changed = await preview({ itemText: 'Renamed museum visit' });
    expect(changed.source_fingerprint).not.toBe(snapshot.source_fingerprint);
    expect(() => service.importPreview(changed, APPROVAL)).toThrow(ExternalImportConflictError);
    expect(db.getTrip(first.trip.trip_id)!.version).toBe(1);
    expect(db.listAuditForTrip(first.trip.trip_id)).toHaveLength(1);
  });

  it('refuses to import when no day carries a resolvable date', async () => {
    const snapshot = await previewFromSource(tripFixture({ allDaysUndated: true }));
    const { db, service } = serviceWith();

    expect(() => service.importPreview(snapshot, APPROVAL)).toThrow(ExternalImportConflictError);
    expect(db.getTrip(snapshot.mapped_trip_id)).toBeUndefined();
    expect(db.listAuditForTrip(snapshot.mapped_trip_id)).toEqual([]);
  });

  it('rejects previews that do not match the read-only, instance-scoped preview contract', async () => {
    const { db, service } = serviceWith();

    const forgedTrip = await preview();
    expect(() =>
      service.importPreview(
        { ...forgedTrip, mapped_trip_id: '11111111-1111-5111-9111-111111111111' },
        APPROVAL
      )
    ).toThrow(ExternalImportPreviewError);

    const persisted = await preview();
    expect(() => service.importPreview({ ...persisted, persisted: true }, APPROVAL))
      .toThrow(ExternalImportPreviewError);

    const estimated = await preview();
    expect(() => service.importPreview({ ...estimated, live: false }, APPROVAL))
      .toThrow(ExternalImportPreviewError);

    const forgedItem = await preview();
    forgedItem.days[0]!.items[0]!.mapped_item_id = '22222222-2222-4222-8222-222222222222';
    expect(() => service.importPreview(forgedItem, APPROVAL)).toThrow(ExternalImportPreviewError);

    const unknownPlace = await preview();
    unknownPlace.days[0]!.items[0]!.mapped_place_id = '33333333-3333-4333-8333-333333333333';
    expect(() => service.importPreview(unknownPlace, APPROVAL)).toThrow(ExternalImportPreviewError);

    expect(db.getTrip(forgedTrip.mapped_trip_id)).toBeUndefined();
  });

  it('keeps user-owned place metadata instead of overwriting it with provider data', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();
    const sourcePlace = snapshot.places[0]!;
    db.savePlace({
      place_id: sourcePlace.place_id,
      name: sourcePlace.name,
      categories: ['museum'],
      location: { lat: 25, lng: 121 },
      source: { provider: 'trip', source_id: '8' },
      user_metadata: { notes: 'Operator edited note', priority: 'must_visit' }
    });

    service.importPreview(snapshot, APPROVAL);
    expect(db.getPlace(sourcePlace.place_id)!.user_metadata).toEqual({
      notes: 'Operator edited note',
      priority: 'must_visit'
    });
  });

  it('records the import provenance in the immutable first trip version', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();
    const report = service.importPreview(snapshot, APPROVAL);
    const trip = db.getTrip(report.trip.trip_id)!;

    expect(db.getTrip(trip.trip_id, 1)!.import_source).toEqual(trip.import_source);
    expect(db.listAuditForTrip(trip.trip_id)[0]!.created_at).toBe(trip.import_source!.imported_at);
  });

  it('stays inside the canonical trip schema, which forbids unknown fields', async () => {
    const snapshot = await preview();
    const { db, service } = serviceWith();
    const report = service.importPreview(snapshot, APPROVAL);
    const trip = db.getTrip(report.trip.trip_id)!;

    type ObjectSchema = {
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/trip.schema.json', import.meta.url), 'utf8')
    ) as ObjectSchema;
    const findWith = (node: unknown, property: string): ObjectSchema | undefined => {
      if (!node || typeof node !== 'object') return undefined;
      const candidate = node as ObjectSchema;
      if (candidate.properties && property in candidate.properties) return candidate;
      for (const value of Object.values(node as Record<string, unknown>)) {
        const nested = Array.isArray(value)
          ? value.map((entry) => findWith(entry, property)).find((entry) => entry !== undefined)
          : findWith(value, property);
        if (nested) return nested;
      }
      return undefined;
    };

    const tripSchema = findWith(schema, 'import_source')!;
    const itemSchema = findWith(schema, 'item_id')!;
    expect(tripSchema.additionalProperties).toBe(false);
    expect(itemSchema.additionalProperties).toBe(false);

    const tripKeys = new Set(Object.keys(tripSchema.properties));
    for (const key of Object.keys(trip)) expect(tripKeys.has(key)).toBe(true);

    const itemKeys = new Set(Object.keys(itemSchema.properties));
    for (const day of trip.days) {
      for (const item of day.items) {
        for (const key of Object.keys(item)) expect(itemKeys.has(key)).toBe(true);
      }
    }
  });
});