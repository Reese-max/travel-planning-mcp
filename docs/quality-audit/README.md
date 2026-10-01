# Fixed A01–J05 audit rules

These rules govern the fixed 50-persona audit tracked by
[Issue #4](https://github.com/Reese-max/travel-planning-mcp/issues/4).

## Files

| File | Role |
| --- | --- |
| [`persona-baseline.md`](./persona-baseline.md) | Frozen persona IDs, identities and needs. Inherited verbatim from the pinned portfolio rules. |
| [`tracker.md`](./tracker.md) | Current result for every fixed persona, plus the findings register and CLEAN accounting. |
| [`../../.github/quality-audits/`](../../.github/quality-audits) | Per-round reports. Historical evidence; they are not rewritten after the fact. |

`tests/quality-audit.test.ts` enforces the rules below against the files in this directory. Editing a
persona row, a result, or a finding without keeping that file consistent fails the suite.

## Governing rules

- Fixed-50 rules blob `6e3499d6ef5be7e123050e1526946f6a40f99263` (`Reese-max/autodev-ng`,
  `docs/portfolio-audit/2026-09-06-50-persona-audit.md`).
- Issue-quality calibration blob `8167e10798071d2276addaff6b201c6b0e904a2a`
  (`docs/portfolio-audit/2026-09-14-issue-quality-v2.md`).

Both are referenced by pinned blob SHA so a later edit upstream cannot silently change this baseline.

## Result vocabulary

A tracker row carries exactly one of four results.

| Result | Meaning | Effect on CLEAN |
| --- | --- | --- |
| `PASS` | An executed command or test in this repository demonstrates the persona's fixed need at the audited SHA. It is not user research and not an independent validation. | Does not block on its own. |
| `LIMITATION` | The need is served only by a documented MVP boundary, or the capability is out of scope for this repository. | Blocks CLEAN. |
| `RUNTIME GAP` | The fixed scenario was not executed. Missing evidence is not the same as a broken product, but it is not a pass. | Blocks CLEAN. |
| `OPEN FINDING` | A registered finding in the tracker findings register still affects this persona. | Blocks CLEAN. |

Rules the suite enforces:

- Every fixed persona has exactly one row, in the fixed ID order.
- Each row copies the baseline need verbatim. A substituted scenario is not a result.
- A `PASS` row must cite an existing repository path or an executed command, and may not describe
  unexecuted work as executed.
- Every finding carries `kind`, `severity`, `evidence`, `triage` and `auto_implementation: false`,
  and points at a file that exists in the repository.
- An `OPEN FINDING` row must name its finding ID.
- Every committed round report must be indexed by the tracker.

## Running a round

1. Pin the default-branch SHA under audit and record it as `Audited product SHA`.
2. Run the deterministic checks and record the exact commands and results: `npm test`,
   `npm run check`, `npm run build`.
3. Walk all 50 personas. For each one, keep the original need and either cite executed evidence or
   downgrade to `LIMITATION`, `RUNTIME GAP` or `OPEN FINDING`.
4. Record reproducible product problems as findings with calibrated metadata. Absence of evidence is
   a `VALIDATION_GAP`, never a promoted defect.
5. Write a round report under `.github/quality-audits/` and add it to the tracker index. Never rewrite
   a previous round; mark superseded persona rows in the tracker instead.
6. Re-run `npm test` so `tests/quality-audit.test.ts` validates the new tracker.

Evidence is always recorded by path and by result. A local run supports only the paths it actually
executed; it never supports live third-party identity, a real external account, a browser or mobile
client, or a remote deployment.

## CLEAN accounting

The repository may only be marked `CLEAN` when all of the following hold.

1. Every P0/P1/P2 issue is closed or explicitly `not_planned`.
2. The full 50 personas were re-run against the latest default-branch SHA.
3. Statically verifiable items produced no new reproducible problem.
4. For a runtime-dependent product, the core happy path, the error path, and the mobile/narrow or
   CLI non-interactive path were actually executed.
5. Two consecutive rounds produced no new P0/P1/P2 finding.

Missing evidence may block CLEAN. It never manufactures a P0/P1 defect, and a clean round is not a
claim of real-user validation: the persona walk-through is a synthetic persona simulation, not 50
real users.

## Scope

This tracker records evidence and follow-up boundaries. It does not authorize implementation,
merge, deploy, paid provider calls, or external writes. `auto_implementation` is `false` for every
finding; turning a finding into work is a separate, explicit decision.