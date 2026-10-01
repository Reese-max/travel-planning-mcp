import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TripReadClient } from '../src/adapters/trip-read-client.js';
import { demoTripId } from '../src/data/seed.js';
import { createHttpServer } from '../src/http/server.js';
import { EXTERNAL_TRIP_ID, jsonResponse, tripFixture } from './helpers/trip-fixture.js';

const READ_KEY = 'test-read-key';
const APPROVAL_KEY = 'test-approval-key';
const TOKYO_STATION_ID = '22222222-2222-4222-8222-222222222222';
const SENSOJI_ID = '33333333-3333-4333-8333-333333333333';
const FLIGHT_RESERVATION_ID = '44444444-4444-4444-8444-444444444444';

let transport: (options: { id?: number }) => Promise<Response> = async () =>
  jsonResponse(tripFixture());

const tripClient = new TripReadClient({
  baseUrl: 'https://trip.example.test',
  apiToken: 'TEST-SECRET',
  instanceId: 'http-instance',
  fetchImpl: (async (url: URL) =>
    transport({ id: Number(url.pathname.split('/').pop()) })) as unknown as typeof fetch
});

const instance = createHttpServer({
  host: '127.0.0.1',
  port: 0,
  travelApiKey: READ_KEY,
  approvalApiKey: APPROVAL_KEY,
  tripClient
});

let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = instance.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    instance.server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function authorizedFetch(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${READ_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

async function withServer(
  run: (url: string) => Promise<void>
): Promise<void> {
  const extra = createHttpServer({
    host: '127.0.0.1',
    port: 0,
    travelApiKey: READ_KEY,
    approvalApiKey: APPROVAL_KEY
  });
  await new Promise<void>((resolve, reject) => {
    extra.server.once('error', reject);
    extra.server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = extra.server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      extra.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('Travel Planning REST API', () => {
  it('exposes an unauthenticated health endpoint but protects travel data', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      approval_enabled: true,
      providers: {
        places: { id: 'demo-local', live: false },
        routes: { id: 'demo-haversine-estimate', live: false }
      }
    });

    const unauthorized = await fetch(`${baseUrl}/v1/trips`);
    expect(unauthorized.status).toBe(401);

    const authorized = await authorizedFetch('/v1/trips');
    expect(authorized.status).toBe(200);
    const trips = (await authorized.json()) as Array<{ trip_id: string }>;
    expect(trips.some((trip) => trip.trip_id === demoTripId)).toBe(true);
  });

  it('returns aggregate trip context for AI clients', async () => {
    const response = await authorizedFetch(`/v1/trips/${demoTripId}/context`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      trip: { trip_id: string };
      places: unknown[];
      reservations: unknown[];
      constraints: unknown[];
    };
    expect(body.trip.trip_id).toBe(demoTripId);
    expect(body.places.length).toBeGreaterThan(0);
    expect(body.reservations.length).toBeGreaterThan(0);
    expect(body.constraints.length).toBeGreaterThan(0);
  });

  it('exposes normalized provider, place, reservation, constraint, and route context', async () => {
    const providers = await authorizedFetch('/v1/providers');
    expect(providers.status).toBe(200);
    expect(await providers.json()).toMatchObject({
      places: { id: 'demo-local', live: false },
      routes: { id: 'demo-haversine-estimate', live: false }
    });

    const constraints = await authorizedFetch(`/v1/trips/${demoTripId}/constraints`);
    expect(constraints.status).toBe(200);
    expect((await constraints.json()) as { constraints: unknown[] }).toMatchObject({
      constraints: expect.any(Array)
    });

    const search = await authorizedFetch('/v1/places/search?q=Tokyo&limit=5');
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as {
      provider: { id: string; live: boolean };
      places: Array<{ place_id: string }>;
    };
    expect(searchBody.provider).toMatchObject({ id: 'demo-local', live: false });
    expect(searchBody.places.some((place) => place.place_id === TOKYO_STATION_ID)).toBe(true);

    const place = await authorizedFetch(`/v1/places/${SENSOJI_ID}`);
    expect(place.status).toBe(200);
    expect(await place.json()).toMatchObject({ place_id: SENSOJI_ID, name: 'Senso-ji' });

    const reservation = await authorizedFetch(`/v1/reservations/${FLIGHT_RESERVATION_ID}`);
    expect(reservation.status).toBe(200);
    expect(await reservation.json()).toMatchObject({ reservation_id: FLIGHT_RESERVATION_ID, fixed: true });

    const route = await authorizedFetch('/v1/routes/estimate', {
      method: 'POST',
      body: JSON.stringify({
        from_place_id: TOKYO_STATION_ID,
        to_place_id: SENSOJI_ID,
        mode: 'walking'
      })
    });
    expect(route.status).toBe(200);
    expect(await route.json()).toMatchObject({
      from_place_id: TOKYO_STATION_ID,
      to_place_id: SENSOJI_ID,
      mode: 'walking',
      source: 'demo-haversine-estimate'
    });
  });

  it('keeps approval behind a separate operator credential and replays apply safely', async () => {
    const create = await authorizedFetch(`/v1/trips/${demoTripId}/proposals`, {
      method: 'POST',
      headers: { 'idempotency-key': 'create-http-approval-test' },
      body: JSON.stringify({
        actor_id: 'http-test-agent',
        operations: [
          {
            operation: 'update',
            target_type: 'trip_item',
            target_id: '88888888-8888-4888-8888-888888888888',
            to: { notes: 'HTTP approval boundary test' }
          }
        ]
      })
    });
    expect(create.status).toBe(201);
    expect(create.headers.get('idempotent-replayed')).toBe('false');
    const proposal = (await create.json()) as { proposal_id: string };

    const validate = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/validate`, {
      method: 'POST',
      body: '{}'
    });
    expect(validate.status).toBe(200);

    const wrongApproval = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/approve`, {
      method: 'POST',
      headers: { 'x-approval-key': 'wrong-key' },
      body: JSON.stringify({ actor_id: 'reviewer' })
    });
    expect(wrongApproval.status).toBe(401);

    const approve = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/approve`, {
      method: 'POST',
      headers: {
        'x-approval-key': APPROVAL_KEY,
        'idempotency-key': 'approve-http-approval-test'
      },
      body: JSON.stringify({ actor_id: 'reviewer', note: 'Reviewed in test.' })
    });
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as {
      status: string;
      approval?: { actor_id: string; channel: string };
    };
    expect(approved.status).toBe('approved');
    expect(approved.approval).toMatchObject({ actor_id: 'reviewer', channel: 'http' });

    const revalidateApproved = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/validate`, {
      method: 'POST'
    });
    expect(revalidateApproved.status).toBe(409);
    expect(await revalidateApproved.json()).toMatchObject({ error: expect.stringContaining('status is approved') });
    const stillApproved = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}`);
    expect(await stillApproved.json()).toEqual(approved);

    const missingIdempotency = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/apply`, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY },
      body: '{}'
    });
    expect(missingIdempotency.status).toBe(400);
    expect(await missingIdempotency.json()).toMatchObject({ error: 'idempotency_key_required' });

    const apply = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/apply`, {
      method: 'POST',
      headers: {
        'x-approval-key': APPROVAL_KEY,
        'idempotency-key': 'apply-http-approval-test'
      },
      body: '{}'
    });
    expect(apply.status).toBe(200);
    expect(apply.headers.get('idempotent-replayed')).toBe('false');
    const firstApplied = (await apply.json()) as {
      trip: { version: number };
      proposal: { status: string; applied_at?: string; applied_trip_version?: number };
    };

    const revalidateApplied = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/validate`, {
      method: 'POST'
    });
    expect(revalidateApplied.status).toBe(409);
    expect(await revalidateApplied.json()).toMatchObject({ error: expect.stringContaining('status is applied') });
    const stillApplied = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}`);
    expect(await stillApplied.json()).toEqual(firstApplied.proposal);

    const replay = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/apply`, {
      method: 'POST',
      headers: {
        'x-approval-key': APPROVAL_KEY,
        'idempotency-key': 'apply-http-approval-test'
      },
      body: '{}'
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    const replayed = (await replay.json()) as { trip: { version: number } };
    expect(replayed.trip.version).toBe(firstApplied.trip.version);
  });

  it('returns a conflict without reopening an operator-rejected proposal', async () => {
    const create = await authorizedFetch(`/v1/trips/${demoTripId}/proposals`, {
      method: 'POST',
      headers: { 'idempotency-key': 'create-http-rejection-test' },
      body: JSON.stringify({
        operations: [{
          operation: 'update',
          target_type: 'trip_item',
          target_id: '88888888-8888-4888-8888-888888888888',
          to: { notes: 'Rejected proposal must stay rejected.' }
        }]
      })
    });
    expect(create.status).toBe(201);
    const proposal = (await create.json()) as { proposal_id: string };

    const validate = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/validate`, {
      method: 'POST'
    });
    expect(validate.status).toBe(200);
    const reject = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/reject`, {
      method: 'POST',
      headers: {
        'x-approval-key': APPROVAL_KEY,
        'idempotency-key': 'reject-http-rejection-test'
      },
      body: JSON.stringify({ actor_id: 'reviewer', reason: 'Operator decision.' })
    });
    expect(reject.status).toBe(200);
    const rejected = await reject.json();

    const revalidate = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}/validate`, {
      method: 'POST'
    });
    expect(revalidate.status).toBe(409);
    expect(await revalidate.json()).toMatchObject({ error: expect.stringContaining('status is rejected') });
    const stillRejected = await authorizedFetch(`/v1/proposals/${proposal.proposal_id}`);
    expect(await stillRejected.json()).toEqual(rejected);
  });

  it('imports an external trip only through the operator approval credential and stays idempotent', async () => {
    const path = `/v1/external/trips/${EXTERNAL_TRIP_ID}/import`;
    const body = JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' });

    const withoutApproval = await authorizedFetch(path, { method: 'POST', body });
    expect(withoutApproval.status).toBe(401);

    const withoutKey = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY },
      body
    });
    expect(withoutKey.status).toBe(400);
    expect(await withoutKey.json()).toMatchObject({ error: 'idempotency_key_required' });

    const withoutTraveler = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-missing-traveler' },
      body: JSON.stringify({ actor_id: 'operator' })
    });
    expect(withoutTraveler.status).toBe(400);
    expect(await withoutTraveler.json()).toMatchObject({ error: 'invalid_request' });

    const stalePreview = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-stale-preview' },
      body: JSON.stringify({
        actor_id: 'operator',
        traveler_display_name: 'Trip Owner',
        source_fingerprint: '0'.repeat(64)
      })
    });
    expect(stalePreview.status).toBe(409);
    expect(await stalePreview.json()).toMatchObject({ error: 'preview_stale' });

    const imported = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-external-trip-1' },
      body
    });
    expect(imported.status).toBe(201);
    expect(imported.headers.get('idempotent-replayed')).toBe('false');
    const report = (await imported.json()) as {
      status: string;
      source: string;
      source_trip_id: string;
      imported_at: string;
      trip: { trip_id: string; version: number };
      unresolved_fields: Array<{ code: string }>;
    };
    expect(report).toMatchObject({
      status: 'imported',
      source: 'trip',
      source_trip_id: String(EXTERNAL_TRIP_ID)
    });
    expect(report.trip.version).toBe(1);
    expect(report.unresolved_fields.map((field) => field.code)).toContain('BOOKING_TIMING_UNKNOWN');

    const stored = await authorizedFetch(`/v1/trips/${report.trip.trip_id}`);
    expect(stored.status).toBe(200);
    const storedBody = (await stored.json()) as {
      trip: { import_source: { provider: string; imported_at: string } };
    };
    expect(storedBody.trip.import_source).toMatchObject({
      provider: 'trip',
      imported_at: report.imported_at
    });

    const audit = await authorizedFetch(`/v1/trips/${report.trip.trip_id}/audit`);
    expect((await audit.json()) as { events: Array<{ event_type: string }> }).toMatchObject({
      events: [expect.objectContaining({ event_type: 'external_trip_imported' })]
    });

    const replay = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-external-trip-1' },
      body
    });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(await replay.json()).toEqual(report);

    const duplicate = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-external-trip-2' },
      body
    });
    expect(duplicate.status).toBe(200);
    const duplicateReport = (await duplicate.json()) as { status: string; trip: { trip_id: string } };
    expect(duplicateReport.status).toBe('duplicate');
    expect(duplicateReport.trip.trip_id).toBe(report.trip.trip_id);
  });

  it('replays a stored import response even when the source became unreadable', async () => {
    const previous = transport;
    const path = '/v1/external/trips/13/import';
    const body = JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' });
    transport = async ({ id }) => jsonResponse(tripFixture({ id }));

    try {
      const first = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-replay-13' },
        body
      });
      expect(first.status).toBe(201);
      const firstBody = await first.json();

      transport = async () => new Response('upstream exploded', { status: 500 });

      const replay = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-replay-13' },
        body
      });
      expect(replay.status).toBe(201);
      expect(replay.headers.get('idempotent-replayed')).toBe('true');
      expect(await replay.json()).toEqual(firstBody);

      const reusedKey = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-replay-13' },
        body: JSON.stringify({ actor_id: 'someone-else', traveler_display_name: 'Trip Owner' })
      });
      expect(reusedKey.status).toBe(409);
    } finally {
      transport = previous;
    }
  });

  it('reports upstream read failures with a machine-readable code', async () => {
    const previous = transport;
    transport = async () => new Response('upstream exploded', { status: 500 });
    try {
      const response = await authorizedFetch('/v1/external/trips/14/import', {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-upstream-500' },
        body: JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' })
      });
      expect(response.status).toBe(502);
      const body = (await response.json()) as { code?: string; error?: string };
      expect(body.code).toBe('HTTP_500');
      expect(body.error).not.toContain('upstream exploded');
    } finally {
      transport = previous;
    }
  });

  it('replays a stored duplicate response without re-reading the source', async () => {
    const previous = transport;
    const path = '/v1/external/trips/15/import';
    const body = JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' });
    transport = async ({ id }) => jsonResponse(tripFixture({ id }));

    try {
      const first = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-seed-15' },
        body
      });
      expect(first.status).toBe(201);

      const duplicate = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-duplicate-15' },
        body
      });
      expect(duplicate.status).toBe(200);
      const duplicateBody = await duplicate.json();

      transport = async () => new Response('upstream exploded', { status: 500 });
      const replay = await authorizedFetch(path, {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-duplicate-15' },
        body
      });
      expect(replay.status).toBe(200);
      expect(replay.headers.get('idempotent-replayed')).toBe('true');
      expect(await replay.json()).toEqual(duplicateBody);
    } finally {
      transport = previous;
    }
  });

  it('reports a non-JSON upstream response without leaking its body', async () => {
    const previous = transport;
    transport = async () => new Response('<html>PRIVATE-UPSTREAM</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
    try {
      const response = await authorizedFetch('/v1/external/trips/16/import', {
        method: 'POST',
        headers: { 'x-approval-key': APPROVAL_KEY, 'idempotency-key': 'import-upstream-html' },
        body: JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' })
      });
      expect(response.status).toBe(502);
      const body = (await response.json()) as { code?: string; error?: string };
      expect(body.code).toBe('CONTENT_TYPE');
      expect(JSON.stringify(body)).not.toContain('PRIVATE-UPSTREAM');
    } finally {
      transport = previous;
    }
  });

  it('refuses to import when no external source is configured on the deployment', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/v1/external/trips/12/import`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${READ_KEY}`,
          'x-approval-key': APPROVAL_KEY,
          'idempotency-key': 'import-unconfigured-source',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' })
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: 'external_source_not_configured' });
    });
  });

  it('disables the import route entirely when the operator approval credential is off', async () => {
    const extra = createHttpServer({ host: '127.0.0.1', port: 0, travelApiKey: READ_KEY });
    await new Promise<void>((resolve, reject) => {
      extra.server.once('error', reject);
      extra.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = extra.server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/external/trips/12/import`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${READ_KEY}`,
          'idempotency-key': 'import-approval-disabled',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ actor_id: 'operator', traveler_display_name: 'Trip Owner' })
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: 'approval_api_disabled' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        extra.server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
