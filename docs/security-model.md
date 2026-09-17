# Security and mutation model

The project is designed for AI-assisted planning without giving the model unrestricted write access to canonical travel state.

## Threat model

Relevant failures include:

- an agent overwriting a trip with malformed or stale JSON;
- moving a paid flight, hotel, ticket, or other fixed booking;
- ignoring a hard accessibility/time/budget constraint;
- applying a proposal created against an older trip version;
- treating estimated route data as authoritative live data;
- using model text as authorization for privileged changes.

## Controls

### 1. No raw trip mutation tool

The MCP surface does not expose arbitrary JSON Patch or `update_trip_json`.

### 2. Proposal boundary

AI writes become `ChangeProposal` objects. Creating or validating a proposal does not modify the canonical trip.

### 3. Version binding

Every proposal records `base_trip_version`. Apply fails if the current trip has advanced.

### 4. Protected commitments

`Reservation.fixed === true` and locked itinerary items block ordinary mutation.

### 5. Hard vs soft constraints

Hard violations block validation/apply. Soft violations are warnings that require explicit rationale in future planner logic.

### 6. External approval

The MCP server cannot approve its own proposals. `apply_change_proposal` only succeeds when another human-controlled surface has already marked the proposal as `approved`.

### 7. Admin operations disabled by default

`rollback_trip` is disabled unless an operator explicitly enables admin MCP writes in the server environment. Production deployments should replace this bootstrap switch with authenticated, scoped authorization.

### 8. Immutable version history

Applying or rolling back creates a new version. Historical versions are not rewritten.

## Production follow-ups

Before production use, add:

- authenticated users and per-trip ACLs;
- scoped OAuth/service tokens;
- approval receipts bound to actor, proposal ID, and trip version;
- durable audit logs;
- idempotency keys for writes;
- rate limits and abuse controls;
- provider credential isolation;
- secret management outside the repository;
- replay protection for approval/apply calls;
- schema validation at every API boundary.
