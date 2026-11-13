// The Contract B check gate (`build-contract`, ticket #590) run as a command, on the invented sample scenarios of the
// WO domain fixtures and on broken copies of them in a throwaway folder.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { discoverBuildScenarios } from '../build-contract/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CHECK = path.join(ROOT, 'scripts/build-contract/check.mjs')
const FIXTURES = path.join(ROOT, 'packages/wo/website-opportunities/test/fixtures/build-contract')
const HAPPY = path.join(FIXTURES, 'sunrise-tennis-club.build-scenario.json')

const run = (...args) => spawnSync(process.execPath, [CHECK, ...args], { cwd: ROOT, encoding: 'utf8' })

/** A copy of the happy scenario, edited by `edit`, in a throwaway folder. */
function brokenCopy(t, edit) {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-contract-check-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'broken.build-scenario.json')
  writeFileSync(file, JSON.stringify(edit(JSON.parse(readFileSync(HAPPY, 'utf8')))))
  return { dir, file }
}

test('discovery finds the sample scenarios in the tree', () => {
  const found = discoverBuildScenarios(ROOT).map((f) => path.relative(ROOT, f))
  assert.ok(found.includes(path.relative(ROOT, HAPPY)), found.join('\n'))
})

test('discovery finds the stopped without a re-run and the cancelled samples (#597)', () => {
  const found = discoverBuildScenarios(ROOT).map((f) => path.basename(f))
  for (const name of ['stopped-without-rerun', 'cancelled'])
    assert.ok(found.includes(`sunrise-tennis-club-${name}.build-scenario.json`), found.join('\n'))
})

test('the command passes on the sample scenarios', () => {
  const res = run(FIXTURES)
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /4 file\(s\) checked, 0 problem\(s\)/)
})

test('the command fails and prints every problem with its file and place', (t) => {
  const { dir } = brokenCopy(t, (s) => {
    delete s.plan.look
    s.runs[0].outcome.steps[8].state = 'pending'
    s.runs[0].outcome.steps[8].attempt = 0
    return s
  })
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /broken\.build-scenario\.json plan\.look: missing look section/)
  assert.match(res.stdout, /1 file\(s\) checked, 1 problem\(s\)/)
})

test('a done outcome with an unfinished write step fails the command', (t) => {
  const { file } = brokenCopy(t, (s) => {
    s.runs[0].outcome.steps[8].state = 'pending'
    s.runs[0].outcome.steps[8].attempt = 0
    return s
  })
  const res = run(file)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /runs\[0\]\.outcome\.steps\[write\]\.state: done means every step/)
})

test('a file that is not JSON fails', (t) => {
  const { file } = brokenCopy(t, (s) => s)
  writeFileSync(file, '{ not json')
  const res = run(file)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /not JSON/)
})
