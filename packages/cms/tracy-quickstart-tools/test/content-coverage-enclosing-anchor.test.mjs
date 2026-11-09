import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { listingListsOf } from '../content-coverage/lib/listing-lists.mjs'

// Synthetic card records exercise the enclosing-anchor shape; no capture or route-count claim.
const saved = JSON.parse(
  readFileSync(new URL('./fixtures/kinetic-r6-enclosing-anchor.json', import.meta.url))
)
const fixture = () => structuredClone(saved)
const run = (f) => listingListsOf({ map: f.map, lock: f.lock, findings: { pages: [f.page] } })
const target = '/index.php/product/blog/134-continuous-profiling-intro'
const article = (result) => result.itemPages['article-134']

test('a card retains its enclosing anchor route and owning blog, without changing saved records', () => {
  const f = fixture(),
    before = structuredClone(f)
  const result = run(f)
  assert.deepEqual(article(result), {
    path: target,
    category: 'category-22',
    categoryPage: 'menuItem-221',
    categoryRoute: 'product/blog',
    linkedFrom: ['menuItem-221']
  })
  assert.deepEqual(result.itemLists['menuItem-221.items'].rowSlots.find((r) => r.field === 'link').items, [
    { item: 'article-134', path: target }
  ])
  assert.deepEqual(f, before)
})

test('a directly linked title keeps its established path', () => {
  const f = fixture()
  f.page.items[0].href = '/direct-title'
  assert.equal(article(run(f)).path, '/direct-title')
})

test('the same ancestor can be established from phone evidence when desktop is hidden', () => {
  const f = fixture()
  for (const it of f.page.items) it.viewports.desktop.visible = false
  assert.equal(article(run(f)).path, target)
})

const reject = (name, change) =>
  test(name, () => {
    const f = fixture()
    change(f)
    assert.equal(article(run(f)), undefined)
  })

reject('a nearby link with the same box but a different ancestor selector cannot own the card', (f) => {
  for (const v of Object.values(f.page.items[2].viewports)) v.selector = v.selector.replace('(4)', '(5)')
})
reject('a matching selector at another position cannot own the measured card', (f) => {
  for (const v of Object.values(f.page.items[2].viewports)) v.rect.y += 500
})
reject('a missing per-viewport selector cannot borrow a top-level merged selector', (f) => {
  for (const v of Object.values(f.page.items[2].viewports)) delete v.selector
})
reject('the same single id selector is not evidence of an ancestor', (f) => {
  for (const it of f.page.items) for (const v of Object.values(it.viewports)) v.selector = '#same'
})
reject('a merged anchor with repeated copies cannot borrow union scopes or the first rectangle', (f) => {
  for (const v of Object.values(f.page.items[2].viewports)) v.count = 2
})
reject('merged text copies cannot supply descendant ownership', (f) => {
  for (const it of f.page.items.slice(0, 2)) for (const v of Object.values(it.viewports)) v.count = 2
})
reject('phone disagreement cannot be hidden by a matching desktop rectangle', (f) => {
  f.page.items[2].viewports.phone.rect.x += 500
})
reject('incomplete anchor geometry cannot establish containment', (f) => {
  delete f.page.items[2].viewports.phone.rect.x
})
reject('non-finite descendant geometry cannot establish containment', (f) => {
  for (const it of f.page.items.slice(0, 2)) it.viewports.phone.rect.y = Number.NaN
})
reject('a zero-sized anchor cannot establish containment', (f) => {
  f.page.items[2].viewports.phone.rect.w = 0
})
reject('a nav anchor is not a content card even when union homes include the body', (f) => {
  Object.assign(f.page.items[2], { role: 'nav', bodyRole: 'content', homes: ['Mod90', ''] })
})
reject('a module anchor outside the body pool cannot supply the listing path', (f) => {
  f.page.items[2].homes = ['Mod90']
})
reject('conflicting routes for the same enclosing selector remain unknown', (f) => {
  const other = structuredClone(f.page.items[2])
  other.value = '/another-detail'
  f.page.items.push(other)
})
reject('an external enclosing link cannot become an internal itemPage', (f) => {
  f.page.items[2].value = 'https://other.invalid' + target
})
reject('a non-anchor embed cannot own a card', (f) => {
  f.page.items[2].source = 'iframe'
  f.page.items[2].tag = 'iframe'
})
reject('one enclosing anchor shared by different article cards is ambiguous', (f) => {
  f.map.entities.push({
    key: 'article-999',
    kind: 'article',
    sourceId: 999,
    identityReferences: { catid: 'category-22' }
  })
  f.map.slots.push({ ...f.map.slots[0], key: 'article-999.0', entity: 'article-999' })
  const other = structuredClone(f.page.items[0])
  other.slots = ['article-999.0']
  f.page.items.push(other)
  assert.equal(run(f).itemPages['article-999'], undefined)
})
