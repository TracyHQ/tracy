// The alts of the site copy through the contract door (#369): only where the plugin on the site says it opens the slot, and
// only a gallery row's. Every word here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { correctionsReader, galleryAlts } from '../src/write-step/slot-corrections.js'
import { CONTRACT, copy, plan, runStep } from './_write-step-run.mjs'

const row = (n) => ({ id: `module-8.gallery.${n}`, item: n, kind: 'gallery' })
const slots = [
  { key: 'module-8.5', entity: 'module-8', type: 'image', sample: 'images/a.jpg', group: row(0) },
  {
    key: 'module-8.11',
    entity: 'module-8',
    type: 'text',
    sample: '',
    group: row(0),
    jsonPath: ['gallery', 'g', 'g[alt]', 0]
  },
  { key: 'module-8.6', entity: 'module-8', type: 'image', sample: 'images/b.jpg', group: row(1) },
  {
    key: 'module-8.12',
    entity: 'module-8',
    type: 'text',
    sample: '',
    group: row(1),
    jsonPath: ['gallery', 'g', 'g[alt]', 1]
  },
  { key: 'module-9.0', entity: 'module-9', type: 'image', sample: 'images/c.jpg' }
]
const CONTENT_MAP = { slots }
const ALTS = [
  { frame: 'block-8.5', text: 'A made-up coach beside a made-up court at the end of a made-up day.' },
  { frame: 'block-8.6', text: 'A made-up pool.' },
  { frame: 'block-9.0', text: 'A picture with no alt slot.' }
]
const takes = (contract = CONTRACT, alts = 6) => ({
  ok: true,
  info: { slot_corrections: { version: 1, contracts: { [contract]: { limits: 0, icons: 0, alts } } } }
})
const copyWithAlts = () => ({ ...copy(), alts: ALTS })
const run = (info, more = {}) =>
  runStep(
    { copy: copyWithAlts() },
    { info, extraKeys: ['module-8.11', 'module-8.12'], ...more },
    { contentMap: CONTENT_MAP }
  )
const altLine = (report, slot) => report.slots.find((s) => s.slot === slot)

test('a gallery alt goes in the one contract call when the plugin opens it', async () => {
  const { report, site } = await run(takes())
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const sent = site.applies().at(-1).params.changes
  assert.equal(sent['module-8.11'], ALTS[0].text)
  assert.equal(sent['module-8.12'], ALTS[1].text)
  assert.equal(altLine(report, 'block-8.11').status, 'written')
  assert.equal(altLine(report, 'block-8.11').ordered, ALTS[0].text)
  assert.equal(altLine(report, 'block-8.11').key, 'module-8.11')
  assert.equal(altLine(report, 'block-8.5'), undefined, 'its frame has no skipped line left')
})

test('a plan that hides the slot under a kept picture does not stop its alt: the slot prints nothing but the alt', async () => {
  const base = plan()
  const hiding = {
    ...base,
    sharedBlocks: [
      ...(base.sharedBlocks ?? []),
      {
        block: 'block-8',
        decision: 'keep',
        hiddenSlots: [{ slot: 'block-8.11', why: 'Pictures, not captions.' }]
      }
    ]
  }
  const { report, site } = await runStep(
    { copy: copyWithAlts(), plan: hiding },
    { info: takes(), extraKeys: ['module-8.11', 'module-8.12'] },
    { contentMap: CONTENT_MAP }
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(site.applies().at(-1).params.changes['module-8.11'], ALTS[0].text)
  assert.equal(altLine(report, 'block-8.11').status, 'written')
  assert.equal(altLine(report, 'block-8.11').ordered, ALTS[0].text)
})

test('an alt with no slot beside its picture keeps its skipped line', async () => {
  const { report, site } = await run(takes())
  const line = altLine(report, 'block-9.0')
  assert.equal(line.status, 'skipped')
  assert.equal(line.part, 'alt')
  assert.match(line.reason, /alt text is not written yet/)
  assert.ok(!Object.values(site.applies().at(-1).params.changes).includes(ALTS[2].text))
})

for (const [why, info] of [
  ['an older plugin', { ok: true, info: { hide_ops: { version: 1 } } }],
  ['a plugin that corrects another contract', takes('other/j6/1.0.0')],
  ['a plugin whose list opens no alt here', takes(CONTRACT, 0)],
  ['a plugin that cannot answer', { ok: false, error: 'busy' }]
])
  test(`${why} keeps today's skipped lines and sends no alt`, async () => {
    const { report, site } = await run(info)
    for (const frame of ['block-8.5', 'block-8.6', 'block-9.0']) {
      assert.equal(altLine(report, frame).status, 'skipped')
      assert.match(altLine(report, frame).reason, /alt text is not written yet/)
    }
    const sent = site.applies().at(-1)?.params.changes ?? {}
    assert.equal(sent['module-8.11'], undefined)
    assert.equal(sent['module-8.12'], undefined)
  })

test('an alt the plugin refuses fails in its words, and the refusal stands on the slot', async () => {
  const refuse = {
    'module-8.11': {
      key: 'module-8.11',
      code: 'SLOT_NOT_CONTENT',
      message: 'A double quote breaks this picture alt'
    }
  }
  const { report } = await run(takes(), { refuse })
  const line = altLine(report, 'block-8.11')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /double quote/)
  assert.equal(altLine(report, 'block-8.12').status, 'written')
})

test('the site check reads a written alt back on its slot', async () => {
  const { report, site } = await run(takes())
  const held = site.applies().at(-1).params.changes
  const door = {
    async apply(call) {
      const answer = await site.door.apply(call)
      if (call.action !== 'content.contract') return answer
      return {
        ...answer,
        slots: answer.slots.map((s) => ({ ...s, type: 'text', current: held[s.key] ?? s.current }))
      }
    }
  }
  const check = await runSiteCheck({ door, report })
  assert.equal(check.groups.find((g) => g.name === 'read-back').lines['block-8.11'], 'match')
  assert.equal(check.groups.find((g) => g.name === 'read-back').lines['block-8.12'], 'match')
})

test('the frame a file hides keeps its alt out of the call', () => {
  const out = galleryAlts({
    alts: { 'block-8.5': 'One', 'block-8.6': 'Two' },
    contentMap: CONTENT_MAP,
    hidden: new Set(['block-8.5']),
    file: 'copy.json'
  })
  assert.deepEqual(out.changes, { 'module-8.12': 'Two' })
  assert.deepEqual(out.left, { 'block-8.5': 'One' })
  assert.deepEqual(
    out.claims.map((c) => [c.slot, c.owner, c.kind]),
    [['block-8.12', 'writer', 'text']]
  )
})

test('with no content map no alt can be placed', () => {
  const out = galleryAlts({
    alts: { 'block-8.5': 'One' },
    contentMap: null,
    hidden: new Set(),
    file: 'copy.json'
  })
  assert.deepEqual(out.changes, {})
  assert.deepEqual(out.left, { 'block-8.5': 'One' })
})

test('the plugin is asked once a run, and a door that throws reads as an older plugin', async () => {
  let asked = 0
  const door = {
    async apply() {
      asked += 1
      return takes()
    }
  }
  const read = correctionsReader(door, 'site', CONTRACT)
  assert.deepEqual(await read(), { icons: false, alts: true })
  await read()
  assert.equal(asked, 1)
  const broken = correctionsReader({ apply: () => Promise.reject(new Error('gone')) }, 'site', CONTRACT)
  assert.deepEqual(await broken(), { icons: false, alts: false })
})

// Step 8's alts (ADR 0043 section 3f): the picture step writes the alt of each picture it placed, from that picture, and
// the write step sends it over the writer's, who wrote from the wish before any picture was chosen.
const picturesWithAlts = (alts) => ({
  mapping: {
    contract: CONTRACT,
    revision: 'a picture run',
    changes: {},
    evidence: {},
    pending: [],
    emptyLinks: []
  },
  uploads: [],
  hidden: [],
  painted: [],
  siteSettings: [],
  alts,
  problems: []
})
const runWithPictures = (alts, info = takes()) =>
  runStep(
    { copy: copyWithAlts(), pictures: picturesWithAlts(alts) },
    { info, extraKeys: ['module-8.11', 'module-8.12'] },
    { contentMap: CONTENT_MAP }
  )

test('the alt step 8 wrote from the placed picture goes over the writer alt; the writer keeps the frames step 8 left', async () => {
  const seen = 'A made-up lifeguard chair beside a made-up pool at noon.'
  const { report, site } = await runWithPictures({ 'block-8.5': seen })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const sent = site.applies().at(-1).params.changes
  assert.equal(sent['module-8.11'], seen)
  assert.equal(sent['module-8.12'], ALTS[1].text, 'step 8 wrote no alt here: the writer alt stands')
  assert.equal(altLine(report, 'block-8.11').owner, 'picture')
  assert.equal(altLine(report, 'block-8.11').ordered, seen)
  assert.equal(altLine(report, 'block-8.12').owner, 'writer')
})

test('a step 8 alt for a frame the writer gave none is still written, and a plugin that opens no alt sends none', async () => {
  const copyless = await runStep(
    { copy: { ...copy(), alts: [] }, pictures: picturesWithAlts({ 'block-8.6': 'A made-up pool at dusk.' }) },
    { info: takes(), extraKeys: ['module-8.11', 'module-8.12'] },
    { contentMap: CONTENT_MAP }
  )
  assert.equal(copyless.site.applies().at(-1).params.changes['module-8.12'], 'A made-up pool at dusk.')
  const closed = await runWithPictures({ 'block-8.5': 'A made-up chair.' }, takes(CONTRACT, 0))
  assert.equal(closed.site.applies().at(-1)?.params.changes['module-8.11'], undefined)
  assert.equal(altLine(closed.report, 'block-8.5').status, 'skipped')
})
