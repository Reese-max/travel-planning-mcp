import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { TripReadClient, tripExternalId } from '../src/adapters/trip-read-client.js';
import { createHttpServer } from '../src/http/server.js';
import { store } from '../src/store/memory-store.js';
import { jsonResponse, tripFixture } from './helpers/trip-fixture.js';

const READ_KEY = 'synthetic-source-read-key';
const APPROVAL_KEY = 'synthetic-source-approval-key';

function source(instanceId: string, id: number, options: { token?: string; url?: string } = {}) {
  let payload = tripFixture({ id });
  let unavailable = false;
  const request = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (unavailable) throw new Error('synthetic unavailable source');
    return jsonResponse(payload);
  });
  const client = new TripReadClient({ baseUrl: options.url ?? 'https://trip.example.test',
    apiToken: options.token ?? 'SYNTHETIC-PROVIDER-SECRET', instanceId, fetchImpl: request });
  return { client, request, change: () => { payload = tripFixture({ id, itemText: 'Changed synthetic content' }); },
    fail: () => { unavailable = true; } };
}

async function withServer(client: TripReadClient, run: (base: string) => Promise<void>) {
  const { server } = createHttpServer({ host: '127.0.0.1', port: 0,
    travelApiKey: READ_KEY, approvalApiKey: APPROVAL_KEY, tripClient: client });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

function importBody(sourceFingerprint: string) {
  return { actor_id: 'synthetic-operator', traveler_display_name: 'Synthetic Traveler',
    source_fingerprint: sourceFingerprint };
}
function post(base: string, id: number, key: string, body: ReturnType<typeof importBody>) {
  return fetch(`${base}/v1/external/trips/${id}/import`, { method: 'POST',
    headers: { authorization: `Bearer ${READ_KEY}`, 'x-approval-key': APPROVAL_KEY,
      'idempotency-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('external import source-instance binding', () => {
  it('binds identical snapshots to configured source identity without binding credentials or endpoint aliases', async () => {
    const a = source('binding-fingerprint-a', 110);
    const b = source('binding-fingerprint-b', 110);
    const rotated = source('binding-fingerprint-a', 110, { token: 'ROTATED-SYNTHETIC-SECRET',
      url: 'https://other-alias.example.test/travel/' });
    const [pa, pb, pr] = await Promise.all([a.client.previewTrip(110), b.client.previewTrip(110), rotated.client.previewTrip(110)]);
    expect(pa.mapped_trip_id).not.toBe(pb.mapped_trip_id);
    expect(pa.source_fingerprint).not.toBe(pb.source_fingerprint);
    expect(pa.source_fingerprint).toBe(pr.source_fingerprint);
    expect(pa.mapped_trip_id).toBe(pr.mapped_trip_id);
    expect(JSON.stringify([pa, pb, pr])).not.toContain('SYNTHETIC-SECRET');
    expect(JSON.stringify([pa, pb, pr])).not.toContain('example.test');
    a.change();
    expect((await a.client.previewTrip(110)).source_fingerprint).not.toBe(pa.source_fingerprint);
  });

  it.each([undefined, null, 0, false, '', 'invalid:delimiter'])('refuses missing or invalid configured identity %s before reading source', (instanceId) => {
    const request = vi.fn<typeof fetch>();
    expect(() => new TripReadClient({ baseUrl: 'https://trip.example.test',
      apiToken: 'SYNTHETIC-SECRET', instanceId: instanceId as unknown as string, fetchImpl: request }))
      .toThrow(expect.objectContaining({ code: 'CONFIG' }));
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an approval fingerprint reviewed from another configured instance without importing it', async () => {
    const a = source('binding-approval-a', 111);
    const b = source('binding-approval-b', 111);
    const previewA = await a.client.previewTrip(111);
    const idB = tripExternalId('binding-approval-b', 'trip', 111);
    await withServer(b.client, async base => {
      const response = await post(base, 111, 'reviewed-on-other-source', importBody(previewA.source_fingerprint));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'preview_stale' });
      expect(store.getTrip(idB)).toBeUndefined();
      expect(store.listAuditForTrip(idB)).toHaveLength(0);
    });
  });

  it('keeps imports/reimports/retries separate across instances even when the operator reuses a request key', async () => {
    const a = source('binding-retry-a', 112);
    const b = source('binding-retry-b', 112);
    const [pa, pb] = await Promise.all([a.client.previewTrip(112), b.client.previewTrip(112)]);
    await withServer(a.client, async baseA => withServer(b.client, async baseB => {
      const firstA = await post(baseA, 112, 'same-operator-request-key', importBody(pa.source_fingerprint));
      expect(firstA.status).toBe(201);
      const dataA = await firstA.json();
      const firstB = await post(baseB, 112, 'same-operator-request-key', importBody(pb.source_fingerprint));
      expect(firstB.status).toBe(201);
      expect(firstB.headers.get('idempotent-replayed')).toBe('false');
      const dataB = await firstB.json();
      expect(dataA.instance_id).toBe('binding-retry-a');
      expect(dataB.instance_id).toBe('binding-retry-b');
      expect(dataB.trip.trip_id).toBe(pb.mapped_trip_id);
      expect(dataB.trip.trip_id).not.toBe(dataA.trip.trip_id);
      const readsB = b.request.mock.calls.length;
      const replay = await post(baseB, 112, 'same-operator-request-key', importBody(pb.source_fingerprint));
      expect(replay.headers.get('idempotent-replayed')).toBe('true');
      expect(await replay.json()).toEqual(dataB);
      expect(b.request).toHaveBeenCalledTimes(readsB);
      const duplicate = await post(baseB, 112, 'new-key-same-source', importBody(pb.source_fingerprint));
      expect(duplicate.status).toBe(200);
      expect(await duplicate.json()).toMatchObject({ status: 'duplicate', instance_id: 'binding-retry-b' });
      b.change();
      const stale = await post(baseB, 112, 'new-key-stale-source', importBody(pb.source_fingerprint));
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: 'preview_stale' });
      const current = await b.client.previewTrip(112);
      const changedReimport = await post(baseB, 112, 'new-key-changed-source', importBody(current.source_fingerprint));
      expect(changedReimport.status).toBe(409);
      for (const id of [pa.mapped_trip_id, pb.mapped_trip_id]) {
        expect(store.listTripVersions(id)).toEqual([1]);
        expect(store.listAuditForTrip(id).filter(e => e.event_type === 'external_trip_imported')).toHaveLength(1);
      }
    }));
  });

  it('does not replay a completed import when the configured identity becomes unavailable', async () => {
    const a = source('binding-required-identity', 113);
    const preview = await a.client.previewTrip(113);
    await withServer(a.client, async base => {
      const body = importBody(preview.source_fingerprint);
      expect((await post(base, 113, 'existing-request', body)).status).toBe(201);
      const count = a.request.mock.calls.length;
      Object.defineProperty(a.client, 'instanceId', { value: undefined });
      const replay = await post(base, 113, 'existing-request', body);
      expect(replay.status).toBe(500);
      expect(await replay.json()).toMatchObject({ code: 'CONFIG' });
      expect(a.request).toHaveBeenCalledTimes(count);
      expect(store.listTripVersions(preview.mapped_trip_id)).toEqual([1]);
    });
  });

  it('preserves same-instance response replay after credential rotation even when source is unreadable', async () => {
    const a = source('binding-rotation', 114);
    const rotated = source('binding-rotation', 114, { token: 'ROTATED-SECRET', url: 'https://alias.example.test/' });
    const preview = await a.client.previewTrip(114);
    const body = importBody(preview.source_fingerprint);
    await withServer(a.client, async baseA => {
      const first = await post(baseA, 114, 'rotation-request', body);
      expect(first.status).toBe(201);
      const data = await first.json();
      rotated.fail();
      await withServer(rotated.client, async baseRotated => {
        const replay = await post(baseRotated, 114, 'rotation-request', body);
        expect(replay.status).toBe(201);
        expect(replay.headers.get('idempotent-replayed')).toBe('true');
        expect(await replay.json()).toEqual(data);
        expect(rotated.request).not.toHaveBeenCalled();
      });
    });
  });
});
