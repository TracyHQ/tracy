// tools/personalize.mjs on this template's own seed: a row or a rich text the model could not rewrite never keeps the
// demo's place once the brief gives the customer's own address. QA on dev 16/11/2026 (JA Restaurant EmDash 1.0.2, site
// built with #654 live): both slide titles kept "The Best Bar & Restaurant in Brooklyn" after two refused asks, and the
// home welcome's fallback kept "Since 1982, … has welcomed Brooklyn …" beside the customer's address. The demo's place is
// read from the template's own address fields (the `identity` rules that write `{address}`), never from a list kept here.
// With no address in the brief the address fields keep the demo's (`unanswered: keep-demo`), and so do these words.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  demoPlaceWordsOf,
  factsFrom,
  planFrom,
  rewriteBlock,
  rowsWithoutDemoPlace,
  withoutDemoFacts
} from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const { seedEntries } = planFrom(map, seed, factsFrom({ name: 'Trattoria Lume' }))
const demoOf = (collection, slug, field) =>
  seedEntries.find((x) => x.collection === collection && x.slug === slug && x.locale === 'en').data[field]
const withAddress = factsFrom({
  name: 'Trattoria Lume',
  about: 'An Italian trattoria in Da Nang.',
  contact: '12 Bach Dang, Da Nang · +84 236 555 0199'
})
const noAddress = factsFrom({ name: 'Trattoria Lume' })
const slideRule = map.blocks.find((b) => b.collection === 'slideshow' && b.slug === 'slideshow')
const textOf = (blocks) => blocks.flatMap((b) => (b.children ?? []).map((c) => c.text)).join(' ')

test("the demo's place is read from the template's own address fields, without the address's common nouns", () => {
  const places = demoPlaceWordsOf(map, seedEntries)
  assert.ok(places.has('Brooklyn'))
  assert.ok(places.has('Marks'))
  for (const noun of ['Avenue', 'District', 'Place', 'St']) assert.equal(places.has(noun), false, noun)
})

/** One portable-text paragraph of plain spans and marked ones (`[text, marks]`). */
const para = (key, ...runs) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [{ _type: 'link', _key: 'm1', href: '/menu' }],
  children: runs.map((r, i) =>
    typeof r === 'string'
      ? { _type: 'span', _key: `${key}${i}`, text: r, marks: [] }
      : { _type: 'span', _key: `${key}${i}`, text: r[0], marks: r[1] }
  )
})

test('a street word of the demo address ("Place") is no demo place: copy that uses it stays (review probe)', () => {
  const places = demoPlaceWordsOf(map, seedEntries)
  const value = [para('p', 'Place your order for pickup. We also deliver.')]
  // Nothing names the demo's place, so the fallback changes nothing.
  assert.equal(withoutDemoFacts(value, withAddress, { places }), null)
  const rows = [
    { slide_title: 'Place your order tonight' },
    { slide_title: 'The Best Bar & Restaurant in Brooklyn' }
  ]
  const out = rowsWithoutDemoPlace({ rule: slideRule, rows, left: [0, 1], places, facts: withAddress })
  assert.deepEqual(
    out.rows.map((r) => r.slide_title),
    ['Place your order tonight', 'The Best Bar & Restaurant']
  )
})

test('the demo place goes from its sentence even when it is emphasised or split across spans; the sentence and its links stay (second independent review of 1.0.3)', () => {
  const places = demoPlaceWordsOf(map, seedEntries)
  const value = [
    para('a', 'We cook for ', ['Brooklyn', ['em']], ' every night. Order from the menu.'),
    para('b', 'The best of ', ['Brook', ['strong']], 'lyn, on ', ['our menu', ['m1']], '. Book a table.')
  ]
  const left = withoutDemoFacts(value, withAddress, { places })
  assert.ok(left?.readable)
  assert.deepEqual(
    left.value.map((b) => b.children.map((c) => c.text).join('')),
    ['We cook every night. Order from the menu.', 'The best, on our menu. Book a table.']
  )
})

test("a slide title still the demo's after the asks loses the demo's place once the brief gives an address", () => {
  const rows = demoOf('slideshow', 'slideshow', 'items').map((r) => ({ ...r }))
  const places = demoPlaceWordsOf(map, seedEntries)
  // Rows 1 and 2 kept the template's words after two asks; row 0 took the model's.
  rows[0].slide_title = 'Benvenuti at Trattoria Lume'
  const out = rowsWithoutDemoPlace({ rule: slideRule, rows, left: [1, 2], places, facts: withAddress })
  assert.deepEqual(
    out.rows.map((r) => r.slide_title),
    ['Benvenuti at Trattoria Lume', 'The Best Bar & Restaurant', 'The Best Bar & Restaurant'],
    'only the place phrase goes; the title stays (second independent review of 1.0.3)'
  )
  assert.deepEqual(out.left, [])
  assert.deepEqual(out.emptied, [1, 2])
  // The picture and the link of each slide stay.
  assert.deepEqual(
    out.rows.map((r) => r.image),
    rows.map((r) => r.image)
  )
  // No address in the brief: the demo's address stays on the site, and so do these words (named in the report).
  const kept = rowsWithoutDemoPlace({ rule: slideRule, rows, left: [1, 2], places, facts: noAddress })
  assert.deepEqual(kept.left, [1, 2])
  assert.equal(kept.rows[1].slide_title, rows[1].slide_title)
})

test('the second ask of a slide title over its bound says how long the refused one was', async () => {
  const rows = [{ slide_title: 'The Best Bar & Restaurant \nin Brooklyn' }]
  const told = []
  const fetchImpl = async (_url, init) => {
    told.push(JSON.parse(init.body).messages[0].content)
    const answer = { rows: [{ slide_title: 'Benvenuti at Trattoria Lume, handmade pasta by the river' }] }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  }
  const model = { url: 'http://model.test/v1/chat', key: 'k', model: 'm' }
  const first = await rewriteBlock({
    model,
    rule: slideRule,
    facts: withAddress,
    locale: 'en',
    rows,
    fetchImpl
  })
  assert.deepEqual(first.tooLong, [{ row: 0, field: 'slide_title', length: 56 }])
  await rewriteBlock({
    model,
    rule: slideRule,
    facts: withAddress,
    locale: 'en',
    rows,
    tooLong: first.tooLong,
    fetchImpl
  })
  assert.match(told[1], /slide_title of row 1 was 56 characters/)
})

test("the welcome's fallback keeps no demo place and no sentence about it once the brief gives an address", () => {
  const places = demoPlaceWordsOf(map, seedEntries)
  const demo = demoOf('hero', 'welcome-to-res-bar-restaurant', 'hero_intro')
  const left = withoutDemoFacts(demo, withAddress, { places })
  assert.ok(left?.readable)
  const text = textOf(left.value)
  assert.doesNotMatch(text, /Brooklyn|5th Avenue|St\. Marks|Cathedral/)
  // "Brooklyn" is the object of "welcomed": the whole first sentence goes, with the demo address link it carries, and
  // the paragraph keeps its second sentence (third review round: "has welcomed to one of …" was a broken sentence)
  assert.doesNotMatch(text, /welcomed|Since 1982/)
  assert.match(text, /^Our kitchen cooks seasonal market produce/)
  // No address: the sentence that links to the demo's address goes, as before; nothing else changes.
  const before = withoutDemoFacts(demo, noAddress, { places })
  assert.deepEqual(before, withoutDemoFacts(demo, noAddress))
})
