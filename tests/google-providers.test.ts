import { describe, expect, it, vi } from 'vitest';
import { GooglePlaceProvider } from '../src/adapters/google-place-provider.js';
import { GoogleRouteProvider } from '../src/adapters/google-route-provider.js';
import { MemoryStore } from '../src/store/memory-store.js';

describe('Google provider adapters', () => {
  it('normalizes and persists Google Places Text Search results', async () => {
    const db = new MemoryStore();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: 'google-place-123',
              displayName: { text: 'Tokyo Tower', languageCode: 'en' },
              formattedAddress: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
              primaryType: 'tourist_attraction',
              types: ['tourist_attraction', 'point_of_interest'],
              location: { latitude: 35.6586, longitude: 139.7454 }
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const provider = new GooglePlaceProvider('test-key', db, fetchImpl);
    const result = await provider.search({ query: 'Tokyo Tower', limit: 5 });

    expect(result.provider.live).toBe(true);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]?.external_ids?.google_place_id).toBe('google-place-123');
    expect(result.places[0]?.source.provider).toBe('google-places-new');
    expect(result.places[0]?.place_id).toMatch(/^[0-9a-f-]{36}$/);

    const stored = db.getPlace(result.places[0]!.place_id);
    expect(stored?.name).toBe('Tokyo Tower');

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-fieldmask']).toContain('places.id');
    expect(JSON.parse(String(init.body))).toEqual({ textQuery: 'Tokyo Tower', maxResultCount: 5 });
  });

  it('maps canonical places to Google Routes coordinates and normalizes duration', async () => {
    const db = new MemoryStore();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          routes: [{ distanceMeters: 4200, duration: '900s' }]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const provider = new GoogleRouteProvider('test-key', db, fetchImpl);
    const result = await provider.calculate({
      from_place_id: '22222222-2222-4222-8222-222222222222',
      to_place_id: '33333333-3333-4333-8333-333333333333',
      mode: 'transit'
    });

    expect(result.source).toBe('google-routes-v2');
    expect(result.distance_meters).toBe(4200);
    expect(result.duration_minutes).toBe(15);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.travelMode).toBe('TRANSIT');
  });

  it('fails clearly on upstream HTTP errors', async () => {
    const db = new MemoryStore();
    const fetchImpl = vi.fn(async () => new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch;
    const provider = new GooglePlaceProvider('test-key', db, fetchImpl);

    await expect(provider.search({ query: 'Tokyo', limit: 5 })).rejects.toThrow(/429/);
  });
});
