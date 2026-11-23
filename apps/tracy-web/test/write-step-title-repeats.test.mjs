// On the released JA Boxing 1.0.11 contract: a class page prints its article's name twice, as the title the writer renames
// and as `classes-title`, which the kit reads only on the listing cards. The repeat takes the page's new title
// (write-step/title-repeats.js). Dev lat28 and lat29 (22–23/11/2026): the three renamed class pages printed "Beginner Boxing",
// "Private Training" and "Advanced Boxing" over their new names. The plan and the claims are invented; no model, no site.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { titleRepeatTwins } from '../src/write-step/title-repeats.js'

const CONTRACT = '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/'
const read = (file) => JSON.parse(readFileSync(new URL(CONTRACT + file, import.meta.url), 'utf8'))
const KIT = read('template-kit.json')
const MAP = read('content-map.json')

const keep = (id) => ({ id, decision: 'keep', blocks: [] })
const words = (slot, content) => ({ slot, owner: 'writer', file: 'site-copy.json', kind: 'text', content })

test("a field that repeats a kept class page's demo title takes the page's new title", () => {
  const plan = {
    pages: [
      keep('page-home'),
      keep('page-classes_beginner-boxing'),
      keep('page-classes_private-training'),
      { id: 'page-classes_advanced-boxing', decision: 'drop' }
    ]
  }
  const claims = [
    words('article-14.4', 'Sweat Classes'),
    words('article-15.4', 'Personal Training'),
    words('article-16.4', 'Boxing Classes')
  ]
  const { twins, claims: made } = titleRepeatTwins({ plan, kit: KIT, contentMap: MAP, claims })
  assert.deepEqual([...twins].sort(), [
    ['article-14.7', 'article-14.4'],
    ['article-15.7', 'article-15.4']
  ])
  assert.deepEqual(
    made.find((c) => c.slot === 'article-14.7'),
    { ...claims[0], slot: 'article-14.7' }
  )
})

test('a repeat a file speaks for keeps it, and an unwritten title gives nothing', () => {
  const plan = { pages: [keep('page-classes_beginner-boxing')] }
  const own = titleRepeatTwins({
    plan,
    kit: KIT,
    contentMap: MAP,
    claims: [
      words('article-14.4', 'Sweat Classes'),
      words('article-14.7', 'Sweat ((br/))((span))Classes((/span))')
    ]
  })
  assert.equal(own.twins.size, 0)
  const none = titleRepeatTwins({ plan, kit: KIT, contentMap: MAP, claims: [] })
  assert.equal(none.twins.size, 0)
})
