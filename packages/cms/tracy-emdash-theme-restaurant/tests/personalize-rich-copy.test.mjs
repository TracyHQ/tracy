// tools/personalize.mjs, a `copy` rule on a rich-text field. Measured 16/11/2026 on dev (JA Restaurant EmDash 1.0.2, Add
// site with "Trattoria Lume", Italian, Da Nang): the home welcome (`hero_intro`, portable text) still read "Since 1982, RES
// has welcomed Brooklyn … 4 5th Avenue at St. Marks Place", although its rule asks for two sentences "with no year, address
// or number". `writeCopy` read only string fields, so the field was never asked and the report said nothing. A rich-text
// field is asked as its text and written back as blocks, keeping what the view draws from them: a block that is one link
// (the "Meet Our Team" button of FeaturesIntro.astro) stays as it is, and a link inside a sentence keeps its mark.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { withoutDemoFacts, writeCopy } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const seedEntries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data ?? {} }))
)
const facts = { name: 'Trattoria Lume', about: 'An Italian trattoria in Da Nang.', sector: 'restaurant' }
const model = { url: 'http://model.test/v1/chat', key: 'k', model: 'm' }
const demoOf = (collection, slug, field) =>
  seedEntries.find((x) => x.collection === collection && x.slug === slug && x.locale === 'en').data[field]

/** A model that answers every field it is asked with `answer(field)`, and keeps the fields it was asked. */
function modelAnswering(answer) {
  const asked = []
  const fetchImpl = async (_url, init) => {
    const user = JSON.parse(JSON.parse(init.body).messages[1].content)
    asked.push(...user.fields)
    const out = Object.fromEntries(user.fields.map((f) => [f.key, answer(f)]))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }))
  }
  return { asked, fetchImpl }
}

const write = (page, fetchImpl) =>
  writeCopy({ model, map, facts, locale: 'en', seedEntries, fetchImpl, only: [page] })
const textOf = (blocks) => blocks.flatMap((b) => (b.children ?? []).map((c) => c.text)).join('')

test('every rich-text copy field of this template is asked', async () => {
  const rich = map.copy.filter((c) => Array.isArray(demoOf(c.collection, c.slug, c.field)))
  assert.ok(rich.length > 0)
  const { asked, fetchImpl } = modelAnswering(() => '')
  await writeCopy({
    model,
    map,
    facts,
    locale: 'en',
    seedEntries,
    fetchImpl,
    only: [...new Set(rich.map((c) => `${c.collection}.${c.slug}`))]
  })
  for (const c of rich)
    assert.ok(
      asked.some((f) => f.key === `${c.collection}.${c.slug}.${c.field}`),
      `${c.collection}.${c.slug}.${c.field} is asked`
    )
})

test('the home welcome is rewritten, and its map link never goes with new words', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  const { asked, fetchImpl } = modelAnswering((f) =>
    f.key === key ? 'Fresh pasta every day at {mark_a}our table{mark_a_end}. Come as you are.' : ''
  )
  const out = await write('hero.welcome-to-res-bar-restaurant', fetchImpl)
  const field = asked.find((f) => f.key === key)
  assert.ok(field, 'the welcome is asked')
  assert.match(field.example, /Since 1982/)
  assert.match(field.example, /\{mark_a\}4 5th Avenue at St\. Marks Place, Cathedral District\{mark_a_end\}/)
  const blocks = out[key]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.equal(textOf(blocks), 'Fresh pasta every day at our table. Come as you are.')
  assert.doesNotMatch(JSON.stringify(blocks), /maps|Brooklyn|5th/, 'no link to the demo address')
  assert.deepEqual(
    blocks[0].children.filter((c) => c.marks.length > 0),
    [],
    '"our table" is plain text'
  )
})

test('an answer that repeats the demo address on its map link is not taken', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  const { fetchImpl } = modelAnswering((f) =>
    f.key === key
      ? 'Find us at {mark_a}4 5th Avenue at St. Marks Place, Cathedral District{mark_a_end}, pasta every day.'
      : ''
  )
  assert.equal((await write('hero.welcome-to-res-bar-restaurant', fetchImpl))[key], undefined)
})

test('a link into the site keeps its address on new words', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant-2.hero_intro'
  const demo = demoOf('hero', 'welcome-to-res-bar-restaurant-2', 'hero_intro')
  assert.equal(demo[0].markDefs[0].href, '#', 'the seed links inside the page')
  const { fetchImpl } = modelAnswering((f) =>
    f.key === key ? 'Our cooks make pasta by hand. {mark_a}Meet them{mark_a_end} before dinner.' : ''
  )
  const blocks = (await write('hero.welcome-to-res-bar-restaurant-2', fetchImpl))[key]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.deepEqual(blocks[0].markDefs, demo[0].markDefs)
  assert.deepEqual(
    blocks[0].children.filter((c) => c.marks.length > 0).map((c) => [c.text, c.marks]),
    [['Meet them', ['l3']]]
  )
})

test('the "Meet Our Team" button of Our Food Network survives the rewrite of its text', async () => {
  const key = 'features_intro.about-us.description'
  const demo = demoOf('features_intro', 'about-us', 'description')
  const button = demo.find((b) => textOf([b]) === 'Meet Our Team')
  assert.ok(button, 'the seed holds the button block')
  const { asked, fetchImpl } = modelAnswering((f) =>
    f.key === key ? 'Handmade pasta, slow sauces and wine from small Italian producers.' : ''
  )
  const out = await write('features_intro.about-us', fetchImpl)
  const field = asked.find((f) => f.key === key)
  assert.ok(field, 'the text is asked')
  assert.doesNotMatch(field.example, /Meet Our Team/, 'the button is not asked')
  const blocks = out[key]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.deepEqual(
    blocks.find((b) => b._key === button._key),
    button,
    'the button block stays as it is'
  )
  assert.equal(
    textOf(blocks.filter((b) => b !== button)),
    'Handmade pasta, slow sauces and wine from small Italian producers.'
  )
})

// Measured again 16/11/2026 on dev (qa647-lume, Add site "Trattoria Lume … wood-fired pizza and fresh pasta"): an answer
// that obeyed the brief's "no address" had no pair for the demo's address, was not taken twice, and the welcome kept "Since
// 1982, Trattoria Lume has welcomed Brooklyn … 4 5th Avenue". The map link of the demo address may be left out.
test('the home welcome that leaves out the demo address is taken', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  const { asked, fetchImpl } = modelAnswering((f) =>
    f.key === key
      ? 'At Trattoria Lume, a family-run kitchen in Da Nang, pizza comes out of a wood-fired oven and the pasta is made fresh every morning. Drop in for a quick lunch or stay for a long dinner, and every table gets the same warm welcome.'
      : ''
  )
  const out = await write('hero.welcome-to-res-bar-restaurant', fetchImpl)
  const blocks = out[key]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.match(textOf(blocks), /^At Trattoria Lume, a family-run kitchen in Da Nang/)
  assert.doesNotMatch(JSON.stringify(blocks), /maps|Brooklyn|5th|1982/, 'nothing of the demo address')
  assert.deepEqual(asked.find((f) => f.key === key).mayLeaveOut, [
    '4 5th Avenue at St. Marks Place, Cathedral District'
  ])
})

test('the reservation and contact lines may leave out the demo phone', async () => {
  for (const [page, key] of [
    ['reservation.reservation', 'reservation.reservation.intro'],
    ['contact.contact', 'contact.contact.card_text']
  ]) {
    const { fetchImpl } = modelAnswering((f) =>
      f.key === key ? 'Call us to book a table for lunch or dinner.' : ''
    )
    const out = await write(page, fetchImpl)
    assert.ok(Array.isArray(out[key]), key)
    assert.doesNotMatch(JSON.stringify(out[key]), /555|tel:/, key)
  }
})

test('an answer that invents a link, or breaks one, is not taken', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  for (const answer of [
    'Fresh pasta {mark_a}every{mark_a_end} day {mark_b}here{mark_b_end}.',
    'Fresh pasta {mark_a}every day.'
  ]) {
    const { fetchImpl } = modelAnswering((f) => (f.key === key ? answer : ''))
    const out = await write('hero.welcome-to-res-bar-restaurant', fetchImpl)
    assert.equal(out[key], undefined, answer)
  }
})

// Review of the qa647 fix (16/11/2026), on this template's own seed: a brief that gives a phone and an address keeps the
// links of the welcome, the contact card and the reservation intro, leading to the customer's; the fallback for an answer
// still not taken never empties those fields, never keeps the demo's address or phone, and keeps every link into the site.
const PHONE = '+84 905 123 456'
const ADDRESS = '12 Bach Dang, Da Nang'
const MAP = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`
const DEMO = /555|Brooklyn|5th Avenue|St\. Marks|10845550110|query=4\+5th/
const RICH = [
  ['hero.welcome-to-res-bar-restaurant', 'hero', 'welcome-to-res-bar-restaurant', 'hero_intro'],
  ['contact.contact', 'contact', 'contact', 'card_text'],
  ['reservation.reservation', 'reservation', 'reservation', 'intro']
]
const hrefs = (blocks) => blocks.flatMap((b) => (b.markDefs ?? []).map((d) => d.href))
const inside = (blocks) => hrefs(blocks).filter((h) => !/^[a-z][a-z0-9+.-]*:/i.test(h))

test('a brief with a phone and an address: the links of the welcome, contact card and reservation lead to them', async () => {
  const given = { ...facts, phone: PHONE, address: ADDRESS }
  const answers = {
    'hero.welcome-to-res-bar-restaurant.hero_intro':
      'Wood-fired pizza and fresh pasta at {mark_a}12 Bach Dang{mark_a_end}, made by one family in Da Nang.',
    'contact.contact.card_text': 'Call {mark_a}+84 905 123 456{mark_a_end} to book your table.',
    'reservation.reservation.intro': 'Book lunch or dinner by phone at {mark_a}our number{mark_a_end}.'
  }
  const expected = {
    hero_intro: MAP,
    card_text: 'tel:+84905123456',
    intro: 'tel:+84905123456'
  }
  for (const [page, collection, slug, field] of RICH) {
    const key = `${collection}.${slug}.${field}`
    const { asked, fetchImpl } = modelAnswering((f) => (f.key === key ? answers[key] : ''))
    const out = await writeCopy({
      model,
      map,
      facts: given,
      locale: 'en',
      seedEntries,
      fetchImpl,
      only: [page]
    })
    assert.ok(Array.isArray(out[key]), key)
    assert.deepEqual(hrefs(out[key]), [expected[field]], `${key} leads to the customer’s, never the demo’s`)
    assert.doesNotMatch(JSON.stringify(out[key]), DEMO, key)
    assert.ok(
      asked.find((f) => f.key === key).linkFacts,
      `${key}: the model is told which pair is the customer’s`
    )
  }
})

test('the fallback on the welcome, contact card and reservation intro: never empty, no demo address or phone', () => {
  for (const given of [{}, { phone: PHONE, address: ADDRESS }])
    for (const [, collection, slug, field] of RICH) {
      const demo = demoOf(collection, slug, field)
      const out = withoutDemoFacts(demo, given)
      assert.equal(out.readable, true, `${field} keeps words`)
      assert.ok(textOf(out.value).trim().length > 20, `${field}: ${textOf(out.value)}`)
      // With the customer's address the linked run is replaced, and a plain word of the demo's sentence ("Brooklyn") is no
      // link the rule can see: only the demo's linked address, phone and their links are checked then.
      assert.doesNotMatch(
        JSON.stringify(out.value),
        given.address ? /555|5th Avenue|St\. Marks|10845550110|query=4\+5th/ : DEMO,
        field
      )
      assert.deepEqual(inside(out.value), inside(demo), `${field} keeps its links into the site`)
      if (given.phone)
        assert.match(textOf(out.value), field === 'hero_intro' ? /12 Bach Dang/ : /\+84 905 123 456/)
    }
})

test('a mixed paragraph of the welcome keeps its menu link when the demo address goes', () => {
  const demo = structuredClone(demoOf('hero', 'welcome-to-res-bar-restaurant', 'hero_intro'))
  demo[0].markDefs.push({ _type: 'link', _key: 'menu', href: '/menu' })
  demo[0].children.push(
    { _type: 'span', _key: 'x1', text: ' See ', marks: [] },
    { _type: 'span', _key: 'x2', text: 'our menu', marks: ['menu'] },
    { _type: 'span', _key: 'x3', text: ' before you come.', marks: [] }
  )
  const out = withoutDemoFacts(demo, {})
  assert.match(textOf(out.value), /^Our kitchen cooks .* See our menu before you come\.$/)
  assert.doesNotMatch(JSON.stringify(out.value), DEMO)
  assert.deepEqual(hrefs(out.value), ['/menu'])
  assert.deepEqual(
    out.value[0].children.filter((c) => c.marks.length > 0).map((c) => [c.text, c.marks]),
    [['our menu', ['menu']]]
  )
})
