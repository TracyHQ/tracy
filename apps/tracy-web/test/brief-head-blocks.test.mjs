// The head blocks of a Joomla brief build (spec TracyHQ/tracy#189, item 28): the brand colours and the leftover rules
// travel apart and within the size Joomla stores in one module (`Table\Module::check`, 65535 bytes), so one oversized or
// refused write never takes the other part down. Through the engine's seams with a recording double of the site that
// refuses a module longer than the limit, as Joomla does. Every business is made up: a bicycle repair shop and a dog
// grooming salon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeOutsideMap } from '../src/sites/brief-engines/joomla-outside-map.js'
import {
  blocksOf,
  cssRules,
  HEAD_BLOCK_LIMIT,
  headBlocks,
  packCss
} from '../src/sites/brief-engines/joomla-head-blocks.js'
import { planOutsideMap } from 'website-opportunities/domain/outside-map.mjs'
import { planColours } from 'website-opportunities/domain/brand-colours.mjs'

const bikeShop = {
  business: { name: 'Spoke and Chain Repairs' },
  brand: { logo: 'asset-bike-logo', colorsFrom: 'logo', colors: [{ hex: '#1f5130', role: 'primary' }] }
}
const groomer = {
  business: { name: 'Fluffy Paws Grooming' },
  brand: { logo: 'asset-groomer-logo', colorsFrom: 'logo', colors: [{ hex: '#6b2f7a', role: 'primary' }] }
}

/** A T4 stylesheet painting many parts in the template's red, the way a compiled bundle does. */
const bigTemplateCss = (n) =>
  ':root{--color-primary:#e8402f;--body-bg-color:#ffffff}body{background-color:var(--body-bg-color)}' +
  Array.from(
    { length: n },
    (_, i) => `.section-${i} .card-list .card-item-${i} a.read-more:hover{color:#e8402f}`
  ).join('')

/** The site double: refuses a module longer than Joomla's limit with Joomla's own error. */
function fakeSite({ refuse = () => false } = {}) {
  const writes = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list') {
      if ((params.offset ?? 0) !== 0) return { ok: true, items: [] }
      if (params.kind === 'templateStyle')
        return { ok: true, items: [{ id: 12, client_id: 0, template: 'site_template' }] }
      if (params.kind === 'module')
        return {
          ok: true,
          items: [{ id: 91, module: 'mod_custom', published: 1, position: 'footer', content: '<p>Hi</p>' }]
        }
      return { ok: true, items: [] }
    }
    if (action === 'content.get' && params.kind === 'templateStyle')
      return { ok: true, item: { id: 12, params: JSON.stringify({ 'typelist-site': 'default' }) } }
    if (action === 'content.get' && params.kind === 'moduleAssignment')
      return { ok: true, item: { menuids: '[0]' } }
    if (action === 'content.batch') return { ok: true }
    if (action === 'content.update') {
      const content = String(params.fields?.content ?? '')
      if (params.kind === 'module' && Buffer.byteLength(content) > HEAD_BLOCK_LIMIT)
        return { ok: false, error: 'COM_MODULES_FIELD_CONTENT_TOO_LARGE' }
      if (params.kind === 'module' && refuse(content)) return { ok: false, error: 'refused by the site' }
      writes.push({ kind: params.kind, id: params.id, fields: params.fields })
      return { ok: true, ...(params.id === undefined ? { id: 900 + writes.length } : {}) }
    }
    return { ok: false, error: 'unknown' }
  }
  return { apply, writes }
}

/** Home serves the stylesheet and one card row that lost a demo card (two kept of a three column row). */
const readerOf = (css) => ({
  text: async (url) => {
    if (url === '/')
      return (
        '<html><head><link rel="stylesheet" href="/media/t4/css/site.css"></head><body>' +
        '<div id="acm-teams-7"><div class="row g-0"><div class="col-md-4"><div class="card"><h3>Ana</h3></div></div>' +
        '<div class="col-md-4"><div class="card"><h3>Ben</h3></div></div>' +
        '<div class="col-md-4"><div class="card"><h3></h3></div></div></div></div></body></html>'
      )
    if (url === '/media/t4/css/site.css') return css
    throw new Error('not served')
  }
})

const planOf = (brief, videos) => ({
  brand: { name: { value: brief.business.name } },
  pages: [],
  outside: {
    ...planOutsideMap({ brief, contentMap: { slots: [], entities: [] } }),
    videos: videos.map((demo, i) => ({ key: `module-1.${i}`, demo, decision: 'still' }))
  },
  colours: planColours(brief)
})

const modulesWritten = (site) =>
  site.writes.filter((w) => w.kind === 'module' && w.id === undefined).map((w) => w.fields)

test('brand colours and leftover rules over one module limit together: both reach the page, each block within the limit', async () => {
  const site = fakeSite()
  const notes = []
  // Many demo videos give a large leftover block, a large template a large colour block: together over the limit.
  const videos = Array.from({ length: 300 }, (_, i) => `demoVid${String(i).padStart(4, '0')}`)
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 'bike',
    plan: planOf(bikeShop, videos),
    reader: readerOf(bigTemplateCss(500)),
    contentMap: { slots: [], entities: [] },
    note: (l) => notes.push(l),
    applyId: 'outside-1'
  })
  const made = modulesWritten(site)
  const all = made.map((m) => String(m.content)).join('\n')
  assert.ok(made.length >= 2, `the parts travel apart: ${made.map((m) => m.note).join(', ')}`)
  for (const m of made) assert.ok(Buffer.byteLength(String(m.content)) <= HEAD_BLOCK_LIMIT, `${m.note} fits`)
  assert.match(all, /<style data-tracy-brand-colours>/)
  assert.match(all, /<style data-tracy-leftovers>/)
  assert.match(all, /\.section-499 \.card-list \.card-item-499 a\.read-more:hover/, 'no colour rule dropped')
  assert.match(all, /demoVid0299/, 'no leftover rule dropped')
  assert.match(all, /#acm-teams-7 > div\.row\.g-0/, 'the card row that lost a card is centred')
  assert.ok(
    made.some((m) => m.note === 'tracy-brand-colours') && made.some((m) => m.note === 'tracy-leftovers'),
    'each part under its own note'
  )
  assert.ok(!notes.some((l) => /could not be put on the pages/.test(l)), notes.join('\n'))
})

test('a refused leftovers block never takes the brand colours with it, and the note names the block and its size', async () => {
  const site = fakeSite({ refuse: (content) => content.includes('data-tracy-leftovers') })
  const notes = []
  await writeOutsideMap({
    apply: site.apply,
    siteKey: 'groom',
    plan: planOf(groomer, ['demoVidA1']),
    reader: readerOf(bigTemplateCss(20)),
    contentMap: { slots: [], entities: [] },
    note: (l) => notes.push(l),
    applyId: 'outside-2'
  })
  const made = modulesWritten(site)
  assert.ok(
    made.some((m) => String(m.content).includes('data-tracy-brand-colours')),
    'colours written'
  )
  assert.ok(!made.some((m) => String(m.content).includes('data-tracy-leftovers')))
  assert.ok(
    notes.some((l) =>
      /demo-leftover styles could not be put on the pages, so the demo backgrounds and videos stay \(block tracy-leftovers, \d+ bytes, limit 65535\)/.test(
        l
      )
    ),
    notes.join('\n')
  )
})

test('packing keeps one copy of a rule read from several bundles, at its last place, and joins neighbours with the same declarations', () => {
  const once = '.a{color:red}\n.b{color:blue}\n@media (min-width:1px){.c{color:red}}'
  assert.deepEqual(packCss(`${once}\n${once}\n.d{color:blue}`), [
    '.a{color:red}',
    '.b{color:blue}',
    '@media (min-width:1px){.c{color:red}}',
    '.d{color:blue}'
  ])
  assert.deepEqual(packCss('.x{color:red}\n.y{color:red}\n.x{color:red}'), ['.y,\n.x{color:red}'])
  assert.deepEqual(cssRules('/* note */ a{b:c} "x{" '), ['/* note */ a{b:c}', '"x{"'])
})

test('a rule set over the limit is cut into marked blocks within it, every rule kept, a long selector list cut too', () => {
  const css = Array.from(
    { length: 4000 },
    (_, i) => `.row-${i} > .card:nth-child(${i % 7}){display:none !important}`
  ).join('\n')
  const blocks = blocksOf(css, {
    attr: 'data-tracy-leftovers',
    note: 'tracy-leftovers',
    title: 'Tracy leftovers'
  })
  assert.ok(blocks.length >= 2)
  for (const b of blocks) assert.ok(Buffer.byteLength(b.content) <= HEAD_BLOCK_LIMIT)
  assert.deepEqual(
    blocks.map((b) => b.note),
    blocks.map((_, i) => (i === 0 ? 'tracy-leftovers' : `tracy-leftovers-${i + 1}`))
  )
  const all = blocks.map((b) => b.content).join('\n')
  for (const i of [0, 1999, 3999]) assert.ok(all.includes(`.row-${i} > .card`), `row ${i}`)
  const parts = headBlocks({ leftovers: '', colours: '.x{color:var(--tracy-brand-0-text)}' })
  assert.deepEqual(
    parts.map((p) => [p.note, p.part]),
    [['tracy-brand-colours', 'colours']]
  )
})

test('a T3 head-code param the site refuses whole still takes the brand colours alone, and the note gives the size', async () => {
  const writes = []
  const notes = []
  const apply = async ({ action, params }) => {
    if (action === 'content.list')
      return (params.offset ?? 0) === 0 && params.kind === 'templateStyle'
        ? { ok: true, items: [{ id: 9, client_id: 0, template: 'site_template' }] }
        : { ok: true, items: [] }
    if (action === 'content.get')
      return {
        ok: true,
        item: { id: 9, params: { t3_template: '1', snippet_close_head: '<meta name="x">' } }
      }
    if (action === 'content.batch') return { ok: true }
    if (action === 'content.update') {
      const value = String(params.fields?.params ?? '')
      if (value.includes('data-tracy-leftovers')) return { ok: false, error: 'the params are too long' }
      writes.push(JSON.parse(value).snippet_close_head)
      return { ok: true }
    }
    return { ok: false, error: 'unknown' }
  }
  await writeOutsideMap({
    apply,
    siteKey: 'groom-t3',
    plan: planOf(groomer, ['demoVidB2']),
    reader: readerOf(bigTemplateCss(5)),
    contentMap: { slots: [], entities: [] },
    note: (l) => notes.push(l),
    applyId: 'outside-3'
  })
  assert.equal(writes.length, 1)
  assert.match(writes[0], /^<meta name="x">\n<!-- tracy-leftovers --><style data-tracy-brand-colours>/)
  assert.ok(
    notes.some((l) => /refused its head code \(\d+ bytes, limit 65535\)/.test(l)),
    notes.join('\n')
  )
})
