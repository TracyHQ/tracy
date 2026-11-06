/**
 * Template kit, the facts the Website opportunity flow reads (`src/lib/template-kit/flow-reads.js`): a kit whose
 * pictures are complete and approved still holds Publish when a flow step could not use it. One case per gate on a
 * made up kit, a seed shaped kit like the T3 template that exposed them, and the JA Boxing 1.0.10 kit committed in this
 * repo, which must stay done or warn. Every other name and value here is made up.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { flowGapsOf, kitMapOf } from '../src/lib/template-kit/flow-reads.js'
import { imagesDigest } from '../src/lib/template-kit/reader.js'
import { templateKitRefusal, templateKitStep } from '../src/lib/template-kit/road-step.js'
import { FLOW_SITE, frontGroup } from './_template-kit-flow-site.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const IMAGES = [
  { id: 'page-home-1440', path: 'pages/home-1440.png', sha256: sha('home-1440') },
  { id: 'page-home-390', path: 'pages/home-390.png', sha256: sha('home-390') }
]
const ZIP = 'template-kit-ja-sample-1.0.2.zip'
/** The pictures and the look of a page or block, all on the home shots. */
const SHOT = Object.freeze({
  images: { 1440: 'page-home-1440', 390: 'page-home-390' },
  look: {
    image: 'page-home-1440',
    sha256: sha('home-1440'),
    text: 'A wide photo with a heading and one button.'
  }
})

/** An approved, complete kit of ja-sample 1.0.2 with no block, whose site is clean unless `site` says otherwise. */
const kit = (over = {}, site = {}) => ({
  kitVersion: '1.0.0',
  contract: 'ja-sample/j6/1.0.2',
  template: { name: 'ja_sample', version: '1.1.0' },
  quickstart: { product: 'ja-sample', version: '1.0.2' },
  images: IMAGES,
  site: { ...FLOW_SITE, ...site },
  pageGroups: [frontGroup('home')],
  pages: [{ id: 'home', path: '/', ...SHOT }],
  blocks: [{ id: 'hero', ...SHOT }],
  errors: [],
  approval: { by: 'reviewer-one', at: '2026-10-30T10:00:00.000Z', imagesSha256: imagesDigest(IMAGES) },
  ...over
})
const MAP = kitMapOf({ slots: [{ key: 'siteSetting-1.0' }, { key: 'module-7.0' }], menuBlocks: {} })
const release = (over = {}) => ({
  platform: 'joomla',
  inspiration: null,
  inspirationHidden: true,
  assets: [{ name: ZIP }],
  local: null,
  ...over
})

const put = (step, state, code, params = {}) => ({ step, state, code, params })
/** The Template kit step of `doc` for an unpublished ja-sample 1.0.2. */
const stepOf = (doc, { map = MAP, rel = release(), contractId = 'ja-sample/j6/1.0.2' } = {}) =>
  templateKitStep(put, () => undefined, {
    release: rel,
    version: '1.0.2',
    contractId,
    kit: { state: 'read', doc },
    map
  })
const codesOf = (doc, world = { map: MAP, release: release() }) => flowGapsOf(doc, world).map((g) => g.code)

test('a clean kit is approved, with no flow gap', () => {
  const step = stepOf(kit())
  assert.deepEqual([step.state, step.code, step.params.flowGaps], ['done', 'kit-approved', undefined])
})

test('kit-logo-unsettable: a shown logo spot with no setting and a frame the content map lacks', () => {
  const spot = { ...FLOW_SITE.logoSpots[0], setting: null, frameId: 'siteSetting-9.0' }
  const step = stepOf(kit({}, { logoSpots: [spot] }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-logo-unsettable'])
  assert.deepEqual(step.params.flowGaps[0].spots, ['logo-header-1'])
  // The frame the content map holds writes it; so does a site profile setting with no frame the map holds.
  assert.deepEqual(codesOf(kit({}, { logoSpots: [{ ...spot, frameId: 'siteSetting-1.0' }] })), [])
  assert.deepEqual(codesOf(kit({}, { logoSpots: [{ ...spot, setting: 'site_logo' }] })), [])
  // A spot the page never shows needs nothing.
  assert.deepEqual(codesOf(kit({}, { logoSpots: [{ ...spot, shownIn: [] }, FLOW_SITE.logoSpots[0]] })), [])
  // No frame at all: said once, by the logo gap, not again as a kit the brand step refuses.
  assert.deepEqual(codesOf(kit({}, { logoSpots: [{ ...spot, frameId: null }] })), ['kit-logo-unsettable'])
})

test('kit-logo-unsettable: a T3 style param is no profile setting, so only its content map frame writes it', () => {
  // A T3 kit names the template style param that holds the logo; the site profile door cannot write it.
  const spot = { ...FLOW_SITE.logoSpots[0], setting: 'logoimage', frameId: 'templateStyle-9.0' }
  const step = stepOf(kit({}, { logoSpots: [spot] }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-logo-unsettable'])
  assert.deepEqual(step.params.flowGaps[0].spots, ['logo-header-1'])
  assert.deepEqual(codesOf(kit({}, { logoSpots: [{ ...spot, frameId: null }] })), ['kit-logo-unsettable'])
  // The same spot with its style frame in the content map is written through the contract.
  const map = kitMapOf({ slots: [{ key: 'templateStyle-9.0' }], menuBlocks: {} })
  assert.deepEqual(codesOf(kit({}, { logoSpots: [spot] }), { map, release: release() }), [])
})

test('kit-brand-colour-from-link: an accent that paints links only, with the stylesheet primary named', () => {
  const brandColours = {
    ...FLOW_SITE.brandColours,
    primary: { value: '#203060', roles: ['link', 'variable --body-link-color'] },
    tokens: [
      { name: '@brand-primary', value: '#a04020', side: 'base' },
      { name: '@link-color', value: '#203060', side: 'base' }
    ]
  }
  const step = stepOf(kit({}, { brandColours }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-brand-colour-from-link'])
  assert.deepEqual(step.params.flowGaps[0].candidates, [{ name: '@brand-primary', value: '#a04020' }])
  assert.match(templateKitRefusal(step).reason, /reads its accent from links/)
})

test('kit-navigation-missing: a menu block of the content map with no navigation group', () => {
  const menuBlocks = { 'module-7': { block: 'module-7', items: [{ item: 'menuItem-1' }] } }
  const map = kitMapOf({ slots: [{ key: 'siteSetting-1.0' }], menuBlocks })
  const step = stepOf(kit(), { map })
  assert.deepEqual([step.state, step.code], ['todo', 'kit-navigation-missing'])
  assert.deepEqual(step.params.flowGaps[0].menus, ['block-7'])
  const held = kit({}, { navigationGroups: [{ id: 'nav-block-7', block: 'block-7' }] })
  assert.deepEqual(codesOf(held, { map, release: release() }), [])
  // A menu block with no item has nothing to plan.
  const empty = kitMapOf({ slots: [], menuBlocks: { 'module-8': { block: 'module-8', items: [] } } })
  assert.deepEqual(codesOf(kit(), { map: empty, release: release() }), [])
})

test('kit-map-mismatch: kit slots the content map beside it does not hold (a kit of another map)', () => {
  const blocks = [
    {
      id: 'block-7',
      ...SHOT,
      slots: [
        { id: 'block-7.0', type: 'text' },
        { id: 'block-7.4.icon', type: 'icon' }
      ],
      lists: [{ rowSlots: [{ field: 'title', slots: [{ id: 'article-3.4', type: 'text' }] }] }]
    }
  ]
  const step = stepOf(kit({ blocks }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-map-mismatch'])
  // block-7.0 is module-7.0 in the map; an icon is written through its field.
  assert.deepEqual([step.params.flowGaps[0].count, step.params.flowGaps[0].slots], [1, ['article-3.4']])
  // Without the content map the check is skipped, never guessed.
  assert.deepEqual(codesOf(kit({ blocks }), { map: null, release: release() }), [])
})

test('kit-front-page-group: the front page inside another group, or not its representative', () => {
  const inside = kit({ pageGroups: [{ id: 'group-blog', root: 'blog', children: ['home'] }] })
  assert.deepEqual([stepOf(inside).state, stepOf(inside).code], ['todo', 'kit-front-page-group'])
  const other = kit({ pageGroups: [{ ...frontGroup('home'), representative: 'blog' }] })
  assert.equal(stepOf(other).code, 'kit-front-page-group')
})

test('kit-brand-unreadable: the very check the brand bench refuses a run on', () => {
  const step = stepOf(kit({}, { nameSlots: [] }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-brand-unreadable'])
  assert.equal(step.params.reason, 'the kit has no site.nameSlots')
  const noShot = kit({ images: IMAGES.map((i) => ({ ...i, id: i.id.replace('home', 'start') })) })
  assert.ok(codesOf(noShot).includes('kit-brand-unreadable'))
})

test('kit-zip-missing: the release lacks the kit image zip; a local pack is not asked', () => {
  const step = stepOf(kit(), { rel: release({ assets: [{ name: 'w.tar.gz' }] }) })
  assert.deepEqual([step.state, step.code, step.params.flowGaps[0].file], ['todo', 'kit-zip-missing', ZIP])
  assert.deepEqual(codesOf(kit(), { map: MAP, release: release({ assets: [], local: { dir: 'x' } }) }), [])
})

test('kit-setting-slot-missing only warns: a map button or a frame painted behind with no setting slot', () => {
  const blocks = [
    {
      id: 'block-7',
      ...SHOT,
      links: [{ id: 'block-7.2', opens: { shows: 'map', writable: false } }],
      frames: [{ id: 'block-7.1', paintedBehind: true }]
    }
  ]
  const step = stepOf(kit({ blocks }))
  assert.deepEqual([step.state, step.code], ['warn', 'kit-setting-slot-missing'])
  assert.deepEqual(
    [step.params.flowGaps[0].buttons, step.params.flowGaps[0].frames],
    [['block-7'], ['block-7.1']]
  )
})

test('a kit built on another contract of the same version is stale', () => {
  const step = stepOf(kit({ contract: 'ja-sample/j6/1.0.2-seed' }))
  assert.deepEqual([step.state, step.code], ['todo', 'kit-stale'])
  assert.match(step.params.reason, /built on the contract ja-sample\/j6\/1\.0\.2-seed/)
})

test('flow gaps are named before the approval, and ride along on an earlier code', () => {
  const spot = { ...FLOW_SITE.logoSpots[0], setting: null, frameId: null }
  const unapproved = kit({ approval: null }, { logoSpots: [spot] })
  const step = stepOf(unapproved)
  // The approval covers pictures: a kit no flow step can use is named before it.
  assert.equal(step.code, 'kit-logo-unsettable')
  const unpictured = stepOf({ ...unapproved, pages: [{ ...unapproved.pages[0], images: {} }] })
  assert.deepEqual(
    [unpictured.code, unpictured.params.flowGaps[0].code],
    ['kit-incomplete', 'kit-logo-unsettable']
  )
})

test('a seed shaped T3 kit: logo with no setting, accent from links, a menu with no group', () => {
  const site = {
    logoSpots: [{ id: 'logo-header-1', frameId: null, setting: null, shownIn: ['base'], ground: {} }],
    brandColours: {
      ...FLOW_SITE.brandColours,
      primary: { value: '#203060', roles: ['link'] },
      tokens: [{ name: '@brand-primary', value: '#a04020', side: 'base' }]
    },
    navigationGroups: [],
    settingSlots: []
  }
  const map = kitMapOf({
    slots: [{ key: 'siteSetting-1.0' }],
    menuBlocks: { 'module-9': { block: 'module-9', items: [{ item: 'menuItem-2' }] } }
  })
  assert.deepEqual(codesOf(kit({}, site), { map, release: release() }), [
    'kit-logo-unsettable',
    'kit-brand-colour-from-link',
    'kit-navigation-missing'
  ])
})

test('the JA Boxing 1.0.10 kit committed in this repo has no flow gap and stays approved', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.join(here, '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.10')
  const doc = JSON.parse(readFileSync(path.join(dir, 'template-kit.json'), 'utf8'))
  const map = kitMapOf(JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8')))
  const rel = release({ assets: [{ name: 'template-kit-ja-boxing-1.0.10.zip' }] })
  assert.deepEqual(flowGapsOf(doc, { map, release: rel }), [])
  const step = templateKitStep(put, () => undefined, {
    release: rel,
    version: '1.0.10',
    contractId: 'ja-boxing/j6/1.0.10',
    kit: { state: 'read', doc },
    map
  })
  assert.ok(['done', 'warn'].includes(step.state), `${step.state} ${step.code}`)
  assert.equal(step.code, 'kit-approved')
})
