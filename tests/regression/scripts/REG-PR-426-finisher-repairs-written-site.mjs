// Regression script for the write step finisher (#426).
// Runs each bench-seam finisher test file on its own with one test at a time,
// and prints one "ok -" or "not ok -" line per condition. Exit 0 only when all hold.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const dir = 'apps/tracy-web/test'
const files = readdirSync(dir)
  .filter((f) => /^write-step-bench-finish.*\.test\.mjs$/.test(f))
  .sort()

// Tests that carry the case's expect lines: a renamed or deleted one turns the case red.
const required = [
  'a raw markup fault is repaired through the write door and kept when the checker says better',
  'a repair the checker finds not better is reverted by its apply id and logged as undone',
  'every banned declaration is refused by code, nothing is written, and the refusal is logged',
  'a time overrun stops the finisher at once',
  'a kept repair the final site check blames for a new blocking failure is undone, and the check runs again',
  'with no fault the finisher writes nothing'
]

let failed = false
const tap = []
if (files.length < 6) {
  console.log(`not ok - expected at least 6 finisher test files, found ${files.length}`)
  process.exit(1)
}
for (const f of files) {
  const r = spawnSync('node', ['--test', '--test-concurrency=1', '--test-reporter=tap', `${dir}/${f}`], {
    encoding: 'utf8',
    timeout: 600_000
  })
  const out = r.stdout || ''
  tap.push(out)
  const ok = r.status === 0 && !/^\s*not ok /m.test(out)
  console.log(`${ok ? 'ok' : 'not ok'} - ${f}`)
  if (!ok) failed = true
}
const all = tap.join('\n')
for (const name of required) {
  const hit = all.split('\n').some((l) => /^\s*ok \d+ - /.test(l) && l.includes(name))
  console.log(`${hit ? 'ok' : 'not ok'} - test reported ok: ${name}`)
  if (!hit) failed = true
}
process.exit(failed ? 1 : 0)
