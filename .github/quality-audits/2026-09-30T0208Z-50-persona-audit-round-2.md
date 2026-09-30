# Fixed 50-Persona Audit — Round 2

- Run: `2026-09-30T0208Z-fixed50-travel-planning-mcp-r2`
- Repository: `Reese-max/travel-planning-mcp`
- Default branch: `main`
- Inspected product SHA before this report: `a627d888b8913aac604cd446fc1fffab3c00b3ed`
- Fixed-50 rules blob: [`6e3499d6ef5be7e123050e1526946f6a40f99263`](https://api.github.com/repos/Reese-max/autodev-ng/git/blobs/6e3499d6ef5be7e123050e1526946f6a40f99263)
- Issue Quality v2 blob: `8167e10798071d2276addaff6b201c6b0e904a2a`
- Persona baseline: fixed A01–J05 from the pinned rules; the table explicitly retains each original need. Where a client or workload was not exercised, unrelated API checks do not substitute for that need.
- Prior report: [Round 1](2026-09-17T0540Z-50-persona-audit-round-1.md)
- Umbrella: [Issue #4](https://github.com/Reese-max/travel-planning-mcp/issues/4)
- Resolved finding: [Issue #5](https://github.com/Reese-max/travel-planning-mcp/issues/5)
- Nature of evidence: synthetic persona simulation plus repository/source review and deterministic local checks. This is not 50 real users or 50 independent validations.
- Result: **NOT CLEAN / 0/2**

## Executive result

The Round 1 P2 lifecycle finding in #5 is resolved on the inspected SHA: `ProposalService.validate()` rejects revalidation of `approved`, `rejected`, `applied`, `expired`, and other protected states without writing a proposal or audit event, while editable `draft`, `validated`, and `needs_review` proposals remain revalidatable. The regression coverage is in `tests/proposal-service.test.ts`. This is a bounded regression result, not a clearance of every fixed-persona scenario; the source caveats and unexecuted paths below remain open.

This is not a qualifying CLEAN round. The governing fixed-persona rules still require runtime evidence for the supported product paths and two consecutive qualifying rounds. This review did not claim live Google provider behavior, a real external TRIP account, browser/mobile behavior, or an independent user study.

## Evidence boundary

The inspected product snapshot passed these deterministic checks:

- `npm test -- --run tests/proposal-service.test.ts` — lifecycle protection, fixed reservations, validate-time return-by/overlap checks, stale approval rejection, and successful approved apply.
- `npm run check` — TypeScript typecheck plus 54 Vitest tests across 7 files.
- `npm run build` — production TypeScript build.

The automated suite covers the core proposal and API/MCP behavior with controlled fixtures. It does not establish live-provider quota/timeout behavior, a real external TRIP service, remote multi-user ACL isolation, or client-side browser/mobile accessibility. Those remain validation gaps, not newly promoted product defects.

Source inspection is separate from executed regression coverage:

- Apply-time invalidation is not exercised by the current tests: `ProposalService.apply()` re-evaluates the proposal, but no fixture invalidates an already-approved proposal before applying it.
- Rollback is not exercised by the current tests. Its new-version and REST key requirements are source-reviewed in `src/services/proposal-service.ts` and `src/http/server.ts` only.
- REST malformed/oversized requests are not exercised by the current tests. The JSON parser and 1 MiB request limit are source-reviewed; TRIP upstream response-size/content-type tests do not cover this inbound path.
- Hard-constraint enforcement is not universally fail-closed: missing time parameters are skipped, and mixed currencies produce a soft warning even for a hard budget in `validateConstraints()`. These pre-existing source caveats need separate product follow-up; #5's lifecycle fix does not resolve them.
- REST apply/rollback require idempotency keys; REST apply replay and the service's same-key concurrency gate have tests. MCP apply and optional admin rollback do not accept idempotency keys, so those REST retry guarantees must not be attributed to MCP.

## Fixed A01–J05 tracker

`PASS` describes only the bounded source/test evidence named in that row, not independent user validation or completion of every persona need. `LIMITATION` is a documented MVP boundary. `RUNTIME GAP` identifies an unexecuted part of the original scenario; any source caveat is stated separately and must not be treated as a passing result. This corrected mapping supersedes the inherited Round 1 scenario substitutions without rewriting that historical report.

| Persona | Fixed need / success condition | Result | Evidence / note |
|---|---|---|---|
| A01 | First-time student, mobile-first onboarding | RUNTIME GAP | README entry exists; mobile MCP-client onboarding was not exercised. |
| A02 | Google Docs user unfamiliar with CLI | RUNTIME GAP | REST examples exist; a non-CLI beginner's completion path was not exercised. |
| A03 | Git/CLI student seeking customization | PASS | Provider ports and descriptors expose customization points; adapter fixtures cover normalization. |
| A04 | Time-pressured student seeking the fastest core task | PASS | Read → propose → validate leaves the canonical trip unchanged in tests; completion time was not measured. |
| A05 | Visual learner needing navigation and state cues | RUNTIME GAP | Lifecycle states are regression-tested; client navigation and visual cues were not exercised. |
| B01 | Excel-skilled administrator unfamiliar with programming | RUNTIME GAP | REST/OpenAPI fields exist; a non-programmer workflow was not exercised. |
| B02 | Junior developer needing installation and error guidance | PASS | Typecheck, tests and build pass; REST malformed-body behavior remains source-reviewed only. |
| B03 | Designer needing consistent UI and reversible actions | RUNTIME GAP | Approval and successful apply have tests; rollback and client UI consistency remain unexecuted. |
| B04 | Research assistant needing sources and export | PASS | Normalized data retains provider/source metadata; a research export workflow was not exercised. |
| B05 | Shift worker using mobile in short sessions | RUNTIME GAP | Mobile interruption/resumption was not exercised; in-memory restart loss is documented. |
| C01 | Public-sector user needing accuracy and audit trails | PASS | Protected lifecycle tests preserve approval, proposal snapshots and audit events after refused revalidation. |
| C02 | Teacher needing simple multi-user use | LIMITATION | Production OAuth/ACL isolation is outside the MVP; multi-user onboarding was not exercised. |
| C03 | High-risk user needing sources and error protection | PASS | Fixed-reservation mutation and add/rebind bypasses are rejected by service/store tests. |
| C04 | Creator needing uninterrupted work and version recovery | LIMITATION | Versions exist, but durable interruption recovery is not supported and rollback lacks a regression fixture. |
| C05 | SRE needing observability, fail-closed checks and rollback | RUNTIME GAP | Stale approval and hard return-by rejection have tests; see the hard-constraint source caveats and unexecuted apply/rollback paths above. |
| D01 | Manager needing summaries and exceptions | PASS | Trip/provider summaries and structured status reads are available. |
| D02 | Project manager needing progress, ownership and traceability | PASS | Proposal audit attribution and protected-state revalidation are covered by lifecycle tests. |
| D03 | IT administrator needing permissions, backups and deployment | LIMITATION | Non-loopback startup requires a travel API credential in source; durable backups and deployment recovery remain outside the MVP. |
| D04 | Cost-sensitive buyer needing estimates and limits | RUNTIME GAP | Live-provider costs and enforced spending limits were not exercised. |
| D05 | Compliance reviewer needing retention, privacy and evidence | LIMITATION | Lifecycle integrity and TRIP privacy fixtures have tests; durable retention is not supported. |
| E01 | Office user unfamiliar with modern Web UI | RUNTIME GAP | Localhost/curl instructions exist; beginner client use was not exercised. |
| E02 | Desktop user needing large text | LIMITATION | There is no repo-owned visual UI; desktop-client text sizing was not exercised. |
| E03 | Low-confidence user needing confirmation and undo | RUNTIME GAP | Protected approval states have tests; client confirmation/undo and rollback remain unexecuted. |
| E04 | Excel user unfamiliar with cloud deployment | RUNTIME GAP | Environment and localhost requirements are documented; this user's deployment path was not exercised. |
| E05 | Long-session user needing readability and low fatigue | RUNTIME GAP | No extended reading or client fatigue scenario was exercised. |
| F01 | Senior first-time user needing large text and clear buttons | RUNTIME GAP | Client first-use, text size and button clarity were not exercised. |
| F02 | Low-vision user needing high contrast and zoom | RUNTIME GAP | Client contrast and zoom were not exercised. |
| F03 | Limited motor precision needing large touch targets | RUNTIME GAP | Client touch-target size and operation were not exercised. |
| F04 | Memory-sensitive user needing one step at a time and persistent state | LIMITATION | Stepwise client interaction was not exercised; in-memory state does not survive process restart. |
| F05 | Assisted setup followed by independent daily use | RUNTIME GAP | The assisted setup-to-daily-use handoff was not exercised. |
| G01 | Keyboard-only operation | RUNTIME GAP | Text/protocol surfaces exist; a complete keyboard-only client task was not exercised. |
| G02 | Screen-reader operation | RUNTIME GAP | Responses are structured text/JSON; an actual screen-reader client was not exercised. |
| G03 | Color-vision limitation; status must not rely only on color | RUNTIME GAP | API states are textual; client color-independent status cues were not exercised. |
| G04 | 200% zoom and narrow viewport | RUNTIME GAP | No client zoom/reflow or narrow-viewport task was exercised. |
| G05 | Slow network and high latency | RUNTIME GAP | TRIP has a mocked timeout test; slow live-provider behavior was not exercised. |
| H01 | Windows developer | PASS | PR self-review reran the 54 product tests, typecheck and build under Windows Git Bash; real MCP-client startup remains unexecuted. |
| H02 | macOS developer | RUNTIME GAP | macOS behavior was not executed in this audit. |
| H03 | Linux/CI non-interactive operation | PASS | The original report records 54 tests, typecheck and build on Linux; self-review on Windows does not add Linux CLI-client evidence. |
| H04 | Self-hosted/Cloudflare deployment | LIMITATION | Remote deployment and production ACL/credential isolation remain future scope. |
| H05 | First-time external maintainer | PASS | Architecture, security, data-model and provider boundaries are documented. |
| I01 | Duplicate submission and retries | PASS | REST apply replay and the service's same-key concurrency behavior are tested; rollback is source-reviewed only. |
| I02 | Recovery after closing the page/process | LIMITATION | In-memory state loss across process restart is documented and not solved. |
| I03 | Wrong files or invalid input | PASS | Invalid external IDs/schema payloads have TRIP fixtures; REST malformed/oversized bodies remain unexecuted. |
| I04 | API timeout, 429 and 5xx | RUNTIME GAP | Mocked TRIP timeout and Google Places 429 have tests; live timeout/429/5xx and quota behavior were not exercised. |
| I05 | Retry after partial success/failure | PASS | The specific approve → refused planner revalidation → successful apply regression is covered; broader partial failures remain unexecuted. |
| J01 | Large data and large projects | RUNTIME GAP | No large-itinerary workload or scaling measurement was executed. |
| J02 | Multi-user and concurrent operation | RUNTIME GAP | Same-key in-process serialization is tested; planner/operator interleaving and multi-instance behavior were not exercised. |
| J03 | Long-running use and resource exhaustion | RUNTIME GAP | No endurance, memory-growth or exhaustion workload was executed; retry fixtures are not endurance evidence. |
| J04 | Security/privacy-sensitive use | PASS | Separate operator approval and read-only TRIP privacy fixtures cover specific trust boundaries. |
| J05 | Expert seeking shortest paths, automation and customization | PASS | MCP/REST and provider ports offer automation/customization surfaces; expert shortest-path usability was not exercised. |

## CLEAN accounting

The repository remains **NOT CLEAN / 0/2**:

1. #5 is closed and its regression is covered, but the corrected persona mapping, source caveats and unexecuted paths prevent a complete clearance or qualifying CLEAN round.
2. A second consecutive qualifying CLEAN round has not yet been completed.
3. Synthetic persona simulation is not real-user research or independent validation.

This tracker records evidence and follow-up boundaries only. It does not authorize implementation, merge, deploy, paid provider calls, or external writes.
