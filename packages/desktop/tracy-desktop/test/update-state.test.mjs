/**
 * The update state the Help & about page shows (`src/update-state.js`): a pure reducer from the
 * updater's events to one small state, and the release notes cleaned before they cross IPC.
 *
 *   node --test packages/desktop/tracy-desktop/test/update-state.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  initialUpdateState,
  offUpdateState,
  reduceUpdate,
  normalizeReleaseNotes,
  MAX_NOTES
} = require('../src/update-state.js')

const run = (events, state = initialUpdateState({ autoCheck: true })) =>
  events.reduce((s, e) => reduceUpdate(s, e), state)

test('a fresh updater has not checked yet: idle, never "up to date"', () => {
  const s = initialUpdateState({ autoCheck: true })
  assert.equal(s.status, 'idle')
  assert.equal(s.lastCheckedAt, null)
  assert.equal(s.autoCheck, true)
  assert.equal(s.revision, 0)
})

test('a copy that does not update itself is off', () => {
  assert.equal(offUpdateState().status, 'off')
  assert.equal(offUpdateState().autoCheck, false)
})

test('a check with nothing new ends current, with the time it finished', () => {
  const s = run([{ type: 'checking' }, { type: 'not-available', at: 1000 }])
  assert.equal(s.status, 'current')
  assert.equal(s.lastCheckedAt, 1000)
})

test('every event moves the revision forward, so a late snapshot cannot replace a newer one', () => {
  const s = run([{ type: 'checking' }, { type: 'not-available', at: 1 }, { type: 'checking' }])
  assert.equal(s.revision, 3)
})

test('a new version on a copy that installs in place downloads, with progress, then is ready', () => {
  const a = run([{ type: 'checking' }, { type: 'available', at: 5, version: '0.3.0', inPlace: true }])
  assert.equal(a.status, 'downloading')
  assert.equal(a.version, '0.3.0')
  assert.equal(a.percent, 0)
  const b = reduceUpdate(a, { type: 'progress', percent: 41.7 })
  assert.equal(b.percent, 42)
  const c = reduceUpdate(b, { type: 'downloaded', version: '0.3.0', releaseNotes: '- one' })
  assert.equal(c.status, 'downloaded')
  assert.equal(c.releaseNotes, '- one')
  assert.equal(c.percent, null)
})

test('an ad-hoc signed copy is told the version is out and offered the download', () => {
  const s = run([{ type: 'available', at: 5, version: '0.3.0', inPlace: false, releaseNotes: 'x' }])
  assert.equal(s.status, 'available-manual')
  assert.equal(s.releaseNotes, 'x')
})

test('a check while a version waits to install keeps it: still downloaded, notes kept', () => {
  const ready = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', version: '0.3.0', releaseNotes: 'n' }
  ])
  const s = run([{ type: 'checking' }, { type: 'not-available', at: 9 }, { type: 'error', at: 10 }], ready)
  assert.equal(s.status, 'downloaded')
  assert.equal(s.version, '0.3.0')
  assert.equal(s.releaseNotes, 'n')
})

test('there is no Later any more: the state has no postponed flag and a "later" event moves nothing', () => {
  const ready = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', at: 2, version: '0.3.0' }
  ])
  assert.equal('postponed' in ready, false)
  const s = reduceUpdate(ready, { type: 'later' })
  assert.deepEqual({ ...s, revision: 0 }, { ...ready, revision: 0 })
})

test('readySince: set when the first version is ready, kept when the same one is downloaded again', () => {
  const ready = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', at: 100, version: '0.3.0' }
  ])
  assert.equal(ready.readySince, 100)
  // electron-updater re-emits update-downloaded from its cache on a later check.
  const again = run([{ type: 'checking' }, { type: 'downloaded', at: 900, version: '0.3.0' }], ready)
  assert.equal(again.readySince, 100)
})

test('readySince: a newer version downloaded while the app still runs the old one does not move it', () => {
  const ready = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', at: 100, version: '0.3.0' },
    { type: 'available', at: 500, version: '0.3.1', inPlace: true },
    { type: 'downloaded', at: 600, version: '0.3.1' }
  ])
  assert.equal(ready.status, 'downloaded')
  assert.equal(ready.version, '0.3.1')
  assert.equal(ready.readySince, 100)
})

test('stagedVersion: the version Squirrel prepared to install on quit; a newer download keeps it until staged too', () => {
  const s = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', at: 100, version: '0.3.0' }
  ])
  assert.equal(s.stagedVersion, null)
  const staged = reduceUpdate(s, { type: 'staged', version: '0.3.0' })
  assert.equal(staged.stagedVersion, '0.3.0')
  const newer = run(
    [
      { type: 'available', at: 500, version: '0.3.1', inPlace: true },
      { type: 'downloaded', at: 600, version: '0.3.1' }
    ],
    staged
  )
  assert.equal(newer.stagedVersion, '0.3.0')
  assert.equal(reduceUpdate(newer, { type: 'staged', version: '0.3.1' }).stagedVersion, '0.3.1')
})

test('an install refused after Restart keeps readySince and the staged version', () => {
  const s = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', at: 100, version: '0.3.0' },
    { type: 'staged', version: '0.3.0' },
    { type: 'install' },
    { type: 'error', at: 200 }
  ])
  assert.equal(s.status, 'install-error')
  assert.equal(s.readySince, 100)
  assert.equal(s.stagedVersion, '0.3.0')
})

test('a network failure is an error with the next try; with automatic checks off there is no next try', () => {
  const on = run([{ type: 'checking' }, { type: 'error', at: 2, nextRetryAt: 600_002 }])
  assert.equal(on.status, 'error')
  assert.equal(on.nextRetryAt, 600_002)
  const off = run(
    [{ type: 'checking' }, { type: 'error', at: 2, nextRetryAt: 600_002 }],
    initialUpdateState({ autoCheck: false })
  )
  assert.equal(off.nextRetryAt, null)
  assert.equal(reduceUpdate(on, { type: 'auto-check', on: false }).nextRetryAt, null)
})

test('Restart installs only a downloaded version; a refusal after it is an install error, not a network one', () => {
  const idle = run([{ type: 'install' }])
  assert.equal(idle.status, 'idle')
  const installing = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'downloaded', version: '0.3.0' },
    { type: 'install' }
  ])
  assert.equal(installing.status, 'installing')
  const refused = reduceUpdate(installing, { type: 'error', at: 3 })
  assert.equal(refused.status, 'install-error')
  assert.equal(refused.version, '0.3.0')
  assert.equal(reduceUpdate(refused, { type: 'install' }).status, 'installing')
})

test('a download that fails is a plain error and drops the half-downloaded version', () => {
  const s = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: true },
    { type: 'error', at: 2, nextRetryAt: 9 }
  ])
  assert.equal(s.status, 'error')
  assert.equal(s.version, null)
})

test('nothing moves an off copy', () => {
  const s = run(
    [{ type: 'checking' }, { type: 'available', at: 1, version: '9.9.9', inPlace: true }],
    offUpdateState()
  )
  assert.equal(s.status, 'off')
})

test('release notes: a string is kept, CRLF and control characters go, bidi overrides go', () => {
  assert.equal(normalizeReleaseNotes('a\r\nb\rc'), 'a\nb\nc')
  assert.equal(normalizeReleaseNotes('x\u0000y\u0007z\tw'), 'xyz\tw')
  const [rlo, lri, pdi] = [0x202e, 0x2066, 0x2069].map((c) => String.fromCharCode(c))
  assert.equal(normalizeReleaseNotes(`safe${rlo}txt.exe${lri}${pdi}`), 'safetxt.exe')
})

test('release notes: HTML tags are dropped to text, never passed on as markup', () => {
  assert.equal(normalizeReleaseNotes('<p>New <b>thing</b></p><script>x()</script>'), 'New thingx()')
})

test('release notes: the array form electron-updater gives joins its notes, newest first', () => {
  assert.equal(
    normalizeReleaseNotes([
      { version: '0.3.0', note: '- b' },
      { version: '0.2.9', note: null },
      { version: '0.2.8', note: '- a' }
    ]),
    '- b\n\n- a'
  )
})

test('release notes: anything else, or only whitespace, is no notes', () => {
  for (const raw of [undefined, null, 42, {}, '   \n ', [{ nope: 1 }]])
    assert.equal(normalizeReleaseNotes(raw), null)
})

test('release notes are capped before they cross IPC', () => {
  const s = normalizeReleaseNotes('x'.repeat(MAX_NOTES + 500))
  assert.equal(s.length, MAX_NOTES + 1)
  assert.ok(s.endsWith('…'))
  assert.equal(MAX_NOTES, 20_000)
})

test('the reducer takes release notes only through normalizeReleaseNotes', () => {
  const s = run([
    { type: 'available', at: 1, version: '0.3.0', inPlace: false, releaseNotes: '<i>hi</i>\r\n' }
  ])
  assert.equal(s.releaseNotes, 'hi')
})

test('release notes: comparison signs that are not tags stay', () => {
  assert.equal(normalizeReleaseNotes('- a < b and c > d\n- 1<2'), '- a < b and c > d\n- 1<2')
  assert.equal(normalizeReleaseNotes('x <img src=y onerror=z> w'), 'x  w')
})

test('release notes: the Desktop-only mark (E9) is dropped from every line, the line itself is kept', () => {
  const page = [
    '- desktop: Updates install when you quit',
    '- Desktop: Notifications when a turn ends {desktop}',
    '- Sites open faster',
    '- Help & about shows what is new <Badge text="Desktop only" variant="note" />',
    '- Deep links open the app <Badge>Desktop only</Badge>',
    'desktop: A plain line'
  ].join('\n')
  assert.equal(
    normalizeReleaseNotes(page),
    [
      '- Updates install when you quit',
      '- Notifications when a turn ends',
      '- Sites open faster',
      '- Help & about shows what is new',
      '- Deep links open the app',
      'A plain line'
    ].join('\n')
  )
  // "desktop" in prose is prose.
  assert.equal(normalizeReleaseNotes('- The desktop app: faster start'), '- The desktop app: faster start')
})
