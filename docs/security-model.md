# Security and mutation model

The project is designed for AI-assisted planning without giving the model unrestricted write access to canonical travel state.

## Threat model

Relevant failures include:

- an agent overwriting a trip with malformed or stale JSON;
- moving a paid flight, hotel, ticket, or other fixed booking;
- ignoring a hard accessibility/time/budget constraint;
- introducing impossible schedule overlaps;
- applying a proposal created against an older trip version;
- treating estimated route data as authoritative live data;
- using model text as authorization for privileged changes;
- giving the same credential both planning and self-approval capability.

## Controls

### 1. No raw trip mutation tool

The MCP surface does not expose arbitrary JSON Patch, arbitrary SQL, or `update_trip_json`.

### 2. Proposal boundary

AI writes become `ChangeProposal` objects. Creating or validating a proposal does not modify the canonical trip.

### 3. Simulation before mutation

Validation applies supported operations to an isolated trip clone first. The validator then checks schedule conflicts, fixed/locked items, version state, and supported hard/soft constraints before a proposal can become `validated`.

### 4. Version binding

Every proposal records `base_trip_version`. Validation, approval, and apply all reject stale proposals after the canonical trip advances.

### 5. Protected commitments

`Reservation.fixed === true`, locked itinerary items, and hard `fixed_item` constraints block ordinary mutation.

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

### 8. Safe network default

The REST API binds to `127.0.0.1` by default. If the process is configured to bind to a non-loopback host, startup fails unless `TRAVEL_API_KEY` is configured.

This is a bootstrap safeguard, not a replacement for production OAuth/ACLs.

### 9. Admin operations disabled by default on MCP

`rollback_trip` is disabled unless an operator explicitly sets `ENABLE_ADMIN_MCP_WRITES=true`.

REST rollback requires the separate approval credential.

### 10. Immutable version history

Applying or rolling back creates a new trip version. Historical versions are not rewritten.

### 11. Audit trail

The current store records proposal creation, validation, approval, rejection, application, and rollback events. Audit data is still in-memory in the MVP and must move to durable storage before production.

## Current credential rules

Local development:

- `/health` is public;
- when `TRAVEL_API_KEY` is configured, `/v1/*` requires `Authorization: Bearer ...`;
- approval endpoints additionally require `X-Approval-Key`;
- approval endpoints return `503` when `APPROVAL_API_KEY` is not configured.

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
- idempotency keys for writes;
- rate limits and abuse controls;
- provider credential isolation;
- secret management outside the repository;
- schema validation at every persistence/API boundary;
- durable database transactions around apply/rollback;
- privacy controls for personal itinerary/location data;
- retention/deletion controls for imported booking data.
