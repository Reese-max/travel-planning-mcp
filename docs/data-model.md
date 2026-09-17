# Canonical data model

Travel Planning MCP separates the canonical trip state from external provider payloads. The five primary contracts are JSON Schema Draft 2020-12 files under `schemas/`.

## Relationship overview

```text
Trip
├── place_ids -----------------> Place[]
├── reservation_ids -----------> Reservation[]
├── constraint_ids ------------> Constraint[]
├── days[].items[]
│   ├── place_id --------------> Place
│   └── reservation_id --------> Reservation
└── change_proposal_ids -------> ChangeProposal[]
```

## Trip

`Trip` is the aggregate root. Every material mutation increments `version`. A planning agent should always read the current version before proposing changes.

Important fields:

- `trip_id`: stable canonical identifier.
- `version`: optimistic concurrency boundary.
- `days`: ordered itinerary state.
- `reservation_ids`: references to formal bookings.
- `constraint_ids`: references to hard and soft planning rules.
- `change_proposal_ids`: audit trail of proposals that were applied to this trip lineage.

## Place

`Place` normalizes locations without making one external provider canonical. Provider identifiers live under `external_ids`; user-authored metadata is separate under `user_metadata`.

This distinction matters because provider facts can become stale while user intent such as `must_visit` remains durable.

## Reservation

`Reservation` represents a booking, ticket, transport segment, restaurant booking, activity, or other commitment. `fixed: true` means the planner cannot move or materially alter it through an ordinary AI proposal.

Imported reservations should preserve a source identity such as Gmail message ID, Calendar event ID, or provider booking ID when available.

## Constraint

Constraints express planning rules.

- `hard`: violation blocks application.
- `soft`: violation may be shown as a warning with rationale.

The schema intentionally keeps `parameters` extensible while the application layer gives each constraint type typed semantics.

Examples:

```json
{
  "type": "return_by",
  "strength": "hard",
  "parameters": { "time": "21:00" }
}
```

```json
{
  "type": "max_walking_distance",
  "strength": "soft",
  "parameters": { "kilometers_per_day": 8 }
}
```

## ChangeProposal

`ChangeProposal` is the only normal AI write path. It carries:

- `base_trip_version`;
- explicit operations;
- validation results;
- impact summary;
- provenance (`generated_by`);
- lifecycle state.

A stale proposal must not apply to a newer trip version.

## Mutation lifecycle

```text
draft
  -> validating
  -> validated / needs_review
  -> external human approval
  -> approved
  -> applied
```

Rejection or expiry can occur before application. The MCP surface deliberately has no tool that can mark its own proposal as approved.
