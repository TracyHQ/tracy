/**
 * Template kit: the Road to live step that holds Publish until the template kit of a release (screenshots at 1440 and
 * 390, a per page summary of the content map, a version stamp) is approved. The text part is committed as
 * `template-kit.json` beside the contract; `src/lib/template-kit/` reads it and judges it against the release.
 * Every name and value here is made up.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import { publishRefusalOf, ROAD_STEPS, roadOf } from '../src/lib/road-to-live.js'
import { imagesDigest, kitOfContract } from '../src/lib/template-kit/reader.js'
import { KIT_STEP, templateKitRefusal } from '../src/lib/template-kit/road-step.js'

const TAG = 'quickstart/ja-sample/j6'
const sha = (s) => createHash('sha256').update(s).digest('hex')

const IMAGES = [
  { path: 'pages/home-1440.png', sha256: sha('home-1440') },
  { path: 'pages/home-390.png', sha256: sha('home-390') },
  { path: 'blocks/hero-1440.png', sha256: sha('hero-1440') },
  { path: 'blocks/hero-390.png', sha256: sha('hero-390') }
]

/** A kit for ja-sample 1.0.2, approved on the image set it lists, unless `over` says otherwise. */
const kit = (over = {}) => ({
  kitVersion: '1.0.0',
  template: { name: 'ja_sample', version: '1.1.0' },
  quickstart: { slug: 'ja-sample', version: '1.0.2' },
  images: IMAGES,
  pageGroups: [{ id: 'main' }],
  pages: [
    {
      id: 'home',
      group: 'main',
      path: '/',
      inMainMenu: true,
      blocks: ['hero'],
      images: { 1440: 'pages/home-1440.png', 390: 'pages/home-390.png' },
      look: {
        image: 'pages/home-1440.png',
        sha256: sha('home-1440'),
        text: 'A wide photo banner with a heading and one button, then three cards in a row.'
      }
    }
  ],
  blocks: [
    {
      id: 'hero',
      role: 'hero',
      shared: false,
      images: { 1440: 'blocks/hero-1440.png', 390: 'blocks/hero-390.png' },
      look: {
        image: 'blocks/hero-1440.png',
        sha256: sha('hero-1440'),
        text: 'A full width photo with a large centred heading and one button below it.'
      },
      lists: [],
      frames: [],
      links: [],
      fixedText: [],
      demoOwned: []
    }
  ],
  errors: [],
  approval: { by: 'reviewer-one', at: '2026-10-30T10:00:00.000Z', imagesSha256: imagesDigest(IMAGES) },
  ...over
})

/** A clean content contract of ja-sample 1.0.2 on disk; `kitFile` is written beside it unless null. */
function contractsWith(kitFile) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-'))
  const at = path.join(dir, TAG, '1.0.2')
  mkdirSync(at, { recursive: true })
  const map =
    '{"roleVocabularyVersion":"place-content-roles/2","slotFitVersion":"slot-fit/1","slots":[{"key":"a","type":"text","role":"editorial.heading","fit":{"measured":false}}]}'
  const lock = '{"entities":{}}'
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'tracy-quickstart-contract/v1',
      id: `${TAG}/1.0.2`,
      platform: 'joomla',
      quickstart: { release: TAG, version: '1.0.2' },
      coworkMinVersion: '0.8.0',
      mode: 'content-recommendation'
    })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), lock)
  writeFileSync(
    path.join(at, 'content-coverage.json'),
    JSON.stringify({
      schemaVersion: 'tracy-content-coverage/v1',
      tool: { name: 'test', version: '1.1.0' },
      contract: { id: `${TAG}/1.0.2`, contentMapSha256: sha(map), presentationLockSha256: sha(lock) },
      measuredAt: '2026-10-24T00:00:00.000Z',
      pages: { audited: 3, inMap: 3, notInMap: 0, failed: 0, capReached: false },
      counts: {},
      coverage: { text: 100, images: 100, links: 100 },
      holes: [],
      hygiene: []
    })
  )
  if (kitFile !== null)
    writeFileSync(
      path.join(at, 'template-kit.json'),
      typeof kitFile === 'string' ? kitFile : JSON.stringify(kitFile)
    )
  return readContracts(dir)
}

const release = (over = {}) => ({
  tag: TAG,
  name: 'JA Sample',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  assets: [{ name: 'w.tar.gz' }],
  setting: {
    platform: 'joomla',
    version: '1.0.2',
    template: 'ja-sample',
    install: { webroot: { file: 'w.tar.gz' } }
  },
  inspiration: null,
  inspirationHidden: true,
  pages: [{ id: 'home', label: 'Home', home: true }],
  local: null,
  choosable: true,
  platform: 'joomla',
  ...over
})

const READY = { state: 'ready' }
const world = (contracts, over = {}) => ({ contracts, roles: READY, fit: READY, ...over })
const stepOf = (road) => road.find((s) => s.step === KIT_STEP)
const verdictOf = (kitFile, rel = release()) => {
  const step = stepOf(roadOf(rel, world(contractsWith(kitFile))))
  return [step.state, step.code]
}
const CARD = { template: 'ja-sample', provider: 'JoomlArt', layouts: [] }

test('the step sits right after Content coverage, and Publish needs it', () => {
  assert.equal(ROAD_STEPS.indexOf(KIT_STEP), ROAD_STEPS.indexOf('content-coverage') + 1)
  const road = roadOf(release(), world(contractsWith(null)))
  assert.deepEqual(
    road.map((s) => s.step),
    ROAD_STEPS
  )
})

test('an approved kit of this version is done', () => {
  assert.deepEqual(verdictOf(kit()), ['done', 'kit-approved'])
})

test('no kit file is todo', () => {
  assert.deepEqual(verdictOf(null), ['todo', 'kit-missing'])
})

test('a file that is not JSON, or misses what the step reads, is invalid', () => {
  assert.deepEqual(verdictOf('{ not json'), ['todo', 'kit-invalid'])
  assert.deepEqual(verdictOf(kit({ quickstart: null })), ['todo', 'kit-invalid'])
  assert.deepEqual(verdictOf(kit({ images: [] })), ['todo', 'kit-invalid'])
  assert.deepEqual(verdictOf(kit({ images: [{ path: 'a.png', sha256: 'nope' }] })), ['todo', 'kit-invalid'])
})

test('a kit of another quickstart version is stale', () => {
  assert.deepEqual(verdictOf(kit({ quickstart: { slug: 'ja-sample', version: '1.0.1' } })), [
    'todo',
    'kit-stale'
  ])
})

test('a kit with no pages, no blocks, or a page or block without both widths is incomplete', () => {
  assert.deepEqual(verdictOf(kit({ pages: [] })), ['todo', 'kit-incomplete'])
  assert.deepEqual(verdictOf(kit({ blocks: [] })), ['todo', 'kit-incomplete'])
  const k = kit()
  k.blocks[0].images = { 1440: 'blocks/hero-1440.png' }
  assert.deepEqual(verdictOf(k), ['todo', 'kit-incomplete'])
  const step = stepOf(roadOf(release(), world(contractsWith(k))))
  assert.match(String(step.params.reason), /hero/)
  assert.match(String(step.params.reason), /390/)
})

test('a kit whose self-checks count anything is incomplete, and the step names the failing checks', () => {
  const k = kit({ checks: { slotsInTwoBlocks: 2, listLimitsDiffering: 0 } })
  assert.deepEqual(verdictOf(k), ['todo', 'kit-incomplete'])
  const step = stepOf(roadOf(release(), world(contractsWith(k))))
  assert.match(String(step.params.reason), /slotsInTwoBlocks/)
  assert.doesNotMatch(String(step.params.reason), /listLimitsDiffering/)
  assert.notDeepEqual(verdictOf(kit({ checks: { slotsInTwoBlocks: 0 } })), ['todo', 'kit-incomplete'])
})

test('a kit failing a coverage gate part is incomplete, and the step names the part and the slot', () => {
  for (const [part, where] of [
    ['limitsBelowDemo', 'slots[block-1.2]'],
    ['textFormatMissing', 'slots[block-1.3]']
  ]) {
    const k = kit({
      checks: { slotCoverage: 1 },
      coverage: { parts: { [part]: 1 }, failures: [{ part, where, reason: 'made up' }] }
    })
    assert.deepEqual(verdictOf(k), ['todo', 'kit-incomplete'])
    const step = stepOf(roadOf(release(), world(contractsWith(k))))
    assert.match(String(step.params.reason), /slotCoverage 1/)
    assert.ok(String(step.params.reason).includes(`${part} ${where}`))
  }
})

test('every failing coverage part is named, however many failures another part has', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    part: 'linksWithoutLabelSlot',
    where: `blocks[block-1].links[block-1.link-${i + 1}] block-1.${i}`,
    reason: 'made up'
  }))
  const k = kit({
    checks: { slotCoverage: 21 },
    coverage: {
      parts: { linksWithoutLabelSlot: 20, imagesWithoutFrame: 1 },
      failures: [
        ...many,
        { part: 'imagesWithoutFrame', where: 'blocks[block-2] media/hall.jpg', reason: 'made up' }
      ]
    }
  })
  const step = stepOf(roadOf(release(), world(contractsWith(k))))
  assert.ok(String(step.params.reason).includes('imagesWithoutFrame blocks[block-2] media/hall.jpg'))
  assert.ok(
    String(step.params.reason).includes('linksWithoutLabelSlot blocks[block-1].links[block-1.link-1]')
  )
})

test('a block the template does not show at a width, with a reason, needs no picture there', () => {
  // Shown at 1440 only, declared with a reason: complete.
  const desktopOnly = kit()
  desktopOnly.blocks[0].images = { 1440: 'blocks/hero-1440.png' }
  desktopOnly.blocks[0].visibleAt = ['1440']
  desktopOnly.blocks[0].notShownAt = ['390']
  desktopOnly.blocks[0].notShownBecause = 'The template hides this block on small screens.'
  assert.deepEqual(verdictOf(desktopOnly), ['done', 'kit-approved'])
  // An off canvas menu opens only on demand: shown at neither width, no picture needed at all.
  const offCanvas = kit()
  offCanvas.blocks.push({
    id: 'offcanvas-menu',
    role: 'navigation',
    images: {},
    visibleAt: [],
    notShownAt: ['1440', '390'],
    notShownBecause: 'It opens only when a visitor presses the menu button.'
  })
  assert.deepEqual(verdictOf(offCanvas), ['done', 'kit-approved'])
  // The width without a picture must be the declared one: declaring 1440 does not excuse 390.
  const wrongWidth = kit()
  wrongWidth.blocks[0].images = { 1440: 'blocks/hero-1440.png' }
  wrongWidth.blocks[0].notShownAt = ['1440']
  wrongWidth.blocks[0].notShownBecause = 'Hidden on wide screens.'
  assert.deepEqual(verdictOf(wrongWidth), ['todo', 'kit-incomplete'])
  // A declaration without a reason does not count.
  for (const because of [undefined, '', '   ']) {
    const noReason = kit()
    noReason.blocks[0].images = { 1440: 'blocks/hero-1440.png' }
    noReason.blocks[0].notShownAt = ['390']
    if (because !== undefined) noReason.blocks[0].notShownBecause = because
    assert.deepEqual(verdictOf(noReason), ['todo', 'kit-incomplete'], `reason ${JSON.stringify(because)}`)
  }
})

test('a page always needs both widths, whatever it declares', () => {
  const k = kit()
  k.pages[0].images = { 1440: 'pages/home-1440.png' }
  k.pages[0].notShownAt = ['390']
  k.pages[0].notShownBecause = 'Pages are never excused.'
  assert.deepEqual(verdictOf(k), ['todo', 'kit-incomplete'])
})

test('a kit no one approved is todo', () => {
  assert.deepEqual(verdictOf(kit({ approval: null })), ['todo', 'kit-not-approved'])
  const { approval, ...without } = kit()
  assert.ok(approval)
  assert.deepEqual(verdictOf(without), ['todo', 'kit-not-approved'])
})

test('an approval of another image set does not count', () => {
  const other = kit({
    approval: {
      by: 'reviewer-one',
      at: '2026-10-30T10:00:00.000Z',
      imagesSha256: imagesDigest([...IMAGES, { path: 'pages/old-1440.png', sha256: sha('old') }])
    }
  })
  assert.deepEqual(verdictOf(other), ['todo', 'kit-approval-stale'])
  // a changed picture under the same name is a different set too (a 390 one: a 1440 one also stales its look)
  const changed = kit({
    images: [IMAGES[0], { ...IMAGES[1], sha256: sha('home-390-v2') }, ...IMAGES.slice(2)]
  })
  assert.deepEqual(verdictOf(changed), ['todo', 'kit-approval-stale'])
})

test('every 1440 shot needs a current look; looks are text, so writing them keeps the approval', () => {
  const stepFor = (k) => stepOf(roadOf(release(), world(contractsWith(k))))
  const [home] = kit().pages
  const [hero] = kit().blocks
  const missing = stepFor(kit({ pages: [{ ...home, look: undefined }] }))
  assert.deepEqual([missing.state, missing.code], ['todo', 'kit-incomplete'])
  assert.match(missing.params.reason, /^1 page or block has no current look of its 1440 shot: page home$/)
  assert.deepEqual(missing.params.missingLooks, [
    { kind: 'page', id: 'home', image: 'pages/home-1440.png', why: 'missing' }
  ])
  // a look of other bytes than the shot holds now, or of another shot, is stale
  const stale = stepFor(
    kit({
      pages: [{ ...home, look: { ...home.look, sha256: sha('home-1440-old') } }],
      blocks: [{ ...hero, look: { ...hero.look, image: 'pages/home-1440.png' } }]
    })
  )
  assert.equal(stale.code, 'kit-incomplete')
  assert.equal(
    stale.params.reason,
    '2 pages and blocks have no current look of their 1440 shot: page home (stale), block hero (stale)'
  )
  const refusal = templateKitRefusal(stale)
  assert.equal(refusal.error, 'TEMPLATE_KIT_NOT_READY')
  assert.match(refusal.reason, /template-kit looks/)
  // a shot the image list does not hold has no file to describe: nothing to ask for
  const unlisted = { ...hero, images: { 1440: 'blocks/elsewhere-1440.png', 390: 'blocks/hero-390.png' } }
  assert.deepEqual(verdictOf(kit({ blocks: [{ ...unlisted, look: undefined }] })), ['done', 'kit-approved'])
  // the approval names only the images: the same approval holds with and without looks
  assert.deepEqual(verdictOf(kit()), ['done', 'kit-approved'])
})

test('the image digest does not depend on the order the images are listed in', () => {
  assert.equal(imagesDigest(IMAGES), imagesDigest([...IMAGES].reverse()))
  assert.notEqual(imagesDigest(IMAGES), imagesDigest(IMAGES.slice(1)))
})

test('it waits for the contract while a new release has none', () => {
  const step = stepOf(roadOf(release(), world(new Map())))
  assert.deepEqual([step.state, step.code, step.blockedBy], ['blocked', 'kit-waiting', 'contract'])
})

test('a release already published only warns, it is never taken off', () => {
  const live = release({ inspiration: CARD, inspirationHidden: false })
  assert.deepEqual(verdictOf(null, live), ['warn', 'kit-missing'])
  assert.deepEqual(verdictOf(kit({ approval: null }), live), ['warn', 'kit-not-approved'])
  assert.deepEqual(verdictOf(kit(), live), ['done', 'kit-approved'])
})

test('a platform with no content map does not need a kit', () => {
  const shop = release({
    tag: 'quickstart/sample-shop/shopify',
    platform: 'shopify',
    setting: { platform: 'shopify', version: '1.0.0', template: 'sample-shop', install: {} }
  })
  const step = stepOf(roadOf(shop, world(new Map())))
  assert.deepEqual([step.state, step.code], ['done', 'kit-not-needed'])
})

test('the publish door refuses with TEMPLATE_KIT_NOT_READY while the kit holds Publish', () => {
  const rel = release({ inspiration: CARD })
  const contracts = contractsWith(kit({ approval: null }))
  const road = roadOf(rel, world(contracts))
  const published = road.find((s) => s.step === 'published')
  assert.equal(published.state, 'blocked')
  assert.ok(published.params.waiting.includes(KIT_STEP))
  // Whatever step the door names first, the kit's own refusal says what to do next.
  const refusal = templateKitRefusal(stepOf(road))
  assert.equal(refusal.error, 'TEMPLATE_KIT_NOT_READY')
  assert.match(refusal.reason, /approve/i)
  // When the kit is the first thing left, the door answers with it.
  const kitFirst = road.map((s) =>
    s.step === 'listing'
      ? { ...s, state: 'done' }
      : s.step === 'published'
        ? { ...s, blockedBy: KIT_STEP }
        : s
  )
  assert.equal(publishRefusalOf(kitFirst, rel)?.error, 'TEMPLATE_KIT_NOT_READY')
})

test('every refusal reason is plain English with no dash as punctuation', () => {
  for (const code of [
    'kit-missing',
    'kit-invalid',
    'kit-stale',
    'kit-incomplete',
    'kit-not-approved',
    'kit-approval-stale'
  ]) {
    const { reason } = templateKitRefusal({
      step: KIT_STEP,
      state: 'todo',
      code,
      params: { version: '1.0.2' }
    })
    assert.ok(reason.length > 20, code)
    assert.doesNotMatch(reason, /[–—]| - /, code)
    assert.doesNotMatch(reason, /module/i, code)
  }
})

test('the reader is tolerant of keys it does not use', () => {
  const contracts = contractsWith(kit({ somethingNew: { a: 1 }, pageGroups: 'not read' }))
  const [contract] = [...contracts.values()]
  assert.equal(kitOfContract(contract).state, 'read')
})

/** A template gap the kit measured, made up; `accepted` null unless a test says otherwise. */
const gap = (over = {}) => ({
  id: 'gap-1',
  kind: 'page-without-h1',
  where: { pageId: 'home', path: '/' },
  detail: 'The page has no h1 heading.',
  evidence: ['pages/home-1440.png'],
  accepted: null,
  ...over
})

test('template gaps without an accepted reason hold a new release as kit-gaps, before approval', () => {
  const gaps = [
    gap(),
    gap({
      id: 'gap-2',
      kind: 'dead-link',
      where: { blockId: 'hero', selector: 'a.more' },
      detail: 'href is #'
    }),
    gap({ id: 'gap-3', kind: 'dead-link', where: { path: '/about' }, detail: 'answers 404' }),
    gap({ id: 'gap-4', kind: 'dead-path', where: { path: '/old' }, detail: 'answers 404' }),
    gap({ id: 'gap-5', kind: 'sparse-row-left-packed', where: { blockId: 'team' }, detail: 'open entry' })
  ]
  // Gaps outrank a missing approval: approved or not, the gaps are said first.
  for (const approval of [null, undefined]) {
    const k = kit({ templateGaps: gaps })
    if (approval === null) k.approval = null
    const step = stepOf(roadOf(release(), world(contractsWith(k))))
    assert.deepEqual([step.state, step.code], ['todo', 'kit-gaps'])
    assert.equal(step.params.gaps, 5)
    assert.deepEqual(step.params.gapsByKind, [
      { kind: 'dead-link', count: 2 },
      { kind: 'dead-path', count: 1 },
      { kind: 'page-without-h1', count: 1 },
      { kind: 'sparse-row-left-packed', count: 1 }
    ])
    assert.equal(step.params.gapsShown.length, 5)
    assert.deepEqual(step.params.gapsShown[0], {
      id: 'gap-1',
      kind: 'page-without-h1',
      where: { pageId: 'home', path: '/' },
      detail: 'The page has no h1 heading.'
    })
  }
  const refusal = templateKitRefusal(
    stepOf(roadOf(release(), world(contractsWith(kit({ templateGaps: gaps })))))
  )
  assert.equal(refusal.error, 'TEMPLATE_KIT_NOT_READY')
  assert.match(refusal.reason, /5 template gaps/)
  assert.match(refusal.reason, /accepted reason/)
  assert.doesNotMatch(refusal.reason, /[–—]|module/i)
})

test('the step names at most eight gaps, and counts the rest', () => {
  const many = Array.from({ length: 11 }, (_, i) => gap({ id: `gap-${i}`, kind: 'dead-link' }))
  const step = stepOf(roadOf(release(), world(contractsWith(kit({ templateGaps: many })))))
  assert.deepEqual([step.code, step.params.gaps, step.params.gapsShown.length], ['kit-gaps', 11, 8])
})

test('an accepted gap with a real reason does not hold, and is shown as accepted', () => {
  const accepted = { reason: 'The demo keeps this link on purpose for the menu.', by: 'reviewer-one' }
  const k = kit({ templateGaps: [gap({ accepted })] })
  const step = stepOf(roadOf(release(), world(contractsWith(k))))
  assert.deepEqual([step.state, step.code], ['done', 'kit-approved'])
  assert.equal(step.params.gaps, 0)
  assert.equal(step.params.gapsAccepted, 1)
  assert.deepEqual(step.params.gapsAcceptedShown, [
    { id: 'gap-1', kind: 'page-without-h1', reason: accepted.reason, by: 'reviewer-one' }
  ])
  // A reason of a word or two is not a reason.
  const short = kit({ templateGaps: [gap({ accepted: { reason: 'ok', by: 'reviewer-one' } })] })
  assert.equal(stepOf(roadOf(release(), world(contractsWith(short)))).code, 'kit-gaps')
})

test('kit-gaps comes after missing, stale and incomplete, and a live release only warns', () => {
  const gaps = [gap()]
  assert.deepEqual(verdictOf(kit({ templateGaps: gaps, quickstart: { version: '1.0.1' } })), [
    'todo',
    'kit-stale'
  ])
  assert.deepEqual(verdictOf(kit({ templateGaps: gaps, pages: [] })), ['todo', 'kit-incomplete'])
  const live = release({ inspiration: CARD, inspirationHidden: false })
  assert.deepEqual(verdictOf(kit({ templateGaps: gaps }), live), ['warn', 'kit-gaps'])
})

test('a logo left empty is not a template gap; a gaps field that is not a list is refused', () => {
  const logo = gap({ kind: 'logo-empty-shows-nothing-in-header' })
  assert.deepEqual(verdictOf(kit({ templateGaps: [logo] })), ['done', 'kit-approved'])
  assert.deepEqual(verdictOf(kit({ templateGaps: 'none' })), ['todo', 'kit-invalid'])
  // No templateGaps at all (a kit captured before gaps existed) holds nothing.
  assert.deepEqual(verdictOf(kit()), ['done', 'kit-approved'])
})
