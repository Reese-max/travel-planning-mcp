import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { createServer } from '../src/mcp/server.js';
import { proposalService } from '../src/services/proposal-service.js';
import { store } from '../src/store/memory-store.js';
it('actual SDK exposes observational review without adding any approval tool or granting write authority', async () => {
  const server = createServer(), client = new Client({ name: 'OWN-review-client', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
  try {
    const catalog = await client.listTools(); const tool = catalog.tools.find(t => t.name === 'get_change_proposal_review')!;
    expect(tool.annotations?.readOnlyHint).toBe(true); expect(tool.annotations?.destructiveHint).toBe(false);
    expect(catalog.tools.some(t => /approve/.test(t.name))).toBe(false);
    const p = proposalService.create({ tripId: demoTripId, operations: [{ operation: 'update', target_type: 'trip_item', target_id: '88888888-8888-4888-8888-888888888888', to: { title: 'Synthetic MCP review' } }] });
    const before = store.getTrip(demoTripId), audit = store.listAuditForTrip(demoTripId);
    const result = await client.callTool({ name: tool.name, arguments: { proposal_id: p.proposal_id } });
    expect(result.isError).not.toBe(true); const text = result.content as Array<{ type: string; text: string }>;
    const review = JSON.parse(text[0]!.text); expect(review.read_only).toBe(true); expect(review.approval_authority).toBe(false); expect(review.changes.updated[0].after.title).toBe('Synthetic MCP review');
    expect(store.getTrip(demoTripId)).toEqual(before); expect(store.getProposal(p.proposal_id)).toEqual(p); expect(store.listAuditForTrip(demoTripId)).toEqual(audit);
    const missing = await client.callTool({ name: tool.name, arguments: { proposal_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }); expect(missing.isError).toBe(true);
  } finally { await client.close(); await server.close(); }
});
