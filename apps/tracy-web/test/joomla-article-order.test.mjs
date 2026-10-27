/**
 * The demo's article order is pinned before a build writes (TCH #1013). Measured 10/10/2026: 25 Joomla releases ship articles
 * of one category with the same sort key, so Previous/Next and an articles list follow whatever order the database answers
 * ties in. On dev g59-ess-j-full (JA Essence j6 1.0.4) layout-1 (article 23) lost its "Next" (24), and a BLANK site listed its
 * related articles in another order than the demo. Joomla's default sort is `rdate` on `publish_up`, and Health's articles
 * 13-15, 18 and 21-26 share one time; the demo serves the ties by id.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  byRule,
  DEFAULT_RULE,
  neighboursOf,
  orderSteps,
  rulesOf
} from '../src/sites/brief-engines/joomla-article-order.js'
import { essenceArticles, essenceSite, runEssence } from './_joomla-essence-site.mjs'

/** What a site answers once a write reshuffled the ties: the key, then the id backwards. */
const reshuffled = (/** @type {any[]} */ list, /** @type {number} */ id) => {
  const of = list.find((a) => a.id === id)
  const order = list
    .filter((a) => String(a.catid) === String(of.catid) && Number(a.state) === 1)
    .sort((a, b) => byRule(DEFAULT_RULE)(a, b) || 0)
    .sort((a, b) => {
      const t = (x) => Date.parse(`${String(x.publish_up).replace(' ', 'T')}Z`)
      return t(b) - t(a) || b.id - a.id
    })
    .map((a) => a.id)
  const at = order.indexOf(id)
  return [order[at - 1] ?? null, order[at + 1] ?? null]
}
const applySteps = (/** @type {any[]} */ list, /** @type {any[]} */ steps) =>
  list.map((a) => {
    const step = steps.find((s) => s.id === a.id)
    return step ? { ...a, ...step.fields } : a
  })

test('JA Essence 1.0.4: the demo serves layout-1 between 22 and 24; a reshuffle of the tied dates loses that', () => {
  const articles = essenceArticles()
  assert.deepEqual(neighboursOf(articles, 23), [22, 24], 'the demo’s own neighbours')
  assert.notDeepEqual(reshuffled(articles, 23), [22, 24], 'tied, another tie order moves them')
})

test('pinned: Health’s tied dates become seconds apart in the demo’s order, so any tie order serves 22 and 24', () => {
  const articles = essenceArticles()
  const { steps, left } = orderSteps(articles)
  assert.deepEqual(left, [])
  assert.ok(steps.length > 0 && steps.every((s) => Object.keys(s.fields).join() === 'publish_up'))
  const after = applySteps(articles, steps)
  assert.deepEqual(reshuffled(after, 23), [22, 24])
  // Only tied articles are written, and each category keeps the demo's whole order.
  for (const s of steps) {
    const a = articles.find((x) => x.id === s.id)
    assert.ok(articles.some((b) => b.id !== a.id && b.catid === a.catid && b.publish_up === a.publish_up))
  }
  for (const cat of new Set(articles.map((a) => a.catid))) {
    const before = articles
      .filter((a) => a.catid === cat)
      .sort(byRule(DEFAULT_RULE))
      .map((a) => a.id)
    const now = after
      .filter((a) => a.catid === cat)
      .sort(byRule(DEFAULT_RULE))
      .map((a) => a.id)
    assert.deepEqual(now, before, `category ${cat} keeps the demo’s order`)
  }
})

test('the rule is the category entry’s, else com_content’s, else Joomla’s; ordering ties become 1…n', () => {
  const rows = [
    {
      id: 2,
      type: 'component',
      published: 1,
      link: 'index.php?option=com_content&view=category&id=5',
      params: JSON.stringify({ orderby_sec: 'order' })
    }
  ]
  const rules = rulesOf(rows, { orderby_sec: 'alpha' })
  assert.deepEqual(rules(5), { key: 'ordering', desc: false })
  assert.deepEqual(rules(6), { key: 'title', desc: false })
  assert.deepEqual(rulesOf([], null)(6), DEFAULT_RULE)
  const { steps, left } = orderSteps(
    [
      { id: 3, catid: 5, ordering: 1 },
      { id: 1, catid: 5, ordering: 1 },
      { id: 2, catid: 5, ordering: 0 },
      { id: 4, catid: 6, title: 'A' },
      { id: 5, catid: 6, title: 'A' }
    ],
    rules
  )
  assert.deepEqual(
    steps.map((s) => [s.id, s.fields.ordering]),
    [
      [2, 1],
      [1, 2],
      [3, 3]
    ]
  )
  assert.equal(left.length, 1, 'a tied title cannot be written, and is said')
})

test('a BLANK Apply pins the order first, under its own apply id, so the related articles read as in the demo', async () => {
  const site = essenceSite()
  site.articles = essenceArticles()
  const { site: done } = await runEssence({ site, about: '' })
  const first = done.calls.find(
    (c) => c.action === 'content.batch' || c.action === 'content.update' || c.action === 'content.contract'
  )
  assert.equal(first?.action, 'content.batch', 'the first write is the order')
  assert.match(String(first?.params.apply_id), /^order-/)
  const after = applySteps(essenceArticles(), first.params.operations)
  // A related-articles list newest first: whatever order the site answers ties in, the demo's.
  const related = (/** @type {any[]} */ list) =>
    list
      .filter((a) => a.catid === 9)
      .sort((a, b) => {
        const t = (x) => Date.parse(`${String(x.publish_up).replace(' ', 'T')}Z`)
        return t(b) - t(a) || b.id - a.id
      })
      .map((a) => a.id)
  const demo = essenceArticles()
    .filter((a) => a.catid === 9)
    .sort(byRule(DEFAULT_RULE))
    .map((a) => a.id)
  assert.deepEqual(related(after), demo)
})
