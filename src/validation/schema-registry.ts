import { readFileSync } from 'node:fs';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ChangeProposal, Constraint, Place, Reservation, Trip } from '../domain/types.js';

export type CanonicalSchemaName =
  | 'Trip'
  | 'Place'
  | 'Reservation'
  | 'Constraint'
  | 'ChangeProposal';

const schemaFiles: Record<CanonicalSchemaName, string> = {
  Trip: 'trip.schema.json',
  Place: 'place.schema.json',
  Reservation: 'reservation.schema.json',
  Constraint: 'constraint.schema.json',
  ChangeProposal: 'change-proposal.schema.json'
};

function loadSchema(fileName: string): object {
  const url = new URL(`../../schemas/${fileName}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as object;
}

function compactErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath || '/';
    const message = error.message ?? error.keyword;
    return `${path} ${message}`;
  });
}

export class CanonicalSchemaValidationError extends Error {
  readonly schemaName: CanonicalSchemaName;
  readonly issues: string[];

  constructor(schemaName: CanonicalSchemaName, errors: ErrorObject[] | null | undefined) {
    const issues = compactErrors(errors);
    super(`${schemaName} failed canonical JSON Schema validation: ${issues.join('; ')}`);
    this.name = 'CanonicalSchemaValidationError';
    this.schemaName = schemaName;
    this.issues = issues;
  }
}

export class SchemaRegistry {
  private readonly validators: Record<CanonicalSchemaName, ValidateFunction>;

  constructor() {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      allowUnionTypes: true
    });
    addFormats(ajv);

    this.validators = {
      Trip: ajv.compile(loadSchema(schemaFiles.Trip)),
      Place: ajv.compile(loadSchema(schemaFiles.Place)),
      Reservation: ajv.compile(loadSchema(schemaFiles.Reservation)),
      Constraint: ajv.compile(loadSchema(schemaFiles.Constraint)),
      ChangeProposal: ajv.compile(loadSchema(schemaFiles.ChangeProposal))
    };
  }

  assert<T>(schemaName: CanonicalSchemaName, value: T): T {
    const validate = this.validators[schemaName];
    if (!validate(value)) {
      throw new CanonicalSchemaValidationError(schemaName, validate.errors);
    }
    return value;
  }

  assertTrip(value: Trip): Trip {
    return this.assert('Trip', value);
  }

  assertPlace(value: Place): Place {
    return this.assert('Place', value);
  }

  assertReservation(value: Reservation): Reservation {
    return this.assert('Reservation', value);
  }

  assertConstraint(value: Constraint): Constraint {
    return this.assert('Constraint', value);
  }

  assertChangeProposal(value: ChangeProposal): ChangeProposal {
    return this.assert('ChangeProposal', value);
  }
}

export const schemaRegistry = new SchemaRegistry();
