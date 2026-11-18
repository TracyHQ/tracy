// What 1.0.3 changes: the content map is built on role vocabulary v3 (place-content-roles/3) and measured again, the contact
// card's phone and the demo place names reach Personalize, and the five documentation gaps of the 1.0.2 independent
// handover are closed (inventory/content-gaps.md G-23).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')

test('G-23: the recipient docs give a worked audit example, the Chromium install and the Chefs address', () => {
  const checks = read('docs/checks-and-recovery.md')
  assert.match(checks, /node tools\/audit\.mjs <origin> <new out dir> --config template\.config\.json/)
  assert.match(checks, /pnpm exec playwright install chromium/)
  assert.match(checks, /a Pages\s+entry's title is not printed by every page view/)
  assert.match(checks, /`\/pages\/chefs`/)
  assert.match(checks, /loading="lazy"/)
  assert.match(read('README.md'), /the Chefs page is the post `chefs` at `\/pages\/chefs`/)
  assert.doesNotMatch(read('README.md'), /no browser setup is needed beyond `pnpm install`/)
})

test('G-23: the release-tool cases that need a Tracy checkout skip in the package and say why', () => {
  assert.match(
    read('tests/release-site-pages.test.mjs'),
    /const needsCheckout = \{\s*skip: CHECKOUT \? false\s*: '/
  )
})

test('1.0.3 is the version the template, the package and the image label name', () => {
  assert.equal(JSON.parse(read('package.json')).version, '1.0.3')
  assert.equal(JSON.parse(read('template.config.json')).version, '1.0.3')
  assert.match(read('Dockerfile'), /io\.tracy\.template\.version="1\.0\.3"/)
})

test('independent review of 1.0.3, item 1: the shipped row-limits test reads contracts/ only behind its skip', () => {
  const t = read('tests/personalize-row-limits.test.mjs')
  assert.doesNotMatch(t, /^const kit = /m, 'no module-level read of a contract')
  assert.match(
    t,
    /const inRepo = \{\s*skip: existsSync\(KIT\) \? false : `contracts\/\$\{VERSION\}\/template-kit\.json is not shipped: a repository test`/
  )
  assert.match(t, /the number the contract measured', inRepo, \(\) =>/)
})

test('independent review of 1.0.3, item 2: with an address, the footer map follows the brief and no rule-owned field keeps the demo street', async () => {
  const { demoPlaceWordsOf, demoPlacesBesides, withoutDemoPlace } = await import('../tools/personalize.mjs')
  const map = JSON.parse(read('seed/personalize.json'))
  const seed = JSON.parse(read('seed/seed.json'))
  const rule = map.identity.find((r) => r.collection === 'chrome' && r.field === 'footer_map_url')
  assert.deepEqual([rule?.value, rule?.unanswered], ['{map}', 'keep-demo'])
  const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
    rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data }))
  )
  const facts = { address: '1 Main St, Springfield' }
  const places = demoPlacesBesides(demoPlaceWordsOf(map, entries), facts)
  assert.ok(places.has('5th Avenue') && places.has('Brooklyn'))
  const owned = [
    ...map.copy.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.rewrite.map((r) => [r.collection, r.slugs ?? null, r.fields]),
    ...map.blocks.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.facts.map((r) => [r.collection, [r.slug], [r.field]])
  ]
  const left = []
  for (const e of entries)
    for (const [c, slugs, fields] of owned)
      if (c === e.collection && (slugs === null || slugs.includes(e.slug)))
        for (const f of fields) {
          const v = withoutDemoPlace(e.data?.[f], places, facts) ?? e.data?.[f]
          if (/5th Avenue|St\. Marks|Cathedral District|Brooklyn/.test(JSON.stringify(v ?? '')))
            left.push(`${c}/${e.slug}.${f}`)
        }
  assert.deepEqual(left, [])
})

test('second and third review rounds of 1.0.3: with an address, a detachable demo place leaves the words around it, a core one takes its sentence, no heading is emptied, the 1982 card and the band keep their words', async () => {
  const { demoPlaceWordsOf, demoPlacesBesides, withoutDemoPlace } = await import('../tools/personalize.mjs')
  const map = JSON.parse(read('seed/personalize.json'))
  const seed = JSON.parse(read('seed/seed.json'))
  const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
    rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data }))
  )
  const facts = { address: '1 Main St, Springfield', phone: '+1 555 0100' }
  const places = demoPlacesBesides(demoPlaceWordsOf(map, entries), facts)
  const owned = [
    ...map.copy.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.rewrite.map((r) => [r.collection, r.slugs ?? null, r.fields]),
    ...map.blocks.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.facts.map((r) => [r.collection, [r.slug], [r.field]])
  ]
  // the lane's own neutral value: the entry's title for its heading-like fields and its body
  const HEADING = /^(?:title|name|heading|label|alt|caption|lead_title)$/
  const after = new Map()
  for (const e of entries)
    for (const [c, slugs, fields] of owned)
      if (c === e.collection && (slugs === null || slugs.includes(e.slug)))
        for (const f of fields) {
          const fallback = HEADING.test(f) || f === 'body' ? (e.data.title ?? null) : null
          const v = withoutDemoPlace(e.data?.[f], places, facts, { fallback })
          after.set(`${c}/${e.slug}.${f}`, v ?? e.data?.[f])
        }
  const at = (k) => after.get(k)
  const textOf = (blocks) => blocks.map((b) => b.children.map((s) => s.text).join('')).join(' | ')
  // the page's h1 the package audit counts, and every heading block of every body, keep words
  for (const [k, v] of after)
    if (Array.isArray(v) && v.some((b) => b?._type === 'block'))
      for (const b of v)
        if (/^h[1-6]$/.test(String(b.style)))
          assert.match(b.children.map((s) => s.text).join(''), /\p{L}{2,}/u, `${k}: an empty ${b.style}`)
  // every heading-like field and every card title that had words keeps words
  for (const e of entries)
    for (const [c, slugs, fields] of owned)
      if (c === e.collection && (slugs === null || slugs.includes(e.slug)))
        for (const f of fields) {
          const v = at(`${c}/${e.slug}.${f}`)
          if (HEADING.test(f) && typeof e.data?.[f] === 'string' && e.data[f] !== '')
            assert.notEqual(v, '', `${c}/${e.slug}.${f}`)
          if (Array.isArray(v))
            v.forEach((row, i) => {
              if (
                row &&
                typeof row === 'object' &&
                typeof e.data[f][i]?.title === 'string' &&
                e.data[f][i].title !== ''
              )
                assert.notEqual(row.title, '', `${c}/${e.slug}.${f}[${i}].title`)
            })
        }
  // Our History: the h1, the band, the caption (and so the picture's alt), the timeline intro
  assert.equal(
    at('pages/our-history.body')[0]
      .children.map((s) => s.text)
      .join(''),
    'Four decades'
  )
  assert.equal(at('pages/our-history.lead_title'), 'Cooking since 1982')
  assert.equal(
    at('pages/our-history.lead_text'),
    seed.content.pages.find((e) => e.slug === 'our-history').data.lead_text
  )
  assert.equal(at('pages/our-history.caption'), 'Our dining room')
  // "a Brooklyn favourite": the place is inside a phrase, not a detachable modifier, so its only sentence goes (third
  // review round); the intro is no heading, so it is left empty and the view draws none
  assert.equal(at('timeline/our-history-timeline.section_intro'), '')
  // the home welcome: "has welcomed Brooklyn to" is a core argument, the sentence goes; its paragraph keeps the next one
  const welcome = at('hero/welcome-to-res-bar-restaurant.hero_intro')
  assert.equal(welcome.length, 1)
  assert.match(welcome[0].children.map((s) => s.text).join(''), /^Our kitchen cooks seasonal market produce/)
  // the 1982 card keeps its title and its founding sentence
  const card = at('timeline/our-history-timeline.items').find((r) => r.date === '1982-05-14')
  assert.equal(card.title, 'Doors open')
  assert.match(
    card.description,
    /^RES opened as a twelve-table neighborhood bar, serving .* to the people\. The first menu/
  )
  assert.doesNotMatch(textOf(at('pages/our-history.body')), /5th Avenue|Brooklyn|St\. Marks|Cathedral/)
})

test("second independent review of 1.0.3: the footer contact lines follow the contact card (no demo phone, fax or e-mail beside the brief's phone)", () => {
  const map = JSON.parse(read('seed/personalize.json'))
  const rule = map.identity.find((r) => r.collection === 'chrome' && r.field === 'footer_contact')
  assert.deepEqual(rule?.rows, {
    Phone: { value: '{phone}', href: '{tel}' },
    Fax: { dropWhen: ['phone'] },
    Email: { value: '{email}', href: 'mailto:{email}', dropWhen: ['phone', 'address'] }
  })
})

test('third independent review of 1.0.3: a phone in the brief replaces the demo phone in every seed field, with or without an address; the whole-seed scan is clean', async () => {
  const { demoContactsLeft, demoContactsOf, withCustomerContacts } = await import('../tools/personalize.mjs')
  const map = JSON.parse(read('seed/personalize.json'))
  const seed = JSON.parse(read('seed/seed.json'))
  const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
    rows.map((row) => ({ collection, slug: row.slug, data: row.data }))
  )
  const demo = demoContactsOf(map, entries)
  assert.ok([...demo.phones].includes('0845550110'), 'the demo phone is read from the rules')
  assert.ok(
    [...demo.domains].includes('res-restaurant.example'),
    'the demo e-mail domain is read from the rules'
  )
  const scan = (facts) => {
    const left = []
    for (const e of entries) {
      for (const [field, value] of Object.entries(e.data)) {
        const after = withCustomerContacts(value, demo, facts, field) ?? value
        for (const hit of demoContactsLeft(after, demo, facts))
          left.push(`${e.collection}/${e.slug}.${field}: ${hit}`)
      }
    }
    return left
  }
  const phone = { phone: '+1 555 0100', tel: 'tel:+15550100' }
  assert.deepEqual(scan({ ...phone, address: '1 Main St, Springfield' }), [], 'an address and a phone')
  assert.deepEqual(
    scan(phone),
    [],
    'a phone only: the contact page, the phone reservation page and /offers too'
  )
  assert.deepEqual(scan({ ...phone, email: 'hi@bistro.test' }), [], 'a phone and an e-mail')
  // with no contact in the brief, nothing is checked and the demo's contacts stay (keep-demo)
  assert.deepEqual(scan({}), [])
  const offers = entries.find(
    (e) => e.collection === 'happyhours' && typeof e.data.hp_other_info === 'string'
  )
  assert.ok(offers, 'the /offers line is a field no identity rule names')
  assert.doesNotMatch(
    withCustomerContacts(offers.data.hp_other_info, demo, phone) ?? '',
    /555.0110|res-restaurant\.example/
  )
})

test('third independent review of 1.0.3: the brand "RES" is renamed as a whole word (the two meal captions), never inside RESERVATIONS or the demo web address', async () => {
  const { nameRulesOf, replaceDeep } = await import('../tools/personalize.mjs')
  const map = JSON.parse(read('seed/personalize.json'))
  const { rules } = nameRulesOf(map, { name: 'Test Bistro' })
  assert.ok(rules.some((r) => r.find === 'RES' && r.word))
  assert.equal(replaceDeep('Lunch at RES', rules), 'Lunch at Test Bistro')
  assert.equal(replaceDeep('Dinner at RES', rules), 'Dinner at Test Bistro')
  assert.equal(
    replaceDeep('RESERVATIONS at res-restaurant.example', rules),
    'RESERVATIONS at res-restaurant.example'
  )
})

test('code review of 1.0.3: with a name that holds the demo place ("Brooklyn Bistro"), the renamed words keep the customer\'s name whole; the demo\'s own place still goes', async () => {
  const { demoPlaceWordsOf, demoPlacesBesides, nameRulesOf, replaceDeep, withoutDemoPlace } = await import(
    '../tools/personalize.mjs'
  )
  const map = JSON.parse(read('seed/personalize.json'))
  const seed = JSON.parse(read('seed/seed.json'))
  const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
    rows.map((e) => ({ collection, slug: e.slug, data: e.data }))
  )
  const facts = {
    name: 'Brooklyn Bistro',
    NAME: 'BROOKLYN BISTRO',
    address: '1 Main St, Springfield',
    phone: '+1 555 0100'
  }
  const { rules } = nameRulesOf(map, facts)
  const places = demoPlacesBesides(demoPlaceWordsOf(map, entries), facts)
  assert.ok(
    places.has('Brooklyn'),
    "Brooklyn is still the demo place: the customer's address does not hold it"
  )
  const owned = [
    ...map.copy.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.rewrite.map((r) => [r.collection, r.slugs ?? null, r.fields]),
    ...map.blocks.map((r) => [r.collection, [r.slug], [r.field]]),
    ...map.facts.map((r) => [r.collection, [r.slug], [r.field]])
  ]
  const plain = (v) => JSON.stringify(v ?? '')
  const count = (s, w) => s.split(w).length - 1
  let names = 0
  let demoLeft = 0
  for (const e of entries)
    for (const [c, slugs, fields] of owned)
      if (c === e.collection && (slugs === null || slugs.includes(e.slug)))
        for (const f of fields) {
          const renamed = replaceDeep(e.data?.[f], rules)
          const after =
            withoutDemoPlace(renamed, places, facts, { fallback: e.data.title ?? null }) ?? renamed
          // the name is never cut through: no "Bistro" is left without its "Brooklyn" (a whole sentence may go, D85)
          assert.equal(
            count(plain(after), 'Bistro'),
            count(plain(after), 'Brooklyn Bistro'),
            `${c}/${e.slug}.${f}`
          )
          names += count(plain(after), 'Brooklyn Bistro')
          demoLeft += count(plain(after).replaceAll('Brooklyn Bistro', ''), 'Brooklyn')
        }
  assert.ok(names > 0, "the rename wrote the customer's name into the owned fields")
  const hero = entries.find((e) => e.collection === 'hero' && e.slug === 'welcome-to-res-bar-restaurant')
  const heading = replaceDeep(hero.data.hero_heading, rules)
  assert.equal(
    withoutDemoPlace(heading, places, facts) ?? heading,
    heading,
    "the welcome heading keeps the customer's name"
  )
  assert.equal(demoLeft, 0, 'no demo "Brooklyn" is left outside the customer\'s name')
})
