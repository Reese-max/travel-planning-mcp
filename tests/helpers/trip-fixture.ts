import { TripReadClient } from '../../src/adapters/trip-read-client.js';

export const TRIP_INSTANCE_ID = 'primary';
export const EXTERNAL_TRIP_ID = 12;

export interface TripFixtureOptions {
  id?: number;
  itemText?: string;
  undatedSecondDay?: boolean;
  allDaysUndated?: boolean;
  sameDateSecondDay?: boolean;
  archived?: boolean;
  extraUndatedDays?: number;
}

/** Synthetic TRIP payload shaped like the pinned upstream contract. */
export function tripFixture(options: TripFixtureOptions = {}): Record<string, unknown> {
  const museum = {
    id: 8,
    name: 'Demo museum',
    lat: 25,
    lng: 121,
    place: 'Synthetic address',
    category: { id: 1, name: 'Museum' },
    favorite: true,
    visited: false
  };
  return {
    id: options.id ?? EXTERNAL_TRIP_ID,
    name: 'Synthetic trip',
    archived: options.archived ?? false,
    currency: 'TWD',
    places: [museum],
    notes: 'PRIVATE-NOTE',
    collaborators: [{ user: 'PRIVATE-USER' }],
    attachments: [{ url: 'https://private.invalid/PRIVATE-TICKET' }],
    days: [
      {
        id: 20,
        label: 'Arrival',
        dt: options.allDaysUndated === true ? null : '2026-10-20',
        items: [
          {
            id: 30,
            day_id: 20,
            text: options.itemText ?? 'Booked museum',
            time: '09',
            status: 'booked',
            place: museum,
            comment: 'PRIVATE-COMMENT'
          }
        ],
        bookings: [
          {
            id: 40,
            day_id: 20,
            label: 'Hotel',
            type: 'hotel',
            reference: 'PRIVATE-PNR',
            notes: 'PRIVATE-BOOKING'
          }
        ]
      },
      {
        id: 21,
        label: 'Unscheduled',
        dt:
          options.allDaysUndated === true || options.undatedSecondDay !== false
            ? null
            : options.sameDateSecondDay === true
              ? '2026-10-20'
              : '2026-10-21',
        items: [{ id: 31, day_id: 21, text: 'Undated idea', time: null, status: 'pending', place: null }],
        bookings: []
      },
      ...Array.from({ length: options.extraUndatedDays ?? 0 }, (_, index) => ({
        id: 1000 + index,
        label: `Bulk undated ${index}`,
        dt: null,
        items: [{ id: 2000 + index, day_id: 1000 + index, text: `Bulk idea ${index}`, time: null, status: 'pending', place: null }],
        bookings: [
          { id: 3000 + index, day_id: 1000 + index, label: `Bulk booking ${index}`, type: 'hotel' }
        ]
      }))
    ]
  };
}

export function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Real read-only adapter output, so the import path consumes production preview data. */
export async function readOnlyPreview(
  options: TripFixtureOptions & { instanceId?: string; externalTripId?: number } = {}
): Promise<Record<string, unknown>> {
  const client = new TripReadClient({
    baseUrl: 'https://trip.example.test',
    apiToken: 'TEST-SECRET',
    instanceId: options.instanceId ?? TRIP_INSTANCE_ID,
    fetchImpl: (async () => jsonResponse(tripFixture(options))) as unknown as typeof fetch
  });
  return (await client.previewTrip(options.externalTripId ?? EXTERNAL_TRIP_ID)) as unknown as Record<
    string,
    unknown
  >;
}