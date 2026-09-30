import { describe, expect, it, vi } from 'vitest';
import { GooglePlaceProvider } from '../src/adapters/google-place-provider.js';
import type { Place } from '../src/domain/types.js';
import { MemoryStore } from '../src/store/memory-store.js';

// Issue #6 research fixture. This split is deliberately test-only: production
// Place and TravelStore do not yet support provider-snapshot expiry.
function splitForResearch(place: Place, notes: string) {
  return {
    identity: {
      place_id: place.place_id,
      google_place_id: place.external_ids?.google_place_id,
      user_metadata: { notes, tags: ['planned'], favorite: true }
    },
    provider_snapshot: {
      name: place.name,
      localized_names: place.localized_names,
      categories: place.categories,
      location: place.location,
      source: place.source
    }
  };
}

function fixtureProvider(googleId: string) {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify({
      places: [{
        id: googleId,
        displayName: { text: 'Fixture Museum', languageCode: 'en' },
        formattedAddress: 'Fixture address',
        primaryType: 'museum',
        types: ['museum', 'point_of_interest'],
        location: { latitude: 25.01, longitude: 121.5 }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;
  return { provider: new GooglePlaceProvider('fixture-only', new MemoryStore(), fetchImpl), fetchImpl };
}

describe('Google Places durable-retention research fixture', () => {
  it('preserves exact user itinerary intent when a provider snapshot expires', async () => {
    const { provider, fetchImpl } = fixtureProvider('fixture-google-id-1');
    const result = await provider.search({ query: 'fixture', limit: 1 });
    const normalized = result.places[0]!;
    const split = splitForResearch(normalized, 'Meet here after lunch');
    const tripReferences = {
      place_ids: [normalized.place_id],
      days: [{ items: [{ item_id: 'fixture-item', place_id: normalized.place_id }] }]
    };

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(normalized.location).toEqual({ lat: 25.01, lng: 121.5, address: 'Fixture address' });
    expect(normalized.source.provider).toBe('google-places-new');
    expect(split.provider_snapshot.name).toBe('Fixture Museum');

    const afterExpiry = { ...split, provider_snapshot: null };
    expect(afterExpiry.identity).toEqual({
      place_id: normalized.place_id,
      google_place_id: 'fixture-google-id-1',
      user_metadata: { notes: 'Meet here after lunch', tags: ['planned'], favorite: true }
    });
    expect(tripReferences.place_ids).toEqual([afterExpiry.identity.place_id]);
    expect(tripReferences.days[0]?.items[0]?.place_id).toBe(afterExpiry.identity.place_id);
    expect(JSON.stringify(afterExpiry)).not.toContain('Fixture Museum');
    expect(JSON.stringify(afterExpiry)).not.toContain('Fixture address');
    expect(JSON.stringify(afterExpiry)).not.toContain('25.01');

    const sameIdRefresh = (await fixtureProvider('fixture-google-id-1').provider.search({ query: 'fixture', limit: 1 })).places[0]!;
    const differentId = (await fixtureProvider('fixture-google-id-2').provider.search({ query: 'fixture', limit: 1 })).places[0]!;
    expect(sameIdRefresh.place_id).toBe(afterExpiry.identity.place_id);
    expect(differentId.place_id).not.toBe(afterExpiry.identity.place_id);
  });
});
