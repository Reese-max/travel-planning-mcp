# Roadmap

## Phase 0 — Canonical foundation

- [x] Define Trip / Place / Reservation / Constraint / ChangeProposal schemas.
- [x] Add strict TypeScript domain types.
- [x] Add versioned in-memory store.
- [x] Add safe proposal creation/validation/apply flow.
- [x] Expose initial stdio MCP tools.
- [x] Add demo place search and route estimator with explicit non-live labeling.
- [x] Add safety tests.

## Phase 1 — Durable API

- [ ] Add REST/OpenAPI implementation around the same service layer.
- [ ] Add PostgreSQL persistence and immutable trip version history.
- [ ] Add JSON Schema validation at ingress/egress boundaries.
- [ ] Add idempotency keys for mutations.
- [ ] Add authenticated users, trip ownership, collaborators, and scopes.
- [ ] Add human approval receipts and audit events.

## Phase 2 — Real travel context adapters

- [ ] Google Places adapter.
- [ ] Google Routes adapter.
- [ ] Weather adapter.
- [ ] TDX / GTFS transit adapters.
- [ ] OSM POI adapter.
- [ ] Flight schedule/status adapter.
- [ ] Calendar reservation import.
- [ ] Email booking extraction.

All adapters must retain source and freshness metadata.

## Phase 3 — Constraint-aware planner

- [ ] Full typed semantics for every Constraint type.
- [ ] Route-matrix based daily optimization.
- [ ] Opening-hours feasibility.
- [ ] Reservation and ticket lock handling.
- [ ] Weather-aware replanning.
- [ ] Budget and walking-distance impact calculations.
- [ ] Multiple alternative proposals rather than a single opaque plan.

## Phase 4 — Collaboration and live travel

- [ ] Multi-traveler preference aggregation.
- [ ] Conflict explanation and voting/approval.
- [ ] Live delay/cancellation/event handling.
- [ ] Proposal diffs in a human UI.
- [ ] Calendar write-back and provider synchronization.

## Definition of production-ready

Production-ready means more than a working LLM demo. At minimum the system should have durable state, authentication/authorization, provider quota handling, audit logs, schema validation, idempotent writes, stale-data handling, observability, recovery/rollback evidence, and integration tests against real provider sandboxes or controlled fixtures.
