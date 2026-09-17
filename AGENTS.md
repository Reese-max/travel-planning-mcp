# AGENTS.md

Guidance for coding agents working in this repository.

## Product invariant

The canonical trip must never be mutated directly by an AI tool. AI-originated changes flow through:

`read -> ChangeProposal -> simulate/validate -> external approval -> apply-time revalidation -> new Trip version`

Do not add a raw `update_trip_json`, arbitrary JSON Patch, arbitrary SQL, shell execution, or unreviewed provider write tool to the MCP surface.

## Safety invariants

1. `Reservation.fixed === true` is protected.
2. An AI proposal must not bypass fixed-reservation protection by adding/rebinding the same reservation as a new unlocked item.
3. Persistence implementations must preserve fixed reservation lock and canonical timing invariants.
4. `Constraint.strength === "hard"` must block apply when violated or when the constraint cannot be evaluated safely.
5. A proposal is bound to `base_trip_version`; stale proposals must fail.
6. Proposal validity must be rechecked at approval and immediately before apply.
7. Applying a proposal creates a new immutable trip version.
8. Rollback creates a new version derived from an older snapshot; history is not rewritten.
9. Provider data and user-authored planning metadata remain distinguishable.
10. Estimated or stale route/place/weather data must be labeled with provider, source/freshness, and whether it is live.
11. Destructive/admin MCP tools must be disabled by default.
12. Ordinary AI clients must never receive `APPROVAL_API_KEY` or an equivalent operator approval capability.
13. Apply/rollback REST writes must remain retry-safe and idempotent.
14. Reusing an idempotency key with a different request must fail; do not silently execute it.

## Architecture boundaries

- `src/domain`: provider-independent canonical types.
- `src/ports`: persistence/provider contracts (`TravelStore`, `PlaceProvider`, `RouteProvider`, etc.).
- `src/services`: planning, validation, proposal, context, idempotency, and orchestration behavior.
- `src/store`: concrete persistence implementations; current implementation is in-memory only.
- `src/adapters`: concrete external-data implementations. Provider payloads must be normalized here.
- `src/mcp`: narrow task-level MCP tools.
- `src/http`: REST/application/operator approval surface.
- `schemas`: canonical JSON Schema Draft 2020-12 contracts.

Domain/services should depend on ports, not on Google/TDX/OSM/provider response types. Do not import external provider SDK payload types into canonical domain models.

## Provider rules

Every live provider adapter must make it possible to determine:

- provider identity;
- whether data is live vs demo/estimated;
- retrieval or calculation time;
- important freshness/caching semantics.

Do not remove the `live`/source metadata merely to simplify a response. Clients need this metadata to avoid presenting estimates as facts.

## Persistence rules

A durable `TravelStore` implementation must preserve semantics already enforced by `MemoryStore`, including:

- immutable trip versions;
- proposal lifecycle;
- approval receipts;
- audit events;
- fixed reservation invariants;
- idempotency records.

For a multi-instance deployment, idempotency requires a transactional unique `(scope, key)` constraint or equivalent locking mechanism. The in-process gate is not sufficient by itself.

## Change discipline

Prefer minimal, testable changes. Add tests for any change affecting:

- versioning;
- fixed reservations;
- hard/soft constraints;
- proposal state transitions;
- mutation authorization;
- apply-time revalidation;
- idempotency/retries/concurrency;
- adapter freshness/source metadata;
- provider normalization;
- persistence invariants.

Run `npm run check` and `npm run build` before merging.
