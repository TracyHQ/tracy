/**
 * The restaurant's sourced words in the text fields of an EmDash demo site (tasks/plan-wo-contract-writer.md, step 3): which
 * fields the slot-role map sends each pinned value to, checked against the templates' REAL seeds (a release that renames a
 * field turns this red), and the engine step that writes them over a stand-in for the site's content API.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { emdashCopyWrites, writeWoCopy } from '../src/sites/brief-engines/emdash-wo-copy.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const THEMES = path.resolve(HERE, '../../../packages/cms')
const MAP = JSON.parse(
  readFileSync(
    path.resolve(HERE, '../../../packages/wo/website-opportunities/domain/slot-roles/emdash.json'),
    'utf8'
  )
)
const seedOf = (pkg) => JSON.parse(readFileSync(path.join(THEMES, pkg, 'seed', 'seed.json'), 'utf8'))
const BASE = { map: MAP.themes['tracy-base'], seed: seedOf('tracy-emdash-theme-base') }
const BUSINESS = { map: MAP.themes['tracy-business'], seed: seedOf('tracy-emdash-theme-business') }

const dish = (n) => ({
  value: { title: `Dish ${n}`, text: `Dish ${n} is slow cooked.` },
  source: `post:ig:${n}`
})
const PINNED = {
  'hero.title': { value: 'The Larch House', source: 'business.name' },
  'hero.lead': { value: 'A Highland kitchen in Hoi An.', source: 'profile.bio' },
  'hero.cta': { value: { label: 'Call', href: 'tel:+842350000102' }, source: 'business.phone' },
  'about.story': {
    value: { title: 'The Blue Door', text: 'We opened in Sapa in 2015.' },
    source: 'post:fb:1'
  },
  cards: [1, 2, 3, 4].map(dish),
  contact: { phone: { value: '+84 235', source: 'business.phone' } }
}
const entry = (writes, collection) => writes.find((w) => w.collection === collection)

test('every mapped field is a field of the seed it names, of a kind the writer knows', () => {
  for (const [id, theme] of Object.entries(MAP.themes)) {
    const seed = seedOf(theme.package)
    const groups = [...Object.values(theme.roles), ...(theme.cards ? [theme.cards] : [])]
    for (const g of groups) {
      const schema = seed.collections.find((c) => c.slug === g.collection)
      assert.ok(schema, `${id}: collection ${g.collection}`)
      const data = seed.content[g.collection].find(
        (e) => e.slug === g.slug && (e.locale ?? seed.defaultLocale) === seed.defaultLocale
      )?.data
      assert.ok(data, `${id}: entry ${g.collection}/${g.slug}`)
      if (g.list) {
        // A list group names the fields of the list's items.
        const list = schema.fields.find((x) => x.slug === g.list)
        assert.equal(list?.type, 'repeater', `${id}: ${g.list} is a list`)
        assert.ok(Array.isArray(data[g.list]) && data[g.list].length > 0, `${id}: ${g.list} has items`)
        for (const f of g.fields) {
          const sub = list.validation.subFields.find((x) => x.slug === f.field)
          assert.ok(['string', 'text'].includes(sub?.type), `${id}: ${g.list}[].${f.field} is ${sub?.type}`)
          assert.ok(f.field in data[g.list][0], `${id}: ${g.list}[0].${f.field} in the seed`)
        }
        continue
      }
      for (const f of g.fields ?? [{ field: g.field }]) {
        const type = schema.fields.find((x) => x.slug === f.field)?.type
        assert.ok(
          ['string', 'text', 'portableText', 'repeater'].includes(type),
          `${id}: ${f.field} is ${type}`
        )
        assert.ok(f.field in data, `${id}: ${g.collection}/${g.slug}.${f.field} in the seed`)
      }
    }
  }
})

test('Tracy Base: hero title, lead and button on the home page, the story on About; no dish cards', () => {
  const { writes, skipped } = emdashCopyWrites({ ...BASE, pinned: PINNED })
  assert.deepEqual(entry(writes, 'home'), {
    collection: 'home',
    slug: 'home',
    locale: 'en',
    roles: ['hero.title', 'hero.lead', 'hero.cta'],
    fields: {
      hero_title: 'The Larch House',
      hero_lead: 'A Highland kitchen in Hoi An.',
      hero_cta1_label: 'Call',
      hero_cta1_url: 'tel:+842350000102'
    },
    sources: {
      hero_title: 'business.name',
      hero_lead: 'profile.bio',
      hero_cta1_label: 'business.phone',
      hero_cta1_url: 'business.phone'
    }
  })
  assert.deepEqual(entry(writes, 'about').fields, {
    chapter1_statement: 'The Blue Door',
    chapter1_support: 'We opened in Sapa in 2015.'
  })
  assert.equal(writes.length, 2)
  assert.deepEqual(
    skipped.map((s) => s.role),
    ['testimonial', 'cards']
  )
  assert.match(skipped[1].reason, /no card group/)
})

test('Tracy Business: the name is the whole hero title; the dishes become the service cards, numbers kept', () => {
  const { writes } = emdashCopyWrites({ ...BUSINESS, pinned: PINNED })
  const home = entry(writes, 'home')
  assert.equal(home.fields.hero_title_a, 'The Larch House')
  assert.equal(home.fields.hero_title_b, '', 'no cuisine collected: the accent line is emptied')
  const accented = entry(
    emdashCopyWrites({
      ...BUSINESS,
      pinned: { ...PINNED, 'hero.accent': { value: 'Vietnamese, Highland', source: 'business.cuisine' } }
    }).writes,
    'home'
  )
  assert.equal(accented.fields.hero_title_b, 'Vietnamese, Highland')
  assert.equal(accented.sources.hero_title_b, 'business.cuisine')
  assert.equal(home.fields.hero_text, 'A Highland kitchen in Hoi An.')
  assert.deepEqual(home.fields.services_items, [
    { number: '01', title: 'Dish 1', text: 'Dish 1 is slow cooked.' },
    { number: '02', title: 'Dish 2', text: 'Dish 2 is slow cooked.' },
    { number: '03', title: 'Dish 3', text: 'Dish 3 is slow cooked.' },
    { number: '04', title: 'Dish 4', text: 'Dish 4 is slow cooked.' }
  ])
  assert.deepEqual(home.sources.services_items, ['post:ig:1', 'post:ig:2', 'post:ig:3', 'post:ig:4'])
  assert.deepEqual(entry(writes, 'about').fields, {
    mission_title: 'The Blue Door',
    mission_text: 'We opened in Sapa in 2015.'
  })
})

test('fewer dishes than cards writes no card: a dish never sits beside the model’s service lines', () => {
  const { writes, skipped } = emdashCopyWrites({
    ...BUSINESS,
    pinned: { ...PINNED, cards: [dish(1), dish(2)] }
  })
  assert.equal('services_items' in entry(writes, 'home').fields, false)
  assert.match(skipped.find((s) => s.role === 'cards').reason, /2 dish\(es\) for 4 cards/)
})

test('a role with no source is skipped; an entry with nothing to write is not listed', () => {
  const { writes, skipped } = emdashCopyWrites({ ...BASE, pinned: { 'hero.title': PINNED['hero.title'] } })
  assert.deepEqual(
    writes.map((w) => `${w.collection}:${Object.keys(w.fields)}`),
    ['home:hero_title']
  )
  assert.deepEqual(
    skipped.filter((s) => s.reason === 'no source').map((s) => s.role),
    ['hero.lead', 'hero.cta', 'about.story', 'testimonial']
  )
})

test('a group the seed no longer has a field of is skipped whole; the rest of its entry is still written', () => {
  const seed = structuredClone(BASE.seed)
  const home = seed.content.home.find((e) => e.slug === 'home' && (e.locale ?? 'en') === 'en')
  delete home.data.hero_cta1_url
  const { writes, skipped } = emdashCopyWrites({ map: BASE.map, seed, pinned: PINNED })
  const fields = entry(writes, 'home').fields
  assert.equal('hero_cta1_label' in fields, false)
  assert.equal(fields.hero_title, 'The Larch House')
  assert.match(skipped.find((s) => s.role === 'hero.cta').reason, /hero_cta1_url/)
})

test('a rich-text field takes the text as Portable Text paragraphs', () => {
  const seed = structuredClone(BASE.seed)
  const about = seed.collections.find((c) => c.slug === 'about')
  about.fields.find((f) => f.slug === 'chapter1_support').type = 'portableText'
  const { writes } = emdashCopyWrites({
    map: BASE.map,
    seed,
    pinned: { 'about.story': { value: { title: 'T', text: 'One.\n\nTwo.' }, source: 's' } }
  })
  const blocks = entry(writes, 'about').fields.chapter1_support
  assert.deepEqual(
    blocks.map((b) => b.children[0].text),
    ['One.', 'Two.']
  )
})

const REVIEW = (author, text, provider = 'Google') => ({
  value: { text, author, provider },
  source: `review:google:${author}`
})

test('Tracy Base: each testimonial card holds one review whole, its author and platform; the cards left over are emptied', () => {
  const { writes } = emdashCopyWrites({
    ...BASE,
    pinned: {
      testimonial: [
        REVIEW('Lan', 'Best phin in town.\n\nThe terrace is lovely too.'),
        REVIEW('Minh', 'Friendly staff.', 'TripAdvisor')
      ]
    }
  })
  const landing = entry(writes, 'landing')
  assert.deepEqual(landing.roles, ['testimonial'])
  assert.deepEqual(landing.fields, {}, 'the section heading and the other fields stay the tool’s')
  const cards = Object.groupBy(landing.items.testimonials_quotes, (p) => p.index)
  const card = (i) => Object.fromEntries(cards[i].map((p) => [p.sub, p.value]))
  assert.deepEqual(card(0), {
    quote: 'Best phin in town.\n\nThe terrace is lovely too.',
    name: 'Lan',
    role: 'Google'
  })
  assert.deepEqual(card(1), { quote: 'Friendly staff.', name: 'Minh', role: 'TripAdvisor' })
  // The seed's third card is a fictional client: it keeps its place, with no words of anyone.
  assert.deepEqual(card(2), { quote: '', name: '', role: '' })
  assert.equal(landing.sources['testimonials_quotes[0].quote'], 'review:google:Lan')
  assert.equal(landing.sources['testimonials_quotes[1].name'], 'review:google:Minh')
  assert.equal(landing.sources['testimonials_quotes[2].quote'], 'placeholder')
  // One pinned review (the editorial pilot's one testimonial) is a list of one.
  const one = entry(
    emdashCopyWrites({ ...BASE, pinned: { testimonial: REVIEW('Lan', 'Best phin in town.') } }).writes,
    'landing'
  )
  assert.deepEqual(
    one.items.testimonials_quotes.filter((p) => p.sub === 'name').map((p) => p.value),
    ['Lan', '', '']
  )
})

test('a review missing its author or platform is never put on a card', () => {
  const { writes, skipped } = emdashCopyWrites({
    ...BASE,
    pinned: { testimonial: [{ value: { text: 'Lovely.', author: 'Lan' }, source: 'r' }] }
  })
  assert.equal(entry(writes, 'landing'), undefined)
  assert.equal(skipped.find((s) => s.role === 'testimonial').reason, 'no source')
})

// --- the engine step ------------------------------------------------------------------------------------------------

/** A stand-in for the site's content API over the seed's entries: GET by slug, PUT a draft by id with `_rev`, publish. */
function fakeSite(seed, { failPublish = 0, movedBeforePut = 0, rowIds = false } = {}) {
  const locale = seed.defaultLocale
  const entries = new Map()
  for (const [collection, list] of Object.entries(seed.content))
    for (const [i, e] of list.entries())
      if ((e.locale ?? locale) === locale)
        entries.set(`${collection}/${e.slug}`, {
          id: `${collection}-${i}`,
          status: e.status ?? 'published',
          data: structuredClone(e.data),
          liveData: null,
          rev: 1
        })
  const byId = (id) => [...entries.values()].find((e) => e.id === id)
  const calls = []
  let publishFailures = failPublish
  const api = async (method, route, body) => {
    calls.push([method, route])
    const u = new URL(route, 'http://site')
    assert.equal(u.searchParams.get('locale'), locale, 'the default locale only')
    const [, collection, ref, action] = /^\/_emdash\/api\/content\/([^/]+)\/([^/]+)(?:\/(\w+))?$/.exec(
      u.pathname
    )
    if (method === 'GET') {
      const e = entries.get(`${collection}/${decodeURIComponent(ref)}`)
      if (!e) throw Object.assign(new Error('404'), { status: 404 })
      return {
        item: {
          id: e.id,
          status: e.status,
          data: structuredClone(e.data),
          ...(e.liveData ? { liveData: structuredClone(e.liveData), draftRevisionId: `d${e.rev}` } : {})
        },
        _rev: `r${e.rev}`
      }
    }
    const e = byId(decodeURIComponent(ref))
    if (method === 'PUT') {
      // Someone else wrote the entry between our read and this write.
      if (movedBeforePut-- > 0) e.rev += 1
      if (body._rev !== `r${e.rev}`) throw Object.assign(new Error('409 revision moved'), { status: 409 })
      e.liveData ??= structuredClone(e.data)
      // EmDash stamps every row of a list it stores with its own id.
      e.data = rowIds
        ? Object.fromEntries(
            Object.entries(body.data).map(([k, v]) => [
              k,
              Array.isArray(v)
                ? v.map((row, i) => (row && typeof row === 'object' ? { _rowId: `row-${i}`, ...row } : row))
                : v
            ])
          )
        : body.data
      e.rev += 1
      return { _rev: `r${e.rev}` }
    }
    if (action === 'publish') {
      if (publishFailures-- > 0) throw Object.assign(new Error('publish refused'), { status: 500 })
      e.liveData = null
      return {}
    }
    throw new Error(`unexpected ${method} ${route}`)
  }
  const live = (key) => {
    const e = entries.get(key)
    return e.liveData ?? e.data
  }
  return { api, calls, entries, live }
}

function fakeWoContent() {
  const store = { before: {}, writes: {} }
  return {
    store,
    async recordBefore(_buildId, key, fields) {
      store.before[key] ??= fields
      return store.before[key]
    },
    async recordWrite(_buildId, key, receipt) {
      store.writes[key] = receipt
    }
  }
}

const writesOf = (calls) => calls.filter(([m]) => m !== 'GET')

async function step({ theme = BASE, site, woContent, pinned = PINNED }) {
  const notes = []
  const done = await writeWoCopy({
    api: site.api,
    copy: { buildId: 'b1', pinned },
    map: theme.map,
    seed: theme.seed,
    woContent,
    note: (n) => notes.push(n)
  })
  return { done, notes }
}

test('written: the fields are published, read back, their words before kept once, a receipt per entry', async () => {
  const site = fakeSite(BASE.seed)
  const wo = fakeWoContent()
  const { done, notes } = await step({ site, woContent: wo })
  assert.deepEqual(notes, [])
  assert.deepEqual(done, { written: 2, skipped: 2, conflict: 0, failed: 0 })
  assert.equal(site.live('home/home').hero_title, 'The Larch House')
  assert.equal(site.live('home/home').hero_cta1_url, 'tel:+842350000102')
  assert.equal(
    site.live('home/home').hero_eyebrow,
    BASE.seed.content.home[0].data.hero_eyebrow,
    'other fields kept'
  )
  assert.equal(site.live('about/about').chapter1_statement, 'The Blue Door')
  assert.deepEqual(wo.store.before['emdash:home/home'], {
    hero_title: 'A better website starts with your business.',
    hero_lead:
      'Strategy, design and development for teams who want a clearer story and a website they can keep moving.',
    hero_cta1_label: 'Start a conversation',
    hero_cta1_url: '/contact'
  })
  assert.equal(wo.store.writes['emdash:home/home'].state, 'written')
  assert.deepEqual(wo.store.writes['emdash:home/home'].roles, ['hero.title', 'hero.lead', 'hero.cta'])
  assert.deepEqual(wo.store.writes['emdash:about/about'].sources, {
    chapter1_statement: 'post:fb:1',
    chapter1_support: 'post:fb:1'
  })
})

test('skipped: no source writes nothing; an entry the site does not publish is skipped with its reason', async () => {
  const site = fakeSite(BASE.seed)
  site.entries.get('about/about').status = 'draft'
  const wo = fakeWoContent()
  const { done } = await step({ site, woContent: wo, pinned: { 'about.story': PINNED['about.story'] } })
  assert.deepEqual(done, { written: 0, skipped: 6, conflict: 0, failed: 0 })
  assert.deepEqual(writesOf(site.calls), [])
  assert.equal(wo.store.writes['emdash:about/about'].state, 'skipped')
  assert.match(wo.store.writes['emdash:about/about'].reason, /not published/)
})

test('re-Apply: the tool rewrote the fields since the first build; ours are written again, the first words before kept', async () => {
  const site = fakeSite(BASE.seed)
  const wo = fakeWoContent()
  const pinned = { 'hero.title': PINNED['hero.title'] }
  await step({ site, woContent: wo, pinned })
  const first = structuredClone(wo.store.before)
  // The second Apply's personalize tool writes its model's title over ours.
  const home = site.entries.get('home/home')
  home.data = { ...home.data, hero_title: 'The model’s second title' }
  site.calls.length = 0
  const { done, notes } = await step({ site, woContent: wo, pinned })
  assert.deepEqual(notes, [])
  assert.deepEqual(done, { written: 1, skipped: 5, conflict: 0, failed: 0 })
  assert.equal(site.live('home/home').hero_title, 'The Larch House')
  assert.deepEqual(wo.store.before, first)
  assert.equal(wo.store.before['emdash:home/home'].hero_title, 'A better website starts with your business.')
})

test('conflict: the entry moved between our read and our write; one fresh read, then it is left alone', async () => {
  const pinned = { 'hero.title': PINNED['hero.title'] }
  const once = fakeSite(BASE.seed, { movedBeforePut: 1 })
  const retried = await step({ site: once, woContent: fakeWoContent(), pinned })
  assert.deepEqual(retried.done, { written: 1, skipped: 5, conflict: 0, failed: 0 })
  assert.equal(once.live('home/home').hero_title, 'The Larch House')

  const twice = fakeSite(BASE.seed, { movedBeforePut: 2 })
  const wo = fakeWoContent()
  const { done, notes } = await step({ site: twice, woContent: wo, pinned })
  assert.deepEqual(done, { written: 0, skipped: 5, conflict: 1, failed: 0 })
  assert.equal(twice.live('home/home').hero_title, 'A better website starts with your business.')
  assert.equal(wo.store.writes['emdash:home/home'].state, 'conflict')
  assert.match(notes.join('\n'), /changed while it was being written/)
  assert.equal(twice.calls.filter(([m]) => m === 'PUT').length, 2)
})

test('publish failed: the draft is kept, and the retry finds it and publishes it without writing again', async () => {
  const site = fakeSite(BASE.seed, { failPublish: 1 })
  const wo = fakeWoContent()
  const pinned = { 'hero.title': PINNED['hero.title'] }
  const first = await step({ site, woContent: wo, pinned })
  assert.equal(first.done.failed, 1)
  assert.equal(wo.store.writes['emdash:home/home'].state, 'failed')
  assert.match(first.notes.join('\n'), /publish refused/)
  assert.equal(site.live('home/home').hero_title, 'A better website starts with your business.')

  site.calls.length = 0
  const second = await step({ site, woContent: wo, pinned })
  assert.deepEqual(second.done, { written: 1, skipped: 5, conflict: 0, failed: 0 })
  assert.deepEqual(
    writesOf(site.calls).map(([m, r]) => `${m} ${r.split('?')[0]}`),
    ['POST /_emdash/api/content/home/home-0/publish']
  )
  assert.equal(site.live('home/home').hero_title, 'The Larch House')
  assert.equal(wo.store.writes['emdash:home/home'].state, 'written')
})

test('idempotent: a rerun that finds the words already published writes nothing and says written', async () => {
  const site = fakeSite(BUSINESS.seed)
  const wo = fakeWoContent()
  await step({ theme: BUSINESS, site, woContent: wo })
  const before = structuredClone(wo.store.before)
  site.calls.length = 0
  const { done } = await step({ theme: BUSINESS, site, woContent: wo })
  assert.deepEqual(done, { written: 2, skipped: 0, conflict: 0, failed: 0 })
  assert.deepEqual(writesOf(site.calls), [])
  assert.deepEqual(wo.store.before, before, 'the words before stay the template’s')
  assert.equal(site.live('home/home').services_items[3].title, 'Dish 4')
})

test('a list the site stores with its own row ids still reads back as written', async () => {
  const site = fakeSite(BUSINESS.seed, { rowIds: true })
  const wo = fakeWoContent()
  const { done } = await step({ theme: BUSINESS, site, woContent: wo })
  assert.deepEqual(done, { written: 2, skipped: 0, conflict: 0, failed: 0 })
  assert.equal(wo.store.writes['emdash:home/home'].state, 'written')
  site.calls.length = 0
  const again = await step({ theme: BUSINESS, site, woContent: wo })
  assert.deepEqual(again.done, { written: 2, skipped: 0, conflict: 0, failed: 0 })
  assert.deepEqual(writesOf(site.calls), [], 'a rerun finds its words and writes nothing')
})

test('Tracy Base: the reviews are written into the landing page’s quote cards where they stand, and read back', async () => {
  const site = fakeSite(BASE.seed, { rowIds: true })
  const wo = fakeWoContent()
  const pinned = { testimonial: [REVIEW('Lan', 'Best phin in town.')] }
  const { done, notes } = await step({ site, woContent: wo, pinned })
  assert.deepEqual(notes, [])
  assert.deepEqual(done, { written: 1, skipped: 5, conflict: 0, failed: 0 })
  const quotes = site.live('landing/landing').testimonials_quotes
  assert.equal(quotes.length, 3, 'every card of the template stays')
  assert.deepEqual(
    quotes.map(({ quote, name, role }) => ({ quote, name, role })),
    [
      { quote: 'Best phin in town.', name: 'Lan', role: 'Google' },
      { quote: '', name: '', role: '' },
      { quote: '', name: '', role: '' }
    ]
  )
  assert.equal(
    site.live('landing/landing').testimonials_heading,
    'What a good working relationship can feel like.'
  )
  assert.equal(wo.store.writes['emdash:landing/landing'].state, 'written')
  assert.equal(wo.store.before['emdash:landing/landing'].testimonials_quotes[0].name, 'Alex Morgan')
  site.calls.length = 0
  const again = await step({ site, woContent: wo, pinned })
  assert.deepEqual(again.done, { written: 1, skipped: 5, conflict: 0, failed: 0 })
  assert.deepEqual(writesOf(site.calls), [], 'a rerun finds its words and writes nothing')
})

test('a site that cannot be read is a note and a failed receipt, never an error of the build', async () => {
  const wo = fakeWoContent()
  const api = async () => {
    throw Object.assign(new Error('site down'), { status: 502 })
  }
  const notes = []
  const done = await writeWoCopy({
    api,
    copy: { buildId: 'b1', pinned: PINNED },
    map: BASE.map,
    seed: BASE.seed,
    woContent: wo,
    note: (n) => notes.push(n)
  })
  assert.equal(done.failed, 2)
  assert.match(notes.join('\n'), /site down/)
})

test('the EmDash engine writes the pinned words after the personalize tool and reports what it did', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { createEmdashEngine } = await import('../src/sites/brief-engines/emdash.js')
  const site = fakeSite(BUSINESS.seed)
  const order = []
  const fetchImpl = async (url, init) => {
    const u = new URL(url)
    if (!u.pathname.startsWith('/_emdash/api/content/'))
      return new Response(JSON.stringify({ success: true, data: { forms: [] } }), { status: 200 })
    order.push(`${init.method} ${u.pathname}`)
    try {
      const data = await site.api(
        init.method,
        `${u.pathname}${u.search}`,
        init.body ? JSON.parse(init.body) : undefined
      )
      return new Response(JSON.stringify({ success: true, data }), { status: 200 })
    } catch (error) {
      return new Response('{}', { status: error.status ?? 500 })
    }
  }
  const wo = fakeWoContent()
  const asked = []
  const woContent = {
    ...wo,
    forSite: async () => null,
    copyFor: async (who) => {
      asked.push(who)
      return { buildId: 'b1', pinned: PINNED, before: {}, writes: {} }
    }
  }
  const workRoot = mkdtempSync(path.join(tmpdir(), 'engine-wo-copy-'))
  try {
    const engine = createEmdashEngine({
      models: async () => ({}),
      siteAccess: async () => ({
        origin: 'http://hill-web-1:4321',
        token: 'ec_pat_realtoken00000000000000000000'
      }),
      run: async (call) => {
        order.push('TOOL')
        return call.env.TRACY_FETCH_MODE === 'record'
          ? { code: 0, stdout: '', stderr: '', killed: false }
          : {
              code: 0,
              stdout: JSON.stringify({ written: [], errors: [], skipped: [] }),
              stderr: '',
              killed: false
            }
      },
      workRoot,
      fetchImpl,
      woContent,
      log: { info() {}, warn() {} }
    })
    const notes = []
    const times = {}
    const ctx = {
      siteKey: 'hill.tracy.test',
      platform: 'emdash',
      quickstart: 'tracy-business/emdash-0.x',
      email: 'owner@example.com',
      brief: { about: '' },
      normalized: { name: 'The Larch House', about: '', languages: ['en-GB'] },
      signal: new AbortController().signal,
      time: (name, v) => {
        times[name] = v
      },
      note: (n) => notes.push(n),
      deadlineAt: Date.now() + 60_000
    }
    const prepared = await engine.prepare(ctx)
    try {
      await engine.apply(ctx, prepared)
    } finally {
      await engine.dispose(prepared)
    }
    assert.deepEqual(asked, [
      { siteKey: 'hill.tracy.test', email: 'owner@example.com', lang: 'en', cards: 4 }
    ])
    assert.ok(order.indexOf('TOOL') < order.findIndex((o) => o.startsWith('PUT')), 'after the tool')
    assert.equal(site.live('home/home').hero_title_a, 'The Larch House')
    assert.equal(times.woCopyWritten, 2)
    assert.equal(times.woCopySkipped, 0)
    assert.equal(typeof times.woCopyMs, 'number')
  } finally {
    rmSync(workRoot, { recursive: true, force: true })
  }
})
