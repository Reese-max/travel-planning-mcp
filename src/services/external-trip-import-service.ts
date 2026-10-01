import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { tripExternalId } from '../adapters/trip-read-client.js';
import type { Place, Trip, TripItem } from '../domain/types.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

/**
 * Canonical import of an external trip snapshot.
 *
 * The flow is: read -> normalize -> preview -> explicit import approval ->
 * canonical trip v1. The AI/MCP surface stays read-only, so an import can only
 * be requested by an operator holding the separate approval credential.
 *
 * Nothing is inferred: unresolved source dates, timezones and booking times are
 * reported as unresolved instead of being defaulted into canonical fields, and
 * TRIP bookings never become Reservations because they carry no start time.
 */

const placeSchema = z.object({
  place_id: z.string().uuid(),
  name: z.string().min(1).max(20_000),
  categories: z.array(z.string().min(1).max(500)).max(50),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().max(2_000).nullable().optional(),
    country_code: z.string().max(8).nullable().optional(),
    timezone: z.string().max(200).nullable().optional()
  }),
  external_ids: z.record(z.string(), z.string().nullable()).optional(),
  source: z.object({
    provider: z.string().min(1).max(80),
    source_id: z.string().nullable().optional(),
    retrieved_at: z.string().nullable().optional()
  }),
  user_metadata: z
    .object({
      priority: z.enum(['must_visit', 'high', 'normal', 'low', 'avoid']).optional(),
      visited: z.boolean().optional(),
      favorite: z.boolean().optional(),
      notes: z.string().nullable().optional(),
      tags: z.array(z.string().min(1).max(200)).optional()
    })
    .optional()
});

const previewItemSchema = z.object({
  external_item_id: z.number().int().positive().safe(),
  mapped_item_id: z.string().uuid(),
  title: z.string().min(1).max(20_000),
  mapped_place_id: z.string().uuid().nullable(),
  local_date: z.iso.date().nullable(),
  local_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  timezone: z.string().min(1).max(200).nullable(),
  coordinates: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable(),
  locked: z.boolean(),
  source_status: z.string().max(200).nullable()
});

const previewBookingSchema = z.object({
  external_booking_id: z.number().int().positive().safe(),
  mapped_reservation_id: z.string().uuid(),
  title: z.string().min(1).max(20_000),
  source_type: z.string().min(1).max(200),
  fixed: z.boolean(),
  local_date: z.iso.date().nullable()
});

const previewDaySchema = z.object({
  external_day_id: z.number().int().positive().safe(),
  label: z.string().min(1).max(500),
  date: z.iso.date().nullable(),
  items: z.array(previewItemSchema).max(2_000),
  unresolved_bookings: z.array(previewBookingSchema).max(2_000)
});

const previewSchema = z.object({
  provider: z.literal('trip'),
  instance_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  live: z.literal(true),
  retrieved_at: z.iso.datetime(),
  source_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  fingerprint_is_atomic_version: z.literal(false),
  persisted: z.literal(false),
  writeback_supported: z.literal(false),
  mode: z.literal('read_preview_only'),
  external_trip_id: z.number().int().positive().safe(),
  mapped_trip_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  archived: z.boolean().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  places: z.array(placeSchema).max(5_000),
  days: z.array(previewDaySchema).max(366),
  issues: z
    .array(
      z.object({
        code: z.string().min(1).max(80),
        source_id: z.number().int().safe(),
        message: z.string().max(2_000)
      })
    )
    .max(2_000),
  warnings: z.array(z.string().max(2_000)).max(200)
});

export type ExternalTripPreview = z.infer<typeof previewSchema>;
type PreviewItem = z.infer<typeof previewItemSchema>;

export interface ExternalImportApproval {
  /** Operator identity recorded in the audit trail; never supplied by an AI client. */
  actorId: string;
  /** Canonical Trip requires a traveler, so the operator names one explicitly. */
  travelerDisplayName: string;
  note?: string;
}

export interface ImportUnresolvedField {
  field: string;
  code: string;
  detail: string;
}

/** Unresolved source data is reported, not guessed; the list is capped and counted. */
const MAX_REPORTED_UNRESOLVED_FIELDS = 100;

interface UnresolvedReport {
  fields: ImportUnresolvedField[];
  total: number;
  unresolved_days: number;
  unresolved_bookings: number;
  merged_days: number;
}

function collectUnresolved(snapshot: ExternalTripPreview): UnresolvedReport {
  const all: ImportUnresolvedField[] = [];
  let unresolvedBookings = 0;
  let mergedDays = 0;
  const datedDayCount = new Map<string, number>();

  for (const day of snapshot.days) {
    if (day.date === null) {
      all.push({
        field: `day:${day.external_day_id}.date`,
        code: 'MISSING_DATE',
        detail: 'Source day has no date; the day was not imported and no date was inferred.'
      });
      for (const item of day.items) {
        all.push({
          field: `item:${item.external_item_id}`,
          code: 'MISSING_DATE',
          detail: 'Item belongs to an undated day; it was not imported and no date was inferred.'
        });
      }
    } else {
      const seen = datedDayCount.get(day.date) ?? 0;
      datedDayCount.set(day.date, seen + 1);
      if (seen > 0) mergedDays += 1;
    }
    for (const booking of day.unresolved_bookings) {
      unresolvedBookings += 1;
      all.push({
        field: `booking:${booking.external_booking_id}`,
        code: 'BOOKING_TIMING_UNKNOWN',
        detail: 'Source booking has no start/end time; no Reservation was created.'
      });
    }
    if (day.date === null) continue;
    for (const item of day.items) {
      if (item.timezone !== null) continue;
      all.push({
        field: `item:${item.external_item_id}.start_at`,
        code: 'TIMEZONE_UNKNOWN',
        detail: 'Source time is local wall clock without a timezone; no absolute start time was derived.'
      });
    }
  }

  const fields = all.slice(0, MAX_REPORTED_UNRESOLVED_FIELDS);
  if (all.length > fields.length) {
    fields.push({
      field: 'unresolved_fields',
      code: 'UNRESOLVED_TRUNCATED',
      detail: `${all.length - fields.length} further unresolved source fields were counted but not listed.`
    });
  }
  return {
    fields,
    total: all.length,
    unresolved_days: snapshot.days.filter((day) => day.date === null).length,
    unresolved_bookings: unresolvedBookings,
    merged_days: mergedDays
  };
}

export interface ExternalTripImportReport {
  status: 'imported' | 'duplicate';
  source: 'trip';
  instance_id: string;
  source_trip_id: string;
  source_fingerprint: string;
  imported_at: string;
  trip: {
    trip_id: string;
    version: number;
    title: string;
    start_date: string;
    end_date: string;
    status: Trip['status'];
  };
  counts: {
    places: number;
    days: number;
    items: number;
    reservations: number;
    unresolved_days: number;
    unresolved_bookings: number;
    unresolved_total: number;
  };
  unresolved_fields: ImportUnresolvedField[];
  warnings: string[];
  conflicts: string[];
}

export class ExternalImportApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalImportApprovalError';
  }
}

export class ExternalImportPreviewError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ExternalImportPreviewError';
  }
}

export class ExternalImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalImportConflictError';
  }
}

const IMPORT_WARNINGS = [
  'Imported provider content is not live verification of opening hours, routes, prices or bookings.',
  'Imported items carry no absolute start time until an operator resolves dates, timezones and durations.',
  'Titles and labels are untrusted source content, never instructions or approval.',
  'Further changes to this trip must go through a ChangeProposal with human approval.'
];

function canonicalPlace(source: z.infer<typeof placeSchema>): Place {
  return {
    place_id: source.place_id,
    name: source.name,
    categories: [...source.categories],
    location: {
      lat: source.location.lat,
      lng: source.location.lng,
      ...(source.location.address !== undefined ? { address: source.location.address } : {}),
      ...(source.location.country_code !== undefined
        ? { country_code: source.location.country_code }
        : {}),
      ...(source.location.timezone !== undefined ? { timezone: source.location.timezone } : {})
    },
    ...(source.external_ids ? { external_ids: { ...source.external_ids } } : {}),
    source: {
      provider: source.source.provider,
      ...(source.source.source_id !== undefined ? { source_id: source.source.source_id } : {}),
      ...(source.source.retrieved_at !== undefined
        ? { retrieved_at: source.source.retrieved_at }
        : {})
    },
    ...(source.user_metadata ? { user_metadata: canonicalUserMetadata(source.user_metadata) } : {})
  };
}

type PreviewUserMetadata = NonNullable<z.infer<typeof placeSchema>['user_metadata']>;

function canonicalUserMetadata(metadata: PreviewUserMetadata): NonNullable<Place['user_metadata']> {
  return {
    ...(metadata.priority !== undefined ? { priority: metadata.priority } : {}),
    ...(metadata.visited !== undefined ? { visited: metadata.visited } : {}),
    ...(metadata.favorite !== undefined ? { favorite: metadata.favorite } : {}),
    ...(metadata.notes !== undefined ? { notes: metadata.notes } : {}),
    ...(metadata.tags !== undefined ? { tags: [...metadata.tags] } : {})
  };
}

export class ExternalTripImportService {
  constructor(private readonly db: TravelStore = store) {}

  importPreview(preview: unknown, approval: ExternalImportApproval): ExternalTripImportReport {
    const actorId = approval.actorId?.trim() ?? '';
    const travelerDisplayName = approval.travelerDisplayName?.trim() ?? '';
    if (!actorId || !travelerDisplayName) {
      throw new ExternalImportApprovalError(
        'External trip import requires an explicit operator approval with actor_id and traveler_display_name.'
      );
    }

    const parsed = previewSchema.safeParse(preview);
    if (!parsed.success) {
      throw new ExternalImportPreviewError(
        'PREVIEW_CONTRACT',
        'Preview does not match the read-only external trip preview contract.'
      );
    }
    const snapshot = parsed.data;
    this.assertSnapshotIntegrity(snapshot);

    const existing = this.db.getTrip(snapshot.mapped_trip_id);
    if (existing) {
      const importedFingerprint = existing.import_source?.source_fingerprint;
      if (importedFingerprint !== snapshot.source_fingerprint) {
        throw new ExternalImportConflictError(
          `Canonical trip ${snapshot.mapped_trip_id} was imported from a different TRIP snapshot; a changed source must be reviewed explicitly instead of silently re-imported.`
        );
      }
      return this.duplicateReport(snapshot, existing);
    }

    const datedDays = snapshot.days.filter((day): day is typeof day & { date: string } => day.date !== null);
    if (datedDays.length === 0) {
      throw new ExternalImportConflictError(
        `TRIP trip ${snapshot.external_trip_id} has no day with a resolvable date; refusing to invent a travel window.`
      );
    }
    const unresolved = collectUnresolved(snapshot);

    // Places are written before the trip on purpose: an orphaned provider place is a
    // harmless leftover that a retry repairs, while a trip referencing missing places
    // would not be. A durable TravelStore must still wrap these writes transactionally.
    for (const place of snapshot.places) {
      if (!this.db.getPlace(place.place_id)) this.db.savePlace(canonicalPlace(place));
    }

    const dates = [...new Set(datedDays.map((day) => day.date))].sort();
    const startDate = dates[0]!;
    const endDate = dates[dates.length - 1]!;
    const importedAt = new Date().toISOString();

    // The canonical model has one day per date, so same-dated source days are merged
    // instead of producing a trip the validator would permanently reject.
    const itemsByDate = new Map<string, TripItem[]>();
    for (const day of datedDays) {
      const items = itemsByDate.get(day.date) ?? [];
      for (const item of day.items) items.push(this.canonicalItem(item, day.date));
      itemsByDate.set(day.date, items);
    }
    const itemCount = [...itemsByDate.values()].reduce((total, items) => total + items.length, 0);
    const days = dates.map((date) => ({ date, items: itemsByDate.get(date) ?? [] }));

    const trip: Trip = {
      trip_id: snapshot.mapped_trip_id,
      version: 1,
      title: snapshot.title,
      description: null,
      start_date: startDate,
      end_date: endDate,
      status: snapshot.archived ? 'archived' : 'draft',
      travelers: [
        { traveler_id: randomUUID(), display_name: travelerDisplayName, role: 'owner' }
      ],
      ...(snapshot.currency ? { preferences: { currency: snapshot.currency } } : {}),
      place_ids: snapshot.places.map((place) => place.place_id),
      reservation_ids: [],
      constraint_ids: [],
      days,
      change_proposal_ids: [],
      created_at: importedAt,
      updated_at: importedAt,
      import_source: {
        provider: snapshot.provider,
        instance_id: snapshot.instance_id,
        source_trip_id: String(snapshot.external_trip_id),
        source_fingerprint: snapshot.source_fingerprint,
        live: true,
        preview_retrieved_at: snapshot.retrieved_at,
        imported_at: importedAt,
        imported_by: actorId,
        approved_by: actorId,
        approved_at: importedAt,
        approval_channel: 'http',
        ...(approval.note ? { note: approval.note } : {})
      }
    };
    this.db.saveTrip(trip, false);

    const unresolvedBookings = snapshot.days.reduce(
      (total, day) => total + day.unresolved_bookings.length,
      0
    );
    const mergedDays = unresolved.merged_days;
    this.db.appendAudit({
      event_id: randomUUID(),
      event_type: 'external_trip_imported',
      trip_id: trip.trip_id,
      actor_type: 'operator',
      actor_id: actorId,
      created_at: importedAt,
      metadata: {
        source: snapshot.provider,
        instance_id: snapshot.instance_id,
        source_trip_id: String(snapshot.external_trip_id),
        source_fingerprint: snapshot.source_fingerprint,
        imported_at: importedAt,
        approved_by: actorId,
        places: snapshot.places.length,
        days: days.length,
        source_days: datedDays.length,
        items: itemCount,
        reservations: 0,
        unresolved_days: snapshot.days.length - datedDays.length,
        unresolved_bookings: unresolved.unresolved_bookings
      }
    });

    const mergedDayWarnings =
      mergedDays > 0
        ? [
            `${mergedDays} source day(s) shared a date with another day; their items were merged into one canonical day.`
          ]
        : [];

    return {
      status: 'imported',
      source: snapshot.provider,
      instance_id: snapshot.instance_id,
      source_trip_id: String(snapshot.external_trip_id),
      source_fingerprint: snapshot.source_fingerprint,
      imported_at: importedAt,
      trip: {
        trip_id: trip.trip_id,
        version: trip.version,
        title: trip.title,
        start_date: trip.start_date,
        end_date: trip.end_date,
        status: trip.status
      },
      counts: {
        places: snapshot.places.length,
        days: days.length,
        items: itemCount,
        reservations: 0,
        unresolved_days: snapshot.days.length - datedDays.length,
        unresolved_bookings: unresolved.unresolved_bookings,
        unresolved_total: unresolved.total
      },
      unresolved_fields: unresolved.fields,
      warnings: [...IMPORT_WARNINGS, ...mergedDayWarnings],
      conflicts: []
    };
  }

  private canonicalItem(item: PreviewItem, date: string): TripItem {
    return {
      item_id: item.mapped_item_id,
      type: item.mapped_place_id ? 'place' : 'note',
      ...(item.mapped_place_id ? { place_id: item.mapped_place_id } : {}),
      title: item.title,
      start_at: null,
      end_at: null,
      locked: item.locked,
      route: null,
      source_timing: {
        provider: 'trip',
        source_id: String(item.external_item_id),
        local_date: date,
        local_time: item.local_time,
        timezone: item.timezone
      }
    };
  }

  private duplicateReport(
    snapshot: ExternalTripPreview,
    existing: Trip
  ): ExternalTripImportReport {
    // Unresolved counts describe the source snapshot, so both paths report the same
    // numbers; canonical counts describe the stored trip, which may have moved on.
    const unresolved = collectUnresolved(snapshot);
    return {
      status: 'duplicate',
      source: snapshot.provider,
      instance_id: snapshot.instance_id,
      source_trip_id: String(snapshot.external_trip_id),
      source_fingerprint: snapshot.source_fingerprint,
      imported_at: existing.import_source?.imported_at ?? existing.created_at,
      trip: {
        trip_id: existing.trip_id,
        version: existing.version,
        title: existing.title,
        start_date: existing.start_date,
        end_date: existing.end_date,
        status: existing.status
      },
      counts: {
        places: existing.place_ids?.length ?? 0,
        days: existing.days.length,
        items: existing.days.reduce((total, day) => total + day.items.length, 0),
        reservations: existing.reservation_ids?.length ?? 0,
        unresolved_days: unresolved.unresolved_days,
        unresolved_bookings: unresolved.unresolved_bookings,
        unresolved_total: unresolved.total
      },
      unresolved_fields: unresolved.fields,
      warnings: [
        ...IMPORT_WARNINGS,
        'This source snapshot was already imported; no second canonical trip was created.'
      ],
      conflicts: []
    };
  }

  /** Provider output is untrusted input: identity mappings must be re-derived, never trusted. */
  private assertSnapshotIntegrity(snapshot: ExternalTripPreview): void {
    if (snapshot.mapped_trip_id !== tripExternalId(snapshot.instance_id, 'trip', snapshot.external_trip_id)) {
      throw new ExternalImportPreviewError(
        'IDENTITY_MISMATCH',
        'Preview trip mapping does not match the operator-configured TRIP instance.'
      );
    }

    const placeIds = new Set<string>();
    for (const place of snapshot.places) {
      if (placeIds.has(place.place_id)) {
        throw new ExternalImportPreviewError('DUPLICATE_ID', 'Preview contains a duplicate place ID.');
      }
      placeIds.add(place.place_id);
      if (place.source.provider !== snapshot.provider) {
        throw new ExternalImportPreviewError(
          'SOURCE_MISMATCH',
          'Preview place is attributed to a different provider.'
        );
      }
      const tripPlaceId = place.external_ids?.trip_place_id;
      if (tripPlaceId !== undefined && tripPlaceId !== null) {
        const external = Number(tripPlaceId);
        if (
          !Number.isSafeInteger(external) ||
          external <= 0 ||
          place.place_id !== tripExternalId(snapshot.instance_id, 'place', external)
        ) {
          throw new ExternalImportPreviewError(
            'IDENTITY_MISMATCH',
            'Preview place mapping does not match the operator-configured TRIP instance.'
          );
        }
      }
    }

    const dayIds = new Set<number>();
    const itemIds = new Set<string>();
    const bookingIds = new Set<number>();
    for (const day of snapshot.days) {
      if (dayIds.has(day.external_day_id)) {
        throw new ExternalImportPreviewError('DUPLICATE_ID', 'Preview contains a duplicate day ID.');
      }
      dayIds.add(day.external_day_id);
      for (const item of day.items) {
        if (itemIds.has(item.mapped_item_id)) {
          throw new ExternalImportPreviewError('DUPLICATE_ID', 'Preview contains a duplicate item ID.');
        }
        itemIds.add(item.mapped_item_id);
        if (item.mapped_item_id !== tripExternalId(snapshot.instance_id, 'item', item.external_item_id)) {
          throw new ExternalImportPreviewError(
            'IDENTITY_MISMATCH',
            'Preview item mapping does not match the operator-configured TRIP instance.'
          );
        }
        if (item.mapped_place_id !== null && !placeIds.has(item.mapped_place_id)) {
          throw new ExternalImportPreviewError(
            'UNKNOWN_REFERENCE',
            'Preview item references a place that the snapshot does not contain.'
          );
        }
        if (item.local_date !== null && item.local_date !== day.date) {
          throw new ExternalImportPreviewError(
            'INCONSISTENT_DAY',
            'Preview item date does not match its day date.'
          );
        }
      }
      for (const booking of day.unresolved_bookings) {
        if (bookingIds.has(booking.external_booking_id)) {
          throw new ExternalImportPreviewError('DUPLICATE_ID', 'Preview contains a duplicate booking ID.');
        }
        bookingIds.add(booking.external_booking_id);
        if (
          booking.mapped_reservation_id !==
          tripExternalId(snapshot.instance_id, 'reservation', booking.external_booking_id)
        ) {
          throw new ExternalImportPreviewError(
            'IDENTITY_MISMATCH',
            'Preview booking mapping does not match the operator-configured TRIP instance.'
          );
        }
      }
    }
  }
}

export const externalTripImportService = new ExternalTripImportService();