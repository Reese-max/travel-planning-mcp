import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const baselinePath = 'docs/quality-audit/persona-baseline.md';
const trackerPath = 'docs/quality-audit/tracker.md';
const auditDir = '.github/quality-audits';

const PERSONAS = [...'ABCDEFGHIJ'].flatMap((group) =>
  [1, 2, 3, 4, 5].map((n) => `${group}0${n}`)
);
const RESULTS = ['PASS', 'LIMITATION', 'RUNTIME GAP', 'OPEN FINDING'];
const EXECUTED_COMMANDS = ['npm test', 'npm run check', 'npm run typecheck', 'npm run build'];
const UNEXECUTED_LANGUAGE = /\bnot exercised\b|\bnot run\b|\bunexecuted\b|\bnever executed\b/i;
const KINDS = ['BUG', 'VALIDATION_GAP', 'MAINTENANCE', 'RESEARCH', 'OPPORTUNITY'];
const TRIAGES = ['NEEDS_EVIDENCE', 'NEEDS_REVIEW', 'READY_FOR_IMPLEMENTATION', 'DEFERRED'];
const SEVERITIES = /^(P[0-3]|NOT_ESTABLISHED)$/;
const EVIDENCE = /^(SOURCE_CONFIRMED|EXECUTED_REPRODUCTION|NEEDS_EVIDENCE)$/;

function path(relative: string): string {
  return join(repoRoot, relative);
}

function readDoc(relative: string): string {
  return existsSync(path(relative)) ? readFileSync(path(relative), 'utf8') : '';
}

function personaRows(markdown: string): string[] {
  return markdown.split(/\r?\n/).filter((line) => /^\| [A-J]0[1-5] \|/.test(line));
}

function cells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function table(document: string, pattern: RegExp): Map<string, string[]> {
  return new Map(
    document
      .split(/\r?\n/)
      .filter((line) => pattern.test(line))
      .map((line) => [cells(line)[0]!, cells(line)])
  );
}

it('keeps the fixed A01-J05 baseline complete and ordered', () => {
  expect.soft(existsSync(path(baselinePath)), `${baselinePath} must exist`).toBe(true);
  const baselineRows = table(readDoc(baselinePath), /^\| [A-J]0[1-5] \|/);
  expect([...baselineRows.keys()]).toEqual(PERSONAS);
  for (const [id, row] of baselineRows) {
    expect.soft(row[1], `${id} fixed persona`).not.toBe('');
    expect.soft(row[2], `${id} fixed need`).not.toBe('');
  }
});

it('tracks every fixed persona against the unchanged baseline need', () => {
  expect.soft(existsSync(path(trackerPath)), `${trackerPath} must exist`).toBe(true);
  const baselineRows = table(readDoc(baselinePath), /^\| [A-J]0[1-5] \|/);
  const trackerRows = table(readDoc(trackerPath), /^\| [A-J]0[1-5] \|/);
  expect.soft([...trackerRows.keys()], 'tracker must cover the fixed baseline').toEqual(PERSONAS);
  for (const [id, row] of trackerRows) {
    expect.soft(row[1], `${id} need must match the fixed baseline verbatim`).toBe(
      baselineRows.get(id)?.[2]
    );
  }
});

it('uses only the declared result vocabulary', () => {
  const trackerRows = table(readDoc(trackerPath), /^\| [A-J]0[1-5] \|/);
  expect(trackerRows.size).toBeGreaterThan(0);
  for (const [id, row] of trackerRows) {
    expect.soft(RESULTS, `${id} result "${row[2]}"`).toContain(row[2]);
  }
});

it('only reports PASS with evidence that exists in this repository', () => {
  const trackerRows = table(readDoc(trackerPath), /^\| [A-J]0[1-5] \|/);
  for (const [id, row] of trackerRows) {
    if (row[2] !== 'PASS') continue;
    const evidence = row[3] ?? '';
    const cited = [...evidence.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1]!)
      .some((token) => EXECUTED_COMMANDS.includes(token) || existsSync(path(token)));
    expect.soft(cited, `${id} PASS must cite an existing path or an executed command`).toBe(true);
    expect.soft(evidence, `${id} PASS must not report unexecuted work as executed`).not.toMatch(
      UNEXECUTED_LANGUAGE
    );
  }
});

it('records the audited SHA, status and pinned governing rules', () => {
  const tracker = readDoc(trackerPath);
  expect.soft(tracker).toMatch(/Audited product SHA: `[0-9a-f]{40}`/);
  expect.soft(tracker).toMatch(/Status: \*\*NOT CLEAN \/ 0\/2\*\*/);
  expect.soft(tracker).toContain('6e3499d6ef5be7e123050e1526946f6a40f99263');
  expect.soft(tracker).toContain('8167e10798071d2276addaff6b201c6b0e904a2a');
  expect.soft(tracker).toMatch(/synthetic persona simulation/);
  expect.soft(tracker).toMatch(/not 50 real users/);
  expect.soft(tracker).toMatch(/issues\/4/);
});

it('indexes every committed audit report and labels superseded persona rows', () => {
  const tracker = readDoc(trackerPath);
  const reports = readdirSync(path(auditDir)).filter((name) => name.endsWith('.md'));
  expect(reports.length).toBeGreaterThan(0);
  for (const report of reports) {
    expect.soft(tracker, `${report} must be indexed by the tracker`).toContain(report);
  }
  const referenced = [
    ...new Set([...tracker.matchAll(/\.github\/quality-audits\/([\w.-]+\.md)/g)].map((match) => match[1]!))
  ];
  expect(referenced.length).toBeGreaterThan(0);
  for (const report of referenced) {
    expect.soft(existsSync(path(join(auditDir, report))), `linked report ${report} must exist`).toBe(true);
  }
  const withPersonaRows = reports.filter(
    (report) => personaRows(readFileSync(path(join(auditDir, report)), 'utf8')).length === 50
  );
  expect(withPersonaRows.length).toBeGreaterThan(0);
  for (const report of withPersonaRows) {
    expect.soft(tracker, `${report} persona rows must be marked superseded`).toMatch(
      /Persona rows in .* are superseded/
    );
  }
});

it('records every finding with calibrated issue-quality metadata', () => {
  const tracker = readDoc(trackerPath);
  const findings = [...table(tracker, /^\| F-\d+ \|/).entries()];
  expect(findings.length).toBeGreaterThan(0);
  for (const [id, [findingId, kind, severity, evidence, triage, implementation, summary, source]] of
    findings) {
    expect.soft(findingId, 'finding id column must match the row label').toBe(id);
    expect.soft(KINDS, `${id} kind`).toContain(kind);
    expect.soft(severity, `${id} severity "${severity}"`).toMatch(SEVERITIES);
    expect.soft(evidence, `${id} evidence "${evidence}"`).toMatch(EVIDENCE);
    expect.soft(TRIAGES, `${id} triage`).toContain(triage);
    expect.soft(implementation, `${id} auto_implementation`).toBe('false');
    expect.soft(summary, `${id} summary`).not.toBe('');
    expect.soft(existsSync(path(source ?? '')), `${id} source "${source}" must exist`).toBe(true);
  }
  const trackerRows = table(tracker, /^\| [A-J]0[1-5] \|/);
  for (const [id, row] of trackerRows) {
    if (row[2] !== 'OPEN FINDING') continue;
    expect.soft(row[3], `${id} must reference a registered finding`).toMatch(/F-\d+/);
  }
});

it('publishes the tracker from the README and the audit rules index', () => {
  expect.soft(readDoc('README.md')).toContain('docs/quality-audit/tracker.md');
  expect.soft(readDoc('docs/quality-audit/README.md')).toContain('persona-baseline.md');
  expect.soft(readDoc('docs/quality-audit/README.md')).toContain('tracker.md');
});