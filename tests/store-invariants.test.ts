import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { MemoryStore } from '../src/store/memory-store.js';

const FLIGHT_RESERVATION_ID = '44444444-4444-4444-8444-444444444444';

describe('MemoryStore trip invariants', () => {
  it('rejects an unlocked item that references a fixed reservation', () => {
    const db = new MemoryStore();
    const trip = db.getTrip(demoTripId)!;

    trip.version += 1;
    trip.days[0]!.items.push({
      item_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      type: 'reservation',
      reservation_id: FLIGHT_RESERVATION_ID,
      title: 'Injected fixed flight reference',
      start_at: '2026-10-20T07:20:00+08:00',
      end_at: '2026-10-20T11:35:00+09:00',
      locked: false
    });

    expect(() => db.saveTrip(trip)).toThrow(/fixed reservation.*not locked/i);
  });

  it('rejects timing changes to a fixed reservation even if the item remains locked', () => {
    const db = new MemoryStore();
    const trip = db.getTrip(demoTripId)!;
    const flight = trip.days[0]!.items.find((item) => item.reservation_id === FLIGHT_RESERVATION_ID)!;

    trip.version += 1;
    flight.start_at = '2026-10-20T08:20:00+08:00';

    expect(() => db.saveTrip(trip)).toThrow(/cannot change start time/i);
  });

  it('rejects dangling reservation references', () => {
    const db = new MemoryStore();
    const trip = db.getTrip(demoTripId)!;

    trip.version += 1;
    trip.days[0]!.items.push({
      item_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      type: 'reservation',
      reservation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Unknown booking',
      locked: false
    });

    expect(() => db.saveTrip(trip)).toThrow(/unknown reservation/i);
  });
});
