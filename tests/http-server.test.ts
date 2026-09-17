import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpServer } from '../src/http/server.js';
import { demoTripId } from '../src/data/seed.js';

const READ_KEY = 'test-read-key';
const APPROVAL_KEY = 'test-approval-key';
const TOKYO_STATION_ID = '22222222-2222-4222-8222-222222222222';
const SENSOJI_ID = '33333333-3333-4333-8333-333333333333';
const FLIGHT_RESERVATION_ID = '44444444-4444-4444-8444-444444444444';

const instance = createHttpServer({
  host: '127.0.0.1',
  port: 0,
  travelApiKey: READ_KEY,
  approvalApiKey: APPROVAL_KEY
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

describe('Travel Planning REST API', () => {
  it('exposes an unauthenticated health endpoint but protects travel data', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, approval_enabled: true });

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

  it('exposes normalized place, reservation, constraint, and route context', async () => {
    const constraints = await authorizedFetch(`/v1/trips/${demoTripId}/constraints`);
    expect(constraints.status).toBe(200);
    expect((await constraints.json()) as { constraints: unknown[] }).toMatchObject({
      constraints: expect.any(Array)
    });

    const search = await authorizedFetch('/v1/places/search?q=Tokyo&limit=5');
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as {
      provider: string;
      places: Array<{ place_id: string }>;
    };
    expect(searchBody.provider).toBe('demo-local');
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

  it('keeps approval behind a separate operator credential', async () => {
    const create = await authorizedFetch(`/v1/trips/${demoTripId}/proposals`, {
      method: 'POST',
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
      headers: { 'x-approval-key': APPROVAL_KEY },
      body: JSON.stringify({ actor_id: 'reviewer', note: 'Reviewed in test.' })
    });
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as {
      status: string;
      approval?: { actor_id: string; channel: string };
    };
    expect(approved.status).toBe('approved');
    expect(approved.approval).toMatchObject({ actor_id: 'reviewer', channel: 'http' });
  });
});
