# Fixed 50-Persona Audit — Round 1

- Run: `2026-09-17T05:40:13Z-fixed50-travel-planning-mcp-r1`
- Repository: `Reese-max/travel-planning-mcp`
- Default branch: `main`
- Inspected product SHA / HEAD before audit write: `5a84a746266a2bd8cabf07db24a0fd2e9558b400`
- Fixed-50 rules blob: `6e3499d6ef5be7e123050e1526946f6a40f99263`
- Issue Quality v2 blob: `8167e10798071d2276addaff6b201c6b0e904a2a`
- Persona baseline: fixed A01–J05 from the governing rules. Identity, constraints and original success conditions are inherited unchanged; this report does not redefine or rotate them.
- Nature of evidence: synthetic persona simulation plus repository/source review and GitHub Actions receipts. This is not 50 real users or 50 independent empirical validations.
- Result: **NOT CLEAN / 0/2**
- Umbrella: https://github.com/Reese-max/travel-planning-mcp/issues/4
- New actionable finding: https://github.com/Reese-max/travel-planning-mcp/issues/5

## Scope and current product contract

The current product is a structured Travel Planning API + MCP server around canonical Trip data, constraint-aware ChangeProposals, explicit external operator approval, retry-safe REST writes, demo/live provider ports, and an optional read-only TRIP bridge. The governing product boundary explicitly keeps the MCP planner unable to approve its own proposal, protects fixed reservations, rejects stale proposals, and treats the current in-memory store / bootstrap auth as MVP boundaries rather than production-grade persistence or user ACLs.

Current merged PRs #1, #2 and #3 were read. All are closed/merged; there are no open PRs. Current named feature branches remain present but no open PR owns the finding scope. Search in `autodev-ng` / `adng-memory` found the portfolio cursor and product-board references but no active owner/heartbeat/GOAL for this repository. No implementation worker was started.

Fresh owner inventory was paged at 100 entries plus offset 100. The connector currently exposes **39 Reese-max repositories**, including one archived repository (`obsidian-vault`); the second page is empty. Older central records had 42, so this remains an inventory visibility/access discrepancy, not evidence of deletion. Whole-portfolio CLEAN cannot be asserted from this view.

## Evidence read

Repository evidence included README, package/config, OpenAPI/schema tree, security/architecture/TRIP integration docs, provider adapters, HTTP/MCP surfaces, proposal/idempotency/store services, all six current test files, both workflows, recent commits, all Issues, all PRs and current branch inventory.

Exact-SHA runtime receipts:

- GitHub Actions CI run `35179007178`, exact SHA `5a84a746...`, completed success on 2026-09-17. The `check` job actually checked out the inspected SHA, installed dependencies, ran TypeScript typecheck, **46 Vitest tests across 6 files**, and completed the production TypeScript build successfully.
- GitHub Actions TRIP integration run `35179007047`, same SHA, completed successful bridge check and source-package jobs. It ran `npm run check`, `npm run build`, bootstrap-script syntax, pinned-source preparation, localhost Compose config check, upstream Python syntax check, packaging/provenance, overwrite refusal and artifact upload.

These receipts establish those commands/jobs only. They do **not** establish live Google provider behavior, real TRIP-account behavior, browser/mobile UI, remote multi-user deployment, timeout/429/5xx recovery against real providers, or the lifecycle regression in #5.

## New finding — #5

**P2 BUG / SOURCE_CONFIRMED / NEEDS_REVIEW / auto_implementation=false**

Fingerprint: `Reese-max/travel-planning-mcp + ProposalService.validate lifecycle + validate terminal/protected proposal + terminal status rewritten / approval invalidated + validate() persists validated|needs_review without guarding current lifecycle state`

`ProposalService.validate()` accepts any existing proposal and persists a fresh status of `validated` or `needs_review`. The REST validate endpoint and MCP `validate_change_proposal` are ordinary planner capabilities and do not require the separate approval credential. Consequently:

- an `approved` proposal can be revalidated back to `validated`, after which `apply()` rejects it because it is no longer `approved`; the operator must approve again while the old approval receipt remains attached;
- a `rejected` proposal can have its terminal rejection status rewritten by a planner;
- an `applied` proposal can be revalidated after its trip version advances and end up `needs_review` while applied metadata remains, reducing lifecycle/audit clarity.

No human-approval bypass was found, so this is **not P0/P1**. The impact is approval-flow recoverability and audit-state trust, making P2 the calibrated severity. The smallest safe correction is local lifecycle guarding in the existing `validate()` path (or observational revalidation that does not mutate protected/terminal status) plus direct regression tests; no database, workflow framework, ledger or new service is required.

The existing exact-SHA CI is real runtime evidence for the current 46-test suite, but the suite covers normal validate→approve→apply and stale-proposal behavior, not post-approval/rejection/application revalidation. Therefore #5 is **not** labeled `EXECUTED_REPRODUCTION`.

## Fixed A01–J05 matrix

Evidence shorthand: `SRC` = current source/docs inspected; `CI` = exact-SHA GitHub Actions command/test receipt; `UNKNOWN-RUNTIME` = the relevant external/client/runtime path was not executed in this audit.

| Persona | Goal / precondition | Input / steps | Expected | Observed | Evidence | Severity / finding |
|---|---|---|---|---|---|---|
| A01 | First-use, minimal setup | Follow README → local stdio server → inspect tools | Reach first read/planning action without hidden write | README gives Node/install/stdin entry and safety boundary; no real MCP client E2E run | SRC + CI build; UNKNOWN-RUNTIME client | No new P0/P1/P2 |
| A02 | Non-CLI expert needs understandable path | Follow REST examples and provider status | Clear read/propose/approve separation | Examples and endpoint contract are explicit; env is not auto-loaded and is documented | SRC | No new P0/P1/P2 |
| A03 | Technical user customizes providers | Select demo/live provider with env | Provider choice explicit; no payload leakage into canonical model | Ports/descriptors and env selection exist | SRC + CI tests | No new P0/P1/P2 |
| A04 | Time-pressure core task | list trip → context → create → validate | Fast core flow without accidental canonical mutation | Proposal boundary is explicit; create/validate do not save Trip | SRC + CI unit tests | No new P0/P1/P2 |
| A05 | Relies on state/status cues | Inspect provider and proposal state | Demo/live and lifecycle status unambiguous | Provider descriptors are clear; terminal proposal lifecycle is not stable under revalidation | SRC | **P2 #5** |
| B01 | Structured office workflow | Use REST JSON instead of free-form itinerary | Deterministic fields/errors | OpenAPI/zod schemas and JSON errors exist | SRC + CI | No new P0/P1/P2 |
| B02 | Installation/error diagnosis | Bad body / missing fields / build | Actionable validation/error, build reproducible | Body cap, zod handling, typed errors; current CI typecheck/tests/build pass | SRC + CI | No new P0/P1/P2 |
| B03 | Reversible change workflow | Propose then apply/rollback | Human-visible review boundary and reversibility | Versions/rollback exist; rollback REST requires approval+idempotency | SRC + CI tests | No new P0/P1/P2 |
| B04 | Provenance-focused research | Inspect place/route source and trip preview | Source/live/unknown boundaries retained | provider descriptors, source IDs, retrieved_at and TRIP warnings present | SRC | No new P0/P1/P2 |
| B05 | Interrupted/fragmented use | Process restarts mid-session | State recovery expectations clear | Store, approval/audit/idempotency are in-memory; limitation explicitly documented | SRC; UNKNOWN-RUNTIME restart | Known MVP boundary; not promoted |
| C01 | Accuracy/audit critical | validate → approve → validate again → apply | Approval state must remain trustworthy | validate can downgrade approved state and block apply | SRC | **P2 #5** |
| C02 | Multi-user simplicity | Consider shared remote deployment | User/trip isolation should be explicit | Production ACL/OAuth is explicitly not yet supported; remote use is not claimed production-ready | SRC | Scope limitation; no defect claim |
| C03 | High-risk commitment protection | Try moving/rebinding fixed booking | Fail closed | service and store invariants reject fixed reservation mutations | SRC + CI tests | No new P0/P1/P2 |
| C04 | Long workflow continuity | Proposal survives process interruption | No silent data loss claims | In-memory persistence is disclosed; durable store remains production follow-up | SRC | Validation/runtime gap blocks CLEAN, not defect |
| C05 | SRE fail-closed behavior | stale base / unsupported hard constraint / apply recheck | Reject unsafe mutation | stale/version and hard-constraint checks run at approval/apply | SRC + CI tests | No new P0/P1/P2 |
| D01 | Executive summary | list trips/providers | Compact status without raw internals | summary endpoints/tools exist | SRC | No new P0/P1/P2 |
| D02 | Project traceability | Follow proposal lifecycle and audit | Status transitions remain attributable | audit events exist, but terminal status can be rewritten by validate | SRC | **P2 #5** |
| D03 | IT admin deployment | Bind non-loopback without API key | Fail closed | startup requires TRAVEL_API_KEY for non-loopback | SRC + HTTP tests in CI | No new P0/P1/P2 |
| D04 | Cost-sensitive live provider | Enable Google provider | Cost exposure bounded/truthful | field mask minimizes Places data; timeout/quota metrics are documented production follow-ups | SRC; UNKNOWN-RUNTIME live provider | Not enough evidence for P2 |
| D05 | Compliance/audit | Reject/apply then re-query lifecycle | Operator decision and audit status stable | rejection/applied status can be overwritten by later validate | SRC | **P2 #5** |
| E01 | Low digital familiarity | Use documented curl path | Safe default and clear response | localhost default, examples, machine-readable JSON | SRC | No new P0/P1/P2 |
| E02 | Desktop/large-text need | Consume via client rather than project UI | No hidden mouse-only product control | product surface is MCP/HTTP, not a shipped visual UI; client accessibility remains external | SRC | Applicable as non-interactive API; no hidden N/A |
| E03 | Fear of mistakes / needs recovery | Accidental revalidate after approval | No destructive loss of operator approval state | approved can be downgraded; reapproval needed | SRC | **P2 #5** |
| E04 | Familiar with apps, not deployment | Start local API with env | Configuration failure should be explicit | README notes env files are not auto-loaded; remote key guard exists | SRC | No new P0/P1/P2 |
| E05 | Long-session readability | Inspect JSON/status over time | Stable lifecycle terminology | terminal status instability under validate can confuse long-running review | SRC | **P2 #5** |
| F01 | Error-input scenario | Invalid JSON / >1 MiB body | Bounded, clear failure | parser/body limit exists | SRC + CI HTTP tests | No new P0/P1/P2 |
| F02 | Invalid parameters | bad version/limit/UUID | Reject without mutation | parse/zod guards present | SRC + CI | No new P0/P1/P2 |
| F03 | Provider 5xx | Live Google returns non-2xx | Do not fabricate route/place result | provider throws with bounded detail; real 5xx not executed | SRC; UNKNOWN-RUNTIME | NEEDS_RUNTIME_VERIFICATION only |
| F04 | Provider timeout | Upstream hangs | Bounded recovery | TRIP reader has AbortController; Google live adapters currently lack request timeout and docs flag it as production hardening | SRC; UNKNOWN-RUNTIME | Candidate below P2 without measured/current support impact |
| F05 | Partial/incomplete external data | TRIP missing date/time/booking timing | Preserve unknown, do not invent | preview emits issues/unresolved bookings and does not persist | SRC + CI fixture tests | No new P0/P1/P2 |
| G01 | Keyboard/non-interactive operation | stdio/HTTP client use | Core action possible without pointer | product exposes text/protocol interfaces; no browser UI is part of this repo | SRC | No product-surface accessibility defect found |
| G02 | Screen-reader/machine-readable use | Parse tool/REST response and errors | Structured response, no color-only semantics | JSON/MCP text responses are structured; downstream client not executed | SRC | Runtime/client gap only |
| G03 | Reduced precision / typo-prone input | malformed IDs/enum | Clear refusal | schemas reject malformed request | SRC + CI | No new P0/P1/P2 |
| G04 | Locale/time ambiguity | TRIP local time without timezone | Unknown must remain unknown | preview intentionally keeps timezone null and reports incomplete timing | SRC + CI fixture tests | No new P0/P1/P2 |
| G05 | Slow network | long TRIP response / timeout | Bounded response and timeout | TRIP client has size+timeout limits; Google adapters need future hardening | SRC + CI mocks; live UNKNOWN | No confirmed P2 beyond #5 |
| H01 | New maintainer | Read architecture/security boundaries | Find source of truth quickly | README/docs separate core, provider, TRIP boundaries | SRC | No new P0/P1/P2 |
| H02 | Dependency/update maintainer | Build current SHA | Reproducible checks | exact-SHA CI installed, typechecked, ran 46 tests, built | CI | No new P0/P1/P2 |
| H03 | Provider maintainer | Add/replace provider | Adapter contract isolated | PlaceProvider/RouteProvider ports exist | SRC + CI | No new P0/P1/P2 |
| H04 | Trust reviewer | Check AI cannot self-approve | Separate capability required | MCP has no approval tool; REST uses separate approval credential | SRC + CI tests | No new P0/P1/P2 |
| H05 | Maintenance handoff | Distinguish MVP vs production promises | Limitations explicit | durable store/OAuth/remote transport follow-ups documented; some README provider limitation text lags live adapters | SRC | P3/docs drift candidate, no issue |
| I01 | Retry-heavy client | repeat same REST apply key | Exactly once/replay | scoped fingerprint + same-key in-process serialization and replay | SRC + CI idempotency tests | No new P0/P1/P2 |
| I02 | Incident recovery | rollback via REST | Protected, retry-safe recovery | approval credential + mandatory idempotency key + immutable version | SRC + CI | No new P0/P1/P2 |
| I03 | Stale writer | approve/apply old base version | Conflict, no overwrite | version checks at approval and apply | SRC + CI tests | No new P0/P1/P2 |
| I04 | High-load/cost | multiple live provider calls | Bound cost/latency or clearly scoped | no quota/latency metrics or Google timeout yet; production hardening explicitly pending | SRC; no load test | NOT_ESTABLISHED for severity |
| I05 | Partial success / duplicate action | approve succeeds, planner revalidates before apply | Approval should remain valid or transition refusal be safe | validate mutates approved status and causes recoverable apply failure | SRC | **P2 #5** |
| J01 | Adversarial operation | add unlocked item tied to fixed reservation | Fail closed | service and persistence invariants block bypass | SRC + CI tests | No new P0/P1/P2 |
| J02 | Competing planner/operator | operator approves while planner issues validate | Protected operator state must not be rewritable by planner capability | validate endpoint/tool can overwrite approved lifecycle state | SRC | **P2 #5** |
| J03 | Long task/replay | repeat apply/rollback REST | No duplicate canonical mutation | required key + replay on REST; MCP apply second call fails after state advance | SRC + CI | No new P0/P1/P2 |
| J04 | Security boundary | planner attempts approval/self-authorization | Planner cannot self-approve | no MCP approval tool; separate HTTP approval key | SRC | #5 affects state integrity, not auth bypass |
| J05 | Trust / post-action verification | inspect proposal after apply/reject then validate | Terminal history remains internally consistent | terminal status can be overwritten while old receipt/applied fields remain | SRC | **P2 #5** |

## Issue-quality calibration and rejected candidates

Broad discovery did not become broad issue creation:

- Google live provider timeout/retry/quota hardening is a real production-readiness gap, but the project itself marks it as pre-production follow-up and this audit has no measured hang/frequency/cost incident. It is retained as `VALIDATION_GAP / NOT_ESTABLISHED`, not inflated to P1/P2.
- Durable persistence, cross-instance idempotency, OAuth/ACL and TRIP writeback are explicitly out of the current MVP/phase contract. Their absence blocks a production/CLEAN claim where applicable but is not treated as a current product bug.
- README still contains some older “demo-only” limitation wording even though live Google adapters now exist. This is documentation drift below the P2 threshold; no Issue created merely to increase count.
- Existing 46-test CI success is not treated as proof of live provider, real-account, mobile/browser or terminal-lifecycle scenarios that those tests do not execute.

## Coordination and writes

Before finding write, the repository was searched for open/closed Issues and all PRs; there were no pre-existing Issues and no open PRs. PR #1/#2/#3 are merged. The current branch list was read. `autodev-ng`/`adng-memory` search surfaced no active owner/heartbeat/GOAL for this repository. A fixed-50 umbrella was created as #4 after dedupe; #5 is the independent actionable finding. Audit leases were appended and read back on both Issues; no worker or product branch was started.

## CLEAN accounting

This is a complete fixed-persona **discovery Round 1**, but it is **not a qualifying CLEAN round** because:

1. open P2 #5 is unresolved;
2. required live-provider/real-TRIP and production-relevant runtime evidence is incomplete;
3. this is the first repository audit and there are not two consecutive qualifying clean rounds;
4. portfolio inventory visibility is currently 39 vs older 42 records.

Status remains **NOT CLEAN / 0/2**. The new P2 resets/keeps the streak at zero.

## Next fair cursor

After completing this newly visible repository, wrap the fair discovery/reverification cursor to **`exam-archive`**, unless a higher-priority landed P0/P1/P2 remediation or confirmed regression pre-empts the fairness lane. The cursor does not mark any other repository complete.
