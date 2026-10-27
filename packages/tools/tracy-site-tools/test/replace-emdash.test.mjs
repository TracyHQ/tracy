import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { menuItemsForSet } from '../src/host/emdash.mjs'
import {
  EMDASH_EXEC_MAX_BUFFER,
  EMDASH_INDEX_MS,
  EMDASH_INDEX_SCRIPT,
  EMDASH_WRITE_MS,
  EMDASH_WRITE_ROUNDS,
  EMDASH_WRITE_SCRIPT,
  emdashIndexArgv,
  emdashWriteArgv,
  parseEmdashIndex,
  parseEmdashWrite
} from '../src/host/exec.mjs'
import {
  EMDASH_INDEX_RETRY_PAUSE_MS,
  EMDASH_INDEX_RETRY_WITHIN_MS,
  EMDASH_REPLACE_NEXT,
  EMDASH_TEMPLATES,
  emdashReplaceText,
  emdashScriptRoad,
  emdashUndo,
  expandAt,
  parseAt,
  quotedElsewhere,
  replaceOnEmdash,
  routeCollections,
  routeOf,
  storeOf,
  templateTableOf
} from '../src/host/replace-emdash.mjs'
import {
  RECEIPT_MAX_BYTES,
  REPLACE_CALL,
  REPLACE_MAX_RESTORE,
  REPLACE_NEXT,
  planReplace
} from '../src/host/replace.mjs'
import { renderedUnits, views } from '../src/host/html-units.mjs'
import { createFakeEmdash, runScript } from './fixtures/replace/emdash/fake-emdash.mjs'
import { indexContents, replaceAtOf } from '../../../../apps/tracy-web/src/sites/content-locate.js'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const SITE = JSON.parse(readFileSync(new URL('./fixtures/replace/emdash/site.json', import.meta.url), 'utf8'))
const HELD = JSON.parse(readFileSync(new URL('./fixtures/replace/heldout.json', import.meta.url), 'utf8'))
const PAGE_FILES = {
  '/': 'emdash-home.html',
  '/about': 'emdash-about.html',
  '/contact': 'emdash-contact.html',
  '/careers': '../emdash/careers.html'
}
/** @param {string} path */
const htmlOf = (path) =>
  readFileSync(
    new URL(
      `./fixtures/replace/pages/${PAGE_FILES[/** @type {keyof typeof PAGE_FILES} */ (path)]}`,
      import.meta.url
    ),
    'utf8'
  )
/** @param {string} path */
const servedPage = async (path) =>
  path in PAGE_FILES
    ? { ok: true, status: 200, html: htmlOf(path) }
    : { ok: false, code: 'READ_FAILED', error: 'no such page' }

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const revOfRow = (/** @type {any} */ r) =>
  Buffer.from(`${r.version}:${r.updatedAt}`, 'utf8').toString('base64')
const baseRow = (/** @type {string} */ c, /** @type {string} */ slug, /** @type {string} */ loc) =>
  SITE.rows.find((/** @type {any} */ r) => r.collection === c && r.slug === slug && r.locale === loc)

/**
 * The replace job wired to the real scripts running against the in-memory EmDash.
 * @param {ReturnType<typeof createFakeEmdash>} emdash
 * @param {Record<string, unknown>} [scriptOptions]
 */
function road(emdash, scriptOptions = {}) {
  /** @type {{ index: any[], write: any[] }} */
  const log = { index: [], write: [] }
  return {
    log,
    /** @param {any} req */
    index: async (req) => {
      log.index.push(req)
      return parseEmdashIndex(
        await runScript(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin: req, ...scriptOptions })
      )
    },
    /** @param {any} req */
    write: async (req) => {
      log.write.push(req)
      return parseEmdashWrite(
        await runScript(EMDASH_WRITE_SCRIPT, { fetch: emdash.fetch, stdin: req, ...scriptOptions })
      )
    }
  }
}

/**
 * @param {Record<string, unknown>} params
 * @param {{ emdash?: ReturnType<typeof createFakeEmdash>, artifact?: unknown, pageHtml?: (p: string) => Promise<any>,
 *   confirmed?: boolean, verify?: boolean, scriptOptions?: Record<string, unknown>, onRevFormula?: (ok: boolean) => void }} [options]
 */
async function run(params, options = {}) {
  const emdash = options.emdash ?? createFakeEmdash(SITE)
  const r = road(emdash, options.scriptOptions)
  const out = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace(params),
      index: r.index,
      write: r.write,
      pageHtml: options.pageHtml ?? servedPage,
      artifact: options.artifact === undefined ? SITE.artifact : options.artifact,
      label: 'benchemdash01',
      confirmed: options.confirmed,
      verify: options.verify ?? false,
      onRevFormula: options.onRevFormula
    })
  )
  const writes = emdash.calls.filter((c) =>
    ['content_update', 'menu_set_items', 'settings_update'].includes(c.name)
  )
  return { out, emdash, log: r.log, writes }
}

/**
 * The value a receipt's `at` names, in the fake EmDash now.
 * @param {ReturnType<typeof createFakeEmdash>} emdash
 * @param {string} at
 */
function valueAt(emdash, at) {
  const p = /** @type {any} */ (parseAt(at))
  if (p.kind === 'settings') return emdash.state.settings[p.key]
  if (p.kind === 'menu') {
    const m = emdash.menu(p.name, p.locale)
    const order = menuItemsForSet(
      m.items.map((/** @type {any} */ it, /** @type {number} */ k) => ({ ...it, label: String(k) }))
    ).map((o) => Number(o.label))
    return m.items[order[p.pos]].label
  }
  let v = emdash.row(p.collection, p.slug, p.locale).data
  for (const s of p.path) v = v[s]
  return v
}

/** @param {(string | number)[]} path */
const pathText = (path) =>
  path.map((x, k) => (typeof x === 'number' ? `[${x}]` : k === 0 ? x : `.${x}`)).join('')

/**
 * Every value the fake EmDash holds, by the `at` a receipt would name it: each string leaf of every
 * entry, each menu label by its position, the two settings.
 * @param {ReturnType<typeof createFakeEmdash>} emdash
 * @returns {Map<string, unknown>}
 */
function valuesOf(emdash) {
  /** @type {Map<string, unknown>} */
  const out = new Map()
  /** @param {unknown} v @param {(string | number)[]} path @param {string} head */
  const walk = (v, path, head) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i], head))
    else if (v !== null && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) walk(x, [...path, k], head)
    else out.set(`${head}#${pathText(path)}`, v)
  }
  for (const r of emdash.state.rows) walk(r.data, [], `${r.collection}/${r.slug}@${r.locale ?? ''}`)
  for (const m of emdash.state.menus) {
    const order = menuItemsForSet(
      m.items.map((/** @type {any} */ it, /** @type {number} */ k) => ({ ...it, label: String(k) }))
    ).map((o) => Number(o.label))
    order.forEach((k, pos) => out.set(`menu:${m.name}@${m.locale ?? ''}[${pos}]`, m.items[k].label))
  }
  out.set('settings#title', emdash.state.settings.title)
  out.set('settings#tagline', emdash.state.settings.tagline)
  return out
}

/**
 * The whole store, byte for byte (menu item ids aside: `menu_set_items` mints new ones, and the
 * receipt says so).
 * @param {ReturnType<typeof createFakeEmdash>} emdash
 */
const snapshotOf = (emdash) =>
  JSON.stringify({
    rows: emdash.state.rows.map((/** @type {any} */ r) => [r.collection, r.slug, r.locale, r.data]),
    menus: emdash.state.menus.map((/** @type {any} */ m) => [m.name, m.locale, menuItemsForSet(m.items)]),
    settings: emdash.state.settings
  })

/**
 * The places an undo names, one language each.
 * @param {any} undo
 */
const undoPlaces = (undo) =>
  new Set(undo.params.restore.flatMap((/** @type {any} */ r) => expandAt(r.at) ?? [r.at]))

// ── The held-out cases (P8): what the page alone decides, now with EmDash's own stores ───────────

const EMDASH_CASES = HELD.cases.filter((/** @type {any} */ c) => c.site === 'benchemdash01')

test('held-out: every EmDash case of the bench suite gets the verdict and the places the page decides', async () => {
  assert.equal(EMDASH_CASES.length, 26)
})

{
  for (const c of EMDASH_CASES)
    test(`held-out: every EmDash case of the bench suite gets the verdict and the places the page decides: ${rowName(c)}`, async () => {
      const { out, writes } = await run({ ...c.call, path: c.path, dryRun: true })
      const say = c.pageSays
      const where = (/** @type {any[]} */ list) => list.map((x) => x.where).sort()
      assert.equal(writes.length, 0, `${c.case}: a dryRun writes nothing`)
      if (say.verdict === 'WRITE') {
        if (!out.ok && c.refuseOk) return
        assert.equal(out.ok, true, `${c.case}: ${out.code} ${out.error}`)
        assert.deepEqual(
          where(out.would.filter((/** @type {any} */ w) => w.onPage !== false)),
          say.places.map((/** @type {string[]} */ p) => p[0]).sort(),
          `${c.case} places`
        )
      } else {
        assert.equal(out.code, say.verdict, `${c.case}: ${out.code} ${out.error}`)
        if (say.rule) assert.equal(out.rule, say.rule, c.case)
        if (say.verdict === 'AMBIGUOUS')
          assert.deepEqual(
            where(out.candidates),
            say.places.map((/** @type {string[]} */ p) => p[0]).sort(),
            c.case
          )
      }
    })
}

test('held-out: every WRITE case writes the new words where its receipt says, nothing else, and its undo gives every byte back', async () => {
  let checked = 0
  for (const c of EMDASH_CASES.filter((/** @type {any} */ x) => x.pageSays.verdict === 'WRITE')) {
    const emdash = createFakeEmdash(SITE)
    const before = snapshotOf(emdash)
    const was = valuesOf(emdash)
    const { out } = await run({ ...c.call, path: c.path }, { emdash })
    if (!out.ok && c.refuseOk) continue
    assert.equal(out.ok, true, `${c.case}: ${out.code} ${out.error}`)
    const changes = c.call.changes ?? [{ find: c.call.find, replace: c.call.replace }]
    // words taken out say a space left where they stood is harmless (round 7); every other write is the plain receipt
    assert.equal(
      out.next,
      changes.every((/** @type {any} */ x) => x.replace.trim() === '')
        ? REPLACE_NEXT.receiptRemoved
        : REPLACE_NEXT.receipt,
      c.case
    )
    assert.ok(Buffer.byteLength(JSON.stringify(out)) <= RECEIPT_MAX_BYTES, `${c.case}: receipt size`)
    const places = undoPlaces(out.undo)
    for (const row of out.changed) {
      const ats = row.at.split('+')
      for (const at of ats) assert.ok(places.has(at), `${c.case}: the undo names ${at}`)
      const now = ats.map((/** @type {string} */ at) => valueAt(emdash, at)).join(' ')
      const hit = changes.find((/** @type {any} */ ch) =>
        now.includes(ch.replace.replace(/\s*→$/, '').trim())
      )
      assert.ok(
        hit || changes.some((/** @type {any} */ ch) => ch.replace === ''),
        `${c.case}: ${row.at} holds "${now}"`
      )
    }
    // only there: every value that differs is a place the undo puts back
    const is = valuesOf(emdash)
    for (const key of new Set([...was.keys(), ...is.keys()]))
      if (was.get(key) !== is.get(key))
        assert.ok(places.has(key), `${c.case}: ${key} changed outside the receipt`)
    // and the undo, sent as given, gives every byte back
    assert.equal(planReplace(out.undo.params).ok, true, `${c.case}: the undo is a call planReplace takes`)
    const back = await run(out.undo.params, { emdash })
    assert.equal(back.out.ok, true, `${c.case} undo: ${back.out.code} ${back.out.error}`)
    assert.equal(snapshotOf(emdash), before, `${c.case}: byte-identical after the undo`)
    checked += 1
  }
  assert.ok(checked >= 15, `${checked} WRITE cases round-tripped`)
})

test('where: the header slogan is site.brand_sub — settings.tagline, printed nowhere, is never a place', async () => {
  const { out } = await run({
    find: 'Industrial infrastructure',
    replace: 'Since 2004',
    path: '/',
    where: 'header',
    dryRun: true
  })
  assert.equal(out.ok, true)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['site/site@en#brand_sub']
  )
  const store = storeOf(
    /** @type {any} */ ({ ...SITE, rows: SITE.rows, settings: SITE.settings }),
    templateTableOf(SITE.artifact)
  )
  assert.ok(!store.units.some((u) => u.at === 'settings#tagline'))
})

test('where: words the template prints, a form label and a category label are NOT_EDITABLE, each with its reason', async () => {
  const english = await run({ find: 'English', replace: 'Vietnamese', path: '/', dryRun: true })
  assert.equal(english.out.code, 'NOT_EDITABLE')
  assert.match(english.out.error, /template prints/)
  const form = await run({ find: 'Full name', replace: 'Your name', path: '/contact', dryRun: true })
  assert.equal(form.out.code, 'NOT_EDITABLE')
  assert.match(form.out.error, /form label/)
  const store = storeOf(/** @type {any} */ (SITE), templateTableOf(SITE.artifact))
  const term = store.units.find((u) => u.at === 'term:category/disclosures@en')
  assert.equal(term?.writable, false)
  assert.match(String(term?.why), /category or tag label/)
})

test('where: one of ten identical card links is the card’s own entry, not ten places', async () => {
  const { out } = await run({
    find: 'Discuss a similar project →',
    replace: 'Talk to us →',
    path: '/',
    dryRun: true
  })
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['projects/elektra-lipetsk@en#cta_label']
  )
  const same = SITE.rows.filter(
    (/** @type {any} */ r) =>
      r.collection === 'projects' && r.locale === 'en' && r.data.cta_label === 'Discuss a similar project'
  )
  assert.ok(same.length >= 5, 'the words are really in many entries')
})

test('where: a card’s title is the post’s title, not its short_title (printed in the Resources panel)', async () => {
  const { out } = await run({
    find: 'Northgate wins the Zavolzhye 2 infrastructure tender',
    replace: 'We won Zavolzhye 2',
    path: '/',
    dryRun: true
  })
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['posts/northgate-wins-the-zavolzhye-2-infrastructure-tender@en#title']
  )
})

test('where: `<title>` holds settings.title; a value printed on another page is not a second place there', async () => {
  const { out } = await run({
    find: 'Northgate Industrial',
    replace: 'Northgate Group',
    path: '/',
    dryRun: true
  })
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['settings#title']
  )
  // the breadcrumb's home_label is not in `<title>`: "Home" on the home page is the page title or the menu
  const home = await run({ find: 'Home', replace: 'Start', path: '/', dryRun: true })
  assert.equal(home.out.code, 'AMBIGUOUS')
  assert.deepEqual(home.out.candidates.map((/** @type {any} */ c) => c.at).sort(), [
    'home/home@en#title',
    'menu:primary@en[0]'
  ])
})

test('where: AMBIGUOUS lists each place with its at; where picks one; nothing is written either way', async () => {
  const both = await run({ find: 'Careers', replace: 'Jobs', path: '/' })
  assert.equal(both.out.code, 'AMBIGUOUS')
  assert.deepEqual(both.out.candidates.map((/** @type {any} */ c) => c.at).sort(), [
    'menu:footer_company@en[3]',
    'menu:topbar@en[0]'
  ])
  assert.equal(both.log.write.length, 0)
  const top = await run({ find: 'Careers', replace: 'Jobs', path: '/', where: 'topbar', dryRun: true })
  assert.deepEqual(
    top.out.would.map((/** @type {any} */ w) => w.at),
    ['menu:topbar@en[0]']
  )
  const contact = await run({ find: 'Contact', replace: 'Reach us', path: '/contact' })
  assert.equal(contact.out.code, 'AMBIGUOUS')
  assert.deepEqual(contact.out.candidates.map((/** @type {any} */ c) => c.where).sort(), [
    'footer',
    'header',
    'title'
  ])
})

test('where: a label the template prints with an arrow is written without it (glyph), and the note says so', async () => {
  const { out, emdash } = await run({ find: 'All projects →', replace: 'Every project →', path: '/' })
  assert.equal(out.ok, true, out.error)
  assert.equal(valueAt(emdash, 'site/site@en#all_projects_label'), 'Every project')
  assert.ok(out.notes.some((/** @type {string} */ n) => /prints "→"/.test(n)))
})

test('where: the route decides which collections are read; a site-wide change reads them all', async () => {
  const home = await run({ find: 'Selected projects', replace: 'Featured projects', path: '/', dryRun: true })
  assert.deepEqual(home.log.index[0].collections, ['site', 'home', 'projects', 'posts'])
  assert.deepEqual(home.log.index[0].locales, ['en'])
  const all = await run({
    find: 'info@northgate-ind.ru',
    replace: 'hello@example.vn',
    path: '/',
    all: true,
    dryRun: true
  })
  assert.equal('collections' in all.log.index[0], false, 'all:true reads every collection')
  // a page that cannot be read: text-only, every collection, and the answer says so
  const blind = await run(
    { find: 'Head office', replace: 'Main office', path: '/contact', dryRun: true },
    {
      pageHtml: async () => ({ ok: false, code: 'SITE_UNREACHABLE' })
    }
  )
  assert.equal(blind.out.ok, true)
  assert.equal('collections' in blind.log.index[0], false)
  assert.ok(blind.out.notes.includes(REPLACE_NEXT.textOnlyNote))
})

test('where: a page moved to an address the table does not know is still its own entry — the route only narrows', async () => {
  // r1e1734 (30/09/2026): the site's Services page was moved to /industrial-services in the site's
  // code; the table read that path as a `pages` entry, found no stored value behind the heading and
  // answered "words the template prints" for services_page.title. Here the About page, moved.
  const moved = async (/** @type {string} */ path) => servedPage(path === '/who-we-are' ? '/about' : path)
  const heading = 'Building Russian industrial infrastructure since 2004'
  const r = await run(
    { find: heading, replace: 'Industrial infrastructure since 2004', path: '/who-we-are', dryRun: true },
    { pageHtml: moved }
  )
  assert.equal(r.out.ok, true, JSON.stringify(r.out))
  assert.deepEqual(
    r.out.would.map((/** @type {any} */ w) => w.at),
    ['about/about@en#title']
  )
  assert.deepEqual(r.log.index[0].collections, ['site', 'pages'], 'the table still narrows the first read')
  assert.equal('collections' in r.log.index[1], false, 'the second read covers every collection')
  // words the template really prints are still its own after the wider read
  const tpl = await run(
    { find: 'English', replace: 'Vietnamese', path: '/who-we-are', dryRun: true },
    { pageHtml: moved }
  )
  assert.equal(tpl.out.code, 'NOT_EDITABLE')
  assert.match(tpl.out.error, /template prints/)
  assert.equal(tpl.log.index.length, 2)
  // words that ARE in the narrowed read cost no second read
  const found = await run({ find: 'About us', replace: 'Who we are', path: '/about', dryRun: true })
  assert.equal(found.log.index.length, 1)
})

test('where: the language of the page is the one read and written (html lang)', async () => {
  const vi = async () => ({
    ok: true,
    status: 200,
    html: htmlOf('/').replace('<html lang="en"', '<html lang="vi"')
  })
  const home = SITE.rows.find((/** @type {any} */ r) => r.collection === 'home' && r.locale === 'vi')
  const { out, log } = await run(
    { find: home.data.projects_title, replace: 'Dự án nổi bật', path: '/vi/', dryRun: true },
    { pageHtml: vi }
  )
  assert.deepEqual(log.index[0].locales, ['vi'])
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['home/home@vi#projects_title']
  )
})

test('where: a template without a table (another version) gets the generic rules — more AMBIGUOUS, never a guess', async () => {
  const other = { ...SITE.artifact, version: '9.9.9' }
  assert.equal(templateTableOf(other), null)
  assert.ok(templateTableOf(SITE.artifact) === EMDASH_TEMPLATES['tracy-business@1.0.0'])
  const inRepo = JSON.parse(
    readFileSync(new URL('../../../cms/tracy-emdash-theme-business/artifact.json', import.meta.url), 'utf8')
  )
  assert.notEqual(
    templateTableOf(inRepo),
    null,
    `the template this repo ships (${inRepo.version}) has a table`
  )
  // A release nobody diffed still gets the generic rules.
  assert.equal(templateTableOf({ templateId: 'tracy-business', version: '2.0.0' }), null)
  const { out, log } = await run({ find: 'Careers', replace: 'Jobs', path: '/' }, { artifact: other })
  assert.equal('collections' in log.index[0], false)
  assert.equal(out.code, 'AMBIGUOUS')
  assert.equal(log.write.length, 0)
})

{
  for (const version of [
    '1.4.0',
    '1.4.1',
    '1.4.2',
    '1.4.3',
    '1.4.4',
    '1.4.5',
    '1.4.6',
    '1.5.0',
    '1.5.1',
    '1.6.0',
    '1.7.0'
  ])
    test(`where: tracy-business release ${rowName(version)} carries the 1.0.0 table`, async () => {
      assert.ok(
        templateTableOf({ templateId: 'tracy-business', version }) ===
          EMDASH_TEMPLATES['tracy-business@1.0.0'],
        version
      )
    })
}

test('routes: a locale prefix, a query and a trailing slash are not part of the route', () => {
  assert.equal(routeOf('/vi/about/?x=1#y', ['en', 'vi']), '/about')
  assert.equal(routeOf('/vi', ['en', 'vi']), '/')
  assert.equal(routeOf('/news/some-post', ['en']), '/news/some-post')
  const t = templateTableOf(SITE.artifact)
  assert.deepEqual(routeCollections(t, '/'), ['site', 'home', 'projects', 'posts'])
  assert.deepEqual(routeCollections(t, '/news/some-post'), ['site', 'posts', 'news_page'])
  assert.deepEqual(routeCollections(t, '/terms'), ['site', 'pages'])
  assert.equal(routeCollections(t, '/a/b/c'), null)
  assert.equal(routeCollections(null, '/'), null)
})

// ── What is written (op shapes) ───────────────────────────────────────────────────────────────

test('op shape: ULID not slug, the locale, _rev = base64(version:updatedAt), published, only the touched field — whole', async () => {
  const { out, writes } = await run({
    find: 'Structural design, fabrication and erection of steel frames spanning up to 45 m.',
    replace: 'Design, fabrication and installation by one team.',
    path: '/'
  })
  assert.equal(out.ok, true, out.error)
  assert.equal(writes.length, 1)
  const a = writes[0].args
  const base = baseRow('home', 'home', 'en')
  assert.equal(a.collection, 'home')
  assert.match(a.id, ULID)
  assert.equal(a.id, base.id)
  assert.equal(a.locale, 'en')
  assert.equal(a._rev, revOfRow(base))
  assert.equal(a.status, 'published')
  assert.deepEqual(Object.keys(a.data), ['services_items'], 'only the top-level field touched')
  assert.equal(a.data.services_items.length, 4, 'a repeater goes back whole')
  assert.equal(a.data.services_items[1].text, 'Design, fabrication and installation by one team.')
  for (const k of [0, 2, 3]) assert.deepEqual(a.data.services_items[k], base.data.services_items[k])
  assert.deepEqual({ ...a.data.services_items[1], text: '' }, { ...base.data.services_items[1], text: '' })
})

test('op shape: a heading on two lines writes both fields, split by the one rule; one word empties line 2', async () => {
  const { out, writes } = await run({
    find: 'Building the groundwork for next-generation plants',
    replace: 'Built for the way you work',
    path: '/'
  })
  assert.equal(out.ok, true, out.error)
  // no break, dash or comma: the word boundary nearest the old lines' ratio (27 : 22 characters)
  assert.deepEqual(writes[0].args.data, { hero_title_a: 'Built for the', hero_title_b: 'way you work' })
  assert.ok(out.notes.some((/** @type {string} */ n) => /two lines/.test(n)))
  const two = await run({
    find: 'Building the groundwork for next-generation plants',
    replace: 'Built for the way\nyou work',
    path: '/'
  })
  assert.deepEqual(two.writes[0].args.data, { hero_title_a: 'Built for the way', hero_title_b: 'you work' })
  const one = await run({
    find: 'Building the groundwork for next-generation plants',
    replace: 'Welcome',
    path: '/'
  })
  assert.deepEqual(
    one.writes[0].args.data,
    { hero_title_a: 'Welcome', hero_title_b: '' },
    'EmDash lets line 2 be empty'
  )
})

test('op shape: a menu label is every item sent back (nulls dropped, parents first) with the hash of the menu read', async () => {
  const { out, writes, emdash } = await run({ find: 'News', replace: 'Insights', path: '/', where: 'header' })
  assert.equal(out.ok, true, out.error)
  assert.equal(writes.length, 1)
  const before =
    baseRow('home', 'home', 'en') &&
    SITE.menus.find((/** @type {any} */ m) => m.name === 'primary' && m.locale === 'en')
  const set = writes[0].args
  assert.equal(set.name, 'primary')
  assert.equal(set.locale, 'en')
  assert.equal(set.items.length, before.items.length)
  assert.equal(set.items[4].label, 'Insights')
  for (const it of set.items) {
    assert.equal('id' in it, false)
    assert.equal(Object.values(it).includes(null), false)
  }
  const menuGet = emdash.calls.filter((c) => c.name === 'menu_get').pop()
  assert.equal(menuGet?.args.name, 'primary', 'the script compared the menu before writing it')
  assert.ok(out.notes.includes(EMDASH_REPLACE_NEXT.menuIdsNote))
  assert.equal(valueAt(emdash, 'menu:primary@en[4]'), 'Insights')
})

test('op shape: the site title is settings_update {title}', async () => {
  const { out, writes } = await run({ find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' })
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(
    writes.map((w) => [w.name, w.args]),
    [['settings_update', { title: 'Northgate Group' }]]
  )
})

test('languages (the language rule): a fact changes in every language served; words only in the page’s own', async () => {
  const fact = await run({ find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true })
  assert.equal(fact.out.ok, true, fact.out.error)
  assert.deepEqual(fact.writes.map((w) => `${w.args.collection}@${w.args.locale}`).sort(), [
    'site@en',
    'site@ru',
    'site@vi'
  ])
  for (const w of fact.writes) assert.deepEqual(Object.keys(w.args.data).sort(), ['hotline', 'topbar_phone'])
  assert.equal(fact.emdash.row('site', 'site', 'ru').data.topbar_phone, 'Горячая линия: 0909 123 456')
  assert.deepEqual(
    fact.log.index[1].locales,
    ['ru', 'vi'],
    'the other languages are read once the places are known'
  )
  assert.deepEqual(fact.log.index[1].collections, ['site'])

  const words = await run({ find: 'Selected projects', replace: 'Featured projects', path: '/' })
  assert.deepEqual(
    words.writes.map((w) => w.args.locale),
    ['en']
  )
  assert.equal(words.log.index.length, 1, 'words need no second read')

  // all:true on words: the same field in the other languages, where it holds the SAME words
  const everywhere = await run({
    find: 'Selected projects',
    replace: 'Featured projects',
    path: '/',
    all: true
  })
  assert.deepEqual(
    everywhere.writes.map((w) => w.args.locale),
    ['en']
  )
  assert.ok(everywhere.out.notes.some((/** @type {string} */ n) => /hold their own words/.test(n)))
})

// ── Guards before anything is sent ─────────────────────────────────────────────────────────────

{
  for (const dryRun of [false, true])
    test(`PENDING_DRAFT: an entry holding an unpublished change is never published over — dryRun included: ${rowName(dryRun)}`, async () => {
      const emdash = createFakeEmdash(SITE)
      emdash.stageDraft('home', 'home', 'en')
      const { out, writes } = await run(
        { find: 'See our capabilities', replace: 'Get a free quote', path: '/', dryRun },
        { emdash }
      )
      assert.equal(out.code, 'PENDING_DRAFT')
      assert.deepEqual(out.pending, ['home/home@en'])
      assert.match(out.next, /confirm:true/)
      assert.match(out.next, /never publishes it/)
      assert.equal(writes.length, 0)
    })
}

test('split-across-marks: words running across a link inside a paragraph are refused with the paragraph named', async () => {
  const { out, writes } = await run({
    find: 'described in our Privacy policy',
    replace: 'in our privacy notice',
    path: '/terms'
  })
  assert.equal(out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(out.rule, 'split-across-marks')
  assert.equal(out.at, 'pages/terms@en#content[14]')
  assert.equal(writes.length, 0)
  // the same words inside ONE run are written, as the one span
  const inside = await run({
    find: 'Privacy policy',
    replace: 'Privacy notice',
    path: '/terms',
    where: 'main'
  })
  assert.equal(inside.out.ok, true, inside.out.error)
  assert.ok(
    inside.out.changed.some((/** @type {any} */ c) => c.at === 'pages/terms@en#content[14].children[1].text')
  )
})

// ── Writing: moved entries, lost answers, the proof ────────────────────────────────────────────

test('CONFLICT on op 2: one re-read of what is left, op 1 not sent again, the rest written', async () => {
  const emdash = createFakeEmdash(SITE, {
    fault: (name, args, n) =>
      name === 'content_update' && args.locale === 'ru' && n === 2
        ? { isError: '[CONFLICT] Content changed while the operation was in progress' }
        : undefined
  })
  const { out, writes, log } = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash }
  )
  assert.equal(out.ok, true, `${out.code} ${out.error}`)
  assert.deepEqual(
    writes.map((w) => w.args.locale),
    ['en', 'ru', 'ru', 'vi']
  )
  assert.equal(log.write.length, 2)
  assert.deepEqual(
    log.write[1].ops.map((/** @type {any} */ o) => o.args.locale),
    ['ru', 'vi']
  )
  assert.deepEqual(log.index[2], {
    locales: ['ru', 'vi'],
    collections: ['site'],
    menus: false,
    terms: false,
    settings: false
  })
})

test('CONFLICT twice → STORE_CHANGED with what was written and its undo; words someone changed → STORE_CHANGED naming them', async () => {
  const twice = createFakeEmdash(SITE, {
    fault: (name, args) =>
      name === 'content_update' && args.locale === 'ru'
        ? { isError: '[CONFLICT] Content changed while the operation was in progress' }
        : undefined
  })
  const a = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash: twice }
  )
  assert.equal(a.out.code, 'STORE_CHANGED')
  assert.deepEqual(a.out.written, ['site/site@en#topbar_phone', 'site/site@en#hotline'])
  assert.deepEqual(
    a.out.undo.params.restore.map((/** @type {any} */ r) => r.value),
    ['Hotline: 8 800 550-67-89', '8 800 550-67-89']
  )
  assert.match(a.out.next, /someone else is editing/)

  /** @type {ReturnType<typeof createFakeEmdash>} */
  let moved
  moved = createFakeEmdash(SITE, {
    fault: (name, args, n) => {
      if (name === 'content_update' && args.locale === 'ru' && n === 2) {
        moved.touch('site', 'site', 'ru', 'hotline', '8 800 000-00-00')
        return { isError: '[CONFLICT] Content changed while the operation was in progress' }
      }
      return undefined
    }
  })
  const b = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash: moved }
  )
  assert.equal(b.out.code, 'STORE_CHANGED')
  assert.match(b.out.error, /site\/site@ru#/)
  assert.equal(moved.row('site', 'site', 'ru').data.hotline, '8 800 000-00-00', 'their words stand')
})

test('an answer that never came is OUTCOME_UNKNOWN — the next is a dryRun with the NEW words, never the same call', async () => {
  const emdash = createFakeEmdash(SITE, {
    fault: (name, args) => (name === 'content_update' && args.locale === 'ru' ? 'drop' : undefined)
  })
  const { out } = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash }
  )
  assert.equal(out.code, 'OUTCOME_UNKNOWN')
  assert.equal(
    out.next,
    `${REPLACE_CALL} {find:"0909 123 456", replace:"8 800 550-67-89", dryRun:true} shows whether the new words stand; do not repeat the call`
  )
  assert.deepEqual(out.written, ['site/site@en#topbar_phone', 'site/site@en#hotline'])
  assert.deepEqual(out.unknown, ['site/site@ru#topbar_phone', 'site/site@ru#hotline'])
  assert.deepEqual(out.notSent, ['site/site@vi#topbar_phone', 'site/site@vi#hotline'])
  assert.match(out.error, /may have landed/)
  // the dropped write DID land; the dryRun the next names finds the new words where they stand
  assert.equal(emdash.row('site', 'site', 'ru').data.hotline, '0909 123 456')
  const check = await run(
    { find: '0909 123 456', replace: '8 800 550-67-89', path: '/', all: true, dryRun: true },
    { emdash }
  )
  assert.equal(check.out.ok, true, check.out.error)

  // no line at all from the exec: every op is in doubt
  const r = road(createFakeEmdash(SITE))
  const dead = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace({ find: 'Selected projects', replace: 'Featured projects', path: '/' }),
      index: r.index,
      write: async () => ({ ok: false, kind: 'transport', error: 'no answer in 60 s' }),
      pageHtml: servedPage,
      artifact: SITE.artifact
    })
  )
  assert.equal(dead.code, 'OUTCOME_UNKNOWN')
  assert.deepEqual(dead.unknown, ['home/home@en#projects_title'])
  assert.match(dead.next, /dryRun:true/)
  assert.doesNotMatch(dead.next, /same call/)
})

test('EmDash refusing the first op: nothing written, TOOL_FAILED with the entry to read; a later op → PARTIAL with undo', async () => {
  const first = createFakeEmdash(SITE, {
    fault: (name) =>
      name === 'content_update' ? { isError: '[VALIDATION_ERROR] data.band_title: too long' } : undefined
  })
  const a = await run(
    { find: 'Need a budget estimate for an upcoming build?', replace: 'Ready?', path: '/' },
    { emdash: first }
  )
  assert.equal(a.out.code, 'TOOL_FAILED')
  assert.equal(a.out.emdash, 'VALIDATION')
  assert.match(a.out.next, /tracy_emdash content_get \{collection:"home", id:"01M36TA83763RSVSN5R28DZ0AZ"\}/)
  assert.equal(a.out.written, undefined)

  const later = createFakeEmdash(SITE, {
    fault: (name, args) =>
      name === 'content_update' && args.locale === 'vi' ? { isError: '[INTERNAL] disk full' } : undefined
  })
  const b = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash: later }
  )
  assert.equal(b.out.code, 'PARTIAL')
  assert.equal(b.out.written.length, 4)
  assert.deepEqual(b.out.notWritten, ['site/site@vi#topbar_phone', 'site/site@vi#hotline'])
  // the four written values, one item per place: the same prior value, or the same words back
  assert.deepEqual(b.out.undo.params.restore, [
    { at: 'site/site@en,ru#topbar_phone', was: '8 800 550-67-89', now: '0909 123 456' },
    { at: 'site/site@en,ru#hotline', value: '8 800 550-67-89', now: '0909 123 456' }
  ])
  assert.deepEqual([...undoPlaces(b.out.undo)].sort(), [...b.out.written].sort())
})

test('the receipt: before → after per place, verified on the page read again, undo = restore of the exact values', async () => {
  let reads = 0
  const pageHtml = async (/** @type {string} */ p) => {
    reads += 1
    const html = htmlOf(p)
    return {
      ok: true,
      status: 200,
      html: reads > 1 ? html.replace('Selected projects', 'Featured projects') : html
    }
  }
  const { out } = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { pageHtml, verify: true }
  )
  assert.equal(out.ok, true)
  assert.equal(out.platform, 'emdash')
  assert.deepEqual(out.changed, [
    {
      at: 'home/home@en#projects_title',
      where: 'main',
      label: 'home · projects_title',
      before: 'Selected projects',
      after: 'Featured projects'
    }
  ])
  assert.equal(out.verified, emdashReplaceText('shownOn', { path: '/' }))
  assert.deepEqual(out.undo, {
    action: 'content.replace',
    params: {
      restore: [{ at: 'home/home@en#projects_title', value: 'Selected projects', now: 'Featured projects' }]
    }
  })
  assert.equal(out.apply_id, undefined, 'EmDash has no apply ids: the undo is the restore')
  const stale = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { verify: true }
  )
  assert.equal(stale.out.verified, emdashReplaceText('notShownYet', { path: '/' }))
})

test('a revision EmDash encodes another way is said once, and the host is told (computed revisions off)', async () => {
  /** @type {boolean[]} */
  const seen = []
  const emdash = createFakeEmdash(SITE)
  const fetchWithOtherRev = async (/** @type {string} */ url, /** @type {any} */ opts) => {
    const r = await emdash.fetch(url, opts)
    if (JSON.parse(opts.body).params.name !== 'content_update') return r
    const body = JSON.parse(await r.text())
    const inner = JSON.parse(body.result.content[0].text)
    inner._rev = 'b3RoZXI='
    body.result.content[0].text = JSON.stringify(inner)
    return { status: 200, text: async () => JSON.stringify(body) }
  }
  const { out } = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    {
      emdash,
      scriptOptions: { fetch: fetchWithOtherRev },
      onRevFormula: (ok) => seen.push(ok)
    }
  )
  assert.equal(out.ok, true)
  assert.deepEqual(seen, [false])
  assert.ok(out.notes.includes(EMDASH_REPLACE_NEXT.revNote))
})

test('undo is exact: replace, then the receipt’s restore, leaves every byte of every entry, menu and setting as it was', async () => {
  const emdash = createFakeEmdash(SITE)
  const snapshot = () =>
    JSON.stringify({
      rows: emdash.state.rows.map((/** @type {any} */ r) => [r.collection, r.locale, r.data]),
      menus: emdash.state.menus.map((/** @type {any} */ m) => [m.name, m.locale, menuItemsForSet(m.items)]),
      settings: emdash.state.settings
    })
  const before = snapshot()
  const calls = [
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    {
      find: 'Building the groundwork for next-generation plants',
      replace: 'Built for the way\nyou work',
      path: '/'
    },
    {
      changes: [
        {
          find: 'Drawing revision cycles cut to under 48 hours.',
          replace: 'Revised drawings back within two days.'
        },
        {
          find: 'Safety procedures independently audited every six months.',
          replace: 'Safety audited by outsiders twice a year.'
        }
      ],
      path: '/'
    },
    { find: 'News', replace: 'Insights', path: '/', where: 'header' },
    { find: 'Northgate Industrial', replace: 'Northgate Group', path: '/' },
    { find: 'Privacy policy', replace: 'Privacy notice', path: '/terms', where: 'main' }
  ]
  /** @type {any[]} */
  const undos = []
  for (const call of calls) {
    const { out } = await run(call, { emdash })
    assert.equal(out.ok, true, `${JSON.stringify(call).slice(0, 60)}: ${out.code} ${out.error}`)
    undos.push(out.undo)
  }
  assert.notEqual(snapshot(), before)
  for (const undo of undos.reverse()) {
    assert.equal(undo.action, 'content.replace')
    const { out } = await run(undo.params, { emdash })
    assert.equal(out.ok, true, `${out.code} ${out.error}`)
    assert.equal(out.next, REPLACE_NEXT.restored)
  }
  assert.equal(snapshot(), before, 'byte-identical after the undo')
})

test('undo guards: only a place this job writes; a place that is gone is said; dryRun and "already so" write nothing', async () => {
  const foreign = await run({ restore: [{ at: 'site/site@en#quote_url', value: 'https://evil.example/' }] })
  assert.equal(foreign.out.code, 'BAD_PARAMS')
  assert.match(foreign.out.error, /not a place this job writes/)
  assert.equal(foreign.writes.length, 0)
  const nonsense = await run({ restore: [{ at: 'ec_home; drop', value: 'x' }] })
  assert.equal(nonsense.out.code, 'BAD_PARAMS')
  const gone = await run({ restore: [{ at: 'site/site@de#hotline', value: 'x' }] })
  assert.equal(gone.out.code, 'STORE_CHANGED')
  assert.match(gone.out.next, /that is an answer/)
  const dry = await run({ restore: [{ at: 'site/site@en#hours', value: 'Mon–Sat' }], dryRun: true })
  assert.equal(dry.out.ok, true)
  assert.deepEqual(dry.out.would, [
    {
      at: 'site/site@en#hours',
      where: 'footer + main',
      before: 'Mon–Fri, 9:00–18:00 (MSK)',
      after: 'Mon–Sat'
    }
  ])
  assert.equal(dry.writes.length, 0)
  const same = await run({ restore: [{ at: 'site/site@en#hours', value: 'Mon–Fri, 9:00–18:00 (MSK)' }] })
  assert.equal(same.out.ok, true)
  assert.deepEqual(same.out.changed, [])
  assert.equal(same.writes.length, 0)
})

test('parseAt reads back every place a receipt prints, and nothing else', () => {
  assert.deepEqual(parseAt('home/home@en#services_items[1].text'), {
    kind: 'content',
    collection: 'home',
    slug: 'home',
    locale: 'en',
    path: ['services_items', 1, 'text']
  })
  assert.deepEqual(parseAt('menu:footer_company@ru[3]'), {
    kind: 'menu',
    name: 'footer_company',
    locale: 'ru',
    pos: 3
  })
  assert.deepEqual(parseAt('settings#title'), { kind: 'settings', key: 'title' })
})

{
  for (const bad of ['home/home@en#a..b', 'home@en#title', 'menu:x@en', 'settings#postsPerPage', '../x@en#y'])
    test(`parseAt reads back every place a receipt prints, and nothing else: ${rowName(bad)}`, () => {
      assert.equal(parseAt(bad), null, bad)
    })
}

// ── The doors the job answers from ─────────────────────────────────────────────────────────────

test('a missing agent token is NO_TOKEN with the custody next, before anything is written', async () => {
  const { out, writes } = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { scriptOptions: { token: null } }
  )
  assert.equal(out.code, 'NO_TOKEN')
  assert.equal(out.label, 'benchemdash01')
  assert.match(out.next, /agent-token procedure/)
  assert.equal(writes.length, 0)
})

test('a site that does not answer the read is SITE_UNREACHABLE (the same call once); EmDash refusing it is TOOL_FAILED', async () => {
  const down = createFakeEmdash(SITE, {
    fault: (name) => (name === 'content_list' ? { status: 502 } : undefined)
  })
  const a = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { emdash: down }
  )
  assert.equal(a.out.code, 'SITE_UNREACHABLE')
  assert.match(a.out.error, /HTTP 502/)
  assert.equal(a.out.next, EMDASH_REPLACE_NEXT.readFailedNext)
  const refusing = createFakeEmdash(SITE, {
    fault: (name) => (name === 'settings_get' ? { isError: '[FORBIDDEN] no' } : undefined)
  })
  const b = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { emdash: refusing }
  )
  assert.equal(b.out.code, 'TOOL_FAILED')
  assert.equal(b.out.emdash, 'FORBIDDEN')
  assert.match(b.out.next, /^tracy_emdash content_get/)
})

test('🔒 the first read failure names both roads at once: once more for a site just started, else content_get then content_update', async () => {
  // Round 7 (29/09/2026): ten cold-site runs read "the same call once more" twice (55 s each) and only
  // then reached the road that answered in seconds; three never left the retry.
  const down = createFakeEmdash(SITE, {
    fault: (name) => (name === 'content_list' ? { status: 502 } : undefined)
  })
  const { out, writes } = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { emdash: down }
  )
  assert.equal(out.code, 'SITE_UNREACHABLE')
  assert.deepEqual(writes, [], 'nothing was written')
  assert.match(
    out.next,
    /^once more if this site was just started; else tracy_emdash content_get \{collection, id:"<slug>"\}/
  )
  assert.match(out.next, /then content_update with status:"published"$/)
  // a picked element's mark carries both arguments: the next says which segment is which
  assert.match(out.next, /\(a picked mark is emdash:<collection>:<id>:<slug>\)/)
  assert.doesNotMatch(out.next, /tell the customer/)
  // the repeat says the road alone, and never the probe that took a third minute
  const again = EMDASH_REPLACE_NEXT.readFailedAgainNext
  assert.match(
    again,
    /^do not send it again or probe with page\.text: tracy_emdash content_get \{collection, id:"<slug>"\}/
  )
  assert.match(again, /then content_update with status:"published"$/)
  assert.doesNotMatch(again, /once more/)
})

test('the menu pre-read that fails inside the write keeps "the same call once more": content_update cannot write a menu', async () => {
  const change = { find: 'News', replace: 'Insights', path: '/', where: 'header' }
  const probe = await run(change)
  const menuReads = probe.emdash.calls.filter((c) => c.name === 'menu_get').length
  // the write script's own `menu_get` is the last one: it fails, the index read before it did not
  const flaky = createFakeEmdash(SITE, {
    fault: (name, _args, n) => (name === 'menu_get' && n === menuReads ? { status: 502 } : undefined)
  })
  const { out, writes } = await run(change, { emdash: flaky })
  assert.equal(out.code, 'SITE_UNREACHABLE')
  assert.deepEqual(writes, [], 'that op was never sent')
  assert.equal(out.next, EMDASH_REPLACE_NEXT.menuReadFailedNext)
  assert.match(out.next, /^the same call once more/)
  assert.notEqual(out.next, EMDASH_REPLACE_NEXT.readFailedNext)
})

test('🔒 a page that could not be read is said in the receipt: the words are stored, the page was not checked', async () => {
  // Round 7: the page read timed out, the receipt carried only a note, the plain receipt's "what it
  // says now" was answered "the heading now reads …" for a page nobody had seen.
  const blind = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { pageHtml: async () => ({ ok: false, code: 'READ_FAILED' }) }
  )
  assert.equal(blind.out.ok, true, JSON.stringify(blind.out))
  assert.ok(blind.out.notes.includes(REPLACE_NEXT.textOnlyNote))
  assert.equal(blind.out.next, EMDASH_REPLACE_NEXT.receiptUnreadNext)
  assert.match(blind.out.next, /that the page could not be read to check it/)
  assert.match(blind.out.next, /Read nothing back\.$/)
  // a page that answered keeps the plain receipt; so does a place left out, whose next must say so
  const seen = await run({ find: 'Selected projects', replace: 'Featured projects', path: '/' })
  assert.equal(seen.out.next, REPLACE_NEXT.receipt)
  // the read AFTER the write failing is the same statement
  let reads = 0
  const later = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    {
      verify: true,
      pageHtml: async (/** @type {string} */ p) => {
        reads += 1
        return reads === 1 ? servedPage(p) : { ok: false, code: 'READ_FAILED' }
      }
    }
  )
  assert.equal(later.out.verified, emdashReplaceText('notChecked'))
  assert.equal(later.out.next, EMDASH_REPLACE_NEXT.receiptUnreadNext)
})

test('a shape refusal from planReplace passes through untouched, with nothing read', async () => {
  let reads = 0
  const out = await replaceOnEmdash({
    plan: planReplace({ find: 'x', replace: 'y', search: 'z' }),
    index: async () => {
      reads += 1
      return { ok: false, kind: 'transport', error: '' }
    },
    write: async () => ({ ok: false, kind: 'transport', error: '' }),
    pageHtml: servedPage
  })
  assert.equal(out.code, 'BAD_PARAMS')
  assert.equal(reads, 0)
})

test('emdashScriptRoad: the two execs as the host runs them — argv, stdin, bounds; docker’s own words never reach the answer', async () => {
  /** @type {any[]} */
  const seen = []
  const ok = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    run: async (input) => {
      seen.push(input)
      return {
        code: 0,
        stdout: 'TRACY_EMDASH_INDEX {"served":["en"],"rows":[]}',
        stderr: '',
        timedOut: false
      }
    }
  })
  const got = await ok.index({ locales: ['en'] })
  assert.equal(got.ok, true)
  assert.deepEqual(seen[0].argv, emdashIndexArgv({ container: 'benchemdash01-web-1' }))
  assert.equal(seen[0].stdin, '{"locales":["en"]}')
  assert.equal(seen[0].timeoutMs, EMDASH_INDEX_MS)
  assert.equal(seen[0].maxBuffer, EMDASH_EXEC_MAX_BUFFER)
  await ok.write({ ops: [] })
  assert.deepEqual(seen[1].argv, emdashWriteArgv({ container: 'benchemdash01-web-1' }))
  assert.equal(seen[1].timeoutMs, EMDASH_WRITE_MS)

  const oci = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    sleep: async () => {},
    run: async () => ({
      code: 126,
      stdout: 'OCI runtime exec failed: exec failed: container not running',
      stderr: '',
      timedOut: false
    })
  })
  const bad = /** @type {any} */ (await oci.index({}))
  assert.equal(bad.ok, false)
  assert.doesNotMatch(bad.error, /OCI/)
  const slow = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    run: async () => ({ code: null, stdout: '', stderr: '', timedOut: true })
  })
  assert.deepEqual(await slow.write({ ops: [] }), {
    ok: false,
    kind: 'transport',
    error: 'no answer in 60 s'
  })
  const thrown = emdashScriptRoad({
    container: 'not a container',
    sleep: async () => {},
    run: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false })
  })
  assert.equal(/** @type {any} */ (await thrown.index({})).kind, 'transport')
})

/**
 * The road with a scripted `run` (the nth exec answers `answers[n]`, the last one repeated), a clock
 * the test moves, and a `sleep` that only records.
 * @param {{ stdout?: string, timedOut?: boolean, tookMs?: number }[]} answers
 */
function scriptedRoad(answers) {
  let clock = 1_000_000
  /** @type {number[]} */
  const slept = []
  /** @type {string[][]} */
  const argvs = []
  const road = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    now: () => clock,
    sleep: async (ms) => void slept.push(ms),
    run: async (input) => {
      const a = answers[Math.min(argvs.length, answers.length - 1)]
      argvs.push(input.argv)
      clock += a.tookMs ?? 100
      return { code: 0, stdout: a.stdout ?? '', stderr: '', timedOut: a.timedOut === true }
    }
  })
  return { road, slept, argvs, moved: () => clock }
}
const INDEX_OK = 'TRACY_EMDASH_INDEX {"served":["en"],"rows":[]}'

test('🔒 an index read that failed AT ONCE is asked once more after a pause; a slow failure, a refusal and the write never are', async () => {
  // A site starting or restarting refuses the loopback call in a moment; a second read finds it ready.
  for (const first of [
    'TRACY_EMDASH_ERR SITE fetch failed',
    'TRACY_EMDASH_ERR SITE HTTP 502 on content_list',
    'TRACY_EMDASH_ERR SITE content_list answered no JSON-RPC',
    'OCI runtime exec failed: container is restarting'
  ]) {
    const { road, slept, argvs } = scriptedRoad([{ stdout: first }, { stdout: INDEX_OK }])
    const got = await road.index({ locales: ['en'] })
    assert.equal(got.ok, true, first)
    assert.deepEqual(slept, [EMDASH_INDEX_RETRY_PAUSE_MS], first)
    assert.equal(argvs.length, 2, first)
    assert.deepEqual(argvs[1], emdashIndexArgv({ container: 'benchemdash01-web-1' }), 'the same read')
  }
  // once: a second failure is the answer, the wait is never repeated a third time
  const twice = scriptedRoad([{ stdout: 'TRACY_EMDASH_ERR SITE fetch failed' }])
  const failed = /** @type {any} */ (await twice.road.index({}))
  assert.equal(failed.ok, false)
  assert.equal(failed.kind, 'site')
  assert.equal(twice.argvs.length, 2)
  assert.deepEqual(twice.slept, [EMDASH_INDEX_RETRY_PAUSE_MS])

  // never after a slow failure: a site that ran to the script's deadline is overloaded, and a second
  // wait would double a 55 s call (round 7: 19 refusals, 45.7–49.3 s each in the index phase)
  for (const slow of [
    { stdout: 'TRACY_EMDASH_ERR DEADLINE the index ran past 45000 ms', tookMs: 46_000 },
    // a deadline answer is never a passing one, however early the script's own clock ran out
    { stdout: 'TRACY_EMDASH_ERR DEADLINE the index ran past 45000 ms', tookMs: 100 },
    { stdout: 'TRACY_EMDASH_ERR SITE The operation was aborted due to timeout', tookMs: 46_000 },
    { stdout: '', timedOut: true, tookMs: EMDASH_INDEX_MS },
    { stdout: 'TRACY_EMDASH_ERR SITE fetch failed', tookMs: EMDASH_INDEX_RETRY_WITHIN_MS + 1 }
  ]) {
    const { road, slept, argvs } = scriptedRoad([slow, { stdout: INDEX_OK }])
    const got = /** @type {any} */ (await road.index({}))
    assert.equal(got.ok, false, slow.stdout)
    assert.equal(argvs.length, 1, `${slow.stdout}: one exec`)
    assert.deepEqual(slept, [])
  }
  // …nor after an answer a second try would not change: no token, EmDash's own refusal, a 4xx, a cut line
  for (const same of [
    'TRACY_MCP_ERR NO_TOKEN the agent token is missing',
    'TRACY_EMDASH_ERR TOOL settings_get: [FORBIDDEN] no',
    'TRACY_EMDASH_ERR REFUSED locales must be a list of names',
    'TRACY_EMDASH_ERR SITE HTTP 401 on content_list',
    'TRACY_EMDASH_INDEX {"rows":['
  ]) {
    const { road, argvs } = scriptedRoad([{ stdout: same }, { stdout: INDEX_OK }])
    assert.equal(/** @type {any} */ (await road.index({})).ok, false, same)
    assert.equal(argvs.length, 1, same)
  }
  // the WRITE exec is never repeated: an answer lost after the send may have landed
  const write = scriptedRoad([
    { stdout: '', timedOut: false },
    { stdout: 'TRACY_EMDASH_WRITE {"results":[]}' }
  ])
  assert.equal(/** @type {any} */ (await write.road.write({ ops: [] })).ok, false)
  assert.equal(write.argvs.length, 1)
  assert.deepEqual(write.slept, [])
  // the bound: a fast failure plus the pause plus one full index exec, never more
  assert.ok(EMDASH_INDEX_RETRY_WITHIN_MS + EMDASH_INDEX_RETRY_PAUSE_MS + EMDASH_INDEX_MS <= 75_000)
})

{
  const long = 'x'.repeat(400)
  const facts = {
    find: long,
    new: long,
    old: long,
    why: long,
    what: long,
    at: long,
    n: 200,
    m: 200,
    path: '/a'.repeat(30),
    collection: 'services_page',
    id: '01M36TA83763RSVSN5R28DZ0AZ'
  }
  for (const key of /** @type {(keyof typeof EMDASH_REPLACE_NEXT)[]} */ (Object.keys(EMDASH_REPLACE_NEXT)))
    test(`every sentence keeps its T10 budget at its worst case: error ≤ 160 chars, next ≤ 200: ${rowName(key)}`, () => {
      const s = emdashReplaceText(
        key,
        key === 'outcomeNext' ? { ...facts, new: 'y'.repeat(40), old: 'z'.repeat(40) } : facts
      )
      const cap = key.endsWith('Next') ? 200 : 160
      assert.ok(s.length <= cap, `${key}: ${s.length} > ${cap}: ${s}`)
      assert.doesNotMatch(s, /\{[a-z]+\}/i, `${key} left a placeholder`)
      assert.doesNotMatch(s, /cowork/i)
    })
}

test('a dryRun writes nothing and names the confirm road for a site-wide change', async () => {
  const { out, writes, log } = await run({
    find: 'info@northgate-ind.ru',
    replace: 'hello@example.vn',
    path: '/',
    all: true,
    dryRun: true
  })
  assert.equal(out.ok, true)
  assert.equal(out.dryRun, true)
  assert.equal(writes.length, 0)
  assert.equal(log.write.length, 0)
  assert.match(out.next, /expect:\d+/)
})

test('the menu hash the write script checks is the sha256 of the items exactly as the read answered them', async () => {
  const emdash = createFakeEmdash(SITE)
  const { log } = await run({ find: 'News', replace: 'Insights', path: '/', where: 'header' }, { emdash })
  const op = log.write[0].ops[0]
  const read = SITE.menus.find((/** @type {any} */ m) => m.name === 'primary' && m.locale === 'en')
  assert.equal(op.menuHash, createHash('sha256').update(JSON.stringify(read.items)).digest('hex'))
})

function fortyLanguages() {
  const langs = JSON.parse(
    readFileSync(new URL('./fixtures/replace/emdash/site-languages.json', import.meta.url), 'utf8')
  )
  const ru = baseRow('site', 'site', 'ru')
  const have = new Set(['en', 'ru', 'vi'])
  const rows = [...SITE.rows]
  for (const l of langs.rows)
    if (!have.has(l.locale))
      rows.push({
        ...ru,
        ...l,
        collection: 'site',
        slug: 'site',
        status: 'published',
        data: { ...ru.data, ...l.data }
      })
  return { ...SITE, rows }
}

{
  for (const call of [
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { find: 'info@northgate-ind.ru', replace: 'hello@example.vn', path: '/', all: true },
    {
      changes: [
        { find: '8 800 550-67-89', replace: '0909 123 456' },
        { find: 'info@northgate-ind.ru', replace: 'hello@example.vn' }
      ],
      path: '/',
      all: true
    }
  ])
    test(`a fact on the 40-language bench site: written in all 40; the receipt and its undo fit, and the undo gives every byte back: ${rowName(call)}`, async () => {
      const emdash = createFakeEmdash(fortyLanguages())
      const before = snapshotOf(emdash)
      const { out, writes } = await run(call, { emdash })
      assert.equal(out.ok, true, `${out.code} ${out.error}`)
      assert.equal(
        writes.filter((w) => w.args.collection === 'site').length,
        40,
        'one Site chrome update per language'
      )
      assert.ok(
        out.changed
          .filter((/** @type {any} */ c) => c.at.startsWith('site/'))
          .every((/** @type {any} */ c) => c.languages === 40)
      )
      const size = Buffer.byteLength(JSON.stringify(out))
      assert.ok(size <= RECEIPT_MAX_BYTES, `receipt ${size} bytes`)
      assert.ok(out.undo.params.restore.length <= 4, 'one item per place, not per language')
      // topbar_phone + hotline, topbar_email, or all three — in each of the 40 languages
      const fields = call.changes ? 3 : call.find?.includes('@') ? 1 : 2
      assert.equal([...undoPlaces(out.undo)].filter((at) => at.startsWith('site/site@')).length, 40 * fields)
      const plan = planReplace(out.undo.params)
      assert.equal(plan.ok, true, JSON.stringify(plan).slice(0, 200))
      const back = await run(out.undo.params, { emdash })
      assert.equal(back.out.ok, true, `${back.out.code} ${back.out.error}`)
      assert.equal(snapshotOf(emdash), before, 'byte-identical after the undo')
      assert.ok(
        Buffer.byteLength(JSON.stringify(back.out)) <= RECEIPT_MAX_BYTES,
        'the undo’s own receipt fits'
      )
    })
}

test('the undo shape: a place in many languages is one item; planReplace takes it, up to REPLACE_MAX_RESTORE', () => {
  const undo = emdashUndo([
    { at: 'site/site@en#topbar_phone', before: 'Hotline: 8 800 550-67-89', value: 'Hotline: 0909 123 456' },
    {
      at: 'site/site@ru#topbar_phone',
      before: 'Горячая линия: 8 800 550-67-89',
      value: 'Горячая линия: 0909 123 456'
    },
    { at: 'site/site@en#hotline', before: '8 800 550-67-89', value: '0909 123 456' },
    { at: 'site/site@ru#hotline', before: '8 800 550-67-89', value: '0909 123 456' },
    // the new words stand twice in the value: putting the old ones back would not be exact
    { at: 'home/home@en#band_title', before: 'Call 1', value: 'Call 22 or 22' },
    { at: 'home/home@ru#band_title', before: 'Звоните 1', value: 'Звоните 22 или 22' }
  ])
  assert.deepEqual(undo.params, {
    restore: [
      { at: 'site/site@en,ru#topbar_phone', was: '8 800 550-67-89', now: '0909 123 456' },
      { at: 'site/site@en,ru#hotline', value: '8 800 550-67-89', now: '0909 123 456' },
      { at: 'home/home@en#band_title', value: 'Call 1', now: 'Call 22 or 22' },
      { at: 'home/home@ru#band_title', value: 'Звоните 1', now: 'Звоните 22 или 22' }
    ]
  })
  assert.deepEqual(expandAt('site/site@en,ru,vi#hotline'), [
    'site/site@en#hotline',
    'site/site@ru#hotline',
    'site/site@vi#hotline'
  ])
  assert.deepEqual(expandAt('menu:primary@en,ru[4]'), ['menu:primary@en[4]', 'menu:primary@ru[4]'])
  assert.deepEqual(expandAt('settings#title'), ['settings#title'])
  // planReplace: the three item shapes, and nothing else
  assert.equal(planReplace({ restore: undo.params.restore }).ok, true)
  const many = Array.from({ length: REPLACE_MAX_RESTORE }, (_, k) => ({
    at: `site/site@x${k}#hours`,
    value: 'v'
  }))
  assert.equal(planReplace({ restore: many }).ok, true)
})

{
  const many = Array.from({ length: REPLACE_MAX_RESTORE }, (_, k) => ({
    at: `site/site@x${k}#hours`,
    value: 'v'
  }))
  for (const bad of [
    [...many, { at: 'site/site@en#hours', value: 'v' }],
    [{ at: 'site/site@en#hotline', was: '1' }],
    [{ at: 'site/site@en#hotline', was: '1', now: '' }],
    [{ at: 'site/site@en#hotline', value: '1', was: '1', now: '2' }],
    [{ at: 'site/site@en#hotline', now: '2' }],
    [{ at: 'site/site@en#hotline', value: 1 }]
  ])
    test(`the undo shape: a place in many languages is one item; planReplace takes it, up to REPLACE_MAX_RESTORE: ${rowName(bad)}`, () => {
      assert.equal(
        /** @type {any} */ (planReplace({ restore: bad })).code,
        'BAD_PARAMS',
        JSON.stringify(bad).slice(0, 80)
      )
    })
}

{
  for (const bad of ['site/site@en,,ru#x', 'site/site@en,ru#a..b', 'menu:x@en,ru', 'settings@en,ru#title'])
    test(`the undo shape: a place in many languages is one item; planReplace takes it, up to REPLACE_MAX_RESTORE: ${rowName(bad)}`, () => {
      assert.equal(expandAt(bad), null, bad)
    })
}

{
  const hero = baseRow('home', 'home', 'en').data
  for (const call of [
    { find: hero.hero_text, replace: '', path: '/' },
    { find: `${hero.hero_title_a} ${hero.hero_title_b}`, replace: 'Welcome', path: '/' },
    // new words that look like a path, then like a URL
    { find: 'Selected projects', replace: '/projects', path: '/' },
    { find: 'Selected projects', replace: 'https://northgate.example/projects', path: '/' }
  ])
    test(`an undo is accepted for a place this job emptied or filled with URL-like words — every byte back: ${rowName(call)}`, async () => {
      const emdash = createFakeEmdash(SITE)
      const before = snapshotOf(emdash)
      const { out } = await run(call, { emdash })
      assert.equal(out.ok, true, `${call.replace}: ${out.code} ${out.error}`)
      const back = await run(out.undo.params, { emdash })
      assert.equal(back.out.ok, true, `${call.replace} undo: ${back.out.code} ${back.out.error}`)
      assert.equal(back.out.next, REPLACE_NEXT.restored)
      assert.equal(snapshotOf(emdash), before, `${call.replace}: byte-identical after the undo`)
    })
}

{
  for (const at of [
    'home/home@en#hero_cta1_url',
    'home/home@en#hero_image.alt',
    'pages/terms@en#content[14].markDefs[0].href',
    'pages/terms@en#content[14]._type',
    'site/site@en#language_name'
  ])
    test(`an undo is accepted for a place this job emptied or filled with URL-like words — every byte back: ${rowName(at)}`, async () => {
      const { out, writes } = await run({ restore: [{ at, value: 'x' }] })
      assert.equal(out.code, 'BAD_PARAMS', `${at}: ${out.code}`)
      assert.equal(writes.length, 0)
    })
}

test('an undo never overwrites words written since — a menu that moved, an entry someone edited', async () => {
  // rename a menu item, then someone adds an item at the top: position 4 now holds "Projects"
  const emdash = createFakeEmdash(SITE)
  const renamed = await run({ find: 'News', replace: 'Insights', path: '/', where: 'header' }, { emdash })
  assert.equal(renamed.out.ok, true, renamed.out.error)
  assert.deepEqual(renamed.out.undo.params.restore, [
    { at: 'menu:primary@en[4]', value: 'News', now: 'Insights' }
  ])
  const menu = emdash.menu('primary', 'en')
  menu.items.unshift({ ...menu.items[0], id: '01NEWITEM00000000000000000', label: 'Home' })
  const labels = () =>
    menuItemsForSet(emdash.menu('primary', 'en').items).map((/** @type {any} */ it) => it.label)
  const shifted = labels()
  const undo = await run(renamed.out.undo.params, { emdash })
  assert.equal(undo.out.code, 'STORE_CHANGED')
  assert.deepEqual(undo.out.changedSince, ['menu:primary@en[4]'])
  assert.equal(undo.out.next, EMDASH_REPLACE_NEXT.restoreMovedOnlyNext)
  assert.equal(undo.writes.length, renamed.writes.length, 'nothing more was written')
  assert.deepEqual(labels(), shifted, '"Projects" is never overwritten')

  const site = createFakeEmdash(SITE)
  const before = valuesOf(site)
  const fact = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true },
    { emdash: site }
  )
  assert.equal(fact.out.ok, true)
  site.touch('site', 'site', 'ru', 'hotline', '8 800 000-00-00')
  const refused = await run(fact.out.undo.params, { emdash: site })
  assert.equal(refused.out.code, 'STORE_CHANGED')
  assert.deepEqual(refused.out.changedSince, ['site/site@ru#hotline'])
  assert.equal(refused.writes.length, fact.writes.length, 'nothing more was written')
  assert.equal(refused.out.next, EMDASH_REPLACE_NEXT.restoreMovedNext)
  const rest = await run(refused.out.undoRest.params, { emdash: site })
  assert.equal(rest.out.ok, true, `${rest.out.code} ${rest.out.error}`)
  const after = valuesOf(site)
  for (const [at, v] of before)
    if (at === 'site/site@ru#hotline') assert.equal(after.get(at), '8 800 000-00-00', 'their words stand')
    else assert.equal(after.get(at), v, at)
})

test('the words as quoted win: "Disclosures" is the category label, not a partial hit in another heading', async () => {
  // the heading itself, quoted as it is written, is still a place
  const heading = await run({
    find: 'News & disclosures',
    replace: 'News & filings',
    path: '/',
    dryRun: true
  })
  assert.equal(heading.out.ok, true, heading.out.error)
  assert.deepEqual(
    heading.out.would.map((/** @type {any} */ w) => w.at),
    ['home/home@en#news_title']
  )
})

{
  for (const dryRun of [true, false])
    test(`the words as quoted win: "Disclosures" is the category label, not a partial hit in another heading: ${rowName(dryRun)}`, async () => {
      const { out, writes } = await run({ find: 'Disclosures', replace: 'Filings', path: '/', dryRun })
      assert.equal(out.code, 'NOT_EDITABLE', `${out.code} ${JSON.stringify(out.would ?? '')}`)
      assert.match(out.error, /category or tag label/)
      // Its own door renames it (local round 23, 25/10/2026: "that is an answer" kept three template categories).
      assert.match(out.next, /taxonomy_update_term \{taxonomy, termSlug, label\}/)
      assert.doesNotMatch(out.next, /another way in/)
      assert.deepEqual(
        out.looser.map((/** @type {any} */ l) => l.at),
        ['home/home@en#news_title']
      )
      assert.equal(writes.length, 0)
    })
}

test('a read EmDash refuses for another reason than [NOT_FOUND] fails — never "words the template prints"', async () => {
  const locked = createFakeEmdash(SITE, {
    fault: (name, args) =>
      name === 'content_list' && args.collection === 'projects'
        ? { isError: '[INTERNAL_ERROR] database is locked' }
        : undefined
  })
  const a = await run(
    { find: 'Selected projects', replace: 'Featured projects', path: '/' },
    { emdash: locked }
  )
  assert.equal(a.out.code, 'TOOL_FAILED')
  assert.equal(a.out.emdash, 'INTERNAL_ERROR')
  assert.equal(a.out.next, EMDASH_REPLACE_NEXT.readBusyNext)
  assert.equal(a.writes.length, 0)
  // a collection EmDash does not have is skipped, and a refusal built without it says so
  const noPosts = createFakeEmdash(SITE, {
    fault: (name, args) =>
      name === 'content_list' && args.collection === 'posts'
        ? { isError: '[NOT_FOUND] Collection "posts" not found' }
        : undefined
  })
  const b = await run(
    {
      find: 'Northgate wins the Zavolzhye 2 infrastructure tender',
      replace: 'We won',
      path: '/',
      dryRun: true
    },
    { emdash: noPosts }
  )
  assert.equal(b.out.code, 'NOT_EDITABLE')
  assert.deepEqual(b.out.notes, [emdashReplaceText('missingNote', { what: 'posts' })])
})

test('a link follows its fact: the careers e-mail changes its mailto: link too, named as a companion, undone with it', async () => {
  const emdash = createFakeEmdash(SITE)
  const before = snapshotOf(emdash)
  const { out, writes } = await run(
    { find: 'hr@northgate-ind.ru', replace: 'jobs@northgate-ind.ru', path: '/careers' },
    { emdash }
  )
  assert.equal(out.ok, true, `${out.code} ${out.error}`)
  assert.equal(writes.length, 1, 'the link is written in the same op')
  assert.deepEqual(Object.keys(writes[0].args.data).sort(), ['cta_mail', 'cta_url'])
  const careers = emdash.row('careers', 'careers', 'en').data
  assert.equal(careers.cta_mail, 'jobs@northgate-ind.ru')
  assert.equal(careers.cta_url, 'mailto:jobs@northgate-ind.ru')
  assert.deepEqual(out.companions, [
    {
      at: 'careers/careers@en#cta_url',
      before: 'mailto:hr@northgate-ind.ru',
      after: 'mailto:jobs@northgate-ind.ru'
    }
  ])
  const back = await run(out.undo.params, { emdash })
  assert.equal(back.out.ok, true, `${back.out.code} ${back.out.error}`)
  assert.equal(snapshotOf(emdash), before)
  // words that are not a contact fact never touch a link
  const words = await run({ find: 'Send your CV', replace: 'Apply now', path: '/careers', dryRun: true })
  assert.equal(words.out.companions, undefined)
})

test('a run the deadline stopped goes on with what it never sent, in a run of its own: every language written, nothing undone', async () => {
  // a loaded host: each write takes 41 s of the script's 45, so every run sends one op and stops
  let clock = Date.now()
  const emdash = createFakeEmdash(SITE, {
    fault: (name) => {
      if (name === 'content_update') clock += 41_000
      return undefined
    }
  })
  const call = { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true }
  const { out, writes, log } = await run(call, { emdash, scriptOptions: { now: () => clock } })
  assert.equal(out.ok, true, `${out.code} ${out.error}`)
  assert.equal(log.write.length, EMDASH_WRITE_ROUNDS, 'one run per op, each under a deadline of its own')
  assert.deepEqual(
    log.write.map((/** @type {any} */ r) => r.ops.length),
    [3, 2, 1],
    'each run sends only what the last one never sent'
  )
  assert.equal(writes.length, 3, 'each language written once; no undo was sent')
  for (const l of ['en', 'ru', 'vi'])
    assert.equal(emdash.row('site', 'site', l).data.hotline, '0909 123 456', l)
  // the receipt's undo reaches every run's writes
  const back = await run(out.undo.params, { emdash })
  assert.equal(back.out.ok, true, `${back.out.code} ${back.out.error}`)
  for (const l of ['en', 'ru', 'vi'])
    assert.equal(emdash.row('site', 'site', l).data.hotline, '8 800 550-67-89', l)
})

// ── review C2 (19/10/2026): the customer's Stop between two runs, and on the script road ─────────────

test('🔒 C2: Stop while a write run is in the container — that run lands, the next never starts; what landed is named with its undo', async () => {
  // a loaded host: each write takes 41 s of the script's 45, so every run sends one op and stops
  let clock = Date.now()
  const emdash = createFakeEmdash(SITE, {
    fault: (name) => {
      if (name === 'content_update') clock += 41_000
      return undefined
    }
  })
  const r = road(emdash, { now: () => clock })
  const stop = new AbortController()
  let runs = 0
  const out = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace({ find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true }),
      index: r.index,
      // the write as `emdashScriptRoad` runs it: after Stop no exec starts
      write: async (/** @type {any} */ req) => {
        if (stop.signal.aborted) return { ok: false, kind: 'stopped', error: 'the customer stopped the turn' }
        runs += 1
        const got = await r.write(req)
        stop.abort()
        return got
      },
      pageHtml: servedPage,
      artifact: SITE.artifact,
      label: 'benchemdash01',
      verify: false
    })
  )
  assert.equal(runs, 1, 'the run already in the container only')
  assert.equal(out.code, 'TURN_STOPPED')
  assert.deepEqual(out.written, ['site/site@en#topbar_phone', 'site/site@en#hotline'])
  assert.equal(emdash.row('site', 'site', 'en').data.hotline, '0909 123 456', 'the run on the wire landed')
  assert.equal(emdash.row('site', 'site', 'ru').data.hotline, '8 800 550-67-89', 'the next run never started')
  const back = await run(out.undo.params, { emdash })
  assert.equal(back.out.ok, true, `${back.out.code} ${back.out.error}`)
  assert.equal(emdash.row('site', 'site', 'en').data.hotline, '8 800 550-67-89')
})

test('🔒 C2: emdashScriptRoad with the turn stopped starts no exec, and its index retry pause ends at Stop', async () => {
  const stopped = new AbortController()
  stopped.abort()
  let runs = 0
  const idle = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    signal: stopped.signal,
    run: async () => {
      runs += 1
      return { code: 0, stdout: INDEX_OK, stderr: '', timedOut: false }
    }
  })
  assert.equal((await idle.write({ ops: [] })).kind, 'stopped')
  assert.equal((await idle.index({})).kind, 'stopped')
  assert.equal(runs, 0)

  // the first read fails at once; Stop comes during the pause before the second: it is never sent
  const stop = new AbortController()
  let reads = 0
  const pausing = emdashScriptRoad({
    container: 'benchemdash01-web-1',
    signal: stop.signal,
    sleep: () => (stop.abort(), new Promise(() => {})),
    run: async () => {
      reads += 1
      return { code: 0, stdout: 'TRACY_EMDASH_ERR SITE fetch failed', stderr: '', timedOut: false }
    }
  })
  assert.equal((await pausing.index({})).kind, 'stopped')
  assert.equal(reads, 1)
})

test('a run that writes nothing is not waited on again: PARTIAL, and the undo, then the same call once more, reaches every language', async () => {
  const emdash = createFakeEmdash(SITE)
  const r = road(emdash)
  let runs = 0
  const call = { find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true }
  const out = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace(call),
      index: r.index,
      // the first run writes one op and stops; the second is stopped before its first op
      write: async (/** @type {any} */ req) => {
        runs += 1
        if (runs > 1) return { ok: true, value: { results: [] } }
        const got = await r.write({ ops: req.ops.slice(0, 1) })
        return got
      },
      pageHtml: servedPage,
      artifact: SITE.artifact,
      label: 'benchemdash01',
      verify: false
    })
  )
  assert.equal(runs, 2)
  assert.equal(out.code, 'PARTIAL')
  assert.equal(out.error, emdashReplaceText('stoppedError', { n: 1, m: 3 }))
  assert.equal(out.next, EMDASH_REPLACE_NEXT.stoppedNext)
  assert.deepEqual(out.written, ['site/site@en#topbar_phone', 'site/site@en#hotline'])
  const back = await run(out.undo.params, { emdash })
  assert.equal(back.out.ok, true, `${back.out.code} ${back.out.error}`)
  const again = await run(call, { emdash })
  assert.equal(again.out.ok, true, `${again.out.code} ${again.out.error}`)
  for (const l of ['en', 'ru', 'vi'])
    assert.equal(emdash.row('site', 'site', l).data.hotline, '0909 123 456', l)
})

test('where: a home card’s excerpt is the post’s excerpt — its body, printed only on the post’s own page, is not a second place', async () => {
  const post = baseRow('posts', 'northgate-wins-the-zavolzhye-2-infrastructure-tender', 'en')
  assert.equal(
    post.data.content[0].children[0].text,
    post.data.excerpt,
    'the body really holds the same words'
  )
  const { out } = await run({
    find: post.data.excerpt,
    replace: 'A 1.2bn package from October.',
    path: '/',
    dryRun: true
  })
  assert.equal(out.ok, true, `${out.code} ${out.error}`)
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    ['posts/northgate-wins-the-zavolzhye-2-infrastructure-tender@en#excerpt']
  )
})

test('a Site chrome field printed in the footer AND on the contact page says both, wherever it was found', async () => {
  const { out } = await run({ find: 'Industrial infrastructure', replace: 'Since 2004', path: '/' })
  assert.equal(out.ok, true, `${out.code} ${out.error}`)
  assert.deepEqual(
    out.changed.map((/** @type {any} */ r) => r.where),
    ['header']
  )
  assert.ok(!(out.notes ?? []).some((/** @type {string} */ n) => /more than one place/.test(n)))
})

{
  for (const path of ['/', '/contact'])
    test(`a Site chrome field printed in the footer AND on the contact page says both, wherever it was found: ${rowName(path)}`, async () => {
      const { out } = await run({ find: 'sales@northgate-ind.ru', replace: 'sales@example.vn', path })
      assert.equal(out.ok, true, `${path}: ${out.code} ${out.error}`)
      const row = out.changed.find((/** @type {any} */ r) => r.at.endsWith('#sales_email'))
      assert.equal(row.where, 'footer + main', path)
      assert.ok(
        out.notes.some((/** @type {string} */ n) =>
          n.startsWith('site · sales_email prints in more than one place (where lists each)')
        ),
        `${path}: ${JSON.stringify(out.notes)}`
      )
    })
}

/**
 * The Content API content Tracy's EmDash reader projects for one entry (`tools/content-api/reader.mjs`
 * `project`): each top-level string field under its own key, and a repeater as a block keyed by the
 * field, one item per row at its stored position, each subfield under its own name. Portable Text and
 * media are left out: `content.locate` gives them no address.
 * @param {Record<string, any>} row
 */
function contentOf(row) {
  const fields = []
  const blocks = []
  for (const [key, value] of Object.entries(row.data)) {
    if (typeof value === 'string') fields.push({ key, type: 'text', value, slotKey: null, semanticKey: null })
    else if (
      Array.isArray(value) &&
      value.every((one) => one && typeof one === 'object' && !('_type' in one))
    )
      blocks.push({
        id: `b-${row.id}-${key}`,
        key,
        fields: [],
        items: value.map((one, position) => ({
          id: `i-${row.id}-${key}-${position}`,
          position,
          fields: Object.entries(one)
            .filter(([, sub]) => typeof sub === 'string')
            .map(([name, sub]) => ({ key: name, type: 'text', value: sub, slotKey: null, semanticKey: null }))
        }))
      })
  }
  return {
    id: `c-${row.collection}-${row.id}`,
    type: 'page',
    title: typeof row.data.title === 'string' ? row.data.title : null,
    slug: row.slug,
    url: null,
    locale: row.locale,
    revision: 'r',
    fields,
    blocks
  }
}

test('content.locate: every EmDash field it addresses is a unit this engine builds, or one the template hides', () => {
  const table = templateTableOf(SITE.artifact)
  const units = new Set(storeOf(/** @type {any} */ (SITE), table).units.map((u) => u.at))
  const rows = SITE.rows.filter((/** @type {any} */ row) => row.status === 'published')
  const marks = rows.map((/** @type {any} */ row) => `emdash:${row.collection}:${row.id}:${row.slug}`)
  const index = indexContents(rows.map(contentOf))
  let checked = 0
  let hidden = 0
  for (const { hit } of index.segments) {
    const record = index.meta.get(hit.contentId)
    if (!record) continue
    // One entry's own mark, as its page prints it around the element.
    const own = marks.filter(
      (mark) => mark.endsWith(`:${record.slug}`) && hit.contentId.startsWith(`c-${mark.split(':')[1]}-`)
    )
    const at = replaceAtOf({ platform: 'emdash', record, where: hit.where, value: hit.value, marks: own })?.at
    if (at === undefined) continue
    const key = `${at.slice(0, at.indexOf('/'))}#${at.slice(at.indexOf('#') + 1)}`
    if (table?.hidden.some((rx) => rx.test(key))) {
      hidden += 1
      continue
    }
    assert.ok(units.has(at), `${at}: no unit of that address`)
    checked += 1
  }
  assert.ok(checked > 200, `${checked} addresses checked (${hidden} the template hides)`)
})

test('a NOT_FOUND names the page that holds the words: another collection, or another language', async () => {
  const card = await run({
    find: 'Timeline: 8–14 weeks for 30k m² of roof',
    replace: 'Timeline: 6 weeks',
    path: '/'
  })
  assert.equal(card.out.code, 'NOT_FOUND')
  assert.deepEqual(card.out.pages, ['/services/building-envelope'])
  assert.match(card.out.next, /path:"\/services\/building-envelope"/)
  assert.deepEqual(card.writes, [])
  // words quoted in Russian from the English page: the Russian page is named, nothing is written
  const ru = await run({ find: 'Очистить форму', replace: 'Сбросить', path: '/' })
  assert.equal(ru.out.code, 'NOT_FOUND')
  assert.deepEqual(ru.out.pages, ['/ru/contact'])
  assert.match(ru.out.error, /another language/)
  assert.deepEqual(ru.writes, [])
  // words held nowhere stay a plain NOT_FOUND with no page
  const none = await run({ find: 'Words nobody wrote anywhere', replace: 'x', path: '/' })
  assert.equal(none.out.code, 'NOT_FOUND')
  assert.equal(none.out.pages, undefined)
})

test('a bulk change lists the lines that still open with the shared lead words', async () => {
  // six "Timeline:" lines; the call carries four, so two stay and the receipt says which
  const lines = [
    ['Timeline: 8–14 weeks for 30k m² of roof', 'Schedule: 8–14 weeks for 30k m² of roof'],
    ['Timeline: in parallel with envelope, 10–16 weeks', 'Schedule: in parallel with envelope, 10–16 weeks'],
    ['Timeline: 6–10 weeks to frame shop drawings', 'Schedule: 6–10 weeks to frame shop drawings'],
    ['Timeline: from 5 weeks for a 600 t batch', 'Schedule: from 5 weeks for a 600 t batch']
  ]
  const { out } = await run({
    changes: lines.map(([find, replace]) => ({ find, replace })),
    path: '/services'
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.changed.length, 4)
  assert.equal(out.stillHolds.opening, 'timeline:')
  assert.deepEqual(out.stillHolds.places.map((/** @type {any} */ u) => u.at.split('#')[0]).sort(), [
    'services/general-contracting@en',
    'services/refurbishment-in-operation@en'
  ])
  assert.match(out.next, /stillHolds/)
  // the completeness signal survives the receipt budget that cuts unchanged and alsoIn
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= RECEIPT_MAX_BYTES)
})

test('the template table hides no field that the template views print', () => {
  const table = templateTableOf(SITE.artifact)
  const root = new URL('../../../cms/tracy-emdash-theme-business/src/', import.meta.url)
  const keys = new Set()
  const call = /\$\(\s*['"](\w+)['"]\s*(?:,\s*[\w.]+)?\)\(\s*['"]([\w.[\]]+)['"]\s*\)/g
  for (const dir of ['views', 'components']) {
    for (const file of readdirSync(new URL(`${dir}/`, root), { recursive: true })) {
      if (!String(file).endsWith('.astro')) continue
      const text = readFileSync(new URL(`${dir}/${file}`, root), 'utf8')
      for (const m of text.matchAll(call)) keys.add(`${m[1]}#${m[2]}`)
    }
  }
  assert.ok(keys.size > 10 && keys.has('services#term'), `${keys.size} printed fields found`)
  const printedButHidden = [...keys].filter((key) => table?.hidden.some((rx) => rx.test(key)))
  assert.deepEqual(printedButHidden, [])
})

test('content.locate: a repeater row’s at pins the engine to that row', async () => {
  const about = SITE.rows.find(
    (/** @type {any} */ row) =>
      row.collection === 'about' && row.locale === 'en' && row.status === 'published'
  )
  const index = indexContents([contentOf(about)])
  const hit = index.segments.find(
    ({ hit }) => hit.where.blockKey === 'stats' && hit.where.position === 0 && hit.where.field === 'label'
  )?.hit
  assert.ok(hit)
  const at = replaceAtOf({
    platform: 'emdash',
    record: /** @type {any} */ (index.meta.get(hit.contentId)),
    where: hit.where,
    value: hit.value,
    marks: [`emdash:about:${about.id}:about field:stats.label`]
  })?.at
  assert.equal(at, 'about/about@en#stats[0].label')
  const { out } = await run({
    find: about.data.stats[0].label,
    replace: 'projects completed',
    path: '/about',
    at: [at],
    dryRun: true
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.deepEqual(
    out.would.map((/** @type {any} */ w) => w.at),
    [at]
  )
})

test('EmDash: the words as quoted, held by a writable value the strict region check kept off this spot, name that value — never "do not look for another way in"', () => {
  // The same shape the core answers (`locate`, 16/10/2026): the anchor's verdict is not the site's.
  const page = renderedUnits(
    '<html lang="en"><body><main><p>Investor relations</p></main><footer><p>Investor relations hub</p></footer></body></html>'
  ).units
  const su = (at, raw, extra = {}) => ({ ...views(raw, { decode: false }), at, raw, ...extra })
  const title = su('home/home@en#ir_title', 'Investor relations', { label: 'Investors title' })
  const hub = su('home/home@en#footer_line', 'Investor relations hub')
  const results = [
    {
      change: { find: 'Investor relations', replace: 'Klantinformatie' },
      targets: [
        { kind: 'unit', at: hub.at, where: 'footer', rank: 1, occ: {}, unit: hub, hits: [{ a: 0, b: 18 }] }
      ]
    }
  ]
  const plan = { at: null, all: false, where: null }
  const held = quotedElsewhere({
    plan,
    results,
    page,
    store: { units: [title, hub] },
    hooks: { anchor: (h) => h.unit.at !== title.at }
  })
  assert.equal(held?.code, 'NOT_EDITABLE')
  assert.notEqual(held.next, REPLACE_NEXT.notEditableNext)
  assert.match(held.next, /at:\["home\/home@en#ir_title"\]/)
  assert.deepEqual(held.held, [{ at: title.at, label: 'Investors title' }])
  // a value nobody may write keeps the plain answer
  const locked = quotedElsewhere({
    plan,
    results,
    page,
    store: {
      units: [{ ...title, writable: false, why: 'a category or tag label, which no door here renames' }, hub]
    },
    hooks: { anchor: () => true }
  })
  assert.equal(locked?.code, 'NOT_EDITABLE')
  assert.equal(locked.held, undefined)
  assert.match(locked.next, /that is an answer/)
})

// lrsweep rig, Tracy Base 0.5.6 (25/10/2026): every service entry's body opens with the same heading, and on one
// service's page the road counted 52 places for the one it shows; three pages' pricing tiers each counted a price
// the pricing page shows once.
test('with no template table, an entry page shows its own entry, not the same words in other entries of its collection', async () => {
  const row = (collection, slug, id, data) => ({
    collection,
    id,
    slug,
    locale: 'en',
    status: 'published',
    version: 1,
    updatedAt: '2026-10-24T00:00:00.000Z',
    liveRevisionId: `${id}R`,
    draftRevisionId: null,
    translationGroup: id,
    data
  })
  const body = (text) => [
    { _type: 'block', _key: 'b0', style: 'h2', children: [{ _type: 'span', _key: 's0', text }] }
  ]
  const site = {
    _source: 'test',
    artifact: null,
    served: ['en'],
    menus: [],
    terms: [],
    settings: { title: 'Base' },
    rows: [
      row('services', 'brand-design', '01M50ZVKBWPMA7W64Y1PA8MZV1', {
        title: 'Brand design',
        content: body('Putting it into practice')
      }),
      row('services', 'web-build', '01M50ZVKBWPMA7W64Y1PA8MZV2', {
        title: 'Web build',
        content: body('Putting it into practice')
      }),
      row('pages', 'pricing', '01M50ZVKBWPMA7W64Y1PA8MZV3', { title: 'Pricing', tiers: [{ price: '$24' }] }),
      row('pages', 'landing', '01M50ZVKBWPMA7W64Y1PA8MZV4', { title: 'Landing', tiers: [{ price: '$24' }] })
    ]
  }
  const pages = {
    '/services/brand-design':
      '<html lang="en"><body><main><article><h1>Brand design</h1><h2>Putting it into practice</h2></article></main></body></html>',
    '/pricing': '<html lang="en"><body><main><h1>Pricing</h1><p>$24</p></main></body></html>'
  }
  const pageHtml = async (path) => ({ ok: true, status: 200, html: pages[path] })
  const heading = await run(
    {
      find: 'Putting it into practice',
      replace: 'Menu item',
      path: '/services/brand-design',
      all: 'page',
      expect: 1
    },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(heading.out.ok, true, JSON.stringify(heading.out).slice(0, 300))
  assert.deepEqual(
    heading.writes.map((w) => w.args?.id ?? w.params?.id ?? w.id),
    ['01M50ZVKBWPMA7W64Y1PA8MZV1']
  )
  const price = await run(
    { find: '$24', replace: 'Menu item', path: '/pricing', all: 'page', expect: 1 },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(price.out.ok, true, JSON.stringify(price.out).slice(0, 300))
  assert.equal(price.writes.length, 1)
})

test('with no template table, an entry page shows its own entry, not the same words in entries of other collections', async () => {
  const row = (collection, slug, id, data) => ({
    collection,
    id,
    slug,
    locale: 'en',
    status: 'published',
    version: 1,
    updatedAt: '2026-10-25T00:00:00.000Z',
    liveRevisionId: `${id}R`,
    draftRevisionId: null,
    translationGroup: id,
    data
  })
  const body = (text) => [
    { _type: 'block', _key: 'b0', style: 'h2', children: [{ _type: 'span', _key: 's0', text }] }
  ]
  const site = {
    _source: 'test',
    artifact: null,
    served: ['en'],
    menus: [],
    terms: [],
    settings: { title: 'Base' },
    rows: [
      row('services', 'brand-design', '01M50ZVKBWPMA7W64Y1PA8MZW1', {
        title: 'Brand design',
        content: body('Putting it into practice')
      }),
      row('people', 'ada', '01M50ZVKBWPMA7W64Y1PA8MZW2', {
        title: 'Ada',
        content: body('Putting it into practice')
      }),
      row('pricing', 'pricing', '01M50ZVKBWPMA7W64Y1PA8MZW3', {
        title: 'Pricing',
        tiers: [{ price: '$24' }]
      }),
      row('home', 'home', '01M50ZVKBWPMA7W64Y1PA8MZW4', { title: 'Home', tiers: [{ price: '$24' }] }),
      row('footer', 'footer', '01M50ZVKBWPMA7W64Y1PA8MZW5', {
        title: 'Footer',
        note: 'Made with care in Lisbon'
      })
    ]
  }
  const foot = '<footer><p>Made with care in Lisbon</p></footer>'
  const pages = {
    '/services/brand-design': `<html lang="en"><body><main><article><h1>Brand design</h1><h2>Putting it into practice</h2></article></main>${foot}</body></html>`,
    '/pricing': `<html lang="en"><body><main><h1>Pricing</h1><p>$24</p></main>${foot}</body></html>`
  }
  const pageHtml = async (path) => ({ ok: true, status: 200, html: pages[path] })
  const ids = (r) => r.writes.map((w) => w.args?.id ?? w.params?.id ?? w.id)
  const heading = await run(
    {
      find: 'Putting it into practice',
      replace: 'Menu item',
      path: '/services/brand-design',
      all: 'page',
      expect: 1
    },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(heading.out.ok, true, JSON.stringify(heading.out).slice(0, 300))
  assert.deepEqual(ids(heading), ['01M50ZVKBWPMA7W64Y1PA8MZW1'])
  const price = await run(
    { find: '$24', replace: 'Menu item', path: '/pricing', all: 'page', expect: 1 },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(price.out.ok, true, JSON.stringify(price.out).slice(0, 300))
  assert.deepEqual(ids(price), ['01M50ZVKBWPMA7W64Y1PA8MZW3'])
  // What every page prints outside its main column is still found by presence.
  const note = await run(
    { find: 'Made with care in Lisbon', replace: 'Menu item', path: '/pricing', all: 'page', expect: 1 },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(note.out.ok, true, JSON.stringify(note.out).slice(0, 300))
  assert.deepEqual(ids(note), ['01M50ZVKBWPMA7W64Y1PA8MZW5'])
})

// lrsweep rig, Tracy Base 0.5.6 (25/10/2026): "/" has no slug, so every page collection's pricing tiers counted on
// the home page ($24, $96, $0 counted 2 for 1, COUNT_MISMATCH). The collection's own `urlPattern` names the page.
test("with no template table, a page is its collection's by the collection's urlPattern: on / only the home entry counts, and a card's entry where it links", async () => {
  const row = (collection, slug, id, data) => ({
    collection,
    id,
    slug,
    locale: 'en',
    status: 'published',
    version: 1,
    updatedAt: '2026-10-25T00:00:00.000Z',
    liveRevisionId: `${id}R`,
    draftRevisionId: null,
    translationGroup: id,
    data
  })
  const site = {
    _source: 'test',
    artifact: null,
    served: ['en'],
    menus: [],
    terms: [],
    settings: { title: 'Base' },
    collections: [
      { slug: 'home', urlPattern: '/' },
      { slug: 'pricing', urlPattern: '/pricing' },
      { slug: 'landing', urlPattern: '/landing' },
      { slug: 'posts', urlPattern: '/blog/{slug}' },
      { slug: 'site', urlPattern: null }
    ],
    rows: [
      row('home', 'home', '01M50ZVKBWPMA7W64Y1PA8MZX1', { title: 'Home', tiers: [{ price: '$24' }] }),
      row('pricing', 'pricing', '01M50ZVKBWPMA7W64Y1PA8MZX2', {
        title: 'Pricing',
        tiers: [{ price: '$24' }]
      }),
      row('landing', 'landing', '01M50ZVKBWPMA7W64Y1PA8MZX3', {
        title: 'Landing',
        tiers: [{ price: '$24' }]
      }),
      row('posts', 'first-post', '01M50ZVKBWPMA7W64Y1PA8MZX4', {
        title: 'First post',
        excerpt: 'Lorem ipsum dolor sit amet consectetur'
      }),
      row('landing', 'landing-two', '01M50ZVKBWPMA7W64Y1PA8MZX5', {
        title: 'Landing two',
        excerpt: 'Lorem ipsum dolor sit amet consectetur'
      }),
      row('site', 'site', '01M50ZVKBWPMA7W64Y1PA8MZX6', { title: 'Site', note: 'Made with care in Lisbon' })
    ]
  }
  const pages = {
    '/': '<html lang="en"><body><main><h1>Home</h1><p>$24</p><article><a href="/blog/first-post">First post</a><p>Lorem ipsum dolor sit amet consectetur</p></article><p>Made with care in Lisbon</p></main></body></html>'
  }
  const pageHtml = async (path) => ({ ok: true, status: 200, html: pages[path] })
  const ids = (r) => r.writes.map((w) => w.args?.id ?? w.params?.id ?? w.id)
  const price = await run(
    { find: '$24', replace: 'Menu item', path: '/', all: 'page', expect: 1 },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(price.out.ok, true, JSON.stringify(price.out).slice(0, 300))
  assert.deepEqual(ids(price), ['01M50ZVKBWPMA7W64Y1PA8MZX1'])
  const excerpt = await run(
    {
      find: 'Lorem ipsum dolor sit amet consectetur',
      replace: 'Menu item',
      path: '/',
      all: 'page',
      expect: 1
    },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(excerpt.out.ok, true, JSON.stringify(excerpt.out).slice(0, 300))
  assert.deepEqual(ids(excerpt), ['01M50ZVKBWPMA7W64Y1PA8MZX4'])
  // A collection with no page of its own (the site's chrome) is still found by presence.
  const note = await run(
    { find: 'Made with care in Lisbon', replace: 'Menu item', path: '/', all: 'page', expect: 1 },
    { emdash: createFakeEmdash(site), artifact: null, pageHtml }
  )
  assert.equal(note.out.ok, true, JSON.stringify(note.out).slice(0, 300))
  assert.deepEqual(ids(note), ['01M50ZVKBWPMA7W64Y1PA8MZX6'])
})
