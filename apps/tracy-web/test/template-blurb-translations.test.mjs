// The blurb translations of the public Templates pages (`lib/template-blurb-translations.js`): one
// model call per English blurb, every language checked before it is stored, a failing model left
// alone for a while, and a reworded blurb translated again. The model is a fake; the store is a real
// Postgres (skipped without TEST_DATABASE_URL, like every DB test here).
//
// The fake answers are ASCII placeholders ("[de] ..."), not real foreign prose: what is under test
// is which answers are kept, not the quality of a translation.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  BLURB_LANGUAGES,
  blurbHash,
  blurbTranslations,
  kickBlurbTranslations,
  refusalOf,
  startBlurbTranslationJob,
  sweepBlurbTranslations
} from '../src/lib/template-blurb-translations.js'
import { customerTemplateCards } from '../src/lib/customer-template-cards.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const skip = !process.env.TEST_DATABASE_URL && 'needs TEST_DATABASE_URL'

const MODEL = { baseUrl: 'https://model.example.test/v1', apiKey: 'test-key', words: 'fake-model' }
const ENGLISH = 'A template with a live preview for the Harbor Bakery site on WordPress.'
const CARD = { name: 'Harbor Bakery', english: ENGLISH }
const T0 = new Date('2026-10-29T08:00:00Z')

/** A fake chat/completions door: `answer(langs, body)` builds the JSON object the model "says". */
function fakeModel(answer) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    const langs = [...body.messages[0].content.matchAll(/"([a-z]{2})"/g)]
      .map((m) => m[1])
      .filter((l) => BLURB_LANGUAGES.includes(l))
    calls.push({ url, langs: [...new Set(langs)], body })
    const said = await answer([...new Set(langs)], body)
    if (said instanceof Response) return said
    return Response.json({ choices: [{ message: { content: JSON.stringify(said) } }] })
  }
  return { calls, fetchImpl }
}
const placeholders = (langs, english = ENGLISH) =>
  Object.fromEntries(langs.map((l) => [l, `[${l}] ${english}`]))

const sweep = (fetchImpl, cards = [CARD], extra = {}) =>
  sweepBlurbTranslations(
    db.pool,
    {},
    {
      fetchImpl,
      log: { warn() {} },
      now: () => T0,
      modelOf: async () => MODEL,
      readCards: async () => cards,
      ...extra
    }
  )

const stored = async () =>
  (
    await db.pool.query(
      'select source_sha256, lang, text, model from template_blurb_translation order by lang'
    )
  ).rows

test('every language of a blurb comes from ONE model call and is served by blurbTranslations', {
  skip
}, async () => {
  const model = fakeModel((langs) => placeholders(langs))
  const result = await sweep(model.fetchImpl)
  assert.equal(model.calls.length, 1)
  assert.deepEqual(model.calls[0].langs.sort(), [...BLURB_LANGUAGES].sort())
  assert.equal(result.translated, 5)
  const rows = await stored()
  assert.deepEqual(
    rows.map((r) => r.lang),
    ['de', 'es', 'fr', 'it', 'nl']
  )
  assert.ok(rows.every((r) => r.source_sha256 === blurbHash(ENGLISH) && r.model === 'fake-model'))
  const served = await blurbTranslations(db.pool, [ENGLISH])
  assert.equal(served.get(blurbHash(ENGLISH)).de, `[de] ${ENGLISH}`)
  // Nothing left to do: the next pass asks nothing.
  await sweep(model.fetchImpl)
  assert.equal(model.calls.length, 1)
})

test('the prompt asks for formal address, the kept words and the German hyphen rule', { skip }, async () => {
  const model = fakeModel((langs) => placeholders(langs))
  await sweep(model.fetchImpl)
  const system = model.calls[0].body.messages[0].content
  for (const word of ['"Sie"', '"vous"', '"usted"', '"Lei"', '"u"', 'Template-Vorschau'])
    assert.ok(system.includes(word), word)
  assert.match(system, /untranslated: site, preview, template, Harbor Bakery, WordPress\./)
})

test('a language that drops a kept term is refused alone; the card then backs off', { skip }, async () => {
  const model = fakeModel((langs) => ({
    ...placeholders(langs),
    ...(langs.includes('de')
      ? { de: '[de] A design with a live look for the Harbor Bakery site on WordPress.' }
      : {})
  }))
  await sweep(model.fetchImpl)
  assert.deepEqual(
    (await stored()).map((r) => r.lang),
    ['es', 'fr', 'it', 'nl']
  )
  const failure = (
    await db.pool.query('select failures, next_at, last_error from template_blurb_translation_failure')
  ).rows[0]
  assert.equal(failure.failures, 1)
  assert.match(failure.last_error, /de: dropped preview, template/)
  assert.ok(failure.next_at > T0)
  // Same moment: the card waits, the model is not asked again.
  await sweep(model.fetchImpl)
  assert.equal(model.calls.length, 1)
  // After the wait: one call, for German only.
  await sweep(model.fetchImpl, [CARD], { now: () => new Date(T0.getTime() + 31 * 60 * 1000) })
  assert.equal(model.calls.length, 2)
  assert.deepEqual(model.calls[1].langs, ['de'])
})

test('a dash, an empty, an over-long or an untranslated answer is refused', () => {
  assert.equal(refusalOf(ENGLISH, `[fr] ${ENGLISH}`.replace(' with', ' — with'), 'Harbor Bakery'), 'dash')
  assert.equal(refusalOf(ENGLISH, `[fr] ${ENGLISH}`.replace(' with', ' – with'), 'Harbor Bakery'), 'dash')
  assert.equal(refusalOf(ENGLISH, '  ', 'Harbor Bakery'), 'empty')
  assert.equal(refusalOf(ENGLISH, `[fr] ${ENGLISH} ${'x'.repeat(300)}`, 'Harbor Bakery'), 'too long')
  assert.equal(refusalOf(ENGLISH, ENGLISH, 'Harbor Bakery'), 'still English')
  assert.equal(
    refusalOf(ENGLISH, `[fr] ${ENGLISH}`.replace('Harbor Bakery', 'harbor bakery'), 'Harbor Bakery'),
    'dropped Harbor Bakery'
  )
  assert.equal(
    refusalOf(ENGLISH, `[fr] ${ENGLISH}`.replace('WordPress', 'WP'), 'Harbor Bakery'),
    'dropped WordPress'
  )
  assert.equal(refusalOf(ENGLISH, `[fr] ${ENGLISH}`, 'Harbor Bakery'), null)
})

test('a dashed language is not stored; the others are', { skip }, async () => {
  const model = fakeModel((langs) => ({
    ...placeholders(langs),
    fr: `[fr] ${ENGLISH}`.replace(' with', ' — with')
  }))
  await sweep(model.fetchImpl)
  assert.deepEqual(
    (await stored()).map((r) => r.lang),
    ['de', 'es', 'it', 'nl']
  )
})

test('a model that fails leaves English, ends the pass and backs off', { skip }, async () => {
  const model = fakeModel(() => new Response('upstream down', { status: 500 }))
  const other = { name: 'Quiet Studio', english: 'A portfolio site for a photo studio.' }
  const result = await sweep(model.fetchImpl, [CARD, other])
  assert.equal(model.calls.length, 1, 'the second card is not sent to a model that just failed')
  assert.match(result.failed, /HTTP 500/)
  assert.deepEqual(await stored(), [])
  assert.equal((await blurbTranslations(db.pool, [ENGLISH])).size, 0)
  const { rows } = await db.pool.query('select failures from template_blurb_translation_failure')
  assert.deepEqual(
    rows.map((r) => r.failures),
    [1]
  )
  // Failing twice doubles the wait.
  await sweep(model.fetchImpl, [CARD], { now: () => new Date(T0.getTime() + 31 * 60 * 1000) })
  const again = (await db.pool.query('select failures, next_at from template_blurb_translation_failure'))
    .rows[0]
  assert.equal(again.failures, 2)
  assert.equal(again.next_at.getTime(), T0.getTime() + 31 * 60 * 1000 + 60 * 60 * 1000)
})

test('a model that answers no JSON is a failure, never a throw', { skip }, async () => {
  const fetchImpl = async () => Response.json({ choices: [{ message: { content: 'Sorry, I cannot.' } }] })
  const result = await sweep(fetchImpl)
  assert.ok(result.failed)
  assert.deepEqual(await stored(), [])
})

test('a reworded English blurb is translated again under its new hash', { skip }, async () => {
  const model = fakeModel((langs, body) => placeholders(langs, JSON.parse(body.messages[1].content).english))
  await sweep(model.fetchImpl)
  const reworded = { ...CARD, english: `${ENGLISH} Now with an online order form.` }
  await sweep(model.fetchImpl, [reworded])
  assert.equal(model.calls.length, 2)
  const served = await blurbTranslations(db.pool, [reworded.english])
  assert.equal(served.get(blurbHash(reworded.english)).nl, `[nl] ${reworded.english}`)
})

test('no model on the web door: nothing is asked and nothing is stored', { skip }, async () => {
  const model = fakeModel((langs) => placeholders(langs))
  const result = await sweep(model.fetchImpl, [CARD], { modelOf: async () => null })
  assert.equal(result.skipped, 'no model')
  assert.equal(model.calls.length, 0)
})

test('kicks are single flight: a kick during a pass joins it and runs one more pass', { skip }, async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let inFlight = 0
  let most = 0
  const model = fakeModel(async (langs) => {
    inFlight += 1
    most = Math.max(most, inFlight)
    await gate
    inFlight -= 1
    return placeholders(langs)
  })
  const options = {
    fetchImpl: model.fetchImpl,
    log: { warn() {} },
    now: () => T0,
    modelOf: async () => MODEL,
    readCards: async () => [CARD]
  }
  assert.equal(kickBlurbTranslations(db.pool, {}, options), null, 'off until the cron starts it')
  startBlurbTranslationJob()
  const first = kickBlurbTranslations(db.pool, {}, options)
  const second = kickBlurbTranslations(db.pool, {}, options)
  assert.equal(first, second)
  release()
  await first
  assert.equal(most, 1)
  assert.equal(model.calls.length, 1, 'the extra pass found nothing left to translate')
  assert.equal((await stored()).length, 5)
})

test('a sweep whose store throws does not reject the kick', async () => {
  startBlurbTranslationJob()
  const broken = { query: async () => Promise.reject(new Error('db down')) }
  await kickBlurbTranslations(
    broken,
    {},
    { log: { warn() {} }, modelOf: async () => MODEL, readCards: async () => [CARD] }
  )
  assert.equal((await blurbTranslations(broken, [ENGLISH])).size, 0)
})

test('GET /api/templates cards carry card.blurbs from the store, only the languages stored', {
  skip
}, async () => {
  const blurb = 'A bakery site with a menu and an order form.'
  const release = {
    tag: 'harbor-bakery/emdash-0.x',
    platform: 'emdash',
    choosable: true,
    setting: {
      schemaVersion: 'tracy-setting/v1',
      platform: 'emdash',
      template: 'harbor-bakery',
      label: 'Harbor Bakery',
      version: '1.0.0',
      cms: '0.37.0',
      install: {
        source: { file: 'harbor-bakery-1.0.0.zip', sha256: 'a'.repeat(64) },
        state: { file: 'harbor-bakery-state-1.0.0.tar.gz', sha256: 'b'.repeat(64) }
      }
    },
    inspiration: {
      schemaVersion: 'tracy-design-inspiration/v1',
      template: 'harbor-bakery',
      provider: 'JoomlArt',
      category: 'Professional & Corporate',
      blurb,
      image: 'harbor-bakery-home-1440.png',
      layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'harbor-bakery-home-1440.png' } }]
    }
  }
  const config = { origin: 'https://tracy.example.test' }
  const [bare] = await customerTemplateCards(db.pool, config, [release])
  assert.deepEqual(bare.card.blurbs, {})
  await db.pool.query(
    `insert into template_blurb_translation (source_sha256, lang, text) values ($1, 'de', $2), ($1, 'zz', 'never served')`,
    [blurbHash(blurb), `[de] ${blurb}`]
  )
  const [card] = await customerTemplateCards(db.pool, config, [release])
  assert.equal(card.card.blurb, blurb)
  assert.deepEqual(card.card.blurbs, { de: `[de] ${blurb}` })
})
