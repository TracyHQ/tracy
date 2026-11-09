// Every stored field is in the kit, with what a measurement found it drives on the page. A field driving more than one
// control is named by the gate. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onlySlots, writeFieldDrives } from '../template-kit/cli.mjs'
import { coverageGate } from '../template-kit/lib/coverage-gate.mjs'
import { measurableFields, measureFieldDrives } from '../template-kit/lib/field-drives.mjs'
import { joomlaFieldWriter } from '../template-kit/lib/site/adapters/joomla-field-writer.mjs'
import { pagesOfEntity } from '../template-kit/lib/site/measure-fields.mjs'
import { settleSlotRoles } from '../template-kit/lib/slot-roles.mjs'
import { settleStoredFields } from '../template-kit/lib/stored-fields.mjs'

const MAP = {
  entities: [],
  slots: [
    {
      key: 'article-3.0',
      entity: 'article-3',
      column: 'title',
      type: 'text',
      role: 'offering.name',
      sample: 'Crawl'
    },
    {
      key: 'article-3.1',
      entity: 'article-3',
      column: 'attribs',
      jsonPath: ['lead-title'],
      type: 'text',
      role: 'editorial.heading',
      sample: 'Crawl'
    },
    {
      key: 'article-3.2',
      entity: 'article-3',
      column: 'attribs',
      jsonPath: ['signup-link'],
      type: 'text',
      role: 'editorial.button_label',
      sample: '#'
    },
    {
      key: 'module-4.0',
      entity: 'module-4',
      column: 'params',
      jsonPath: ['rows', 'title', 2],
      type: 'text',
      sample: 'Lessons'
    },
    {
      key: 'module-4.1',
      entity: 'module-4',
      column: 'content',
      type: 'text',
      xpath: '/html/body/p/text()',
      sample: 'A piece of HTML'
    }
  ]
}
const kit = () => ({
  errors: [],
  checks: {},
  site: {},
  pages: [],
  blocks: [
    { id: 'body-crawl', slots: [{ id: 'article-3.0', type: 'text' }] },
    {
      id: 'block-4',
      lists: [{ id: 'block-4.rows', rowSlots: [{ id: 'block-4.0', type: 'text' }] }]
    }
  ]
})
const control = (page, tag, attribute, at) => ({ page, tag, attribute, at })

test('the kit lists every stored field, by name, and says which the kit lists nowhere', () => {
  const k = kit()
  settleStoredFields(k, { map: MAP })
  const byId = new Map(k.storedFields.map((f) => [f.slot, f]))
  assert.equal(k.storedFields.length, 5)
  assert.equal(byId.get('article-3.2').field, 'attribs.signup-link')
  assert.equal(byId.get('article-3.2').listedIn, null)
  assert.equal(byId.get('article-3.0').listedIn, 'body-crawl')
  assert.equal(byId.get('block-4.0').field, 'params.rows.title.2')
  assert.equal(byId.get('block-4.0').listedIn, 'block-4')
})

test('the field names no id a plan or copy check reads', () => {
  const k = kit()
  settleStoredFields(k, { map: MAP })
  assert.ok(k.storedFields.every((f) => !('id' in f) && !('role' in f && f.role === undefined)))
})

test('a measured field carries what it drives, and an unmeasured one says so', () => {
  const k = kit()
  settleStoredFields(k, {
    map: MAP,
    drives: { 'article-3.1': { controls: [control('/crawl', 'div', 'text', 0)] } }
  })
  const byId = new Map(k.storedFields.map((f) => [f.slot, f]))
  assert.deepEqual(byId.get('article-3.1').drives, [control('/crawl', 'div', 'text', 0)])
  assert.equal(byId.get('article-3.0').drives, undefined)
})

test('the gate names a field driving more than one control, and how much was measured', () => {
  const k = kit()
  const a = control('/crawl', 'a', 'href', 0)
  const b = control('/crawl', 'a', 'href', 1)
  settleStoredFields(k, {
    map: MAP,
    drives: {
      'article-3.2': { controls: [a, b] },
      'article-3.1': { controls: [control('/crawl', 'div', 'text', 0)] }
    }
  })
  coverageGate(k, { map: MAP })
  const report = k.coverage.fields
  assert.deepEqual(report.drivingSeveralControls, [
    { slot: 'article-3.2', field: 'attribs.signup-link', controls: [a, b] }
  ])
  assert.deepEqual([report.total, report.measured, report.notListed], [5, 2, 3])
  // A report, not a failure: a field may rightly drive two buttons, and a person reads it.
  assert.equal(k.coverage.parts.fieldsDrivingSeveralControls, undefined)
})

test('a kit with no stored fields reports nothing', () => {
  const k = kit()
  coverageGate(k, { map: MAP })
  assert.equal(k.coverage.fields, undefined)
})

test('a piece of stored HTML is not a field a measurement can set whole', () => {
  assert.deepEqual(
    measurableFields(MAP).map((s) => s.key),
    ['article-3.0', 'article-3.1', 'article-3.2', 'module-4.0']
  )
  // A field whose whole value is one element (a title with a line break in it) can.
  const whole = { key: 'a.0', type: 'text', xpath: '/html/body/div', sample: 'Crawl' }
  assert.deepEqual(measurableFields({ slots: [whole] }), [whole])
})

// A stand in memory: what each stored field prints where, as a template would.
function fakeSite(prints) {
  const values = new Map()
  const log = []
  return {
    log,
    set(field, value) {
      log.push(`set ${field.key}`)
      values.set(field.key, value)
    },
    restore(field) {
      log.push(`restore ${field.key}`)
      values.delete(field.key)
    },
    read(path, marker) {
      const key = [...values].find(([, v]) => v === marker)?.[0]
      return (prints[key] ?? []).filter((c) => c.page === path)
    }
  }
}

test('the measurement sets each field alone, reads its pages, and puts it back', async () => {
  const site = fakeSite({
    'article-3.1': [{ ...control('/crawl', 'div', 'text', 0), title: true }],
    'article-3.2': [control('/crawl', 'a', 'href', 0), control('/crawl', 'a', 'href', 1)]
  })
  const fields = MAP.slots.slice(0, 3)
  const drives = await measureFieldDrives({ fields, pagesOf: () => ['/crawl'], site })
  assert.equal(drives['article-3.1'].controls[0].title, true)
  assert.equal(drives['article-3.2'].controls.length, 2)
  assert.deepEqual(drives['article-3.0'].controls, [])
  assert.deepEqual(site.log, [
    'set article-3.0',
    'restore article-3.0',
    'set article-3.1',
    'restore article-3.1',
    'set article-3.2',
    'restore article-3.2'
  ])
})

test('a field is put back even when reading its page fails, and the failure is said', async () => {
  const site = fakeSite({})
  site.read = () => {
    throw new Error('page gone')
  }
  const drives = await measureFieldDrives({ fields: MAP.slots.slice(0, 1), pagesOf: () => ['/crawl'], site })
  assert.deepEqual(site.log, ['set article-3.0', 'restore article-3.0'])
  assert.equal(drives['article-3.0'].controls, undefined)
  assert.match(drives['article-3.0'].error, /page gone/)
})

test('the Joomla writer changes one JSON field, keeps the rest and puts the stored bytes back', () => {
  const stored = { attribs: '{"keep":"x","signup-link":"#"}' }
  const sent = []
  const writer = joomlaFieldWriter({
    prefix: 'x_',
    entities: [{ key: 'article-3', kind: 'article', sourceId: 3 }],
    select: (sql) => {
      sent.push(sql)
      return [{ value: stored.attribs }]
    },
    write: (sql) => sent.push(sql)
  })
  const field = MAP.slots[2]
  writer.set(field, 'MARK')
  const update = sent.find((q) => q.startsWith('UPDATE'))
  const hex = /x'([0-9a-f]+)'/.exec(update)[1]
  // Columns are quoted: an article body sits in `fulltext`, a MySQL keyword.
  assert.equal(sent[0], 'SELECT `attribs` AS value FROM x_content WHERE id=3')
  assert.match(update, /^UPDATE x_content SET `attribs`=x'[0-9a-f]+' WHERE id=3$/)
  assert.deepEqual(JSON.parse(Buffer.from(hex, 'hex').toString()), { keep: 'x', 'signup-link': 'MARK' })
  writer.restore(field)
  const back = /x'([0-9a-f]+)'/.exec(sent.at(-1))[1]
  assert.equal(Buffer.from(back, 'hex').toString(), stored.attribs)
})

test('the Joomla writer sets a field inside a nested JSON string (an ACM module) and keeps that string a string', () => {
  const inner = { hero: { 'hero-style[hero-title]': ['We are Symphony.'], keep: 1 } }
  const stored = JSON.stringify({ 'jatools-layout-hero': 'style-1', 'jatools-config': JSON.stringify(inner) })
  const sent = []
  const writer = joomlaFieldWriter({
    prefix: 'x_',
    entities: [{ key: 'module-95', kind: 'module', sourceId: 95 }],
    select: () => [{ value: stored }],
    write: (sql) => sent.push(sql)
  })
  const field = {
    key: 'module-95.0',
    entity: 'module-95',
    column: 'params',
    nestedJson: 'jatools-config',
    jsonPath: ['hero', 'hero-style[hero-title]', 0]
  }
  writer.set(field, 'MARK')
  const doc = JSON.parse(Buffer.from(/x'([0-9a-f]+)'/.exec(sent[0])[1], 'hex').toString())
  assert.deepEqual(Object.keys(doc), ['jatools-layout-hero', 'jatools-config'])
  assert.deepEqual(JSON.parse(doc['jatools-config']), {
    hero: { 'hero-style[hero-title]': ['MARK'], keep: 1 }
  })
  writer.restore(field)
  assert.equal(Buffer.from(/x'([0-9a-f]+)'/.exec(sent.at(-1))[1], 'hex').toString(), stored)
})

test('the Joomla writer reaches a tag title, and a partial run measures only the slots asked for', () => {
  // JA Kinetic j6 1.0.11 tag pages print "Tagged: <tag title>" as their h1: the tag title is the page title slot.
  const sent = []
  const writer = joomlaFieldWriter({
    prefix: 'x_',
    entities: [{ key: 'tag-6', kind: 'tag', sourceId: 6 }],
    select: (sql) => (sent.push(sql), [{ value: 'incident' }]),
    write: (sql) => sent.push(sql)
  })
  writer.set({ key: 'tag-6.0', entity: 'tag-6', column: 'title' }, 'MARK')
  assert.equal(sent[0], 'SELECT `title` AS value FROM x_tags WHERE id=6')
  const map = { slots: [{ key: 'tag-6.0' }, { key: 'article-3.0' }, { key: 'tag-7.0' }] }
  assert.deepEqual(
    onlySlots(map, 'tag-').slots.map((s) => s.key),
    ['tag-6.0', 'tag-7.0']
  )
  assert.equal(onlySlots(map, undefined), map)
})

test('the Joomla writer refuses an entity kind it has no table for', () => {
  const writer = joomlaFieldWriter({
    prefix: 'x_',
    entities: [{ key: 'thing-1', kind: 'thing', sourceId: 1 }],
    select: () => [],
    write: () => assert.fail('nothing may be written')
  })
  assert.throws(() => writer.set({ key: 'thing-1.0', entity: 'thing-1', column: 'c' }, 'M'), /no table/)
})

test('settling a written kit only adds: every id, list and role stays, and the gate is counted again', () => {
  const k = kit()
  k.pages = [
    {
      id: 'page-crawl',
      path: '/crawl',
      blocks: { 1440: ['body-crawl'] },
      h1: { via: 'template', text: 'Nothing' }
    }
  ]
  k.coverage = {
    parts: { orphanTexts: 1 },
    failures: [{ part: 'orphanTexts', where: 'old', reason: 'stays' }]
  }
  k.checks.slotCoverage = 1
  const before = structuredClone(k)
  const r = settleSlotRoles(k, { map: MAP })
  assert.deepEqual(k.blocks[0].slots[0].id, before.blocks[0].slots[0].id)
  assert.deepEqual(k.blocks[1].lists[0].rowSlots, before.blocks[1].lists[0].rowSlots)
  assert.deepEqual(k.pages[0].h1, before.pages[0].h1)
  assert.equal(k.coverage.parts.pageTitleSlots, 1)
  assert.equal(k.coverage.failures.length, 2)
  assert.equal(k.checks.slotCoverage, 2)
  assert.equal(r.pageTitleSlots, 1)
  settleSlotRoles(k, { map: MAP })
  assert.equal(k.coverage.failures.length, 2, 'settling twice does not count twice')
})

test('the pages of an entity read a list that counts its rows, not only one that names its items', () => {
  const kit = {
    pages: [
      { path: '/lessons', blocks: { 1440: ['block-1'] } },
      { path: '/rates', blocks: { 1440: ['block-2'] } }
    ],
    blocks: [
      { id: 'block-1', lists: [{ id: 'block-1.rows', shown: ['article-3'] }] },
      {
        id: 'block-2',
        lists: [
          { id: 'block-2.rows', shown: 0 },
          { id: 'block-2.more', shown: 4 }
        ]
      }
    ]
  }
  assert.deepEqual(pagesOfEntity(kit, {})({ entity: 'article-3' }), ['/lessons'])
})

test('partial field measurements replace selected results and keep the others on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'field-drives-'))
  const file = join(dir, 'field-drives.json')
  const read = () => JSON.parse(readFileSync(file, 'utf8'))
  try {
    writeFieldDrives(file, { 'tag-6.0': { controls: [] }, 'article-3.0': { error: 'retained' } }, false)
    const next = { 'tag-6.0': { controls: [{ page: '/tag', tag: 'h1' }] } }
    writeFieldDrives(file, next, true)
    assert.deepEqual(read(), { ...next, 'article-3.0': { error: 'retained' } })
    writeFieldDrives(file, next, false)
    assert.deepEqual(read(), next)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
