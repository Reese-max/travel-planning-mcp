import { expect, it, vi } from 'vitest';
import { TripReadClient } from '../src/adapters/trip-read-client.js';

function fixture() {
  return {
    id: 12,
    name: 'Synthetic trip',
    archived: false,
    currency: 'TWD',
    places: [{
      id: 8,
      name: 'Demo museum',
      lat: 25,
      lng: 121,
      place: 'Synthetic address',
      category: { name: 'Museum' },
      favorite: true,
      visited: false
    }],
    days: [{
      id: 20,
      label: 'Arrival',
      dt: null,
      items: [{
        id: 30,
        day_id: 20,
        text: 'Booked museum',
        time: '09',
        status: 'booked',
        place: {
          id: 8,
          name: 'Demo museum',
          lat: 25,
          lng: 121,
          place: 'Synthetic address',
          category: { name: 'Museum' },
          favorite: true,
          visited: false
        }
      }],
      bookings: [{
        id: 40,
        day_id: 20,
        label: 'Hotel',
        type: 'hotel',
        reference: 'PRIVATE-PNR',
        notes: 'PRIVATE-BOOKING'
      }]
    }]
  };
}

it('returns an explicit, non-persisting import preview contract', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture()), {
    headers: { 'content-type': 'application/json' }
  }));
  const client = new TripReadClient({
    baseUrl: 'https://trip.example.test',
    apiToken: 'TEST-SECRET',
    instanceId: 'primary',
    fetchImpl: request
  });

  const preview = await client.previewImport(12);

  expect(preview).toMatchObject({
    source: 'trip',
    instance_id: 'primary',
    source_trip_id: 12,
    live: true,
    persisted: false,
    writeback_supported: false,
    fingerprint_is_atomic_version: false,
    canonical_preview: {
      trip_id: expect.any(String),
      title: 'Synthetic trip'
    },
    unresolved_fields: expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_DATE' }),
      expect.objectContaining({ code: 'INCOMPLETE_TIMING' }),
      expect.objectContaining({ code: 'BOOKING_TIMING_UNKNOWN' })
    ]),
    warnings: expect.any(Array),
    conflicts: []
  });
  expect(JSON.stringify(preview)).not.toContain('PRIVATE-');
  expect(JSON.stringify(preview)).not.toContain('TEST-SECRET');
  expect(preview.canonical_preview.days[0].items[0]).toMatchObject({
    local_time: '09:00',
    timezone: null
  });
  expect(preview.canonical_preview.days[0].items[0]).not.toHaveProperty('start_at');
  expect(preview.canonical_preview.days[0].unresolved_bookings[0]).toMatchObject({ fixed: true });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
});
