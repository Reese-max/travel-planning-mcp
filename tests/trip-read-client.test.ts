import { describe, expect, it, vi } from 'vitest';
import { TripReadClient, tripExternalId } from '../src/adapters/trip-read-client.js';
import { registerTripReadTools, tripClientFromEnv } from '../src/mcp/trip-tools.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function fixture() {
  const place = { id: 8, name: 'Demo museum', lat: 25, lng: 121, place: 'Synthetic address',
    category: { id: 1, name: 'Museum' }, favorite: true, visited: false };
  return { id: 12, name: 'Synthetic trip', archived: false, currency: 'TWD', places: [place],
    notes: 'PRIVATE-NOTE', collaborators: [{ user: 'PRIVATE-USER' }],
    attachments: [{ url: 'https://private.invalid/PRIVATE-TICKET' }], days: [{
      id: 20, label: 'Arrival', dt: '2026-10-20' as string | null,
      items: [{ id: 30, day_id: 20, text: 'Booked museum', time: '09' as string | null,
        status: 'booked', place, comment: 'PRIVATE-COMMENT' }],
      bookings: [{ id: 40, day_id: 20, label: 'Hotel', type: 'hotel', reference: 'PRIVATE-PNR', notes: 'PRIVATE-BOOKING' }]
    }] };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
function setup(response: Response = json(fixture()), extra: Partial<ConstructorParameters<typeof TripReadClient>[0]> = {}) {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response);
  const client = new TripReadClient({ baseUrl: 'https://trip.example.test', apiToken: 'TEST-SECRET',
    instanceId: 'primary', fetchImpl: request, ...extra });
  return { client, request };
}

describe('TRIP read-only integration', () => {
  it('uses GET with a server-side header and refuses redirects', async () => {
    const { client, request } = setup();
    const preview = await client.previewTrip(12);
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe('https://trip.example.test/api/trips/12');
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({ 'X-Api-Token': 'TEST-SECRET' });
    expect(preview).toMatchObject({ mode: 'read_preview_only', live: true, persisted: false,
      writeback_supported: false, fingerprint_is_atomic_version: false });
  });
  it('keeps stable instance-scoped canonical ID mappings', () => {
    const first = tripExternalId('primary', 'place', 8);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).toBe(tripExternalId('primary', 'place', 8));
    expect(first).not.toBe(tripExternalId('other', 'place', 8));
    expect(first).not.toBe(tripExternalId('primary', 'trip', 8));
  });
  it('preserves unknown date/time semantics and does not invent a Reservation', async () => {
    const source = fixture(); source.days[0]!.dt = null;
    const preview = await setup(json(source)).client.previewTrip(12);
    expect(preview.days[0]?.date).toBeNull();
    expect(preview.days[0]?.items[0]).toMatchObject({ local_time: '09:00', timezone: null, locked: true });
    expect(preview.days[0]?.items[0]).not.toHaveProperty('start_at');
    expect(preview.days[0]?.unresolved_bookings[0]).toMatchObject({ fixed: true });
    expect(preview.issues.map((issue) => issue.code)).toContain('BOOKING_TIMING_UNKNOWN');
    expect(preview.issues.map((issue) => issue.code)).toContain('MISSING_DATE');
    expect(preview).not.toHaveProperty('reservations');
  });
  it('does not expose reservation references, notes, attachments, or user identities', async () => {
    const serialized = JSON.stringify(await setup().client.previewTrip(12));
    expect(serialized).not.toContain('PRIVATE-');
    expect(serialized).not.toContain('TEST-SECRET');
  });
  it('fingerprints snapshots deterministically without turning them into a version', async () => {
    const source = fixture();
    const reversed = Object.fromEntries(Object.entries(source).reverse());
    const a = await setup(json(source)).client.previewTrip(12);
    const b = await setup(json(reversed)).client.previewTrip(12);
    expect(a.source_fingerprint).toBe(b.source_fingerprint);
    source.days[0]!.bookings[0]!.reference = 'CHANGED';
    const c = await setup(json(source)).client.previewTrip(12);
    expect(c.source_fingerprint).not.toBe(a.source_fingerprint);
  });
  it('rejects duplicate item identifiers', async () => {
    const source = fixture(); source.days[0]!.items.push({ ...source.days[0]!.items[0]! });
    await expect(setup(json(source)).client.previewTrip(12)).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
  });
  it('rejects inconsistent parent relations', async () => {
    const source = fixture(); source.days[0]!.items[0]!.day_id = 99;
    await expect(setup(json(source)).client.previewTrip(12)).rejects.toMatchObject({ code: 'DAY_MISMATCH' });
  });
  it('rejects a different returned trip identity', async () => {
    await expect(setup().client.previewTrip(13)).rejects.toMatchObject({ code: 'IDENTITY' });
  });
  it('does not silently normalize conflicting copies of a place', async () => {
    const source = fixture();
    source.days[0]!.items[0]!.place = { ...source.places[0]!, lat: 24 };
    await expect(setup(json(source)).client.previewTrip(12)).rejects.toMatchObject({ code: 'INCONSISTENT_PLACE' });
  });
  it('rejects invalid upstream times with a sanitized schema error', async () => {
    const source = fixture(); source.days[0]!.items[0]!.time = '27:90';
    await expect(setup(json(source)).client.previewTrip(12)).rejects.toMatchObject({ code: 'SCHEMA' });
  });
  it('fails closed on a missing detail response', async () => {
    await expect(setup(json({})).client.previewTrip(12)).rejects.toMatchObject({ code: 'SCHEMA' });
  });
  it('supports response paging without publishing collaborator payloads', async () => {
    const rows = [1, 2, 3].map((n) => ({ id: n, name: `Trip ${n}`, archived: false, days: n,
      collaborators: [{ user: 'PRIVATE-USER' }] }));
    const page = await setup(json(rows)).client.listTrips(1, 1);
    expect(page.trips).toHaveLength(1); expect(page.trips[0]?.external_trip_id).toBe(2);
    expect(page.next_offset).toBe(2); expect(JSON.stringify(page)).not.toContain('PRIVATE-USER');
  });
  it('rejects invalid IDs before any network operation', async () => {
    const { client, request } = setup();
    await expect(client.previewTrip(-1)).rejects.toMatchObject({ code: 'INPUT' });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not echo upstream error bodies', async () => {
    await expect(setup(json({ detail: 'TEST-SECRET' }, 401)).client.previewTrip(12))
      .rejects.toMatchObject({ code: 'HTTP_401', message: 'TRIP returned HTTP 401.' });
  });
  it('rejects non-JSON responses', async () => {
    await expect(setup(new Response('<html>PRIVATE</html>')).client.previewTrip(12))
      .rejects.toMatchObject({ code: 'CONTENT_TYPE' });
  });
  it('enforces the streamed body limit', async () => {
    await expect(setup(json(fixture()), { maxBytes: 20 }).client.previewTrip(12))
      .rejects.toMatchObject({ code: 'TOO_LARGE' });
  });
  it('bounds request duration and sanitizes network errors', async () => {
    const { client, request } = setup(json({}), { timeoutMs: 5 });
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('TEST-SECRET')), { once: true });
    }));
    await expect(client.previewTrip(12)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it.each(['http://trip.example.test', 'https://user:password@example.test',
    'https://example.test?token=secret', 'file:///tmp/trip', 'https://example.test/#secret'])
  ('refuses unsafe configuration %s', (baseUrl) => {
    expect(() => setup(json({}), { baseUrl })).toThrow();
  });
  it('allows explicit loopback development and a configured reverse-proxy path', async () => {
    const { client, request } = setup(json(fixture()), { baseUrl: 'http://127.0.0.1:8080/travel/' });
    await client.previewTrip(12);
    expect(String(request.mock.calls[0]![0])).toBe('http://127.0.0.1:8080/travel/api/trips/12');
  });
  it('is disabled without config and refuses partial config', () => {
    expect(tripClientFromEnv({})).toBeUndefined();
    expect(() => tripClientFromEnv({ TRIP_API_URL: 'http://localhost:8080' })).toThrow(/together/);
  });
  it('registers exactly two read-only tools and no upstream mutation tools', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    const spy = vi.spyOn(server, 'registerTool');
    registerTripReadTools(server, setup().client);
    expect(spy.mock.calls.map((call) => call[0])).toEqual(['list_external_trip_trips', 'get_external_trip_preview']);
    for (const call of spy.mock.calls) expect(call[1].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });
});
