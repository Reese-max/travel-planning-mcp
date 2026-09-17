# Live travel data providers

The project defaults to deterministic demo providers so local development and CI never require paid API credentials. Live Google adapters can be enabled independently through environment variables.

## Google Places API (New)

Set:

```bash
PLACE_PROVIDER=google
GOOGLE_MAPS_API_KEY=...
```

The adapter uses Places API (New) Text Search and requests only the fields needed by the canonical `Place` model:

- place ID
- display name
- formatted address
- latitude/longitude
- primary type and types

Search results are normalized into canonical `Place` objects and persisted into the configured `TravelStore`. The external Google place ID remains under `external_ids.google_place_id` and `source.source_id`.

The canonical `place_id` is a deterministic UUID derived from the provider identity. This keeps AI/MCP-facing IDs provider-independent while allowing the original provider identifier to be retained separately.

### Cost and data minimization

The adapter intentionally uses an explicit Google field mask instead of `*`. Expand the mask only when a product feature actually needs another field.

## Google Routes API

Set:

```bash
ROUTE_PROVIDER=google
GOOGLE_MAPS_API_KEY=...
```

The adapter resolves canonical places from the store, sends their coordinates to Routes API v2 `computeRoutes`, and normalizes the result into:

- distance in meters
- duration in minutes
- requested canonical transport mode
- provider source
- calculation timestamp

Mode mapping:

| Canonical mode | Google mode |
| --- | --- |
| walking | WALK |
| bike | BICYCLE |
| transit | TRANSIT |
| rail | TRANSIT |
| car | DRIVE |
| taxi | DRIVE |

`rail` currently maps to `TRANSIT`, so callers receive a warning that the returned route may contain non-rail segments.

Driving/taxi requests use traffic-aware routing. Other modes omit driving-only routing preferences.

## Mixed provider operation

Places and routes can be selected independently. For example:

```bash
PLACE_PROVIDER=google
ROUTE_PROVIDER=demo
```

is useful when testing real place discovery without incurring live routing calls.

Likewise:

```bash
PLACE_PROVIDER=demo
ROUTE_PROVIDER=google
```

can route between seeded canonical places using live route data.

## Provider discovery

Clients should always inspect provider metadata before treating data as live. Both the MCP and REST surfaces expose provider descriptors containing:

- `id`
- `live`
- `description`

This prevents demo estimates from being silently presented as real-world routing results.

## Production hardening still required

The live adapters are deliberately small and auditable. Before production deployment, add:

- request timeout and cancellation;
- bounded retry/backoff for transient failures;
- quota and latency metrics;
- circuit breakers;
- place details refresh/freshness policy;
- location bias and language controls;
- route matrix support for itinerary optimization;
- API-key restriction to the required Google Maps Platform APIs and deployment origins/IPs where applicable;
- durable persistence rather than the bootstrap in-memory store.

Never commit `GOOGLE_MAPS_API_KEY` or other provider credentials to the repository.
