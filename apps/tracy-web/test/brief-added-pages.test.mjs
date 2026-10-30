/**
 * Pages added by copying a template page layout (spec TracyHQ/tracy#231, ticket #238). When the brief lists more items than
 * the template has sample pages, the accepted site plan adds pages that each copy an existing page layout of the template;
 * the plan's author writes each one in the writing order like any other page; the build creates it by copying the template
 * page (never a new layout); and the listing, the footer and the buttons the plan points at it link it. The real Joomla
 * engine's prepare runs on the released JA Boxing 1.0.8 with scripted model doubles, and the Apply stage that creates the
 * pages runs on a site double holding the release's rows. Fictional business: a dog grooming salon.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { lintContentMap } from '../src/lib/content-map-lint.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { linkAddedPages, writeAddedPages } from '../src/sites/brief-engines/joomla-added-pages.js'
import { checkSitePlan } from '../src/sites/brief-engines/site-plan-check.js'
import { completePlan } from '../src/sites/brief-engines/site-plan-defaults.js'
import { overlaySitePlan, planFill } from '../src/sites/brief-engines/site-plan-fill.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)
const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const lock = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))

const NAME = 'Tidy Paws'
const ABOUT = 'Tidy Paws is a small dog grooming salon where every dog is washed, trimmed and dried by hand.'
const OFFERINGS = [
  {
    name: 'Full groom',
    description: 'A full groom with a warm bath, a breed trim, nail clipping and a gentle dry.'
  },
  {
    name: 'Bath and brush',
    description: 'A bath and brush with a calm wash, a thorough brush out and a fluffy dry.'
  },
  {
    name: 'Puppy intro',
    description: 'A puppy intro visit that gets young dogs used to the table, the dryer and the brush.'
  },
  {
    name: 'Nail trim',
    description: 'A quick nail trim that keeps paws comfortable, done in a few calm minutes.'
  },
  {
    name: 'Teeth cleaning',
    description: 'A teeth cleaning session with a soft brush and a dog safe paste for fresh breath.'
  },
  {
    name: 'De-shedding',
    description: 'A de-shedding treatment that lifts loose undercoat so less fur ends up at home.'
  }
]
const BRIEF = {
  reading: {
    about: ABOUT,
    services: OFFERINGS.map((o, i) => ({ id: `s${i + 1}`, label: o.name, quote: o.description }))
  },
  assets: []
}
const SITE = { name: NAME, about: ABOUT, phone: '+44 20 7946 0377', email: 'hello@tidypaws.example' }

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const RECORDS = 'record-page:classes'
const RECORD_ENTITIES = map.recordPages.find((r) => r.id === 'classes').entities
/** The record page every added offering page copies: the first of the family. */
const SOURCE = RECORD_ENTITIES[0]
const NAMES = OFFERINGS.map((o) => o.name)
const ADDED = [
  { id: 'page:added-teeth-cleaning', item: NAMES[4] },
  { id: 'page:added-de-shedding', item: NAMES[5] }
]
/** The hero's first button: the plan sends it to the first added page. */
const HERO_BUTTON = 'button:module-156.5'
const HOME_CARDS = 'cards:module-157.item'

/** The author's plan: home, the services list with its four record pages, two added service pages, contact. */
function authorPlan(extra = {}) {
  const kept = new Set([HOME, CLASSES, CONTACT])
  const els = new Map(inventory.elements.map((e) => [e.id, e]))
  const onKept = (/** @type {any} */ e) => els.get(e.section)?.pages.some((p) => kept.has(p))
  const cards = inventory.elements
    .filter(
      (e) =>
        e.kind === 'cards' && onKept(e) && ['service', 'package'].includes(e.groupKind) && e.id !== HOME_CARDS
    )
    .map((e) => {
      const count = Math.min(2, e.limits.capacity)
      return { element: e.id, decision: 'keep', count, items: NAMES.slice(0, count) }
    })
  // The brief names no people: their rows are hidden.
  const people = inventory.elements
    .filter((e) => e.kind === 'cards' && onKept(e) && e.groupKind === 'person')
    .map((e) => ({ element: e.id, decision: 'hide', reason: 'the brief names no team members' }))
  const page = (/** @type {string} */ id, /** @type {string} */ lead) => ({
    id,
    decision: 'keep',
    purpose: `The ${id === HOME ? 'front door' : id === CLASSES ? 'list of services' : 'way to reach the salon'}`,
    lead,
    facts: [],
    items: id === CONTACT ? [] : NAMES,
    dependsOn: []
  })
  return {
    version: 'site-plan/1',
    pages: [
      page(HOME, 'Calm grooming for every dog'),
      page(CLASSES, 'Grooming for every coat'),
      page(CONTACT, 'Book a visit to the salon'),
      ...ADDED.map((a) => ({
        id: a.id,
        decision: 'add',
        copies: RECORDS,
        purpose: `The own page of ${a.item}`,
        lead: OFFERINGS.find((o) => o.name === a.item)?.description,
        facts: [],
        items: [a.item],
        dependsOn: []
      }))
    ],
    decisions: [
      { element: RECORDS, decision: 'keep', items: NAMES.slice(0, 4) },
      { element: HOME_CARDS, decision: 'keep', count: 4, items: NAMES.slice(0, 4) },
      { element: HERO_BUTTON, decision: 'keep', action: { kind: 'page', target: ADDED[0].id } },
      ...cards,
      ...people
    ],
    photos: [],
    glossary: OFFERINGS.map((o) => ({ ...o, kind: 'offering' })),
    outOfScope: { brief: [] },
    ...extra
  }
}

function editorialDouble(answer) {
  const used = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }
  return {
    chat: async () => {
      used.calls += 1
      return JSON.stringify(answer)
    },
    usage: () => ({ model: 'deepseek/deepseek-v4-pro', ...used, stages: {} })
  }
}

const LETTERS = 'bcdfghjklmnpqrstvwxz'
const wordOf = (/** @type {string} */ seed) => {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  let w = ''
  for (let i = 0; i < 4; i += 1) w += LETTERS[(h >>> (i * 4)) % LETTERS.length] + (i % 2 ? 'a' : 'o')
  return w
}
const plain = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A sentence of words of its own, of about `length` characters, ending with a full stop. */
function sentenceOf(/** @type {string} */ seed, /** @type {number} */ length) {
  const words = []
  let i = 0
  while ([...words.join(' ')].length < length - 9) words.push(wordOf(`${seed}:${i++}`))
  const text = words.join(' ') || wordOf(seed)
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}

/** Text of the band a sibling slot is told (`shape`), starting with `lead` when given. */
function shaped(/** @type {any} */ s, /** @type {string | null} */ lead, /** @type {string} */ seed) {
  const [count] = s.shape.sentences
  const [low, high] = s.shape.characters
  const target = Math.round((low + high) / 2)
  const parts = lead ? [lead] : []
  while (parts.length < count) {
    const left = count - parts.length
    const room = target - [...parts.join(' ')].length - (parts.length ? 1 : 0)
    parts.push(sentenceOf(`${seed}:${s.key}:${parts.length}`, Math.max(12, Math.floor(room / left))))
  }
  return parts.join(' ')
}

/**
 * The text door double. A page-author call (one that carries `plan`) writes each slot the engine bound to a glossary item
 * (`offering`) from that entry: its name where the slot names it, its description first where it describes it; every other
 * line gets words of its own, seeded by the page so an added page never repeats its template page. Every call is recorded.
 */
function textDouble() {
  /** @type {Array<{page: string, keys: string[], input: any}>} */
  const pageCalls = []
  return {
    pageCalls,
    chat: async ({ messages }) => {
      let input = null
      try {
        input = JSON.parse(messages.at(-1).content)
      } catch {
        input = null
      }
      if (!input?.plan) return JSON.stringify({ values: {}, lines: {}, pending: [], invented: [] })
      const pageId = input.plan.page?.id ?? ''
      pageCalls.push({ page: pageId, keys: input.slots.map((s) => s.key), input })
      const glossary = new Map(input.glossary.map((g) => [g.name, g]))
      const toSay = [input.plan.page?.lead].filter(Boolean)
      const values = {}
      for (const s of input.slots) {
        const entry = glossary.get(s.offering)
        const fits = (/** @type {string} */ t) => [...t].length <= s.maxCharacters
        const names = ['offering.name', 'package.name', 'person.name', 'editorial.heading'].includes(s.role)
        const describes = ['offering.description', 'offering.summary', 'editorial.paragraph'].includes(s.role)
        const own = (/** @type {number} */ length) =>
          sentenceOf(`${pageId}:${s.key}`, length).slice(0, s.maxCharacters)
        if (s.type !== 'text') values[s.key] = s.sample
        else if (!plain(s.sample)) values[s.key] = ''
        else if (entry && names && fits(entry.name)) values[s.key] = entry.name
        else if (entry && describes && fits(entry.description))
          values[s.key] = s.shape ? shaped(s, entry.description, pageId) : entry.description
        else if (s.shape) values[s.key] = shaped(s, null, pageId)
        else if (toSay.length && fits(toSay[0])) values[s.key] = toSay.shift()
        else values[s.key] = own(Math.max(6, Math.min(s.maxCharacters, [...plain(s.sample)].length)))
      }
      return JSON.stringify({ values, pending: [], invented: [] })
    },
    usage: () => ({ calls: pageCalls.length, promptTokens: 1_000 * pageCalls.length, completionTokens: 0 })
  }
}

async function prepareWith(models) {
  const records = {}
  const engine = createJoomlaEngine({
    models: async () => models,
    woContent: { sitePlanFor: async () => null, briefFor: async () => BRIEF }
  })
  const prepared = await engine.prepare({
    siteKey: 'added-pages-test',
    label: 'added-pages',
    platform: 'joomla',
    quickstart: 'quickstart/ja-boxing/j6',
    contract,
    email: 'owner@example.com',
    brief: { about: ABOUT, goal: 'contact', style: 'plain' },
    normalized: {
      name: NAME,
      about: ABOUT,
      nameFrom: 'answer',
      tone: 'plain',
      contact: '',
      languages: ['en']
    },
    signal: new AbortController().signal,
    time: () => {},
    record: (k, v) => {
      records[k] = v
    },
    note: () => {},
    deadlineAt: Date.now() + 60_000
  })
  return { prepared, records }
}

/** One prepare for the stage tests: the plan, its author and the copy are the same in each. */
let once = null
const prepareOnce = () => {
  once ??= (async () => {
    const text = textDouble()
    const out = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
    return { ...out, text }
  })()
  return once
}

const slotsOf = (/** @type {string} */ entity) => map.slots.filter((s) => s.entity === entity)
const keyOf = (/** @type {string} */ entity, /** @type {string} */ role) =>
  slotsOf(entity).find((s) => s.role === role)?.key
/** The demo words of a slot of copy (not a video id or an address: those follow the template record). */
const demoWords = (/** @type {any} */ s) =>
  s.type === 'text' && !/video|url/.test(String(s.role)) ? plain(s.sample) : ''

test('an added page is written by the author in the writing order, from its own item, with no demo text', async () => {
  const { prepared, records, text } = await prepareOnce()
  assert.equal(records.sitePlan?.status, 'accepted', JSON.stringify(records.sitePlan?.refusal))
  const added = prepared.addedPages ?? []
  assert.deepEqual(
    added.map((a) => a.id),
    ADDED.map((a) => a.id)
  )
  const order = [...new Set(text.pageCalls.map((c) => c.page))]
  for (const a of ADDED) {
    assert.ok(order.includes(a.id), `${a.id} is written: ${JSON.stringify(order)}`)
    assert.ok(order.indexOf(a.id) < order.indexOf(CLASSES), 'before the list that summarises it')
    assert.ok(order.indexOf(a.id) < order.indexOf(HOME), 'before the home page')
    const page = added.find((x) => x.id === a.id)
    assert.equal(page.copies.entity, SOURCE, 'it copies the first record page of the family')
    assert.equal(page.item, a.item)
    const offering = OFFERINGS.find((o) => o.name === a.item)
    assert.equal(page.values[keyOf(SOURCE, 'offering.name')], a.item)
    assert.ok(plain(page.values[keyOf(SOURCE, 'offering.summary')]).includes(offering.description))
    for (const s of slotsOf(SOURCE).filter((x) => x.type === 'text' && demoWords(x))) {
      assert.ok(s.key in page.values, `${s.key} is decided on the added page`)
      assert.notEqual(plain(page.values[s.key]), demoWords(s), `${s.key} keeps no demo text`)
      // Never the template record's own words either: the added page is its own.
      if (plain(prepared.changes[s.key]).length > 20)
        assert.notEqual(plain(page.values[s.key]), plain(prepared.changes[s.key]), `${s.key} is not copied`)
    }
  }
  // The template record pages are still written as their own records.
  assert.equal(plain(prepared.changes[keyOf(SOURCE, 'offering.name')]), NAMES[0])
})

/** A site double holding the release's rows: it lists, reads and writes articles, menu entries and modules. */
function siteDouble() {
  const rows = { article: new Map(), menuItem: new Map(), module: new Map(), category: new Map() }
  for (const [key, row] of Object.entries(lock.entities)) {
    const [kind, id] = [key.slice(0, key.lastIndexOf('-')), Number(key.slice(key.lastIndexOf('-') + 1))]
    if (rows[kind]) rows[kind].set(id, { id, ...structuredClone(row) })
  }
  const site = {
    rows,
    created: /** @type {any[]} */ ([]),
    updates: /** @type {any[]} */ ([]),
    next: 9000,
    apply: async (/** @type {any} */ { action, params }) => {
      const table = rows[params?.kind]
      if (action === 'content.list' && table) {
        const all = [...table.values()]
        return { ok: true, items: all.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 25)) }
      }
      if (action === 'content.get' && table) {
        const row = table.get(Number(params.id))
        return row ? { ok: true, item: structuredClone(row) } : { ok: false, error: 'not_found' }
      }
      const write = (/** @type {any} */ step) => {
        const t = rows[step.kind]
        if (!t) return { ok: false, error: 'unknown_kind' }
        if (Number(step.id) === 0) {
          const id = (site.next += 1)
          t.set(id, { id, ...step.fields })
          site.created.push({ kind: step.kind, id, fields: step.fields })
          return { ok: true, id }
        }
        const row = t.get(Number(step.id))
        if (!row) return { ok: false, error: 'not_found' }
        Object.assign(row, step.fields)
        site.updates.push(step)
        return { ok: true, id: row.id }
      }
      if (action === 'content.update') return write(params)
      if (action === 'content.batch') {
        const results = params.operations.map(write)
        return { ok: results.every((r) => r.ok), results }
      }
      return { ok: false, error: 'unsupported' }
    }
  }
  return site
}

test('the build creates the added page by copying its template page, and its listing and buttons link it', async () => {
  const { prepared } = await prepareOnce()
  const site = siteDouble()
  const before = site.rows.article.size
  const out = await writeAddedPages({
    apply: site.apply,
    siteKey: 'added-pages-test',
    added: prepared.addedPages,
    contentMap: map,
    changes: prepared.changes,
    note: () => {}
  })
  assert.equal(site.rows.article.size, before + ADDED.length, 'one article per added page')
  const source = lock.entities[SOURCE]
  for (const a of ADDED) {
    const made = out.pages.find((p) => p.id === a.id)
    assert.ok(made, `${a.id} was created`)
    const row = site.rows.article.get(made.articleId)
    // The copied layout: the same category (the listing page lists it), the same layout settings, published.
    assert.equal(String(row.catid), String(source.catid))
    assert.equal(Number(row.state), 1)
    const layoutOf = (/** @type {string} */ attribs) => JSON.parse(attribs).article_layout
    assert.equal(layoutOf(row.attribs), layoutOf(source.attribs))
    assert.equal(row.title, a.item)
    assert.match(row.alias, /^[a-z0-9-]+$/)
    // The written copy, and no line of the demo left anywhere in it.
    const offering = OFFERINGS.find((o) => o.name === a.item)
    assert.ok(plain(row.introtext).includes(offering.description), 'the summary is the written one')
    const body = [row.title, row.introtext, row.fulltext, row.attribs].map(plain).join(' \n ')
    for (const s of slotsOf(SOURCE).filter((x) => demoWords(x).length > 12))
      assert.ok(!body.includes(demoWords(s)), `${s.key} demo text "${demoWords(s)}" is gone`)
    // The listing (the page that lists the family) opens it.
    assert.match(made.href, new RegExp(`view=article&id=${made.articleId}&catid=${source.catid}`))
  }
  // A second pass rewrites the pages it made, never makes them twice.
  await writeAddedPages({
    apply: site.apply,
    siteKey: 'added-pages-test',
    added: prepared.addedPages,
    contentMap: map,
    changes: prepared.changes,
    note: () => {}
  })
  assert.equal(site.rows.article.size, before + ADDED.length)

  // The button the plan sends to the first added page links it.
  const linked = await linkAddedPages({
    apply: site.apply,
    siteKey: 'added-pages-test',
    plan: prepared.authorPlan,
    inventory,
    contentMap: map,
    links: out.links,
    note: () => {}
  })
  assert.equal(linked, 1)
  const button = inventory.elements.find((e) => e.id === HERO_BUTTON)
  const moduleId = Number(String(button.entity ?? button.urlKey.split('.')[0]).replace(/^module-/, ''))
  const hero = site.rows.module.get(moduleId)
  const first = out.pages.find((p) => p.id === ADDED[0].id)
  assert.ok(
    `${hero.params} ${hero.content}`.includes(`view=article&id=${first.articleId}`),
    'the hero button opens the added page'
  )
})

test('the menus and the footer list the added pages, never as demo pages', async () => {
  const { prepared } = await prepareOnce()
  const fill = planFill(prepared.authorPlan, { inventory })
  // An added record page is listed by its listing page, not given a main menu entry of its own.
  assert.ok(!fill.pages.some((p) => ADDED.some((a) => a.id === p.id)), JSON.stringify(fill.pages))
  // The plan's link to an added page is made by the stage that creates it, never written as a dead link before.
  assert.ok(!Object.values(fill.buttons).some((href) => !href || href === '#'))
  const over = overlaySitePlan({ pages: [], slots: [] }, fill)
  assert.ok(over.slots.every((s) => s.value && s.value !== '#'))
})

test('a plan that adds a page without a template layout, or more pages than the brief has items, is refused', async () => {
  const site = {
    ...SITE,
    factSheet: { offerings: OFFERINGS.map((o, i) => ({ sourceId: `offering-${i + 1}`, name: o.name })) }
  }
  const check = async (/** @type {any} */ plan) =>
    (await checkSitePlan(completePlan(plan, { inventory, site }), { inventory, site })).reasons
  const base = authorPlan()
  assert.deepEqual(
    (await check(base)).filter((r) => r.rule.startsWith('added-page')),
    [],
    'the plan as written is fine'
  )

  const noLayout = authorPlan()
  noLayout.pages.find((p) => p.id === ADDED[0].id).copies = 'page:menuItem-9999'
  assert.ok((await check(noLayout)).some((r) => r.rule === 'added-page-layout' && r.element === ADDED[0].id))

  // A page whose layout is a category listing: copying it would show the same list again, so it is no layout to copy.
  const listing = authorPlan()
  listing.pages.find((p) => p.id === ADDED[0].id).copies = CLASSES
  assert.ok((await check(listing)).some((r) => r.rule === 'added-page-layout' && r.element === ADDED[0].id))

  // A third added page with no brief item left for it.
  const tooMany = authorPlan()
  tooMany.pages.push({
    ...tooMany.pages.find((p) => p.id === ADDED[1].id),
    id: 'page:added-extra',
    items: ['Cat grooming']
  })
  assert.ok(
    (await check(tooMany)).some((r) => r.rule === 'added-page-item' && r.element === 'page:added-extra')
  )

  // Two added pages for one item, or one for an item a template record page already shows.
  const twice = authorPlan()
  twice.pages.find((p) => p.id === ADDED[1].id).items = [ADDED[0].item]
  assert.ok((await check(twice)).some((r) => r.rule === 'added-page-item' && r.element === ADDED[1].id))
  const shown = authorPlan()
  shown.pages.find((p) => p.id === ADDED[1].id).items = [NAMES[0]]
  assert.ok((await check(shown)).some((r) => r.rule === 'added-page-item' && r.element === ADDED[1].id))
})

test('the content map says which page lists each record page family, and the readiness checker reports one that does not', () => {
  const family = map.recordPages.find((r) => r.id === 'classes')
  assert.equal(family.listing, 'menuItem-167', 'JA Boxing 1.0.8 declares the listing of its classes')
  assert.equal(inventory.elements.find((e) => e.id === RECORDS).listing, 'page:menuItem-167')
  assert.deepEqual(
    lintContentMap(map).findings.filter((f) => f.rule.startsWith('record-page-listing')),
    []
  )
  const undeclared = {
    ...map,
    recordPages: map.recordPages.map(({ listing: _, ...r }) => r)
  }
  const found = lintContentMap(undeclared).findings.filter((f) => f.rule === 'record-page-listing')
  assert.deepEqual(
    found.map((f) => f.key),
    ['classes']
  )
  // A listing that does not open the family's parent cannot list a copy of its pages.
  const wrong = { ...map, recordPages: map.recordPages.map((r) => ({ ...r, listing: 'menuItem-168' })) }
  assert.ok(
    lintContentMap(wrong).findings.some((f) => f.rule === 'record-page-listing' && f.key === 'classes')
  )
})

test('an added page follows the plan for its pictures: never the template record picture it copies', async () => {
  const { prepared } = await prepareOnce()
  const site = siteDouble()
  const out = await writeAddedPages({
    apply: site.apply,
    siteKey: 'added-pages-pictures-test',
    added: prepared.addedPages,
    contentMap: map,
    changes: prepared.changes,
    note: () => {}
  })
  const pictureKeys = new Set(
    inventory.elements
      .filter((e) => e.kind === 'picture' && e.key?.startsWith(`${SOURCE}.`))
      .map((e) => e.key)
  )
  const pictures = slotsOf(SOURCE).filter((s) => pictureKeys.has(s.key))
  assert.ok(pictures.length > 0, 'the copied record has picture slots')
  for (const a of ADDED) {
    // The plan gives an added page no photo or drawing of its own here, so each picture slot is hidden, recorded.
    const settled = prepared.addedPages.find((p) => p.id === a.id)
    for (const s of pictures) assert.equal(settled.pictures?.[s.key]?.applied, 'hide', `${a.id} ${s.key}`)
    const row = site.rows.article.get(out.pages.find((p) => p.id === a.id).articleId)
    const fields = `${row.images} ${row.attribs}`
    for (const s of pictures) {
      const file = String(s.sample).split('#')[0]
      assert.ok(!fields.includes(file), `${a.id}: ${s.key} no longer shows the template picture ${file}`)
    }
  }
})
