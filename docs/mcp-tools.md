# MCP tool surface

The MCP surface is intentionally narrow. Tools are task-level interfaces over canonical data rather than arbitrary database or JSON mutation primitives.

## Read tools

### `get_trip`
Reads the current or historical trip version.

### `get_place`
Reads one canonical place.

### `search_places`
Searches the configured place adapter. The bootstrap adapter searches local demo data only.

### `get_reservation`
Reads one reservation and its protection state.

### `get_constraints`
Reads all constraints attached to a trip.

### `get_change_proposal`
Reads one proposal and its validation result.

## Planning tools

### `calculate_route`
Uses the configured route adapter. Bootstrap mode returns an explicitly labeled estimate so it cannot be mistaken for live routing data.

### `create_change_proposal`
Creates a proposal tied to the current `Trip.version`. It does not mutate the trip.

### `validate_change_proposal`
Checks version conflicts, locked items, fixed reservations, supported constraints, and unsupported mutation targets.

## Mutation tools

### `apply_change_proposal`
Applies only an externally approved, successfully validated proposal. The MCP server itself exposes no approval tool.

### `rollback_trip`
Administrative operation disabled by default. Production deployments should replace the bootstrap environment switch with authenticated operator authorization and approval receipts.

## Intentionally absent

The following tools should not be added without a design review:

- `update_trip_json`
- arbitrary JSON Patch
- arbitrary SQL
- arbitrary shell execution
- direct provider credential access
- a tool that approves its own AI-generated proposal

## Typical flow

```text
get_trip
  -> get_constraints
  -> search_places / calculate_route
  -> create_change_proposal
  -> validate_change_proposal
  -> human review outside MCP
  -> apply_change_proposal
  -> get_trip (new version)
```
