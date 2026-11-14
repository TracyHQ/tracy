// Article-body placeholders have no destination; real links and existing reviewed roles retain their behavior.
import assert from 'node:assert/strict'
import test from 'node:test'
import { proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'

const V3 = 'place-content-roles/3'
const url = (key, sample = '#', extra = {}) => ({
  key,
  entity: key.split('.')[0],
  column: 'introtext',
  type: 'url',
  sample,
  xpath: '/html/body/div/div/a/@href',
  ...extra
})
const propose = (slots, options = {}) =>
  proposeContentMapRoles({ slots }, { cms: 'joomla', vocabulary: V3, ...options }).contentMap.slots

test('unpaired article-body bare placeholders preserve all fields without inventing keep roles', () => {
  const slots = [url('article-71.1'), url('article-82.2', '#', { column: 'fulltext' })]
  const before = structuredClone(slots)
  assert.deepEqual(propose(slots), before)
  assert.deepEqual(slots, before)
})

test('real internal destinations and named fragments remain navigation links', () => {
  for (const sample of ['/services', 'index.php?Itemid=5', '?view=article&id=8', '#details']) {
    const [slot] = propose([url('article-71.1', sample)])
    assert.equal(slot.role, 'editorial.navigation_url')
    assert.equal(slot.customize, 'keep')
  }
})

test('article list navigation retains placeholder links and distinct repeat groups', () => {
  const slots = Array.from({ length: 13 }, (_, i) =>
    url(`article-71.${i}`, '#', { xpath: `/html/body/div/nav/ul/li[${i + 1}]/a/@href` })
  )
  const out = propose(slots)
  assert.equal(new Set(out.map((s) => s.group.id)).size, 13)
  for (const slot of out) {
    assert.equal(slot.role, 'editorial.navigation_url')
    assert.equal(slot.customize, 'keep')
  }
})

test('previously assigned article placeholder role and group survive capture carryover', () => {
  const slots = [
    url('article-71.1', '#', {
      role: 'editorial.navigation_url',
      customize: 'keep',
      group: { id: 'article-71.navigation.0', kind: 'business', item: 0 }
    })
  ]
  assert.deepEqual(propose(slots), slots)
})

test('module CTA and unpaired non-article URLs keep the existing branches', () => {
  const slots = [
    url('module-12.1', '#', { column: 'content', xpath: '/html/body/div/a/@href' }),
    {
      key: 'module-12.2',
      entity: 'module-12',
      column: 'content',
      type: 'text',
      sample: 'Visit us',
      xpath: '/html/body/div/a/text()'
    },
    url('category-9.1'),
    url('article-71.1', '#', { column: 'metadata' })
  ]
  const out = propose(slots)
  assert.equal(out[0].role, 'contact.cta_url')
  assert.equal(out[1].role, 'contact.cta_label')
  assert.equal(out[0].group.id, out[1].group.id)
  assert.equal(out[2].role, 'editorial.navigation_url')
  assert.equal(out[3].role, 'editorial.navigation_url')
})

test('version 2 keeps its prior absence of a placeholder navigation proposal', () => {
  const slots = [url('article-71.1')]
  assert.deepEqual(propose(slots, { vocabulary: 'place-content-roles/2' }), slots)
})
