import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { createHttpServer } from '../src/http/server.js';
import { proposalService } from '../src/services/proposal-service.js';
import { store } from '../src/store/memory-store.js';

it('serves a server-derived read-only proposal review without an operator approval capability', async () => {
  const proposal = proposalService.create({ tripId: demoTripId, operations: [{ operation: 'update', target_type: 'trip_item', target_id: '88888888-8888-4888-8888-888888888888', from: { title: 'FORGED_MODEL_BEFORE' }, to: { title: 'Reviewed synthetic destination' } }] });
  const before = store.getTrip(demoTripId)!;
  const audit = store.listAuditForTrip(demoTripId);
  const instance = createHttpServer({ host: '127.0.0.1', port: 0, travelApiKey: 'OWN_SYNTHETIC_READ_KEY' });
  await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${origin}/v1/proposals/${proposal.proposal_id}/review`, { headers: { authorization: 'Bearer OWN_SYNTHETIC_READ_KEY' } });
    expect(response.status).toBe(200);
    const review = await response.json();
    expect(review.schema_version).toBe('proposal-review/v1');
    expect(review.read_only).toBe(true);
    expect(review.changes.updated[0].before.title).not.toBe('FORGED_MODEL_BEFORE');
    expect(review.changes.updated[0].after.title).toBe('Reviewed synthetic destination');
    expect(store.getTrip(demoTripId)).toEqual(before);
    expect(store.getProposal(proposal.proposal_id)).toEqual(proposal);
    expect(store.listAuditForTrip(demoTripId)).toEqual(audit);
  } finally { await new Promise<void>((resolve, reject) => instance.server.close(error => error ? reject(error) : resolve())); }
});

it('actual review HTTP route requires ordinary authentication and cannot approve or apply', async () => {
  const p = proposalService.create({ tripId: demoTripId, operations: [{ operation: 'update', target_type: 'trip_item', target_id: '88888888-8888-4888-8888-888888888888', to: { title: 'Synthetic auth review' } }] });
  const audit = store.listAuditForTrip(demoTripId), before = store.getTrip(demoTripId);
  const instance = createHttpServer({ host: '127.0.0.1', port: 0, travelApiKey: 'OWN_SYNTHETIC_READ_KEY', approvalApiKey: 'OWN_SYNTHETIC_SEPARATE_OPERATOR_KEY' });
  await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
  const headers = { authorization: 'Bearer OWN_SYNTHETIC_READ_KEY', 'content-type': 'application/json' };
  try {
    expect((await fetch(`${origin}/v1/proposals/${p.proposal_id}/review`)).status).toBe(401);
    expect((await fetch(`${origin}/v1/proposals/${p.proposal_id}/review?approve=true`, { headers })).status).toBe(200);
    expect((await fetch(`${origin}/v1/proposals/${p.proposal_id}/approve`, { method: 'POST', headers, body: JSON.stringify({ actor_id: 'synthetic-AI' }) })).status).toBe(401);
    expect((await fetch(`${origin}/v1/proposals/${p.proposal_id}/apply`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'OWN-test' }, body: '{}' })).status).toBe(401);
    expect(store.getTrip(demoTripId)).toEqual(before); expect(store.getProposal(p.proposal_id)).toEqual(p); expect(store.listAuditForTrip(demoTripId)).toEqual(audit);
  } finally { await new Promise<void>((resolve, reject) => instance.server.close(error => error ? reject(error) : resolve())); }
});

it('ordinary HTTP-created nested timing payloads cannot bypass the scalar review projection', async () => {
  const instance = createHttpServer({ host: '127.0.0.1', port: 0, travelApiKey: 'OWN_SYNTHETIC_READ_KEY' });
  await new Promise<void>(resolve => instance.server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
  const headers = { authorization: 'Bearer OWN_SYNTHETIC_READ_KEY', 'content-type': 'application/json' };
  try {
    const created = await fetch(`${origin}/v1/trips/${demoTripId}/proposals`, { method: 'POST', headers, body: JSON.stringify({ operations: [{ operation: 'add', target_type: 'trip_item', to: { date: '2026-10-20', item: { item_id: 'OWN_NESTED_HTTP_ITEM', type: 'note', locked: false, route: { mode: { booking_reference: 'SECRET_NESTED_HTTP_MODE' }, duration_minutes: 1, distance_meters: 1 }, source_timing: { provider: { notes: 'SECRET_NESTED_HTTP_PROVIDER' }, source_id: ['SECRET_NESTED_HTTP_ID'], local_date: {}, local_time: [], timezone: {} } } } }] }) });
    expect(created.status).toBe(201); const p = await created.json();
    const before = store.getTrip(demoTripId), audit = store.listAuditForTrip(demoTripId), proposal = store.getProposal(p.proposal_id);
    const response = await fetch(`${origin}/v1/proposals/${p.proposal_id}/review`, { headers }); expect(response.status).toBe(200); const r = await response.json();
    expect(JSON.stringify(r)).not.toContain('SECRET_NESTED_HTTP'); expect(r.changes.added[0].route).toBeNull(); expect(r.changes.added[0].source_timing.provider).toBeNull();
    expect(store.getTrip(demoTripId)).toEqual(before); expect(store.getProposal(p.proposal_id)).toEqual(proposal); expect(store.listAuditForTrip(demoTripId)).toEqual(audit);
  } finally { await new Promise<void>((resolve, reject) => instance.server.close(error => error ? reject(error) : resolve())); }
});
