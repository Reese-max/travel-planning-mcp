import { createHash } from 'node:crypto';
import type { IdempotencyRecord, TravelStore } from '../ports/travel-store.js';
import { store } from '../store/memory-store.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function executionKey(scope: string, key: string): string {
  return `${scope}\u0000${key}`;
}

export function fingerprintPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export class IdempotencyConflictError extends Error {
  constructor(scope: string) {
    super(`Idempotency key was already used with a different request in scope ${scope}.`);
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyService {
  private readonly inFlight = new Map<string, Promise<IdempotentResult<unknown>>>();

  constructor(private readonly db: TravelStore = store) {}

  async execute<T>(
    scope: string,
    key: string | undefined,
    payload: unknown,
    action: () => Promise<{ status: number; body: T }> | { status: number; body: T }
  ): Promise<IdempotentResult<T>> {
    if (!key) {
      const result = await action();
      return { ...result, replayed: false };
    }

    if (key.length > 200) throw new Error('Idempotency-Key must be 200 characters or fewer.');

    const fingerprint = fingerprintPayload(payload);
    const existing = this.db.getIdempotency(scope, key);
    if (existing) return this.replay<T>(scope, fingerprint, existing);

    const lockKey = executionKey(scope, key);
    const running = this.inFlight.get(lockKey);
    if (running) {
      await running;
      const completed = this.db.getIdempotency(scope, key);
      if (!completed) {
        throw new Error(`Concurrent idempotent request finished without a stored result in scope ${scope}.`);
      }
      return this.replay<T>(scope, fingerprint, completed);
    }

    const execution = this.executeFirst(scope, key, fingerprint, action);
    this.inFlight.set(lockKey, execution as Promise<IdempotentResult<unknown>>);
    try {
      return await execution;
    } finally {
      this.inFlight.delete(lockKey);
    }
  }

  private async executeFirst<T>(
    scope: string,
    key: string,
    fingerprint: string,
    action: () => Promise<{ status: number; body: T }> | { status: number; body: T }
  ): Promise<IdempotentResult<T>> {
    // Re-check after acquiring the in-process gate. A durable implementation
    // must also enforce a unique (scope, key) constraint transactionally.
    const existing = this.db.getIdempotency(scope, key);
    if (existing) return this.replay<T>(scope, fingerprint, existing);

    const result = await action();
    const record: IdempotencyRecord = {
      scope,
      key,
      fingerprint,
      status: result.status,
      body: structuredClone(result.body),
      created_at: new Date().toISOString()
    };
    this.db.saveIdempotency(record);
    return { ...result, replayed: false };
  }

  private replay<T>(
    scope: string,
    fingerprint: string,
    existing: IdempotencyRecord
  ): IdempotentResult<T> {
    if (existing.fingerprint !== fingerprint) throw new IdempotencyConflictError(scope);
    return {
      status: existing.status,
      body: structuredClone(existing.body) as T,
      replayed: true
    };
  }
}

export const idempotencyService = new IdempotencyService();
