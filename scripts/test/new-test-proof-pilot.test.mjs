#!/usr/bin/env node
/**
 * The acceptance replay of `scripts/ci/new-test-proof.mjs`: the proof over the 30 most recent merged
 * `fix` pull requests of `origin/develop`, taken from Git history, each merge against its first
 * parent. OPT-IN — it checks out this repository 30 times into a scratch copy and takes tens of
 * minutes, so the ordinary suite skips it:
 *
 *   TCH_NEW_TEST_PROOF_PILOT=1 node --test --test-timeout=5700000 scripts/test/new-test-proof-pilot.test.mjs
 *
 * It asserts what a machine can: 30 pull requests were selected and every one has a result, every
 * row has one known verdict and a reason where it needs one, the totals add up, the wall times are
 * there, and no scratch copy is left. It does NOT judge whether a verdict is right: that is read by
 * a person, three `unproved` rows at a time, and written in the change journal.
 *
 * The tables are kept under `$TCH_TEST_ARTIFACTS_DIR/new-test-proof-pilot` (the OS temp directory
 * when unset): `pilot.md`, `pilot.json`, and one directory of evidence per pull request.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DEFAULT_BUDGET_SECONDS, VERDICTS, runPilot } from '../ci/new-test-proof.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ASKED = 30
const enabled = process.env.TCH_NEW_TEST_PROOF_PILOT === '1'

test(`the proof over the last ${String(ASKED)} merged fix pull requests of origin/develop`, {
  skip: enabled ? false : 'opt-in replay: set TCH_NEW_TEST_PROOF_PILOT=1 (tens of minutes)'
}, async () => {
  const out = join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'new-test-proof-pilot')
  const scratchRoot = join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'new-test-proof-pilot-scratch')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(scratchRoot, { recursive: true })
  const pilot = await runPilot({
    repo: ROOT,
    ref: 'origin/develop',
    count: ASKED,
    out,
    scratchRoot,
    log: (line) => process.stderr.write(`pilot: ${line}\n`)
  })

  assert.equal(
    pilot.selected,
    ASKED,
    `acceptance is NOT complete: history under origin/develop holds only ${String(pilot.selected)} merged fix pull requests (a shallow clone?)`
  )
  assert.equal(pilot.prs.length, ASKED)
  assert.equal(new Set(pilot.prs.map((p) => p.pr)).size, ASKED, 'no pull request twice')
  assert.equal(pilot.budgetSeconds, DEFAULT_BUDGET_SECONDS)

  const perFile = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  const perPr = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const pr of pilot.prs) {
    assert.match(pr.merge, /^[0-9a-f]{40}$/)
    assert.match(pr.base, /^[0-9a-f]{40}$/)
    assert.ok(VERDICTS.includes(pr.overall), `#${String(pr.pr)}: ${pr.overall}`)
    assert.ok(Number.isFinite(pr.wallSeconds) && pr.wallSeconds >= 0, `#${String(pr.pr)} has a wall time`)
    perPr[pr.overall] += 1
    if (pr.rows.length === 0) {
      assert.equal(pr.overall, 'no-tests')
      perFile['no-tests'] += 1
    }
    assert.equal(new Set(pr.rows.map((r) => r.file)).size, pr.rows.length, 'one row per test file')
    for (const row of pr.rows) {
      assert.ok(VERDICTS.includes(row.verdict) && row.verdict !== 'no-tests', `${row.file}: ${row.verdict}`)
      if (row.verdict !== 'unproved') assert.ok(row.reason, `${row.file}: ${row.verdict} says why`)
      if (row.verdict === 'proved') assert.ok(['assertion', 'import-only', 'other'].includes(row.evidence))
      perFile[row.verdict] += 1
    }
    // The per-pull-request evidence carries the manifest the verdicts came from.
    const result = JSON.parse(readFileSync(join(out, `pr-${String(pr.pr)}`, 'result.json'), 'utf8'))
    assert.equal(result.head, pr.merge)
    assert.equal(result.base, pr.base)
    assert.ok(Array.isArray(result.manifest.revertedToBase) && Array.isArray(result.manifest.keptAtHead))
    assert.equal(result.rows.length, pr.rows.length)
    // A pull request past the budget may only hold rows that say so.
    if (pr.rows.some((r) => r.reason === 'time')) assert.ok(pr.wallSeconds >= DEFAULT_BUDGET_SECONDS)
  }
  assert.deepEqual(pilot.perTestFile, perFile)
  assert.deepEqual(pilot.perPullRequest, perPr)
  assert.equal(
    Object.values(perPr).reduce((a, b) => a + b, 0),
    ASKED
  )
  assert.equal(
    pilot.testFiles,
    pilot.prs.reduce((n, p) => n + p.rows.length, 0)
  )
  const walls = pilot.prs.map((p) => p.wallSeconds)
  assert.equal(pilot.wallSeconds.worst, Math.max(...walls))
  assert.ok(
    pilot.wallSeconds.median >= Math.min(...walls) && pilot.wallSeconds.median <= pilot.wallSeconds.worst
  )

  const table = readFileSync(join(out, 'pilot.md'), 'utf8')
  for (const pr of pilot.prs)
    assert.ok(table.includes(`| #${String(pr.pr)} |`), `#${String(pr.pr)} is in the table`)
  assert.match(table, /median [\d.]+ s, worst [\d.]+ s/)
  assert.ok(existsSync(join(out, 'pilot.json')))
  assert.deepEqual(readdirSync(scratchRoot), [], 'no scratch copy left behind')
  process.stderr.write(`pilot: tables in ${out}\n`)
})
