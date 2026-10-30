import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { INVENTED_EVIDENCE } from '../src/host/contract-check.mjs'
import { foldForMatch } from '../src/host/html-units.mjs'
import { requestIdOf } from '../src/host/normalize.mjs'
import {
  JOOMLA_REPLACE_NEXT,
  JOOMLA_TEMPLATES,
  NAME_IN_QUOTE,
  contractOf,
  customerSentence,
  factOf,
  joomlaStore,
  joomlaText,
  markersOf,
  newWords,
  pageFacts,
  pageOf,
  replaceOnJoomla,
  storedFor
} from '../src/host/replace-joomla.mjs'
import { RECEIPT_MAX_BYTES, REPLACE_NEXT, planReplace, replaceText } from '../src/host/replace.mjs'
import { WRITER_LOCK_MESSAGE, refusalNext } from '../src/host/site.mjs'
import {
  indexContents,
  locateElement,
  replaceAtOf
} from '../../../../apps/tracy-web/src/sites/content-locate.js'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const FIXTURES = new URL('./fixtures/replace/', import.meta.url)
const fixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8')
const SNAP_11 = JSON.parse(fixture('joomla/inspect-1.1.0.json'))
const SNAP_12 = JSON.parse(fixture('joomla/inspect-1.2.0.json'))
const HOME_11 = fixture('joomla/1.1.0-home-en.html')
const CONTACT_11 = fixture('joomla/1.1.0-contact-en.html')
const NEWS_11 = fixture('joomla/1.1.0-news-en.html')
const HOME_12 = fixture('pages/joomla-home.html')
const ABOUT_12 = fixture('pages/joomla-about.html')
const CONTACT_12 = fixture('pages/joomla-contact.html')
const HOME_RU_12 = fixture('joomla/1.2.0-home-ru.html')
const HELDOUT = JSON.parse(fixture('heldout.json'))

/** One replace call against fake doors that record everything */
async function run(snap, html, call, opts = {}) {
  const calls = { snapshot: [], apply: [], page: [] }
  const applies = [...(opts.applies ?? [{ ok: true }])]
  const r = await replaceOnJoomla({
    plan: opts.plan ?? planReplace(call),
    snapshot: async (fresh) => {
      calls.snapshot.push(fresh === true)
      return opts.snapshot ? opts.snapshot(calls.snapshot.length, fresh) : snap
    },
    apply: async (params) => {
      calls.apply.push(params)
      return applies.length > 1 ? applies.shift() : applies[0]
    },
    pageHtml: async (path) => {
      calls.page.push(path)
      return opts.page ? opts.page(calls.page.length, path) : { ok: true, status: 200, html }
    },
    evidenceText: opts.message ?? null,
    mint: (prefix) => `${prefix}-mfz3k${calls.apply.length}-9a1c0d`,
    confirmed: opts.confirmed,
    verify: opts.verify,
    env: opts.env ?? {},
    nameInQuote: opts.nameInQuote
  })
  return { r, calls }
}

/** The places an answer names: the rows of a write or a dryRun, else the candidates of a refusal. */
const placesOf = (r) =>
  r.ok ? (r.changed ?? r.would).map((row) => row.at) : (r.candidates ?? []).map((c) => c.at)

// ── The contract marker and the markers of a page ──────────────────────────────────────────────────

test('tables are keyed by (template, version): a version nobody measured reads with the generic rules', () => {
  assert.deepEqual(Object.keys(JOOMLA_TEMPLATES), ['tracy-business/j6'])
  assert.equal(contractOf(SNAP_11).known, true)
  assert.equal(contractOf(SNAP_12).version, '1.2.0')
  assert.equal(contractOf({ contract: 'tracy-business/j6/1.3.0' }).known, false)
  assert.equal(contractOf({ contract: 'tracy-apple/j6/1.3.0' }).table.name, 'generic')
  assert.equal(contractOf({}).known, false)
})

test('markers: Mod<id> and tb-<block>-<id> are modules, a menu li by class or data-id, a mega caption the navigation file', () => {
  const el = (tag, id = '', cls = '', data = '') => ({
    tag,
    id,
    cls,
    data,
    role: '',
    inline: false,
    hide: false,
    open: false,
    href: null
  })
  assert.deepEqual(
    markersOf([
      el('span', '', 'mega-caption'),
      el('li', '', 'nav-item item-603'),
      el('li', '', 'nav-item', '600'),
      el('section', 'tb-hero-441'),
      el('div', 'Mod438')
    ]),
    ['file:navigation', 'menuItem-603', 'menuItem-600', 'module-441', 'module-438']
  )
  // a block's inner ids are not blocks: `tb-hero-441-title`, the switcher's `tb-lang-425-des`
  assert.deepEqual(
    markersOf([el('h1', 'tb-hero-441-title'), el('p', 'tb-lang-425-des'), el('div', 'Mod')]),
    []
  )
})

// ── The store: tokens, languages, twins ────────────────────────────────────────────────────────────

test('1.2.0: a slot that prints a token is read as the value it prints, and knows where the token sits', () => {
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  assert.equal(store.hasIdentity, true)
  const topbar = store.units.find((u) => u.at === 'module-428.1')
  assert.equal(topbar.slot.current, 'Hotline: {contact.phone}')
  assert.equal(topbar.raw, 'Hotline: 8 800 550-67-90')
  assert.deepEqual(topbar.tokens, [{ name: 'contact.phone', rs: 9, re: 24, xs: 9, xe: 24 }])
  assert.equal(
    topbar.max,
    undefined,
    'the length rule of a token slot is on its stored value (contract-check)'
  )
  const phone = store.identity.get('contact.phone')
  assert.equal(phone.at, 'module-4369.5')
  assert.equal(phone.lang, null, 'one value for every language')
  assert.equal(phone.fact, true)
  assert.equal(store.identity.get('site.name').fact, undefined, 'a name is not a fact')
  // a heading on two lines is one pair: title + title-accent
  assert.deepEqual(
    store.pairs.map(([a, b]) => `${a.at}+${b.at}`),
    ['module-441.1+module-441.2', 'module-461.1+module-461.2']
  )
})

test('1.1.0: a block and its copy in another language are twins by position and field, not by their translated label', () => {
  const store = joomlaStore(SNAP_11, contractOf(SNAP_11).table)
  assert.equal(store.hasIdentity, false)
  const en = store.units.find((u) => u.at === 'module-438.0')
  const ru = store.units.find((u) => u.at === 'module-458.0')
  assert.equal(en.label, 'Contact / phone')
  assert.equal(ru.label, 'Контакты / phone')
  assert.equal(en.lang, 'en')
  assert.equal(ru.lang, 'ru')
  assert.equal(en.twinGroup, ru.twinGroup)
  // on an English page the Russian copy is reached only as a twin: one place per block
  const pf = pageFacts(store, pageOf(HOME_11), '/en/')
  const stored = storedFor(store, pf, '8 800 550-67-90')
  assert.ok(stored.includes(en))
  assert.ok(!stored.includes(ru))
})

test('1.2.0: a slot whose every hit is inside a token stays out — Site identity is the one place', () => {
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const pf = pageFacts(store, pageOf(HOME_12), '/en/')
  const ats = storedFor(store, pf, '8 800 550-67-90').map((u) => u.at)
  assert.ok(ats.includes('module-4369.5'))
  // a hit that is not inside a token keeps the slot: "Hotline:" is the topbar's own word
  assert.ok(storedFor(store, pf, 'Hotline').some((u) => u.at === 'module-428.1'))
})

{
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const pf = pageFacts(store, pageOf(HOME_12), '/en/')
  const ats = storedFor(store, pf, '8 800 550-67-90').map((u) => u.at)
  for (const printed of ['module-428.1', 'module-438.0'])
    test(`1.2.0: a slot whose every hit is inside a token stays out — Site identity is the one place: ${rowName(printed)}`, () => {
      assert.ok(!ats.includes(printed), printed)
    })
}

test("1.2.0: another language's copy stays a place when the page language's copy does not hold the words", () => {
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const pf = pageFacts(store, pageOf(HOME_12), '/')
  assert.equal(pf.lang, 'en')
  // "Наши компетенции" is the Russian hero button alone: its English twin says other words
  const ru = storedFor(store, pf, 'Наши компетенции').find((u) => u.at === 'module-461.4')
  assert.ok(ru, 'the Russian copy is a place of its own')
  assert.equal(ru.lang, 'ru')
  // the topbar's Russian copy does not say "Hotline": the English one is the only place
  const hot = storedFor(store, pf, 'Hotline').map((u) => u.at)
  assert.ok(hot.includes('module-428.1') && !hot.includes('module-448.1'))
})

test('1.2.0 words only a Russian copy holds, asked from the English home: the answer names /ru/, never "not on this page or in its content"', async () => {
  const call = { find: 'Наши компетенции', replace: 'Наши услуги' }
  // all:true is every place the site holds the words: the Russian button, and the receipt says where
  const all = await run(SNAP_12, HOME_12, { ...call, all: true })
  assert.equal(all.r.ok, true, JSON.stringify(all.r).slice(0, 400))
  assert.deepEqual(all.calls.apply[0].changes, { 'module-461.4': 'Наши услуги' })
  assert.deepEqual(
    all.r.changed.map((row) => [row.at, row.page, row.onPage]),
    [['module-461.4', '/ru/', false]]
  )
  // the path the NOT_FOUND names is the call that works
  const ru = await run(SNAP_12, HOME_RU_12, { ...call, path: '/ru/' })
  assert.equal(ru.r.ok, true, JSON.stringify(ru.r).slice(0, 400))
  assert.deepEqual(ru.calls.apply[0].changes, { 'module-461.4': 'Наши услуги' })
  assert.equal(ru.r.changed[0].onPage, undefined, 'on its own page')
})

{
  const call = { find: 'Наши компетенции', replace: 'Наши услуги' }
  for (const extra of [{}, { where: 'main' }])
    test(`1.2.0 words only a Russian copy holds, asked from the English home: the answer names /ru/, never "not on this page or in its content": ${rowName(extra)}`, async () => {
      const { r, calls } = await run(SNAP_12, HOME_12, { ...call, ...extra })
      assert.equal(calls.apply.length, 0, JSON.stringify(extra))
      assert.equal(r.code, 'NOT_FOUND')
      assert.equal(r.error, joomlaText('otherLanguageError', { find: call.find, page: '/ru/' }))
      assert.equal(r.next, joomlaText('otherLanguageNext', { page: '/ru/' }))
      assert.deepEqual(
        r.candidates.map((c) => [c.at, c.page, c.onPage]),
        [['module-461.4', '/ru/', false]]
      )
    })
}

test('1.2.0 words an English label and the Russian topbar both hold: AMBIGUOUS with the page of each, never the English label alone', async () => {
  const { r, calls } = await run(SNAP_12, HOME_12, { find: 'Горячая линия', replace: 'Телефон' })
  assert.equal(calls.apply.length, 0)
  assert.equal(r.code, 'AMBIGUOUS')
  assert.deepEqual(
    r.candidates.map((c) => [c.at, c.page]),
    [
      ['module-810.3', '/en/contact'],
      ['module-448.1', '/ru/']
    ]
  )
  const all = await run(SNAP_12, HOME_12, { find: 'Горячая линия', replace: 'Телефон', all: true })
  assert.equal(
    all.calls.apply[0].changes['module-448.1'],
    'Телефон: {contact.phone}',
    'the Russian topbar, its phone still a token'
  )
  assert.ok('module-810.3' in all.calls.apply[0].changes)
})

/**
 * The 1.2.0 snapshot as Apply leaves a site written in Dutch: the source rows moved to nl-NL, the
 * module titles nobody sees still end in "(en)", and the page is `lang="nl-nl"`.
 */
const dutchApplied = () => {
  const snap = structuredClone(SNAP_12)
  for (const p of snap.pages)
    for (const m of p.assignedModules ?? []) if (m.language === 'en-GB') m.language = 'nl-NL'
  const html = HOME_12.replace(/(<html[^>]*\blang=")en-gb"/i, '$1nl-nl"')
  return { snap, html }
}

test('1.2.0 Dutch Apply site: a module\'s row language wins over the "(en)" its title keeps — its words are a place, not template text', async () => {
  const { snap, html } = dutchApplied()
  const store = joomlaStore(snap, contractOf(snap).table)
  assert.match(String(store.units.find((u) => u.at === 'module-441.1')?.slot.label), /\(en\)/)
  assert.equal(store.units.find((u) => u.at === 'module-441.1')?.lang, 'nl')
  assert.equal(pageFacts(store, pageOf(html), '/').lang, 'nl')
  const find = store.units.find((u) => u.at === 'module-441.1')?.raw ?? ''
  const { r, calls } = await run(snap, html, { find, replace: 'Nieuwe kop' }, { message: ['Nieuwe kop'] })
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.ok('module-441.1' in calls.apply[0].changes)
})

test('1.2.0 an English module on a Dutch page: refused, but the answer names the module, and that call writes', async () => {
  const html = HOME_12.replace(/(<html[^>]*\blang=")en-gb"/i, '$1nl-nl"')
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const find = store.units.find((u) => u.at === 'module-441.1')?.raw ?? ''
  const { r } = await run(SNAP_12, html, { find, replace: 'Nieuwe kop' }, { message: ['Nieuwe kop'] })
  assert.equal(r.code, 'NOT_EDITABLE')
  assert.notEqual(r.next, REPLACE_NEXT.notEditableNext)
  assert.ok(
    r.held.some((h) => h.at === 'module-441.1'),
    JSON.stringify(r.held)
  )
  const named = await run(
    SNAP_12,
    html,
    { find, replace: 'Nieuwe kop', at: ['module-441.1'] },
    { message: ['Nieuwe kop'] }
  )
  assert.equal(named.r.ok, true, JSON.stringify(named.r).slice(0, 300))
  assert.ok('module-441.1' in named.calls.apply[0].changes)
})

test('a module whose row names no language still reads it from the "(xx)" of its title', () => {
  const snap = structuredClone(SNAP_12)
  for (const p of snap.pages)
    for (const m of p.assignedModules ?? []) if (m.language === 'en-GB') m.language = '*'
  const store = joomlaStore(snap, contractOf(snap).table)
  assert.equal(store.units.find((u) => u.at === 'module-441.1')?.lang, 'en')
})

test('1.1.0/1.2.0: an article or a menu item has a language only when a page the inspect lists is it or shows it', () => {
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const langOf = (at) => store.units.find((u) => u.at === at)?.lang
  assert.equal(langOf('article-555.1'), 'en', 'shown by /en/about (view=article&id=555)')
  assert.equal(langOf('menuItem-600.0'), 'en', 'the about page itself')
  assert.equal(langOf('menuItem-633.0'), 'ru')
  // the limit (replace-joomla.mjs header): no language in the row, so presence alone decides
  assert.equal(langOf('article-546.0'), null)
  assert.equal(langOf('menuItem-596.0'), null)
})

const TABLE_11 = [
  [HOME_11, { find: 'View new cars', replace: 'See the cars' }, ['module-441.4']],
  [HOME_11, { find: 'Selected projects', replace: 'Featured projects' }, ['module-443.0']],
  [HOME_11, { find: 'News', replace: 'Insights' }, 'AMBIGUOUS', ['menuItem-603.0', 'menuItem-626.0']],
  [HOME_11, { find: 'News', replace: 'Insights', where: 'header' }, ['menuItem-603.0']],
  [HOME_11, { find: 'News', replace: 'Insights', where: 'footer' }, ['menuItem-626.0']],
  [HOME_11, { find: 'Careers', replace: 'Jobs' }, 'AMBIGUOUS', ['menuItem-618.0', 'menuItem-627.0']],
  [
    HOME_11,
    { find: 'Toyota Hanoi Motors — your authorised Toyota dealer', replace: 'Built for the way you work' },
    ['module-441.1+module-441.2']
  ],
  [HOME_11, { find: 'Toyota Hanoi Motors', replace: 'Hanoi Toyota' }, ['module-441.1']],
  [HOME_11, { find: 'toyota hanoi motors', replace: 'Hanoi Toyota' }, ['module-441.1']],
  [HOME_11, { find: 'ESTABLISHED 2004', replace: 'Since 2004' }, ['module-441.0']],
  // the tagline decoy: article-555.1's title holds the same words, but no page prints it there
  [HOME_11, { find: 'Industrial infrastructure', replace: 'Trusted since 2004' }, 'NOT_EDITABLE', []],
  [HOME_11, { find: 'Northgate', replace: 'Southgate' }, ['module-435.1']],
  [
    HOME_11,
    { find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon–Sat, 8:00–17:00', where: 'footer' },
    ['module-438.2']
  ],
  [HOME_11, { find: 'M&E engineering', replace: 'MEP' }, 'AMBIGUOUS', ['module-442.6', 'menuItem-622.0']],
  [
    HOME_11,
    { find: 'Request a quote', replace: 'Get a quote' },
    'AMBIGUOUS',
    ['module-430.0', 'module-432.0']
  ],
  [HOME_11, { find: 'Services', replace: 'What we do', where: 'footer' }, 'NOT_EDITABLE', []],
  [HOME_11, { find: 'Transactional emails', replace: 'Emails' }, 'NOT_EDITABLE', []],
  [CONTACT_11, { find: 'Contact', replace: 'Talk to us' }, ['menuItem-604.0']],
  [NEWS_11, { find: 'News & engineering notes', replace: 'Notes' }, 'NOT_EDITABLE', []],
  [HOME_11, { find: 'Talk to our sales team', replace: 'Talk to us' }, ['module-445.2']],
  [
    HOME_11,
    { find: 'Vorsino Industrial Park, Kaluga Region', replace: 'Hanoi', where: 'topbar' },
    ['module-428.4']
  ]
]

{
  for (const [html, call, verdict, places] of TABLE_11)
    test(`on 1.1.0: for each ask the verdict and the places it lives in, and a dryRun never applies: ${rowName(html)}`, async () => {
      const label = JSON.stringify(call).slice(0, 100)

      const { r, calls } = await run(SNAP_11, html, { ...call, dryRun: true })

      assert.equal(calls.apply.length, 0, `${label}: a dryRun never applies`)
      assert.equal(r.ok, Array.isArray(verdict), `${label} ${JSON.stringify(r).slice(0, 400)}`)
      assert.equal(r.code, Array.isArray(verdict) ? undefined : verdict, label)
      assert.deepEqual(placesOf(r), Array.isArray(verdict) ? verdict : places, label)
    })
}

test("NOT_EDITABLE says which store, from the template's own table", async () => {
  const why = async (html, call) => (await run(SNAP_11, html, call)).r.unchanged?.[0]?.why
  assert.match(await why(HOME_11, { find: 'Industrial infrastructure', replace: 'x' }), /site identity/)
  assert.match(await why(HOME_11, { find: 'Services', replace: 'x', where: 'footer' }), /module title/)
  assert.match(await why(HOME_11, { find: 'Transactional emails', replace: 'x' }), /navigation file/)
  assert.match(await why(NEWS_11, { find: 'News & engineering notes', replace: 'x' }), /menu item's settings/)
})

/**
 * 🔒 THE SITE NAME NO SLOT HOLDS NAMES ITS RECORDED DOOR (ladder DL14/DL15 on dsl2jo, 14/10/2026). A 1.1.0
 * contract has no Site identity block, so the browser tab's name is Joomla's global configuration: the
 * core's next said "cannot change here; do not look for another way in", which left the shell's
 * `config:set` — a change no receipt lists, so the customer's undo in the next conversation found none.
 */
test("1.1.0: the site name in the browser tab is refused by the slot door, and its next is site.identity's recorded set", async () => {
  for (const call of [
    { find: 'Northgate Industrial - Home', replace: 'Southgate - Home' },
    { find: 'Northgate Industrial', replace: 'Southgate', where: 'title' }
  ]) {
    const { r, calls } = await run(SNAP_11, HOME_11, call)
    assert.equal(r.code, 'NOT_EDITABLE', JSON.stringify(r).slice(0, 300))
    assert.match(r.unchanged[0].why, /site name/)
    assert.doesNotMatch(r.unchanged[0].why, /locked/)
    assert.match(r.next, /^site\.identity \{operation:"set", fields:\{sitename:"<the new name>"\}\}/)
    assert.match(r.next, /apply\.revert undoes it/)
    assert.doesNotMatch(r.next, /do not look for another way in|config:set|shell/)
    assert.equal(calls.apply.length, 0)
  }
  // Any other NOT_EDITABLE keeps the core's next.
  const { r } = await run(SNAP_11, HOME_11, { find: 'Services', replace: 'x', where: 'footer' })
  assert.match(r.next, /cannot change here/)
})

test('an AMBIGUOUS answer names where a visitor sees each place, never the drawer that copies it', async () => {
  const { r } = await run(SNAP_11, HOME_11, { find: 'News', replace: 'Insights' })
  assert.deepEqual(
    r.candidates.map((c) => c.where),
    ['header', 'footer']
  )
})

// ── The hotline everywhere on 1.1.0: one apply, the language copies, the links ─────────────────────

test('1.1.0 hotline all:true: ONE apply — four blocks, their Russian copies, both tel: links — and a receipt ≤ 2 KB', async () => {
  const { r, calls } = await run(SNAP_11, HOME_11, {
    find: '8 800 550-67-90',
    replace: '0909 123 456',
    all: true
  })
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.equal(calls.apply.length, 1)
  const p = calls.apply[0]
  assert.deepEqual(Object.keys(p.changes), [
    'module-428.1',
    'module-448.1',
    'module-438.0',
    'module-458.0',
    'module-678.26',
    'module-694.26',
    'module-810.6',
    'module-824.6',
    'module-428.0',
    'module-448.0'
  ])
  assert.equal(p.changes['module-428.1'], 'Hotline: 0909 123 456', '"Hotline: " stays')
  assert.equal(p.changes['module-448.1'], 'Горячая линия: 0909 123 456')
  assert.equal(p.changes['module-428.0'], 'tel:0909123456', 'the link follows the number')
  assert.equal(p.operation, 'apply')
  assert.equal(p.expected_revision, SNAP_11.revision)
  assert.match(p.apply_id, /^contract-replace-/)
  assert.match(p.request_id, /^[a-zA-Z0-9._:-]{1,100}$/)
  assert.equal(p.request_id, requestIdOf(p.changes, undefined, SNAP_11.revision))
  assert.equal('evidence' in p, false, 'no slot here asks for evidence')
  // the receipt
  assert.deepEqual(
    r.changed.map((row) => [row.at, row.languages ?? 1]),
    [
      ['module-428.1', 2],
      ['module-438.0', 2],
      ['module-678.26', 2],
      ['module-810.6', 2]
    ]
  )
  assert.deepEqual(
    r.companions.map((c) => c.at),
    ['module-428.0', 'module-448.0']
  )
  assert.equal(r.apply_id, p.apply_id)
  assert.deepEqual(r.undo.params, { apply_id: p.apply_id })
  assert.equal(r.undo.note, REPLACE_NEXT.undoJoomla)
  assert.equal(r.next, REPLACE_NEXT.receipt)
  assert.equal(r.notReached, joomlaText('notReached', { n: 41 }), '43 languages served, 2 in the contract')
  assert.ok(
    Buffer.byteLength(JSON.stringify(r)) <= RECEIPT_MAX_BYTES,
    `${Buffer.byteLength(JSON.stringify(r))} bytes`
  )
})

test("1.1.0 e-mail all:true: the address and its mailto: in both languages; the footer's own address is another place", async () => {
  const info = await run(SNAP_11, HOME_11, {
    find: 'info@northgate-ind.ru',
    replace: 'hello@example.vn',
    all: true
  })
  assert.deepEqual(Object.keys(info.calls.apply[0].changes), [
    'module-428.3',
    'module-448.3',
    'module-428.2',
    'module-448.2'
  ])
  assert.equal(info.calls.apply[0].changes['module-448.2'], 'mailto:hello@example.vn')
  const sales = await run(SNAP_11, HOME_11, {
    find: 'sales@northgate-ind.ru',
    replace: 'hello@example.vn',
    all: true
  })
  assert.deepEqual(Object.keys(sales.calls.apply[0].changes), [
    'module-438.1',
    'module-458.1',
    'module-810.7',
    'module-824.7'
  ])
})

test('factOf: the number or address a quoted line changes, and nothing when other words change too', () => {
  const fact = (find, replace) => factOf({ find, replace })
  assert.deepEqual(fact('Hotline: 8 800 550-67-90', 'Hotline: 0909 123 456'), {
    find: '8 800 550-67-90',
    replace: '0909 123 456'
  })
  // only the digits that differ, widened to the whole number; a full stop is not part of it
  assert.deepEqual(fact('Hotline: 8 800 550-67-90.', 'Hotline: 8 800 550-67-00.'), {
    find: '8 800 550-67-90',
    replace: '8 800 550-67-00'
  })
  assert.deepEqual(fact('Call 8 800 550-67-90 or 8 800 111-22-33', 'Call 0909 123 456 or 8 800 111-22-33'), {
    find: '8 800 550-67-90',
    replace: '0909 123 456'
  })
  assert.deepEqual(fact('Write to sales@x.ru.', 'Write to hello@x.ru.'), {
    find: 'sales@x.ru',
    replace: 'hello@x.ru'
  })
  assert.equal(fact('8 800 550-67-90', '0909 123 456'), null, "a bare number is the core's own road")
  assert.equal(fact('Hotline: 8 800 550-67-90', 'Call: 0909 123 456'), null, 'other words change too')
  assert.equal(fact('Tel: 8 800 550-67-90.', 'Tel: 0909 123 456!'), null, 'the punctuation changes too')
})

test('1.1.0 a quoted hotline line: the number changes — the Russian copy and both tel: links follow, the footer is named, never the text alone', async () => {
  const { r, calls } = await run(SNAP_11, HOME_11, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Hotline: 0909 123 456'
  })
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.equal(calls.apply.length, 1)
  assert.deepEqual(calls.apply[0].changes, {
    'module-428.1': 'Hotline: 0909 123 456',
    'module-448.1': 'Горячая линия: 0909 123 456',
    'module-428.0': 'tel:0909123456',
    'module-448.0': 'tel:0909123456'
  })
  assert.equal(r.changed[0].before, 'Hotline: 8 800 550-67-90')
  assert.equal(r.changed[0].after, 'Hotline: 0909 123 456')
  assert.equal(r.changed[0].languages, 2)
  // the number's other places are named, not written: all:true is the call that reaches them
  assert.deepEqual(
    r.alsoIn.map((x) => x.at),
    ['module-438.0', 'module-678.26', 'module-810.6']
  )
  assert.equal(r.notReached, joomlaText('notReached', { n: 41 }))
})

test('1.1.0 a quoted hotline line with all:true writes every place the bare number does', async () => {
  const bare = await run(SNAP_11, HOME_11, { find: '8 800 550-67-90', replace: '0909 123 456', all: true })
  const line = await run(SNAP_11, HOME_11, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Hotline: 0909 123 456',
    all: true
  })
  assert.equal(line.r.ok, true, JSON.stringify(line.r).slice(0, 400))
  assert.deepEqual(line.calls.apply[0].changes, bare.calls.apply[0].changes)
  assert.equal(Object.keys(line.calls.apply[0].changes).length, 10)
})

test('1.1.0 the number AND other words of a line: refused with the two changes that land together, and they do', async () => {
  const { r, calls } = await run(SNAP_11, HOME_11, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Call: 0909 123 456'
  })
  assert.equal(calls.apply.length, 0, 'never the words alone, with the link on the old number')
  assert.equal(r.code, 'VALUE_NOT_ALLOWED')
  assert.equal(r.rule, 'fact-in-words')
  assert.equal(r.at, 'module-428.1')
  assert.equal(
    r.next,
    joomlaText('factWordsNext', {
      field: 'phone',
      wf: 'Hotline:',
      wr: 'Call:',
      lf: 'Hotline: 8 800 550-67-90',
      lr: 'Hotline: 0909 123 456'
    })
  )
  // the call the next names: one apply, the line with both, the fact with its copies and links
  const two = await run(SNAP_11, HOME_11, {
    changes: [
      { find: 'Hotline:', replace: 'Call:' },
      { find: 'Hotline: 8 800 550-67-90', replace: 'Hotline: 0909 123 456' }
    ]
  })
  assert.equal(two.r.ok, true, JSON.stringify(two.r).slice(0, 400))
  assert.deepEqual(two.calls.apply[0].changes, {
    'module-428.1': 'Call: 0909 123 456',
    'module-448.1': 'Горячая линия: 0909 123 456',
    'module-428.0': 'tel:0909123456',
    'module-448.0': 'tel:0909123456'
  })
  // the receipt reads the value as written, not the first change's half of it
  assert.equal(two.r.changed[0].after, 'Call: 0909 123 456')
  const long = await run(SNAP_11, HOME_11, {
    find: 'Northgate Industrial JSC · Vorsino Industrial Park, plot 12, Kaluga Region · 8 800 550-67-90',
    replace: 'Acme Works JSC · Vorsino Industrial Park, plot 12, Kaluga Region · 0909 123 456'
  })
  assert.equal(long.calls.apply.length, 0)
  assert.equal(long.r.rule, 'fact-in-words')
  assert.equal(long.r.next, joomlaText('factWordsNextLong', { field: 'phone' }))
  // words only: no fact moves, the line is written as asked
  const words = await run(SNAP_11, HOME_11, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Call us: 8 800 550-67-90'
  })
  assert.deepEqual(words.calls.apply[0].changes, { 'module-428.1': 'Call us: 8 800 550-67-90' })
})

// ── 1.2.0: Site identity ───────────────────────────────────────────────────────────────────────────

test('1.2.0 phone: ONE slot, Site identity / phone, shown in the topbar and the footer; tel: follows by itself', async () => {
  const { r, calls } = await run(SNAP_12, HOME_12, { find: '8 800 550-67-90', replace: '0909 123 456' })
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.deepEqual(calls.apply[0].changes, { 'module-4369.5': '0909 123 456' })
  assert.equal(r.changed[0].where, 'topbar, footer')
  assert.equal(r.changed[0].label, 'Site identity / phone')
  assert.ok(r.notes.includes(joomlaText('identityNote', { field: 'phone' })))
  assert.equal(r.companions, undefined, '`tel:{contact.tel}` is derived by the plugin: never rewritten')
  assert.equal(r.notReached, undefined, 'Site identity reaches every language edition')
})

test('1.2.0 site name: quoting the name renames the site — title, header, body and footer are one slot', async () => {
  const { r, calls } = await run(SNAP_12, HOME_12, { find: 'Northgate Industrial', replace: 'Tracy Demo Co' })
  assert.deepEqual(calls.apply[0].changes, { 'module-4369.0': 'Tracy Demo Co' })
  assert.equal(r.changed[0].where, 'title, header, main, footer')
})

test('1.2.0 slogan and address: the header lockup and the tokens print Site identity', async () => {
  const slogan = await run(SNAP_12, HOME_12, {
    find: 'Industrial infrastructure',
    replace: 'Trusted since 2004',
    where: 'header'
  })
  assert.deepEqual(slogan.calls.apply[0].changes, { 'module-4369.2': 'Trusted since 2004' })
  const address = await run(SNAP_12, HOME_12, {
    find: 'Vorsino Industrial Park, plot 12, Kaluga Region',
    replace: '12 Nguyen Hue, District 1, Ho Chi Minh City',
    all: true
  })
  assert.deepEqual(address.calls.apply[0].changes, {
    'module-4369.6': '12 Nguyen Hue, District 1, Ho Chi Minh City'
  })
  assert.equal(address.r.changed[0].where, 'topbar, footer')
})

test('1.2.0 a quoted line with a contact token: the words stay, the fact goes to Site identity', async () => {
  const same = await run(SNAP_12, HOME_12, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Hotline: 0909 123 456'
  })
  assert.deepEqual(same.calls.apply[0].changes, { 'module-4369.5': '0909 123 456' })
  assert.equal(same.r.changed[0].at, 'module-4369.5', 'the receipt names the slot written')
  const words = await run(SNAP_12, HOME_12, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Call us: 8 800 550-67-90'
  })
  assert.deepEqual(
    words.calls.apply[0].changes,
    { 'module-428.1': 'Call us: {contact.phone}' },
    'the token stays'
  )
})

test('1.2.0 words AND the phone in one change: refused with the two changes it needs, nothing sent', async () => {
  const { r, calls } = await run(SNAP_12, HOME_12, {
    find: 'Hotline: 8 800 550-67-90',
    replace: 'Call: 0909 123 456'
  })
  assert.equal(calls.apply.length, 0)
  assert.equal(r.code, 'VALUE_NOT_ALLOWED')
  assert.equal(r.rule, 'identity-token')
  assert.equal(r.at, 'module-428.1')
  assert.match(r.next, /changes:\[/)
  assert.match(r.next, /find:"8 800 550-67-90"/)
})

test('1.2.0 a Site identity fact the customer removes is emptied, even as a whole list item; an ordinary heading is still refused', async () => {
  const everywhere = await run(SNAP_12, HOME_12, {
    find: 'Mon–Fri, 9:00–18:00 (MSK)',
    replace: '',
    all: true
  })
  assert.equal(everywhere.calls.apply.length, 0)
  assert.equal(everywhere.r.rule, 'cannot-empty')
  assert.equal(everywhere.r.at, 'module-810.8', 'the slot that keeps its words, never the identity slot')
  const heading = await run(SNAP_12, HOME_12, { find: 'Selected projects', replace: '' })
  assert.equal(heading.calls.apply.length, 0)
  assert.equal(heading.r.rule, 'cannot-empty')
  assert.equal(heading.r.at, 'module-443.0')
})

{
  for (const [find, at, call] of [
    ['Mon–Fri, 9:00–18:00 (MSK)', 'module-4369.7', { where: 'footer' }],
    ['sales@northgate-ind.ru', 'module-4369.4', { all: true }],
    ['Vorsino Industrial Park, plot 12, Kaluga Region', 'module-4369.6', { all: true }]
  ])
    test(`1.2.0 a Site identity fact the customer removes is emptied, even as a whole list item; an ordinary heading is still refused: ${rowName(find)}`, async () => {
      const { r, calls } = await run(SNAP_12, HOME_12, { find, replace: '', ...call })
      assert.equal(r.ok, true, `${find}: ${JSON.stringify(r).slice(0, 300)}`)
      assert.deepEqual(calls.apply[0].changes, { [at]: '' })
      assert.equal(r.changed[0].after, '')
      // words taken out: the receipt says the space left where they stood is harmless (round 7)
      assert.equal(r.next, REPLACE_NEXT.receiptRemoved, find)
    })
}

test('1.2.0 a site name inside a wider quote: the line gets the words asked for, and the receipt says it no longer follows the name', async () => {
  assert.equal(NAME_IN_QUOTE, 'line')
  const line = await run(SNAP_12, HOME_12, { find: 'Why Northgate Industrial', replace: 'Why choose us' })
  assert.deepEqual(line.calls.apply[0].changes, { 'module-444.0': 'Why choose us' })
  assert.ok(line.r.notes.includes(joomlaText('tokenLineNote', { at: 'module-444.0', field: 'site-name' })))
  // the other road stays available (the P9 spec): a question instead of the write
  const drop = await run(
    SNAP_12,
    HOME_12,
    { find: 'Why Northgate Industrial', replace: 'Why choose us' },
    { nameInQuote: 'refuse' }
  )
  assert.equal(drop.calls.apply.length, 0)
  assert.equal(drop.r.code, 'VALUE_NOT_ALLOWED')
  assert.equal(drop.r.rule, 'identity-token')
  assert.equal(drop.r.at, 'module-444.0')
  assert.equal(
    drop.r.next,
    joomlaText('nameTokenNext', { value: 'Northgate Industrial', field: 'site name' })
  )
  // the name still in the new words stays a token — never its value copied in
  const keep = await run(SNAP_12, HOME_12, {
    find: 'Why Northgate Industrial',
    replace: 'Why work with Northgate Industrial'
  })
  assert.deepEqual(keep.calls.apply[0].changes, { 'module-444.0': 'Why work with {site.name}' })
  assert.equal(keep.r.notes, undefined)
})

{
  const rename = { find: 'Northgate Industrial', replace: 'Acme Works' }
  const line = { find: 'Why Northgate Industrial', replace: 'Why Acme Works' }
  for (const changes of [
    [rename, line],
    [line, rename]
  ])
    test(`1.2.0 a line that shows the NEW name this same call gives the site keeps its token, in either order: ${rowName(changes)}`, async () => {
      for (const nameInQuote of ['refuse', 'line']) {
        const { r, calls } = await run(SNAP_12, HOME_12, { changes }, { nameInQuote })
        assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
        // "Why {site.name}" already prints "Why Acme Works" once the name is Acme Works: nothing to write there
        assert.deepEqual(calls.apply[0].changes, { 'module-4369.0': 'Acme Works' })
        assert.ok(!r.notes.some((n) => /no longer follows/.test(n)), 'the line still follows the name')
      }
    })
}

// ── 1.2.0: social links (P9 "site-name/phone/social cases") ────────────────────────────────────────

test('1.2.0 social: an address sent as a label is refused, with the apply that sets Site identity / facebook — never written as the words', async () => {
  const mail = await run(SNAP_12, HOME_12, { find: 'Facebook', replace: 'mailto:hello@acme.test', all: true })
  assert.deepEqual(mail.r.apply.params.changes, { 'module-4369.8': 'mailto:hello@acme.test' })
  // an address this site does not take is the value rule's answer, on the slot that would hold it
  const www = await run(SNAP_12, HOME_12, {
    find: 'Facebook',
    replace: 'www.facebook.com/acme',
    at: ['module-438.5']
  })
  assert.equal(www.r.rule, 'url')
  assert.equal(www.r.at, 'module-4369.8')
  assert.equal(www.calls.apply.length, 0)
})

{
  for (const [html, call] of [
    [HOME_12, { find: 'Facebook', replace: 'https://facebook.com/acme', all: true }],
    [
      CONTACT_12,
      { find: 'Facebook', replace: 'https://facebook.com/acme', path: '/en/contact', where: 'main' }
    ],
    [HOME_12, { find: 'Facebook', replace: 'https://facebook.com/acme', at: ['module-438.5'] }]
  ])
    test(`1.2.0 social: an address sent as a label is refused, with the apply that sets Site identity / facebook — never written as the words: ${rowName(html)}`, async () => {
      const { r, calls } = await run(SNAP_12, html, call)
      assert.equal(calls.apply.length, 0, JSON.stringify(call))
      assert.equal(r.code, 'VALUE_NOT_ALLOWED')
      assert.equal(r.rule, 'link-address')
      assert.equal(r.error, joomlaText('linkAddressError', { find: 'Facebook' }))
      assert.equal(r.next, joomlaText('linkAddressNext', { label: 'Site identity / facebook' }))
      // the ready apply: the Site identity slot `{social.facebook}` prints on every page and language
      assert.deepEqual(r.apply, {
        action: 'content.contract',
        params: {
          operation: 'apply',
          expected_revision: SNAP_12.revision,
          changes: { 'module-4369.8': 'https://facebook.com/acme' }
        }
      })
    })
}

// L32 (05/10/2026, benchjoomlaapply01): a row the Claude Cowork plugin wrote into is saved through PHP `saveHTML`, and libxml2
// 2.9 percent-encodes the braces of its links — the vi-VN top bar the language derivation made reads `tel:%7Bcontact.tel%7D`.
// The link still prints Site identity / phone, so the ready apply sets that slot, never a literal number in the row's own link.
{
  const resaved = (/** @type {Record<string, string>} */ current) => ({
    ...SNAP_12,
    slots: SNAP_12.slots.map((s) => (s.key in current ? { ...s, current: current[s.key] } : s))
  })
  for (const href of ['tel:%7Bcontact.tel%7D', 'tel:%7bcontact.tel%7d'])
    test(`1.2.0 a link whose token the site stored percent-encoded still names Site identity: ${href}`, async () => {
      const raw = await run(SNAP_12, HOME_12, { find: 'Hotline', replace: 'tel:0909123456' })
      const { r, calls } = await run(resaved({ 'module-428.0': href }), HOME_12, {
        find: 'Hotline',
        replace: 'tel:0909123456'
      })
      assert.equal(calls.apply.length, 0)
      assert.equal(r.rule, 'link-address')
      assert.deepEqual(r.apply.params.changes, { 'module-4369.5': '0909123456' })
      assert.deepEqual(
        r.apply.params.changes,
        raw.r.apply.params.changes,
        'the same answer as on the row as shipped'
      )
      assert.equal(r.next, joomlaText('linkAddressNext', { label: 'Site identity / phone' }))
    })
}

test("1.2.0 social: a new label is words — written in the page's language only, the Russian copy left as it is", async () => {
  const footer = await run(SNAP_12, HOME_12, {
    find: 'Facebook',
    replace: 'Facebook page',
    at: ['module-438.5']
  })
  assert.equal(footer.r.ok, true, JSON.stringify(footer.r).slice(0, 400))
  assert.deepEqual(footer.calls.apply[0].changes, { 'module-438.5': 'Facebook page' })
  const contact = await run(SNAP_12, CONTACT_12, {
    find: 'Facebook',
    replace: 'Facebook page',
    path: '/en/contact',
    where: 'main'
  })
  assert.deepEqual(contact.calls.apply[0].changes, { 'module-813.2': 'Facebook page' })
  // two English places and no page that shows either: the question, never a guess
  const both = await run(SNAP_12, HOME_12, { find: 'Facebook', replace: 'Facebook page' })
  assert.equal(both.r.code, 'AMBIGUOUS')
  assert.deepEqual(
    both.r.candidates.map((c) => c.at),
    ['module-438.5', 'module-813.2']
  )
  assert.equal(both.calls.apply.length, 0)
})

/** What the engine writes for each held-out ask */
const ENGINE_12 = {
  'C01 /en/': ['module-441.1', 'module-441.2'],
  'C17 /en/': ['module-441.4'],
  'C26 /en/': ['VALUE_NOT_ALLOWED', 'cannot-empty'],
  'C03 /en/': ['module-442.9'],
  'C18 /en/': ['module-443.0'],
  'C19 /en/': ['module-445.0'],
  'C52 /en/': ['module-441.10'],
  'C05 /en/': ['module-4369.2'],
  'C21 /en/': ['module-4369.6'],
  'C22 /en/': ['module-4369.7'],
  'C23 /en/': ['module-439.0', 'module-459.0'],
  'C04 /en/': ['module-4369.5'],
  'C10 /en/': ['module-4369.4'],
  'C10 /en/contact': ['module-4369.4'],
  'C06 /en/': ['menuItem-603.0'],
  'C34 /en/': ['AMBIGUOUS'],
  'C35 /en/': ['NOT_EDITABLE'],
  'C45 /en/': ['menuItem-600.0'],
  'C07 /en/': ['module-441.3'],
  'C32 /en/': ['module-441.3'],
  'C40 /en/': ['VALUE_NOT_ALLOWED', 'cannot-empty'],
  'C11 /en/': ['module-444.7', 'module-444.8', 'module-444.9'],
  'C46 /en/about': ['article-555.1'],
  'C28 /en/': ['module-4369.5', 'module-4369.4'],
  'C29 /en/': ['module-441.1', 'module-441.2', 'module-441.4', 'module-441.3'],
  'C12 /en/': ['module-441.1', 'module-441.2', 'module-441.3', 'module-441.4', 'module-441.6']
}

const HELD_12 = HELDOUT.cases.filter((c) => c.site === 'benchjoomla01')

/** The words a visitor reads from what one apply writes */
function writtenWords(changes) {
  const store = joomlaStore(SNAP_12, contractOf(SNAP_12).table)
  const values = new Map(store.values)
  for (const [token, unit] of store.identity) if (unit.at in changes) values.set(token, changes[unit.at])
  values.set('contact.tel', (values.get('contact.phone') ?? '').replace(/[^0-9+]/g, ''))
  const shown = Object.values(changes).map((v) =>
    v.replace(/\{([a-zA-Z.]+)\}/g, (whole, name) => (values.has(name) ? values.get(name) : whole))
  )
  return squash(shown.join(' '))
}

/** @param {string} s */
const squash = (s) => foldForMatch(s).replace(/[^\p{L}\p{N}]/gu, '')

test('held-out: every benchjoomla01 ask has an engine verdict', () => {
  assert.deepEqual(
    HELD_12.map((c) => `${c.case} ${c.path}`),
    Object.keys(ENGINE_12)
  )
})

/** One held-out WRITE */
function assertWrite(c, r, calls, want) {
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 500))
  assert.equal(calls.apply.length, 1, 'ONE apply')
  assert.deepEqual(Object.keys(calls.apply[0].changes), want)
  // every region the page shows the words in is a region the receipt names (pageSays)
  const shown = new Set(r.changed.flatMap((row) => String(row.where).split(', ')))
  for (const [region] of c.pageSays.places) assert.ok(shown.has(region), `${region} not in ${[...shown]}`)
  const words = writtenWords(calls.apply[0].changes)
  for (const ch of c.call.changes ?? [c.call]) {
    const wanted = squash(ch.replace)
    if (wanted !== '') assert.ok(words.includes(wanted), `"${ch.replace}" is not in what is written`)
    // the old words are gone where the new ones do not keep them
    if (!ch.replace.includes(ch.find)) assert.ok(!words.includes(squash(ch.find)), ch.find)
  }
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= RECEIPT_MAX_BYTES)
}

{
  for (const c of HELD_12)
    test(`held-out: each benchjoomla01 ask is one apply of exactly the engine’s slots, or a refusal the suite accepts that sends nothing: ${rowName(c)}`, async () => {
      const key = `${c.case} ${c.path}`
      const want = ENGINE_12[key]

      const { r, calls } = await run(SNAP_12, fixture(c.page), c.call, { message: c.prompt })

      if (
        want[0].startsWith('module-') ||
        want[0].startsWith('menuItem-') ||
        want[0].startsWith('article-')
      ) {
        assertWrite(c, r, calls, want)
        return
      }
      assert.equal(r.ok, false, key)
      assert.equal(calls.apply.length, 0, `${key}: a refusal sends nothing`)
      assert.equal(r.code, want[0], `${key} ${JSON.stringify(r).slice(0, 400)}`)
      if (want[1]) assert.equal(r.rule, want[1], key)
      assert.ok(
        c.refuseOk || c.askOk || c.pageSays.verdict === r.code,
        `${key}: only where the suite accepts it`
      )
    })
}

test('the held-out check reads tokens as the page prints them: a phone written to Site identity shows in the topbar', () => {
  assert.ok(writtenWords({ 'module-4369.5': '0909 123 456' }).includes(squash('0909 123 456')))
  assert.ok(writtenWords({ 'module-444.0': 'Why {site.name}' }).includes(squash('Why Northgate Industrial')))
  assert.ok(!writtenWords({ 'module-444.0': 'Why {site.name}' }).includes(squash('Why Acme')))
})

test('the H1 splits over title + title-accent, two non-empty lines within 74 and 64', async () => {
  const { calls, r } = await run(SNAP_12, HOME_12, {
    find: 'Building the groundwork for next-generation plants',
    replace: 'Built for the way you work'
  })
  const { 'module-441.1': a, 'module-441.2': b } = calls.apply[0].changes
  assert.equal(`${a} ${b}`, 'Built for the way you work')
  assert.ok(a.length > 0 && a.length <= 74 && b.length > 0 && b.length <= 64)
  assert.match(r.notes[0], /two lines/)
  const one = await run(SNAP_12, HOME_12, {
    find: 'Building the groundwork for next-generation plants',
    replace: 'Built'
  })
  assert.equal(one.r.rule, 'two-lines')
  assert.equal(one.calls.apply.length, 0)
})

// ── Value rules before the relay (contract-check.mjs) ──────────────────────────────────────────────

test('words across the line break of a two-line heading: the heading, never "words the template prints"', async () => {
  // the page shows the new heading: verified by the harness's own read
  const read = await run(
    SNAP_12,
    HOME_12,
    { find: 'for next-generation plants', replace: 'for modern plants' },
    {
      page: (n) => ({
        ok: true,
        status: 200,
        html: n === 1 ? HOME_12 : HOME_12.replace('next-generation plants', 'modern plants')
      })
    }
  )
  assert.equal(read.r.verified, joomlaText('shown', { path: '/' }))
})

{
  const cases = [
    // the words that differ sit in line 2: line 1 keeps its stored bytes
    [
      SNAP_12,
      HOME_12,
      '/',
      'for next-generation plants',
      'for modern plants',
      { 'module-441.2': 'modern plants' }
    ],
    [
      SNAP_12,
      HOME_12,
      '/',
      'groundwork for next-generation',
      'groundwork for new',
      { 'module-441.2': 'new plants' }
    ],
    [
      SNAP_12,
      HOME_RU_12,
      '/ru/',
      'для заводов нового поколения',
      'для современных заводов',
      { 'module-461.2': 'современных заводов' }
    ],
    // across the break: it stays after the word it followed
    [
      SNAP_12,
      HOME_12,
      '/',
      'groundwork for next-generation plants',
      'base for modern plants',
      { 'module-441.1': 'Building the base for', 'module-441.2': 'modern plants' }
    ],
    [
      SNAP_11,
      HOME_11,
      '/',
      'Motors — your authorised',
      'Motors, your',
      { 'module-441.1': 'Toyota Hanoi Motors,', 'module-441.2': 'your Toyota dealer' }
    ],
    // the customer's own line break is where the break goes
    [
      SNAP_12,
      HOME_12,
      '/',
      'groundwork for next-generation plants',
      'base\nfor modern plants',
      { 'module-441.1': 'Building the base', 'module-441.2': 'for modern plants' }
    ]
  ]
  for (const [snap, html, path, find, replace, want] of cases)
    test(`words across the line break of a two-line heading: the heading, never "words the template prints": ${rowName(snap)}`, async () => {
      const { r, calls } = await run(snap, html, { find, replace, path })
      assert.equal(r.ok, true, `${find}: ${JSON.stringify(r).slice(0, 400)}`)
      assert.equal(calls.apply.length, 1)
      assert.deepEqual(calls.apply[0].changes, want, find)
      assert.equal(r.changed.length, 1, 'ONE place: the heading')
      assert.match(r.changed[0].at, /^module-4[46]1\.1\+module-4[46]1\.2$/)
    })
}

test('words across the line break with no page to confirm them: a candidate, and written once named', async () => {
  const unread = () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'The page did not answer.' })
  const call = { find: 'for next-generation plants', replace: 'for modern plants' }
  const ask = await run(SNAP_12, '', call, { page: unread })
  assert.equal(ask.calls.apply.length, 0)
  assert.equal(ask.r.code, 'AMBIGUOUS')
  assert.equal(ask.r.error, joomlaText('textOnlyError', { find: call.find }))
  assert.equal(ask.r.next, joomlaText('textOnlyNext', { at: 'module-441.1+module-441.2' }))
  const named = await run(SNAP_12, '', { ...call, at: ['module-441.1+module-441.2'] }, { page: unread })
  assert.equal(named.r.ok, true, JSON.stringify(named.r).slice(0, 300))
  assert.deepEqual(named.calls.apply[0].changes, { 'module-441.2': 'modern plants' })
  // one word left for a heading that keeps two lines: the core's two-lines rule, nothing sent
  const one = await run(SNAP_12, HOME_12, { find: 'the groundwork for next-generation plants', replace: '' })
  assert.equal(one.calls.apply.length, 0)
  assert.equal(one.r.rule, 'two-lines')
})

test("the component's value rules answer before any apply: markup, directive, length, occupancy", async () => {
  const long = await run(SNAP_12, HOME_12, { find: 'Selected projects', replace: 'x'.repeat(55) })
  assert.equal(long.r.limit, 54)
  assert.equal(
    long.r.error,
    replaceText('maxCharactersError', { what: 'the new text', len: 55, at: 'module-443.0', limit: 54 })
  )
  // an identity token is words a customer may keep (identity.php)
  const token = await run(SNAP_12, HOME_12, { find: 'Selected projects', replace: 'Work of {site.name}' })
  assert.deepEqual(token.calls.apply[0].changes, { 'module-443.0': 'Work of {site.name}' })
})

{
  const cases = [
    [{ find: 'Selected projects', replace: 'A <b>big</b> list' }, 'no-markup'],
    [{ find: 'Selected projects', replace: 'Our {loadmodule 1} work' }, 'no-directive'],
    [{ find: 'Selected projects', replace: 'x'.repeat(55) }, 'max-characters'],
    [
      {
        find: 'Design–build main contractor for industrial park infrastructure, factory buildings and engineering systems across 14 regions of Central and Volga Russia.',
        replace: ''
      },
      'cannot-empty'
    ]
  ]
  for (const [call, rule] of cases)
    test(`the component's value rules answer before any apply: markup, directive, length, occupancy: ${rowName(call)}`, async () => {
      const { r, calls } = await run(SNAP_12, HOME_12, call)
      assert.equal(calls.apply.length, 0, rule)
      assert.equal(r.code, 'VALUE_NOT_ALLOWED', rule)
      assert.equal(r.rule, rule)
      assert.equal(r.at, rule === 'cannot-empty' ? 'module-441.3' : 'module-443.0')
    })
}

test('TRACY_CONTRACT_PRECHECK=off leaves every value to the component: the apply goes out as planned', async () => {
  const { r, calls } = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'A <b>big</b> list' },
    {
      env: { TRACY_CONTRACT_PRECHECK: 'off' },
      applies: [
        {
          ok: false,
          error: 'contract_failed',
          message: 'Markup and control characters are not content: module-443.0'
        }
      ]
    }
  )
  assert.equal(calls.apply.length, 1)
  assert.equal(r.error, 'contract_failed', "the component's refusal, unchanged")
  assert.match(r.next, /Plain text only/)
})

test("evidence is the customer's own sentence carrying the new words; without it the slot is refused, nothing sent", async () => {
  const ok = await run(
    SNAP_12,
    ABOUT_12,
    { find: '380+', replace: '400+' },
    {
      message: 'Chào Tracy. Đổi 380+ thành 400+ ở trang giới thiệu. Cảm ơn!'
    }
  )
  assert.equal(ok.r.ok, true, JSON.stringify(ok.r).slice(0, 300))
  assert.deepEqual(ok.calls.apply[0].changes, { 'module-837.0': '400+' })
  assert.deepEqual(ok.calls.apply[0].evidence, { 'module-837.0': 'Đổi 380+ thành 400+ ở trang giới thiệu.' })
  assert.equal(
    ok.calls.apply[0].request_id,
    requestIdOf(ok.calls.apply[0].changes, ok.calls.apply[0].evidence, SNAP_12.revision),
    'the request id covers the evidence (D9)'
  )
  const none = await run(
    SNAP_12,
    ABOUT_12,
    { find: '380+', replace: '400+' },
    { message: 'Sửa số dự án cho đẹp.' }
  )
  assert.equal(none.calls.apply.length, 0)
  assert.equal(none.r.rule, 'evidence')
  assert.equal(none.r.at, 'module-837.0')
  assert.match(none.r.next, /Invented by Tracy/)
})

test('a dryRun is never refused for evidence: it says where the words are, which slot asks for it, and the apply to send', async () => {
  const about = await run(
    SNAP_12,
    ABOUT_12,
    { find: '380+', replace: '400+', path: '/en/about', dryRun: true },
    { message: 'Sửa số dự án cho đẹp.' }
  )
  assert.equal(about.r.ok, true, JSON.stringify(about.r).slice(0, 400))
  assert.equal(about.calls.apply.length, 0)
  assert.deepEqual(
    about.r.would.map((w) => [w.at, w.after]),
    [['module-837.0', '400+']]
  )
  assert.deepEqual(about.r.needsEvidence, ['module-837.0'])
  assert.deepEqual(about.r.apply, {
    action: 'content.contract',
    params: { operation: 'apply', expected_revision: SNAP_12.revision, changes: { 'module-837.0': '400+' } }
  })
  assert.equal(about.r.next, joomlaText('evidenceNext'))
  // no message at all, every place: the locate road answers, and names the one slot that asks
  const vorsino = await run(SNAP_12, HOME_12, { find: 'Vorsino', replace: 'Hanoi', all: true, dryRun: true })
  assert.equal(vorsino.r.ok, true, JSON.stringify(vorsino.r).slice(0, 400))
  assert.equal(vorsino.calls.apply.length, 0)
  assert.deepEqual(vorsino.r.needsEvidence, ['module-841.15'])
  assert.ok('module-841.15' in vorsino.r.apply.params.changes)
  assert.ok(Buffer.byteLength(JSON.stringify(vorsino.r)) <= RECEIPT_MAX_BYTES)
  // every other value rule still holds on a dryRun
  const markup = await run(SNAP_12, HOME_12, {
    find: 'Selected projects',
    replace: 'A <b>big</b> list',
    dryRun: true
  })
  assert.equal(markup.r.rule, 'no-markup')
})

test("evidence from an earlier message of the customer's is theirs; the next names both roads, in refusalNext's words", async () => {
  // the customer gave the words, then answered a question in a new message
  const earlier = await run(
    SNAP_12,
    ABOUT_12,
    { find: '380+', replace: '400+', path: '/en/about' },
    { message: ['The second one.', 'Chào Tracy. Đổi 380+ thành 400+ ở trang giới thiệu.'] }
  )
  assert.equal(earlier.r.ok, true, JSON.stringify(earlier.r).slice(0, 300))
  assert.deepEqual(earlier.calls.apply[0].evidence, {
    'module-837.0': 'Đổi 380+ thành 400+ ở trang giới thiệu.'
  })
  const lee = refusalNext({
    ok: false,
    error: 'contract_failed',
    message: 'Customer evidence required: module-837.0'
  })
  assert.ok(lee.includes(INVENTED_EVIDENCE), 'site.mjs quotes the same declaration')
  assert.ok(JOOMLA_REPLACE_NEXT.evidenceNext.includes(INVENTED_EVIDENCE))
  assert.match(lee, /If the customer gave it, pass their words/)
  assert.match(JOOMLA_REPLACE_NEXT.evidenceNext, /the customer's words from the message that gave them, or/)
})

// ── The apply's answers ────────────────────────────────────────────────────────────────────────────

test('"Content changed" once: one fresh snapshot, a NEW apply id, then the receipt', async () => {
  const { r, calls } = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [
        { ok: false, error: 'contract_failed', message: 'Content changed; inspect again' },
        { ok: true }
      ]
    }
  )
  assert.equal(r.ok, true)
  assert.deepEqual(calls.snapshot, [false, true])
  assert.equal(calls.apply.length, 2)
  assert.notEqual(calls.apply[0].apply_id, calls.apply[1].apply_id)
  assert.equal(r.apply_id, calls.apply[1].apply_id)
})

test('"Content changed" twice: STORE_CHANGED carries what was planned and the Joomla next', async () => {
  const { r, calls } = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [{ ok: false, error: 'contract_failed', message: 'conflict at operation 1' }]
    }
  )
  assert.equal(calls.apply.length, 2)
  assert.deepEqual(r.planned, [
    { at: 'module-443.0', before: 'Selected projects', after: 'Featured projects' }
  ])
  assert.equal(r.next, joomlaText('storeChangedNext'))
})

test('writer_busy and door refusals pass through with their own code, plus what was planned', async () => {
  const busy = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [{ ok: false, error: 'writer_busy', message: WRITER_LOCK_MESSAGE, retried: 3 }]
    }
  )
  assert.equal(busy.r.error, 'writer_busy')
  assert.match(busy.r.next, /nothing from this call was written/)
  assert.equal(busy.r.planned.length, 1)
  const lease = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [
        {
          ok: false,
          code: 'SITE_BUSY',
          error: 'Another conversation is changing this site.',
          next: 'Wait for it.'
        }
      ]
    }
  )
  assert.equal(lease.r.code, 'SITE_BUSY')
  assert.equal(lease.r.next, 'Wait for it.', "the door's own next is kept")
  assert.equal(lease.calls.apply.length, 1, 'no retry of a door refusal')
  assert.deepEqual(lease.r.planned[0].at, 'module-443.0')
})

test('an answer lost on the way back: the answer names the apply id, and the check waits as OUTCOME_UNKNOWN says', async () => {
  const { r, calls } = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [
        { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'The site did not answer.', next: 'Retry once.' }
      ]
    }
  )
  assert.equal(r.next, joomlaText('outcomeUnknownNext'))
  assert.equal(r.apply_id, calls.apply[0].apply_id)
  const inspectNext = refusalNext({ ok: false, code: 'OUTCOME_UNKNOWN', recheck: 'inspect' })
  assert.match(inspectNext, /in about 30 s/)
  assert.match(r.next, /in about 30 s/)
})

test('an apply that throws is an answer lost on the way back: the apply id, what was planned, no resend', async () => {
  const threw = { snapshot: 0, apply: [] }
  const out = await replaceOnJoomla({
    plan: planReplace({ find: 'Selected projects', replace: 'Featured projects' }),
    snapshot: async () => {
      threw.snapshot += 1
      return SNAP_12
    },
    apply: async (params) => {
      threw.apply.push(params)
      throw new Error('socket hang up')
    },
    pageHtml: async () => ({ ok: true, status: 200, html: HOME_12 }),
    mint: (prefix) => `${prefix}-thrown`,
    env: {}
  })
  assert.equal(threw.apply.length, 1, 'no second apply under a new id')
  assert.equal(out.ok, false)
  assert.equal(out.code, 'COWORK_WEB_UNREACHABLE')
  assert.equal(out.apply_id, 'contract-replace-thrown')
  assert.deepEqual(out.planned, [
    { at: 'module-443.0', before: 'Selected projects', after: 'Featured projects' }
  ])
  assert.equal(out.next, joomlaText('outcomeUnknownNext'))
})

test('a second read that throws after an accepted apply keeps the receipt: verified says the page was not read', async () => {
  let reads = 0
  const out = await replaceOnJoomla({
    plan: planReplace({ find: 'Selected projects', replace: 'Featured projects' }),
    snapshot: async () => SNAP_12,
    apply: async () => ({ ok: true }),
    pageHtml: async () => {
      reads += 1
      if (reads > 1) throw new Error('read timed out')
      return { ok: true, status: 200, html: HOME_12 }
    },
    mint: (prefix) => `${prefix}-kept`,
    env: {}
  })
  assert.equal(reads, 2)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.apply_id, 'contract-replace-kept')
  assert.deepEqual(
    /** @type {any[]} */ (out.changed).map((row) => row.after),
    ['Featured projects']
  )
  assert.equal(out.verified, joomlaText('unread'))
})

test('nothing to write, or the component already so: a receipt with nothing changed and no apply id to undo', async () => {
  const same = await run(SNAP_12, HOME_12, { find: 'selected projects', replace: 'Selected projects' })
  assert.equal(same.calls.apply.length, 0)
  assert.deepEqual(same.r.changed, [])
  assert.deepEqual(same.r.notes, [joomlaText('already')])
  const unchanged = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      applies: [{ ok: true, unchanged: true }]
    }
  )
  assert.deepEqual(unchanged.r.changed, [])
  assert.equal(unchanged.r.undo, undefined)
})

// ── dryRun, count rules, the page read ─────────────────────────────────────────────────────────────

test('dryRun: where the words live and what would change, no apply, no page read after', async () => {
  const { r, calls } = await run(SNAP_12, HOME_12, {
    find: '8 800 550-67-90',
    replace: '0909 123 456',
    dryRun: true
  })
  assert.equal(r.dryRun, true)
  assert.equal(calls.apply.length, 0)
  assert.equal(calls.page.length, 1)
  assert.deepEqual(
    r.would.map((w) => [w.at, w.where]),
    [['module-4369.5', 'topbar, footer']]
  )
})

test('count rules over the whole call: expect must match, and a non-exact all needs a dryRun or expect', async () => {
  const mismatch = await run(SNAP_11, HOME_11, {
    find: '8 800 550-67-90',
    replace: '0909 123 456',
    all: true,
    expect: 2
  })
  assert.equal(mismatch.r.code, 'COUNT_MISMATCH')
  assert.equal(mismatch.r.count, 4)
  const loose = await run(SNAP_11, HOME_11, { find: 'northgate', replace: 'Southgate', all: true })
  assert.equal(loose.r.rule, 'confirm-count')
  assert.equal(loose.calls.apply.length, 0)
  const confirmed = await run(
    SNAP_11,
    HOME_11,
    { find: 'northgate', replace: 'Southgate', all: true },
    { confirmed: true }
  )
  assert.equal(confirmed.r.ok, true, JSON.stringify(confirmed.r).slice(0, 300))
})

test('the page is read again after the write: verified says whether it shows the new words', async () => {
  const after = HOME_12.replace('Selected projects', 'Featured projects')
  const shown = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects', path: '/en/' },
    {
      page: (n) => ({ ok: true, status: 200, html: n === 1 ? HOME_12 : after })
    }
  )
  assert.deepEqual(shown.calls.page, ['/en/', '/en/'])
  assert.equal(shown.r.verified, joomlaText('shown', { path: '/en/' }))
  const cached = await run(SNAP_12, HOME_12, { find: 'Selected projects', replace: 'Featured projects' })
  assert.equal(cached.r.verified, joomlaText('notShown', { path: '/' }))
  const token = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Work of {site.name}', path: '/en/' },
    {
      page: (n) => ({
        ok: true,
        status: 200,
        html: n === 1 ? HOME_12 : HOME_12.replace('Selected projects', 'Work of Northgate Industrial')
      })
    }
  )
  assert.deepEqual(token.calls.apply[0].changes, { 'module-443.0': 'Work of {site.name}' })
  assert.equal(token.r.verified, joomlaText('shown', { path: '/en/' }))
  // …with the name this same call gives the site
  const renamed = await run(
    SNAP_12,
    HOME_12,
    {
      path: '/en/',
      changes: [
        { find: 'Northgate Industrial', replace: 'Acme Works' },
        { find: 'Selected projects', replace: 'Work of {site.name}' }
      ]
    },
    {
      page: (n) => ({
        ok: true,
        status: 200,
        html:
          n === 1
            ? HOME_12
            : HOME_12.replaceAll('Northgate Industrial', 'Acme Works').replace(
                'Selected projects',
                'Work of Acme Works'
              )
      })
    }
  )
  assert.equal(renamed.r.ok, true, JSON.stringify(renamed.r).slice(0, 300))
  assert.equal(renamed.r.verified, joomlaText('shown', { path: '/en/' }))
  const off = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    { verify: false }
  )
  assert.equal(off.calls.page.length, 1)
  assert.equal(off.r.verified, undefined)
})

test('verified is never invented: an emptied value or words already on the page need the second read to show the change', async () => {
  const cached = await run(SNAP_12, HOME_12, { find: '8 800 550-67-90', replace: '', path: '/en/' })
  assert.equal(cached.r.ok, true, JSON.stringify(cached.r).slice(0, 300))
  assert.equal(cached.r.verified, joomlaText('notShown', { path: '/en/' }))
  const gone = await run(
    SNAP_12,
    HOME_12,
    { find: '8 800 550-67-90', replace: '', path: '/en/' },
    {
      page: (n) => ({
        ok: true,
        status: 200,
        html: n === 1 ? HOME_12 : HOME_12.replaceAll('8 800 550-67-90', '')
      })
    }
  )
  assert.equal(gone.r.verified, joomlaText('shown', { path: '/en/' }))
  // new words the page already printed elsewhere ("Request a quote" is a button): the unchanged read fails
  assert.ok(HOME_12.includes('Request a quote'))
  const elsewhere = await run(SNAP_12, HOME_12, { find: 'Selected projects', replace: 'Request a quote' })
  assert.equal(elsewhere.calls.apply.length, 1)
  assert.equal(elsewhere.r.verified, joomlaText('notShown', { path: '/' }))
  // new words inside the old ones: the old words gone is the change shown
  const shorter = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'projects' },
    {
      page: (n) => ({
        ok: true,
        status: 200,
        html: n === 1 ? HOME_12 : HOME_12.replace('Selected projects', 'projects')
      })
    }
  )
  assert.equal(shorter.r.verified, joomlaText('shown', { path: '/' }))
})

test('the page could not be read: stored words alone, and only a whole value spelled as asked is written', async () => {
  const unread = () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'The page did not answer.' })
  const whole = await run(
    SNAP_11,
    '',
    { find: 'Selected projects', replace: 'Featured projects', path: '/en/' },
    { page: unread }
  )
  assert.equal(whole.r.ok, true, JSON.stringify(whole.r).slice(0, 300))
  assert.deepEqual(whole.calls.apply[0].changes, { 'module-443.0': 'Featured projects' })
  assert.equal(whole.r.verified, joomlaText('unread'))
  assert.ok(whole.r.notes.includes(replaceText('textOnlyNote')))
  // the tagline decoy is a part of article-555.1's title: never written without the page to confirm it
  const part = await run(
    SNAP_11,
    '',
    { find: 'Industrial infrastructure', replace: 'Trusted', path: '/en/' },
    { page: unread }
  )
  assert.equal(part.calls.apply.length, 0)
  assert.equal(part.r.code, 'AMBIGUOUS')
  assert.equal(part.r.error, joomlaText('textOnlyError', { find: 'Industrial infrastructure' }))
  assert.match(part.r.next, /at:\["article-555\.1"\]/)
  // with the place named, it is written
  const named = await run(
    SNAP_11,
    '',
    { find: 'Industrial infrastructure', replace: 'Trusted', path: '/en/', at: ['article-555.1'] },
    { page: unread }
  )
  assert.equal(named.calls.apply.length, 1)
})

// Round 7 (30/09/2026): "bỏ câu X đi" ("drop sentence X") — a SENTENCE of a paragraph — was refused when the page could not be read,
// with the candidate's first 90 characters (which do not hold the sentence) and a next whose second half
// ("or with all the words of that place") the model took for the rule: it read the paragraph twice and sent
// it back whole. `at` alone is what lets part of a text be written.
test('🔒 part of a stored text, page unread: the candidate shows the words asked for, and `at` is said to change only them', async () => {
  const unread = () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'The page did not answer.' })
  const last =
    'Owning our steel fabrication means we do not depend on third-party supply and can hold the date even when the design changes mid-build.'
  const middle = 'The client gets one contract, one schedule and one accountable party.'
  for (const find of [last, middle]) {
    const asked = await run(SNAP_12, '', { find, replace: '', path: '/en/about' }, { page: unread })
    assert.equal(asked.r.code, 'AMBIGUOUS')
    assert.equal(asked.calls.apply.length, 0, 'nothing is written on the first call')
    assert.equal(asked.r.next, joomlaText('textOnlyNext', { at: 'module-838.1' }))
    assert.match(
      asked.r.next,
      /^the same call with at:\["module-838\.1"\] added: it names the place, and only the words of find change inside it$/
    )
    assert.ok(asked.r.next.length <= 200)
    const [candidate] = asked.r.candidates
    assert.equal(candidate.at, 'module-838.1')
    // The window is around the words asked for — the start of the paragraph would not hold them.
    assert.ok(candidate.text.replaceAll('…', '').includes(find.slice(0, 40)), candidate.text)
    // The corrected call is the same one with `at`: ONE call, and only those words go.
    const done = await run(
      SNAP_12,
      '',
      { find, replace: '', path: '/en/about', at: ['module-838.1'] },
      { page: unread }
    )
    assert.equal(done.r.ok, true, JSON.stringify(done.r).slice(0, 300))
    assert.equal(done.calls.apply.length, 1)
    const written = done.calls.apply[0].changes['module-838.1']
    assert.ok(written.startsWith('We take the whole facility'), written)
    assert.ok(!written.includes(find), written)
  }
})

// Review of round 7, RL-4. A text-only refusal reaches several places only when `all` (or a `where`) already
// chose to write more than one; its next then named the FIRST loose place — `at:["module-442.9"]` — and read as
// an instruction that narrowed a call wanting them all to one place. With several places it names none, and says
// one place is one call: `at:[a, b]` is refused again as AMBIGUOUS and `at` beside `all` is BAD_PARAMS.
test('🔒 part of a stored text in SEVERAL places, page unread: the next names no place of its own; at: of the place meant writes that one', async () => {
  const unread = () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'The page did not answer.' })
  const find = 'erection'
  const asked = await run(
    SNAP_12,
    '',
    { find, replace: 'assembly', path: '/en/about', all: true },
    { page: unread }
  )

  assert.equal(asked.r.code, 'AMBIGUOUS')
  assert.equal(asked.calls.apply.length, 0, 'nothing is written on the first call')
  const places = asked.r.candidates.map((c) => c.at)
  assert.ok(places.length > 1, `${places.length} places`)
  assert.equal(asked.r.next, joomlaText('textOnlyManyNext'))
  assert.match(
    asked.r.next,
    /^the same call with at:\["<the at of the place meant, from candidates>"\] added: /
  )
  assert.match(asked.r.next, /another place is another call$/)
  for (const at of places) assert.ok(!asked.r.next.includes(at), `the next names ${at}`)
  assert.ok(asked.r.next.length <= 200, `${asked.r.next.length}`)
  // The corrected call — `at` naming ONE place, from the candidates — writes exactly that place.
  const done = await run(
    SNAP_12,
    '',
    { find, replace: 'assembly', path: '/en/about', at: [places[1]] },
    { page: unread }
  )
  assert.equal(done.r.ok, true, JSON.stringify(done.r).slice(0, 300))
  assert.equal(done.calls.apply.length, 1)
  assert.deepEqual(Object.keys(done.calls.apply[0].changes), [places[1]])
  // …and places the call names are chosen, not ambiguous: two named places write those two (pilot 23/10/2026,
  // when a list taken from the candidates was refused as AMBIGUOUS four times in a row).
  const several = await run(
    SNAP_12,
    '',
    { find, replace: 'assembly', path: '/en/about', at: places.slice(0, 2) },
    { page: unread }
  )
  assert.equal(several.r.ok, true, JSON.stringify(several.r).slice(0, 300))
  assert.deepEqual(
    several.calls.apply.flatMap((a) => Object.keys(a.changes)).sort(),
    places.slice(0, 2).sort()
  )
})

test('a path that does not exist is NOT_FOUND and nothing is applied; the snapshot read beside the page goes unused', async () => {
  const { r, calls } = await run(
    SNAP_12,
    '',
    { find: 'Selected projects', replace: 'x', path: '/en/nope' },
    {
      page: () => ({ ok: true, status: 404, html: '<html><body>Not found</body></html>' })
    }
  )
  assert.equal(r.code, 'NOT_FOUND')
  assert.equal(r.error, joomlaText('pageMissingError', { path: '/en/nope', status: 404 }))
  assert.equal(calls.apply.length, 0)
  assert.deepEqual(calls.snapshot, [false])
  assert.deepEqual(calls.page, ['/en/nope'])
})

// ── The edges of the job ───────────────────────────────────────────────────────────────────────────

test("a refused snapshot is answered as it came; an unsealed site is NOT_SUPPORTED_HERE; restore is EmDash's", async () => {
  const denied = {
    ok: false,
    code: 'TOOLSET_NOT_GRANTED',
    error: 'This seat cannot read the contract.',
    next: 'Tell the customer.'
  }
  const a = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'x' },
    { snapshot: () => denied }
  )
  assert.deepEqual(a.r, denied)
  assert.equal(a.calls.apply.length, 0)
  const b = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'x' },
    { snapshot: () => ({ ok: true, slots: [] }) }
  )
  assert.equal(b.r.code, 'NOT_SUPPORTED_HERE')
  const c = await run(SNAP_12, HOME_12, { restore: [{ at: 'module-443.0', value: 'Selected projects' }] })
  assert.equal(c.r.code, 'BAD_PARAMS')
  assert.equal(c.r.error, joomlaText('restoreError'))
  const d = await run(SNAP_12, HOME_12, { find: 'x', replace: 'y', apply_id: 'contract-mine' })
  assert.equal(d.r.code, 'BAD_PARAMS', 'apply_id is not a parameter: the job mints its own')
})

test("the apply id comes from call-memory's minter alone: without deps.mint the job throws before any read or write", async () => {
  let touched = 0
  await assert.rejects(
    replaceOnJoomla({
      plan: planReplace({ find: 'Selected projects', replace: 'Featured projects' }),
      snapshot: async () => {
        touched += 1
        return SNAP_12
      },
      apply: async () => {
        touched += 1
        return { ok: true }
      },
      pageHtml: async () => {
        touched += 1
        return { ok: true, status: 200, html: HOME_12 }
      }
    }),
    /deps\.mint is required/
  )
  assert.equal(touched, 0, 'no snapshot, no page, no apply')
})

test('several changes: ONE apply for all, and a refusal names the change it is about — nothing sent', async () => {
  const both = await run(SNAP_12, HOME_12, {
    changes: [
      { find: 'Selected projects', replace: 'Featured projects' },
      { find: 'Need a budget estimate for an upcoming build?', replace: 'Ready to start your project?' }
    ]
  })
  assert.equal(both.calls.apply.length, 1)
  assert.deepEqual(Object.keys(both.calls.apply[0].changes), ['module-443.0', 'module-445.0'])
  const second = await run(SNAP_12, HOME_12, {
    changes: [
      { find: 'Selected projects', replace: 'Featured projects' },
      { find: 'Selected projects and more', replace: 'x' }
    ]
  })
  assert.equal(second.r.code, 'NOT_FOUND')
  assert.equal(second.r.change, 1)
  const rule = await run(SNAP_12, HOME_12, {
    changes: [
      { find: 'Selected projects', replace: 'Featured projects' },
      { find: 'Need a budget estimate for an upcoming build?', replace: 'A <i>big</i> one?' }
    ]
  })
  assert.equal(rule.r.rule, 'no-markup')
  assert.equal(rule.r.change, 1)
  assert.equal(rule.calls.apply.length, 0)
})

test("call-memory's snapshot form {answer, revision, …} is read like the answer itself", async () => {
  const { r } = await run(
    SNAP_12,
    HOME_12,
    { find: 'Selected projects', replace: 'Featured projects' },
    {
      snapshot: () => ({ answer: SNAP_12, revision: SNAP_12.revision, generation: 0, turn: 1, at: 0 })
    }
  )
  assert.equal(r.ok, true)
})

test("newWords and customerSentence: the words a change brings, found in the customer's own sentence", () => {
  assert.equal(newWords({ find: '380+', replace: '400+' }), '400')
  assert.equal(newWords({ find: 'Hotline: 8 800', replace: 'Hotline: 0909' }), '0909')
  assert.equal(
    newWords({ find: 'Old lead.', replace: 'Old lead. All work comes with a 5-year warranty.' }),
    'All work comes with a 5-year warranty.'
  )
  assert.equal(newWords({ find: 'A and B', replace: 'A' }), '')
  const msg = 'Hi. Change it to "Get a free quote" please!\nThanks'
  assert.equal(customerSentence(msg, 'get a free quote'), 'Change it to "Get a free quote" please!')
  assert.equal(customerSentence(msg, 'Book now'), null)
  assert.equal(
    customerSentence('Số mới là 0909 123 456.', 'tel:0909123456'.slice(4), { digits: true }),
    'Số mới là 0909 123 456.'
  )
  assert.equal(customerSentence(null, 'x'), null)
  assert.equal(customerSentence('Remove it.', ''), 'Remove it.', 'a removal: their message is the evidence')
  assert.ok(Buffer.byteLength(customerSentence('ế'.repeat(5000), 'ế')) <= 8000)
})

{
  const worst = {
    find: 'W'.repeat(120),
    replace: 'R'.repeat(120),
    words: 'X'.repeat(120),
    value: 'V'.repeat(120),
    path: `/${'p'.repeat(200)}`,
    at: 'vi-VN::module-4369.12',
    field: 'legal-name',
    status: 404,
    n: 999
  }
  for (const [key, template] of Object.entries(JOOMLA_REPLACE_NEXT))
    test(`every Joomla sentence stays within T10 (error ≤ 160, next ≤ 200) on its longest facts: ${rowName(key)}`, () => {
      const s = joomlaText(/** @type {any} */ (key), worst)
      const limit = key.endsWith('Error') ? 160 : 200
      assert.ok(s.length <= limit, `${key}: ${s.length} > ${limit}: ${s}`)
      assert.ok(!/[À-ỹ]/.test(template), `${key} is English`)
    })
}

/**
 * The Content API page the Joomla Claude Cowork plugin projects for one entity of the contract
 * (claude-cowork `ContentProjection::build`): one block per slot, keyed by the slot, holding one field
 * `{key: slot.key, type: slot.type, value, slotKey: slot.key}` — the same `slotsOf` keys the inspect
 * lists.
 * @param {Record<string, any>} snap
 * @param {string} entity
 */
function contentOf(snap, entity) {
  const slots = snap.slots.filter((/** @type {any} */ s) => String(s.entity) === entity)
  return {
    id: `content_${entity}`,
    type: entity.startsWith('menuItem') ? 'page' : 'shared',
    title: String(slots[0]?.label ?? entity),
    slug: entity,
    url: entity.startsWith('menuItem') ? `https://j.test/index.php?Itemid=${entity.split('-')[1]}` : null,
    locale: null,
    revision: `r-${entity}`,
    fields: [],
    blocks: slots.map((/** @type {any} */ s) => ({
      id: `block_${s.key}`,
      key: s.key,
      fields: [{ key: s.key, type: s.type, value: s.current, slotKey: s.key, semanticKey: null }],
      items: []
    }))
  }
}

test('content.locate: every text slot’s at is a unit this engine builds, at exactly that address', () => {
  for (const snap of [SNAP_11, SNAP_12]) {
    const store = joomlaStore(snap, contractOf(snap).table)
    const units = new Set(store.units.map((u) => u.at))
    const entities = [...new Set(snap.slots.map((/** @type {any} */ s) => String(s.entity)))]
    const index = indexContents(entities.map((entity) => contentOf(snap, entity)))
    let checked = 0
    for (const { hit } of index.segments) {
      const record = index.meta.get(hit.contentId)
      const at = record ? replaceAtOf({ platform: 'joomla', record, where: hit.where })?.at : undefined
      if (at === undefined) continue
      assert.ok(units.has(at), `${at}: no unit of that address`)
      checked += 1
    }
    assert.ok(checked > 100, `${checked} addresses checked`)
    // A picture or a link slot is never given one: the engine writes words.
    const picture = snap.slots.find((/** @type {any} */ s) => s.type === 'image')
    assert.equal(
      replaceAtOf({
        platform: 'joomla',
        record: /** @type {any} */ ({}),
        where: { field: picture.key, slotKey: picture.key, type: 'image' }
      }),
      null
    )
  }
})

test('content.locate: the picked header "News" is one place for the engine, not AMBIGUOUS with the footer', async () => {
  const index = indexContents([contentOf(SNAP_11, 'menuItem-603'), contentOf(SNAP_11, 'menuItem-626')], {
    siteUrl: 'https://j.test'
  })
  const answer = locateElement(
    index,
    { url: 'https://j.test/en', text: 'News', marks: ['menuItem:603'] },
    { platform: 'joomla', mayWrite: () => true }
  )
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.at, 'menuItem-603.0')
  assert.deepEqual(field.next, { tool: 'tracy_site', action: 'content.replace', at: ['menuItem-603.0'] })
  // Quoted alone, the words are in two places the engine will not choose between…
  const bare = await run(SNAP_11, HOME_11, { find: 'News', replace: 'Insights', dryRun: true })
  assert.equal(bare.r.code, 'AMBIGUOUS')
  assert.ok(placesOf(bare.r).includes(field.at))
  // …and with the picked field's at, one: the call the turn's write line names.
  const pinned = await run(SNAP_11, HOME_11, {
    find: 'News',
    replace: 'Insights',
    at: field.next.at,
    dryRun: true
  })
  assert.equal(pinned.r.ok, true, JSON.stringify(pinned.r))
  assert.deepEqual(placesOf(pinned.r), ['menuItem-603.0'])
})

// lrsweep rig, JA Spa j6 (25/10/2026): thirteen blog articles end on the same quote, and on one article's own page
// the road counted the thirteen copies for the one the page shows.
test("an article's own page shows that article: the same words in other articles are not its places", async () => {
  const quote = (id) => ({
    key: `article-${id}.0`,
    entity: `article-${id}`,
    column: 'fulltext',
    type: 'text',
    sample: 'Christian Dior',
    maxCharacters: 40,
    requiresEvidence: false,
    xpath: '/html/body/small/text()',
    label: `Post ${id}`,
    current: 'Christian Dior'
  })
  const snap = {
    ok: true,
    contract: 'tracy-apple/j6/1.0.0',
    revision: 'r1',
    languages: [],
    slots: [quote(2), quote(3)],
    pages: [
      {
        entity: 'menuItem-101',
        route: 'blog',
        link: 'index.php?option=com_content&view=category&layout=blog&id=8',
        assignedModules: []
      }
    ]
  }
  const html = (body) =>
    `<html lang="en-gb"><body class="site com_content ${body} itemid-101"><main><div class="item-page"><blockquote><p>Shoes.</p><small>Christian Dior</small></blockquote></div></main></body></html>`
  const call = {
    find: 'Christian Dior',
    replace: 'Menu item',
    path: '/blog/2-first-post',
    all: 'page',
    expect: 1,
    dryRun: true
  }
  const own = await run(snap, html('view-article'), call)
  assert.equal(own.r.ok, true, JSON.stringify(own.r).slice(0, 300))
  assert.deepEqual(placesOf(own.r), ['article-2.0'])
  // A blog list shows every article it lists: there the copies stay places.
  const list = await run(snap, html('view-category'), { ...call, path: '/blog', expect: 2 })
  assert.deepEqual(placesOf(list.r), ['article-2.0', 'article-3.0'])
})

test('a category page shows the articles it links: the same words in articles it does not list are not its places', async () => {
  const lead = (id) => ({
    key: `article-${id}.0`,
    entity: `article-${id}`,
    column: 'introtext',
    type: 'text',
    sample: 'Contrary to popular belief',
    maxCharacters: 80,
    requiresEvidence: false,
    xpath: '/html/body/p/text()',
    label: `Service ${id}`,
    current: 'Contrary to popular belief'
  })
  const snap = {
    ok: true,
    contract: 'tracy-apple/j6/1.0.0',
    revision: 'r1',
    languages: [],
    slots: [lead(18), lead(22), lead(30)],
    pages: [
      {
        entity: 'menuItem-109',
        route: 'services',
        link: 'index.php?option=com_content&view=category&id=13',
        assignedModules: []
      }
    ]
  }
  const card = (id) =>
    `<div class="item"><h3><a href="/index.php/services/massage/${id}-ritual">Ritual</a></h3><p>Contrary to popular belief</p></div>`
  const html = (cards) =>
    `<html lang="en-gb"><body class="site com_content view-category item-109"><main>${cards}</main></body></html>`
  const call = {
    find: 'Contrary to popular belief',
    replace: 'Menu item',
    path: '/index.php/services',
    all: 'page',
    expect: 2,
    dryRun: true
  }
  const listed = await run(snap, html(card(18) + card(22)), call)
  assert.equal(listed.r.ok, true, JSON.stringify(listed.r).slice(0, 300))
  assert.deepEqual(placesOf(listed.r), ['article-18.0', 'article-22.0'])
  // A list that links no article names none: every copy stays a place, as before.
  const bare = `<div class="item"><p>Contrary to popular belief</p></div>`
  const unlinked = await run(snap, html(bare + bare), { ...call, expect: 3 })
  assert.deepEqual(placesOf(unlinked.r), ['article-18.0', 'article-22.0', 'article-30.0'])
})

test('a module the site trashed or unpublished is not on the page its assignment names', async () => {
  const slot = (entity, label) => ({
    key: `${entity}.0`,
    entity,
    column: entity.startsWith('module') ? 'content' : 'introtext',
    type: 'text',
    sample: 'Contrary to popular belief',
    maxCharacters: 80,
    requiresEvidence: false,
    xpath: '/html/body/p/text()',
    label,
    current: 'Contrary to popular belief'
  })
  const snap = (published) => ({
    ok: true,
    contract: 'tracy-apple/j6/1.0.0',
    revision: 'r1',
    languages: [],
    slots: [slot('module-105', 'Best sale'), slot('article-18', 'Ritual')],
    pages: [
      {
        entity: 'menuItem-109',
        route: 'services',
        link: 'index.php?option=com_content&view=category&id=13',
        assignedModules: [{ entity: 'module-105', position: 'main-top', published, language: '*' }]
      }
    ]
  })
  const html = `<html lang="en-gb"><body class="site com_content view-category item-109"><main><div class="item"><h3><a href="/index.php/services/18-ritual">Ritual</a></h3><p>Contrary to popular belief</p></div></main></body></html>`
  const call = {
    find: 'Contrary to popular belief',
    replace: 'Menu item',
    path: '/index.php/services',
    all: 'page',
    expect: 1,
    dryRun: true
  }
  const trashed = await run(snap('-2'), html, call)
  assert.equal(trashed.r.ok, true, JSON.stringify(trashed.r).slice(0, 300))
  assert.deepEqual(placesOf(trashed.r), ['article-18.0'])
  const unpublished = await run(snap('0'), html, call)
  assert.deepEqual(placesOf(unpublished.r), ['article-18.0'])
  // A published one stays a candidate, as before.
  const shown = await run(snap('1'), html, { ...call, expect: 2 })
  assert.deepEqual(placesOf(shown.r), ['module-105.0', 'article-18.0'])
})

// ── #204: the contact records a site-wide replace reaches too ──────────────────────────────────────

/** `run`, with a contacts list and a write door that records each contact write. */
async function runWithContacts(call, contacts, opts = {}) {
  const writes = []
  const lists = []
  const { r, calls } = await run(SNAP_12, HOME_12, call, {
    ...opts,
    plan: planReplace(call)
  })
  // `run` passes no read/write: call replaceOnJoomla again with them, the same fakes otherwise.
  const applies = []
  const r2 = await replaceOnJoomla({
    plan: planReplace(call),
    snapshot: async () => SNAP_12,
    apply: async (params) => {
      applies.push(params)
      return { ok: true }
    },
    pageHtml: async () => ({ ok: true, status: 200, html: HOME_12 }),
    mint: (prefix) => `${prefix}-t${applies.length + writes.length}`,
    evidenceText: null,
    env: {},
    read: async (action, params) => {
      lists.push([action, params])
      return { ok: true, items: params.offset === 0 ? contacts : [] }
    },
    write: async (action, params) => {
      writes.push([action, params])
      return opts.writeFails ? { ok: false, error: 'write_failed' } : { ok: true }
    }
  })
  return { without: r, withoutCalls: calls, r: r2, applies, writes, lists }
}

const PHONE = '+7 495 382 14 55'
const CONTACT = {
  id: 1,
  name: 'Head office',
  published: 1,
  telephone: PHONE,
  misc: `<p>Call us on ${PHONE} on weekdays.</p>`,
  email_to: 'office@example.test'
}

test('sealed Joomla, all:true: the dry run names the contact record that holds the number too (#204)', async () => {
  const { without, r, writes, lists } = await runWithContacts(
    { find: PHONE, replace: '(212) 555-0147', all: true, dryRun: true },
    [CONTACT, { id: 2, name: 'Unpublished', published: 0, telephone: PHONE }]
  )
  assert.equal(without.contacts, undefined, 'with no list door, as before')
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.equal(r.count, without.count, 'the slots counted as before; contacts listed apart')
  assert.deepEqual(
    r.contacts.map((c) => [c.at, c.after]),
    [
      ['contact:1.telephone', '(212) 555-0147'],
      ['contact:1.misc', '<p>Call us on (212) 555-0147 on weekdays.</p>']
    ]
  )
  assert.ok(r.notes.some((n) => /2 contact field\(s\)/.test(n)), JSON.stringify(r.notes))
  assert.equal(writes.length, 0, 'a dry run writes nothing')
  assert.equal(lists[0][1].kind, 'contact')
})

test('sealed Joomla, all:true: the write reaches the contact too, under its own undo (#204)', async () => {
  const { r, applies, writes } = await runWithContacts({ find: PHONE, replace: '(212) 555-0147', all: true }, [CONTACT])
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.equal(applies.length, 1, 'the slots, through the contract')
  assert.deepEqual(writes, [
    [
      'content.update',
      {
        kind: 'contact',
        id: 1,
        fields: { telephone: '(212) 555-0147', misc: '<p>Call us on (212) 555-0147 on weekdays.</p>' },
        apply_id: writes[0][1].apply_id
      }
    ]
  ])
  assert.deepEqual(r.contactsUndo, { action: 'apply.revert', params: { apply_id: writes[0][1].apply_id } })
  assert.equal(r.contacts.length, 2)
})

test('sealed Joomla, all:true: words only a contact holds are written there, not refused NOT_FOUND (#204)', async () => {
  const only = { id: 3, name: 'Shop', published: 1, telephone: '+1 000 111 2222' }
  const { r, applies, writes } = await runWithContacts({ find: '+1 000 111 2222', replace: '+1 999', all: true }, [only])
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400))
  assert.equal(applies.length, 0)
  assert.deepEqual(writes[0][1].fields, { telephone: '+1 999' })
})
