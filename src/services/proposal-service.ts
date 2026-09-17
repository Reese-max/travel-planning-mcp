import { randomUUID } from 'node:crypto';
import type {
  ApprovalReceipt,
  AuditEvent,
  ChangeOperation,
  ChangeProposal,
  Constraint,
  ProposalValidation,
  Trip,
  TripDay,
  TripItem
} from '../domain/types.js';
import type { TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

export interface CreateProposalInput {
  tripId: string;
  title?: string;
  summary?: string;
  reason?: string;
  operations: Array<Omit<ChangeOperation, 'operation_id'> & { operation_id?: string }>;
  model?: string;
  actorId?: string;
}

export interface ApproveProposalInput {
  proposalId: string;
  actorId: string;
  channel: ApprovalReceipt['channel'];
  note?: string;
}

interface Evaluation {
  validation: ProposalValidation;
  simulated: Trip;
  affectedDays: string[];
}

function findTripItem(trip: Trip, itemId: string): { day: TripDay; item: TripItem } | undefined {
  for (const day of trip.days) {
    const item = day.items.find((candidate) => candidate.item_id === itemId);
    if (item) return { day, item };
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function hhmmFromIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1];
}

function timestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isTripItem(value: unknown): value is TripItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TripItem>;
  return (
    typeof candidate.item_id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.locked === 'boolean'
  );
}

function sortTripItems(trip: Trip): void {
  for (const day of trip.days) {
    day.items.sort((a, b) => {
      const aTime = timestamp(a.start_at) ?? Number.MAX_SAFE_INTEGER;
      const bTime = timestamp(b.start_at) ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }
}

function routeMetrics(trip: Trip): { travelMinutes: number; walkingKm: number } {
  let travelMinutes = 0;
  let walkingMeters = 0;
  for (const day of trip.days) {
    for (const item of day.items) {
      if (!item.route) continue;
      travelMinutes += item.route.duration_minutes;
      if (item.route.mode === 'walking') walkingMeters += item.route.distance_meters;
    }
  }
  return { travelMinutes, walkingKm: walkingMeters / 1000 };
}

function constraintAppliesToDate(constraint: Constraint, date: string): boolean {
  return !constraint.scope.date || constraint.scope.date === date;
}

function pushConstraintResult(
  constraint: Constraint,
  message: string,
  result: ProposalValidation
): void {
  const rendered = `${constraint.type} (${constraint.constraint_id}): ${message}`;
  if (constraint.strength === 'hard') result.hard_constraint_violations.push(rendered);
  else result.soft_constraint_warnings.push(rendered);
}

export class ProposalService {
  constructor(private readonly db: TravelStore = store) {}

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
        ...(input.model ? { model: input.model } : {}),
        ...(input.actorId ? { actor_id: input.actorId } : {})
      },
      created_at: new Date().toISOString(),
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.reason ? { reason: input.reason } : {})
    };

    this.db.saveProposal(proposal);
    this.audit({
      event_type: 'proposal_created',
      trip_id: trip.trip_id,
      proposal_id: proposal.proposal_id,
      actor_type: 'ai',
      ...(input.actorId ? { actor_id: input.actorId } : {}),
      metadata: { base_trip_version: trip.version, operation_count: proposal.operations.length }
    });
    return proposal;
  }

  validate(proposalId: string): ChangeProposal {
    const proposal = this.requireProposal(proposalId);
    const trip = this.requireTrip(proposal.trip_id);
    const evaluation = this.evaluate(proposal, trip);

    const beforeMetrics = routeMetrics(trip);
    const afterMetrics = routeMetrics(evaluation.simulated);
    const updated: ChangeProposal = {
      ...proposal,
      validation: evaluation.validation,
      impact: {
        travel_minutes_delta: afterMetrics.travelMinutes - beforeMetrics.travelMinutes,
        walking_km_delta: Number((afterMetrics.walkingKm - beforeMetrics.walkingKm).toFixed(2)),
        affected_days: evaluation.affectedDays
      },
      status: evaluation.validation.valid ? 'validated' : 'needs_review'
    };

    this.db.saveProposal(updated);
    this.audit({
      event_type: 'proposal_validated',
      trip_id: proposal.trip_id,
      proposal_id: proposal.proposal_id,
      actor_type: 'system',
      metadata: {
        valid: evaluation.validation.valid,
        hard_violation_count: evaluation.validation.hard_constraint_violations.length,
        soft_warning_count: evaluation.validation.soft_constraint_warnings.length,
        conflict_count: evaluation.validation.conflicts.length
      }
    });
    return updated;
  }

  approve(input: ApproveProposalInput): ChangeProposal {
    const proposal = this.requireProposal(input.proposalId);
    if (proposal.status !== 'validated' || !proposal.validation?.valid) {
      throw new Error('Only successfully validated proposals can be approved.');
    }

    const current = this.requireTrip(proposal.trip_id);
    if (current.version !== proposal.base_trip_version) {
      throw new Error(
        `Proposal is stale: expected trip v${proposal.base_trip_version}, current v${current.version}.`
      );
    }

    const evaluation = this.evaluate(proposal, current);
    if (!evaluation.validation.valid) {
      throw new Error(
        `Proposal is no longer valid: ${[
          ...evaluation.validation.hard_constraint_violations,
          ...evaluation.validation.conflicts
        ].join(' | ')}`
      );
    }

    const approvedAt = new Date().toISOString();
    const receipt: ApprovalReceipt = {
      approval_id: randomUUID(),
      actor_id: input.actorId,
      channel: input.channel,
      approved_at: approvedAt,
      ...(input.note ? { note: input.note } : {})
    };
    const approved = this.db.approveProposal(proposal.proposal_id, receipt);
    if (!approved) throw new Error('Failed to persist approval.');

    this.audit({
      event_type: 'proposal_approved',
      trip_id: proposal.trip_id,
      proposal_id: proposal.proposal_id,
      actor_type: 'operator',
      actor_id: input.actorId,
      metadata: { approval_id: receipt.approval_id, channel: receipt.channel }
    });
    return approved;
  }

  reject(proposalId: string, actorId: string, reason?: string): ChangeProposal {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status === 'applied') throw new Error('Applied proposals cannot be rejected.');

    const rejected = this.db.setProposalStatus(proposalId, 'rejected', {
      rejected_at: new Date().toISOString(),
      ...(reason ? { rejection_reason: reason } : {})
    });
    if (!rejected) throw new Error('Failed to persist rejection.');

    this.audit({
      event_type: 'proposal_rejected',
      trip_id: proposal.trip_id,
      proposal_id: proposal.proposal_id,
      actor_type: 'operator',
      actor_id: actorId,
      ...(reason ? { metadata: { reason } } : {})
    });
    return rejected;
  }

  apply(proposalId: string): { proposal: ChangeProposal; trip: Trip } {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status !== 'approved' || !proposal.approval) {
      throw new Error('Proposal must have an explicit approval receipt before it can be applied.');
    }
    if (!proposal.validation?.valid) {
      throw new Error('Proposal must have a successful validation result before it can be applied.');
    }

    const current = this.requireTrip(proposal.trip_id);
    if (current.version !== proposal.base_trip_version) {
      throw new Error(
        `Proposal is stale: expected trip v${proposal.base_trip_version}, current v${current.version}.`
      );
    }

    const evaluation = this.evaluate(proposal, current);
    if (!evaluation.validation.valid) {
      throw new Error(
        `Proposal failed apply-time revalidation: ${[
          ...evaluation.validation.hard_constraint_violations,
          ...evaluation.validation.conflicts
        ].join(' | ')}`
      );
    }

    const next = evaluation.simulated;
    next.version = current.version + 1;
    next.updated_at = new Date().toISOString();
    next.change_proposal_ids = [...(next.change_proposal_ids ?? []), proposal.proposal_id];
    this.db.saveTrip(next);

    const applied = this.db.setProposalStatus(proposal.proposal_id, 'applied', {
      applied_at: new Date().toISOString(),
      applied_trip_version: next.version
    });
    if (!applied) throw new Error('Failed to persist applied proposal status.');

    this.audit({
      event_type: 'proposal_applied',
      trip_id: next.trip_id,
      proposal_id: proposal.proposal_id,
      actor_type: 'system',
      metadata: { from_version: current.version, to_version: next.version }
    });
    return { proposal: applied, trip: next };
  }

  rollback(tripId: string, targetVersion: number, actorId = 'admin'): Trip {
    const target = this.db.getTrip(tripId, targetVersion);
    const current = this.db.getTrip(tripId);
    if (!target || !current) throw new Error('Trip or requested version was not found.');
    if (targetVersion >= current.version) {
      throw new Error('Rollback target must be older than the current trip version.');
    }

    const restored: Trip = {
      ...target,
      version: current.version + 1,
      updated_at: new Date().toISOString()
    };
    this.db.saveTrip(restored);
    this.audit({
      event_type: 'trip_rolled_back',
      trip_id: tripId,
      actor_type: 'operator',
      actor_id: actorId,
      metadata: {
        from_version: current.version,
        restored_from_version: targetVersion,
        new_version: restored.version
      }
    });
    return restored;
  }

  private evaluate(proposal: ChangeProposal, trip: Trip): Evaluation {
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
    const fixedItemIds = new Set(
      constraints
        .filter((constraint) => constraint.type === 'fixed_item' && constraint.strength === 'hard')
        .flatMap((constraint) => constraint.scope.item_ids ?? [])
    );
    const simulated = structuredClone(trip);
    const affectedDays = new Set<string>();

    for (const operation of proposal.operations) {
      if (operation.target_type !== 'trip_item') {
        result.conflicts.push(
          `Operation ${operation.operation_id}: ${operation.target_type} mutations require a dedicated reviewed workflow.`
        );
        continue;
      }

      if (operation.operation === 'replace') {
        result.conflicts.push(
          `Operation ${operation.operation_id}: replace is not supported by the safe apply path.`
        );
        continue;
      }

      if (operation.operation === 'add') {
        const date = asString(operation.to?.date);
        const item = operation.to?.item;
        if (!date || !isTripItem(item)) {
          result.conflicts.push(
            `Operation ${operation.operation_id}: add requires to.date and a valid to.item TripItem.`
          );
          continue;
        }
        if (item.locked) {
          result.conflicts.push(
            `Operation ${operation.operation_id}: AI proposals cannot create locked items; lock state must come from a trusted reservation/import workflow.`
          );
          continue;
        }
        if (item.reservation_id) {
          const reservation = this.db.getReservation(item.reservation_id);
          if (!reservation) {
            result.conflicts.push(
              `Operation ${operation.operation_id}: reservation ${item.reservation_id} does not exist.`
            );
            continue;
          }
          if (reservation.fixed) {
            result.hard_constraint_violations.push(
              `Operation ${operation.operation_id}: AI proposals cannot add/rebind fixed reservation ${reservation.reservation_id}; use a trusted reservation import workflow.`
            );
            continue;
          }
          const duplicate = simulated.days.some((day) =>
            day.items.some((candidate) => candidate.reservation_id === item.reservation_id)
          );
          if (duplicate) {
            result.conflicts.push(
              `Operation ${operation.operation_id}: reservation ${item.reservation_id} is already represented in the itinerary.`
            );
            continue;
          }
        }

        affectedDays.add(date);
        this.tryApply(simulated, operation, false, result);
        continue;
      }

      if (!operation.target_id) {
        result.conflicts.push(`Operation ${operation.operation_id}: target_id is required.`);
        continue;
      }

      const located = findTripItem(trip, operation.target_id);
      if (!located) {
        result.conflicts.push(
          `Operation ${operation.operation_id}: trip item ${operation.target_id} was not found.`
        );
        continue;
      }

      affectedDays.add(located.day.date);
      const destinationDate = asString(operation.to?.date);
      if (destinationDate) affectedDays.add(destinationDate);

      let protectedItem = false;
      if (located.item.locked || fixedItemIds.has(located.item.item_id)) {
        protectedItem = true;
        result.hard_constraint_violations.push(
          `Operation ${operation.operation_id}: trip item ${operation.target_id} is locked or fixed.`
        );
      }

      if (located.item.reservation_id) {
        const reservation = this.db.getReservation(located.item.reservation_id);
        if (!reservation) {
          protectedItem = true;
          result.conflicts.push(
            `Operation ${operation.operation_id}: reservation ${located.item.reservation_id} no longer exists.`
          );
        } else if (reservation.fixed) {
          protectedItem = true;
          result.hard_constraint_violations.push(
            `Operation ${operation.operation_id}: reservation ${reservation.reservation_id} is fixed.`
          );
        }
      }

      if (protectedItem) continue;
      this.tryApply(simulated, operation, false, result);
    }

    sortTripItems(simulated);
    this.validateSchedule(simulated, result);
    this.validateConstraints(simulated, constraints, result);
    result.valid = result.hard_constraint_violations.length === 0 && result.conflicts.length === 0;

    return {
      validation: result,
      simulated,
      affectedDays: [...affectedDays].sort()
    };
  }

  private tryApply(
    trip: Trip,
    operation: ChangeOperation,
    enforceLocks: boolean,
    result: ProposalValidation
  ): void {
    try {
      this.applyTripItemOperation(trip, operation, enforceLocks);
    } catch (error) {
      result.conflicts.push(
        `Operation ${operation.operation_id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private validateSchedule(trip: Trip, result: ProposalValidation): void {
    const seenDates = new Set<string>();
    for (const day of trip.days) {
      if (seenDates.has(day.date)) result.conflicts.push(`Duplicate trip day: ${day.date}.`);
      seenDates.add(day.date);
      if (day.date < trip.start_date || day.date > trip.end_date) {
        result.conflicts.push(`Trip day ${day.date} is outside ${trip.start_date}..${trip.end_date}.`);
      }

      const timed = day.items
        .map((item) => ({ item, start: timestamp(item.start_at), end: timestamp(item.end_at) }))
        .filter((entry) => entry.start !== undefined)
        .sort((a, b) => a.start! - b.start!);

      for (const entry of timed) {
        if (entry.end !== undefined && entry.end < entry.start!) {
          result.conflicts.push(`Item ${entry.item.item_id} ends before it starts.`);
        }
      }

      for (let index = 1; index < timed.length; index += 1) {
        const previous = timed[index - 1]!;
        const current = timed[index]!;
        if (previous.end !== undefined && previous.end > current.start!) {
          result.conflicts.push(
            `Schedule overlap on ${day.date}: ${previous.item.item_id} overlaps ${current.item.item_id}.`
          );
        }
      }
    }
  }

  private validateConstraints(
    trip: Trip,
    constraints: Constraint[],
    result: ProposalValidation
  ): void {
    const supported = new Set<Constraint['type']>([
      'fixed_item',
      'time_window',
      'return_by',
      'start_after',
      'max_places_per_day',
      'max_walking_distance',
      'max_daily_budget',
      'transport_mode',
      'must_visit',
      'avoid_place',
      'avoid_category'
    ]);

    for (const constraint of constraints) {
      if (!supported.has(constraint.type)) {
        const message = `Constraint type ${constraint.type} cannot yet be evaluated safely.`;
        if (constraint.strength === 'hard') result.conflicts.push(message);
        else result.soft_constraint_warnings.push(message);
        continue;
      }

      if (constraint.type === 'fixed_item') continue;

      if (constraint.type === 'must_visit') {
        const placeId = asString(constraint.parameters.place_id);
        if (placeId && !trip.days.some((day) => day.items.some((item) => item.place_id === placeId))) {
          pushConstraintResult(
            constraint,
            `required place ${placeId} is missing from the itinerary.`,
            result
          );
        }
        continue;
      }

      if (constraint.type === 'avoid_place') {
        const placeId = asString(constraint.parameters.place_id);
        if (placeId && trip.days.some((day) => day.items.some((item) => item.place_id === placeId))) {
          pushConstraintResult(constraint, `avoided place ${placeId} is present in the itinerary.`, result);
        }
        continue;
      }

      if (constraint.type === 'avoid_category') {
        const category = asString(constraint.parameters.category);
        if (category) {
          for (const day of trip.days) {
            for (const item of day.items) {
              if (!item.place_id) continue;
              const place = this.db.getPlace(item.place_id);
              if (place?.categories.includes(category)) {
                pushConstraintResult(
                  constraint,
                  `place ${place.place_id} has avoided category ${category}.`,
                  result
                );
              }
            }
          }
        }
        continue;
      }

      for (const day of trip.days) {
        if (!constraintAppliesToDate(constraint, day.date)) continue;
        const scopedItems = constraint.scope.item_ids?.length
          ? day.items.filter((item) => constraint.scope.item_ids!.includes(item.item_id))
          : day.items;

        if (constraint.type === 'return_by') {
          const limit = asString(constraint.parameters.time);
          if (!limit) continue;
          for (const item of scopedItems) {
            const time = hhmmFromIso(item.end_at ?? item.start_at);
            if (time && time > limit) {
              pushConstraintResult(
                constraint,
                `item ${item.item_id} ends at ${time}, after ${limit}.`,
                result
              );
            }
          }
        }

        if (constraint.type === 'start_after') {
          const limit = asString(constraint.parameters.time);
          if (!limit) continue;
          for (const item of scopedItems) {
            const time = hhmmFromIso(item.start_at);
            if (time && time < limit) {
              pushConstraintResult(
                constraint,
                `item ${item.item_id} starts at ${time}, before ${limit}.`,
                result
              );
            }
          }
        }

        if (constraint.type === 'time_window') {
          const start = asString(constraint.parameters.start);
          const end = asString(constraint.parameters.end);
          if (!start || !end) continue;
          for (const item of scopedItems) {
            const itemStart = hhmmFromIso(item.start_at);
            const itemEnd = hhmmFromIso(item.end_at ?? item.start_at);
            if ((itemStart && itemStart < start) || (itemEnd && itemEnd > end)) {
              pushConstraintResult(
                constraint,
                `item ${item.item_id} falls outside allowed window ${start}-${end}.`,
                result
              );
            }
          }
        }

        if (constraint.type === 'max_places_per_day') {
          const max = asNumber(constraint.parameters.max ?? constraint.parameters.count);
          if (max === undefined) continue;
          const count = scopedItems.filter(
            (item) => item.type === 'place' || item.type === 'meal'
          ).length;
          if (count > max) {
            pushConstraintResult(
              constraint,
              `${day.date} has ${count} places/meals, above limit ${max}.`,
              result
            );
          }
        }

        if (constraint.type === 'max_walking_distance') {
          const maxKm = asNumber(
            constraint.parameters.kilometers_per_day ?? constraint.parameters.kilometers
          );
          if (maxKm === undefined) continue;
          const walkingKm =
            scopedItems.reduce(
              (sum, item) =>
                sum + (item.route?.mode === 'walking' ? item.route.distance_meters : 0),
              0
            ) / 1000;
          if (walkingKm > maxKm) {
            pushConstraintResult(
              constraint,
              `${day.date} has ${walkingKm.toFixed(2)} km walking, above ${maxKm} km.`,
              result
            );
          }
        }

        if (constraint.type === 'max_daily_budget') {
          const max = asNumber(constraint.parameters.amount);
          const currency = asString(constraint.parameters.currency);
          if (max === undefined || !currency) continue;
          let total = 0;
          let incompatibleCurrency = false;

          for (const item of scopedItems) {
            if (item.place_id) {
              const cost = this.db.getPlace(item.place_id)?.planning?.estimated_cost;
              if (cost) {
                if (cost.currency === currency) total += cost.amount;
                else incompatibleCurrency = true;
              }
            }
            if (item.reservation_id) {
              const price = this.db.getReservation(item.reservation_id)?.price;
              if (price) {
                if (price.currency === currency) total += price.amount;
                else incompatibleCurrency = true;
              }
            }
          }

          if (incompatibleCurrency) {
            result.soft_constraint_warnings.push(
              `${constraint.type} (${constraint.constraint_id}): mixed currencies prevent a complete budget check.`
            );
          }
          if (total > max) {
            pushConstraintResult(
              constraint,
              `${day.date} estimated ${total} ${currency}, above ${max} ${currency}.`,
              result
            );
          }
        }

        if (constraint.type === 'transport_mode') {
          const allowed = asStringArray(constraint.parameters.allowed);
          if (!allowed?.length) continue;
          for (const item of scopedItems) {
            const mode = item.route?.mode;
            if (mode && !allowed.includes(mode)) {
              pushConstraintResult(
                constraint,
                `item ${item.item_id} uses ${mode}, allowed modes: ${allowed.join(', ')}.`,
                result
              );
            }
          }
        }
      }
    }
  }

  private applyTripItemOperation(
    trip: Trip,
    operation: ChangeOperation,
    enforceLocks: boolean
  ): void {
    if (operation.target_type !== 'trip_item') {
      throw new Error('Only trip_item mutations are supported in the MVP.');
    }

    if (operation.operation === 'add') {
      const date = asString(operation.to?.date);
      const item = operation.to?.item;
      if (!date || !isTripItem(item)) {
        throw new Error('Add requires to.date and a valid to.item.');
      }
      const day = trip.days.find((candidate) => candidate.date === date);
      if (!day) throw new Error(`Trip day not found: ${date}`);
      if (findTripItem(trip, item.item_id)) {
        throw new Error(`Trip item already exists: ${item.item_id}`);
      }
      day.items.push(structuredClone(item));
      return;
    }

    if (!operation.target_id) throw new Error('target_id is required.');
    const located = findTripItem(trip, operation.target_id);
    if (!located) throw new Error(`Trip item not found: ${operation.target_id}`);
    if (enforceLocks && located.item.locked) {
      throw new Error(`Trip item is locked: ${operation.target_id}`);
    }

    if (operation.operation === 'remove') {
      located.day.items = located.day.items.filter(
        (item) => item.item_id !== operation.target_id
      );
      return;
    }

    if (operation.operation === 'move') {
      const targetDate = asString(operation.to?.date) ?? located.day.date;
      const targetDay = trip.days.find((day) => day.date === targetDate);
      if (!targetDay) throw new Error(`Trip day not found: ${targetDate}`);
      located.day.items = located.day.items.filter(
        (item) => item.item_id !== operation.target_id
      );
      const startAt = asString(operation.to?.start_at);
      const endAt = asString(operation.to?.end_at);
      const moved: TripItem = {
        ...located.item,
        ...(startAt ? { start_at: startAt } : {}),
        ...(endAt ? { end_at: endAt } : {})
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

    throw new Error(`Operation ${operation.operation} is not supported in the safe apply path.`);
  }

  private requireProposal(proposalId: string): ChangeProposal {
    const proposal = this.db.getProposal(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    return proposal;
  }

  private requireTrip(tripId: string): Trip {
    const trip = this.db.getTrip(tripId);
    if (!trip) throw new Error(`Trip not found: ${tripId}`);
    return trip;
  }

  private audit(
    input: Omit<AuditEvent, 'event_id' | 'created_at'> & { created_at?: string }
  ): void {
    this.db.appendAudit({
      ...input,
      event_id: randomUUID(),
      created_at: input.created_at ?? new Date().toISOString()
    });
  }
}

export const proposalService = new ProposalService();
