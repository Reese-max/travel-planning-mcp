import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { createServer } from '../src/mcp/server.js';
import { proposalService } from '../src/services/proposal-service.js';
import { store } from '../src/store/memory-store.js';

it('reports an MCP tool error without reopening approved, applied, or rejected proposals', async () => {
  const server = createServer();
  const client = new Client({ name: 'proposal-validation-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const approvedCandidate = proposalService.create({
      tripId: demoTripId,
      operations: [{
        operation: 'update',
        target_type: 'trip_item',
        target_id: '88888888-8888-4888-8888-888888888888',
        to: { notes: 'MCP lifecycle test' }
      }]
    });
    proposalService.validate(approvedCandidate.proposal_id);
    const approved = proposalService.approve({
      proposalId: approvedCandidate.proposal_id,
      actorId: 'reviewer',
      channel: 'ui'
    });

    const approvedResult = await client.callTool({
      name: 'validate_change_proposal',
      arguments: { proposal_id: approved.proposal_id }
    });
    expect(approvedResult.isError).toBe(true);
    expect(approvedResult.content).toContainEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('status is approved')
    }));
    expect(store.getProposal(approved.proposal_id)).toEqual(approved);

    const applied = proposalService.apply(approved.proposal_id).proposal;
    const appliedResult = await client.callTool({
      name: 'validate_change_proposal',
      arguments: { proposal_id: applied.proposal_id }
    });
    expect(appliedResult.isError).toBe(true);
    expect(appliedResult.content).toContainEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('status is applied')
    }));
    expect(store.getProposal(applied.proposal_id)).toEqual(applied);

    const rejectedCandidate = proposalService.create({
      tripId: demoTripId,
      operations: [{
        operation: 'update',
        target_type: 'trip_item',
        target_id: '88888888-8888-4888-8888-888888888888',
        to: { notes: 'MCP rejection test' }
      }]
    });
    proposalService.validate(rejectedCandidate.proposal_id);
    const rejected = proposalService.reject(rejectedCandidate.proposal_id, 'reviewer');
    const rejectedResult = await client.callTool({
      name: 'validate_change_proposal',
      arguments: { proposal_id: rejected.proposal_id }
    });
    expect(rejectedResult.isError).toBe(true);
    expect(rejectedResult.content).toContainEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('status is rejected')
    }));
    expect(store.getProposal(rejected.proposal_id)).toEqual(rejected);
  } finally {
    await client.close();
    await server.close();
  }
});
