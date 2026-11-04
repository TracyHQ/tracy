// Rewriting the brand, pictures, painted frames, share pictures and links (ADR 0044, decisions 4 and 6): each stage takes part, so
// changing one thing writes that thing and every other line reads unchanged. A fake site door answers; every fixture is invented.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { needsNewSite, readLastReport } from '../src/write-step/last-report.js'
import { brandFile, brandKit, brandSite, frozenWithBrand } from './_write-step-brand.mjs'
import {
  backdropItem,
  iconItem,
  initialsItem,
  makeFigure,
  moduleHtml,
  OTHER_ACCENT
} from './_write-step-painted.mjs'
import {
  BACKGROUND,
  FIGURE,
  frozenWithPictures,
  HERO,
  picture,
  pictureKit,
  picturePackage,
  pictureSite,
  PREVIEW
} from './_write-step-pictures.mjs'
import { keptSite, menuRow, runInTurn } from './_write-step-rewrite.mjs'
import { frozenWithBoth, shareKit, shareSite } from './_write-step-share.mjs'
import { copy, fakeSite, plan } from './_write-step-run.mjs'

const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const place = async () => ({ title: 'Tracy design system', position: 'top-a', ordering: 0 })
const keptBrand = (over = {}) => keptSite(brandSite(over), { kit: brandKit(), deps: { accentPlace: place } })
const uploadsOf = (kept) => kept.writes().filter((c) => c.action === 'media.upload')
const appliesOf = (kept) => kept.writes().filter((c) => c.params.operation === 'apply')
const setsOf = (kept) => kept.writes().filter((c) => c.action === 'template.siteSettings')

/** Runs with a brand file, where `change` may rewrite its bytes or its picture files beside it. */
async function brandRun(kept, last, { brand = brandFile(), change } = {}) {
  const frozen = frozenWithBrand({ brand })
  try {
    change?.(path.dirname(frozen.files.brand))
    return await kept.run(frozen.files, last)
  } finally {
    frozen.done()
  }
}
const newBytes = (name) => (dir) => writeFileSync(path.join(dir, name), Buffer.from(`new bytes of ${name}`))

// Brand

test('brand: nothing is written again when nothing differs', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  assert.equal(first.status, 'done', JSON.stringify(first.cause))
  const second = await brandRun(kept, first)
  assert.deepEqual(kept.writes(), [])
  const logo = second.slots.find((s) => s.part === 'brand-logo' && s.status === 'written')
  assert.equal(logo.unchanged, true)
  assert.ok(logo.ordered)
  assert.equal(second.counts.written, 0)
  const lines = (r) =>
    r.slots.filter((s) => s.owner === 'brand').map((s) => [s.slot, s.spot, s.status, s.ordered])
  assert.deepEqual(lines(second), lines(first))
})

test('brand: a changed site name writes that field alone', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  const brand = brandFile()
  brand.name.slots[0].value = 'Quay Studio'
  const second = await brandRun(kept, first, { brand })
  const [write, ...others] = kept.writes()
  assert.deepEqual(others, [])
  assert.equal(write.action, 'site.identity')
  assert.deepEqual(write.params.fields, { sitename: 'Quay Studio' })
  assert.equal(second.counts.written >= 1, true)
})

test('brand: a changed logo in the profile uploads that picture and sets that key alone', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  const second = await brandRun(kept, first, { change: newBytes('spots/logo-header-1.png') })
  assert.equal(uploadsOf(kept).length, 1)
  assert.match(uploadsOf(kept)[0].params.path, /logo-header-1-/)
  const [set] = setsOf(kept)
  assert.deepEqual(Object.keys(set.params.profiles.default), ['site_logo'])
  assert.equal(kept.writes().length, 2, 'one upload, one set')
  const line = second.slots.find((s) => s.spot === 'logo-header-1')
  assert.equal(line.unchanged, undefined)
  assert.equal(second.slots.find((s) => s.spot === 'logo-header-2').unchanged, true)
})

test('brand: a changed picture in a content slot goes alone in the contract call', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  await brandRun(kept, first, { change: newBytes('spots/logo-footer-1.png') })
  assert.equal(uploadsOf(kept).length, 1)
  assert.deepEqual(Object.keys(appliesOf(kept)[0].params.changes), ['module-88.1'])
  assert.equal(kept.writes().length, 2)
})

test('brand: one changed tab icon rewrites the head block whole, with the ones that did not change', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  const file = brandFile().favicon.png32
  const second = await brandRun(kept, first, { change: newBytes(file) })
  assert.equal(uploadsOf(kept).length, 1)
  assert.equal(setsOf(kept).length, 0)
  const block = kept.site.holds.module.get(88)
  for (const slot of ['favicon-32', 'favicon-512', 'favicon-phone-180'])
    assert.ok(block.includes(lineOf(second, slot).ordered), slot)
  assert.equal(lineOf(second, 'favicon-32').unchanged, undefined)
  assert.equal(lineOf(second, 'favicon-512').unchanged, true)
})

test('brand: a changed ico goes through its setting and through the head block', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  const second = await brandRun(kept, first, { change: newBytes(brandFile().favicon.ico) })
  assert.deepEqual(Object.keys(setsOf(kept)[0].params.profiles.default), ['other_faviconFile'])
  assert.ok(kept.site.holds.module.get(88).includes(lineOf(second, 'favicon-ico').ordered))
  assert.ok(kept.site.holds.module.get(88).includes(lineOf(second, 'favicon-32').ordered))
})

test('brand: a small logo held as CSS stays in the head block when an icon changes', async () => {
  const kept = keptBrand({ settings: { default: { settings: { site_logo: 'a', site_logo_dark: 'b' } } } })
  const first = await brandRun(kept, null)
  const small = first.slots.find((s) => s.spot === 'logo-offcanvas-1')
  assert.match(small.reason, /through CSS/)
  const second = await brandRun(kept, first, { change: newBytes(brandFile().favicon.png32) })
  assert.ok(kept.site.holds.module.get(88).includes(small.ordered))
  assert.equal(second.slots.find((s) => s.spot === 'logo-offcanvas-1').unchanged, true)
})

test('brand: a changed accent module writes that module alone', async () => {
  const kept = keptBrand()
  const first = await brandRun(kept, null)
  const html = '<style id="tracy-ds-slot">/* tracy-ds-slot: brand:121111--7a2f9c */ :root{}</style>'
  const second = await brandRun(kept, first, {
    change: (dir) => writeFileSync(path.join(dir, 'module-build-1.html'), html)
  })
  const writes = kept.writes()
  assert.deepEqual(
    writes.map((w) => w.params.kind),
    ['module', 'moduleAssignment']
  )
  assert.equal(writes[0].params.fields.content, html)
  assert.equal(lineOf(second, 'accent').ordered, html)
  assert.equal(lineOf(second, 'accent').unchanged, undefined)
})

test('brand: an upload refused last time is retried, and what went through is not', async () => {
  const refuse = { 'media.upload': { ok: false, error: 'bad_path', message: 'no' } }
  const kept = keptBrand({ refuse })
  const first = await brandRun(kept, null)
  assert.equal(first.slots.find((s) => s.spot === 'logo-header-1').status, 'failed')
  delete refuse['media.upload']
  const second = await brandRun(kept, first)
  assert.ok(uploadsOf(kept).length > 0)
  assert.ok(!kept.writes().some((c) => c.action === 'site.identity'), 'the name went through')
  assert.equal(second.slots.find((s) => s.spot === 'logo-header-1').status, 'written')
})

// Pictures

const OTHER = picture('another')
const keptPictures = (over = {}) => keptSite(pictureSite(over), { kit: pictureKit() })

async function pictureRun(kept, last, pictures = picturePackage()) {
  const frozen = frozenWithPictures({ pictures, files: [HERO, FIGURE, BACKGROUND, PREVIEW, OTHER] })
  try {
    return await kept.run(frozen.files, last)
  } finally {
    frozen.done()
  }
}

test('pictures: nothing is uploaded or set again when no hash differs', async () => {
  const kept = keptPictures()
  const first = await pictureRun(kept, null)
  assert.equal(first.status, 'done', JSON.stringify(first.cause))
  const second = await pictureRun(kept, first)
  assert.deepEqual(kept.writes(), [])
  assert.equal(lineOf(second, 'block-2.pic').unchanged, true)
  assert.equal(lineOf(second, 'block-2.pic').ordered, HERO.entry.sitePath)
  assert.equal(lineOf(second, 'site.body-background').unchanged, true)
  assert.ok(lineOf(second, 'site.body-background').readFrom)
})

test('pictures: a frame with new bytes uploads that file and sends that frame alone', async () => {
  const kept = keptPictures()
  const first = await pictureRun(kept, null)
  const pictures = picturePackage()
  pictures.mapping.changes['module-2.pic'] = OTHER.entry.sitePath
  pictures.uploads.push(OTHER.entry)
  const second = await pictureRun(kept, first, pictures)
  assert.deepEqual(
    uploadsOf(kept).map((c) => c.params.path),
    [OTHER.entry.sitePath]
  )
  assert.deepEqual(appliesOf(kept)[0].params.changes, { 'module-2.pic': OTHER.entry.sitePath })
  assert.equal(kept.writes().length, 2)
  assert.equal(lineOf(second, 'block-2.pic').unchanged, undefined)
  assert.equal(lineOf(second, 'article-7.5').unchanged, true)
})

test('pictures: a new body background goes through its setting alone', async () => {
  const kept = keptPictures()
  const first = await pictureRun(kept, null)
  const pictures = picturePackage()
  pictures.siteSettings[0] = { ...pictures.siteSettings[0], ...OTHER.entry }
  const second = await pictureRun(kept, first, pictures)
  assert.deepEqual(
    uploadsOf(kept).map((c) => c.params.path),
    [OTHER.entry.sitePath]
  )
  assert.equal(appliesOf(kept).length, 0)
  assert.equal(lineOf(second, 'site.body-background').ordered, OTHER.entry.sitePath)
  assert.equal(lineOf(second, 'site.body-background').unchanged, undefined)
})

test('pictures: an upload refused last time is retried, with its frame', async () => {
  const refusePath = { [HERO.entry.sitePath]: { ok: false, error: 'bad_path', message: 'no' } }
  const kept = keptPictures({ refusePath })
  const first = await pictureRun(kept, null)
  assert.equal(lineOf(first, 'block-2.pic').status, 'failed')
  delete refusePath[HERO.entry.sitePath]
  const second = await pictureRun(kept, first)
  assert.deepEqual(
    uploadsOf(kept).map((c) => c.params.path),
    [HERO.entry.sitePath]
  )
  assert.deepEqual(Object.keys(appliesOf(kept)[0].params.changes).sort(), ['article-7.5', 'module-2.pic'])
  assert.equal(lineOf(second, 'block-2.pic').status, 'written')
})

// Painted frames

const ACCENT_FRAMES = ['block-3.icon', 'block-3.tile', 'block-3.back']
const NOT_ACCENT = 'block-3.plain'

async function paintedRun(kept, last, accent, figure) {
  const painted = [
    iconItem('block-3.icon'),
    initialsItem('block-3.tile'),
    backdropItem('block-3.back', figure),
    iconItem(NOT_ACCENT, {
      paint: { light: { glyph: 'text', plate: null }, dark: { glyph: 'text', plate: null } }
    })
  ]
  const pictures = picturePackage()
  pictures.painted = painted
  pictures.mapping.changes = {
    'module-2.pic': HERO.entry.sitePath,
    'module-3.back': figure.entry.sitePath
  }
  pictures.uploads = [HERO.entry, figure.entry]
  const brand = brandFile()
  brand.colours = { ...brand.colours, accent }
  const withBrand = frozenWithBrand({ brand })
  writeFileSync(path.join(path.dirname(withBrand.files.brand), brand.colours.module.file), moduleHtml(accent))
  const frozen = frozenWithPictures({ pictures, files: [HERO, figure, BACKGROUND, PREVIEW] })
  try {
    return await kept.run({ ...withBrand.files, pictures: frozen.files.pictures }, last)
  } finally {
    withBrand.done()
    frozen.done()
  }
}

function keptPainted() {
  const kit = brandKit()
  kit.doc.site = { ...pictureKit().doc.site, ...kit.doc.site }
  const site = pictureSite({
    contract: {
      extraKeys: [
        'module-2.pic',
        'article-7.5',
        'module-2.gone',
        'module-88.0',
        'module-88.1',
        'module-3.icon',
        'module-3.tile',
        'module-3.back',
        'module-3.plain'
      ]
    }
  })
  return keptSite(site, { kit, deps: { accentPlace: place } })
}

test('painted: the same colours draw the same files, so nothing is written again', async () => {
  const figure = await makeFigure()
  const kept = keptPainted()
  const first = await paintedRun(kept, null, '#0f7a6b', figure)
  assert.equal(first.status, 'done', JSON.stringify(first.cause))
  for (const slot of [...ACCENT_FRAMES, NOT_ACCENT]) assert.equal(lineOf(first, slot).status, 'written', slot)
  await paintedRun(kept, first, '#0f7a6b', figure)
  assert.deepEqual(kept.writes(), [])
})

test('painted: a changed accent redraws the frames that use it, and only those', async () => {
  const figure = await makeFigure()
  const kept = keptPainted()
  const first = await paintedRun(kept, null, '#0f7a6b', figure)
  const second = await paintedRun(kept, first, OTHER_ACCENT, figure)
  assert.equal(second.status, 'done', JSON.stringify(second.cause))
  const sent = appliesOf(kept)[0].params.changes
  assert.deepEqual(Object.keys(sent).sort(), ['module-3.back', 'module-3.icon', 'module-3.tile'])
  const uploaded = uploadsOf(kept).map((c) => c.params.path)
  assert.deepEqual(uploaded.sort(), Object.values(sent).sort())
  for (const slot of ACCENT_FRAMES) {
    assert.notEqual(lineOf(second, slot).ordered, lineOf(first, slot).ordered, slot)
    assert.equal(lineOf(second, slot).unchanged, undefined, slot)
  }
  assert.equal(lineOf(second, NOT_ACCENT).unchanged, true, 'its colour did not change')
  assert.equal(lineOf(second, 'block-2.pic').unchanged, true)
  assert.equal(lineOf(second, 'accent').unchanged, undefined, 'the module goes too')
})

// Share pictures

const sitePathOf = (report, spot) => report.slots.find((s) => s.spot === spot).ordered

async function shareRun(kept, last, { pictures, change } = {}) {
  const frozen = frozenWithBoth(pictures ? { pictures } : {})
  try {
    const dir = path.dirname(frozen.files.pictures)
    mkdirSync(path.join(dir, path.dirname(OTHER.entry.file)), { recursive: true })
    writeFileSync(path.join(dir, OTHER.entry.file), OTHER.bytes)
    change?.(path.dirname(frozen.files.brand))
    return await kept.run(frozen.files, last)
  } finally {
    frozen.done()
  }
}

const keptShare = () => keptSite(shareSite(), { kit: shareKit(), deps: { accentPlace: async () => null } })

const shareWrites = (kept) =>
  kept.writes().filter((c) => c.action === 'content.update' && c.params.fields?.params?.includes('og_img'))

test('share: nothing is written again, the switch is not touched, and each line still reads back', async () => {
  const kept = keptShare()
  const first = await shareRun(kept, null)
  assert.equal(first.status, 'done', JSON.stringify(first.cause))
  const second = await shareRun(kept, first)
  assert.deepEqual(kept.writes(), [])
  assert.equal(kept.calls().filter((c) => c.params?.kind === 'templateStyle').length, 0)
  for (const slot of ['page-home:share-image', 'page-about:share-image', 'share-switch:templateStyle-11']) {
    assert.deepEqual([lineOf(second, slot).status, lineOf(second, slot).unchanged], ['written', true], slot)
    assert.ok(lineOf(second, slot).readFrom, slot)
  }
  assert.equal(lineOf(second, 'page-home:share-image').ordered, HERO.entry.sitePath, 'not the logo')
  assert.equal(kept.site.params('menuItem', 101).og_img, HERO.entry.sitePath)
})

test('share: a new top picture moves that page alone, and the other settings of its item stay', async () => {
  const kept = keptShare()
  const first = await shareRun(kept, null)
  const pictures = picturePackage()
  pictures.mapping.changes['module-2.pic'] = OTHER.entry.sitePath
  pictures.uploads.push(OTHER.entry)
  const second = await shareRun(kept, first, { pictures })
  const [write, ...others] = shareWrites(kept)
  assert.deepEqual(others, [])
  assert.equal(write.params.id, 101)
  assert.equal(kept.site.params('menuItem', 101).og_img, OTHER.entry.sitePath)
  assert.equal(kept.site.params('menuItem', 101).show_icon, 1)
  assert.equal(lineOf(second, 'page-home:share-image').unchanged, undefined)
  assert.equal(lineOf(second, 'page-about:share-image').unchanged, true)
})

test('share: a new logo moves the page that shares it, and the page with its own picture stays', async () => {
  const kept = keptShare()
  const first = await shareRun(kept, null)
  const second = await shareRun(kept, first, { change: newBytes('spots/logo-header-1.png') })
  const writes = shareWrites(kept)
  assert.deepEqual(
    writes.map((w) => w.params.id),
    [102]
  )
  assert.equal(kept.site.params('menuItem', 102).og_img, sitePathOf(second, 'logo-header-1'))
})

// Links

const linkKit = (links) => {
  const kit = pictureKit()
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2'] } },
    { id: 'page-about', path: '/about', blocks: { 1440: ['block-5'] } }
  ]
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.source = { entity: 'module-2' }
  block.links = links
  return kit
}
const linkPlan = (leads) => {
  const p = plan()
  p.pages[0].blocks[0].links = Object.entries(leads).map(([link, leadsTo]) => ({
    link,
    leadsTo,
    labelSlot: null
  }))
  return p
}
const linkRecords = () => [
  menuRow(101, { home: 1, path: 'home', type: 'component' }),
  menuRow(12, { path: 'about', type: 'component' }),
  menuRow(40, { path: 'offers', type: 'url', link: '#' })
]
const urlSlot = { key: 'module-2.9', entity: 'module-2', type: 'url', sample: '#', current: '#' }

test('links: an unchanged link slot stays out of the call, and a changed one goes alone', async () => {
  const links = [{ id: 'block-2.9', target: '/old', action: 'primary-cta' }]
  const site = fakeSite({
    records: linkRecords(),
    extraKeys: ['module-2.9'],
    overSlot: (slot) => (slot.key === 'module-2.9' ? urlSlot : {})
  })
  const kept = keptSite(site, { kit: linkKit(links) })
  const c = copy()
  const [first, second] = await runInTurn(kept, [
    { plan: linkPlan({ 'block-2.9': 'page-about' }), copy: c },
    { plan: linkPlan({ 'block-2.9': 'page-about' }), copy: c }
  ])
  assert.equal(lineOf(first, 'block-2.9').status, 'written')
  assert.deepEqual(kept.writes(), [])
  assert.equal(lineOf(second, 'block-2.9').unchanged, true)
  const [, third] = await runInTurn(kept, [
    { plan: linkPlan({ 'block-2.9': 'page-about' }), copy: c },
    { plan: linkPlan({ 'block-2.9': 'page-home' }), copy: c }
  ])
  assert.deepEqual(appliesOf(kept)[0].params.changes, { 'module-2.9': 'index.php?Itemid=101' })
  assert.equal(lineOf(third, 'block-2.9').unchanged, undefined)
})

test('links: a menu item target is written once, and again only when it differs', async () => {
  const links = [
    { id: 'block-2.link-1', target: null, action: 'navigation', menuItem: 'menuItem-40', menu: 'module-2' }
  ]
  const site = fakeSite({ records: linkRecords() })
  const kept = keptSite(site, { kit: linkKit(links) })
  const c = copy()
  const toAbout = linkPlan({ 'block-2.link-1': 'page-about' })
  const [, second] = await runInTurn(kept, [
    { plan: toAbout, copy: c },
    { plan: toAbout, copy: c }
  ])
  assert.equal(kept.writes().filter((w) => w.params.id === 40).length, 0)
  assert.equal(lineOf(second, 'block-2.link-1').unchanged, true)
  assert.ok(lineOf(second, 'block-2.link-1').readFrom)
  await runInTurn(kept, [
    { plan: toAbout, copy: c },
    { plan: linkPlan({ 'block-2.link-1': 'page-home' }), copy: c }
  ])
  const moved = kept.writes().filter((w) => w.params.id === 40)
  assert.equal(moved.length, 1)
  assert.equal(moved[0].params.fields.link, 'index.php?Itemid=101')
})

test('a link that left with what holds it does not itself need a new site: what holds it decides', () => {
  const last = readLastReport({
    site: 's',
    contract: 'c',
    slots: [{ slot: 'block-2.9', key: 'module-2.9', status: 'hidden', leftWith: 'module-2.3', owner: 'plan' }]
  })
  assert.equal(
    needsNewSite(last, { plan: plan(), kit: {}, owners: new Map(), extras: {}, changes: {} }),
    null
  )
})
