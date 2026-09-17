import { describe, expect, it } from 'vitest';
import { demoTripId } from '../src/data/seed.js';
import { MemoryStore } from '../src/store/memory-store.js';
import {
  CanonicalSchemaValidationError,
  schemaRegistry
} from '../src/validation/schema-registry.js';
import type { ChangeProposal, Trip } from '../src/domain/types.js';

describe('SchemaRegistry', () => {
  it('accepts canonical seeded travel data', () => {
    const db = new MemoryStore();
    const trip = db.getTrip(demoTripId)!;
    expect(schemaRegistry.assertTrip(trip)).toEqual(trip);
  });

  it('rejects malformed trip identifiers even when TypeScript is bypassed', () => {
    const db = new MemoryStore();
    const invalid = {
      ...db.getTrip(demoTripId)!,
      trip_id: 'not-a-uuid'
    } as Trip;

    expect(() => db.saveTrip(invalid)).toThrow(CanonicalSchemaValidationError);
  });

  it('rejects unknown canonical trip fields because schemas are closed', () => {
    const db = new MemoryStore();
    const invalid = {
      ...db.getTrip(demoTripId)!,
      unexpected_provider_payload: { raw: true }
    } as Trip;

    expect(() => db.saveTrip(invalid)).toThrow(/additional properties/i);
  });

  it('rejects malformed proposals at the persistence boundary', () => {
    const db = new MemoryStore();
    const invalid = {
      proposal_id: '99999999-9999-4999-8999-999999999999',
      trip_id: demoTripId,
      base_trip_version: 1,
      status: 'draft',
      operations: [],
      generated_by: { type: 'ai' },
      created_at: new Date().toISOString()
    } as ChangeProposal;

    expect(() => db.saveProposal(invalid)).toThrow(/must NOT have fewer than 1 items/i);
  });
});
