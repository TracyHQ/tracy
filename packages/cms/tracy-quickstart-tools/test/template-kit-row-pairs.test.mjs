// Row pairs: which text slots of a block print inside the same card as a list row's picture. Measured in the browser on
// a fabricated class page (an intro clip printed alone, then three exercise cards, each with its picture, a heading and
// ticked lines), written on every list row as `pairedSlots` and `printsIn`, and counted by the `rowPartsUnpaired`
// self-check when a list mixes a lone row with card rows and a card row has no paired slot.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync, crc32 } from 'node:zlib'

import { chromium } from '@playwright/test'

import { measureFrames } from '../template-kit/lib/measure-frames.mjs'
import { pairListRows, rowPairChecks } from '../template-kit/lib/row-pairs.mjs'

function png(r, g, b) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, r, g, b, 255]))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// Cards 1 and 2 share their heading words: each heading slot must still land in its own card.
const HEADINGS = ['Warmup:', 'Warmup:', 'Cooldown:']
const exercise = (n) =>
  `<div class="col-12 col-md-6" style="width:45%"><div class="thumb"><img src="/images/thumb-${n}.png" style="width:100%;height:120px;display:block"></div><h3>${HEADINGS[n - 1]}</h3><ul><li>Drill ${n} first</li><li>Drill ${n} second</li></ul></div>`
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}</style></head><body>
<div id="Mod20" class="moduletable"><h2>Example class plan</h2>
<div class="intro"><img src="/images/intro.png" style="width:600px;height:300px;display:block"></div>
<div class="row" style="display:flex;flex-wrap:wrap;gap:10px">${[1, 2, 3].map(exercise).join('')}</div></div>
</body></html>`
const PICS = { 'intro.png': png(10, 10, 10) }
for (const n of [1, 2, 3]) PICS[`thumb-${n}.png`] = png(200, 60 * n, 40)

const image = (key, file, row) => ({
  key,
  entity: 'module-20',
  type: 'image',
  sample: `images/${file}`,
  group: { id: `module-20.clip.${row}`, item: row, kind: 'gallery' }
})
const text = (key, sample, group) => ({
  key,
  entity: 'module-20',
  type: 'text',
  sample,
  ...(group ? { group } : {})
})
const MAP = {
  entities: [],
  pages: [],
  slots: [
    text('module-20.1', 'Example class plan'),
    image('module-20.2', 'intro.png', 0),
    text('module-20.3', 'clip-id-0', { id: 'module-20.clip.0', item: 0, kind: 'gallery' }),
    ...[1, 2, 3].flatMap((n) => [
      image(`module-20.${n}0`, `thumb-${n}.png`, n),
      text(`module-20.${n}1`, HEADINGS[n - 1]),
      text(`module-20.${n}2`, `Drill ${n} first`),
      text(`module-20.${n}3`, `Drill ${n} second`)
    ])
  ]
}
const CAPTURE = {
  widths: [1440],
  pages: [{ slug: 'class', path: '/' }],
  blocks: { 'block-20': { id: 'block-20', source: 'module-20', widths: { 1440: { pages: ['class'] } } } }
}

async function serve() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/images\//, '')
    if (PICS[name]) {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(PICS[name])
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(PAGE)
  })
  await new Promise((r) => server.listen(0, 'localhost', r))
  return { server, site: `http://localhost:${server.address().port}` }
}

/** The kit list as kit-blocks.mjs builds it from MAP: one row per slot group. */
const kitOf = () => ({
  widths: [1440],
  checks: {},
  coverage: { parts: {}, failures: [] },
  blocks: [
    {
      id: 'block-20',
      lists: [
        {
          id: 'block-20.clip',
          rowKind: 'slots',
          rows: [0, 1, 2, 3].map((row) => ({
            index: row,
            slots: MAP.slots
              .filter((s) => s.group?.id === `module-20.clip.${row}`)
              .map((s) => ({ id: s.key.replace('module-', 'block-'), type: s.type }))
          }))
        }
      ]
    }
  ]
})

test('row pairs are measured in the browser: each card row pairs the text slots printed in its card', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
    await browser.close()
  } catch {
    return t.skip('no Chromium available')
  }
  const { server, site } = await serve()
  const out = mkdtempSync(join(tmpdir(), 'kit-row-pairs-'))
  try {
    const evidence = await measureFrames({ chromium, siteUrl: site, capture: CAPTURE, map: MAP, out })
    const kit = kitOf()
    pairListRows(kit, evidence)
    const list = kit.blocks[0].lists[0]
    assert.equal(list.rowPairsFrom, 'measured')
    assert.deepEqual(
      list.rows.map((r) => [r.printsIn, r.pairedSlots]),
      [
        ['block', []],
        ['DIV.col-12.col-md-6', ['block-20.11', 'block-20.12', 'block-20.13']],
        ['DIV.col-12.col-md-6', ['block-20.21', 'block-20.22', 'block-20.23']],
        ['DIV.col-12.col-md-6', ['block-20.31', 'block-20.32', 'block-20.33']]
      ],
      'the intro clip prints alone; each card pairs its own heading and lines, never the block title'
    )
    assert.equal(rowPairChecks(kit).rowPartsUnpaired, 0, 'every card row is paired')
  } finally {
    server.close()
    rmSync(out, { recursive: true, force: true })
  }
})

test('rowPartsUnpaired counts a mixed list whose card row pairs nothing, unless the pairs are declared', () => {
  const kit = kitOf()
  const rows = kit.blocks[0].lists[0].rows
  const parts = ['block', 'LI.card', 'LI.card', 'LI.card']
  rows.forEach((r, i) => Object.assign(r, { printsIn: parts[i], pairedSlots: i === 2 ? [] : [`x.${i}`] }))
  rows[0].pairedSlots = []
  kit.blocks[0].lists[0].rowPairsFrom = 'measured'
  kit.coverage.failures.push({ part: 'rowPartsUnpaired', where: 'stale', reason: 'old' })
  assert.equal(rowPairChecks(kit).rowPartsUnpaired, 1)
  assert.equal(kit.checks.rowPartsUnpaired, 1)
  assert.deepEqual(
    kit.coverage.failures.map((f) => [f.part, f.where]),
    [['rowPartsUnpaired', 'lists[block-20.clip]']],
    'the stale failure is replaced by the one found now'
  )
  assert.match(kit.coverage.failures[0].reason, /row 2/)

  kit.blocks[0].lists[0].rowPairsFrom = 'declared'
  assert.equal(rowPairChecks(kit).rowPartsUnpaired, 0, 'a person declared the pairs')
  assert.deepEqual(kit.coverage.failures, [])

  const allCards = kitOf()
  for (const r of allCards.blocks[0].lists[0].rows) Object.assign(r, { printsIn: 'LI.card', pairedSlots: [] })
  assert.equal(rowPairChecks(allCards).rowPartsUnpaired, 0, 'one part only: a plain gallery of cards')

  const unmeasured = kitOf()
  assert.equal(rowPairChecks(unmeasured).rowPartsUnpaired, 0, 'a kit measured before row pairs counts none')
})

test('pairListRows keeps declared pairs and leaves rows with no measured picture unmeasured', () => {
  const kit = kitOf()
  const list = kit.blocks[0].lists[0]
  list.rowPairsFrom = 'declared'
  list.rows[1].pairedSlots = ['block-20.11']
  list.rows[1].printsIn = 'DIV.card'
  pairListRows(kit, { 'block-20.10': { widths: { 1440: { rowCard: { printsIn: 'X', texts: [] } } } } })
  assert.deepEqual(
    list.rows[1].pairedSlots,
    ['block-20.11'],
    "a declared pair is a person's, never measured over"
  )

  const fresh = kitOf()
  pairListRows(fresh, {})
  assert.equal(fresh.blocks[0].lists[0].rowPairsFrom, undefined, 'nothing measured, nothing claimed')
  assert.equal(fresh.blocks[0].lists[0].rows[1].pairedSlots, undefined)
})
