# Travel Planning MCP

AI-readable and AI-writable travel planning infrastructure built around a canonical trip model, constraint-aware planning, versioned proposals, and explicit human approval.

## What this project is

Instead of asking an AI to rewrite an itinerary as free-form text, this project gives GPT, Claude, Gemini, Codex, and other agents a structured **Travel Planning API + MCP server**.

Agents can:

- discover trips and read a complete trip context;
- read normalized places, reservations, and constraints;
- search places and calculate routes through adapters;
- propose itinerary changes without directly overwriting the canonical trip;
- simulate and validate schedule/constraint effects;
- apply a change only after a separate human/operator approval step;
- inspect version history and audit events.

## Core safety invariant

AI agents never receive a raw `update_trip_json` capability.

```text
Trip vN
  -> AI reads TripContext
  -> AI creates ChangeProposal
  -> system simulates + validates
  -> human/operator approval receipt
  -> apply
  -> Trip vN+1
```

The MCP tool surface intentionally has **no approval tool**. Approval is performed through a separate operator-controlled REST endpoint protected by `APPROVAL_API_KEY`.

Additional protections include:

- `Reservation.fixed === true` protection;
- locked itinerary items;
- hard vs soft constraints;
- schedule-overlap detection;
- stale `base_trip_version` rejection;
- explicit approval receipts;
- immutable trip version history;
- audit events for proposal lifecycle and rollback;
- admin rollback disabled by default on MCP.

## Five canonical schemas

The canonical data layer uses JSON Schema Draft 2020-12:

- `Trip`
- `Place`
- `Reservation`
- `Constraint`
- `ChangeProposal`

See [`schemas/`](./schemas) and [`docs/data-model.md`](./docs/data-model.md).

## Current MCP tools

### Read

- `list_trips`
- `get_trip`
- `get_trip_context`
- `get_place`
- `get_reservation`
- `get_constraints`
- `get_trip_audit`
- `get_change_proposal`

### Planning

- `search_places`
- `calculate_route`
- `create_change_proposal`
- `validate_change_proposal`

### Mutation

- `apply_change_proposal` — succeeds only when an external approval receipt already exists
- `rollback_trip` — disabled unless `ENABLE_ADMIN_MCP_WRITES=true`

There is deliberately no MCP `approve_change_proposal` tool.

## REST API

A lightweight Node HTTP API exposes the same canonical service layer.

Current endpoints include:

```text
GET  /health
GET  /v1/trips
GET  /v1/trips/:tripId
GET  /v1/trips/:tripId/context
GET  /v1/trips/:tripId/constraints
GET  /v1/trips/:tripId/audit
POST /v1/trips/:tripId/proposals
POST /v1/trips/:tripId/rollback

GET  /v1/places/search?q=...
GET  /v1/places/:placeId
GET  /v1/reservations/:reservationId
POST /v1/routes/estimate

GET  /v1/proposals/:proposalId
POST /v1/proposals/:proposalId/validate
POST /v1/proposals/:proposalId/approve
POST /v1/proposals/:proposalId/reject
POST /v1/proposals/:proposalId/apply
```

The full contract is in [`openapi/openapi.yaml`](./openapi/openapi.yaml).

## Authentication model

The development server binds to `127.0.0.1` by default.

- `TRAVEL_API_KEY`: Bearer credential for travel API access. It becomes mandatory when binding to a non-loopback host.
- `APPROVAL_API_KEY`: separate operator credential for approve/reject/apply/rollback REST calls.
- `ENABLE_ADMIN_MCP_WRITES`: enables MCP rollback only when explicitly set to `true`.

Never give `APPROVAL_API_KEY` to an ordinary AI client. The separation is what prevents a planner from self-approving its own proposal.

See [`.env.example`](./.env.example) and [`docs/security-model.md`](./docs/security-model.md).

## Architecture

```text
GPT / Claude / Gemini / Codex
            |
        MCP tools
            |
            v
    Canonical service layer  <---->  REST API / approval UI
            |
   +--------+---------+
   |        |         |
 Trip DB  Planner   Validator
   |        |         |
   +--------+---------+
            |
       Adapter Layer
 Places / Routes / Weather / Transit / Calendar / Flights
```

The canonical layer is provider-independent. Google Maps, TDX, OSM, flight providers, calendar services, and future travel applications should connect through adapters rather than leaking provider-specific payloads into `Trip`.

## Development

Requires Node.js 20+.

```bash
npm install
npm run check
npm run build
```

Run the local MCP stdio server:

```bash
npm run dev:mcp
```

Run the REST API:

```bash
cp .env.example .env
npm run dev:api
```

Environment files are not loaded automatically by the current bootstrap server, so export the values in your shell or process manager when needed.

Example local read:

```bash
curl http://127.0.0.1:8787/v1/trips \
  -H "Authorization: Bearer $TRAVEL_API_KEY"
```

Example operator approval:

```bash
curl -X POST http://127.0.0.1:8787/v1/proposals/<proposal-id>/approve \
  -H "Authorization: Bearer $TRAVEL_API_KEY" \
  -H "X-Approval-Key: $APPROVAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"actor_id":"human-reviewer","note":"Reviewed itinerary diff"}'
```

## Current limitations

This is still an MVP foundation:

- persistence is in-memory;
- place search uses demo data;
- route calculation is an explicitly labeled estimate, not live routing;
- no real weather/transit/flight/calendar provider is connected yet;
- REST auth is bootstrap API-key auth, not user OAuth/ACL;
- remote Streamable HTTP MCP transport is not yet enabled.

These limitations are deliberate so the canonical model and safety boundary stay stable before provider integrations are added.

## Roadmap

See [`docs/roadmap.md`](./docs/roadmap.md).

The next major steps are durable persistence/auth, real Places + Routes adapters, weather/transit/flight context, and remote MCP transport.

## License

MIT
