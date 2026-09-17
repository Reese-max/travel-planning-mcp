# Architecture

## Design goal

Travel Planning MCP is an AI-native travel state layer, not another itinerary chatbot. The canonical trip is structured, provider-independent, versioned, and safe for agents to read and propose changes against.

```text
AI clients
GPT / Claude / Gemini / Codex / custom agents
                       |
                       v
                MCP tool surface
                       |
                       v
              Canonical service layer
        +--------------+---------------+
        |              |               |
        v              v               v
   Trip store      Proposal flow    Constraint validator
        |              |               |
        +--------------+---------------+
                       |
                       v
                  Adapter layer
       Places / Routes / Weather / Transit
       Flights / Calendar / Email / Hotels
```

## Domain layer

The domain model is independent of Google Maps, TDX, OSM, airlines, booking systems, or calendar providers. Provider-specific identifiers and freshness metadata are retained without making their raw payloads canonical.

## Adapter layer

Adapters normalize external data into the core contracts. Planned adapters include:

- Places: Google Places, OSM, government tourism data;
- Routes: Google Routes, transit/GTFS/TDX, routing engines;
- Weather: forecast and warning providers;
- Reservations: Gmail, Calendar, airline/hotel/ticket providers;
- Flights: schedule/status providers.

Each adapter should return source/freshness metadata. Estimates must be visibly different from live data.

## Planning layer

The planner consumes:

1. current `Trip` version;
2. referenced `Place` and `Reservation` objects;
3. enabled `Constraint` objects;
4. route/weather/provider context;
5. user intent.

It outputs a `ChangeProposal`, never a raw replacement trip.

## Persistence

The bootstrap implementation uses an in-memory store so the safety workflow can be exercised immediately. A durable implementation should preserve:

- immutable trip versions;
- proposal lifecycle;
- approvals;
- audit events;
- provider identity/freshness;
- idempotent writes.

A relational store such as PostgreSQL is a natural next step, but the domain API should stay storage-agnostic.

## Transport

The first transport is stdio through the MCP TypeScript SDK. Streamable HTTP can be added as a second transport without changing domain contracts or tools.
