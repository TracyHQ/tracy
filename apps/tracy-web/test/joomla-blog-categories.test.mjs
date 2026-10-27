/**
 * Decision (3) of 12/10/2026 (product owner, TCH #1013): on a FULL site the blog categories are renamed for the customer's
 * trade, keeping how many there are, which articles each holds and their aliases and paths; tags are only translated, and
 * About left blank keeps the demo's names. A whole JA Essence j6 Apply through the Apply door, with obedient and DISOBEDIENT
 * scripted models (names repeated, the business name, the demo topics only translated).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CATEGORY_SYSTEM } from '../src/sites/brief-engines/blog-categories.js'
import { essenceModel, runEssence } from './_joomla-essence-site.mjs'

const VI = /** @type {Record<string, string>} */ ({
  Health: 'Sức khỏe',
  Design: 'Thiết kế',
  Fashion: 'Thời trang',
  Resources: 'Tài nguyên',
  Lifestyle: 'Phong cách sống',
  Blog: 'Blog'
})
const translate = (/** @type {string} */ text) => VI[text] ?? text
const BAKERY = ['Bánh mì sourdough', 'Bánh mì Việt', 'Bột và men', 'Mẹo bảo quản', 'Buổi sáng ở tiệm']

/**
 * A model double whose category ask answers `rounds[i]` on its i-th call (the last one repeated), each a function of the ask.
 * @param {Array<(input: any) => Record<string, string>>} rounds
 */
function namer(rounds) {
  /** @type {any[]} */
  const asked = []
  const model = essenceModel({
    translate,
    lookup: (input) => {
      if (!(Array.isArray(input?.categories) && 'avoidName' in input)) return null
      asked.push(input)
      const answer = rounds[Math.min(asked.length - 1, rounds.length - 1)]
      return JSON.stringify({ names: answer(input) })
    }
  })
  return { model, asked }
}

const obey = (/** @type {any} */ input) =>
  Object.fromEntries(
    input.categories.map((/** @type {any} */ c, /** @type {number} */ i) => [c.key, BAKERY[i]])
  )

const categoryRecords = (/** @type {any} */ site) =>
  site.records.filter((/** @type {any} */ r) => r.kind === 'category')

/** Every leaf category of JA Essence 1.0.4 (two blogs, each with Health, Design, Fashion; Resources and Lifestyle). */
const LEAVES = [9, 10, 11, 13, 14, 15, 16, 17]

test('FULL: each leaf category takes a distinct name of the business, the same name for the same demo title, aliases kept', async () => {
  const { model, asked } = namer([obey])
  const { site, notes } = await runEssence({ model })
  assert.equal(asked.length, 1, 'one ask per site')
  assert.deepEqual(
    asked[0].categories.map((/** @type {any} */ c) => c.name),
    ['Health', 'Design', 'Fashion', 'Lifestyle'],
    '"Resources" is a generic section label: translated, never renamed (Akemi, 25/10/2026)'
  )
  assert.deepEqual(
    asked[0].topics,
    [],
    'no topics: the posts are the demo’s, translated (decision 1 after g65)'
  )
  assert.equal(asked[0].language, 'vi-VN')
  const records = categoryRecords(site)
  const titleOf = new Map(records.filter((r) => r.fields.title).map((r) => [r.id, r.fields.title]))
  assert.deepEqual(
    LEAVES.map((id) => titleOf.get(id)),
    [BAKERY[0], BAKERY[1], BAKERY[2], BAKERY[0], BAKERY[1], BAKERY[2], 'Tài nguyên', BAKERY[3]]
  )
  // The sections that hold the topics, and Joomla's own default, keep today's name (translated).
  assert.equal(titleOf.get(8), undefined, '"Blog" stays "Blog"')
  assert.equal(titleOf.get(2), undefined)
  for (const r of records)
    assert.deepEqual(
      Object.keys(r.fields).filter((k) => !['title', 'description'].includes(k)),
      [],
      `category ${r.id} keeps its alias, path, parent, state and articles`
    )
  assert.ok(!notes.some((n) => /category name/.test(n)), notes.join('\n'))
})

test('FULL, a model that repeats one name: asked again once, then the translation stays and the report says so', async () => {
  const same = (/** @type {any} */ input) =>
    Object.fromEntries(input.categories.map((/** @type {any} */ c) => [c.key, 'Bánh mì']))
  const { model, asked } = namer([same])
  const { site, notes } = await runEssence({ model })
  assert.equal(asked.length, 2)
  assert.match(JSON.stringify(asked[1].refused), /same name/)
  const titleOf = new Map(categoryRecords(site).map((r) => [r.id, r.fields.title]))
  assert.equal(titleOf.get(9), 'Sức khỏe')
  assert.equal(titleOf.get(11), 'Thời trang')
  assert.ok(
    notes.some((n) => /4 blog category name\(s\) were NOT renamed/.test(n)),
    notes.join('\n')
  )
})

test('FULL, a model that names the business, then one that only translates the demo topics: both refused', async () => {
  const named = (/** @type {any} */ input) =>
    Object.fromEntries(
      input.categories.map((/** @type {any} */ c, /** @type {number} */ i) => [
        c.key,
        `Tamarind ${BAKERY[i]}`
      ])
    )
  const echoed = (/** @type {any} */ input) =>
    Object.fromEntries(input.categories.map((/** @type {any} */ c) => [c.key, translate(c.name)]))
  const { model, asked } = namer([named, echoed])
  const { site, notes } = await runEssence({ model })
  assert.equal(asked.length, 2)
  assert.match(JSON.stringify(asked[1].refused), /business name/)
  assert.ok(
    notes.some((n) => /NOT renamed.*demo topic/.test(n)),
    notes.join('\n')
  )
  assert.equal(new Map(categoryRecords(site).map((r) => [r.id, r.fields.title])).get(10), 'Thiết kế')
})

test('FULL, a disobedient first answer and an obedient second: the second is written', async () => {
  const filler = (/** @type {any} */ input) =>
    Object.fromEntries(
      input.categories.map((/** @type {any} */ c, /** @type {number} */ i) => [c.key, `Danh mục ${i}`])
    )
  const { model, asked } = namer([filler, obey])
  const { site } = await runEssence({ model })
  assert.equal(asked.length, 2)
  assert.match(JSON.stringify(asked[1].refused), /placeholder/)
  assert.equal(new Map(categoryRecords(site).map((r) => [r.id, r.fields.title])).get(17), BAKERY[3])
})

test('BLANK: the categories are not renamed (only translated), and nothing is asked', async () => {
  const { model, asked } = namer([obey])
  const { site } = await runEssence({ model, about: '' })
  assert.equal(asked.length, 0)
  assert.equal(model.calls.filter((c) => c.system.startsWith(CATEGORY_SYSTEM.slice(0, 30))).length, 0)
  const titleOf = new Map(categoryRecords(site).map((r) => [r.id, r.fields.title]))
  assert.equal(titleOf.get(9), 'Sức khỏe')
})

test('FULL: tags keep today’s behaviour, translated, never renamed', async () => {
  const { model } = namer([obey])
  const { site } = await runEssence({ model })
  const tags = site.records.filter((/** @type {any} */ r) => r.kind === 'tag')
  // "Line art" has no Vietnamese in this double, so it keeps its name; "Lifestyle" is translated, not named for the bakery.
  assert.deepEqual(
    tags.map((r) => [r.id, r.fields]),
    [[2, { title: 'Phong cách sống' }]]
  )
})
