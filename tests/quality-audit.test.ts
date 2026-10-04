import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const report = readFileSync(new URL(
  '../.github/quality-audits/2026-09-30T0208Z-50-persona-audit-round-2.md', import.meta.url
), 'utf8');
const rows = report.split(/\r?\n/).filter((line) => /^\| [A-J]0[1-5] \|/.test(line));
const row = (id: string) => rows.find((line) => line.startsWith(`| ${id} |`))!;

it('preserves fixed persona needs instead of substituting unrelated API checks', () => {
  expect(rows.map((line) => line.split('|')[1]!.trim())).toEqual(
    [...'ABCDEFGHIJ'].flatMap((group) => [1, 2, 3, 4, 5].map((n) => `${group}0${n}`))
  );
  // Needs from autodev-ng fixed-50 blob 6e3499d6ef5be7e123050e1526946f6a40f99263.
  const fixedNeeds = {
    F01: /large text.*buttons/i,
    F02: /contrast.*zoom/i,
    F03: /touch targets/i,
    F04: /memory.*one step/i,
    F05: /assisted setup.*daily use/i,
    G03: /colou?r/i,
    G04: /200%.*narrow/i,
    J01: /large data/i,
    J03: /long.running.*resource/i
  };
  for (const [id, need] of Object.entries(fixedNeeds)) {
    expect.soft(row(id).split('|')[2], id).toMatch(need);
    expect.soft(row(id), `${id} unexecuted path`).toMatch(/RUNTIME GAP|LIMITATION/);
  }
});

it('separates unexecuted regression paths from the tests that actually ran', () => {
  expect.soft(report).not.toMatch(/apply-time regression coverage/);
  expect.soft(row('B03')).not.toMatch(/rollback.*tested/);
  expect.soft(row('F01')).not.toMatch(/Invalid JSON.*tested/);
  for (const path of ['Apply-time invalidation', 'Rollback', 'REST malformed/oversized requests']) {
    expect.soft(report).toMatch(new RegExp(`${path}[^\n]*not exercised`, 'i'));
  }
});

it('retains source caveats instead of claiming all hard constraints fail closed', () => {
  expect.soft(row('C05')).not.toMatch(/hard constraints.*fail closed/);
  expect.soft(report).toMatch(/missing.*parameters.*skipped/i);
  expect.soft(report).toMatch(/mixed.currenc(?:y|ies).*soft warning/i);
});

it('limits idempotency-key guarantees to REST rather than MCP', () => {
  expect.soft(row('I01')).toMatch(/\bREST\b/);
  expect.soft(report).toMatch(/MCP[^\n]*do not[^\n]*idempotency keys/);
  expect.soft(row('J03')).not.toMatch(/apply\/rollback requests require idempotency/);
});
