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

import { writeCopy } from '../tools/personalize.mjs'

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

test('a link that leads out of the site stays on the demo words it was written for', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  const demo = demoOf('hero', 'welcome-to-res-bar-restaurant', 'hero_intro')
  const { fetchImpl } = modelAnswering((f) =>
    f.key === key
      ? 'Find us at {mark_a}4 5th Avenue at St. Marks Place, Cathedral District{mark_a_end}, pasta every day.'
      : ''
  )
  const blocks = (await write('hero.welcome-to-res-bar-restaurant', fetchImpl))[key]
  assert.ok(Array.isArray(blocks), 'written back as blocks')
  assert.deepEqual(blocks[0].markDefs, demo[0].markDefs)
  assert.deepEqual(
    blocks[0].children.filter((c) => c.marks.length > 0).map((c) => [c.text, c.marks]),
    [['4 5th Avenue at St. Marks Place, Cathedral District', ['l3']]]
  )
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

test('an answer that drops a link of the field, or invents one, is not taken', async () => {
  const key = 'hero.welcome-to-res-bar-restaurant.hero_intro'
  for (const answer of [
    'Fresh pasta every day. Come as you are.',
    'Fresh pasta {mark_a}every{mark_a_end} day {mark_b}here{mark_b_end}.',
    'Fresh pasta {mark_a}every day.'
  ]) {
    const { fetchImpl } = modelAnswering((f) => (f.key === key ? answer : ''))
    const out = await write('hero.welcome-to-res-bar-restaurant', fetchImpl)
    assert.equal(out[key], undefined, answer)
  }
})
