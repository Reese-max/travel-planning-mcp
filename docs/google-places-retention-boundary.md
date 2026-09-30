# Google Places retention boundary before durable storage

Research snapshot / primary sources checked: 2026-09-30. Decision for issue #6: **NARROW**. This is a design gate, not a claim that the current in-memory store violates a contract or that a future durable store is ready.

## Scope and applicable agreement

`GooglePlaceProvider` requests `id,displayName,formattedAddress,location,primaryType,types` from Places API (New) Text Search. It currently saves the normalized result as one canonical `Place` in `MemoryStore`. `Place` requires `name`, `categories`, and `location.lat/lng`; Trip records refer to its locally derived `place_id`.

The Google Maps billing account address and governing Agreement/region remain **UNKNOWN**. The field classes below record the conservative boundary visible in Google's public first-party documents. They are not a legal determination or permission to persist the whole Place. Confirm the account's agreement and billing region before a durable `TravelStore` is designed.

## Field-level matrix

| Current field | Origin and proposed class | Basis and design consequence |
| --- | --- | --- |
| `id`, `external_ids.google_place_id`, `source.source_id` | Raw Google Place ID; `RAW_GOOGLE_PLACE_ID / DURABLE_REFERENCE_BY_DOC` | Google's [Place ID guide](https://developers.google.com/maps/documentation/places/web-service/place-id) and [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) permit storing raw Place IDs indefinitely. Refresh after 12 months is recommended, not an expiry rule. An ID can become obsolete or change, so cross-ID continuity remains unsolved. |
| Local `place_id` | App-derived identifier; `ID_DERIVED/UNKNOWN` | The adapter derives it deterministically from the raw Google Place ID. It is not the raw provider-issued ID; the raw-ID retention permission does not expressly cover this derived UUID. Resolve its retention boundary before durable use. A changed Google ID does not automatically preserve this ID. |
| `location.lat`, `location.lng` | Google provider content; `TEMPORARY_30D` | Both the [general Places API terms, section 14.3](https://cloud.google.com/maps-platform/terms/maps-service-terms) and [EEA terms, section 15.4](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) specify a cache of up to 30 consecutive calendar days followed by deletion. The current required `Place.location` shape cannot simply drop these fields. |
| `displayName.text`, `displayName.languageCode` → `name`, `localized_names` | Google provider content; `NO_EXPRESS_CACHE_PERMISSION_FOUND / DO_NOT_DURABLY_PERSIST_PENDING_AGREEMENT_REVIEW` | The general [Terms, section 3.2.3(a)-(b)](https://cloud.google.com/maps-platform/terms) prohibit storing/caching except as expressly allowed; no durable permission for these Places fields was found. EEA [permitted uses](https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses) are a separate use restriction, not a retention permission; EEA section 15.4's 30-day cache allowance (see [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)) covers coordinates only. Do not infer eligibility from “travel planning” or apply the coordinate rule to names. |
| `formattedAddress` → `location.address` | Google provider content; `NO_EXPRESS_CACHE_PERMISSION_FOUND / DO_NOT_DURABLY_PERSIST_PENDING_AGREEMENT_REVIEW` | No express durable-cache permission for this Places API field was found. EEA permitted-use and cache-retention rules remain separate. A user independently entering an address is different from copying a provider value into `user_metadata`. |
| `primaryType`, `types` → `categories` | Google provider content; `NO_EXPRESS_CACHE_PERMISSION_FOUND / DO_NOT_DURABLY_PERSIST_PENDING_AGREEMENT_REVIEW` | No express durable-cache permission for these Places API fields was found. Current fallback category `place` is app-generated, but returned categories are provider content. |
| `source.provider`, `source.retrieved_at` | App provenance; keep separately | These labels identify the provider and retrieval time. They do not grant a retention right for the provider fields they describe. |
| `user_metadata`, Trip `place_ids[]`, TripItem `place_id` | User/app itinerary intent | Preserve separately from an expiring provider snapshot. Do not relabel Google text or coordinates as user-owned by copying them into these fields. |

## Isolated fixture and decision

`tests/google-places-retention-research.test.ts` uses an injected synthetic Text Search response with no Google request or paid API call. It exercises the current adapter's normalized Place, then models a **test-only** split into durable identity/user intent and an optional provider snapshot. Removing that snapshot leaves exact Trip place references, notes, tags, and favorite status intact. A refresh with the same Google ID recreates the same local `place_id`; a different Google ID produces a different one.

This supports a **NARROW** next design: preserve the Google ID plus user-owned itinerary intent separately from provider content, attach retrieval/expiry metadata to any cached coordinates, and resolve the other provider fields against the actual agreement before durable persistence. It does not implement expiry, deletion, refresh, ID rotation, or a second database. The fixture is not a production compliance or live-provider test.

Before implementation, confirm the account's billing region and agreement; decide whether the product needs any durable provider snapshot at all; and design a `Place` read shape that remains valid when coordinates or other provider content are absent. Keep the existing `Read → ChangeProposal → Simulate/Validate → Human Approval → Apply` mutation boundary intact.
