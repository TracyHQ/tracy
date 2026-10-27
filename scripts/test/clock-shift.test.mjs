// `scripts/clock-shift.mjs` is a preload: it can only be judged from a process that loaded it. Every
// case here starts a child `node --import <preload>` and reads what that child saw.
//
// The children measure the shift against `performance.timeOrigin + performance.now()`, the one
// wall-clock reading the preload leaves alone, so this suite gives the same verdict when it is
// itself run under the preload (the nightly run of `scripts/run-clock-shift.mjs --all-workers`).
//
// The second half is the reason the preload exists: real session credentials, the real
// `SESSION_TTL_S` and the real `viewer()`, in fixtures written the way the pre-#838 test was
// written and the way #838 corrected it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { mintSession, SESSION_TTL_S, sessionFromCookieHeader } from '../../apps/tracy-web/src/lib/session.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PRELOAD = pathToFileURL(join(ROOT, 'scripts/clock-shift.mjs')).href
const SESSION_URL = pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/session.js')).href
const HTTP_URL = pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/http.js')).href
const DAY_MS = 86_400_000
const SECRET = 'clock-shift-fixture-secret'
const EMAIL = 'person@example.com'

const BASE = process.env.CLOCK_SHIFT_TEST_TMPDIR ?? tmpdir()
mkdirSync(BASE, { recursive: true })
const DIR = mkdtempSync(join(BASE, 'clock-shift-'))
after(() => rmSync(DIR, { recursive: true, force: true }))

/** The environment of a child: this one, with the offset set to `days` or left unset. */
function envWith(days) {
  const env = { ...process.env }
  // Set by the `node --test` running this suite; inherited, it would mute a child's own report.
  delete env.NODE_TEST_CONTEXT
  delete env.TRACY_TEST_CLOCK_OFFSET_DAYS
  if (days !== undefined) env.TRACY_TEST_CLOCK_OFFSET_DAYS = days
  return env
}

/** Runs `body` (an async function body returning a JSON value) under the preload. */
function child(body, days) {
  const source =
    'const real = () => performance.timeOrigin + performance.now();' +
    `const value = await (async () => { ${body} })();` +
    'process.stdout.write(JSON.stringify(value));'
  return spawnSync(process.execPath, ['--import', PRELOAD, '--input-type=module', '-e', source], {
    env: envWith(days),
    encoding: 'utf8',
    timeout: 60_000
  })
}

function seen(body, days) {
  const run = child(body, days)
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

/** `Date()` prints whole seconds, and the two clocks are read a few instructions apart. */
const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 5000,
    `${label}: ${String(actual)} is not within 5 s of ${String(expected)}`
  )

const THREE_FORMS = `return {
  now: Date.now() - real(),
  constructed: new Date().getTime() - real(),
  called: Date.parse(Date()) - real(),
  calledWithArguments: Date.parse(Date(0, 'ignored')) - real(),
  calledType: typeof Date()
}`

test('with no variable set the clock is 400 days ahead, the same for all three forms', () => {
  const got = seen(THREE_FORMS)
  near(got.now, 400 * DAY_MS, 'Date.now()')
  near(got.constructed, 400 * DAY_MS, 'new Date()')
  near(got.called, 400 * DAY_MS, 'Date()')
  // The original ignores its arguments when called as a function; so does the shifted one.
  near(got.calledWithArguments, 400 * DAY_MS, 'Date(0)')
  assert.equal(got.calledType, 'string')
})

test('TRACY_TEST_CLOCK_OFFSET_DAYS sets the distance; 0 is the control run on the real clock', () => {
  for (const [days, expected] of [
    ['0', 0],
    ['1', DAY_MS],
    ['0.5', DAY_MS / 2],
    ['3650', 3650 * DAY_MS]
  ]) {
    const got = seen(THREE_FORMS, days)
    near(got.now, expected, `Date.now() at ${days}`)
    near(got.constructed, expected, `new Date() at ${days}`)
    near(got.called, expected, `Date() at ${days}`)
  }
})

test('explicit dates, Date.parse, Date.UTC and the prototype are the originals', () => {
  const got = seen(`
    class Stamp extends Date {}
    const stamp = new Stamp()
    return {
      epoch: new Date(0).toISOString(),
      iso: new Date('2026-10-01T02:00:00Z').getTime(),
      parts: new Date(2026, 9, 1, 2, 0, 0).getMonth(),
      copy: new Date(new Date(7)).getTime(),
      invalidText: Number.isNaN(new Date('not a date').getTime()),
      invalidUndefined: Number.isNaN(new Date(undefined).getTime()),
      invalidNaN: Number.isNaN(new Date(NaN).getTime()),
      parse: Date.parse('2026-10-01T02:00:00Z'),
      utc: Date.UTC(2026, 9, 1, 2),
      isDate: new Date() instanceof Date,
      explicitIsDate: new Date(0) instanceof Date,
      constructor: new Date().constructor === Date,
      tag: Object.prototype.toString.call(new Date()),
      name: Date.name,
      length: Date.length,
      subclass: [stamp instanceof Stamp, stamp instanceof Date, new Stamp(5).getTime()],
      subclassNow: stamp.getTime() - real(),
      method: new Date(0).getUTCFullYear(),
      stubbed: (() => {
        const original = Date.now
        Date.now = () => 1700000000000
        const during = [Date.now(), Math.abs(new Date().getTime() - real()) > 86_400_000]
        Date.now = original
        return [...during, Date.now() > 1700000000000]
      })()
    }`)
  const fixed = 1790820000000
  assert.deepEqual(
    { ...got, subclassNow: null },
    {
      epoch: '1970-01-01T00:00:00.000Z',
      iso: fixed,
      parts: 9,
      copy: 7,
      invalidText: true,
      invalidUndefined: true,
      invalidNaN: true,
      parse: fixed,
      utc: fixed,
      isDate: true,
      explicitIsDate: true,
      constructor: true,
      tag: '[object Date]',
      name: 'Date',
      length: 7,
      subclass: [true, true, 5],
      subclassNow: null,
      method: 1970,
      // A test's own `Date.now` stub wins while it is in place, and restoring it restores the shift.
      stubbed: [1700000000000, true, true]
    }
  )
  near(got.subclassNow, 400 * DAY_MS, 'new (class extends Date)()')
})

test('timers and the monotonic clocks are not moved', () => {
  const got = seen(`
    const before = performance.now()
    const hr = process.hrtime.bigint()
    await new Promise((done) => setTimeout(done, 50))
    return {
      waited: performance.now() - before,
      hrWaited: Number(process.hrtime.bigint() - hr) / 1e6,
      uptime: performance.now()
    }`)
  assert.ok(got.waited >= 40 && got.waited < 30_000, `setTimeout(50) took ${String(got.waited)} ms`)
  assert.ok(got.hrWaited >= 40 && got.hrWaited < 30_000, `hrtime saw ${String(got.hrWaited)} ms`)
  assert.ok(got.uptime < 60_000, `performance.now() reads ${String(got.uptime)} ms in a new process`)
})

test('an offset that is not a plain non-negative number stops the process before any code runs', () => {
  for (const days of [
    '',
    'abc',
    '-1',
    '-0.5',
    'NaN',
    'Infinity',
    '1e3',
    '0x10',
    ' 5',
    '5 ',
    '5d',
    '1,5',
    '.5'
  ]) {
    const run = child('return Date.now()', days)
    assert.notEqual(run.status, 0, `offset ${JSON.stringify(days)} was accepted`)
    assert.equal(run.signal, null)
    assert.equal(run.stdout, '', `offset ${JSON.stringify(days)}: the program still ran`)
    assert.match(
      run.stderr,
      /clock-shift: TRACY_TEST_CLOCK_OFFSET_DAYS must be a non-negative number of days/
    )
  }
})

test('an offset past the last date JavaScript has is refused too', () => {
  const run = child('return Date.now()', '99999999999')
  assert.notEqual(run.status, 0)
  assert.equal(run.stdout, '')
  assert.match(
    run.stderr,
    /clock-shift: TRACY_TEST_CLOCK_OFFSET_DAYS=99999999999 moves the clock past the last date/
  )
})

// ── Credentials ─────────────────────────────────────────────────────────────────────────────────

test('the 01/10/2026 cookie: accepted inside its TTL, refused after it', async () => {
  const minted = Date.parse('2026-10-01T02:00:00Z')
  const cookie = `tracy_sess=${await mintSession(EMAIL, SECRET, minted)}`
  const at = (ms) => sessionFromCookieHeader(cookie, SECRET, ms)
  const expiry = minted + SESSION_TTL_S * 1000
  assert.equal(await at(minted), EMAIL)
  // One minute either side of the expiry, never the boundary itself.
  assert.equal(await at(expiry - 60_000), EMAIL)
  assert.equal(await at(expiry + 60_000), null)
})

const FIXTURE_HEAD = `import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintSession, SESSION_TTL_S, sessionFromCookieHeader, verifySession } from ${JSON.stringify(SESSION_URL)}
import { viewer } from ${JSON.stringify(HTTP_URL)}
const SECRET = ${JSON.stringify(SECRET)}
const EMAIL = ${JSON.stringify(EMAIL)}
const config = { sessionSecret: SECRET }
const request = (cookie) => ({ req: { header: (name) => (name === 'cookie' ? cookie : undefined) } })
`

/** Writes a fixture test file and runs it the way the runner does, TAP named explicitly. */
function runFixture(name, body, days) {
  const file = join(DIR, name)
  writeFileSync(file, FIXTURE_HEAD + body)
  return spawnSync(process.execPath, ['--import', PRELOAD, '--test', '--test-reporter=tap', file], {
    env: envWith(days),
    encoding: 'utf8',
    timeout: 120_000
  })
}

/**
 * The pre-#838 shape: a session minted at a fixed time, sent to a door that asks `viewer()`, which
 * verifies on the wall clock. `FIXED` is the real time this suite runs at — the day the fixture
 * "was written" — read from the clock the preload does not move.
 */
const fixedMintWallVerify = () => `
const FIXED = ${String(Math.floor(performance.timeOrigin + performance.now()))}
test('the signature is valid on the clock it was minted at', async () => {
  const cookie = 'tracy_sess=' + (await mintSession(EMAIL, SECRET, FIXED))
  assert.equal(await sessionFromCookieHeader(cookie, SECRET, FIXED), EMAIL)
})
test('viewer() on the wall clock', async () => {
  const cookie = 'tracy_sess=' + (await mintSession(EMAIL, SECRET, FIXED))
  assert.equal(await viewer(request(cookie), config), EMAIL)
})
`

test('a fixed mint time verified on the wall clock: green the day it is written, red past the TTL', () => {
  const written = runFixture('fixed-mint-wall-verify.test.mjs', fixedMintWallVerify(), '0')
  assert.equal(written.status, 0, written.stdout)

  const shifted = runFixture('fixed-mint-wall-verify.test.mjs', fixedMintWallVerify())
  assert.equal(shifted.status, 1, shifted.stdout)
  // The token itself is fine, and a verifier given the mint clock accepts it …
  assert.match(shifted.stdout, /^ok 1 - the signature is valid on the clock it was minted at$/m)
  // … it is `viewer()`, on the moved wall clock, that answers null.
  assert.match(shifted.stdout, /^not ok 2 - viewer\(\) on the wall clock$/m)
  assert.match(shifted.stdout, /expected: 'person@example\.com'/)
  assert.match(shifted.stdout, /actual: ~|actual: null/)
  assert.match(shifted.stdout, /^# pass 1$/m)
  assert.match(shifted.stdout, /^# fail 1$/m)
})

test('the same fixture turns red exactly when the shift passes the TTL', () => {
  // A tenth of a day inside the TTL is green, a tenth past it is red (the TTL is SESSION_TTL_S, whole days).
  const ttlDays = SESSION_TTL_S / 86_400
  assert.equal(
    runFixture('fixed-mint-ttl-edge.test.mjs', fixedMintWallVerify(), String(ttlDays - 0.1)).status,
    0
  )
  const past = runFixture('fixed-mint-ttl-edge.test.mjs', fixedMintWallVerify(), String(ttlDays + 0.1))
  assert.equal(past.status, 1, past.stdout)
  assert.match(past.stdout, /^not ok 2 - viewer\(\) on the wall clock$/m)
})

const PASSES_UNDER_ANY_SHIFT = {
  // #838: the door verifies on the wall clock, so the cookie is minted on it.
  'minted-on-the-verifier-clock.test.mjs': `
test('viewer() accepts a session minted with no time argument', async () => {
  const cookie = 'tracy_sess=' + (await mintSession(EMAIL, SECRET))
  assert.equal(await viewer(request(cookie), config), EMAIL)
})
`,
  // Expiry tests stay expressible: one injected clock goes to minting AND to verification.
  'same-injected-clock.test.mjs': `
const clock = Date.parse('2026-10-01T02:00:00Z')
test('a session is accepted until its TTL and refused after it, on one injected clock', async () => {
  const token = await mintSession(EMAIL, SECRET, clock)
  assert.equal(await verifySession(token, SECRET, clock), EMAIL)
  assert.equal(await verifySession(token, SECRET, clock + SESSION_TTL_S * 1000 - 60_000), EMAIL)
  assert.equal(await verifySession(token, SECRET, clock + SESSION_TTL_S * 1000 + 60_000), null)
  assert.equal(await sessionFromCookieHeader('tracy_sess=' + token, SECRET, clock), EMAIL)
})
test('an expired session built from the wall clock stays expired', async () => {
  const stale = await mintSession(EMAIL, SECRET, Date.now() - (SESSION_TTL_S + 3600) * 1000)
  assert.equal(await viewer(request('tracy_sess=' + stale), config), null)
})
`,
  // Fixed dates as such are not the problem and are not flagged.
  'unrelated-fixed-dates.test.mjs': `
test('fixed dates that no verifier reads', () => {
  const day = new Date('2026-10-01T02:00:00Z')
  assert.equal(day.toISOString(), '2026-10-01T02:00:00.000Z')
  assert.equal(Date.UTC(2026, 9, 1, 2), day.getTime())
  assert.equal(new Date(day.getTime() + 86_400_000).getUTCDate(), 2)
  assert.equal(Date.parse('2020-01-01T00:00:00Z') < day.getTime(), true)
})
`
}

for (const [name, body] of Object.entries(PASSES_UNDER_ANY_SHIFT)) {
  test(`${name}: green on the real clock, 400 days on and 10 years on`, () => {
    for (const days of ['0', undefined, '3650']) {
      const run = runFixture(name, body, days)
      assert.equal(run.status, 0, `offset ${String(days)}\n${run.stdout}`)
      assert.match(run.stdout, /^# fail 0$/m)
      assert.match(run.stdout, /^# skipped 0$/m)
    }
  })
}
