# Architecture

## Design goal

Travel Planning MCP is an AI-native travel state layer, not another itinerary chatbot. The canonical trip is structured, provider-independent, versioned, and safe for agents to read and propose changes against.

```text
AI clients
GPT / Claude / Gemini / Codex / custom agents
                       |
                 +-----+------+
                 |            |
                 v            v
             MCP tools      REST API
                 |            |
                 +-----+------+
                       v
              Canonical service layer
        +--------------+---------------+
        |              |               |
        v              v               v
 ProposalService  TripContextService  RouteService
        |              |               |
        +-------+------+-------+-------+
                |              |
                v              v
           TravelStore     Provider Ports
                |          +-----------+
                |          |           |
                v          v           v
           MemoryStore PlaceProvider RouteProvider
             (today)      |           |
                          v           v
                       Adapters     Adapters
```

## Domain layer

The domain model is independent of Google Maps, TDX, OSM, airlines, booking systems, or calendar providers. Provider-specific identifiers and freshness metadata are retained without making their raw payloads canonical.

Canonical contracts remain `Trip`, `Place`, `Reservation`, `Constraint`, and `ChangeProposal`.

## Persistence port

Services depend on the `TravelStore` interface rather than a database implementation. The port owns canonical state concerns such as:

- current and historical trip versions;
- places and reservations;
- constraints;
- proposal lifecycle;
- approval receipts;
- audit events;
- idempotency records.

`MemoryStore` is the development implementation. A future PostgreSQL implementation should preserve the same behavioral invariants, especially immutable versions, fixed-reservation checks, and idempotent mutation semantics.

The persistence boundary intentionally performs a second fixed-reservation check. Even if a higher-level proposal validator regresses, storing a trip that unlocks or retimes a fixed reservation is rejected.

## Provider ports

External travel data is accessed through normalized ports rather than directly from planner/MCP code.

### `PlaceProvider`

Responsibilities:

- search places;
- read a normalized place;
- expose a `ProviderDescriptor` containing `id`, `live`, and `description`.

Current implementation: `DemoPlaceProvider` backed by seeded data.

Future implementations can include Google Places, OSM, and government tourism datasets.

### `RouteProvider`

Responsibilities:

- calculate route distance/time for a travel mode;
- include source and calculation timestamp;
- expose whether the provider is live.

Current implementation: `DemoRouteProvider`, which explicitly labels Haversine-based results as estimates.

Future implementations can include Google Routes, TDX/GTFS-aware transit routing, or another routing engine.

## Adapter rule

Adapters normalize external data into canonical contracts. Provider-specific response shapes must not leak into `Trip` or planner logic.

Every provider integration should retain enough metadata to answer:

- Which provider supplied this fact?
- Is it live or estimated?
- When was it retrieved/calculated?
- Can it safely be cached, and for how long?

Planned adapter families include:

- Places: Google Places, OSM, government tourism data;
- Routes: Google Routes, transit/GTFS/TDX, routing engines;
- Weather: forecast and warning providers;
- Reservations: Gmail, Calendar, airline/hotel/ticket providers;
- Flights: schedule/status providers.

## Planning layer

The planner consumes:

1. current `Trip` version;
2. referenced `Place` and `Reservation` objects;
3. enabled `Constraint` objects;
4. route/weather/provider context;
5. user intent.

It outputs a `ChangeProposal`, never a raw replacement trip.

Proposal validation is simulation-based: supported operations are applied to an isolated clone, then schedules and constraints are checked. The proposal is re-evaluated again at approval and apply time to reduce time-of-check/time-of-use risk.

## Mutation reliability

REST mutations use idempotency scopes and request fingerprints. `apply` and `rollback` require an `Idempotency-Key`; repeated identical calls replay the stored result instead of creating another trip version.

The current in-process idempotency gate prevents concurrent same-key execution within one Node process. A durable multi-instance deployment must enforce `(scope, key)` uniqueness transactionally in the database.

## Persistence today vs production

The bootstrap implementation uses an in-memory store so the safety workflow can be exercised immediately. A durable implementation must preserve:

- immutable trip versions;
- proposal lifecycle;
- approvals;
- audit events;
- provider identity/freshness;
- idempotent writes;
- transactional apply/rollback;
- fixed reservation invariants.

PostgreSQL is a natural next implementation, but the service layer should continue depending only on `TravelStore`.

## Transport

The current MCP transport is stdio through the MCP TypeScript SDK. REST is provided separately for application access and human/operator approval.

Streamable HTTP MCP can be added later without changing domain contracts, proposal semantics, or provider/persistence ports.
