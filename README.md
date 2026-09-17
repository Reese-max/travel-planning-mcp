# Travel Planning MCP

AI-readable and AI-writable travel planning infrastructure built around a canonical trip model, constraint-aware planning, and safe change proposals.

## Goal

Instead of asking an AI to rewrite an itinerary as free-form text, this project exposes a structured **Travel Planning API + MCP server** so GPT, Claude, Gemini, Codex, and other agents can:

- read trips, places, reservations, and constraints;
- search or enrich travel context through adapters;
- calculate routes and validate itinerary feasibility;
- propose itinerary changes without directly overwriting the canonical trip;
- require validation and approval before applying changes;
- version trips and support rollback.

## Safety model

AI agents never receive a raw `update_trip_json` capability.

```text
Trip vN
  -> read context
  -> create ChangeProposal
  -> validate hard/soft constraints
  -> human/system approval
  -> apply
  -> Trip vN+1
```

Confirmed reservations and `hard` constraints are protected. Every applied proposal records its base trip version so stale proposals can be rejected.

## Core schemas

The first version defines five canonical JSON Schema Draft 2020-12 models:

- `Trip`
- `Place`
- `Reservation`
- `Constraint`
- `ChangeProposal`

See [`schemas/`](./schemas) and [`docs/data-model.md`](./docs/data-model.md).

## Planned MCP tools

Read tools:

- `get_trip`
- `get_place`
- `get_reservation`
- `get_constraints`
- `get_change_proposal`

Planning tools:

- `search_places`
- `calculate_route`
- `create_change_proposal`
- `validate_change_proposal`

Mutation tools:

- `apply_change_proposal`
- `reject_change_proposal`
- `rollback_trip`

Mutations operate on validated proposals or versions, not arbitrary trip JSON.

## Architecture

```text
GPT / Claude / Gemini / Codex
            |
            v
      Travel Planning MCP
            |
            v
     Canonical Travel API
            |
   +--------+---------+
   |        |         |
 Trip DB  Planner   Validator
   |        |         |
   +--------+---------+
            |
     Adapter Layer
 Places / Routes / Weather / Calendar / Flights
```

The canonical layer is provider-independent. Google Maps, TDX, OSM, flight providers, calendar services, or future travel applications should connect through adapters rather than leaking provider-specific shapes into the trip model.

## Development

Requires Node.js 20+.

```bash
npm install
npm run check
npm run build
npm start
```

The initial MCP transport is stdio. Streamable HTTP can be added later without changing the canonical schemas.

## Repository status

This repository is currently an MVP foundation. The schemas, TypeScript domain types, proposal workflow, examples, tests, OpenAPI contract, and MCP tool skeleton are being built first. Provider adapters will follow after the canonical model is stable.

## License

MIT
