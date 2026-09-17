import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { ProposalService } from '../src/services/proposal-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

const FLIGHT_ITEM_ID = '77777777-7777-4777-8777-777777777777';
const FLIGHT_RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const SENSOJI_ITEM_ID = '88888888-8888-4888-8888-888888888888';

function safeMove(service: ProposalService) {
  return service.create({
    tripId: demoTripId,
    actorId: 'planner-test',
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
}

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

  it('rejects AI attempts to add or rebind a fixed reservation as a new unlocked item', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const proposal = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'add',
          target_type: 'trip_item',
          to: {
            date: '2026-10-20',
            item: {
              item_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
              type: 'reservation',
              reservation_id: FLIGHT_RESERVATION_ID,
              title: 'Injected flight reference',
              start_at: '2026-10-20T18:00:00+09:00',
              end_at: '2026-10-20T19:00:00+09:00',
              locked: false
            }
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    expect(validated.status).toBe('needs_review');
    expect(validated.validation?.valid).toBe(false);
    expect(validated.validation?.hard_constraint_violations.join(' ')).toContain(
      'cannot add/rebind fixed reservation'
    );
  });

  it('validates a safe move without modifying the canonical trip', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const before = db.getTrip(demoTripId)!;
    const proposal = safeMove(service);

    const validated = service.validate(proposal.proposal_id);
    const afterValidation = db.getTrip(demoTripId)!;

    expect(validated.status).toBe('validated');
    expect(validated.validation?.valid).toBe(true);
    expect(validated.impact?.affected_days).toEqual(['2026-10-20']);
    expect(afterValidation).toEqual(before);
  });

  it('requires an explicit approval receipt before apply and creates a new version', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const proposal = safeMove(service);

    service.validate(proposal.proposal_id);
    expect(() => service.apply(proposal.proposal_id)).toThrow(/approval receipt/);

    const approved = service.approve({
      proposalId: proposal.proposal_id,
      actorId: 'human-reviewer',
      channel: 'ui',
      note: 'Reviewed itinerary diff.'
    });

    expect(approved.status).toBe('approved');
    expect(approved.approval?.actor_id).toBe('human-reviewer');

    const applied = service.apply(proposal.proposal_id);
    expect(applied.trip.version).toBe(2);
    expect(db.listTripVersions(demoTripId)).toEqual([1, 2]);
    expect(applied.proposal.applied_trip_version).toBe(2);

    const eventTypes = db.listAuditForTrip(demoTripId).map((event) => event.event_type);
    expect(eventTypes).toEqual([
      'proposal_created',
      'proposal_validated',
      'proposal_approved',
      'proposal_applied'
    ]);
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
            start_at: '2026-10-20T21:00:00+09:00',
            end_at: '2026-10-20T22:00:00+09:00'
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    expect(validated.validation?.valid).toBe(false);
    expect(validated.validation?.hard_constraint_violations.join(' ')).toContain('return_by');
  });

  it('detects schedule overlap during simulation', () => {
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
            start_at: '2026-10-20T11:00:00+09:00',
            end_at: '2026-10-20T12:30:00+09:00'
          }
        }
      ]
    });

    const validated = service.validate(proposal.proposal_id);
    expect(validated.validation?.valid).toBe(false);
    expect(validated.validation?.conflicts.join(' ')).toContain('Schedule overlap');
  });

  it('prevents stale proposals from being approved after another proposal advances the trip', () => {
    const db = new MemoryStore();
    const service = new ProposalService(db);
    const first = safeMove(service);
    const second = service.create({
      tripId: demoTripId,
      operations: [
        {
          operation: 'update',
          target_type: 'trip_item',
          target_id: SENSOJI_ITEM_ID,
          to: { notes: 'Alternative proposal from the same base version.' }
        }
      ]
    });

    service.validate(first.proposal_id);
    service.validate(second.proposal_id);
    service.approve({ proposalId: first.proposal_id, actorId: 'reviewer', channel: 'ui' });
    service.apply(first.proposal_id);

    expect(() =>
      service.approve({ proposalId: second.proposal_id, actorId: 'reviewer', channel: 'ui' })
    ).toThrow(/stale/);
  });
});
