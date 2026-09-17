import { randomUUID } from 'node:crypto';
import type {
  ChangeOperation,
  ChangeProposal,
  ProposalValidation,
  Trip,
  TripDay,
  TripItem
} from '../domain/types.js';
import { store, type MemoryStore } from '../store/memory-store.js';

export interface CreateProposalInput {
  tripId: string;
  title?: string;
  summary?: string;
  reason?: string;
  operations: Array<Omit<ChangeOperation, 'operation_id'> & { operation_id?: string }>;
  model?: string;
}

function findTripItem(trip: Trip, itemId: string): { day: TripDay; item: TripItem } | undefined {
  for (const day of trip.days) {
    const item = day.items.find((candidate) => candidate.item_id === itemId);
    if (item) return { day, item };
  }
  return undefined;
}

function hhmmFromIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isTripItem(value: unknown): value is TripItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TripItem>;
  return typeof candidate.item_id === 'string' && typeof candidate.type === 'string' && typeof candidate.locked === 'boolean';
}

export class ProposalService {
  constructor(private readonly db: MemoryStore = store) {}

  create(input: CreateProposalInput): ChangeProposal {
    const trip = this.db.getTrip(input.tripId);
    if (!trip) throw new Error(`Trip not found: ${input.tripId}`);
    if (input.operations.length === 0) throw new Error('At least one operation is required.');

    const proposal: ChangeProposal = {
      proposal_id: randomUUID(),
      trip_id: trip.trip_id,
      base_trip_version: trip.version,
      status: 'draft',
      operations: input.operations.map((operation) => ({
        ...operation,
        operation_id: operation.operation_id ?? randomUUID()
      })),
      generated_by: {
        type: 'ai',
        ...(input.model ? { model: input.model } : {})
      },
      created_at: new Date().toISOString(),
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.reason ? { reason: input.reason } : {})
    };

    this.db.saveProposal(proposal);
    return proposal;
  }

  validate(proposalId: string): ChangeProposal {
    const proposal = this.db.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

    const trip = this.db.getTrip(proposal.trip_id);
    if (!trip) throw new Error(`Trip not found: ${proposal.trip_id}`);

    const result: ProposalValidation = {
      valid: true,
      validated_at: new Date().toISOString(),
      hard_constraint_violations: [],
      soft_constraint_warnings: [],
      conflicts: []
    };

    if (trip.version !== proposal.base_trip_version) {
      result.conflicts.push(
        `Stale proposal: base version ${proposal.base_trip_version}, current version ${trip.version}.`
      );
    }

    const constraints = this.db.getConstraintsForTrip(trip).filter((constraint) => constraint.enabled);
    const returnBy = constraints.find(
      (constraint) => constraint.type === 'return_by' && constraint.strength === 'hard'
    );
    const returnByTime = returnBy ? asString(returnBy.parameters.time) : undefined;

    for (const operation of proposal.operations) {
      if (operation.target_type !== 'trip_item') {
        result.conflicts.push(
          `MVP does not apply ${operation.target_type} mutations directly; use an adapter or dedicated reviewed workflow.`
        );
        continue;
      }

      if (operation.operation === 'add') {
        const item = operation.to?.item;
        if (!isTripItem(item)) {
          result.conflicts.push(`Operation ${operation.operation_id}: add requires to.item with a valid TripItem.`);
        }
      } else {
        if (!operation.target_id) {
          result.conflicts.push(`Operation ${operation.operation_id}: target_id is required.`);
          continue;
        }

        const located = findTripItem(trip, operation.target_id);
        if (!located) {
          result.conflicts.push(`Operation ${operation.operation_id}: trip item ${operation.target_id} was not found.`);
          continue;
        }

        if (located.item.locked) {
          result.hard_constraint_violations.push(
            `Operation ${operation.operation_id}: trip item ${operation.target_id} is locked.`
          );
        }

        if (located.item.reservation_id) {
          const reservation = this.db.getReservation(located.item.reservation_id);
          if (reservation?.fixed) {
            result.hard_constraint_violations.push(
              `Operation ${operation.operation_id}: reservation ${reservation.reservation_id} is fixed.`
            );
          }
        }
      }

      if (returnByTime) {
        const proposedEnd = hhmmFromIso(operation.to?.end_at);
        if (proposedEnd && proposedEnd > returnByTime) {
          result.hard_constraint_violations.push(
            `Operation ${operation.operation_id}: proposed end ${proposedEnd} exceeds hard return-by ${returnByTime}.`
          );
        }
      }
    }

    result.valid = result.hard_constraint_violations.length === 0 && result.conflicts.length === 0;

    const updated: ChangeProposal = {
      ...proposal,
      validation: result,
      status: result.valid ? 'validated' : 'needs_review'
    };
    this.db.saveProposal(updated);
    return updated;
  }

  apply(proposalId: string): { proposal: ChangeProposal; trip: Trip } {
    const proposal = this.db.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.status !== 'approved') {
      throw new Error('Proposal must be approved by a human-controlled surface before it can be applied.');
    }
    if (!proposal.validation?.valid) {
      throw new Error('Proposal must have a successful validation result before it can be applied.');
    }

    const current = this.db.getTrip(proposal.trip_id);
    if (!current) throw new Error(`Trip not found: ${proposal.trip_id}`);
    if (current.version !== proposal.base_trip_version) {
      throw new Error(`Proposal is stale: expected trip v${proposal.base_trip_version}, current v${current.version}.`);
    }

    const next = structuredClone(current);
    for (const operation of proposal.operations) {
      this.applyTripItemOperation(next, operation);
    }

    next.version += 1;
    next.updated_at = new Date().toISOString();
    next.change_proposal_ids = [...(next.change_proposal_ids ?? []), proposal.proposal_id];
    this.db.saveTrip(next);

    const applied = this.db.setProposalStatus(proposal.proposal_id, 'applied', {
      applied_at: new Date().toISOString(),
      applied_trip_version: next.version
    });
    if (!applied) throw new Error('Failed to persist applied proposal status.');

    return { proposal: applied, trip: next };
  }

  rollback(tripId: string, targetVersion: number): Trip {
    const target = this.db.getTrip(tripId, targetVersion);
    const current = this.db.getTrip(tripId);
    if (!target || !current) throw new Error('Trip or requested version was not found.');
    if (targetVersion >= current.version) throw new Error('Rollback target must be older than the current trip version.');

    const restored: Trip = {
      ...target,
      version: current.version + 1,
      updated_at: new Date().toISOString()
    };
    this.db.saveTrip(restored);
    return restored;
  }

  private applyTripItemOperation(trip: Trip, operation: ChangeOperation): void {
    if (operation.target_type !== 'trip_item') throw new Error('Only trip_item mutations are supported in the MVP.');

    if (operation.operation === 'add') {
      const date = asString(operation.to?.date);
      const item = operation.to?.item;
      if (!date || !isTripItem(item)) throw new Error('Add requires to.date and a valid to.item.');
      const day = trip.days.find((candidate) => candidate.date === date);
      if (!day) throw new Error(`Trip day not found: ${date}`);
      day.items.push(structuredClone(item));
      return;
    }

    if (!operation.target_id) throw new Error('target_id is required.');
    const located = findTripItem(trip, operation.target_id);
    if (!located) throw new Error(`Trip item not found: ${operation.target_id}`);
    if (located.item.locked) throw new Error(`Trip item is locked: ${operation.target_id}`);

    if (operation.operation === 'remove') {
      located.day.items = located.day.items.filter((item) => item.item_id !== operation.target_id);
      return;
    }

    if (operation.operation === 'move') {
      const targetDate = asString(operation.to?.date) ?? located.day.date;
      const targetDay = trip.days.find((day) => day.date === targetDate);
      if (!targetDay) throw new Error(`Trip day not found: ${targetDate}`);
      located.day.items = located.day.items.filter((item) => item.item_id !== operation.target_id);
      const moved: TripItem = {
        ...located.item,
        ...(asString(operation.to?.start_at) ? { start_at: asString(operation.to?.start_at)! } : {}),
        ...(asString(operation.to?.end_at) ? { end_at: asString(operation.to?.end_at)! } : {})
      };
      targetDay.items.push(moved);
      return;
    }

    if (operation.operation === 'update') {
      const allowed = ['title', 'start_at', 'end_at', 'duration_minutes', 'notes'] as const;
      for (const key of allowed) {
        if (operation.to && key in operation.to) {
          Object.assign(located.item, { [key]: operation.to[key] });
        }
      }
      return;
    }

    throw new Error(`Operation ${operation.operation} is not supported in the MVP apply path.`);
  }
}

export const proposalService = new ProposalService();
