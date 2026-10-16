# Read-only proposal review

`GET /v1/proposals/{proposalId}/review` and the MCP
`get_change_proposal_review` tool expose `proposal-review/v1`. They require the
existing ordinary travel access, not the operator approval credential. No provider
request, lifecycle update, approval, audit append, canonical save or TRIP writeback
occurs when reading a review.

The server loads the immutable `base_trip_version` and simulates the proposal with
the existing guarded evaluator. `before` is that historical version; `after` is a
simulation retaining the same version number. Model-supplied `operation.from` and
claimed impact values cannot supply either snapshot or a metric. Added, removed,
moved and updated groups reflect actual simulated item differences, including
relative same-day order changes when clocks are absent or equal. Each projected
item exposes its zero-based day position; insertion/removal does not by itself
mark the surviving same-day identities as moved. Protected or
unsupported operations remain in the current validation findings; they do not
appear as successful simulated changes. Missing base history, duplicate item
identities or exceeded limits fail instead of guessing a before state.

The current trip is evaluated separately, using current constraints/reservations.
A changed canonical version reports `stale=true` and a fresh stale conflict while
preserving the original comparison. This is observational validation: even approved,
rejected, applied and expired proposals retain their lifecycle and receipts.
Approval and apply still perform their own current validation.

Snapshots allowlist itinerary identity, title, timing, protection and route provenance.
Notes, booking confirmation/reference fields, reservation details, traveler profiles,
raw operations and approval notes are omitted. Timing/provenance fields accept
scalar strings only; nested values become null and an invalid route mode removes
that projected route. Missing evidence remains unknown. A notes-only change reports the
`notes` field as redacted; absence of visible text does not mean it was unchanged.
The optional external source identity comes from the canonical import provenance,
not a requested TRIP numeric ID. No mapping or import is invented by this endpoint.

Travel/walking `before_known` and `after_known` sum only recorded route evidence.
Missing or invalid evidence produces `UNKNOWN` and `delta=null`. Moving/adding/removing
activities also leaves the route delta unknown because this endpoint does not
recalculate routes. Sources and calculation times are retained; `live=UNKNOWN` is
never upgraded based on a provider-looking string. A known unchanged zero is a
recorded estimate, not a live measurement.

Cost uses current recorded planning estimates or reservation prices (reservation
price takes precedence for an item). Missing amounts, mixed currencies and numeric
overflow produce `UNKNOWN`; there is no invented FX conversion or free-time price.
These are estimates, not live quotes or versioned historical prices. A metadata-only
note has no activity fields and an absent duration or finite numeric zero; present
null/malformed/nonzero duration, a present source-timing field (including null),
or a malformed non-null clock is not silently free metadata.

`review_id` hashes the returned observation. The receipt also hashes the proposal,
original/current trip and simulated trip. Hashes establish what was observed, not
human identity, approval or an atomic external version. Existing approve/apply
routes do not consume `review_id` as a new approval authority. A future App drawer
must bind canonical/source identity and keep operator credentials outside ordinary
AI context; this change implements neither that drawer nor upstream conditional
writeback. Normal flow remains:

`create_change_proposal -> validate -> review -> external human approval -> apply`

Limits are 1,000 operations, 2,000 items per original/current snapshot and 1 MB per
input/response. Failures leave stored state intact. The current store remains
in-memory; this contract adds no durable provider retention, production ACL,
transactional upstream CAS or multi-process idempotency.

Validation uses actual services, local loopback HTTP and the real MCP SDK with
explicitly synthetic itinerary fixtures. No paid/model/provider calls, external
trip writes, deployment, clinician/user study or whole Issue #7 acceptance is claimed.
