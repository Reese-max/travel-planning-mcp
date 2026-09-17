import { describe, expect, it } from 'vitest';
import {
  IdempotencyConflictError,
  IdempotencyService
} from '../src/services/idempotency-service.js';
import { MemoryStore } from '../src/store/memory-store.js';

describe('IdempotencyService', () => {
  it('replays the first successful result without executing the action twice', async () => {
    const db = new MemoryStore();
    const service = new IdempotencyService(db);
    let executions = 0;

    const first = await service.execute('apply:proposal-1', 'same-key', { value: 1 }, () => {
      executions += 1;
      return { status: 200, body: { executions } };
    });

    const second = await service.execute('apply:proposal-1', 'same-key', { value: 1 }, () => {
      executions += 1;
      return { status: 200, body: { executions } };
    });

    expect(first).toMatchObject({ status: 200, body: { executions: 1 }, replayed: false });
    expect(second).toMatchObject({ status: 200, body: { executions: 1 }, replayed: true });
    expect(executions).toBe(1);
  });

  it('rejects reusing the same key with a different request fingerprint', async () => {
    const service = new IdempotencyService(new MemoryStore());

    await service.execute('create:trip-1', 'same-key', { value: 1 }, () => ({
      status: 201,
      body: { ok: true }
    }));

    await expect(
      service.execute('create:trip-1', 'same-key', { value: 2 }, () => ({
        status: 201,
        body: { ok: false }
      }))
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('allows the same key in independent operation scopes', async () => {
    const service = new IdempotencyService(new MemoryStore());

    const first = await service.execute('approve:one', 'key', { actor: 'a' }, () => ({
      status: 200,
      body: { proposal: 'one' }
    }));
    const second = await service.execute('approve:two', 'key', { actor: 'a' }, () => ({
      status: 200,
      body: { proposal: 'two' }
    }));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
  });
});
