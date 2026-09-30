# Fixed 50-Persona Audit — Round 2

- Run: `2026-09-30T0208Z-fixed50-travel-planning-mcp-r2`
- Repository: `Reese-max/travel-planning-mcp`
- Default branch: `main`
- Inspected product SHA before this report: `a627d888b8913aac604cd446fc1fffab3c00b3ed`
- Fixed-50 rules blob: `6e3499d6ef5be7e123050e1526946f6a40f99263`
- Issue Quality v2 blob: `8167e10798071d2276addaff6b201c6b0e904a2a`
- Persona baseline: fixed A01–J05; identity, constraints, and original success conditions are unchanged.
- Prior report: [Round 1](2026-09-17T0540Z-50-persona-audit-round-1.md)
- Umbrella: [Issue #4](https://github.com/Reese-max/travel-planning-mcp/issues/4)
- Resolved finding: [Issue #5](https://github.com/Reese-max/travel-planning-mcp/issues/5)
- Nature of evidence: synthetic persona simulation plus repository/source review and deterministic local checks. This is not 50 real users or 50 independent validations.
- Result: **NOT CLEAN / 0/2**

## Executive result

Round 2 found no new P0/P1/P2 finding. The Round 1 P2 lifecycle finding in #5 is resolved on the inspected SHA: `ProposalService.validate()` rejects revalidation of `approved`, `rejected`, `applied`, `expired`, and other protected states without writing a proposal or audit event, while editable `draft`, `validated`, and `needs_review` proposals remain revalidatable. The regression coverage is in `tests/proposal-service.test.ts`.

This is not a qualifying CLEAN round. The governing fixed-persona rules still require runtime evidence for the supported product paths and two consecutive qualifying rounds. This review did not claim live Google provider behavior, a real external TRIP account, browser/mobile behavior, or an independent user study.

## Evidence boundary

The inspected product snapshot passed these deterministic checks:

- `npm test -- --run tests/proposal-service.test.ts` — lifecycle, fixed-reservation, constraint, and apply-time regression coverage.
- `npm run check` — TypeScript typecheck plus 54 Vitest tests across 7 files.
- `npm run build` — production TypeScript build.

The automated suite covers the core proposal and API/MCP behavior with controlled fixtures. It does not establish live-provider quota/timeout behavior, a real external TRIP service, remote multi-user ACL isolation, or client-side browser/mobile accessibility. Those remain validation gaps, not newly promoted product defects.

## Fixed A01–J05 tracker

`PASS` means no new P0/P1/P2 finding in the source/test review; it is not a claim of independent user validation. `LIMITATION` is a documented MVP boundary. `RUNTIME GAP` identifies evidence that was not executed and therefore blocks CLEAN accounting.

| Persona | Result | Evidence / note |
|---|---|---|
| A01 | PASS | README and local entry path are explicit; MCP client runtime remains unexecuted. |
| A02 | PASS | REST examples and read/propose/approve separation are documented. |
| A03 | PASS | Provider ports, descriptors, and selection are covered by source/tests. |
| A04 | PASS | Read → propose → validate is proposal-only and leaves the canonical trip unchanged. |
| A05 | PASS | Provider status and proposal lifecycle language are explicit; protected-state regression is covered. |
| B01 | PASS | REST/OpenAPI and typed request/response shapes provide deterministic fields. |
| B02 | PASS | Invalid input, bounded bodies, typecheck, tests, and build are covered. |
| B03 | PASS | Approval boundary, apply, and rollback are versioned and tested. |
| B04 | PASS | Provider/source metadata is retained in normalized travel data. |
| B05 | LIMITATION | In-memory recovery limits are documented; durable restart recovery is future scope. |
| C01 | PASS | Approved proposals remain approved after a planner revalidation attempt; apply remains possible. |
| C02 | LIMITATION | Production OAuth/ACL isolation is explicitly outside the MVP boundary. |
| C03 | PASS | Fixed-reservation mutation and add/rebind bypasses are rejected by service/store tests. |
| C04 | LIMITATION | Durable process-interruption recovery is not claimed for the in-memory store. |
| C05 | PASS | Stale proposals, hard constraints, and apply-time revalidation fail closed. |
| D01 | PASS | Trip/provider summaries and structured status reads are available. |
| D02 | PASS | Proposal lifecycle audit remains attributable; protected-state revalidation is regression-tested. |
| D03 | PASS | Non-loopback startup requires the travel API credential. |
| D04 | RUNTIME GAP | Live-provider cost/latency behavior was not executed; production hardening remains documented follow-up. |
| D05 | PASS | Rejected/applied state is no longer rewritten by ordinary validation. |
| E01 | PASS | Localhost defaults and documented curl examples provide a safe starting path. |
| E02 | LIMITATION | The repository exposes protocol/API surfaces rather than a repo-owned visual UI. |
| E03 | PASS | Accidental revalidation cannot remove an operator approval or terminal decision. |
| E04 | PASS | Environment requirements and localhost safety behavior are documented. |
| E05 | PASS | Lifecycle terminology remains stable across the tested proposal flow. |
| F01 | PASS | Invalid JSON and body-size handling are bounded and tested. |
| F02 | PASS | Invalid identifiers, versions, and enums are rejected without mutation. |
| F03 | RUNTIME GAP | Controlled provider error normalization is covered; live 5xx behavior was not executed. |
| F04 | RUNTIME GAP | The live-provider timeout/retry gap remains an unexecuted production validation item. |
| F05 | PASS | Incomplete external timing data stays unknown in the read-only preview path. |
| G01 | PASS | Core operations are exposed through non-interactive stdio/HTTP protocol surfaces. |
| G02 | PASS | Responses and errors are structured text/JSON; downstream screen-reader behavior is external. |
| G03 | PASS | Schema and request validation provide clear malformed-input refusal. |
| G04 | PASS | Local-time uncertainty is preserved rather than invented in the read-only bridge. |
| G05 | RUNTIME GAP | Slow live-network behavior was not executed against external providers. |
| H01 | RUNTIME GAP | Cross-platform Windows behavior was not independently executed in this Linux audit. |
| H02 | RUNTIME GAP | Cross-platform macOS behavior was not independently executed in this Linux audit. |
| H03 | PASS | Linux/CI checks are reproducible locally with typecheck, 54 tests, and build. |
| H04 | LIMITATION | Remote deployment and production ACL/credential isolation are future scope. |
| H05 | PASS | Architecture, security, data-model, and provider boundaries are documented for maintainers. |
| I01 | PASS | Idempotency and same-key replay/concurrency behavior are covered by tests. |
| I02 | LIMITATION | In-memory state loss across process restart is documented and not claimed solved. |
| I03 | PASS | Invalid/stale requests fail without overwriting the canonical trip. |
| I04 | RUNTIME GAP | Live timeout/429/5xx and quota behavior were not executed. |
| I05 | PASS | Partial-success recovery retains protected lifecycle decisions; #5 regression coverage applies. |
| J01 | PASS | Fixed reservation and locked-item bypass attempts fail closed. |
| J02 | PASS | An ordinary planner cannot rewrite an operator-approved/rejected/applied state. |
| J03 | PASS | Repeated apply/rollback requests require idempotency and avoid duplicate versions. |
| J04 | PASS | Approval remains an external operator capability; MCP has no approval tool. |
| J05 | PASS | Post-action terminal history remains internally consistent under revalidation attempts. |

## CLEAN accounting

The repository remains **NOT CLEAN / 0/2**:

1. Round 2 found no new P0/P1/P2 issue, and #5 is closed, but this round does not satisfy the governing runtime-evidence requirements.
2. A second consecutive qualifying CLEAN round has not yet been completed.
3. Synthetic persona simulation is not real-user research or independent validation.

This tracker records evidence and follow-up boundaries only. It does not authorize implementation, merge, deploy, paid provider calls, or external writes.
