# Roadmap

## Phase 0 — Canonical foundation

- [x] Define Trip / Place / Reservation / Constraint / ChangeProposal schemas.
- [x] Add strict TypeScript domain types.
- [x] Add versioned in-memory store.
- [x] Add safe proposal creation/validation/apply flow.
- [x] Expose initial stdio MCP tools.
- [x] Add demo place search and route estimator with explicit non-live labeling.
- [x] Add safety tests.

## Phase 1 — Safe API surface

- [x] Add REST/OpenAPI implementation around the same service layer.
- [x] Add AI-friendly aggregate TripContext reads.
- [x] Add separate travel vs approval credentials.
- [x] Add explicit human approval receipts.
- [x] Add proposal lifecycle and rollback audit events.
- [x] Add schedule-overlap validation.
- [x] Add conservative unsupported-hard-constraint handling.
- [ ] Add JSON Schema validation at persistence/API boundaries.
- [ ] Add idempotency keys for proposal/apply/rollback writes.
- [ ] Add request correlation IDs and structured logs.

## Phase 2 — Durable identity and persistence

- [ ] Add PostgreSQL persistence and immutable trip version history.
- [ ] Wrap proposal apply/rollback in database transactions.
- [ ] Add authenticated users and per-trip ownership/ACLs.
- [ ] Replace shared API keys with scoped OAuth/service identities.
- [ ] Persist approval receipts and audit events durably.
- [ ] Add data retention/deletion support for itinerary and imported booking data.

## Phase 3 — Real travel context adapters

- [ ] Google Places adapter.
- [ ] Google Routes / route-matrix adapter.
- [ ] Weather adapter.
- [ ] TDX / GTFS transit adapters.
- [ ] OSM POI adapter.
- [ ] Flight schedule/status adapter.
- [ ] Calendar reservation import.
- [ ] Email booking extraction.

All adapters must retain source, retrieval time, and freshness metadata. Estimated data must never be presented as live provider data.

## Phase 4 — Constraint-aware planner

Already partially supported:

- [x] `fixed_item` protection.
- [x] `return_by`.
- [x] `start_after`.
- [x] `time_window`.
- [x] `max_places_per_day`.
- [x] `max_walking_distance` when route snapshots exist.
- [x] `max_daily_budget` for compatible known currencies.
- [x] allowed `transport_mode` checks.
- [x] `must_visit` / `avoid_place` / `avoid_category`.

Still needed:

- [ ] Typed semantics for accessibility, dietary, preferred-area, traveler requirements, and custom constraints.
- [ ] Route-matrix based daily optimization.
- [ ] Opening-hours feasibility.
- [ ] Weather-aware replanning.
- [ ] Better cost/route impact calculations from live adapters.
- [ ] Multiple alternative proposals rather than a single opaque plan.
- [ ] Explainable scoring for trade-offs between soft constraints.

## Phase 5 — Remote AI connectivity

- [ ] Add Streamable HTTP MCP transport.
- [ ] Add remote MCP authentication/authorization.
- [ ] Publish connector examples for GPT/Claude/Gemini-compatible clients.
- [ ] Add capability discovery and server metadata docs.

## Phase 6 — Collaboration and live travel

- [ ] Multi-traveler preference aggregation.
- [ ] Conflict explanation and voting/approval.
- [ ] Live delay/cancellation/event handling.
- [ ] Proposal diff/approval web UI.
- [ ] Calendar write-back and provider synchronization.
- [ ] Real-time replanning with explicit user approval boundaries.

## Definition of production-ready

Production-ready means more than a working LLM demo. At minimum the system should have durable state, authentication/authorization, provider quota handling, durable audit logs, schema validation, idempotent writes, stale-data handling, observability, transactional recovery/rollback evidence, privacy controls, and integration tests against real provider sandboxes or controlled fixtures.
