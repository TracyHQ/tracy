// save_brand_file gate: one focused failing case per rule of the favicon set, the file rules (relative paths,
// existence, transparency) and the inputs the gate needs. Each breaks exactly one thing in a passing invented case.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { blockPng, faviconPng, loadCase, opaquePng, withFiles } from './_brand-gate-files.mjs'
import { assertNames, expectRejected } from './_brand-gate-rules.mjs'

const ROWS = [
  [
    'a recorded favicon number is recomputed',
    '1-padel',
    ({ brand }) => {
      brand.favicon.check.final.bboxShare = 0.9
    },
    'favicon.check.final.bboxShare'
  ],
  [
    'a recorded tab contrast is recomputed',
    '1-padel',
    ({ brand }) => {
      brand.favicon.check.final.contrastShare['#202124'] = 0.01
    },
    'favicon.check.final.contrastShare.#202124'
  ],
  [
    'the final 32 px favicon must pass the code check on both tabs',
    '1-padel',
    async ({ c }) => ({
      files: withFiles(c, { 'favicon-v10/favicon-32.png': await faviconPng('tile', '#0b3d20') })
    }),
    'favicon.check.final',
    /fails the code check/
  ],
  [
    'every candidate is recorded in make_favicon order',
    '1-padel',
    ({ brand }) => {
      brand.favicon.check.candidates.reverse()
    },
    'favicon.check.candidates',
    /order/
  ],
  [
    'a candidate before the chosen one must have failed',
    '1-padel',
    ({ brand }) => {
      brand.favicon.check.candidates[0].pass = true
    },
    'favicon.check.candidates[0].pass'
  ],
  [
    'the code check is recorded',
    '1-padel',
    ({ brand }) => {
      delete brand.favicon.check
    },
    'favicon.check'
  ],
  [
    'a side with its own mark means a tile icon',
    '4-black-grey-symbol',
    ({ brand }) => {
      brand.favicon.tabIcons = 'transparent'
    },
    'favicon.tabIcons',
    /tile/
  ],
  [
    'a tile sits on the template opening ground',
    '1-padel',
    ({ brand }) => {
      brand.favicon.tileGround = '#ffffff'
    },
    'favicon.tileGround'
  ],
  [
    'the favicon comes from the mark',
    '1-padel',
    ({ brand }) => {
      brand.favicon.mark = 'other.png'
    },
    'favicon.mark'
  ],
  [
    'the phone icon uses the opening side mark',
    '4-black-grey-symbol',
    ({ brand }) => {
      brand.favicon.phoneMark = 'mark.png'
    },
    'favicon.phoneMark'
  ],
  [
    'the phone icon sits on the opening ground',
    '1-padel',
    ({ brand }) => {
      brand.favicon.phoneGround = '#ffffff'
    },
    'favicon.phoneGround'
  ],
  [
    'the phone icon is opaque',
    '1-padel',
    async ({ c }) => ({ files: withFiles(c, { 'favicon-v10/apple-touch-icon-180.png': await blockPng() }) }),
    'favicon.phone180',
    /solid ground/
  ],
  [
    'the tab icons are transparent pictures',
    '1-padel',
    async ({ c }) => ({ files: withFiles(c, { 'favicon-v10/favicon-512.png': await opaquePng() }) }),
    'favicon.png512',
    /transparent/
  ],
  [
    'a logo has a transparent background',
    '1-padel',
    async ({ c }) => ({ files: withFiles(c, { 'logo/logo.light.png': await opaquePng() }) }),
    'logo.logos.light',
    /transparent/
  ],
  [
    'a file that is not an image is refused',
    '1-padel',
    ({ c }) => ({ files: withFiles(c, { 'logo/logo.light.png': Buffer.from('not an image') }) }),
    'logo.logos.light',
    /readable image/
  ],
  [
    'a referenced file must exist',
    '1-padel',
    ({ c }) => ({ files: withFiles(c, { 'logo/logo.light.png': null }) }),
    'logo.logos.light',
    /does not exist/
  ],
  [
    'a path is relative to the brand file folder (no absolute path)',
    '1-padel',
    ({ brand }) => {
      brand.logo.mark.file = '/mark.png'
    },
    'logo.mark.file',
    /relative/
  ],
  [
    'a path cannot leave the brand file folder',
    '1-padel',
    ({ brand }) => {
      brand.logo.mark.file = '../mark.png'
    },
    'logo.mark.file',
    /inside/
  ],
  [
    'a Windows style absolute path is refused too',
    '1-padel',
    ({ brand }) => {
      brand.favicon.ico = 'C:\\icons\\favicon.ico'
    },
    'favicon.ico',
    /relative/
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}

test('gate: the brief is needed', async () => {
  const c = await loadCase('1-padel')
  assertNames(
    await checkBrandFile({ brandFile: c.brand, brief: null, kit: c.kit, files: c.files }),
    '(brief)'
  )
})

test('gate: a kit without logo spots cannot feed the gate', async () => {
  const c = await loadCase('1-padel')
  const kit = structuredClone(c.kit)
  kit.site.logoSpots = []
  assertNames(await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit, files: c.files }), '(kit)')
})

test('gate: a missing file folder is refused, a non-object brand file too', async () => {
  const c = await loadCase('1-padel')
  assertNames(await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit }), '(files)')
  assertNames(
    await checkBrandFile({ brandFile: 'nope', brief: c.brief, kit: c.kit, files: c.files }),
    '(file)'
  )
})

test('gate: the same inputs give the same verdict twice, and every rejection lists a field and a reason', async () => {
  const c = await loadCase('2-words-only')
  c.brand.version = 9
  const a = await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit, files: c.files })
  const b = await checkBrandFile({ brandFile: c.brand, brief: c.brief, kit: c.kit, files: c.files })
  assert.deepEqual(a, b)
  for (const r of a.rejected) assert.ok(r.field && r.why)
})
