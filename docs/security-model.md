# Security and mutation model

The project is designed for AI-assisted planning without giving the model unrestricted write access to canonical travel state.

## Threat model

Relevant failures include:

- an agent overwriting a trip with malformed or stale JSON;
- moving a paid flight, hotel, ticket, or other fixed booking;
- re-adding a fixed reservation as a new unlocked item to bypass protection;
- ignoring a hard accessibility/time/budget constraint;
- introducing impossible schedule overlaps;
- applying a proposal created against an older trip version;
- constraints/reservations changing between validation and apply;
- treating estimated route data as authoritative live data;
- retrying a mutation and accidentally applying it twice;
- reusing an idempotency key with a different request;
- using model text as authorization for privileged changes;
- giving the same credential both planning and self-approval capability.

## Controls

### 1. No raw trip mutation tool

The MCP surface does not expose arbitrary JSON Patch, arbitrary SQL, or `update_trip_json`.

### 2. Proposal boundary

AI writes become `ChangeProposal` objects. Creating or validating a proposal does not modify the canonical trip.

### 3. Simulation before mutation

Validation applies supported operations to an isolated trip clone first. The validator then checks schedule conflicts, fixed/locked items, version state, and supported hard/soft constraints before a proposal can become `validated`.

The proposal is evaluated again at approval time and immediately before apply. Apply uses the freshly simulated state rather than trusting an old validation snapshot.

### 4. Version binding

Every proposal records `base_trip_version`. Validation, approval, and apply all reject stale proposals after the canonical trip advances.

### 5. Protected commitments

`Reservation.fixed === true`, locked itinerary items, and hard `fixed_item` constraints block ordinary mutation.

AI `add` operations cannot create locked items and cannot add/rebind a fixed reservation. The `TravelStore` implementation also checks fixed reservation invariants before storing a trip:

- the itinerary item must be locked;
- the fixed reservation must still exist;
- start/end times must match the canonical reservation.

This provides a second safety boundary even if a higher service-layer check regresses.

### 6. Hard vs soft constraints

Hard violations block validation/apply. Soft violations are retained as warnings so the reviewer can see the trade-off.

If a hard constraint type cannot yet be evaluated safely, validation fails conservatively instead of pretending the constraint passed.

### 7. Separate approval credential

The MCP server cannot approve its own proposals.

The REST surface separates credentials:

```text
TRAVEL_API_KEY
  -> ordinary travel API access
  -> read context
  -> create/validate proposal

APPROVAL_API_KEY
  -> operator-only header
  -> approve / reject / apply / rollback
```

`APPROVAL_API_KEY` must not be provided to ordinary AI clients. A successful approval creates an explicit receipt containing `approval_id`, `actor_id`, `channel`, and timestamp.

### 8. Retry-safe idempotent writes

REST mutation endpoints can use `Idempotency-Key`.

- proposal creation: optional but recommended;
- approve/reject: optional but recommended;
- apply: required;
- rollback: required.

The request payload is canonicalized and SHA-256 fingerprinted. Repeating the same scope/key/request replays the original successful response. Reusing the same scope/key with a different fingerprint returns a conflict.

Concurrent same-key requests are serialized inside one Node process. A production multi-instance deployment still requires a durable unique `(scope, key)` constraint and transaction/locking semantics in the database.

### 9. Safe network default

The REST API binds to `127.0.0.1` by default. If the process is configured to bind to a non-loopback host, startup fails unless `TRAVEL_API_KEY` is configured.

This is a bootstrap safeguard, not a replacement for production OAuth/ACLs.

### 10. Provider truthfulness

`PlaceProvider` and `RouteProvider` expose provider descriptors containing a `live` flag and description. The demo route provider labels its results as estimates.

Clients should inspect `get_provider_status` or `GET /v1/providers` rather than assuming that any route/place result is live.

### 11. Admin operations disabled by default on MCP

`rollback_trip` is disabled unless an operator explicitly sets `ENABLE_ADMIN_MCP_WRITES=true`.

REST rollback requires the separate approval credential plus an idempotency key.

### 12. Immutable version history

Applying or rolling back creates a new trip version. Historical versions are not rewritten.

### 13. Audit trail

The current store records proposal creation, validation, approval, rejection, application, and rollback events. Audit data is still in-memory in the MVP and must move to durable storage before production.

## Current credential rules

Local development:

- `/health` is public;
- when `TRAVEL_API_KEY` is configured, `/v1/*` requires `Authorization: Bearer ...`;
- approval endpoints additionally require `X-Approval-Key`;
- approval endpoints return `503` when `APPROVAL_API_KEY` is not configured;
- apply/rollback also require `Idempotency-Key`.

Remote binding:

- `TRAVEL_API_KEY` is mandatory;
- TLS should be terminated by a trusted reverse proxy/platform;
- `APPROVAL_API_KEY` should be stored in a secret manager and exposed only to the human/operator approval service.

## Production follow-ups

Before production use, add:

- authenticated users and per-trip ACLs;
- scoped OAuth/service tokens instead of shared API keys;
- durable approval receipts and audit logs;
- cryptographically bound approval/replay protection;
- durable idempotency records with transactional unique constraints;
- rate limits and abuse controls;
- provider credential isolation;
- secret management outside the repository;
- schema validation at every persistence/API boundary;
- durable database transactions around apply/rollback;
- privacy controls for personal itinerary/location data;
- retention/deletion controls for imported booking data.
