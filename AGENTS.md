# AGENTS.md

Guidance for coding agents working in this repository.

## Product invariant

The canonical trip must never be mutated directly by an AI tool. AI-originated changes flow through:

`read -> ChangeProposal -> validate -> external approval -> apply -> new Trip version`

Do not add a raw `update_trip_json`, arbitrary JSON Patch, arbitrary SQL, shell execution, or unreviewed provider write tool to the MCP surface.

## Safety invariants

1. `Reservation.fixed === true` is protected.
2. `Constraint.strength === "hard"` must block apply when violated.
3. A proposal is bound to `base_trip_version`; stale proposals must fail.
4. Applying a proposal creates a new immutable trip version.
5. Rollback creates a new version derived from an older snapshot; history is not rewritten.
6. Provider data and user-authored planning metadata remain distinguishable.
7. Estimated or stale route/place/weather data must be labeled with source and freshness.
8. Destructive/admin MCP tools must be disabled by default.

## Architecture boundaries

- `src/domain`: provider-independent canonical types.
- `src/services`: planning, validation, proposal, and route behavior.
- `src/store`: persistence abstraction; current implementation is in-memory only.
- `src/mcp`: narrow task-level MCP tools.
- `schemas`: canonical JSON Schema Draft 2020-12 contracts.
- `adapters` (future): Google Maps, TDX, OSM, weather, calendar, flights, hotels, etc.

Provider-specific response shapes must be normalized before entering the domain layer.

## Change discipline

Prefer minimal, testable changes. Add tests for any change affecting:

- versioning;
- fixed reservations;
- hard/soft constraints;
- proposal state transitions;
- mutation authorization;
- adapter freshness/source metadata.

Run `npm run check` before merging.
