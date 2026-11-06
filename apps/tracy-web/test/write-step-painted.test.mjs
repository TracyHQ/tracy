// The painted frames of the write step (ADR 0043 section 1a, #367), through its entry point: recipes of colour roles and
// a brand in, drawn files and one contract call to a fake site door out. Every colour and picture here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { brandFile } from './_write-step-brand.mjs'
import { CONTRACT } from './_write-step-run.mjs'
import {
  ACCENT,
  backdropItem,
  coloursIn,
  HERO,
  iconItem,
  initialsItem,
  moduleHtml,
  ON_DARK,
  OTHER_ACCENT,
  PREVIEW,
  runPainted,
  SURFACE
} from './_write-step-painted.mjs'

/** A door the site check reads: the fake site's, answering the slots the run wrote as image slots that hold those values. */
function readBackDoor(site, report) {
  const held = site.of('content.contract', 'apply').at(-1).params.changes
  return {
    async apply(call) {
      const answer = await site.door.apply(call)
      if (call.action !== 'content.contract') return answer
      const slots = answer.slots.map((s) => ({
        ...s,
        type: report.slots.some((l) => l.key === s.key && l.owner === 'picture') ? 'image' : 'text',
        current: held[s.key] ?? s.current
      }))
      return { ...answer, slots }
    }
  }
}

const KEPT_ICONS = {
  slots: [{ key: 'module-3.icon', type: 'image', fit: { kind: 'icon', replace: 'keep', transparent: true } }]
}
const takes = (entry = { limits: 0, icons: 1, alts: 0 }, contract = CONTRACT) => ({
  info: { slot_corrections: { version: 1, contracts: { [contract]: entry } } }
})
const runKeptIcon = (site, contentMap = KEPT_ICONS) =>
  runPainted({ items: () => [iconItem('block-3.icon')], contentMap, site })

const SITE_PATH = /^images\/tracy-content\/([0-9a-f]{64})\.(png|jpg)$/

test('an icon is drawn in the accent of the brand file and goes up through the same door as the others', async () => {
  const { report, line, sent, uploaded, bytesAt, site } = await runPainted({
    items: () => [iconItem('block-3.icon')]
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const path = sent['module-3.icon']
  assert.match(path, SITE_PATH)
  assert.ok(uploaded.includes(path), 'its file is uploaded before the call')
  assert.equal(site.of('content.contract', 'apply').length, 1, 'one contract call')
  const colours = await coloursIn(bytesAt(path))
  assert.ok(colours.has(ACCENT), 'the glyph is in the accent')
  assert.equal(colours.size, 1, 'and in nothing else')
  assert.equal(line('block-3.icon').status, 'written')
})

test('the preview of a painted frame never reaches the site', async () => {
  const { uploaded, sent } = await runPainted({ items: () => [iconItem('block-3.icon')] })
  assert.ok(!uploaded.includes(PREVIEW.entry.sitePath))
  assert.ok(!Object.values(sent).includes(PREVIEW.entry.sitePath))
})

test('an initials tile keeps its letters on the accent, in a colour that reads', async () => {
  const { line, sent, bytesAt } = await runPainted({ items: () => [initialsItem('block-4.face')] })
  const path = sent['module-4.face']
  assert.match(path, /\.jpg$/)
  const { data, info } = await sharp(bytesAt(path)).raw().toBuffer({ resolveWithObject: true })
  const near = (i, hex) =>
    [1, 3, 5].every((at, k) => Math.abs(data[i + k] - Number.parseInt(hex.slice(at, at + 2), 16)) < 12)
  assert.ok(near(0, ACCENT), 'the corner is the accent')
  let letters = 0
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 230 && data[i + 1] > 230) letters += 1
  assert.ok(letters > 20, 'the letters are drawn, in white on this dark accent')
  assert.equal(line('block-4.face').status, 'written')
})

test('an initials tile is drawn as wide as the slot asks, keeping its shape', async () => {
  const contentMap = {
    slots: [{ key: 'module-4.face', type: 'image', fit: { kind: 'photo', replace: 'photo', minWidth: 90 } }]
  }
  const { sent, bytesAt, line } = await runPainted({
    items: () => [initialsItem('block-4.face', 'QF', { width: 60, height: 62 })],
    contentMap
  })
  const meta = await sharp(bytesAt(sent['module-4.face'])).metadata()
  assert.deepEqual([meta.width, meta.height], [90, 93])
  assert.equal(line('block-4.face').painted.width, 90)
})

test('a cut-out goes up as one file: disc and bands in the brand colours, the figure on top, the corners clear', async () => {
  const { sent, uploaded, bytesAt, figure, line, report } = await runPainted({
    items: (f) => [backdropItem('block-5.figure', f)]
  })
  const path = sent['module-5.figure']
  assert.notEqual(path, figure.entry.sitePath, 'the slot holds the drawn file')
  assert.ok(uploaded.includes(path))
  assert.ok(
    !uploaded.includes(figure.entry.sitePath),
    'the bare figure has no slot now, so it stays off the site'
  )
  const bytes = bytesAt(path)
  const colours = await coloursIn(bytes)
  assert.ok(colours.has(SURFACE), 'the disc is the dark surface of the Design system')
  assert.ok(colours.has(ACCENT), 'the bands are the accent of the brand file')
  assert.ok(colours.has('#ffcc00'), 'the figure is on top')
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[info.channels - 1], 0, 'a transparent corner, which the door asks of a cut-out')
  assert.equal(line('block-5.figure').part, 'picture-painted')
  assert.equal(
    report.slots.filter((s) => s.slot.startsWith('block-5.figure')).length,
    1,
    'one line for the slot'
  )
})

test('changing the accent and writing again draws those frames again', async () => {
  const items = (f) => [
    iconItem('block-3.icon'),
    initialsItem('block-4.face'),
    backdropItem('block-5.figure', f)
  ]
  const first = await runPainted({ items })
  const second = await runPainted({ items, accent: OTHER_ACCENT })
  for (const key of ['module-3.icon', 'module-4.face', 'module-5.figure'])
    assert.notEqual(first.sent[key], second.sent[key], key)
  assert.ok((await coloursIn(second.bytesAt(second.sent['module-3.icon']))).has(OTHER_ACCENT))
  assert.ok((await coloursIn(second.bytesAt(second.sent['module-5.figure']))).has(OTHER_ACCENT))
})

test('a twin follows its source: the same recipe is one file, uploaded once', async () => {
  const { sent, uploaded } = await runPainted({
    items: () => [iconItem('block-3.icon'), iconItem('block-3.twin'), iconItem('article-9.1')]
  })
  assert.equal(sent['module-3.icon'], sent['module-3.twin'])
  assert.equal(sent['module-3.icon'], sent['article-9.1'])
  assert.equal(uploaded.filter((p) => p === sent['module-3.icon']).length, 1)
})

test('a frame draws the variant it holds', async () => {
  const paint = { light: { glyph: 'accent', plate: null }, dark: { glyph: 'on-dark', plate: null } }
  const { sent, bytesAt, line } = await runPainted({
    items: () => [iconItem('block-3.icon', { paint }), iconItem('block-3.twin', { paint, holds: 'dark' })]
  })
  assert.ok((await coloursIn(bytesAt(sent['module-3.icon']))).has(ACCENT))
  assert.ok((await coloursIn(bytesAt(sent['module-3.twin']))).has(ON_DARK))
  assert.equal(line('block-3.twin').painted.holds, 'dark')
})

test('a plate is drawn in its role, in its shape and place', async () => {
  const plate = {
    role: 'surface',
    opacity: 1,
    radius: 0.5,
    box: { x: 0, y: 0, w: 1, h: 1 },
    glyph: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
  }
  const paint = { light: { glyph: 'accent', plate }, dark: { glyph: 'accent', plate } }
  const { sent, bytesAt } = await runPainted({
    items: () => [iconItem('block-3.icon', { paint, width: 128, height: 128 })]
  })
  const colours = await coloursIn(bytesAt(sent['module-3.icon']))
  assert.ok(colours.has(SURFACE))
  assert.ok(colours.has(ACCENT))
})

test('each painted line holds its recipe, its drawn file and what makes it drawn again, and reads back', async () => {
  const item = iconItem('block-3.icon')
  const { line, sent, report, site } = await runPainted({ items: () => [item] })
  const got = line('block-3.icon')
  assert.equal(got.key, 'module-3.icon')
  assert.equal(got.owner, 'picture')
  assert.equal(got.part, 'picture-painted')
  assert.equal(got.ordered, sent['module-3.icon'])
  assert.deepEqual(got.painted.paint, item.paint)
  assert.deepEqual(got.painted.draw, item.draw)
  assert.equal(got.painted.file, sent['module-3.icon'])
  assert.deepEqual(got.painted.drawnIn, { glyph: ACCENT, plate: null })
  assert.equal(got.painted.takes, 'image-path')
  assert.equal(got.painted.redraw, 'when the design system changes')
  const check = await runSiteCheck({ door: readBackDoor(site, report), report })
  assert.equal(check.groups.find((g) => g.name === 'read-back').lines['block-3.icon'], 'match')
})

test('a backdrop line also reads back, against the drawn file', async () => {
  const { report, site } = await runPainted({ items: (f) => [backdropItem('block-5.figure', f)] })
  const check = await runSiteCheck({ door: readBackDoor(site, report), report })
  assert.equal(check.groups.find((g) => g.name === 'read-back').lines['block-5.figure'], 'match')
})

test('a slot the template keeps stops that frame: nothing is drawn, uploaded or sent, and the line says why', async () => {
  const contentMap = {
    slots: [
      { key: 'module-3.icon', type: 'image', fit: { kind: 'icon', replace: 'keep' } },
      { key: 'module-3.free', type: 'image', fit: { kind: 'icon' } }
    ]
  }
  const { line, sent, uploaded, report } = await runPainted({
    items: () => [iconItem('block-3.icon'), iconItem('block-3.free', { width: 33, height: 33 })],
    contentMap
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const kept = line('block-3.icon')
  assert.equal(kept.status, 'skipped')
  assert.match(kept.reason, /replace_kept/)
  assert.equal(kept.part, 'picture-painted')
  assert.deepEqual(kept.painted.paint, iconItem('x').paint, 'the recipe stays on the line')
  assert.equal(sent['module-3.icon'], undefined)
  assert.equal(line('block-3.free').status, 'written')
  assert.equal(uploaded.filter((p) => p === sent['module-3.free']).length, 1)
  assert.equal(
    uploaded.filter((p) => p.startsWith('images/tracy-content/')).length,
    3,
    'the hero, the background and the frame that can be written'
  )
})

test('a slot that is not an image slot fits neither way: that frame fails and the run goes on', async () => {
  const contentMap = { slots: [{ key: 'module-3.icon', type: 'text' }] }
  const { line, sent, report } = await runPainted({ items: () => [iconItem('block-3.icon')], contentMap })
  assert.equal(report.status, 'done')
  assert.equal(line('block-3.icon').status, 'failed')
  assert.match(line('block-3.icon').reason, /neither/)
  assert.equal(sent['module-3.icon'], undefined)
  assert.equal(sent['module-2.pic'], HERO.entry.sitePath)
})

test('a recipe naming a colour value is refused on its line, never drawn', async () => {
  const paint = { light: { glyph: '#ff0000', plate: null }, dark: { glyph: 'accent', plate: null } }
  const { line, sent } = await runPainted({
    items: () => [iconItem('block-3.icon', { paint }), iconItem('block-3.good')]
  })
  assert.equal(line('block-3.icon').status, 'failed')
  assert.match(line('block-3.icon').reason, /colour role/)
  assert.equal(sent['module-3.icon'], undefined)
  assert.equal(line('block-3.good').status, 'written')
})

test('an icon this server cannot draw as recorded fails, it does not become another icon', async () => {
  const { line } = await runPainted({
    items: () => [
      iconItem('block-3.none', {
        draw: { icon: 'no-such-glyph', set: iconItem('x').draw.set, weight: 'regular' }
      }),
      iconItem('block-3.other', { draw: { icon: 'star', set: 'another-set@1.0.0', weight: 'regular' } })
    ]
  })
  assert.equal(line('block-3.none').status, 'failed')
  assert.match(line('block-3.none').reason, /no-such-glyph/)
  assert.equal(line('block-3.other').status, 'failed')
  assert.match(line('block-3.other').reason, /another-set@1\.0\.0/)
})

test('letters code cannot draw fail: the tile does not turn into a figure', async () => {
  const { line } = await runPainted({ items: () => [initialsItem('block-4.face', '')] })
  assert.equal(line('block-4.face').status, 'failed')
  assert.match(line('block-4.face').reason, /letters/)
})

test('a role the brand file does not hold is never guessed: with no module the bare figure goes and the backdrop line says so', async () => {
  const brand = brandFile()
  brand.colours = { decision: 'kept-template', accent: ACCENT, module: null }
  const { line, sent, figure, uploaded } = await runPainted({
    brand,
    items: (f) => [backdropItem('block-5.figure', f), iconItem('block-3.icon')]
  })
  assert.equal(sent['module-5.figure'], figure.entry.sitePath)
  assert.ok(uploaded.includes(figure.entry.sitePath))
  assert.equal(line('block-5.figure').status, 'written')
  const backdrop = line('block-5.figure.backdrop')
  assert.equal(backdrop.status, 'failed')
  assert.match(backdrop.reason, /surface/)
  assert.equal(line('block-3.icon').status, 'written', 'the accent is in the brand file')
})

test('a brand file with no accent fails the painted frames in words and writes the rest', async () => {
  const brand = brandFile()
  brand.colours = { decision: 'kept-template', module: null }
  const { line, sent, report } = await runPainted({ brand, items: () => [iconItem('block-3.icon')] })
  assert.equal(report.status, 'done')
  assert.equal(line('block-3.icon').status, 'failed')
  assert.match(line('block-3.icon').reason, /accent/)
  assert.equal(sent['module-2.pic'], HERO.entry.sitePath)
})

test('a kept icon is drawn and sent when the plugin says it takes one, with no words nobody said', async () => {
  const { line, sent, uploaded, site, report, bytesAt } = await runKeptIcon(takes())
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const path = sent['module-3.icon']
  assert.match(path, SITE_PATH)
  assert.ok(uploaded.includes(path))
  assert.equal(line('block-3.icon').status, 'written')
  assert.equal(line('block-3.icon').part, 'picture-painted')
  assert.equal(site.of('content.contract', 'apply').at(-1).params.replace_kept, undefined)
  const { data, info } = await sharp(bytesAt(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const corners = [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]
  assert.deepEqual(
    corners.map((c) => data[c * info.channels + 3]),
    [0, 0, 0, 0],
    'the plugin reads a clear corner'
  )
})

for (const [why, site] of [
  ['an older plugin', {}],
  ['a plugin that corrects another contract', takes(undefined, 'other/j6/1.0.0')],
  ['a plugin whose list opens no icon here', takes({ limits: 5, icons: 0, alts: 0 })]
])
  test(`${why} keeps today's line and sends nothing`, async () => {
    const { line, sent } = await runKeptIcon(site)
    assert.equal(line('block-3.icon').status, 'skipped')
    assert.match(line('block-3.icon').reason, /replace_kept/)
    assert.equal(sent['module-3.icon'], undefined)
  })

test('a kept picture that is not a transparent icon stays kept whatever the plugin says', async () => {
  const fits = [
    { kind: 'icon', replace: 'keep' },
    { kind: 'cutout', replace: 'keep', transparent: true }
  ]
  for (const fit of fits) {
    const { line, sent } = await runKeptIcon(takes(), {
      slots: [{ key: 'module-3.icon', type: 'image', fit }]
    })
    assert.equal(line('block-3.icon').status, 'skipped')
    assert.equal(sent['module-3.icon'], undefined)
  }
})

test('a refused upload fails the frames that use the drawn file and keeps them out of the call', async () => {
  const first = await runPainted({ items: () => [iconItem('block-3.icon')] })
  const drawn = first.sent['module-3.icon']
  const refusePath = { [drawn]: { ok: false, error: 'too_large', message: 'media exceeds the inline limit' } }
  const { line, sent } = await runPainted({ items: () => [iconItem('block-3.icon')], site: { refusePath } })
  assert.equal(line('block-3.icon').status, 'failed')
  assert.match(line('block-3.icon').reason, /too_large/)
  assert.deepEqual(line('block-3.icon').painted.paint, iconItem('x').paint)
  assert.equal(sent['module-3.icon'], undefined)
})

test('a slot the plugin refuses fails in its words and the line keeps the recipe', async () => {
  const refuse = {
    'module-5.figure': {
      code: 'SLOT_IMAGE_TOO_SMALL',
      message: 'Image is too small for its slot',
      limit: 90,
      actual: 40
    }
  }
  const { line, sent } = await runPainted({
    items: (f) => [backdropItem('block-5.figure', f)],
    site: { contract: { refuse } }
  })
  const got = line('block-5.figure')
  assert.equal(got.status, 'failed')
  assert.match(got.reason, /SLOT_IMAGE_TOO_SMALL.*limit 90, actual 40/)
  assert.equal(got.part, 'picture-painted')
  assert.equal(got.painted.kind, 'backdrop')
  assert.equal(sent['module-5.figure'], undefined)
})

test('the module is read for the surface, so a Design system with another surface draws another disc', async () => {
  const brand = brandFile()
  const module = moduleHtml().replaceAll(SURFACE, '#223344')
  const { sent, bytesAt } = await runPainted({
    brand,
    module,
    items: (f) => [backdropItem('block-5.figure', f)]
  })
  assert.ok((await coloursIn(bytesAt(sent['module-5.figure']))).has('#223344'))
})
