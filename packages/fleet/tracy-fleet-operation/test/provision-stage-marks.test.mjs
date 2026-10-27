/**
 * `stage` speaks to the customer; `mark` speaks only to the timing log. This pins the WRITING side
 * of that split — `apps/tracy-host/test/provision.test.mjs` pins the reading side, where the parser
 * lives, and neither test is enough on its own.
 *
 * 🔒 WHY A SECOND TEST AND NOT A LONGER ONE. The reading side proves that a line beginning `[stage]`
 * is not turned into a job step. It cannot prove that `mark` EMITS such a line rather than a `==>`
 * one — that fact lives in the shell. And the failure it guards is silent in the worst way: a
 * `mark` that reached stdout would put an internal boundary name ("· pulling and starting the site
 * containers") on the Build screen as a step the customer never asked about, and nothing anywhere
 * would error.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/provision-stage-marks.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url))

/**
 * The three timing helpers, lifted out of the real script.
 *
 * Anchored on the function names rather than on line numbers, and asserted non-empty below: if a
 * rename or a reorder breaks the range, this test goes RED rather than quietly running an empty
 * string and reporting that nothing reached stdout.
 */
function helpers() {
  const src = readFileSync(SCRIPT, 'utf8')
  const from = src.indexOf('stage_boundary() {')
  const to = src.indexOf('\n}\n', src.indexOf('mark() {'))
  assert.ok(from !== -1, 'provision.sh no longer defines stage_boundary()')
  assert.ok(to !== -1 && to > from, 'provision.sh no longer defines mark() after stage_boundary()')
  return src.slice(from, to + 3)
}

/** Run a snippet with the helpers in scope; returns the two streams apart. */
function run(snippet) {
  const out = spawnSync(
    'bash',
    [
      '-c',
      `STAGE_T0=$(date +%s); STAGE_LAST=$STAGE_T0; STAGE_PREV_NAME=start; STAGE_TIMES=""\n${helpers()}\n${snippet}`
    ],
    { encoding: 'utf8' }
  )
  assert.equal(out.status, 0, out.stderr)
  return { stdout: out.stdout, stderr: out.stderr }
}

test('stage says its line to the customer; mark says nothing to the customer', () => {
  const { stdout, stderr } = run('stage "fetching webroot"\nmark "pulling and starting the site containers"')
  // The customer's Build screen reads stdout and shows anything starting `==`.
  assert.equal(stdout, '==> fetching webroot\n')
  assert.doesNotMatch(stdout, /pulling and starting/)
  // Both boundaries are timed, and the mark is the one that is not a step.
  assert.match(stderr, /\[stage\].*start/)
  assert.match(stderr, /\[stage\].*fetching webroot/)
})

/**
 * 🔒 NOT ONE BYTE OF A MARK MAY START WITH `=`. That single character is the whole contract with
 * `stepFromLine` in tracy-host: it strips the `=` and shows the rest to the customer. A mark whose
 * name happened to begin with one would be indistinguishable from a step.
 */
test('no line a mark produces could be read as a job step', () => {
  const { stdout, stderr } = run(
    [
      'mark "configuring the site for its new address"',
      'mark "pulling and starting the site containers"'
    ].join('\n')
  )
  assert.equal(stdout, '', 'a mark must put nothing on stdout at all')
  for (const line of stderr.split('\n')) {
    if (line === '') continue
    assert.ok(!line.startsWith('='), `a mark reached the step parser: ${line}`)
    assert.match(line, /^\[stage\]/, line)
  }
})

/** The `·` is how a reader tells an internal boundary from one the customer was shown. */
test('a mark is marked as internal in the log, a stage is not', () => {
  const { stderr } = run('mark "pulling images"\nstage "starting database"\nmark "done"')
  const named = stderr
    .split('\n')
    .filter((l) => l.startsWith('[stage]'))
    .map((l) => l.replace(/^\[stage\]\s+\d+s\s+\+\d+s\s+/, ''))
  assert.ok(named.includes('· pulling images'), named.join(' | '))
  assert.ok(named.includes('starting database'), named.join(' | '))
})
