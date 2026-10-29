// The public Templates pages show a card's blurb in the visitor's language when a translation is
// stored (`card.blurbs`, `lib/template-blurb-translations.js`) and the English blurb otherwise; the
// industry guess and /llms.txt keep reading the English. Driven through the whole app with the
// published-template source replaced by a fixed list. The translations are ASCII placeholders.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { blurbOf } from '../src/public/templates-page-html.js'

const ORIGIN = 'https://cowork.tracy.ai'
const ENGLISH = 'A restaurant site with a menu and table reservations.'
const GERMAN = '[de] A restaurant site with a menu and table reservations.'
const tpl = (id, label, blurbs) => ({
  id,
  label,
  card: {
    blurb: ENGLISH,
    blurbs,
    category: 'Professional & Corporate',
    provider: 'JoomlArt',
    image: null,
    layouts: []
  },
  platforms: [{ platform: 'wordpress', tag: `quickstart/${id}/wordpress` }]
})
const LIST = [
  tpl('harbor-table', 'Harbor Table', { de: GERMAN, fr: '[fr] A restaurant site.' }),
  tpl('quiet-fork', 'Quiet Fork', {})
]

const app = buildApp({
  config: {
    sessionSecret: 's'.repeat(32),
    origin: ORIGIN,
    secure: false,
    siteDomain: 'tracy.test',
    siteDomainAliases: [],
    sessionDomain: null
  },
  fetchImpl: async () => {
    throw new Error('a test must never reach the network')
  },
  mail: { send: async () => {} },
  publicTemplates: async () => LIST
})
const page = async (path, lang) =>
  (await app.request(`${ORIGIN}${path}?lang=${lang}`, { redirect: 'manual' })).text()
const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))

test('blurbOf picks the translation of the language and falls back to English', () => {
  assert.equal(blurbOf(LIST[0], 'de'), GERMAN)
  assert.equal(blurbOf(LIST[0], 'es'), ENGLISH)
  assert.equal(blurbOf(LIST[0], 'vi'), ENGLISH)
  assert.equal(blurbOf(LIST[0]), ENGLISH)
  assert.equal(blurbOf({ card: { blurb: ENGLISH, blurbs: { de: '  ' } } }, 'de'), ENGLISH)
  assert.equal(blurbOf({ card: {} }, 'de'), '')
})

test('a German template page shows the German blurb in the lead, the meta description and the JSON-LD', async () => {
  const html = await page('/templates/harbor-table/', 'de')
  assert.match(html, /<p class="lead">\[de\] A restaurant site/)
  assert.match(html, /<meta name="description" content="\[de\] A restaurant site/)
  const work = jsonLd(html).find((n) => n['@type'] === 'CreativeWork')
  assert.equal(work.description, GERMAN)
  // The industry still reads the English words.
  assert.equal(work.genre, 'Restaurant & Food')
})

test('a language with no stored translation shows the English blurb', async () => {
  for (const lang of ['es', 'vi', 'en']) {
    const html = await page('/templates/harbor-table/', lang)
    assert.match(html, /<p class="lead">A restaurant site with a menu/, lang)
    assert.doesNotMatch(html, /\[de\]/, lang)
  }
})

test('the gallery cards and the gallery JSON-LD use the translation per card, English where none', async () => {
  const html = await page('/templates/', 'de')
  assert.match(html, /<h3>Harbor Table<\/h3><p>\[de\] A restaurant site/)
  assert.match(html, /<h3>Quiet Fork<\/h3><p>A restaurant site with a menu/)
  const list = jsonLd(html).find((n) => n['@type'] === 'ItemList')
  assert.deepEqual(
    list.itemListElement.map((i) => i.description),
    [GERMAN, ENGLISH]
  )
})

test('/llms.txt keeps the English blurb', async () => {
  const text = await (await app.request(`${ORIGIN}/llms.txt?lang=de`)).text()
  assert.match(text, /Harbor Table\]\([^)]*\): A restaurant site with a menu/)
  assert.doesNotMatch(text, /\[de\]/)
})
