# Product Board Audit — Travel Planning MCP

- Run: 2026-09-17T08:06:49Z-product-board
- Repository: Reese-max/travel-planning-mcp
- Default branch / current HEAD before this audit write: main / 74fcf8d12b6aaca91dd6ce7c9be15f72be8250e6
- Inspected product SHA: 5a84a746266a2bd8cabf07db24a0fd2e9558b400
- Issue Quality v2 blob: 8167e10798071d2276addaff6b201c6b0e904a2a
- Related fixed-persona audit: https://github.com/Reese-max/travel-planning-mcp/blob/74fcf8d12b6aaca91dd6ce7c9be15f72be8250e6/.github/quality-audits/2026-09-17T0540Z-50-persona-audit-round-1.md
- Evidence date: 2026-09-17 UTC
- Nature: repository/source review, GitHub Actions receipts, public official competitor pages, and model-based board/persona simulation. Synthetic perspectives are not independent experts or real-user research.

## Executive decision

Recommendation: **INVEST / SIMPLIFY**.

Serve technical travelers, travel-tool builders, and operators who need an AI-readable canonical itinerary with explicit constraints, versioning, human approval, and reversible writes. Compete on trustworthy mutation semantics and provider-independent data—not on becoming another consumer booking super-app.

If only three things are done:

1. Repair proposal lifecycle integrity in #5 so ordinary revalidation cannot rewrite approved, rejected, or applied state.
2. Preserve the small, explicit trust boundary: no self-approval, exact proposal/version binding, fixed-reservation protection, and retry-safe writes.
3. Obtain bounded runtime evidence for live Places/Routes and the read-only TRIP bridge before widening provider or remote-deployment claims.

Do not build social discovery, native mobile clients, booking checkout, affiliate inventory, group chat, a generalized workflow engine, or a new ledger/database merely to address #5.

## Discovery and inspected evidence

The current product is a TypeScript MCP + REST service with canonical Trip, Place, Reservation, Constraint, and ChangeProposal models; a versioned in-memory store; proposal validation/approval/apply/rollback; demo/live provider ports; Google Places/Routes adapters; and an optional bounded read-only TRIP bridge.

All Issues and PRs were checked in the preceding fixed-persona audit. PRs #1, #2, and #3 are merged and there are no open PRs. The current HEAD is audit-only, so product evidence remains pinned to 5a84a746….

Exact-SHA receipts already recorded:

- CI run https://github.com/Reese-max/travel-planning-mcp/actions/runs/35179007178 succeeded on product SHA 5a84a746… with checkout, dependency installation, typecheck, 46 Vitest tests across six files, and production build.
- TRIP integration run https://github.com/Reese-max/travel-planning-mcp/actions/runs/35179007047 succeeded on the same SHA with bridge checks, source packaging/provenance, localhost Compose validation, Python syntax check, and artifact upload.

These receipts do not prove live Google behavior, real TRIP-account behavior, browser/mobile accessibility, multi-user remote isolation, provider timeout/429/5xx recovery, or #5's terminal-state scenario.

The connected inventory currently exposes 39 Reese-max repositories, 38 unarchived. Older central records listed 42; that is treated as an access/visibility discrepancy, not evidence that repositories were deleted. No portfolio CLEAN or portfolio ranking is asserted.

## Quality-gate finding and tracking

### Finding F1 → Issue #5

- Tracking: https://github.com/Reese-max/travel-planning-mcp/issues/5
- Classification: BUG / P2 / SOURCE_CONFIRMED / NEEDS_REVIEW
- auto_implementation: false
- Fingerprint: Reese-max/travel-planning-mcp + ProposalService.validate lifecycle + validate protected/terminal proposal + terminal status rewritten or approval invalidated + validate persists validated|needs_review without a current-state guard
- Affected roles: operator approving an itinerary, traveler waiting for an approved change, support/audit reviewer, retrying AI client.
- Reachable path: create → validate → approve/reject/apply → call the ordinary REST validate endpoint or MCP validate_change_proposal again.
- Expected: terminal/protected operator state remains stable, or revalidation is observational and cannot alter it.
- Actual: validate() accepts every current proposal state and saves validated or needs_review. Approved proposals can lose their applicable status; rejected/applied proposals can have terminal state rewritten while old receipt/applied metadata remains.
- Consequence: recoverable approval-flow interruption and ambiguous audit state. No authorization bypass or confirmed data loss was found, so P0/P1 is not justified.
- Smallest safe change: add a local lifecycle guard in the existing validate path, or make revalidation observational for protected/terminal proposals; add direct approved/rejected/applied regression cases.
- Non-goals: no database, distributed state machine, generalized ledger, new approval service, or provider expansion.
- Runtime need: deterministic service/HTTP/MCP tests for all terminal states; live provider access is unnecessary for this root cause.

No new Issue was created by this product-board pass because #5 already carries the exact fingerprint and required fields.

## Competitor and substitute matrix

Sources are official pages viewed 2026-09-17 UTC. Where a page did not display a release/update date, the event date is marked UNKNOWN rather than inferred.

| Product/workflow | Source status and date | First success / value | Strengths compared with this repo | Product-board treatment |
|---|---|---|---|---|
| Wanderlog | CONFIRMED official feature pages; page update date UNKNOWN; https://wanderlog.com/trip-planner-ai and https://wanderlog.com/trip-planner-mobile-app | Generate/customize an itinerary, map days, import reservations | AI suggestions, route optimization, email import, collaboration, offline/mobile, budgeting, live flight status | MUST MATCH only basic itinerary clarity and route truthfulness. DO NOT COPY the broad consumer-suite scope now. |
| TripIt Pro | CONFIRMED official page; accessed 2026-09-17; update date UNKNOWN; https://www.tripit.com/web/pro | Turn bookings into an organized trip and disruption alerts | Real-time flight alerts, documents, airport guidance, sharing; official price shown as US$49/year | SHOULD BE BETTER on explicit change provenance and approval safety. Do not infer demand for a subscription or flight-alert product. |
| Mindtrip | CONFIRMED official page; 2026 copyright, feature event dates UNKNOWN; https://mindtrip.ai/ | Chat from inspiration to customizable itinerary | Recommendations, group collaboration, receipt/confirmation upload, Google Pins import, collections, iOS app | DIFFERENTIATOR is safe mutation and developer/API composability. DO NOT COPY creator marketplace, booking breadth, or social layer. |
| Google Maps | CONFIRMED official help, accessed 2026-09-17; update date UNKNOWN; https://support.google.com/maps/answer/144339 | Search places and obtain multimodal routes quickly | Mature mobile distribution, navigation, traffic/transit, up to nine stops for eligible modes | MUST MATCH honest provider freshness and usable routing. Do not attempt to replace navigation. |
| Spreadsheet/Notion/manual map workflow | CONFIRMED substitute by product task, no single vendor-effect claim | Immediate editable shared plan using familiar tools | Flexible, low switching cost, inspectable, shareable | SHOULD BE BETTER on constraints, versions, repeatability, and safe AI changes. Preserve exportability; do not force lock-in. |

Cross-dimension conclusion:

- Target user: technical planner/operator rather than mass-market traveler.
- Core job: preserve a trustworthy canonical trip while AI proposes changes.
- First success: read seeded/imported context, create and validate a proposal without mutating the trip.
- UX: protocol/API clarity is adequate; a consumer UI is deliberately absent.
- AI/automation: proposal-only write boundary is stronger than generic chat-to-itinerary flows.
- API/integration: MCP + REST + provider ports are the clearest differentiator.
- Mobile/distribution: far behind consumer apps, but currently outside the approved product boundary.
- Performance/reliability: exact-SHA CI is green; live-provider latency/recovery remains unverified.
- Security/privacy: localhost and separate approval credential are appropriate MVP controls; durable ACL/privacy remains future scope.
- Pricing: the repo has no commercial model. TripIt pricing is only a competitor fact, not evidence to charge.
- Documentation/maintenance: architecture and security docs are strong; README's older demo-only provider wording is minor drift.
- Open source: code-level inspectability and portable canonical schemas are an advantage over closed consumer workflows.

Strategic frame:

- MUST MATCH: truthful provider status, stable itinerary identity/version, clear errors, recoverable change workflow.
- SHOULD BE BETTER: auditable AI proposals, fixed commitment protection, stale-write refusal, minimal API surface.
- DIFFERENTIATOR: provider-independent canonical model plus external human approval and reversible versioned mutation.
- DO NOT COPY: booking marketplace, ads/affiliate funnel, social feed, creator economy, group chat, native apps, live-navigation replacement.

## Product board simulation

These are model-simulated perspectives, not an independent expert vote.

- CEO: invest only in trustable itinerary mutation, provider evidence, and one usable import path. Reject consumer-suite expansion.
- CPO: #5 is the immediate product defect because it damages the promise that operator decisions remain authoritative. Keep mobile/collaboration as later evidence questions.
- CTO: use the existing proposal service and lifecycle types; do not introduce a workflow platform. Durable storage matters only when remote/multi-user scope is approved.
- Staff/Principal Engineer: terminal transitions should be explicit and monotonic. Tests must cover validate-after-approve/reject/apply.
- UX Lead: status language must map to a user's mental model; an approved change becoming merely validated is surprising.
- UX Researcher: the 50-persona simulation suggests trust and recovery are differentiators, but real travelers must validate whether the protocol-first product solves a frequent job.
- Growth: integrations and examples can distribute the product better than a broad consumer UI. Do not mistake competitor breadth for acquisition evidence.
- CFO: live providers introduce quota/cost exposure. Require measurements before provider expansion; do not add subscription mechanics without demand.
- Security/Privacy: separate approval capability is sound. Keep personal itinerary/location data local until ACL, retention, and deletion controls exist.
- QA: current green tests do not exercise the terminal-state sequence; #5 requires direct state-transition assertions.
- SRE: Google adapters lack demonstrated timeout/backoff/quota behavior. This blocks production claims but does not yet establish a P2 incident.
- Accessibility: protocol surfaces avoid a repo-owned visual barrier, but downstream MCP/client accessibility is UNKNOWN; do not claim conformance.
- Support: stable status and actionable recovery matter more now than more providers. A reapproval loop would be confusing and hard to diagnose.

Material disagreement retained:

- Growth and UX can justify a thin approval/diff UI eventually; CTO, CFO, and Security oppose it before durable identity/ACL and real workflow evidence.
- CPO sees live provider hardening as NEXT; SRE considers it a production gate, while CEO keeps it below #5 because current scope is an MVP and no live incident is demonstrated.
- Accessibility wants client-path testing, but the board rejects building a native UI merely to make testing easier.

## 50 synthetic product-market personas

Cohort split: 30 regression baseline personas (R01–R30) preserve the current trust/safety contract; 20 exploration personas (X01–X20) probe adjacent markets and switching behavior. This set is separate from the fixed A01–J05 audit and does not replace its identities or CLEAN accounting.

Evidence codes: SRC = repository/source evidence; CI = exact-SHA workflow receipt; EXT = official external product page; UNKNOWN = unexecuted runtime or real-user behavior.

| ID | Background / constraint | Goal and journey | Friction / result | Grade, recommendation, evidence |
|---|---|---|---|---|
| R01 | Solo technical traveler | Read trip, propose one place change | Core proposal path is explicit | PASS; keep small; SRC+CI |
| R02 | Traveler with paid hotel | Move another item without changing booking | Fixed reservation guarded | PASS; retain invariant; SRC+CI |
| R03 | Human approver | Validate, approve, then inspect | Initial flow works | PASS before revalidate; SRC+CI |
| R04 | Human approver interrupted by agent | Approve, agent validates again, apply | Approval status is downgraded | P2 #5; guard terminal state; SRC |
| R05 | Traveler who rejected a plan | Reject, later agent validates | Rejection can be overwritten | P2 #5; keep rejection terminal; SRC |
| R06 | Audit reviewer | Apply then revalidate and review history | Status/metadata can diverge | P2 #5; monotonic lifecycle; SRC |
| R07 | Retry-heavy REST client | Repeat apply with same key | First response replays | PASS; preserve idempotency; SRC+CI |
| R08 | Client with reused key/new body | Retry altered request | Conflict returned | PASS; preserve fingerprint; SRC+CI |
| R09 | Local-first privacy user | Run on loopback without remote exposure | Safe default documented | PASS; maintain; SRC |
| R10 | Remote operator | Bind publicly without travel key | Startup fails closed | PASS; maintain; SRC+CI |
| R11 | AI planner | Try to approve own proposal via MCP | No approval tool exists | PASS; do not add; SRC |
| R12 | Operator | Approve over REST | Separate key required | PASS; maintain separation; SRC+CI |
| R13 | Planner with stale trip version | Apply old proposal | Re-evaluation rejects | PASS; maintain; SRC+CI |
| R14 | Traveler with hard constraint | Propose unsupported unsafe change | Hard unknown fails conservatively | PASS; preserve; SRC+CI |
| R15 | Budget traveler | Check known-currency daily cap | Supported validator path exists | PASS in fixtures; live cost UNKNOWN; SRC+CI |
| R16 | Multi-currency traveler | Expect unified budget truth | Not fully supported | DEFER; keep unknown explicit; SRC |
| R17 | Route planner on demo mode | Ask for route | Result labeled estimate | PASS; preserve descriptor; SRC+CI |
| R18 | Route planner on Google live mode | Ask for live route | Adapter exists; real behavior untested here | NEEDS_RUNTIME; do not promote defect; SRC |
| R19 | Place researcher | Search and inspect provenance | Source/retrieval fields exist | PASS; SRC+CI |
| R20 | TRIP user | Preview external trip | Read-only, loss-aware preview | PASS in fixtures; account runtime UNKNOWN; SRC+CI |
| R21 | TRIP user with incomplete booking | Preview missing timing | Unknown retained, not fabricated | PASS; SRC+CI |
| R22 | TRIP user expecting writeback | Ask to sync edits upstream | Explicitly unsupported | EXPECTATION GAP only; do not add writeback; SRC |
| R23 | User restarting process | Expect trip persistence | In-memory boundary disclosed | MVP limitation; no defect claim; SRC |
| R24 | Multi-user household | Expect private per-user trips | ACL not supported/claimed | DEFER until scope approval; SRC |
| R25 | Incident responder | Roll back to old version | Protected retry-safe rollback exists | PASS; SRC+CI |
| R26 | Maintainer | Replace provider adapter | Ports isolate provider specifics | PASS; SRC+CI |
| R27 | New maintainer | Understand trust model | Security/architecture docs clear | PASS; SRC |
| R28 | CLI-only user | Start service and parse JSON | Structured paths exist | PASS; SRC+CI |
| R29 | Screen-reader user through MCP client | Consume structured output | Repo surface is text; client path untested | UNKNOWN; client runtime test later |
| R30 | Cost-conscious operator | Enable paid providers | Field mask present; quota/latency evidence absent | NEEDS_EVIDENCE; no severity inflation; SRC |
| X01 | Wanderlog power user | Switch for mobile trip planning | Missing mobile/offline/collaboration | REJECT switch now; consumer scope mismatch; EXT |
| X02 | TripIt Pro traveler | Switch for disruption alerts | No flight-alert value | REJECT; do not copy alert suite; EXT |
| X03 | Mindtrip user | Switch for inspiration and social planning | No visual/social discovery | REJECT; deliberate differentiation; EXT |
| X04 | Google Maps user | Replace navigation | Product cannot and should not | REJECT replacement; integrate via provider; EXT |
| X05 | Spreadsheet planner | Gain safer AI edits without losing control | Canonical versions/proposals compelling | PROMISING; validate import/export need; SRC |
| X06 | Travel developer | Embed canonical trip API | REST/MCP/schema attractive | PROMISING; prioritize examples/evidence; SRC |
| X07 | Agent-platform developer | Need safe mutation boundary | Approval model differentiates | PROMISING; test host interoperability; SRC |
| X08 | Corporate travel admin | Require SSO/ACL/audit durability | MVP insufficient | DEFER; do not claim enterprise readiness; SRC |
| X09 | Family planner | Negotiate preferences together | No voting/collaboration | RESEARCH only if real demand; no feature issue |
| X10 | Accessibility-focused traveler | Encode mobility/dietary constraints | Typed semantics incomplete | NARROW research; do not build generic ontology |
| X11 | Rail-heavy Taiwan traveler | Need live TDX/GTFS routing | Provider absent | DEFER until validated locale demand |
| X12 | Digital nomad | Need weather/calendar context | Not connected | DEFER; avoid provider sprawl |
| X13 | Privacy maximalist | Keep everything local | Local stdio/loopback is attractive | DIFFERENTIATOR; document data flow; SRC |
| X14 | Self-hosting operator | Want durable SQLite/Postgres | Only memory today | RESEARCH deployment demand before build |
| X15 | Travel agency | Need booking checkout | Outside boundary and liability-heavy | REJECT |
| X16 | Creator/influencer | Publish monetized guides | No creator marketplace | REJECT; DO NOT COPY Mindtrip breadth |
| X17 | Emergency replanner | Need live disruption handling | No verified live event inputs | DEFER; high-risk without evidence |
| X18 | Open-source integrator | Want portable schemas and providers | Inspectable architecture fits | PROMISING; keep contracts stable; SRC |
| X19 | Support engineer | Diagnose failed approval/application | Audit exists but #5 confuses state | P2 #5; repair before expansion; SRC |
| X20 | Product buyer | Compare total cost and maturity | No pricing/SLA/production claim | UNKNOWN; do not invent ROI or price |

### Synthetic switching test

Pure model simulation, not votes, market share, conversion, occurrence rate, or revenue evidence:

- Wanderlog: 26%
- Travel Planning MCP: 24%
- Google Maps plus manual plan: 18%
- Mindtrip: 14%
- TripIt: 10%
- Spreadsheet/Notion workflow: 8%

Interpretation: the repo is competitive only for users who value auditable AI changes and developer integration. Consumer products win on mobile, collaboration, live content, and distribution. This simulation does not set priority; repository evidence makes #5 actionable.

## Red Team

Proposals tested against contrary evidence:

1. **Claim: approval can be bypassed through idempotency replay. Rejected.** REST checks the travel API credential globally, then the approval credential, before idempotency lookup. MCP apply still requires the exact proposal to be approved and freshly valid. No bypass was found.
2. **Claim: the AI can directly overwrite canonical Trip JSON. Rejected.** No raw mutation tool exists; ordinary AI writes are proposals.
3. **Claim: #5 needs a new workflow engine/state machine service. Rejected.** A local state guard or observational revalidation addresses the root cause.
4. **Claim: absence of durable storage is a current P1 outage. Rejected.** In-memory persistence is an explicit MVP boundary, not a production claim.
5. **Claim: green CI proves live providers. Rejected.** The receipts cover controlled commands and fixtures only.
6. **Claim: missing Google timeout/backoff is already P2. Not established.** The source gap is real, but there is no measured supported-workflow failure or incident in this audit.
7. **Claim: competitor mobile/collaboration features are defects here. Rejected.** They serve a different product surface and do not prove user demand for this repository.
8. **Claim: version metadata at 0.3.0 despite earlier bump messages is a release blocker. Not established.** Package, health, and MCP metadata agree at inspected SHA; commit-message history alone does not prove an intended public 0.4.0 release.
9. **Claim: same-place zero-distance Google route handling is a P2 core failure. Not established.** The source may reject a zero-distance response, but frequency, provider behavior, and supported user impact were not reproduced.
10. **Claim: normalized Google place caching is already a policy breach. Not established.** The current store is process-memory, durable retention is not shipped, and this pass did not establish a violated contractual duration. Keep policy review attached to any durable provider store design.

## Priority and portfolio posture

### NOW

- #5: make proposal terminal/protected state stable under revalidation.
- Add the smallest direct regression matrix for approved, rejected, and applied proposals.

### NEXT

- Execute bounded live-provider checks for timeout, 429/5xx, quota visibility, and truthfulness.
- Execute a real authorized TRIP read-only preview with redaction and size/timeout receipts.
- Correct README provider wording when touching adjacent documentation; do not make it a blocker by itself.

### LATER

- Validate demand for durable local storage and portable import/export.
- Narrow research for accessibility/dietary/traveler constraints.
- Consider a thin human diff/approval surface only after identity, retention, and deployment scope are approved.

### DON'T

- Do not build booking, flight alerting, creator/social, group chat, native apps, live navigation, affiliate inventory, or a general workflow/ledger platform.
- Do not treat issue existence, synthetic preference, or competitor breadth as implementation authorization.
- Do not start an implementation worker from this audit.

## Decision memo

**Who is served?** Technical travelers, integrators, and operators who need structured itinerary state and safe AI-assisted changes.

**Why choose it?** Open schemas, provider ports, explicit source truth, stale-write checks, fixed commitment protection, external approval, idempotent REST mutation, and immutable trip versions.

**Differentiation:** not better inspiration or booking; better control over what an AI may change and how the change is verified, approved, applied, audited, and reversed.

**Top three priorities:** #5 lifecycle integrity; runtime evidence for shipped live/read-only adapters; validate one import/export/integration workflow with real users.

**What is removed or not pursued?** Consumer-suite parity, provider proliferation, premature remote multi-user deployment, and architecture built around unvalidated future scale.

**Main risks:** proposal-state ambiguity, unverified live-provider recovery/cost, in-memory loss on restart, personal itinerary/location privacy if remote scope expands, and unclear willingness to adopt a protocol-first product.

**Experiments:** deterministic lifecycle regression; bounded live provider canary with non-destructive fixtures; five to eight interviews/tasks with spreadsheet/API/MCP planners. Exit as BUILD only for a narrow validated path, NARROW when only one role benefits, REJECT when a manual/export workflow remains sufficient.

## Accounting and status

- Total quality-gate findings: 1
- Mapping: 1/1 PASS
- New Issues created by this product-board pass: 0
- Existing Issues updated: 0
- Reopened Issues: 0
- Research Issues: 0
- Duplicate avoided: 1 exact finding already tracked by #5
- Rejected/not-established hypotheses: 10
- Scope narrowed: 1 (#5 to lifecycle guard + direct regressions)
- Severity correction: none in this pass
- Verified fixed: 0
- SKIPPED_LOCKED: 0
- Issue write blocked: 0
- Report write blocked: 0
- Distribution: P0 0 / P1 0 / P2 1 / P3 0
- Highest priority: #5
- auto_implementation: false
- Fixed A01–J05 status: NOT CLEAN / 0 of 2
- Portfolio CLEAN: not claimed
- Runtime pending: live Google provider behavior, real TRIP account, downstream client accessibility, remote multi-user deployment, and the exact #5 terminal-state regression

The report commit is audit-only. It does not make product-runtime evidence stale, does not authorize implementation, and must not be counted as a product fix.
