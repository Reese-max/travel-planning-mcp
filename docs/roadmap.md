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
- [x] Add provider-status discovery (`live` vs demo/estimated).
- [x] Add request idempotency for retry-sensitive writes.
- [x] Require idempotency for apply and rollback.
- [x] Serialize concurrent same-key requests inside one process.
- [x] Re-evaluate proposals at approval and immediately before apply.
- [x] Reject fixed-reservation add/rebind bypasses.
- [x] Add fixed-reservation invariants at the persistence boundary.
- [ ] Add JSON Schema validation at persistence/API boundaries.
- [ ] Add request correlation IDs and structured logs.

## Phase 2 — Persistence and provider boundaries

- [x] Define `TravelStore` persistence port.
- [x] Make `MemoryStore` implement `TravelStore`.
- [x] Define normalized `PlaceProvider` port.
- [x] Define normalized `RouteProvider` port.
- [x] Wrap demo place and route data in explicit provider adapters.
- [x] Allow external providers to persist normalized places into the canonical store.
- [ ] Add PostgreSQL persistence and immutable trip version history.
- [ ] Enforce durable unique `(idempotency_scope, idempotency_key)` constraints.
- [ ] Wrap proposal apply/rollback in database transactions.
- [ ] Persist approval receipts and audit events durably.
- [ ] Add authenticated users and per-trip ownership/ACLs.
- [ ] Replace shared API keys with scoped OAuth/service identities.
- [ ] Add data retention/deletion support for itinerary and imported booking data.

## Phase 3 — Real travel context adapters

Highest-priority adapters:

- [x] Google Places API (New) Text Search adapter behind `PlaceProvider`.
- [x] Google Routes API v2 `computeRoutes` adapter behind `RouteProvider`.
- [x] Environment-selectable demo/live place and route providers.
- [x] Unit tests for provider normalization, persistence, routing, and upstream failures.
- [ ] Google Place Details refresh path for persisted canonical Place IDs.
- [ ] Location bias / language / included-type inputs for place search.
- [ ] Route-matrix support for optimization.
- [ ] Provider timeout, retry/backoff, quota telemetry, and circuit-breaker behavior.

Then:

- [ ] Weather adapter.
- [ ] TDX / GTFS transit adapters.
- [ ] OSM POI adapter.
- [ ] Flight schedule/status adapter.
- [ ] Calendar reservation import.
- [ ] Email booking extraction.

All adapters must retain source, retrieval/calculation time, and freshness metadata. Estimated data must never be presented as live provider data. Live providers should use narrowly scoped field masks and explicit quota/error handling.

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
