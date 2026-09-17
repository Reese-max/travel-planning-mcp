import { describe, expect, it } from 'vitest';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';
import { demoTripId } from '../src/data/seed.js';

const FLIGHT_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const SENSOJI_ITEM_ID = '88888888-8888-4888-8888-888888888888';

describe('ProposalService', () => {
  it('rejects changes to a locked fixed reservation', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const proposal = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'move',
          target_type: 'trip_item',
          target_id: FLIGHT_ITEM_ID,
          to: {
            date: '2026-10-20',
            start_at: '2026-10-20T09:20:00+08:00'
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    expect(validated.status).toBe('needs_review');
    expect(validated.validation?.valid).toBe(false);
    expect(validated.validation?.hard_constraint_violations.length).toBeGreaterThan(0);
  });

  it('validates a safe move without modifying the canonical trip', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const before = db.getTrip(demoTripId)!;

    const proposal = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'move',
          target_type: 'trip_item',
          target_id: SENSOJI_ITEM_ID,
          to: {
            date: '2026-10-20',
            start_at: '2026-10-20T16:00:00+09:00',
            end_at: '2026-10-20T17:30:00+09:00'
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    const afterValidation = db.getTrip(demoTripId)!;

    expect(validated.status).toBe('validated');
    expect(validated.validation?.valid).toBe(true);
    expect(afterValidation).toEqual(before);
  });

  it('requires external approval before apply and then creates a new trip version', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const proposal = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'move',
          target_type: 'trip_item',
          target_id: SENSOJI_ITEM_ID,
          to: {
            date: '2026-10-20',
            start_at: '2026-10-20T16:00:00+09:00',
            end_at: '2026-10-20T17:30:00+09:00'
          }
        }
      ]
    });

    service.validate(proposal.proposal_id);
    expect(() => service.apply(proposal.proposal_id)).toThrow(/approved/);

    db.setProposalStatus(proposal.proposal_id, 'approved', {
      approved_at: new Date().toISOString()
    });

    const applied = service.apply(proposal.proposal_id);
    expect(applied.trip.version).toBe(2);
    expect(db.listTripVersions(demoTripId)).toEqual([1, 2]);
  });

  it('blocks proposals that violate the hard return-by time', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const proposal = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'move',
          target_type: 'trip_item',
          target_id: SENSOJI_ITEM_ID,
          to: {
            date: '2026-10-20',
            end_at: '2026-10-20T22:00:00+09:00'
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    expect(validated.validation?.valid).toBe(false);
    expect(validated.validation?.hard_constraint_violations.join(' ')).toContain('return-by');
  });
});
