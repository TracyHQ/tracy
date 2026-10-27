// WordPress slots the customer's answers do not name are written from their brief.
//
// 🔒 UNTIL NOW WORDPRESS COULD ONLY WRITE WHAT THE CUSTOMER LITERALLY TYPED. `planContractWrites`
// maps a slot to an ANSWER and skips every slot naming none — "no input; the quickstart keeps its
// own words". With five answers that is a handful of slots, which is why `tracy-base/wp7` declared
// ten and `tracy-business/wp7` declared two.
//
// Measured 22/09/2026 on `site-cpdt5z`: 779 published pages and posts, 367 still naming the demo
// brand, ZERO carrying the customer's name — while the site title, an option WITH an input, had
// changed correctly. The body was never in reach.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { languageScope, languageWanted } from '../src/locales.mjs'
import { planWordpressContract } from '../src/plan-wordpress-contract.mjs'

const mapOf = (entities, slots) => ({ entities, slots })
const page = (key, language) => ({ key, kind: 'page', identity: { postType: 'page', slug: key, language } })
const slot = (key, entity, extra = {}) => ({
  key,
  entity,
  target: { block: key, attr: 'content' },
  type: 'text',
  sample: 'demo words',
  maxCharacters: 120,
  label: key,
  ...extra
})

test('a slot the answers do not name is written from the brief', async () => {
  const asked = []
  const generate = async ({ input }) => {
    for (const s of input.slots) asked.push(s.key)
    return JSON.stringify({ values: { 'home.hero': 'Honda cars, sold well' }, pending: [] })
  }
  const out = await planWordpressContract({
    contentMap: mapOf([page('home', 'en')], [slot('home.hero', 'home')]),
    site: { name: 'bán xe honda', languages: ['en-us'] },
    generate
  })
  assert.deepEqual(asked, ['home.hero'])
  assert.equal(out.changes['home.hero'], 'Honda cars, sold well')
})

test('a slot that names an input is the customer’s own words and never reaches the model', async () => {
  const asked = []
  const generate = async ({ input }) => {
    for (const s of input.slots) asked.push(s.key)
    return JSON.stringify({ values: {}, pending: [] })
  }
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en')],
      [slot('site.name', 'home', { input: 'name' }), slot('home.hero', 'home')]
    ),
    site: { name: 'x', languages: ['en'] },
    generate,
    hasInput: new Set(['site.name'])
  })
  assert.deepEqual(asked, ['home.hero'], 'only the unnamed slot is asked about')
  assert.equal(out.changes['site.name'], undefined)
})

test('a slot already written some other way is not asked about again', async () => {
  // 🔒 TWO GUARDS, AND THE TEST ABOVE ONLY PINS ONE. It gives the slot both an `input` AND a place
  // in `hasInput`, so deleting the `hasInput` check leaves it green — measured. This case gives a
  // slot NO input and only a place in `hasInput`, which is the shape a caller creates when the
  // answers filled it by another road.
  const asked = []
  const generate = async ({ input }) => {
    for (const s of input.slots) asked.push(s.key)
    return JSON.stringify({ values: {}, pending: [] })
  }
  await planWordpressContract({
    contentMap: mapOf([page('home', 'en')], [slot('already.done', 'home'), slot('home.hero', 'home')]),
    site: { languages: ['en'] },
    generate,
    hasInput: new Set(['already.done'])
  })
  assert.deepEqual(asked, ['home.hero'], `asked: ${asked.join(', ')}`)
})

test('🔒 the other 40 Polylang editions are never planned', async () => {
  // `tracy-business/wp7` ships 41 editions of the same site — 574 published pages, 19 posts per
  // language (measured 22/09/2026). Planning them all would ask the model to rewrite the
  // customer's business in 41 languages they never asked for.
  const asked = []
  const generate = async ({ input }) => {
    for (const s of input.slots) asked.push(s.key)
    return JSON.stringify({ values: {}, pending: [] })
  }
  const entities = [page('home', 'en'), page('home-de', 'de'), page('home-ru', 'ru')]
  const slots = [slot('en.hero', 'home'), slot('de.hero', 'home-de'), slot('ru.hero', 'home-ru')]
  await planWordpressContract({
    contentMap: mapOf(entities, slots),
    site: { name: 'x', languages: ['en-us'] },
    generate
  })
  assert.deepEqual(asked, ['en.hero'], `only the chosen edition — asked: ${asked.join(', ')}`)
})

test('an answer that is too long, or a model that never answers, keeps the demo words and says why', async () => {
  const long = async () => JSON.stringify({ values: { 'home.hero': 'x'.repeat(400) }, pending: [] })
  const out = await planWordpressContract({
    contentMap: mapOf([page('home', 'en')], [slot('home.hero', 'home')]),
    site: { languages: ['en'] },
    generate: long
  })
  assert.equal(out.changes['home.hero'], undefined)
  assert.equal(out.reasons['home.hero'], 'too-long')

  // 🔒 A MODEL OUTAGE MAY NOT COST A CUSTOMER THEIR SITE. The demo words stay, the build goes on,
  // and the report names the slots — the same ending the Joomla planner gives.
  const dead = async () => {
    throw new Error('no route')
  }
  const down = await planWordpressContract({
    contentMap: mapOf([page('home', 'en')], [slot('home.hero', 'home')]),
    site: { languages: ['en'] },
    generate: dead
  })
  assert.deepEqual(down.pending, ['home.hero'])
  assert.equal(down.reasons['home.hero'], 'model-unavailable')
})

test('the rule itself: unknown language is written, spellings match by primary subtag, no choice is English', () => {
  assert.equal(languageWanted('en-GB', new Set(['en'])), true)
  assert.equal(languageWanted('ru-RU', new Set(['en'])), false)
  assert.equal(languageWanted(null, new Set(['en'])), true, 'unknown is written, never dropped on a guess')
  assert.deepEqual([...languageScope({ languages: ['en-US', 'vi'] })], ['en', 'vi'])
  assert.deepEqual([...languageScope({})], ['en'], 'no answer means English (David, 23/09/2026)')
  assert.deepEqual([...languageScope({ languages: [] })], ['en'])
})

test('🔒 no language chosen: only the English edition is written, and the others keep their words', async () => {
  // A build with no `languages` answer used to plan every edition the quickstart ships — 41 on
  // `tracy-business/wp7` — writing the brief into languages the customer never named.
  const asked = []
  const generate = async ({ input }) => {
    for (const s of input.slots) asked.push(s.key)
    return JSON.stringify({ values: {}, pending: [] })
  }
  const entities = [page('home', 'en'), page('home-de', 'de'), page('home-ru', 'ru'), page('shared')]
  const slots = [
    slot('en.hero', 'home'),
    slot('de.hero', 'home-de'),
    slot('ru.hero', 'home-ru'),
    slot('shared.hero', 'shared')
  ]
  await planWordpressContract({ contentMap: mapOf(entities, slots), site: { name: 'x' }, generate })
  assert.deepEqual(
    asked,
    ['en.hero', 'shared.hero'],
    `English, and what no language can be told for — asked: ${asked.join(', ')}`
  )
})

test('🔒 every slot names its edition language, and the prompt makes that the language to write in', async () => {
  // Measured 23/09/2026 on `wp-oyib7i`: answers typed in Vietnamese, editions `en-us` + `de-de`.
  // With no language in the input, the model wrote 146 slots of the English edition in Vietnamese.
  const seen = []
  const batches = []
  let system = ''
  const generate = async ({ system: words, input }) => {
    system = words
    batches.push(input.language)
    seen.push(...input.slots.map((s) => [s.key, s.language]))
    return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
  }
  const site = { name: 'Toyota Hà Nội', about: 'Đại lý xe Toyota chính hãng', languages: ['en-us', 'de-de'] }
  await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en'), page('home-de', 'de'), { key: 'site', kind: 'option', identity: {} }],
      [slot('home.hero', 'home'), slot('home-de.hero', 'home-de'), slot('site.note', 'site')]
    ),
    site,
    generate
  })
  assert.deepEqual(seen, [
    ['home.hero', 'en'],
    ['home-de.hero', 'de'],
    // An option names no edition: it is the source's, written in English and SAID so — never left to the model to guess
    // (TCH #1013: JA Nova wp7, no entity labelled, a bakery "in Dubai" came out in Arabic).
    ['site.note', 'en-us']
  ])
  assert.deepEqual(batches, [undefined], 'a batch whose slots differ names no single language')
  assert.match(system, /whatever language the brief is written in/)

  // A batch whose slots share one language says it once, at the top — the field a model reads. A
  // per-slot field alone still let a dry run write 11 of 15 English values in Vietnamese.
  await planWordpressContract({
    contentMap: mapOf([page('home', 'en')], [slot('home.hero', 'home'), slot('home.intro', 'home')]),
    site,
    generate
  })
  assert.deepEqual(batches, [undefined, 'en'])
})

test('🔒 an empty answer for a slot that holds words is pending, never a change that blanks the page', async () => {
  // Measured 23/09/2026 on `wp-5r1sij`: the model answered "" for the hero heading, intro and both
  // buttons, the writer wrote them, and `/` went out with an empty <h1> and no buttons.
  const generate = async () =>
    JSON.stringify({
      values: { 'home.hero': '', 'home.blank': '', 'home.intro': '   ' },
      pending: ['home.hero']
    })
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en')],
      [slot('home.hero', 'home'), slot('home.blank', 'home', { sample: '' }), slot('home.intro', 'home')]
    ),
    site: { languages: ['en'] },
    generate
  })
  assert.equal(out.changes['home.hero'], undefined)
  assert.equal(out.reasons['home.hero'], 'model-emptied')
  assert.equal(out.changes['home.intro'], undefined, 'whitespace is empty too')
  assert.equal(out.reasons['home.intro'], 'model-emptied')
  assert.equal(out.changes['home.blank'], '', 'an empty sample may stay empty')
  assert.deepEqual(out.pending.toSorted(), ['home.hero', 'home.intro'], 'each slot is pending once')
})

// ── A batch written in the brief's language ─────────────────────────────────────────────────────
//
// Measured 23/09/2026 with `--dry` on `wp-g4bjus` (a Vietnamese brief, the English edition): with
// the language named on the batch and on every slot, one run in three still wrote 11 Vietnamese
// values, all in one batch of 35. Nothing after this planner refuses such a value.

const vietnamese = 'Đại lý xe Toyota chính hãng tại Hà Nội'
const english = 'An authorised Toyota dealer in Hà Nội'
const englishSite = { name: 'Toyota Hà Nội', about: 'Đại lý xe Toyota chính hãng', languages: ['en-us'] }
const twoSlots = () =>
  mapOf(
    [page('home', 'en')],
    [slot('home.hero', 'home', { sample: 'Built for the way you drive' }), slot('home.intro', 'home')]
  )

test('🔒 a batch written in the brief’s language is asked again, and the complaint names the slots', async () => {
  const inputs = []
  const generate = async ({ input }) => {
    inputs.push(input)
    return JSON.stringify(
      inputs.length === 1
        ? {
            values: { 'home.hero': vietnamese, 'home.intro': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe' },
            pending: []
          }
        : { values: { 'home.hero': english, 'home.intro': 'We service every car we sell' }, pending: [] }
    )
  }
  const out = await planWordpressContract({ contentMap: twoSlots(), site: englishSite, generate })
  assert.equal(inputs.length, 2, 'one retry')
  assert.equal(out.askedAgain, 1, 'and the build log can say so')
  assert.equal(inputs[0].fix, undefined)
  assert.match(inputs[1].fix, /2 value\(s\) in another language.*home\.hero, home\.intro.*\(en\)/)
  assert.deepEqual(out.changes, { 'home.hero': english, 'home.intro': 'We service every car we sell' })
  assert.deepEqual(out.pending, [])
})

test('a value still in the wrong language after every retry keeps the demo words and says why', async () => {
  let calls = 0
  const generate = async () => {
    calls += 1
    return JSON.stringify({
      values: { 'home.hero': english, 'home.intro': 'Liên hệ với chúng tôi để đặt lịch' },
      pending: []
    })
  }
  const out = await planWordpressContract({ contentMap: twoSlots(), site: englishSite, generate })
  assert.equal(calls, 3)
  assert.equal(out.askedAgain, 2)
  assert.equal(out.changes['home.hero'], english)
  assert.equal(out.changes['home.intro'], undefined, 'never written into the English edition')
  assert.equal(out.reasons['home.intro'], 'wrong-language')
})

test('a retry that comes back worse does not replace the answer that was nearly right', async () => {
  const answers = [
    { 'home.hero': english, 'home.intro': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe' },
    { 'home.hero': vietnamese, 'home.intro': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe' },
    { 'home.hero': vietnamese, 'home.intro': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe' }
  ]
  let calls = 0
  const generate = async () => JSON.stringify({ values: answers[calls++], pending: [] })
  const out = await planWordpressContract({ contentMap: twoSlots(), site: englishSite, generate })
  assert.equal(out.changes['home.hero'], english, 'the first answer is the one kept')
  assert.equal(out.reasons['home.intro'], 'wrong-language')
})

test('names keep their spelling: the customer’s name and a place in an English value are not a wrong language', async () => {
  // 🔒 "Toyota Hà Nội" IS RIGHT IN THE ENGLISH EDITION — the reason the check reads lower-case words
  // only, and takes the brief's own name out first (a name may be typed in lower case).
  let calls = 0
  const generate = async () => {
    calls += 1
    return JSON.stringify({
      values: { 'home.hero': 'bán xe honda: Honda cars, sold well', 'home.intro': english },
      pending: []
    })
  }
  const out = await planWordpressContract({
    contentMap: twoSlots(),
    site: { name: 'bán xe honda', languages: ['en'] },
    generate
  })
  assert.equal(calls, 1, 'nothing to complain about')
  assert.deepEqual(Object.keys(out.changes).toSorted(), ['home.hero', 'home.intro'])
})

test('🔒 a link slot keeps only a destination the site has and the plugin takes; any other keeps the template’s link and says why', async () => {
  // The plugin refuses a whole contract apply for one link it will not take (`QuickstartContract::urlAllowed`: no
  // whitespace, no bare `#`, https/mailto/tel/`/path`/`#anchor` only), and a path the site has no page at is a button
  // that leads nowhere. Measured 05/10/2026 planning a one-language WordPress template: per plan 1–3 refused links
  // (`#`, a `tel:` with spaces) and 15–18 links to pages the template does not have.
  const link = (key, sample) =>
    slot(key, 'home', { type: 'url', target: { block: key, attr: 'url' }, sample })
  const answers = {
    'home.hero.cta.url': '/book-online',
    'home.band.cta.url': '/studio/visit',
    'home.card.cta.url': '#',
    'home.call.cta.url': 'tel:+48 22 555 01 23',
    'home.mail.cta.url': 'mailto:hello@harbour-yoga.test',
    'home.map.cta.url': 'https://maps.example.test/?q=Gdynia',
    'home.plain.cta.url': 'http://elsewhere.test/page',
    'home.page.cta.url': '/schedule/',
    'home.anchor.cta.url': '#classes'
  }
  const generate = async () => JSON.stringify({ values: answers, pending: [] })
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en'), page('schedule', 'en')],
      [
        link('home.hero.cta.url', '/studio/visit'),
        link('home.band.cta.url', '/studio/join'),
        link('home.card.cta.url', '/studio/join'),
        link('home.call.cta.url', '/studio/join'),
        link('home.mail.cta.url', '/studio/join'),
        link('home.map.cta.url', '/studio/join'),
        link('home.plain.cta.url', '/studio/join'),
        link('home.page.cta.url', '/studio/join'),
        link('home.anchor.cta.url', '/studio/join')
      ]
    ),
    site: { name: 'Harbour Yoga', languages: ['en'] },
    generate
  })
  // A destination the template already links to, a page the site has, an anchor, and links that leave the site.
  assert.equal(out.changes['home.band.cta.url'], '/studio/visit')
  assert.equal(out.changes['home.page.cta.url'], '/schedule/')
  assert.equal(out.changes['home.anchor.cta.url'], '#classes')
  assert.equal(out.changes['home.mail.cta.url'], 'mailto:hello@harbour-yoga.test')
  assert.equal(out.changes['home.map.cta.url'], 'https://maps.example.test/?q=Gdynia')
  // A phone link is the same number without the spaces the plugin refuses.
  assert.equal(out.changes['home.call.cta.url'], 'tel:+48225550123')
  // A page the site does not have, a bare `#`, a plain-http link to another host: the template's link stays.
  assert.equal(out.changes['home.hero.cta.url'], undefined)
  assert.equal(out.reasons['home.hero.cta.url'], 'unknown-page')
  assert.equal(out.reasons['home.card.cta.url'], 'unsupported-url')
  assert.equal(out.reasons['home.plain.cta.url'], 'unsupported-url')
  assert.ok(out.pending.includes('home.hero.cta.url') && out.pending.includes('home.card.cta.url'))
})

test('a planned link to the site is compared as a page, the way WordPress names it; a query or an empty anchor must be the template’s own', async () => {
  const link = (key, sample) =>
    slot(key, 'home', { type: 'url', target: { block: key, attr: 'url' }, sample })
  const answers = {
    'home.a.url': '/Schedule/',
    'home.b.url': '/%E5%85%B3%E4%BA%8E',
    'home.c.url': '/?page_id=999',
    'home.d.url': '/?page_id=12',
    'home.e.url': '/#',
    'home.f.url': '#'
  }
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en'), page('schedule', 'en'), page('%e5%85%b3%e4%ba%8e', 'en')],
      [
        link('home.a.url', '/studio/join'),
        link('home.b.url', '/studio/join'),
        link('home.c.url', '/studio/join'),
        link('home.d.url', '/?page_id=12'),
        link('home.e.url', '/studio/join'),
        link('home.f.url', '#')
      ]
    ),
    site: { name: 'Harbour Yoga', languages: ['en'] },
    generate: async () => JSON.stringify({ values: answers, pending: [] })
  })
  assert.equal(out.changes['home.a.url'], '/Schedule/')
  assert.equal(out.changes['home.b.url'], '/%E5%85%B3%E4%BA%8E')
  assert.equal(out.reasons['home.c.url'], 'unknown-page')
  // The template's own link said back is no change and no failure.
  assert.equal(out.changes['home.d.url'], undefined)
  assert.equal(out.reasons['home.d.url'], 'unchanged')
  assert.equal(out.reasons['home.e.url'], 'unsupported-url')
  assert.equal(out.reasons['home.f.url'], 'unchanged')
  assert.equal(out.pending.includes('home.f.url'), false)
})

test('🔒 a site written in one other language writes its source edition in that language, and its letters are not refused', async () => {
  const asked = []
  const generate = async ({ input }) => {
    asked.push(input)
    const values = Object.fromEntries(input.slots.map((s) => [s.key, 'phở ngon ở Hà Nội']))
    return JSON.stringify({ values, pending: [] })
  }
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en'), { key: 'opt', kind: 'option' }, page('home-de', 'de')],
      [slot('home.hero', 'home'), slot('site.tagline', 'opt'), slot('de.hero', 'home-de')]
    ),
    site: { name: 'x', languages: ['vi-vn'], sourceLanguage: 'vi-vn' },
    generate
  })
  assert.deepEqual(
    asked.flatMap((i) => i.slots.map((s) => [s.key, s.language])),
    [
      ['home.hero', 'vi-vn'],
      ['site.tagline', 'vi-vn']
    ],
    'the source edition and the slots with no edition are the chosen language; another edition is not planned'
  )
  assert.equal(asked[0].language, 'vi-vn')
  assert.equal(
    out.changes['home.hero'],
    'phở ngon ở Hà Nội',
    'the English samples do not teach the check its letters'
  )
  assert.equal(asked.length, 1, 'never asked again for a wrong language')
})

test('🔒 the model is shown samples as a visitor reads them, and an entity it writes back is the character, not the escape', async () => {
  // Measured 08/10/2026 on tamq-7q-bizwp4 (tracy-business/wp7 1.3.4): the sample "ISO 9001 &amp; ISO 45001 certified" taught
  // the model to answer "Bánh sourdough &amp; bánh Việt"; the contract escaped it again and the home page showed "&amp;".
  const asked = []
  const generate = async ({ input }) => {
    asked.push(...input.slots)
    return JSON.stringify({ values: { 'home.point': 'Bánh sourdough &amp; bánh Việt' }, pending: [] })
  }
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en')],
      [slot('home.point', 'home', { sample: 'ISO 9001 &amp; ISO 45001 certified' })]
    ),
    site: { name: 'Tamarind Bakery', languages: ['en'] },
    generate
  })
  assert.equal(asked[0].sample, 'ISO 9001 & ISO 45001 certified')
  assert.equal(out.changes['home.point'], 'Bánh sourdough & bánh Việt')
})

test('🔒 a model that answers the word "null" for a slot has said nothing: the slot is pending, never written as "null"', async () => {
  // Measured 08/10/2026 on tamq-7q-bizwp4: the footer printed "null" under Contact (identity.contact.hours, which no question asks).
  const generate = async () =>
    JSON.stringify({ values: { 'identity.contact.hours': 'null', 'home.hero': ' Undefined ' }, pending: [] })
  const out = await planWordpressContract({
    contentMap: mapOf(
      [page('home', 'en'), { key: 'opt', kind: 'option' }],
      [
        slot('identity.contact.hours', 'opt', { sample: 'Mon–Fri, 9:00–18:00 (MSK)' }),
        slot('home.hero', 'home')
      ]
    ),
    site: { name: 'Tamarind Bakery', languages: ['en'] },
    generate
  })
  assert.equal(out.changes['identity.contact.hours'], undefined)
  assert.equal(out.changes['home.hero'], undefined)
  assert.ok(out.pending.includes('identity.contact.hours'))
  assert.equal(out.reasons['identity.contact.hours'], 'model-null')
})

// ── The contact page's path (13/10/2026: JA Nova wp7 keeps Contact under About) ──────────────────────────────────

test('contactPathOf: the template’s own link when the contact page is a child, else the slug at the root', async () => {
  const { contactPathOf, destinationsOf } = await import('../src/plan-wordpress-contract.mjs')
  const nova = mapOf(
    [page('about-us-2', 'en'), page('contact', 'en')],
    [slot('cta.link', 'about-us-2', { type: 'url', sample: '/about-us-2/contact/' })]
  )
  assert.equal(contactPathOf(page('contact', 'en'), destinationsOf(nova)), '/about-us-2/contact')
  const flat = mapOf([page('contact', 'en')], [slot('home.hero', 'home')])
  assert.equal(contactPathOf(page('contact', 'en'), destinationsOf(flat)), '/contact')
  assert.equal(contactPathOf(null, destinationsOf(flat)), null)
})
