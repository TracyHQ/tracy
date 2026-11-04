// Rewriting page settings (ADR 0044, decisions 4 and 6): a title, a description and a contact line are written alone when they
// differ, and a page's other settings stay as read. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptSite, menuRow, runInTurn } from './_write-step-rewrite.mjs'
import { copy, fakeSite, frozenFiles, KIT } from './_write-step-run.mjs'

const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)

const settingsKit = () => {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/about-us/coach' }
  ]
  kit.doc.site = {
    ...kit.doc.site,
    settingSlots: [
      {
        id: 'contact-1.mobile',
        kind: 'contact-mobile',
        writable: true,
        writeTo: { entity: 'contact-1', column: 'mobile' }
      }
    ]
  }
  return kit
}
const records = () => [
  menuRow(101, { home: 1, path: 'home' }),
  menuRow(102, { path: 'about-us/coach' }),
  { kind: 'contact', id: 1, mobile: '' }
]
const withMobile = (c = copy(), mobile = '+000 555 0199') => {
  c.slots.push({ slot: 'contact-1.mobile', owner: 'writer', text: mobile, factIds: [] })
  return c
}

test('nothing is written again when nothing differs, and each line can still be read back', async () => {
  const kept = keptSite(fakeSite({ records: records() }), { kit: settingsKit() })
  const [, second] = await runInTurn(kept, [{ copy: withMobile() }, { copy: withMobile() }])
  assert.deepEqual(kept.writes(), [])
  for (const slot of ['page-home:title', 'page-home:description', 'contact-1.mobile']) {
    const line = lineOf(second, slot)
    assert.deepEqual([line.status, line.unchanged], ['written', true], slot)
    assert.ok(line.readFrom && line.ordered, slot)
  }
})

test('an unchanged run does not even read the menu', async () => {
  const kept = keptSite(fakeSite({ records: records() }), { kit: settingsKit() })
  await runInTurn(kept, [{}, {}])
  assert.equal(kept.calls().filter((c) => c.action === 'content.list').length, 0)
})

test('a changed page title writes that one field and keeps the rest of the item as it is', async () => {
  const site = fakeSite({ records: records() })
  const kept = keptSite(site, { kit: settingsKit() })
  const c = copy()
  c.seo[0].title = 'Quay Fitness Studio, small classes'
  const [first, second] = await runInTurn(kept, [{}, { copy: c }])
  const writes = kept.writes()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].params.id, 101)
  const held = JSON.parse(site.records.get('menuItem-101').params)
  assert.equal(held.page_title, 'Quay Fitness Studio, small classes')
  assert.equal(held['menu-meta_description'], lineOf(first, 'page-home:description').ordered)
  assert.equal(held.show_icon, 1)
  assert.equal(lineOf(second, 'page-home:title').unchanged, undefined)
  assert.equal(lineOf(second, 'page-home:description').unchanged, true)
  assert.equal(lineOf(second, 'page-about:title').unchanged, true)
})

test('a changed contact line writes that row alone', async () => {
  const site = fakeSite({ records: records() })
  const kept = keptSite(site, { kit: settingsKit() })
  await runInTurn(kept, [{ copy: withMobile() }, { copy: withMobile(copy(), '+000 555 0123') }])
  assert.equal(kept.writes().length, 1)
  assert.equal(site.records.get('contact-1').mobile, '+000 555 0123')
})

test('a title the door refused last time is retried', async () => {
  const script = {
    records: records(),
    refuseUpdate: (kind) => (kind === 'menuItem' ? { ok: false, error: 'locked', message: 'no' } : null)
  }
  const kept = keptSite(fakeSite(script), { kit: settingsKit() })
  const frozen = frozenFiles({})
  try {
    const first = await kept.run(frozen.files)
    assert.equal(lineOf(first, 'page-home:title').status, 'failed')
    script.refuseUpdate = () => null
    const second = await kept.run(frozen.files, first)
    assert.equal(lineOf(second, 'page-home:title').status, 'written')
    assert.equal(lineOf(second, 'page-home:title').unchanged, undefined)
  } finally {
    frozen.done()
  }
})

const articleKit = () => {
  const kit = settingsKit()
  kit.doc.blocks = [
    ...(kit.doc.blocks ?? []),
    { id: 'article-7-body', source: { owner: 'article-7', ownerKind: 'article' } }
  ]
  kit.doc.pages.push({ id: 'page-spin', path: '/classes/spin', blocks: { 1440: ['article-7-body'] } })
  return kit
}
const articleRow = () => ({
  kind: 'article',
  id: 7,
  metadesc: '',
  attribs: JSON.stringify({ show_title: '1' })
})
const withSpin = (description = 'Spin on the quay.', title = 'Spin classes at Quay') => {
  const c = copy()
  c.seo.push({ page: 'page-spin', title, description })
  return c
}

test('an article page is not written again when its title and description are the same', async () => {
  const kept = keptSite(fakeSite({ records: [...records(), articleRow()] }), { kit: articleKit() })
  const [first, second] = await runInTurn(kept, [{ copy: withSpin() }, { copy: withSpin() }])
  assert.equal(lineOf(first, 'page-spin:title').status, 'written')
  assert.deepEqual(kept.writes(), [])
  for (const slot of ['page-spin:title', 'page-spin:description']) {
    const line = lineOf(second, slot)
    assert.deepEqual([line.status, line.unchanged], ['written', true], slot)
    assert.deepEqual(line.readFrom.params, { kind: 'article', id: 7 }, slot)
  }
})

test('a new description of an article page is written alone', async () => {
  const kept = keptSite(fakeSite({ records: [...records(), articleRow()] }), { kit: articleKit() })
  const [, second] = await runInTurn(kept, [
    { copy: withSpin() },
    { copy: withSpin('New words on the quay.') }
  ])
  const writes = kept.writes().filter((c) => c.params?.kind === 'article')
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].params.fields, { metadesc: 'New words on the quay.' })
  assert.equal(lineOf(second, 'page-spin:title').unchanged, true)
  assert.equal(lineOf(second, 'page-spin:description').unchanged, undefined)
})
