// Brand colours from the logo on a Joomla brief build (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026), through the
// engine's seams with recording doubles: the head block carries the CSS that repaints the template's brand colour roles
// (T4 as a custom module on every page, T3 in its own head-code param), a plan without logo colours writes none, an icon
// drawn in the template's brand colour takes the logo's, and a drawing is told the brand colours. Every business is made
// up: a florist with a purple and green logo, a law office with a navy logo, a bakery with no logo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { writeOutsideMap } from '../src/sites/brief-engines/joomla-outside-map.js'
import { brandColoursCss } from '../src/sites/brief-engines/joomla-brand-colours.js'
import { COLOURS_NOTE, headBlocks } from '../src/sites/brief-engines/joomla-head-blocks.js'
import { shapeDecor } from '../src/sites/brief-engines/drawn-pictures.js'
import { drawKey, drawPrompt } from '../src/lib/picture-draw.js'
import { hiddenByHeadBlock, planOutsideMap } from 'website-opportunities/domain/outside-map.mjs'
import { planColours } from 'website-opportunities/domain/brand-colours.mjs'

const florist = {
  business: { name: 'Violet Lane Flowers' },
  brand: {
    logo: 'asset-florist-logo',
    colorsFrom: 'logo',
    colors: [
      { hex: '#5b2a6e', role: 'primary' },
      { hex: '#4f8a3c', role: 'accent' }
    ]
  }
}
const lawOffice = {
  business: { name: 'Harrow and Pike Legal' },
  brand: { logo: 'asset-law-logo', colorsFrom: 'logo', colors: [{ hex: '#1b2a4a', role: 'primary' }] }
}
const bakery = {
  business: { name: 'Crumb and Co' },
  brand: { colorsFrom: 'photos', colors: [{ hex: '#c27c3a' }] }
}

const T4_CSS =
  ':root{--color-primary:#e8402f;--body-bg-color:#141313;--body-link-color:#e8402f}body{background-color:var(--body-bg-color)}a{color:var(--body-link-color)}.btn.btn-primary{background-color:var(--color-primary);color:#fff}'
const T3_CSS = 'body{background:#fff}a{color:#2a9d8f}.btn-primary{background-color:#2a9d8f;color:#fff}'

function fakeSite(styles) {
  const writes = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list') {
      if ((params.offset ?? 0) !== 0) return { ok: true, items: [] }
      if (params.kind === 'templateStyle')
        return { ok: true, items: styles.map((s) => ({ id: s.id, client_id: 0, template: 'site_template' })) }
      if (params.kind === 'module')
        return {
          ok: true,
          items: [{ id: 91, module: 'mod_custom', published: 1, position: 'footer', content: '<p>Hi</p>' }]
        }
      return { ok: true, items: [] }
    }
    if (action === 'content.get' && params.kind === 'templateStyle')
      return { ok: true, item: styles.find((s) => s.id === params.id) }
    if (action === 'content.get' && params.kind === 'moduleAssignment')
      return { ok: true, item: { menuids: '[0]' } }
    if (action === 'content.batch') return { ok: true }
    if (action === 'content.update') {
      writes.push({ kind: params.kind, id: params.id, fields: params.fields })
      return { ok: true, ...(params.id === undefined ? { id: 900 } : {}) }
    }
    return { ok: false, error: 'unknown' }
  }
  return { apply, writes }
}

const readerOf = (css, link) => ({
  text: async (url) => {
    if (url === '/')
      return `<html><head><link rel="stylesheet" href="${link}"></head><body><svg><path fill="#E8402F"/></svg></body></html>`
    if (url === link) return css
    throw new Error('not served')
  }
})

const planOf = (brief) => ({
  brand: { name: { value: brief.business.name } },
  pages: [],
  outside: planOutsideMap({ brief, contentMap: { slots: [], entities: [] } }),
  colours: planColours(brief)
})

test('a T4 brief build with a logo: the head module repaints the brand colour roles, the leftover reader is untouched', async () => {
  const site = fakeSite([{ id: 12, params: JSON.stringify({ 'typelist-site': 'default' }) }])
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan: planOf(florist),
    reader: readerOf(T4_CSS, '/media/t4/css/site.css'),
    contentMap: { slots: [], entities: [] },
    note: () => {},
    applyId: 'outside-1'
  })
  // Every build now writes a leftovers block too (empty play controls, related lists), so the colours module is found by
  // its own note, not by the order of the writes, and it must be a module apart from the leftovers.
  const made = site.writes.filter((w) => w.kind === 'module' && w.id === undefined)
  const coloursModule = made.find((w) => w.fields?.note === COLOURS_NOTE)
  assert.ok(
    coloursModule,
    `a module noted ${COLOURS_NOTE} is created (made: ${made.map((w) => w.fields?.note)})`
  )
  const head = String(coloursModule.fields.content ?? '')
  for (const other of made.filter((w) => w !== coloursModule))
    assert.doesNotMatch(
      String(other.fields?.content ?? ''),
      /data-tracy-brand-colours/,
      'colours only in their module'
    )
  assert.match(head, /<style data-tracy-brand-colours>/)
  assert.doesNotMatch(head, /data-tracy-leftovers/, 'the colours module carries no leftover rules')
  assert.match(head, /a\{color:var\(--tracy-brand-0-text\)\}/)
  assert.match(head, /\.btn\.btn-primary\{background-color:var\(--tracy-brand-0-fill\)\}/)
  assert.match(head, /\[fill="#E8402F" i\]\{fill:var\(--tracy-brand-0-line\)\}/)
  assert.match(head, /:root\{[^}]*--color-primary:#[0-9a-f]{6}/)
  assert.doesNotMatch(head.replace(/\[fill="#E8402F" i\]/, ''), /e8402f/i)
  assert.deepEqual([...hiddenByHeadBlock(head)], [], 'the colours are not read as hidden leftovers')
})

test('a T3 brief build of another trade: the same CSS goes into its head-code param', async () => {
  const site = fakeSite([{ id: 9, params: { t3_template: '1', snippet_close_head: '' } }])
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan: planOf(lawOffice),
    reader: readerOf(T3_CSS, '/t3-assets/a.css'),
    contentMap: { slots: [], entities: [] },
    note: () => {},
    applyId: 'o'
  })
  const head = JSON.parse(
    String(site.writes.find((w) => w.kind === 'templateStyle').fields.params)
  ).snippet_close_head
  assert.match(head, /data-tracy-brand-colours/)
  assert.match(head, /--tracy-brand-0-text:#1b2a4a/, 'the navy reads on white as it is')
  assert.doesNotMatch(head, /2a9d8f/)
})

test('no logo in the brief: no colour is written, the template keeps its own', async () => {
  const notes = []
  assert.equal(
    brandColoursCss({
      plan: planOf(bakery),
      styles: [{ css: T4_CSS }],
      pages: [],
      note: (l) => notes.push(l)
    }),
    ''
  )
  const site = fakeSite([{ id: 12, params: JSON.stringify({ 'typelist-site': 'default' }) }])
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 's',
    plan: planOf(bakery),
    reader: readerOf(T4_CSS, '/media/t4/css/site.css'),
    contentMap: { slots: [], entities: [] },
    note: () => {},
    applyId: 'o'
  })
  assert.ok(site.writes.every((w) => !String(w.fields?.content ?? '').includes('tracy-brand-colours')))
})

test('the colours travel in a marked block of their own, apart from the leftover rules', () => {
  const css = 'a{color:var(--tracy-brand-0-text)}'
  const alone = headBlocks({ colours: css })
  assert.equal(alone.length, 1)
  assert.match(
    alone[0].content,
    /^<!-- tracy-leftovers --><style data-tracy-brand-colours>[\s\S]*<\/style><!-- \/tracy-leftovers -->$/
  )
  const both = headBlocks({
    leftovers:
      '<!-- tracy-leftovers --><style data-tracy-leftovers>\nx{display:none}\n</style><!-- /tracy-leftovers -->',
    colours: css
  })
  assert.deepEqual(
    both.map((b) => b.note),
    ['tracy-leftovers', 'tracy-brand-colours']
  )
  assert.doesNotMatch(both[0].content, /brand-colours/)
  assert.doesNotMatch(both[1].content, /data-tracy-leftovers/)
  assert.deepEqual(headBlocks({}), [])
})

test('an icon the demo drew in the template brand colour is drawn in the logo colour; without logo colours it keeps the demo colour', async () => {
  const red = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 232, g: 64, b: 47, alpha: 1 } }
  })
    .png()
    .toBuffer()
  const inkOf = async (brief) => {
    const { shaped } = await shapeDecor({
      decisions: [{ action: 'icon', file: 'images/demo/icon.png', glyph: 'check', key: 'module-3.1' }],
      slotOf: new Map([
        ['module-3.1', { key: 'module-3.1', entity: 'module-3', sample: 'images/demo/icon.png' }]
      ]),
      siteBytes: async () => red,
      real: { brief, colours: [] },
      note: () => {}
    })
    const { data, info } = await sharp(shaped[0].bytes).raw().toBuffer({ resolveWithObject: true })
    for (let i = 0; i < data.length; i += info.channels)
      if (data[i + 3] === 255) return [data[i], data[i + 1], data[i + 2]]
    return null
  }
  const [r, g, b] = /** @type {number[]} */ (await inkOf(florist))
  assert.ok(b > g && r > g, `a purple ink, not the demo red: ${[r, g, b]}`)
  const kept = /** @type {number[]} */ (await inkOf(bakery))
  assert.ok(kept[0] > 200 && kept[1] < 90, `the demo red stays: ${kept}`)
})

test('a drawing is told the brand colours in plain words; its key changes only when a palette is given', () => {
  const item = { mode: 'scene', aspect: 16 / 9, subject: { kind: 'place' } }
  const plain = drawPrompt(item)
  assert.doesNotMatch(plain, /brand colours/)
  const coloured = drawPrompt({ ...item, palette: ['#5b2a6e', '#4f8a3c'] })
  assert.match(coloured, /brand colours are dark purple \(#5b2a6e\) and green \(#4f8a3c\)/)
  assert.match(drawPrompt({ ...item, mode: 'object', palette: ['#1b2a4a'] }), /dark blue \(#1b2a4a\)/)
  assert.doesNotMatch(coloured, /[–—]/)
  const key = (i) => drawKey(i, { model: 'm', shas: [] })
  assert.equal(key(item), key({ ...item, palette: [] }))
  assert.notEqual(key(item), key({ ...item, palette: ['#5b2a6e'] }))
})
