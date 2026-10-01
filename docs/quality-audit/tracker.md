# Fixed A01–J05 audit tracker

Umbrella issue: [#4 — Fixed A01–J05 quality tracker](https://github.com/Reese-max/travel-planning-mcp/issues/4)

Audited product SHA: `a627d888b8913aac604cd446fc1fffab3c00b3ed`

Status: **NOT CLEAN / 0/2**

Nature of evidence: synthetic persona simulation combined with repository/source review and the
deterministic local checks listed below. This is **not 50 real users** and **not 50 independent
validations**, and it is not independent user research.

## Governing rules

| Rule | Pinned blob |
| --- | --- |
| Fixed-50 persona rules (`Reese-max/autodev-ng`, `docs/portfolio-audit/2026-09-06-50-persona-audit.md`) | `6e3499d6ef5be7e123050e1526946f6a40f99263` |
| Issue-quality calibration (`docs/portfolio-audit/2026-09-14-issue-quality-v2.md`) | `8167e10798071d2276addaff6b201c6b0e904a2a` |

The frozen persona identities and needs live in [`persona-baseline.md`](./persona-baseline.md).
Result rules live in [`README.md`](./README.md). `tests/quality-audit.test.ts` enforces both.

## Round index

| Report | Round | Product SHA | Role |
| --- | --- | --- | --- |
| [`2026-09-17T0540Z-50-persona-audit-round-1.md`](../../.github/quality-audits/2026-09-17T0540Z-50-persona-audit-round-1.md) | 1 | `5a84a746266a2bd8cabf07db24a0fd2e9558b400` | Historical discovery round. Persona rows in that report are superseded by the tracker below, because the Round 1 matrix substituted repo-specific scenarios (for example `A01` became "First-use, minimal setup") for the fixed persona needs. The report itself is kept unmodified as evidence. |
| [`2026-09-17T0811Z-product-board-audit.md`](../../.github/quality-audits/2026-09-17T0811Z-product-board-audit.md) | — | `5a84a746266a2bd8cabf07db24a0fd2e9558b400` | Product board decision record. Contains no fixed persona rows. |

Finding #5 (proposal lifecycle rewritable by revalidation) was raised by Round 1, fixed by
[#8](https://github.com/Reese-max/travel-planning-mcp/pull/8), and is now covered by
`tests/proposal-service.test.ts` and `tests/mcp-proposal-validation.test.ts`. Its issue is closed.

## Evidence for this round

Executed on Linux at the audited SHA:

| Command | Result |
| --- | --- |
| `npm test` | 54 tests across 7 files passed before this tracker was added |
| `npm run check` | TypeScript typecheck plus the full Vitest suite passed |
| `npm run build` | Production TypeScript build passed |

`npm test` covers the service, store, HTTP, MCP and provider paths named in the tracker rows. It does
not establish live Google provider behaviour, quota or timeout recovery, a real external TRIP
account, a browser or mobile client, or a remote multi-user deployment. Those paths stay in the
`RUNTIME GAP` or `LIMITATION` rows below.

## Fixed A01–J05 tracker

Result vocabulary: `PASS` (executed evidence for the fixed need), `LIMITATION` (documented MVP
boundary), `RUNTIME GAP` (fixed scenario not executed), `OPEN FINDING` (registered finding still
affects the persona).

| Persona | Fixed need (en) | Result | Evidence |
| --- | --- | --- | --- |
| A01 | high-school newcomer, mobile-first, first-time user | RUNTIME GAP | `README.md` documents the setup path; a mobile MCP-client onboarding run was not exercised. |
| A02 | university student, fluent in Google Docs, unfamiliar with the CLI | RUNTIME GAP | `examples/` and `openapi/openapi.yaml` document the flow; a non-CLI beginner run was not exercised. |
| A03 | computer-science student, fluent in Git/CLI, seeks customization | PASS | Provider ports `src/ports/place-provider.ts`, `src/ports/route-provider.ts`; `src/adapters/google-place-provider.ts`; `tests/google-providers.test.ts`; `npm test`. |
| A04 | exam candidate, high time pressure, wants the fastest core task | PASS | `tests/proposal-service.test.ts` proves read/propose/validate leaves the canonical trip unchanged; `npm test`. |
| A05 | visual learner, relies on clear navigation and status cues | RUNTIME GAP | Lifecycle status text is asserted in `tests/proposal-service.test.ts`; client navigation and visual cues were not exercised. |
| B01 | administrator, fluent in Excel, unfamiliar with programming | RUNTIME GAP | `openapi/openapi.yaml` and `examples/` describe the read/propose/approve split; a spreadsheet-driven administrative run was not exercised. |
| B02 | junior engineer, values installation and error messages | RUNTIME GAP | `README.md` documents installation and `src/http/server.ts` returns typed JSON errors; the inbound malformed and oversized request path has no fixture in `tests/http-server.test.ts`. |
| B03 | designer, values UI consistency and reversible actions | OPEN FINDING | Reversal is only covered in `src/services/proposal-service.ts` and `tests/proposal-service.test.ts`; rollback has no regression fixture — see F-02. |
| B04 | research assistant, values data sources and export | LIMITATION | `src/domain/types.ts` keeps provider and source metadata and `tests/google-providers.test.ts` covers normalization; the repository exposes no export workflow at all. |
| B05 | shift worker, mobile and fragmented-time use | LIMITATION | `src/store/memory-store.ts` is in-memory, so an interrupted session loses state; disclosed under `README.md` current limitations. |
| C01 | police/civil-service user, values correctness and audit trail | PASS | `tests/proposal-service.test.ts`, `tests/mcp-proposal-validation.test.ts` and `tests/store-invariants.test.ts` keep audit events and approval receipts stable across refused revalidation; `npm test`. |
| C02 | teacher, values multi-user use and low learning cost | LIMITATION | `docs/security-model.md` documents bootstrap API-key auth only; no user ACL or OAuth exists. |
| C03 | medical/high-risk user, values disclaimer, sources and error protection | PASS | `src/services/proposal-service.ts` and `tests/store-invariants.test.ts` reject fixed-reservation mutation, rebinding and timing changes; `npm test`. |
| C04 | content creator, values uninterrupted long flows and version recovery | OPEN FINDING | Version creation is covered in `tests/proposal-service.test.ts`, but the recovery half of the need is rollback, which has no fixture — see F-02. |
| C05 | DevOps/SRE, values observability, fail-closed behaviour and rollback | OPEN FINDING | Hard constraints are silently skipped when required parameters are missing, and a hard budget degrades to a warning on mixed currencies in `src/services/proposal-service.ts` — see F-01. Rollback coverage is F-02. |
| D01 | unit manager, reads summaries and exceptions only | PASS | `src/services/trip-context-service.ts` aggregates trip state and `tests/http-server.test.ts` asserts the context response; `npm test`. |
| D02 | project manager, values progress, ownership and traceability | PASS | `src/store/memory-store.ts` records audit events and `tests/proposal-service.test.ts` asserts protected lifecycle states; `npm test`. |
| D03 | IT administrator, values permissions, backup and deployment | LIMITATION | `src/http/server.ts` refuses a non-loopback bind without `TRAVEL_API_KEY`, covered by `tests/http-server.test.ts`; backup and deployment recovery are outside the MVP. |
| D04 | procurement/cost-sensitive user, values cost estimate and caps | RUNTIME GAP | `src/adapters/google-place-provider.ts` limits cost through an explicit field mask as described in `docs/live-providers.md`; live cost and quota behaviour were not exercised. |
| D05 | legal-compliance/audit role, values data retention, privacy and operation evidence | LIMITATION | `tests/trip-read-client.test.ts` proves upstream notes, attachments and identities are never published; retention itself is in-memory. |
| E01 | general office worker, rarely uses modern web UI | RUNTIME GAP | `README.md` documents the localhost curl path; a beginner client run was not exercised. |
| E02 | teaching/civil-service user, prefers desktop and large fonts | LIMITATION | The product surface is MCP and REST text only; `src/mcp/server.ts` owns no visual UI to size. |
| E03 | low digital familiarity, fears misclicks, needs confirmation and recovery | RUNTIME GAP | Confirmation is the approval boundary in `src/http/server.ts`; client confirmation, undo and the rollback recovery path were not exercised. |
| E04 | Excel fluent, unfamiliar with cloud deployment | RUNTIME GAP | `README.md` and `docs/security-model.md` document localhost defaults and the remote-bind credential; the remote deployment path was not exercised. |
| E05 | long-session user, values readability and low fatigue | RUNTIME GAP | No extended reading or long-session scenario was run against `src/http/server.ts` responses. |
| F01 | elderly first-time user, needs large text and clear buttons | RUNTIME GAP | Client first-use, text size and button clarity were not exercised. |
| F02 | reduced vision, relies on high contrast and zoom | RUNTIME GAP | Client contrast and zoom behaviour were not exercised. |
| F03 | reduced hand precision, needs large touch targets | LIMITATION | The repository owns no touch surface; `src/mcp/server.ts` and `src/http/server.ts` are text-only interfaces. |
| F04 | memory-load sensitive, needs one step at a time and persistent state | LIMITATION | `src/store/memory-store.ts` keeps state in process memory, so state does not survive a restart. |
| F05 | assisted by family/colleagues at setup, then independent daily use | RUNTIME GAP | The assisted-setup-to-independent-use handoff was not exercised. |
| G01 | keyboard-only operation | RUNTIME GAP | Text and protocol surfaces exist in `src/mcp/server.ts`; a complete keyboard-only client task was not exercised. |
| G02 | screen-reader user | RUNTIME GAP | `src/mcp/server.ts` returns structured text; an actual screen-reader client was not exercised. |
| G03 | colour-vision limitation, status must not rely on colour alone | LIMITATION | `src/domain/types.ts` carries textual lifecycle status, so status is not colour-encoded; colour-independent cues in a client were not exercised. |
| G04 | 200% zoom / narrow viewport | LIMITATION | The repository owns no visual UI, so zoom and reflow were not exercised. |
| G05 | slow network / high latency | RUNTIME GAP | `tests/trip-read-client.test.ts` bounds TRIP request duration; `src/adapters/google-place-provider.ts` sets no request timeout and live latency was not exercised. |
| H01 | Windows developer | RUNTIME GAP | `.github/workflows/ci.yml` runs `ubuntu-latest` only; no Windows execution was performed. |
| H02 | macOS developer | RUNTIME GAP | No macOS execution was performed in this round. |
| H03 | Linux/CI non-interactive environment | PASS | `npm run check`, `npm run build` and `npm test` were executed non-interactively on Linux at this SHA; `.github/workflows/ci.yml` and `package.json` pin the same scripts. |
| H04 | self-hosted/Cloudflare deployer | LIMITATION | `docs/security-model.md` documents bootstrap auth and a localhost default; remote transport and production credential isolation are future scope. |
| H05 | third-party maintainer, first time taking over the repo | PASS | `AGENTS.md`, `docs/architecture.md`, `docs/data-model.md` and `docs/security-model.md` separate domain, ports, adapters and the approval boundary. |
| I01 | duplicate clicks / resends | PASS | `tests/idempotency-service.test.ts` covers replay, same-key serialization and fingerprint conflicts, and `tests/http-server.test.ts` replays an apply; `npm test`. |
| I02 | recovery after closing the page or the process mid-task | LIMITATION | `src/store/memory-store.ts` does not survive a process restart, as `README.md` current limitations state. |
| I03 | wrong file / wrong input | RUNTIME GAP | `tests/trip-read-client.test.ts` rejects malformed upstream payloads and invalid IDs; the inbound malformed or oversized body path in `src/http/server.ts` has no fixture. |
| I04 | API timeout/429/5xx | RUNTIME GAP | `tests/google-providers.test.ts` covers a non-2xx upstream response; live timeout, 429 and 5xx recovery was not exercised. |
| I05 | retry after partial success / partial failure | PASS | `tests/http-server.test.ts` covers approve, apply replay and a rejected proposal staying closed, and `tests/mcp-proposal-validation.test.ts` covers planner revalidation after a terminal state; `npm test`. |
| J01 | large data / large projects | RUNTIME GAP | No large-itinerary workload or scaling measurement was run against `src/store/memory-store.ts`. |
| J02 | multi-user and concurrent operation | LIMITATION | Same-key serialization is tested in `tests/idempotency-service.test.ts`, but multi-user isolation is out of the MVP per `docs/security-model.md`. |
| J03 | long-running use and resource exhaustion | RUNTIME GAP | No endurance, memory-growth or exhaustion workload was executed; retry fixtures are not endurance evidence. |
| J04 | security/privacy-sensitive user | PASS | `tests/http-server.test.ts` proves approval stays behind a separate operator credential, and `tests/trip-read-client.test.ts` covers upstream privacy redaction; `npm test`. |
| J05 | expert user seeking the shortest path, automation and customization | PASS | `src/mcp/server.ts` exposes the tool surface, `src/ports/` isolates providers, and `tests/mcp-proposal-validation.test.ts` covers the automation boundary; `npm test`. |

## Findings register

Calibrated with the pinned issue-quality rules. No entry authorizes implementation.

| Finding | Kind | Severity | Evidence | Triage | Auto implementation | Summary | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | BUG | P2 | SOURCE_CONFIRMED | NEEDS_REVIEW | false | A hard constraint is skipped instead of blocking when its required parameters are missing, and a hard daily budget is downgraded to a soft warning when currencies are mixed. `AGENTS.md` invariant 4 requires a hard constraint to block apply when it cannot be evaluated safely. | src/services/proposal-service.ts |
| F-02 | VALIDATION_GAP | NOT_ESTABLISHED | SOURCE_CONFIRMED | NEEDS_EVIDENCE | false | Operator rollback is the documented recovery path for a reversible change, but no test file references rollback, so its new-version creation and idempotent replay are source-reviewed only. Impact is not established; the missing evidence blocks CLEAN. | src/services/proposal-service.ts |

## CLEAN accounting

The repository is **NOT CLEAN / 0/2**:

1. F-01 is an open P2 product finding and F-02 is an open validation gap.
2. Runtime evidence is incomplete for live providers, a real external TRIP account, browser and mobile
   clients, remote multi-user deployment and large or endurance workloads.
3. No two consecutive qualifying CLEAN rounds exist for this repository.
4. Synthetic persona simulation is not real-user research or independent validation.

## Next round

Re-run the same 50 needs against the new default-branch SHA after F-01 and F-02 have an owner, then
record the result as a new report under `.github/quality-audits/` and add it to the index above. Do
not rewrite this tracker or any earlier report to reach CLEAN.