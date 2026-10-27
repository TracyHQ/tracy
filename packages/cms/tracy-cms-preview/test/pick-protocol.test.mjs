/**
 * The picker's half of the contract: what the side card may ask a page (start, stop, move a level)
 * and what a page may send back. Held by machine because three trees read it (runtime, side card,
 * build) and a renamed kind fails silently — the Comment button simply never lights.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import * as esbuild from 'esbuild'
import {
  CHANNEL,
  FEATURES,
  LIMITS,
  LOST_REASONS,
  PICK,
  TRACK_LIMITS,
  TRACK_STATES,
  VERSION,
  VIEW,
  isMessage,
  pickMessage,
  holdMessage,
  revealMessage,
  scrollToMessage,
  wheelMessage,
  trackItems,
  trackMessage,
  viewFrom
} from '../protocol.mjs'
import { RUNTIME_VERSION, plan } from '../scripts/build.mjs'

test('the page announces what it can do; picking, tracking, revealing, the words now, holding, the scroll, following, lockstep, names and clipping are features, not a version', () => {
  assert.deepEqual(
    [...FEATURES],
    [
      'pick',
      'track',
      'reveal',
      'text',
      'hold',
      'scroll',
      'follow',
      'lockstep',
      'name',
      'clip',
      'route',
      'refocus',
      'pins60',
      'wheel',
      'widen'
    ]
  )
  assert.equal(
    VERSION,
    1,
    'a new kind is additive: an old side card ignores it, an old page never lights Comment'
  )
})

test('the side card can only start, stop, or move the picked level — nothing names an element', () => {
  assert.deepEqual(pickMessage(PICK.start), { channel: CHANNEL, v: VERSION, kind: 'pick-start' })
  assert.deepEqual(pickMessage(PICK.stop), { channel: CHANNEL, v: VERSION, kind: 'pick-stop' })
  assert.deepEqual(pickMessage(PICK.level, 2), { channel: CHANNEL, v: VERSION, kind: 'pick-level', index: 2 })
  assert.equal(pickMessage(PICK.level, -1).index, 0, 'a level is clamped, never trusted')
  assert.equal(pickMessage(PICK.level, 'x').index, 0)
  assert.equal(pickMessage('picked'), null, 'a page-to-side-card kind is not something the side card sends')
  assert.equal(pickMessage('refresh'), null)
  assert.ok(isMessage(pickMessage(PICK.start), 'pick-start'))
})

test('limits bound what a page may send out, so a picked element cannot carry the whole page', () => {
  assert.ok(LIMITS.text > 0 && LIMITS.text <= 500)
  assert.ok(LIMITS.marks > 0 && LIMITS.levels > 0 && LIMITS.domPath > 0)
})

test('the side card gets the kinds, the feature list and the target shape', async () => {
  const contract = (await plan()).files.get('sidecard/preview-protocol.generated.ts')
  assert.match(
    contract,
    /PREVIEW_FEATURES = \["pick","track","reveal","text","hold","scroll","follow","lockstep","name","clip","route","refocus","pins60","wheel","widen"\]/
  )
  assert.match(contract, /PREVIEW_HIDDEN_REASONS = \["clipped","covered"\]/)
  assert.match(contract, /name\?: string/)
  assert.match(contract, /hidden\?: PreviewHidden/)
  assert.match(contract, /export function previewScrollToMessage/)
  for (const kind of Object.values(PICK)) assert.ok(contract.includes(`"${kind}"`), `${kind} missing`)
  assert.match(contract, /export interface PreviewPickTarget/)
  assert.match(contract, /export function previewPickMessage/)
})

// ── Tracked elements (feature `track`, runtime 5) ─────────────────────────────────────────────

test('runtime 19 widens a pick; 18 says the address without a picker; a page keeps the higher of two copies', () => {
  // 5 tracked elements, 6 added `inside` on one branch and reveal/pending on another: the copy
  // holding both is 7, so no two different copies ever share a number. 8 reports the one image a
  // picked text-less wrapper holds (a card's linked image), so it must not tie with a 7. 9 says what
  // a tracked element reads now (`pick-text`, F16), so it must not tie with an 8. 10 was drafted
  // twice, on two branches: one answered `pick-hold` (Brian 29/09 23:08), the other said where the
  // page is scrolled to and went back there (`pick-scroll` / `pick-scroll-to`). The copy holding both
  // is 11, so no two different copies ever share a number (the same rule as 7). 12 draws an outline in
  // the page's coordinates when its element moves with the page (feature `follow`, Brian 30/09). 13
  // picks the smallest box WITH CONTENT under the pointer (K01/K04): nothing on the wire changes. 14
  // (acceptance v3) scrolls in lockstep with the side card's boxes, names an element with no words and
  // says when an element must not be drawn over (features `lockstep`, `name`, `clip`). 15 (acceptance v5)
  // keeps the focus out of the page while a box is open and asks for it back (feature `refocus`). 16
  // (acceptance v5 pick) takes 60 tracked elements and the wheel over a box (`pins60`, `wheel`). The
  // view report (`view`, address, scroll, window, scheme) was drafted as 8 on another branch, beside
  // this branch's 8; the copy holding it and 16 is 17, so no two different copies share a number. 18
  // says the page's address to the origin the proxy named when there is no picker (feature `address`,
  // Brian 30/09 on EmDash: a link followed inside an unvouched frame left the address bar behind).
  // 19 moves the pick itself on `pick-level` and lists every ancestor with a box of its own as a level
  // (feature `widen`, Akemi's edit-mode review E2, 01/10/2026). 20 names a level by what the page says
  // (`name`, `landmark`) and keeps one level for a run of anonymous wrappers (Akemi 01/10/2026).
  assert.equal(RUNTIME_VERSION, 20)
})

test('three new kinds, named once: the side card sends pick-track, the page answers rect or lost', () => {
  assert.equal(PICK.track, 'pick-track')
  assert.equal(PICK.rect, 'pick-rect')
  assert.equal(PICK.lost, 'pick-lost')
  // The existing kinds keep their bytes.
  assert.deepEqual(
    [PICK.start, PICK.stop, PICK.level, PICK.hover, PICK.picked, PICK.cancel],
    ['pick-start', 'pick-stop', 'pick-level', 'pick-hover', 'picked', 'pick-cancel']
  )
  assert.deepEqual(
    [...TRACK_STATES],
    ['saved', 'active', 'sent', 'working', 'done', 'failed', 'asked', 'pending']
  )
  assert.deepEqual([...LOST_REASONS], ['missing', 'many', 'changed'])
  // Runtime 16 (`pins60`): 60 per set; a page that does not name it takes 12 (`itemsBefore16`).
  assert.deepEqual({ ...TRACK_LIMITS }, { items: 60, itemsBefore16: 12, id: 64, selector: 512, match: 40 })
  assert.deepEqual({ ...LIMITS }, { text: 300, marks: 12, levels: 8, domPath: 8 }, 'LIMITS is untouched')
  assert.equal(pickMessage(PICK.track), null, 'pick-track is built by trackMessage, with its items')
})

const item = (n, extra = {}) => ({
  id: `c${String(n)}`,
  selector: `#a${String(n)}`,
  text: 'Hello',
  state: 'saved',
  ...extra
})

test('pick-track carries the whole set; 0 to 60 items are a set, 61 is not (runtime 16, pins60)', () => {
  assert.deepEqual(trackMessage([]), { channel: CHANNEL, v: VERSION, kind: 'pick-track', items: [] })
  for (const n of [1, 3, 12, 13, 60]) {
    const items = Array.from({ length: n }, (_, i) => item(i))
    assert.deepEqual(trackMessage(items).items, items)
    assert.ok(isMessage(trackMessage(items), 'pick-track'))
  }
  assert.equal(trackMessage(Array.from({ length: 61 }, (_, i) => item(i))), null)
})

test('one bad item refuses the whole set, never half of it', () => {
  const bad = [
    item(1, { id: '' }),
    item(1, { id: 'x'.repeat(65) }),
    item(1, { id: 7 }),
    item(1, { selector: '' }),
    item(1, { selector: `#${'a'.repeat(512)}` }),
    item(1, { text: 'x'.repeat(LIMITS.text + 1) }),
    item(1, { text: null }),
    item(1, { state: 'lost' }),
    item(1, { state: 'draft' }),
    null,
    'c1'
  ]
  for (const one of bad) assert.equal(trackItems([item(0), one]), null, JSON.stringify(one))
  assert.equal(trackItems([item(1), item(1)]), null, 'two items with one id cannot be told apart')
  for (const junk of [undefined, null, {}, 'x', 3]) assert.equal(trackItems(junk), null)
  assert.equal(trackItems([item(1, { id: 'x'.repeat(64), selector: 'a'.repeat(512) })]).length, 1)
  // Only the four fields ride along: nothing else a caller put on an item reaches the page.
  assert.deepEqual(trackItems([{ ...item(1), rect: { x: 1 }, note: 'secret' }]), [item(1)])
})

test('the side card gets the new kinds, the bounds and a pick-track builder that refuses what the page refuses', async () => {
  const contract = (await plan()).files.get('sidecard/preview-protocol.generated.ts')
  assert.match(
    contract,
    /export const PREVIEW_TRACK_STATES = \["saved","active","sent","working","done","failed","asked","pending"\] as const/
  )
  assert.match(contract, /export const PREVIEW_LOST_REASONS = \["missing","many","changed"\] as const/)
  assert.match(
    contract,
    /export const PREVIEW_TRACK_LIMITS = \{"items":60,"itemsBefore16":12,"id":64,"selector":512,"match":40\} as const/
  )
  assert.match(contract, /export interface PreviewTrackItem/)
  // Run the generated TypeScript: its builder must agree with trackMessage on every case above.
  const { code } = await esbuild.transform(contract, { loader: 'ts', format: 'esm' })
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  const cases = [
    [],
    [item(1)],
    Array.from({ length: 12 }, (_, i) => item(i)),
    Array.from({ length: 13 }, (_, i) => item(i)),
    Array.from({ length: 60 }, (_, i) => item(i)),
    Array.from({ length: 61 }, (_, i) => item(i)),
    [item(1), item(1)],
    [item(1, { id: 'x'.repeat(65) })],
    [item(1, { selector: 'a'.repeat(513) })],
    [item(1, { text: 'x'.repeat(LIMITS.text + 1) })],
    [item(1, { state: 'lost' })],
    [{ ...item(1), extra: 1 }],
    [null],
    'nope'
  ]
  for (const one of cases)
    assert.deepEqual(mod.previewTrackMessage(one), trackMessage(one), JSON.stringify(one))
})

// ── Reveal (runtime 7) ────────────────────────────────────────────────────────────────────────

test('pick-reveal is one new side-card kind; every existing kind keeps its bytes', () => {
  assert.equal(PICK.reveal, 'pick-reveal')
  assert.deepEqual(Object.keys(PICK), [
    'start',
    'stop',
    'level',
    'hover',
    'picked',
    'cancel',
    'track',
    'rect',
    'lost',
    'reveal',
    'text',
    'hold',
    'outside',
    'scroll',
    'scrollTo',
    'step',
    'drawn',
    'refocus',
    'wheel'
  ])
  assert.equal(VERSION, 1, 'a new kind is additive: no contract version bump')
  // Announced, so a side card knows not to send `pending` to a runtime-5 page (it refuses the set).
  assert.deepEqual([...FEATURES].slice(0, 3), ['pick', 'track', 'reveal'])
  assert.equal(pickMessage(PICK.reveal), null, 'pick-reveal is built by revealMessage, with its id')
})

test('pick-text is one new page kind (runtime 9, F16); announced as the feature text', () => {
  assert.equal(PICK.text, 'pick-text')
  assert.equal(FEATURES[3], 'text')
  assert.equal(pickMessage(PICK.text), null, 'the page sends it; the side card never asks for it')
})

test('pick-hold {on} is one new side-card kind, pick-outside one new page kind (runtime 11); announced as hold', () => {
  assert.equal(PICK.hold, 'pick-hold')
  assert.equal(PICK.outside, 'pick-outside')
  assert.ok(FEATURES.includes('hold'))
  assert.deepEqual(holdMessage(true), { channel: CHANNEL, v: VERSION, kind: 'pick-hold', on: true })
  assert.deepEqual(holdMessage(false), { channel: CHANNEL, v: VERSION, kind: 'pick-hold', on: false })
  assert.equal(holdMessage('yes').on, false, 'only true holds')
  assert.equal(pickMessage(PICK.hold), null, 'pick-hold is built by holdMessage, with its flag')
})

test("the side card's previewHoldMessage builds exactly what holdMessage builds", async () => {
  const contract = (await plan()).files.get('sidecard/preview-protocol.generated.ts')
  const js = (await esbuild.transform(contract, { loader: 'ts', format: 'esm' })).code
  const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`)
  for (const on of [true, false]) assert.deepEqual(mod.previewHoldMessage(on), holdMessage(on))
})

test('pick-scroll and pick-scroll-to are one new kind each (runtime 11); announced as the feature scroll', () => {
  assert.equal(PICK.scroll, 'pick-scroll')
  assert.equal(PICK.scrollTo, 'pick-scroll-to')
  assert.ok(FEATURES.includes('scroll'))
  assert.equal(pickMessage(PICK.scrollTo), null, 'pick-scroll-to is built by scrollToMessage, with its place')
  assert.ok(isMessage(scrollToMessage(0, 10), 'pick-scroll-to'))
})

test('revealMessage carries one id, bounded like a tracked id', () => {
  assert.deepEqual(revealMessage('c1'), { channel: CHANNEL, v: VERSION, kind: 'pick-reveal', id: 'c1' })
  assert.ok(isMessage(revealMessage('c1'), 'pick-reveal'))
  assert.equal(revealMessage('x'.repeat(TRACK_LIMITS.id)).id.length, TRACK_LIMITS.id)
  for (const junk of ['', 'x'.repeat(TRACK_LIMITS.id + 1), 7, null, undefined, {}])
    assert.equal(revealMessage(junk), null, JSON.stringify(junk))
})

test('pending is a tracked state; resolved is never one, and refuses the set like any unknown state', () => {
  assert.deepEqual(trackItems([item(1, { state: 'pending' })]), [item(1, { state: 'pending' })])
  assert.equal(trackItems([item(0), item(1, { state: 'resolved' })]), null)
  assert.equal(trackMessage([item(1, { state: 'resolved' })]), null)
})

test('the side card gets pick-reveal, the pending state and a reveal builder that agrees with the page', async () => {
  const contract = (await plan()).files.get('sidecard/preview-protocol.generated.ts')
  assert.match(contract, /"reveal":"pick-reveal"/)
  assert.match(contract, /export function previewRevealMessage\(id: unknown\)/)
  const { code } = await esbuild.transform(contract, { loader: 'ts', format: 'esm' })
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  assert.equal(mod.PREVIEW_PICK.reveal, 'pick-reveal')
  assert.ok(mod.PREVIEW_TRACK_STATES.includes('pending'))
  assert.ok(!mod.PREVIEW_TRACK_STATES.includes('resolved'))
  for (const one of ['c1', 'x'.repeat(64), 'x'.repeat(65), '', 7, null])
    assert.deepEqual(mod.previewRevealMessage(one), revealMessage(one), JSON.stringify(one))
  assert.deepEqual(
    mod.previewTrackMessage([item(1, { state: 'pending' })]),
    trackMessage([item(1, { state: 'pending' })])
  )
  assert.equal(mod.previewTrackMessage([item(1, { state: 'resolved' })]), null)
})

test('pick-wheel (runtime 16, feature wheel): a wheel step over a box, for the scroller its element is in', async () => {
  assert.equal(PICK.wheel, 'pick-wheel')
  assert.deepEqual(wheelMessage(0, 40), { channel: CHANNEL, v: VERSION, kind: 'pick-wheel', dx: 0, dy: 40 })
  assert.deepEqual(wheelMessage(-3.4, 12.6, 'c1'), {
    channel: CHANNEL,
    v: VERSION,
    kind: 'pick-wheel',
    dx: -3,
    dy: 13,
    id: 'c1'
  })
  for (const [dx, dy, id] of [
    [Number.NaN, 1],
    [1, Number.POSITIVE_INFINITY],
    ['1', 2],
    [0, 20001],
    [0, 0],
    [0, 4, ''],
    [0, 4, 'x'.repeat(TRACK_LIMITS.id + 1)],
    [0, 4, 7]
  ])
    assert.equal(wheelMessage(dx, dy, id), null, JSON.stringify([dx, dy, id]))
  assert.equal(pickMessage(PICK.wheel), null, 'built by wheelMessage, with its step')
  const contract = (await plan()).files.get('sidecard/preview-protocol.generated.ts')
  const { code } = await esbuild.transform(contract, { loader: 'ts', format: 'esm' })
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  for (const args of [
    [0, 40],
    [-3.4, 12.6, 'c1'],
    [0, 0],
    [0, 20001],
    [0, 4, ''],
    [1, 1, null]
  ])
    assert.deepEqual(mod.previewWheelMessage(...args), wheelMessage(...args), JSON.stringify(args))
})

// ── the view report (runtime 17) ───────────────────────────────────────────────────────────────────

const REPORT = {
  channel: CHANNEL,
  v: VERSION,
  kind: 'view',
  url: 'https://site.example/pricing',
  y: 1200,
  w: 640,
  h: 800,
  dark: true,
  t: 1_700_000_000_123
}

test('the view report is one kind, named once, and is not a feature: nothing the side card reads changed', () => {
  assert.equal(VIEW.report, 'view')
  assert.equal(VIEW.gap, 250)
  // The side card's generated contract lists the features and the pick kinds; the view is in neither,
  // so no fork edit is needed and an older side card ignores the kind as it ignores any it does not know.
  assert.ok(!FEATURES.includes('view'))
  assert.ok(!Object.values(PICK).includes('view'))
  assert.equal(VERSION, 1)
})

test('viewFrom reads a whole report and nothing else', () => {
  assert.deepEqual(viewFrom(REPORT), {
    url: 'https://site.example/pricing',
    y: 1200,
    w: 640,
    h: 800,
    dark: true,
    t: 1_700_000_000_123
  })
  // A scheme that is not exactly `true` is light.
  assert.equal(viewFrom({ ...REPORT, dark: 'yes' })?.dark, false)
  assert.equal(viewFrom({ ...REPORT, dark: undefined })?.dark, false)
  // The top of the page is a scroll of 0.
  assert.equal(viewFrom({ ...REPORT, y: 0 })?.y, 0)
})

test('viewFrom is total: whatever a page posted, it answers null rather than throw', () => {
  for (const bad of [
    undefined,
    null,
    42,
    'view',
    [],
    {},
    { ...REPORT, channel: 'other' },
    { ...REPORT, v: 2 },
    { ...REPORT, kind: 'ready' },
    { ...REPORT, url: '' },
    { ...REPORT, url: 7 },
    { ...REPORT, url: `https://site.example/${'a'.repeat(2100)}` },
    { ...REPORT, y: -1 },
    { ...REPORT, y: 1.5 },
    { ...REPORT, y: '1200' },
    { ...REPORT, w: 0 },
    { ...REPORT, h: 0 },
    { ...REPORT, w: Number.NaN },
    { ...REPORT, t: -1 },
    { ...REPORT, t: 'now' }
  ])
    assert.equal(viewFrom(bad), null, JSON.stringify(bad)?.slice(0, 60))
  assert.equal(isMessage(REPORT, 'view'), true)
})
