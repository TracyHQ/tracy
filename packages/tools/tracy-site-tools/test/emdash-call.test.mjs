/** One `tracy_emdash` call through `runEmdashTool`, with the site faked at the one seam the host */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  confirmKey,
  createEmdashState,
  mergeListPatches,
  reuseRemovedRowIds,
  runEmdashTool
} from '../src/host/emdash-call.mjs'
import { EMDASH_DESTRUCTIVE_TOOLS } from '../src/host/emdash.mjs'
import { withNext } from '../src/host/site.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const BUSINESS = JSON.parse(
  readFileSync(new URL('./fixtures/emdash/business-en.json', import.meta.url), 'utf8')
)
const A = BUSINESS.answers
const HOME_ID = '01M36TA83763RSVSN5R28DZ0AZ'
const SITE = { label: 'ed-ivj9ni' }
const ARTIFACT = { cms: { name: 'emdash' }, locales: { default: 'en' } }

/** EmDash's answer as the exec chain hands it back: the text part is EmDash's pretty JSON. */
const answer = (data) => ({
  ok: true,
  result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
})
const failed = (error) => ({ ok: false, code: 'TOOL_FAILED', error })

/** The published `site` rows of a site serving these locales. */
const siteRows = (locales) => ({
  items: locales.map((locale, i) => ({
    ...A.siteGet.item,
    id: `01M36TA5254KTX8AKZQMK4BZ${String(i).padStart(2, '0')}`,
    locale
  }))
})

/** A fake site. */
function fakeSite({ served = ['en'], on = {} } = {}) {
  /** @type {Array<{ name: string, arguments: Record<string, unknown> } | { list: true }>} */
  const calls = []
  const state = { served }
  const mcp = async (request) => {
    if (request.method === 'tools/list') {
      calls.push({ list: true })
      // tools/list answers the catalogue itself as the result, not as a text part.
      return { ok: true, result: BUSINESS.toolsList }
    }
    const { name, arguments: args } = request.params
    calls.push({ name, arguments: args })
    const n = calls.filter((c) => c.name === name).length
    const own = on[name]?.(args, n)
    if (own !== undefined) return own
    if (name === 'content_list' && args.collection === 'site' && args.status === 'published')
      return answer(siteRows(state.served))
    if (name === 'content_get') return answer(A.homeGet)
    if (name === 'content_list') return answer({ items: [A.homeGet.item] })
    if (name === 'content_update')
      return answer(args.status === 'published' ? A.homePublish : A.homeStagedUpdate)
    if (name === 'content_publish') return answer(A.homePublish)
    if (name === 'menu_get') return answer(A.menuPrimary)
    return answer({ ok: true })
  }
  const names = () => calls.map((c) => ('list' in c ? '{list}' : c.name))
  return { mcp, calls, names, state }
}

function fakeMemory() {
  let seq = 0
  const asked = new Map()
  const answered = new Map()
  let turn = 1
  return {
    confirmAsked(sessionId, key) {
      asked.set(`${sessionId}\0${key}`, ++seq)
    },
    confirmed(sessionId, key) {
      const at = asked.get(`${sessionId}\0${key}`)
      const yes = at !== undefined && (answered.get(sessionId) ?? 0) > at
      if (yes) asked.delete(`${sessionId}\0${key}`)
      return yes
    },
    /** What the host feeds: an ask_user_question result or a new user message. */
    customerAnswered(sessionId) {
      answered.set(sessionId, ++seq)
    },
    turnOf() {
      return turn
    },
    nextTurn() {
      turn += 1
    }
  }
}

const run = (site, args, extra = {}) =>
  runEmdashTool({
    args,
    site: SITE,
    artifact: ARTIFACT,
    mcp: site.mcp,
    state: extra.state ?? createEmdashState(),
    sessionId: 'session-a',
    turn: 1,
    sleep: async () => {},
    ...extra
  })

/**
 * A write the customer confirms first (`consequence.mjs`: an entry off the site, the menu, the
 * settings): the door asks, the customer answers its own question yes, the same call goes again with
 * confirm:true. A call refused before the question (its form, its language) is answered as it was.
 */
async function runAgreed(site, args, extra = {}) {
  const memory = extra.memory ?? fakeMemory()
  const ctx = { ...extra, memory }
  const asked = await run(site, args, ctx)
  if (asked.code !== 'CONFIRM_FIRST') return asked
  const [q] = asked.ask.questions
  memory.customerAnswered('session-a', asked.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] })
  return run(site, { ...args, confirm: true }, ctx)
}

/** Tools that only read; anything else the site was sent changes it. */
const READ_TOOLS = new Set([
  'content_get',
  'content_list',
  'content_translations',
  'menu_get',
  'menu_list',
  'schema_get_collection',
  'schema_list_collections',
  'taxonomy_list_terms',
  'search'
])
/** What the site was asked to change, in order — reads are not behaviour, writes are. */
const writesOf = (site) => site.calls.filter((c) => c.name !== undefined && !READ_TOOLS.has(c.name))
/** How many times the served locales (the published `site` rows) were read. */
const servedReads = (site) =>
  site.calls.filter((c) => c.name === 'content_list' && c.arguments.collection === 'site').length
const HOME_GET = { tool: 'content_get', arguments: { collection: 'home', id: 'home' } }

test('content_get with no locale: the served locale is filled and said, and the read is scoped to it', async () => {
  const site = fakeSite()

  const out = await run(site, HOME_GET)

  assert.equal(out.ok, true)
  assert.deepEqual(out.locale, { filled: 'en' })
  assert.equal(out.result.item._rev, A.homeGet._rev)
  assert.deepEqual(out.result.item.data, A.homeGet.item.data)
  assert.equal(site.calls.find((c) => c.name === 'content_get').arguments.locale, 'en')
})

test('the served locale is remembered: a second read within ten minutes makes no second served-locale read', async () => {
  const site = fakeSite()
  const state = createEmdashState()
  await run(site, HOME_GET, { state })

  await run(site, { tool: 'content_list', arguments: { collection: 'home' } }, { state })

  assert.equal(servedReads(site), 1)
  assert.equal(
    site.calls.findLast((c) => c.name === 'content_list' && c.arguments.collection === 'home').arguments
      .locale,
    'en'
  )
})

test("allLocales keeps EmDash's native call on a read, and is refused on a write before any exec", async () => {
  const site = fakeSite()
  const out = await run(site, { tool: 'content_list', allLocales: true, arguments: { collection: 'home' } })
  assert.equal(out.ok, true)
  assert.deepEqual(site.calls, [{ name: 'content_list', arguments: { collection: 'home' } }])
  assert.equal(out.locale, undefined)
  const write = fakeSite()
  const refused = await run(write, {
    tool: 'content_update',
    allLocales: true,
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: {} }
  })
  assert.equal(refused.code, 'EMDASH_LOCALE_REQUIRED')
  assert.deepEqual(write.calls, [])
})

{
  const cases = [
    { served: ['en'], locale: { filled: 'en' } },
    { served: ['en', 'vi'], locale: { filled: 'en', languages: 2 } }
  ]
  for (const { served, locale } of cases)
    test(`content_publish by slug: the default language’s ULID is published, and the answer says how many languages the site serves: ${rowName(served)}`, async () => {
      const site = fakeSite({ served })

      const out = await run(site, {
        tool: 'content_publish',
        arguments: { collection: 'home', id: 'home', _rev: 'r' }
      })

      const label = served.join(',')
      assert.equal(out.ok, true, label)
      assert.deepEqual(
        writesOf(site),
        [{ name: 'content_publish', arguments: { collection: 'home', id: HOME_ID, _rev: 'r' } }],
        label
      )
      assert.deepEqual(out.locale, locale, label)
      assert.ok(out.normalized.includes(`id home@en is ${HOME_ID}`), label)
      assert.equal(out.result.live, true, label)
    })
}

test('content_publish by slug on a site whose default language is not served is refused before anything is written', async () => {
  // The template's default `en` has no published `site` row: a slug names no language this site shows.
  const site = fakeSite({ served: ['de', 'vi'] })
  const out = await run(site, {
    tool: 'content_publish',
    arguments: { collection: 'home', id: 'home', _rev: 'r' }
  })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'EMDASH_ULID_REQUIRED')
  assert.deepEqual(writesOf(site), [])
  // The same call with the row's ULID goes through.
  const ok = await run(site, {
    tool: 'content_publish',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r' }
  })
  assert.equal(ok.ok, true)
})

const STAND_40 = [
  'uk',
  'tr',
  'th',
  'ta',
  'sv',
  'sr',
  'sl',
  'sk',
  'ro',
  'pt',
  'pl',
  'nl',
  'ms',
  'lv',
  'lt',
  'ko',
  'ja',
  'it',
  'id',
  'hu',
  'hr',
  'hi',
  'he',
  'fr',
  'fi',
  'fa',
  'et',
  'es',
  'el',
  'de',
  'da',
  'cs',
  'ca',
  'bn',
  'bg',
  'ar',
  'af',
  'vi',
  'ru',
  'en'
]

test('on a site serving 40 languages, a read echoes the count, and a slug write is filled with the default — never refused', async () => {
  const site = fakeSite({ served: STAND_40 })
  const state = createEmdashState()
  const read = await run(
    site,
    { tool: 'content_get', arguments: { collection: 'site', id: 'site' } },
    { state }
  )
  assert.deepEqual(read.locale, { filled: 'en', languages: 40 })
  assert.doesNotMatch(JSON.stringify(read.locale), /"uk"|"vi"|served/)
  const write = await run(
    site,
    {
      tool: 'content_update',
      arguments: {
        collection: 'site',
        id: 'site',
        _rev: A.homeGet._rev,
        data: { address: 'Vorsino industrial park, Kaluga region' },
        status: 'published'
      }
    },
    { state }
  )
  assert.equal(write.ok, true, JSON.stringify(write).slice(0, 300))
  assert.deepEqual(write.locale, { filled: 'en', languages: 40 })
  const sent = site.calls.find((c) => c.name === 'content_update')
  assert.equal(sent?.arguments.locale, 'en', 'the locale sent is explicit: a slug never lands on `af`')
})

/** The `site` collection in three published languages and a draft one, served en/vi/ru */
function languagesSite() {
  const ids = {
    en: '01M36TA5254KTX8AKZQMK4BZD0',
    vi: '01M36TA5254KTX8AKZQMK4BZV1',
    ru: '01M36TA5254KTX8AKZQMK4BZR2',
    de: '01M36TA5254KTX8AKZQMK4BZE3'
  }
  const localeOf = (id) => Object.keys(ids).find((l) => ids[l] === id)
  const translations = [
    ...['en', 'vi', 'ru'].map((l) => ({
      id: ids[l],
      locale: l,
      slug: 'site',
      status: 'published',
      updatedAt: A.siteGet.item.updatedAt
    })),
    { id: ids.de, locale: 'de', slug: 'site', status: 'draft', updatedAt: A.siteGet.item.updatedAt }
  ]
  const entry = (id, data = {}) => ({
    ...A.siteGet.item,
    id,
    locale: localeOf(id),
    data: { ...A.siteGet.item.data, ...data }
  })
  const site = fakeSite({
    served: ['vi', 'ru', 'en'],
    on: {
      content_translations: () => answer({ translationGroup: ids.en, translations }),
      content_get: (args) =>
        args.collection === 'site'
          ? answer({
              item: entry(args.id === 'site' ? ids[String(args.locale)] : String(args.id)),
              _rev: A.siteGet._rev
            })
          : undefined,
      content_update: (args) =>
        args.collection === 'site'
          ? answer({ item: entry(String(args.id), args.data), _rev: A.siteGet._rev })
          : undefined
    }
  })
  const listSlug = { tool: 'content_translations', arguments: { collection: 'site', id: 'site' } }
  return { ids, localeOf, site, state: createEmdashState(), listSlug }
}

test('a fact in every language: the languages are listed once, from the slug resolved in the default, and the draft language is not one to write', async () => {
  const { ids, site, state, listSlug } = languagesSite()

  const listed = await run(site, listSlug, { state })

  assert.equal(listed.ok, true, JSON.stringify(listed).slice(0, 300))
  assert.deepEqual(listed.locale, { filled: 'en', languages: 3 })
  assert.deepEqual(site.calls.find((c) => c.name === 'content_translations').arguments, {
    collection: 'site',
    id: ids.en
  })
  assert.deepEqual(
    listed.result.translations.filter((t) => t.status === 'published').map((t) => t.locale),
    ['en', 'vi', 'ru']
  )
})

test('a fact in every language is read and written by id: no fill, no refusal, no locale sent, no served-locale read beyond the slug’s', async () => {
  const { ids, localeOf, site, state, listSlug } = languagesSite()
  const listed = await run(site, listSlug, { state })
  const published = listed.result.translations.filter((t) => t.status === 'published')
  const reads = await Promise.all(
    published.map((t) =>
      run(site, { tool: 'content_get', arguments: { collection: 'site', id: t.id } }, { state })
    )
  )
  assert.ok(
    reads.every((r) => r.ok && r.locale === undefined),
    'a ULID was never in doubt'
  )

  for (const [i, t] of published.entries()) {
    const written = await run(
      site,
      {
        tool: 'content_update',
        arguments: {
          collection: 'site',
          id: t.id,
          _rev: reads[i].result.item._rev,
          data: { hotline: '8 800 000-00-00' },
          status: 'published'
        }
      },
      { state }
    )

    assert.equal(written.ok, true, JSON.stringify(written).slice(0, 300))
    assert.equal(written.result.entry.locale, t.locale)
    assert.deepEqual(written.result.changed.hotline, {
      before: A.siteGet.item.data.hotline,
      after: '8 800 000-00-00'
    })
  }
  assert.deepEqual(
    writesOf(site).map((c) => localeOf(c.arguments.id)),
    ['en', 'vi', 'ru']
  )
  assert.ok(writesOf(site).every((c) => !Object.hasOwn(c.arguments, 'locale')))
  assert.equal(ids.en, published[0].id)
  assert.equal(servedReads(site), 1, 'the one served read was the slug’s')
})

test('the words half of the rule: a write by slug reaches the filled language, once', async () => {
  const { site, state } = languagesSite()

  await run(
    site,
    {
      tool: 'content_update',
      arguments: {
        collection: 'site',
        id: 'site',
        _rev: A.siteGet._rev,
        data: { footer_text: 'Built to fit.' },
        status: 'published'
      }
    },
    { state }
  )

  assert.deepEqual(
    writesOf(site).map((c) => c.arguments.locale),
    ['en']
  )
})

test('content_update writes once and answers the receipt — no read-back', async () => {
  const site = fakeSite()

  const out = await run(site, {
    tool: 'content_update',
    arguments: {
      collection: 'home',
      id: HOME_ID,
      _rev: A.homeGet._rev,
      data: { hero_title_a: 'Built for the way', hero_title_b: 'you work' },
      status: 'published'
    }
  })

  assert.equal(out.ok, true)
  assert.equal(writesOf(site).length, 1)
  assert.equal(out.result.live, true)
  assert.deepEqual(out.result.changed.hero_title_a, {
    before: 'Furniture built to fit',
    after: 'Built for the way'
  })
  assert.equal(out.locale, undefined, 'a ULID was never in doubt: nothing to echo')
  assert.ok(JSON.stringify(out).length <= 3200)
})

{
  for (const tool of ['content_unpublish', 'content_discard_draft'])
    test(`a missing _rev is refused before the read and before the write, where the write makes no read: ${rowName(tool)}`, async () => {
      const site = fakeSite()
      const out = await run(site, { tool, arguments: { collection: 'home', id: HOME_ID, data: {} } })
      assert.equal(out.code, 'REV_MISSING', tool)
      assert.deepEqual(site.calls, [], tool)
    })
}

{
  for (const tool of ['content_update', 'content_publish'])
    test(`content_update and content_publish without _rev write with the token their own read answered: ${rowName(tool)}`, async () => {
      const site = fakeSite()

      const out = await run(site, {
        tool,
        arguments: {
          collection: 'home',
          id: HOME_ID,
          data: { hero_title_a: 'Built for the way' },
          status: 'published'
        }
      })

      assert.equal(out.ok, true, tool)
      assert.deepEqual(
        writesOf(site).map((c) => [c.name, c.arguments._rev]),
        [[tool, A.homeGet._rev]],
        `${tool}: one write, no refusal`
      )
    })
}

test('a read that answers no token leaves nothing to write with — REV_MISSING, nothing written', async () => {
  const site = fakeSite({ on: { content_get: () => answer({ item: A.homeGet.item }) } })

  const out = await run(site, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, data: {} }
  })

  assert.equal(out.code, 'REV_MISSING')
  assert.deepEqual(writesOf(site), [])
})

test('a token the model sends is used as sent', async () => {
  const site = fakeSite()

  await run(site, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: A.homeGet._rev, data: {}, status: 'published' }
  })

  assert.equal(writesOf(site)[0].arguments._rev, A.homeGet._rev)
})

{
  const cases = [
    {
      label: 'content_update published',
      on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: A.homeStagedUpdate._rev }) },
      call: {
        tool: 'content_update',
        arguments: {
          collection: 'home',
          id: HOME_ID,
          _rev: 'r',
          data: { hero_text: 'x' },
          status: 'published'
        }
      },
      fields: ['hero_title_a', 'hero_title_b']
    },
    {
      label: 'content_publish',
      on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: 'r' }) },
      call: { tool: 'content_publish', arguments: { collection: 'home', id: HOME_ID, _rev: 'r' } },
      fields: undefined
    }
  ]
  for (const { label, on, call, fields } of cases)
    test(`publishing over somebody else's draft is refused and nothing is written: ${label}`, async () => {
      const site = fakeSite({ on })

      const out = await run(site, call)

      assert.equal(out.code, 'PENDING_DRAFT', label)
      if (fields) assert.deepEqual(out.draftFields, fields, label)
      assert.deepEqual(writesOf(site), [], label)
    })
}

/** A home entry that holds a waiting change once anything has been written to it without `status`. */
function stagingSite() {
  let drafted = false
  return fakeSite({
    on: {
      content_get: () =>
        drafted ? answer({ item: A.homeStagedUpdate.item, _rev: A.homeStagedUpdate._rev }) : undefined,
      content_update: (args) => {
        if (args.status === undefined) drafted = true
        return undefined
      }
    }
  })
}
const stageDraft = {
  tool: 'content_update',
  arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_title_a: 'Built for the way' } }
}
const publishStaged = {
  tool: 'content_update',
  arguments: { collection: 'home', id: HOME_ID, _rev: 'r', status: 'published' }
}

test('a draft this conversation staged may be published by it', async () => {
  const site = stagingSite()
  const state = createEmdashState()
  const staged = await run(site, stageDraft, { state })
  assert.equal(staged.result.live, false)
  assert.match(staged.result.next, /^Staged as a draft/)

  const own = await run(site, publishStaged, { state })

  assert.equal(own.ok, true)
  assert.equal(own.result.live, true)
})

test('a draft one conversation staged is refused PENDING_DRAFT to any other conversation', async () => {
  const site = stagingSite()
  const state = createEmdashState()
  await run(site, stageDraft, { state })

  const other = await run(site, publishStaged, { state, sessionId: 'session-b' })

  assert.equal(other.code, 'PENDING_DRAFT')
})

test("a no-status change merged onto somebody else's draft answers mixed, with the fields that were waiting", async () => {
  const site = fakeSite({ on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: 'r' }) } })
  const out = await run(site, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_text: 'New text' } }
  })
  assert.equal(out.ok, true)
  assert.deepEqual(out.result.mixed, { draftFields: ['hero_title_a', 'hero_title_b'] })
})

test('status:"draft" on a live entry is refused WOULD_UNPUBLISH; a never-published entry is not someone\'s draft', async () => {
  const site = fakeSite()
  const off = await run(site, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_text: 'x' }, status: 'draft' }
  })
  assert.equal(off.code, 'WOULD_UNPUBLISH')
  assert.deepEqual(writesOf(site), [])
  const inv = A.investorsGet.item
  const never = fakeSite({
    on: {
      content_get: () => answer(A.investorsGet),
      content_update: () =>
        answer({
          item: {
            ...inv,
            status: 'published',
            liveRevisionId: inv.draftRevisionId,
            draftRevisionId: null,
            version: 5
          },
          _rev: 'next'
        })
    }
  })
  const out = await run(never, {
    tool: 'content_update',
    arguments: {
      collection: 'investors',
      id: inv.id,
      _rev: A.investorsGet._rev,
      data: { title: 'Investors' },
      status: 'published'
    }
  })
  assert.equal(out.ok, true)
  assert.equal(out.result.note, 'This entry was not published before; it is live now.')
})

test("a refused EmDash call carries EmDash's class, the tool and the collection — and is not repeated", async () => {
  const site = fakeSite({
    on: { content_publish: () => failed('[CONFLICT] Content changed while the operation was in progress') }
  })
  const out = await run(site, {
    tool: 'content_publish',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r' }
  })
  assert.deepEqual(
    { ok: out.ok, code: out.code, emdash: out.emdash, tool: out.tool, collection: out.collection },
    { ok: false, code: 'TOOL_FAILED', emdash: 'CONFLICT', tool: 'content_publish', collection: 'home' }
  )
  assert.equal(out.next, undefined, 'refusalNext writes it (D1)')
  assert.equal(site.names().filter((n) => n === 'content_publish').length, 1)
  const menu = fakeSite({ on: { menu_get: () => failed("[NOT_FOUND] Menu 'main' not found") } })
  const nf = await run(menu, { tool: 'menu_get', arguments: { name: 'main' } })
  assert.equal(nf.emdash, 'NOT_FOUND')
  assert.equal(nf.tool, 'menu_get')
})

{
  const unanswered = [
    { ok: false, code: 'SITE_UNREACHABLE', error: 'exec failed' },
    { ok: false, code: 'NOT_MCP', error: 'not JSON-RPC' },
    { ok: false, code: 'SITE_REFUSED', error: 'ed-ivj9ni (EmDash MCP) → HTTP 502: Bad Gateway' },
    { ok: false, code: 'SITE_REFUSED', httpStatus: 503, error: 'down' }
  ]
  for (const first of unanswered)
    test(`a read the site did not answer is asked once more after 1 s: ${rowName(first)}`, async () => {
      const slept = []
      const site = fakeSite({ on: { menu_get: (_a, n) => (n === 1 ? first : undefined) } })

      const out = await run(
        site,
        { tool: 'menu_get', arguments: { name: 'primary', locale: 'en' } },
        { sleep: async (ms) => void slept.push(ms) }
      )

      assert.equal(out.ok, true, first.code)
      assert.deepEqual(slept, [1000], first.code)
      assert.equal(site.names().filter((n) => n === 'menu_get').length, 2, first.code)
      assert.ok(
        out.normalized.some((n) => /read again once/.test(n)),
        first.code
      )
    })
}

{
  const answers = [
    { ok: false, code: 'SITE_REFUSED', error: 'ed-ivj9ni (EmDash MCP) → HTTP 404: no' },
    failed('[NOT_FOUND] Menu'),
    { ok: false, code: 'NO_TOKEN', label: 'ed-ivj9ni', error: 'no token' }
  ]
  for (const first of answers)
    test(`an answer that is not a failure to answer — a 4xx, an EmDash refusal, a missing token — is never asked twice: ${rowName(first)}`, async () => {
      const site = fakeSite({ on: { menu_get: () => first } })

      const out = await run(site, { tool: 'menu_get', arguments: { name: 'primary', locale: 'en' } })

      assert.equal(out.ok, false)
      assert.equal(site.names().filter((n) => n === 'menu_get').length, 1, first.code)
    })
}

test('a write that may have landed is never sent twice', async () => {
  const slept = []
  const site = fakeSite({
    on: { settings_update: () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'timed out' }) }
  })

  const out = await runAgreed(
    site,
    { tool: 'settings_update', arguments: { title: 'x' } },
    { sleep: async (ms) => void slept.push(ms) }
  )

  assert.equal(out.code, 'SITE_UNREACHABLE')
  assert.deepEqual(slept, [])
  assert.equal(writesOf(site).length, 1)
})

/** A site that served one language and was read once (the memo says `en`), through a conversation with memory. */
async function memoisedOneLanguage() {
  const site = fakeSite({ served: ['en'] })
  const state = createEmdashState()
  const memory = fakeMemory()
  const ctx = { state, memory, turn: undefined }
  const read = await run(site, HOME_GET, ctx)
  assert.deepEqual(read.locale, { filled: 'en' })
  return { site, ctx }
}
const titleWrite = {
  tool: 'content_update',
  arguments: { collection: 'home', id: 'home', _rev: 'r', data: { title: 'x' } }
}

test('after a second language goes live through this door, a slug-only write is judged on the languages served now', async () => {
  const { site, ctx } = await memoisedOneLanguage()
  site.state.served = ['en', 'vi']
  await run(
    site,
    {
      tool: 'content_publish',
      arguments: { collection: 'site', id: '01M36TA5254KTX8AKZQMK4BZ01', _rev: 'r' }
    },
    ctx
  )

  const write = await run(site, titleWrite, ctx)

  assert.equal(write.ok, true)
  assert.deepEqual(write.locale, { filled: 'en', languages: 2 }, 'read again: the memo said one language')
})

test('after the default language goes offline through this door, a slug-only write is refused and nothing is written', async () => {
  const { site, ctx } = await memoisedOneLanguage()
  site.state.served = ['de', 'vi']
  await run(
    site,
    {
      tool: 'content_unpublish',
      arguments: { collection: 'site', id: '01M36TA5254KTX8AKZQMK4BZ00', _rev: 'r' }
    },
    ctx
  )
  const before = writesOf(site).length

  const refused = await run(site, titleWrite, ctx)

  assert.equal(refused.code, 'EMDASH_LOCALE_REQUIRED')
  assert.deepEqual(refused.served, ['de', 'vi'])
  assert.equal(writesOf(site).length, before, 'nothing was written')
})

/** A memo made in turn 1, after which someone changed the languages in the admin (nothing through this door dropped it). */
async function staleMemoInTurn2() {
  const site = fakeSite({ served: ['en'] })
  const state = createEmdashState()
  await run(site, HOME_GET, { state, turn: 1 })
  site.state.served = ['de', 'vi']
  return { site, state }
}

test('a read in a later turn may use the memo — a wrong fill on a read is echoed and changes nothing', async () => {
  const { site, state } = await staleMemoInTurn2()

  const read = await run(site, HOME_GET, { state, turn: 2 })

  assert.deepEqual(read.locale, { filled: 'en' })
  assert.equal(servedReads(site), 1)
})

test('a write in a later turn recomputes the memo first and is refused on what the site serves now', async () => {
  const { site, state } = await staleMemoInTurn2()

  const write = await run(
    site,
    { tool: 'content_update', arguments: { collection: 'home', id: 'home', _rev: 'r', data: {} } },
    { state, turn: 2 }
  )

  assert.equal(write.code, 'EMDASH_LOCALE_REQUIRED')
  assert.equal(servedReads(site), 2)
})

test('the next memo-dependent write of the same turn trusts the recomputed memo', async () => {
  const { site, state } = await staleMemoInTurn2()
  await run(
    site,
    { tool: 'content_update', arguments: { collection: 'home', id: 'home', _rev: 'r', data: {} } },
    { state, turn: 2 }
  )
  site.state.served = ['en']

  await run(site, { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } }, { state, turn: 2 })

  assert.equal(servedReads(site), 2)
})

test("a create, a translationOf write and a write to `site` drop the memo; hostDrop is the host's handle", async () => {
  const state = createEmdashState()
  state.rememberServed('x', ['en'])
  state.dropServedLocales('x')
  assert.equal(state.servedFor('x'), undefined)
})

{
  for (const call of [
    { tool: 'content_create', arguments: { collection: 'posts', data: {} } },
    { tool: 'menu_create', arguments: { name: 'x', label: 'X', locale: 'vi', translationOf: 'M' } },
    { tool: 'content_unpublish', arguments: { collection: 'site', id: HOME_ID, _rev: 'r' } }
  ])
    test(`a create, a translationOf write and a write to \`site\` drop the memo; hostDrop is the host's handle: ${rowName(call)}`, async () => {
      const site = fakeSite()
      const state = createEmdashState()
      await run(site, { tool: 'content_list', arguments: { collection: 'home' } }, { state })
      assert.deepEqual(state.servedFor(SITE.label), ['en'])
      await runAgreed(site, call, { state })
      assert.equal(state.servedFor(SITE.label), undefined, call.tool)
    })
}

{
  const refusals = [
    "[NOT_FOUND] Collection 'site' not found",
    "[COLLECTION_NOT_FOUND] Collection 'site' not found"
  ]
  const writes = [
    {
      label: 'the skill’s menu road',
      call: { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } },
      sent: { name: 'menu_set_items', arguments: { name: 'primary', items: [] } }
    },
    {
      label: 'a slug update',
      call: { tool: 'content_update', arguments: { collection: 'pages', id: 'about', _rev: 'r', data: {} } },
      sent: { name: 'content_update', arguments: { collection: 'pages', id: 'about', _rev: 'r', data: {} } }
    },
    {
      label: 'a slug publish',
      call: { tool: 'content_publish', arguments: { collection: 'pages', id: 'about', _rev: 'r' } },
      sent: { name: 'content_publish', arguments: { collection: 'pages', id: 'about', _rev: 'r' } }
    }
  ]
  for (const refusal of refusals)
    test(`a template with no \`site\` collection and no declared languages is unscoped — reads get the default, writes go as written: ${rowName(refusal)}`, async () => {
      const noSite = () =>
        fakeSite({
          on: { content_list: (args) => (args.collection === 'site' ? failed(refusal) : undefined) }
        })
      const read = await run(noSite(), { tool: 'content_list', arguments: { collection: 'posts' } })
      assert.deepEqual(read.locale, { filled: 'en' }, `${refusal}: reads get the template default`)
      for (const { label, call, sent } of writes) {
        const site = noSite()

        const out = await runAgreed(site, call)

        assert.equal(out.ok, true, `${refusal} ${label}`)
        assert.deepEqual(writesOf(site), [sent], `${refusal} ${label}: reaches EmDash as the model wrote it`)
      }
    })
}

test('a template fact is remembered — read once for the reads, and once before the turn’s first write', async () => {
  const site = fakeSite({
    on: {
      content_list: (args) =>
        args.collection === 'site' ? failed("[NOT_FOUND] Collection 'site' not found") : undefined
    }
  })
  const state = createEmdashState()
  await run(site, { tool: 'content_list', arguments: { collection: 'posts' } }, { state })

  await run(site, { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } }, { state })
  await run(
    site,
    { tool: 'content_publish', arguments: { collection: 'pages', id: 'about', _rev: 'r' } },
    { state }
  )

  assert.equal(servedReads(site), 2)
})

{
  const cases = [
    {
      label: 'one language',
      locales: { default: 'en', all: ['en'], prefixed: [] },
      expect: { locale: 'en' }
    },
    {
      label: 'several, the default among them',
      locales: { default: 'en', all: ['en', 'vi'], prefixed: ['vi'] },
      expect: { locale: 'en' }
    },
    {
      label: 'several without the default',
      locales: { default: 'en', all: ['de', 'vi'], prefixed: ['vi'] },
      expect: { code: 'EMDASH_LOCALE_REQUIRED', served: ['de', 'vi'] }
    }
  ]
  for (const { label, locales, expect } of cases)
    test(`no \`site\` collection — the languages the template declares decide: one is filled, the default is filled, several without it are refused: ${label}`, async () => {
      const site = fakeSite({
        on: {
          content_list: (args) =>
            args.collection === 'site'
              ? failed("[COLLECTION_NOT_FOUND] Collection 'site' not found")
              : undefined
        }
      })

      const out = await runAgreed(
        site,
        { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } },
        { artifact: { locales } }
      )

      if (expect.locale) {
        assert.equal(out.ok, true, label)
        assert.equal(writesOf(site).at(-1).arguments.locale, expect.locale, label)
      } else {
        assert.deepEqual([out.code, out.served], [expect.code, expect.served], label)
        assert.deepEqual(writesOf(site), [], label)
      }
    })
}

test('a served read EmDash refused for another reason is unknown — reads get the default, writes are refused, nothing is remembered', async () => {
  const site = fakeSite({
    on: {
      content_list: (args) =>
        args.collection === 'site' ? failed('[INTERNAL_ERROR] database is locked') : undefined
    }
  })
  const state = createEmdashState()
  const read = await run(site, { tool: 'content_list', arguments: { collection: 'home' } }, { state })

  const write = await run(
    site,
    { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } },
    { state }
  )

  assert.deepEqual(read.locale, { filled: 'en' })
  assert.equal(write.code, 'EMDASH_LOCALE_REQUIRED')
  assert.equal(
    write.languages,
    'unread',
    'said as what it is, so the next claims nothing about the languages'
  )
  assert.equal(write.served, undefined)
  assert.match(write.error, /could not be read/)
  assert.equal(state.servedFor(SITE.label), undefined, 'a failure is not a template fact')
  assert.equal(servedReads(site), 2)
})

test('a site that cannot be reached answers that, not a locale question', async () => {
  const down = fakeSite({
    on: { content_list: () => ({ ok: false, code: 'NO_TOKEN', label: 'ed-ivj9ni', error: 'no token' }) }
  })

  const out = await run(down, HOME_GET)

  assert.deepEqual([out.code, out.tool], ['NO_TOKEN', 'content_get'])
})

{
  for (const tool of EMDASH_DESTRUCTIVE_TOOLS)
    test(`each of the ten destructive tools asks first, with no exec: ${rowName(tool)}`, async () => {
      const site = fakeSite()
      const out = await run(
        site,
        {
          tool,
          arguments: {
            collection: 'posts',
            id: HOME_ID,
            slug: 'posts',
            fieldSlug: 'f',
            name: 'n',
            taxonomy: 't',
            termSlug: 's',
            _rev: 'r'
          }
        },
        { memory: fakeMemory() }
      )
      assert.equal(out.code, 'CONFIRM_FIRST', tool)
      assert.equal(typeof out.target, 'string')
      assert.ok(out.error.length <= 160)
      assert.deepEqual(writesOf(site), [], `${tool}: nothing is removed before the customer answers`)
    })
}

const deletePost = { tool: 'content_delete', arguments: { collection: 'posts', id: HOME_ID } }

test('a confirmed media_delete with storageDeleted:true reports file removal without claiming the public URL was revoked', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ on: { media_delete: () => answer({ deleted: true, storageDeleted: true }) } })
  const del = { tool: 'media_delete', arguments: { id: '01MEDIAGONE' } }

  const asked = await run(site, del, { memory })
  memory.customerAnswered('session-a')
  const removed = await run(site, { ...del, confirm: true }, { memory })

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.match(removed.next, /media library.*stored file/i)
  assert.match(removed.next, /page references remain/i)
  assert.match(removed.next, /cached public URL/i)
  assert.match(removed.next, /no .*purge|does not purge/i)
  assert.match(removed.next, /Do not claim the URL is revoked or unreachable/i)
})

test('a confirmed media_delete with storageDeleted:false says the stored file may remain and still serve', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ on: { media_delete: () => answer({ deleted: true, storageDeleted: false }) } })
  const del = { tool: 'media_delete', arguments: { id: '01MEDIAGONE' } }

  const asked = await run(site, del, { memory })
  memory.customerAnswered('session-a')
  const removed = await run(site, { ...del, confirm: true }, { memory })

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.match(removed.next, /media library record/i)
  assert.match(removed.next, /stored file was not confirmed removed and may remain/i)
  assert.match(removed.next, /may remain.*still be served from origin/i)
  assert.match(removed.next, /cached public URL/i)
  assert.match(removed.next, /Do not claim the file or URL is gone/i)
  assert.doesNotMatch(removed.next, /Deleted the media library record and stored file/i)
})

test('a destructive call asks first, and confirm:true without the customer’s answer is still a question', async () => {
  const memory = fakeMemory()
  const site = fakeSite()

  const asked = await run(site, deletePost, { memory })
  const confirmed = await run(site, { ...deletePost, confirm: true }, { memory })

  assert.deepEqual([asked.code, confirmed.code], ['CONFIRM_FIRST', 'CONFIRM_FIRST'])
  assert.deepEqual(writesOf(site), [])
})

{
  const cases = [
    { label: 'beside the tool', call: { ...deletePost, confirm: true } },
    {
      label: 'inside arguments',
      call: { tool: 'content_delete', arguments: { collection: 'posts', id: HOME_ID, confirm: true } }
    }
  ]
  for (const { label, call } of cases)
    test(`after the customer answered, confirm:true (beside the tool or inside arguments) runs the call and is never sent to EmDash: ${label}`, async () => {
      const memory = fakeMemory()
      const site = fakeSite()
      await run(site, deletePost, { memory })
      memory.customerAnswered('session-a')

      const ran = await run(site, call, { memory })

      assert.equal(ran.ok, true, label)
      assert.deepEqual(
        writesOf(site),
        [{ name: 'content_delete', arguments: { collection: 'posts', id: HOME_ID } }],
        label
      )
      assert.ok(ran.normalized.includes('the customer confirmed it'), label)
    })
}

test('an answer is spent by the call it allowed — the same delete again needs its own answer', async () => {
  const memory = fakeMemory()
  const site = fakeSite()
  await run(site, deletePost, { memory })
  memory.customerAnswered('session-a')
  await run(site, { ...deletePost, confirm: true }, { memory })

  const again = await run(site, { ...deletePost, confirm: true }, { memory })

  assert.equal(again.code, 'CONFIRM_FIRST')
})

{
  const other = fakeMemory()
  other.customerAnswered('session-b')
  const cases = [
    { label: 'another conversation answered', extra: { memory: other } },
    { label: 'no memory', extra: { memory: null } },
    { label: 'no session', extra: { memory: fakeMemory(), sessionId: null } }
  ]
  for (const { label, extra } of cases)
    test(`another conversation’s answer, no memory and no session confirm nothing: ${label}`, async () => {
      const site = fakeSite()

      const out = await run(site, { ...deletePost, confirm: true }, extra)

      assert.equal(out.code, 'CONFIRM_FIRST', label)
      assert.deepEqual(writesOf(site), [], label)
    })
}

test('confirmKey is the same whatever the key order of the arguments', () => {
  assert.equal(
    confirmKey('content_delete', { id: 1, collection: 'a' }),
    confirmKey('content_delete', { collection: 'a', id: 1 })
  )
})

/** posts/hello-world in en, ru and de, deletes answered, a conversation with the real call memory. */
async function threeLanguages() {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const ids = {
    en: '01AAAAAAAAAAAAAAAAAAAAAAEN',
    ru: '01AAAAAAAAAAAAAAAAAAAAAAR1',
    de: '01AAAAAAAAAAAAAAAAAAAAAADE'
  }
  const translations = Object.entries(ids).map(([locale, id]) => ({
    id,
    locale,
    slug: 'hello-world',
    status: 'published',
    updatedAt: '2026-09-27T00:00:00.000Z'
  }))
  const site = fakeSite({
    served: ['en', 'ru', 'de'],
    on: {
      content_get: (args) => answer({ item: translations.find((r) => r.locale === args.locale) }),
      content_translations: () => answer({ translationGroup: ids.en, translations }),
      content_delete: (args) => answer({ deleted: true, id: args.id }),
      content_permanent_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (tool, id, confirm = true, more = {}) =>
    run(
      site,
      { tool, arguments: { collection: 'posts', id, ...more }, ...(confirm ? { confirm: true } : {}) },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const yes = (asked) => {
    const [q] = asked.ask.questions
    memory.customerAnswered('session-a', asked.ask, {
      answers: [{ id: q.id, selected: [q.options[0].label] }]
    })
  }
  const languageReads = () => site.names().filter((n) => n === 'content_translations').length
  return { ids, site, memory, call, yes, languageReads }
}

test('an entry named by its slug is asked about once, as the whole entry, with every row listed', async () => {
  const { call, languageReads } = await threeLanguages()

  const asked = await call('content_delete', 'hello-world', false)

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.error, 'content_delete removes posts "hello-world" in all 3 languages.')
  assert.equal(asked.languages, 3)
  // The rows are not listed for the agent to walk: one call removes them all (F3.2 tests below).
  assert.equal(asked.entries, undefined)
  assert.equal(languageReads(), 1)
})

test('after the one yes a row named by its ULID with no language is the entry: one call removes every language, one read for the three', async () => {
  const { ids, site, call, yes, languageReads } = await threeLanguages()
  yes(await call('content_delete', 'hello-world', false))

  const walked = await call('content_delete', ids.en)

  assert.equal(walked.ok, true, JSON.stringify(walked).slice(0, 300))
  assert.deepEqual(walked.removed, { languages: 3, of: 3 })

  assert.deepEqual(
    writesOf(site).map((c) => c.arguments.id),
    [ids.en, ids.ru, ids.de]
  )
  assert.equal(languageReads(), 1)
})

test('erasing for good is its own question, asked about the row the model named', async () => {
  const { ids, call, yes, languageReads } = await threeLanguages()
  yes(await call('content_delete', 'hello-world', false))
  for (const id of [ids.en, ids.ru, ids.de]) await call('content_delete', id)

  const erase = await call('content_permanent_delete', ids.en)

  assert.equal(erase.code, 'CONFIRM_FIRST')
  assert.equal(erase.error, 'content_permanent_delete removes posts/hello-world@en.')
  assert.equal(erase.languages, undefined, 'one row, not the entry')
  assert.equal(languageReads(), 1)
  yes(erase)
  assert.equal((await call('content_permanent_delete', ids.en)).ok, true)
})

test('the next customer message ends the carry — the entry is asked about again', async () => {
  const { ids, memory, call, yes } = await threeLanguages()
  yes(await call('content_delete', 'hello-world', false))
  for (const id of [ids.en, ids.ru, ids.de]) await call('content_delete', id)
  memory.newTurn('session-a')

  const again = await call('content_delete', 'hello-world')

  assert.equal(again.code, 'CONFIRM_FIRST')
})

/** posts/hello-world in en and ru: a row the model named is one language's. */
async function twoLanguages() {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const ids = { en: '01BBBBBBBBBBBBBBBBBBBBBBEN', ru: '01BBBBBBBBBBBBBBBBBBBBBBR1' }
  const translations = Object.entries(ids).map(([locale, id]) => ({
    id,
    locale,
    slug: 'hello-world',
    status: 'published'
  }))
  const site = fakeSite({
    served: ['en', 'ru'],
    on: {
      content_get: (args) => answer({ item: translations.find((r) => r.locale === args.locale) }),
      content_translations: () => answer({ translationGroup: ids.en, translations }),
      content_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const state = createEmdashState()
  const call = (args, confirm = false) =>
    run(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', ...args },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const yes = (asked) => {
    const [q] = asked.ask.questions
    memory.customerAnswered('session-a', asked.ask, {
      answers: [{ id: q.id, selected: [q.options[0].label] }]
    })
  }
  return { ids, site, memory, call, yes }
}

{
  const { ids, call } = await twoLanguages()
  const named = [
    { label: 'the row’s ULID with its language', args: { id: ids.ru, locale: 'ru' } },
    { label: 'the slug with the language', args: { id: 'hello-world', locale: 'ru' } }
  ]
  for (const { label, args } of named)
    test(`a row the model named — by its ULID with its language, or by slug with the language — is asked about as that row, never as the whole entry: ${label}`, async () => {
      const asked = await call(args)

      assert.equal(asked.code, 'CONFIRM_FIRST', label)
      assert.equal(
        asked.error,
        "content_delete removes posts/hello-world@ru only; the entry's other language stays online.",
        label
      )
      assert.equal(asked.languages, undefined, label)
      assert.equal(asked.entries, undefined, `${label}: nothing for the agent to walk`)
    })
}

test('a yes removes that row and nothing else — the other row is a call of its own, and asks', async () => {
  const { ids, site, call, yes } = await twoLanguages()
  yes(await call({ id: ids.ru, locale: 'ru' }))
  assert.equal((await call({ id: ids.ru, locale: 'ru' }, true)).ok, true)

  const other = await call({ id: ids.en }, true)

  assert.equal(other.code, 'CONFIRM_FIRST')
  assert.deepEqual(
    writesOf(site).map((c) => c.arguments.id),
    [ids.ru]
  )
})

test('"No, keep the Russian one" drops the whole-entry agreement without a new turn', async () => {
  const { ids, site, memory, call, yes } = await twoLanguages()
  const asked = await call({ id: 'hello-world' })
  assert.equal(asked.languages, 2)
  yes(asked)
  assert.equal((await call({ id: ids.en, locale: 'en' }, true)).ok, true, 'the row Tracy had chosen goes')
  // Into a card of the agent's own, the customer writes back: an answer is not a new message.
  memory.customerAnswered(
    'session-a',
    { questions: [{ id: 'anything-else', question: 'Anything else?', options: [{ label: 'No' }] }] },
    { answers: [{ id: 'anything-else', selected: [], custom: 'Không, giữ bản tiếng Nga' }] }
  )

  const ru = await call({ id: ids.ru, locale: 'ru' }, true)

  assert.equal(ru.code, 'CONFIRM_FIRST', 'the agreement to remove the whole entry is gone')
  assert.deepEqual(
    writesOf(site).map((c) => c.arguments.id),
    [ids.en]
  )
})

/** One yes to the whole entry is ONE call: an entry in 40 languages must not cost the agent 40 walked deletes. */
const TRIO = {
  en: '01DDDDDDDDDDDDDDDDDDDDDDEN',
  ru: '01DDDDDDDDDDDDDDDDDDDDDDR1',
  de: '01DDDDDDDDDDDDDDDDDDDDDDDE'
}
/** A site serving en/ru/de whose "hello-world" post exists in all three. */
async function trioSite({ refuse = /** @type {string[]} */ ([]) } = {}) {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const rows = Object.entries(TRIO).map(([locale, id]) => ({
    id,
    locale,
    slug: 'hello-world',
    status: 'published'
  }))
  const site = fakeSite({
    served: ['en', 'ru', 'de'],
    on: {
      content_get: (args) => {
        const row = rows.find((r) => r.locale === args.locale || r.id === args.id)
        return answer({ item: { ...row, data: { title: `Hello world (${row?.locale})` } } })
      },
      content_translations: () => answer({ translationGroup: TRIO.en, translations: rows }),
      content_delete: (args) =>
        refuse.includes(args.id)
          ? failed('[ENTRY_LOCKED] Ana has it open')
          : answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a', 'Xoá bài "Hello world" khỏi website')
  const state = createEmdashState()
  const call = (/** @type {Record<string, unknown>} */ args, confirm = false) =>
    run(
      site,
      {
        tool: 'content_delete',
        arguments: { collection: 'posts', ...args },
        ...(confirm ? { confirm: true } : {})
      },
      { memory, state, turn: memory.turnOf('session-a') }
    )
  const deleted = () => site.calls.filter((c) => c.name === 'content_delete').map((c) => c.arguments.id)
  return { site, memory, call, deleted }
}

test('F3.2: the whole entry’s question, answered, lets ONE call remove every language', async () => {
  const { memory, call, deleted } = await trioSite()
  const asked = /** @type {any} */ (await call({ id: 'hello-world' }))
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.languages, 3)
  assert.match(asked.error, /in all 3 languages/)
  const [q] = asked.ask.questions
  memory.customerAnswered('session-a', asked.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] })
  const done = /** @type {any} */ (await call({ id: 'hello-world' }, true))
  assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
  assert.deepEqual(done.removed, { languages: 3, of: 3 })
  assert.deepEqual(deleted(), [TRIO.en, TRIO.ru, TRIO.de], 'the chosen row first, then the others')
  assert.equal(done.failed, undefined)
  assert.ok(
    done.normalized.some((/** @type {string} */ n) => /every language of this entry went \(3\)/.test(n))
  )
  // A row walked afterwards anyway carries on the same agreement — with or without the model's flag.
  assert.equal(/** @type {any} */ (await call({ id: TRIO.ru })).ok, true)
})

test('F3.2: a row that could not go is named with its id, and the agreement still covers its retry', async () => {
  const { memory, call, deleted, site } = await trioSite({ refuse: [TRIO.de] })
  const asked = /** @type {any} */ (await call({ id: 'hello-world' }))
  const [q] = asked.ask.questions
  memory.customerAnswered('session-a', asked.ask, { answers: [{ id: q.id, selected: [q.options[0].label] }] })
  const done = /** @type {any} */ (await call({ id: 'hello-world' }, true))
  assert.equal(done.ok, true)
  assert.deepEqual(done.removed, { languages: 2, of: 3 })
  assert.deepEqual(
    done.failed.map((/** @type {any} */ f) => [f.id, f.locale]),
    [[TRIO.de, 'de']]
  )
  assert.match(done.next, /confirm:true and each id in failed/)
  // Ana closes the entry; the retry goes on the same yes, with no second question.
  site.calls.length = 0
  const retry = /** @type {any} */ (await call({ id: TRIO.de }, true))
  assert.equal(
    retry.code,
    'TOOL_FAILED',
    'still locked in this fake — but refused by EmDash, not by a question'
  )
  assert.deepEqual(deleted(), [TRIO.de])
})

test('🔒 a question the agent wrote opens no delete — the whole entry, one row, or a one-language entry: the door asks its own question, which says "in all N languages"', async () => {
  /** @param {string} question @param {string[]} labels */
  const card = (question, labels) => ({
    args: { questions: [{ id: 'q', question, options: labels.map((label) => ({ label })) }] },
    value: { answers: [{ id: 'q', selected: [labels[0]] }] }
  })
  // The entry has 3 languages and the agent's question says so; the customer chose "all 3 languages".
  const whole = await trioSite()
  const scope = card('Bài “Hello world” có ở 3 ngôn ngữ. Xoá thế nào?', [
    'Xoá ở cả 3 ngôn ngữ (Recommended)',
    'Chỉ xoá bản tiếng Anh',
    'Không, giữ lại'
  ])
  whole.memory.customerAnswered('session-a', scope.args, scope.value)
  const asked = /** @type {any} */ (await whole.call({ id: 'hello-world' }, true))
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.languages, 3)
  assert.equal(asked.error, 'content_delete removes posts "hello-world" in all 3 languages.')
  assert.deepEqual(whole.deleted(), [])
  // A plain yes to "delete it?", and a call that names one row (slug and language): asked as that row.
  const row = await trioSite()
  const plain = card('Xoá bài “Hello world” nhé?', ['Có, xoá đi', 'Không, giữ lại'])
  row.memory.customerAnswered('session-a', plain.args, plain.value)
  const rowAsked = /** @type {any} */ (await row.call({ id: 'hello-world', locale: 'ru' }, true))
  assert.equal(rowAsked.code, 'CONFIRM_FIRST')
  assert.deepEqual(row.deleted(), [])
  // A one-language entry is no different: the question the door asks is the one that counts.
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const site = fakeSite({
    on: {
      content_get: () =>
        answer({ item: { id: HOME_ID, slug: 'about-us', locale: 'en', data: { title: 'About us' } } }),
      content_translations: () =>
        answer({ translationGroup: HOME_ID, translations: [{ id: HOME_ID, locale: 'en' }] }),
      content_delete: (args) => answer({ deleted: true, id: args.id })
    }
  })
  const memory = createCallMemory({ now: () => 1 })
  memory.newTurn('session-a')
  const one = card('Delete the page “About us”?', ['Yes, delete it', 'No, keep it'])
  memory.customerAnswered('session-a', one.args, one.value)
  const del = () =>
    run(
      site,
      { tool: 'content_delete', arguments: { collection: 'pages', id: HOME_ID }, confirm: true },
      { memory, state: createEmdashState() }
    )
  assert.equal(/** @type {any} */ (await del()).code, 'CONFIRM_FIRST')
})

test('content_get and schema_get_collection answers are not cut: EmDash has no way to narrow them', async () => {
  const body = 'x'.repeat(40_000)
  const big = { item: { ...A.homeGet.item, data: { ...A.homeGet.item.data, hero_text: body } }, _rev: 'r' }
  const site = fakeSite({
    on: {
      content_get: () => answer(big),
      schema_get_collection: () => answer({ ...A.schemaHome, description: body })
    }
  })
  const get = await run(site, { tool: 'content_get', arguments: { collection: 'home', id: HOME_ID } })
  assert.equal(get.result.item.data.hero_text, body)
  assert.equal(get.truncated, undefined)
  const schema = await run(site, { tool: 'schema_get_collection', arguments: { slug: 'home' } })
  assert.equal(schema.truncated, undefined)
})

test("content_list over 8,000 chars is cut by field first — every row, then whole rows from the tail — and keeps the page's cursor with the limit that skips nothing", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ ...A.homeGet.item, id: `ROW${i}`, slug: `row-${i}` }))
  const site = fakeSite({
    on: {
      content_list: (args) =>
        args.collection === 'posts' ? answer({ items: rows, nextCursor: 'c' }) : undefined
    }
  })
  const out = await run(site, { tool: 'content_list', arguments: { collection: 'posts' } })
  assert.ok(JSON.stringify(out).length <= 8300, `${JSON.stringify(out).length}`)
  assert.ok(out.truncated.shown >= 1 && out.truncated.shown < 30)
  assert.equal(out.truncated.total, 30)
  // Thirty whole home entries overflow even with their long values left out: the head is shown, cut by
  // field, and the page's own cursor is kept with the limit whose answer skips nothing.
  const left = out.truncated.fieldsLeftOut
  assert.equal(
    out.next,
    `Rows are cut to fit 8,000 chars (left out: ${left.slice(0, 5).join(', ')}${left.length > 5 ? ', …' : ''}). A row's _cut lists what it lost; a field neither shown nor listed is not set. content_get {collection, id} reads one whole entry. ${30 - out.truncated.shown} of 30 rows were left out to fit 8,000 chars, and this page's nextCursor skips them: send the same call with limit:${out.truncated.shown} and follow that answer's nextCursor.`
  )
  assert.ok(left.includes('data.hero_image'), left.join())
  assert.equal(out.result.nextCursor, 'c')
  // Each value a row shows is the entry's own, whole; what is left out is not there at all, and the row says so.
  for (const r of out.result.items) {
    assert.ok(Object.keys(r.data).length > 5 && r.data.hero_image === undefined)
    for (const [key, value] of Object.entries(r.data)) assert.deepEqual(value, A.homeGet.item.data[key], key)
    assert.deepEqual(r._cut, left, 'each row names what it lost')
  }
})

test('a list of entries reaches the model with EVERY row, so the one asked for is not the one cut; a `query` is said to do nothing', async () => {
  // The row the customer named was the ninth of a page cut at eight; the model then invented cursors and `query`.
  const image = (i) => ({
    id: `IMG${i}`,
    provider: 'local',
    filename: `photo-${i}.png`,
    mimeType: 'image/png',
    width: 900,
    height: 560,
    blurhash: 'L'.repeat(28),
    alt: `Picture ${i}`,
    meta: { storageKey: `KEY${i}.png`, caption: null, blurhash: 'L'.repeat(28) }
  })
  const rows = Array.from({ length: 14 }, (_, i) => ({
    ...A.homeGet.item,
    id: `01PROJ${String(i).padStart(3, '0')}`,
    slug: `project-${i}`,
    data: {
      title: `Project ${i}`,
      year: '2024',
      city: 'Kaluga',
      summary: 'Earthworks, internal roads and a treatment plant, handed over on schedule this year.',
      lede: 'A longer line about the same project, which reads like a second summary of it in the page.',
      image: image(i),
      sort: i
    }
  }))
  const site = fakeSite({
    on: {
      content_list: (args) => (args.collection === 'projects' ? answer({ items: rows }) : undefined)
    }
  })
  const out = await run(site, {
    tool: 'content_list',
    arguments: { collection: 'projects', limit: 8, query: 'Project 9' }
  })
  assert.equal(out.result.items.length, 14, 'every row, the ninth and the last included')
  assert.deepEqual(
    out.result.items.map((r) => r.data.title),
    rows.map((r) => r.data.title)
  )
  assert.ok(out.result.items.every((r) => r._rev && r.id && r.slug))
  assert.deepEqual(out.truncated.fieldsLeftOut, ['data.image'])
  assert.match(
    out.next,
    /^Rows are cut to fit 8,000 chars \(left out: data\.image\)\. A row's _cut lists what it lost; a field neither shown nor listed is not set\. content_get \{collection, id\}/
  )
  assert.ok(out.result.items.every((r) => r._cut.length === 1 && r._cut[0] === 'data.image'))
  assert.deepEqual(out.normalized, [
    'query dropped: content_list filters nothing; search finds words in searchable collections'
  ])
  // `query` never reached EmDash: the call it got is the one EmDash reads.
  const sent = site.calls.find((c) => c.name === 'content_list' && c.arguments.collection === 'projects')
  assert.equal(sent.arguments.query, undefined)
})

test('{list:true} answers one line per tool within 6,000 chars; {list:true, tools} the schemas asked for', async () => {
  const site = fakeSite()
  const list = await run(site, { list: true })
  assert.equal(list.ok, true)
  assert.equal(list.tools.length, 59)
  assert.ok(JSON.stringify(list).length <= 6000)
  assert.match(list.next, /tools:\[names\]/)
  const schemas = await run(site, { list: true, tools: ['content_update', 'nope'] })
  assert.deepEqual(
    schemas.tools.map((t) => t.name),
    ['content_update']
  )
  assert.deepEqual(schemas.unknown, ['nope'])
  assert.deepEqual(writesOf(site), [])
})

test("a page read asked of tracy_emdash is answered as tracy_site's, for the same site; nothing reaches EmDash", async () => {
  const site = fakeSite()
  const asked = []
  const out = await run(
    site,
    { tool: 'page.text', arguments: { path: '/news', match: 'Tracy' } },
    { page: async (action, params) => (asked.push([action, params]), { ok: true, text: 'Tracy news' }) }
  )
  assert.deepEqual(asked, [['page.text', { path: '/news', match: 'Tracy' }]])
  assert.equal(out.text, 'Tracy news')
  assert.match(out.normalized[0], /tracy_site's page\.text/)
  assert.deepEqual(site.calls, [])
  const bare = await run(site, { tool: 'page_text', arguments: {} })
  assert.equal(bare.code, 'BAD_CALL')
})

test('shape repairs reach the site: arguments nested twice arrive as the inner object, and are said', async () => {
  const site = fakeSite()
  const out = await run(site, {
    tool: 'content_update',
    arguments: {
      tool: 'content_update',
      arguments: {
        collection: 'home',
        id: HOME_ID,
        _rev: 'MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa=',
        data: { title: 'x' },
        status: 'published'
      }
    }
  })
  assert.equal(out.ok, true)
  assert.deepEqual(writesOf(site).at(-1).arguments, {
    collection: 'home',
    id: HOME_ID,
    _rev: 'MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa',
    data: { title: 'x' },
    status: 'published'
  })
  assert.ok(out.normalized.some((n) => /nested twice/.test(n)))
  assert.ok(out.normalized.some((n) => /_rev re-encoded/.test(n)))
  const refused = await run(site, { tool: 'apply.list', arguments: {} })
  assert.equal(refused.code, 'NO_RECEIPTS_ON_EMDASH')
})

test('the computed _rev is checked on every pre-read: one disagreement turns it off, and answers say so', async () => {
  const state = createEmdashState()
  const site = fakeSite({
    on: { content_get: () => answer({ item: A.homeGet.item, _rev: 'a-different-encoding' }) }
  })
  const out = await run(
    site,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: {}, status: 'published' }
    },
    { state }
  )
  assert.equal(state.revsOn(), false)
  assert.ok(out.normalized.some((n) => /computed _rev is off/.test(n)))
  const list = await run(
    fakeSite(),
    { tool: 'content_list', arguments: { collection: 'home', locale: 'en' } },
    { state }
  )
  assert.equal(list.result.items[0]._rev, undefined)
  assert.ok(list.normalized.some((n) => /computed _rev is off/.test(n)))
})

test('the staged-draft memory is bounded: 200 per conversation, 2,000 in all', () => {
  const state = createEmdashState()
  for (let i = 0; i < 250; i++) state.stage('s1', `site:${i}`)
  assert.equal(state.isStaged('s1', 'site:0'), false)
  assert.equal(state.isStaged('s1', 'site:249'), true)
  assert.equal(state.stagedCount(), 200)
  for (let s = 0; s < 20; s++) for (let i = 0; i < 150; i++) state.stage(`t${s}`, `site:${i}`)
  assert.equal(state.stagedCount(), 2000)
  assert.equal(state.isStaged('t19', 'site:149'), true)
  assert.equal(state.isStaged(null, 'site:1'), false)
})

const waitingPublish = {
  tool: 'content_update',
  arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_text: 'x' }, status: 'published' }
}
const waitingSite = () =>
  fakeSite({ on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: 'r' }) } })

test("PENDING_DRAFT: somebody else's waiting change is not published on the model's own confirm", async () => {
  const memory = fakeMemory()
  const site = waitingSite()
  const plain = await run(site, waitingPublish, { memory })

  const own = await run(site, { ...waitingPublish, confirm: true }, { memory })

  assert.deepEqual([plain.code, own.code], ['PENDING_DRAFT', 'PENDING_DRAFT'])
  assert.deepEqual(writesOf(site), [])
})

test('PENDING_DRAFT: after the customer said yes the change goes live once, the receipt names what was waiting, and confirm is not sent', async () => {
  const memory = fakeMemory()
  const site = waitingSite()
  await run(site, waitingPublish, { memory })
  memory.customerAnswered('session-a')

  const out = await run(site, { ...waitingPublish, confirm: true }, { memory })

  assert.equal(out.ok, true)
  assert.deepEqual(out.result.mixed, { draftFields: ['hero_title_a', 'hero_title_b'] })
  assert.ok(out.normalized.some((n) => /agreed to publish/.test(n)))
  assert.equal(writesOf(site).length, 1)
  assert.equal('confirm' in writesOf(site)[0].arguments, false)
})

test('PENDING_DRAFT: a yes is spent — the next publish over a waiting change asks again', async () => {
  const memory = fakeMemory()
  const site = waitingSite()
  await run(site, waitingPublish, { memory })
  memory.customerAnswered('session-a')
  await run(site, { ...waitingPublish, confirm: true }, { memory })

  const again = await run(site, { ...waitingPublish, confirm: true }, { memory })

  assert.equal(again.code, 'PENDING_DRAFT')
})

test("a no-status change merged onto somebody else's draft is not staged by this conversation", async () => {
  const site = fakeSite({
    on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: A.homeStagedUpdate._rev }) }
  })
  const state = createEmdashState()

  const merged = await run(
    site,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_text: 'x' } }
    },
    { state }
  )

  assert.deepEqual(merged.result.mixed, { draftFields: ['hero_title_a', 'hero_title_b'] })
  assert.equal(state.isStaged('session-a', `${SITE.label}:${HOME_ID}`), false)
})

test('the same conversation cannot then publish it, either way — refused, and nothing more is written', async () => {
  const site = fakeSite({
    on: { content_get: () => answer({ item: A.homeStagedUpdate.item, _rev: A.homeStagedUpdate._rev }) }
  })
  const state = createEmdashState()
  await run(
    site,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_text: 'x' } }
    },
    { state }
  )
  const written = writesOf(site).length
  const cases = [
    { label: 'content_update published', call: waitingPublish },
    {
      label: 'content_publish',
      call: { tool: 'content_publish', arguments: { collection: 'home', id: HOME_ID, _rev: 'r' } }
    }
  ]
  for (const { label, call } of cases) {
    const out = await run(site, call, { state })

    assert.equal(out.code, 'PENDING_DRAFT', label)
    assert.deepEqual(out.draftFields, ['hero_title_a', 'hero_title_b'], label)
  }
  assert.equal(writesOf(site).length, written, 'nothing more is written')
})

test("this conversation's own staged draft stays its own through a second no-status change", async () => {
  let drafted = false
  const site = fakeSite({
    on: {
      content_get: () =>
        drafted ? answer({ item: A.homeStagedUpdate.item, _rev: A.homeStagedUpdate._rev }) : undefined,
      content_update: (args) => {
        if (args.status === undefined) drafted = true
        return undefined
      }
    }
  })
  const state = createEmdashState()
  const change = (data) => ({
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data }
  })
  await run(site, change({ hero_title_a: 'Built for the way' }), { state })
  const again = await run(site, change({ hero_title_b: 'you work' }), { state })
  assert.equal(again.result.mixed, undefined, 'the waiting change was its own')
  const own = await run(
    site,
    { tool: 'content_publish', arguments: { collection: 'home', id: HOME_ID, _rev: 'r' } },
    { state }
  )
  assert.equal(own.ok, true)
})

test('a delete by slug whose language cannot be told is refused for its form before anyone is asked', async () => {
  const site = fakeSite({ served: ['de', 'vi'] }) // two languages served, the template's default (`en`) not among them

  const slug = await run(
    site,
    { tool: 'content_delete', arguments: { collection: 'posts', id: 'about' } },
    { memory: fakeMemory(), state: createEmdashState() }
  )

  assert.equal(slug.code, 'EMDASH_ULID_REQUIRED')
  assert.deepEqual(writesOf(site), [])
})

test('a delete by slug: its ULID form is asked once, and runs once after the answer', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ served: ['de', 'vi'] })
  const state = createEmdashState()
  const byId = { tool: 'content_delete', arguments: { collection: 'posts', id: HOME_ID } }
  const asked = await run(site, byId, { memory, state })
  memory.customerAnswered('session-a')

  const ran = await run(site, { ...byId, confirm: true }, { memory, state })

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(ran.ok, true)
  assert.deepEqual(
    writesOf(site).map((c) => c.name),
    ['content_delete']
  )
})

test('a delete by slug on a two-language site asks about the entry in the default language, naming it', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ served: ['en', 'vi'] })
  const state = createEmdashState()
  const slug = { tool: 'content_delete', arguments: { collection: 'posts', id: 'about' } }
  const asked = await run(site, slug, { memory, state })
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.target, 'posts/about@en', 'the question names the language it would delete')
  assert.deepEqual(writesOf(site), [], 'the question is asked before anything is removed')
  memory.customerAnswered('session-a')
  assert.equal((await run(site, { ...slug, confirm: true }, { memory, state })).ok, true)
  assert.deepEqual(writesOf(site), [
    { name: 'content_delete', arguments: { collection: 'posts', id: HOME_ID } }
  ])
})

test('a delete by slug on a one-language site asks about the resolved entry; its ULID form is the same question', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ served: ['en'] })
  const state = createEmdashState()
  const slug = { tool: 'content_delete', arguments: { collection: 'posts', id: 'about' } }
  const asked = await run(site, slug, { memory, state })
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.target, 'posts/about@en')
  assert.deepEqual(writesOf(site), [], 'the question is asked before anything is removed')
  memory.customerAnswered('session-a')
  // The customer said yes to that entry: its ULID form is the same call, and runs once.
  const ran = await run(
    site,
    { tool: 'content_delete', confirm: true, arguments: { collection: 'posts', id: HOME_ID } },
    { memory, state }
  )
  assert.equal(ran.ok, true)
  assert.deepEqual(writesOf(site), [
    { name: 'content_delete', arguments: { collection: 'posts', id: HOME_ID } }
  ])
})

test('the slug form repeated after an answer resolves to the same key — spent, then asked again, then runs on a new answer', async () => {
  const memory = fakeMemory()
  const site = fakeSite({ served: ['en'] })
  const state = createEmdashState()
  const slug = { tool: 'content_delete', arguments: { collection: 'posts', id: 'about' } }
  await run(site, slug, { memory, state })
  memory.customerAnswered('session-a')
  await run(
    site,
    { tool: 'content_delete', confirm: true, arguments: { collection: 'posts', id: HOME_ID } },
    { memory, state }
  )

  const spent = await run(site, { ...slug, confirm: true }, { memory, state })
  memory.customerAnswered('session-a')
  const again = await run(site, { ...slug, confirm: true }, { memory, state })

  assert.equal(spent.code, 'CONFIRM_FIRST')
  assert.equal(again.ok, true)
})

test("EmDash's own refusal text reaches the model within 160 chars, head first", async () => {
  const dump = `[VALIDATION_ERROR] data.hero_title_a: Invalid input: expected string, received number; ${'data.services[3].items: Too big: expected array to have <=6 items; '.repeat(12)}`
  const site = fakeSite({ on: { content_update: () => failed(dump) } })
  const out = await run(site, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'r', data: { hero_title_a: 1 } }
  })
  assert.equal(out.code, 'TOOL_FAILED')
  assert.equal(out.emdash, 'VALIDATION', 'the class is read from the whole text')
  assert.ok(dump.length > 600)
  assert.ok(out.error.length <= 160, `${out.error.length}`)
  assert.match(out.error, /^\[VALIDATION_ERROR\] data\.hero_title_a: Invalid input/)
  // Host refusals too: a long transport text is cut the same way.
  const host = fakeSite({
    on: { menu_get: () => ({ ok: false, code: 'SITE_REFUSED', httpStatus: 404, error: 'x'.repeat(900) }) }
  })
  const far = await run(host, { tool: 'menu_get', arguments: { name: 'primary', locale: 'en' } })
  assert.ok(far.error.length <= 160)
})

test('a single row over 8,000 chars comes cut by field — ids to read it by, never an empty page', async () => {
  const body = 'Lorem ipsum dolor sit amet. '.repeat(330)
  // search: the same rule, the same read of one whole entry.
  const hit = {
    collection: 'posts',
    id: '01M36TA83763RSVSN5R28DZ0AA',
    title: 'Post',
    score: 1,
    excerpt: body
  }
  const site = fakeSite({ on: { search: () => answer({ items: [hit] }) } })
  const found = await run(site, { tool: 'search', arguments: { query: 'lorem' } })
  assert.deepEqual(found.result.items, [
    { collection: 'posts', id: '01M36TA83763RSVSN5R28DZ0AA', title: 'Post', score: 1, _cut: ['excerpt'] }
  ])
  assert.deepEqual(found.truncated.fieldsLeftOut, ['excerpt'])
  assert.match(found.next, /content_get \{collection, id\}/)
})

{
  const body = 'Lorem ipsum dolor sit amet. '.repeat(330)
  const post = (i) => ({
    ...A.homeGet.item,
    id: `01M36TA83763RSVSN5R28DZ0${String(i).padStart(2, '0')}`,
    slug: `post-${i}`,
    data: { title: `Post ${i}`, body }
  })
  for (const limit of [5, 1])
    test(`a single row over 8,000 chars comes cut by field — ids to read it by, never an empty page: ${rowName(limit)}`, async () => {
      const site = fakeSite({
        on: {
          content_list: (args) =>
            args.collection === 'posts'
              ? answer({ items: Array.from({ length: limit }, (_, i) => post(i)), nextCursor: 'page-2' })
              : undefined
        }
      })
      const out = await run(site, { tool: 'content_list', arguments: { collection: 'posts', limit } })
      assert.ok(JSON.stringify(out).length <= 8300, `${JSON.stringify(out).length}`)
      assert.equal(out.result.items.length, limit, `limit ${limit}: every row, by field`)
      for (const [i, r] of out.result.items.entries()) {
        // The title stays (a row is found by it); the body, which alone made the row too big, goes.
        assert.deepEqual(Object.keys(r), ['id', 'slug', 'locale', 'status', '_rev', 'data', '_cut'])
        assert.deepEqual(r.data, { title: `Post ${i}` })
        assert.deepEqual(r._cut, ['data.body'])
        assert.match(r.id, /^01M36TA8/)
      }
      assert.deepEqual(out.truncated.fieldsLeftOut, ['data.body'])
      assert.equal(out.truncated.shown, limit)
      assert.match(out.next, /content_get \{collection, id\} reads one whole entry/)
      assert.equal(out.result.nextCursor, 'page-2', 'every row is here, so the next page is next')
    })
}

test('a [CONFLICT] with the same stale _rev is not sent again; a fresh _rev is', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const memory = createCallMemory()
  const site = fakeSite({
    on: {
      content_update: (args) =>
        args._rev === 'stale'
          ? failed('[CONFLICT] Content changed while the operation was in progress')
          : undefined
    }
  })
  const call = (rev) => ({
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, _rev: rev, data: { title: 'Hi' }, status: 'published' }
  })
  const first = await run(site, call('stale'), { memory })
  assert.equal(first.emdash, 'CONFLICT')
  const sentBefore = site.calls.length
  const again = await run(site, call('stale'), { memory })
  assert.equal(again.code, 'SAME_CALL_REFUSED')
  assert.equal(again.refused, 'TOOL_FAILED')
  assert.equal(again.tool, 'content_update')
  assert.equal(site.calls.length, sentBefore, 'nothing reached the site: no pre-read, no write')
  assert.match(again.next ?? '', /content_get/, "the earlier refusal's own next: read the entry again")
  // The re-read's _rev is another call, and it goes through.
  const fresh = await run(site, call('fresh'), { memory })
  assert.equal(fresh.ok, true)
})

test('(tracy_emdash): a write the site did not answer does not block the same call — its next asks for a check', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const memory = createCallMemory()
  const down = fakeSite({
    on: {
      menu_update: (_a, n) =>
        n === 1 ? { ok: false, code: 'SITE_UNREACHABLE', error: 'exec failed' } : undefined
    }
  })
  const setItems = { tool: 'menu_update', arguments: { name: 'primary', label: 'Main', locale: 'en' } }
  const first = await run(down, setItems, { memory })

  const second = await run(down, setItems, { memory })

  assert.equal(first.code, 'SITE_UNREACHABLE')
  assert.equal(second.ok, true)
  assert.equal(writesOf(down).length, 2)
})

test('(tracy_emdash): a delete that asks first passes once the customer answered its own question', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const del = fakeSite()
  const memory = createCallMemory()
  const ask = { tool: 'content_delete', arguments: { collection: 'posts', id: '01M36TA83763RSVSN5R28DZ0AA' } }
  const refused = await run(del, ask, { memory })
  const [q] = refused.ask.questions
  memory.customerAnswered('session-a', refused.ask, {
    answers: [{ id: q.id, selected: [q.options[0].label] }]
  })

  const yes = await run(del, { ...ask, arguments: { ...ask.arguments, confirm: true } }, { memory })

  assert.equal(refused.code, 'CONFIRM_FIRST')
  assert.equal(yes.ok, true)
})

test('(tracy_emdash): a validation refusal is kept for this turn only — the customer’s next message may change it', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const memory = createCallMemory()
  const bad = fakeSite({ on: { menu_get: () => failed('[VALIDATION_ERROR] name: Required') } })
  const get = { tool: 'menu_get', arguments: { name: '', locale: 'en' } }
  await run(bad, get, { memory })
  const kept = await run(bad, get, { memory })
  memory.newTurn('session-a')

  const nextTurn = await run(bad, get, { memory })

  assert.equal(kept.code, 'SAME_CALL_REFUSED')
  assert.equal(nextTurn.code, 'TOOL_FAILED')
})

test('(tracy_emdash): a write that went through ends every refusal kept for the site', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const memory = createCallMemory()
  const site = fakeSite({
    on: { menu_get: (_a, n) => (n === 1 ? failed('[VALIDATION_ERROR] locale: bad') : undefined) }
  })
  const get = { tool: 'menu_get', arguments: { name: 'primary', locale: 'xx' } }
  await run(site, get, { memory })
  assert.equal((await run(site, get, { memory })).code, 'SAME_CALL_REFUSED')
  // Any write to this site may make the refused call right (a menu created, a locale added).
  await run(
    site,
    { tool: 'menu_update', arguments: { name: 'primary', label: 'Main', locale: 'en' } },
    { memory }
  )
  assert.equal((await run(site, get, { memory })).ok, true)
})

test('a single-entry read without id takes the one entry the listing answers; more entries are named, nothing guessed', async () => {
  const site = fakeSite()
  const out = await run(site, { tool: 'content_get', arguments: { collection: 'home' } })
  assert.equal(out.ok, true)
  assert.equal(
    site.calls.find((c) => c.name === 'content_get').arguments.id,
    A.homeGet.item.id,
    'the one entry’s id was used'
  )
  assert.ok(out.normalized.some((n) => /holds one entry here; its id was used/.test(n)))
  const many = fakeSite({
    on: {
      content_list: (a) =>
        a.collection === 'posts'
          ? answer({
              items: [
                { id: 'A1', slug: 'one' },
                { id: 'B2', slug: 'two' }
              ]
            })
          : undefined
    }
  })
  const refusal = await run(many, { tool: 'content_translations', arguments: { collection: 'posts' } })
  assert.equal(refusal.ok, false)
  assert.deepEqual(refusal.entries, [
    { id: 'A1', slug: 'one' },
    { id: 'B2', slug: 'two' }
  ])
  assert.match(refusal.next, /The same call with id: one of entries/)
  assert.equal(many.names().includes('content_translations'), false, 'nothing guessed')
})

test('a menu name the site lacks answers the names it has', async () => {
  const site = fakeSite({
    on: {
      menu_get: () => failed("[NOT_FOUND] Menu 'main' not found"),
      menu_list: () => answer({ items: [{ name: 'primary' }, { name: 'footer_legal' }] })
    }
  })
  const out = await run(site, { tool: 'menu_get', arguments: { name: 'main', locale: 'en' } })
  assert.equal(out.ok, false)
  assert.deepEqual(out.menus, ['primary', 'footer_legal'])
  assert.equal(out.next, 'menu_get {name} with one of menus.')
})

/** A template's collections as `schema_list_collections` answers them: a listing's entries under a label the page does not use. */
const COLLECTIONS = [
  { slug: 'site', label: 'Site chrome' },
  { slug: 'home', label: 'Home page', urlPattern: '/' },
  { slug: 'journal_page', label: 'Journal page', urlPattern: '/journal' },
  { slug: 'articles', label: 'Journal', urlPattern: '/journal/{slug}' },
  { slug: 'pages', label: 'Pages', urlPattern: '/{slug}' }
]
const collectionsSite = (/** @type {Record<string, Function>} */ on = {}) =>
  fakeSite({
    on: {
      content_list: (a) =>
        ['article', 'journal', 'Journal', 'journals', 'post'].includes(a.collection)
          ? failed(`[COLLECTION_NOT_FOUND] Collection '${a.collection}' not found`)
          : undefined,
      schema_get_collection: (a) => failed(`[NOT_FOUND] Collection '${a.slug}' not found`),
      schema_list_collections: () => answer({ items: COLLECTIONS }),
      ...on
    }
  })

test('a collection the site lacks answers the collections it has — slug and label — and the nearest to the guess', async () => {
  // The model names the collection after the page (`post`, `news`); the posts live under another slug and label.
  // (A list asked by a label one collection carries is read from it: see the next test. "journals" is near two.)
  const site = collectionsSite()
  const out = await run(site, { tool: 'content_list', arguments: { collection: 'journals' } })
  assert.equal(out.ok, false)
  assert.equal(out.emdash, 'COLLECTION_NOT_FOUND')
  assert.equal(out.collection, 'journals')
  assert.deepEqual(out.collections, {
    site: 'Site chrome',
    home: 'Home page',
    journal_page: 'Journal page',
    articles: 'Journal',
    pages: 'Pages'
  })
  // the label the customer says finds its slug: the page's own collection and the listing's
  assert.equal(
    out.next,
    'The same call with one of the keys of collections (slug: label); closest to "journals": journal_page, articles (Journal).'
  )
  assert.doesNotMatch(out.next, /tell the customer|another way/)
  assert.ok(out.next.length <= 200)
  // the served-language read, the refused call, then the one list read this refusal adds
  assert.deepEqual(site.names(), ['content_list', 'content_list', 'schema_list_collections'])
  // singular for plural: `article` is `articles` (a read that is not a list keeps the refusal and its list)
  const singular = await run(
    collectionsSite({
      content_get: (a) =>
        a.collection === 'article'
          ? failed(`[COLLECTION_NOT_FOUND] Collection '${a.collection}' not found`)
          : undefined
    }),
    { tool: 'content_get', arguments: { collection: 'article', id: 'x', locale: 'en' } }
  )
  assert.match(singular.next, /closest to "article": articles \(Journal\)\.$/)
  // a tool that names the collection `slug` is answered the same way
  const schema = await run(collectionsSite(), {
    tool: 'schema_get_collection',
    arguments: { slug: 'journal' }
  })
  assert.equal(schema.emdash, 'NOT_FOUND')
  assert.equal(Object.keys(schema.collections).length, 5)
  assert.match(schema.next, /closest to "journal": journal_page, articles \(Journal\)/)
  // a write to a collection the site lacks is refused with the same list — a read is all the door adds
  const create = collectionsSite({
    content_create: (a) => failed(`[COLLECTION_NOT_FOUND] Collection '${a.collection}' not found`)
  })
  const made = await run(create, {
    tool: 'content_create',
    arguments: { collection: 'article', locale: 'en', data: { title: 'x' } }
  })
  assert.equal(made.ok, false)
  assert.ok(made.collections.articles)
  assert.equal(create.names().filter((n) => n === 'content_create').length, 1, 'the write was not repeated')
})

// 🔒 09/10/2026 (bench hb: 5 EmDash delete and add runs opened with `content_list {collection:"news"}` where the
// posts are `posts`, labelled News — each a refused step and a second list). A list asked by the label ONE
// collection carries, or by its slug's singular or plural, is read from that collection once, and said; the
// listing page's own entry (`journal_page`, "Journal page") is never the one meant. A write is never re-aimed.
test('a list asked by the label one collection carries is read from that collection, and said — never a write, never a guess between two', async () => {
  for (const guess of ['journal', 'Journal', 'article']) {
    const site = collectionsSite()
    const out = await run(site, { tool: 'content_list', arguments: { collection: guess } })
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 600))
    assert.ok(
      (out.normalized ?? []).includes(`collection "${guess}" is articles here: the list was read from it`),
      JSON.stringify(out.normalized ?? out).slice(-900)
    )
    const lists = site.calls
      .filter((c) => 'name' in c && c.name === 'content_list')
      .map((c) => c.arguments.collection)
    assert.deepEqual(
      lists.slice(-2),
      [guess, 'articles'],
      `${guess}: refused once, then read once from its slug`
    )
    assert.equal(site.names().filter((n) => n === 'schema_list_collections').length, 1)
  }
  // two collections answer to the guess (a label and a plural): the refusal and its list, nothing read
  const two = fakeSite({
    on: {
      content_list: (a) =>
        a.collection === 'post'
          ? failed(`[COLLECTION_NOT_FOUND] Collection '${a.collection}' not found`)
          : undefined,
      schema_list_collections: () =>
        answer({
          items: [
            { slug: 'posts', label: 'News' },
            { slug: 'blog', label: 'Post' }
          ]
        })
    }
  })
  const torn = await run(two, { tool: 'content_list', arguments: { collection: 'post' } })
  assert.equal(torn.ok, false)
  assert.ok(torn.collections)
  assert.equal(
    two.calls.filter((c) => 'name' in c && c.name === 'content_list').length,
    2,
    'served read + the refused one'
  )
  // a write to the label is refused with the list, never sent again under another collection
  const create = collectionsSite({
    content_create: (a) => failed(`[COLLECTION_NOT_FOUND] Collection '${a.collection}' not found`)
  })
  const made = await run(create, {
    tool: 'content_create',
    arguments: { collection: 'journal', locale: 'en', data: { title: 'x' } }
  })
  assert.equal(made.ok, false)
  assert.equal(create.names().filter((n) => n === 'content_create').length, 1)
})

test('a refusal that names no missing collection is left as it is: an entry, a menu, a list that cannot be read', async () => {
  // an entry that is not found in a collection that is
  const entry = collectionsSite({ content_get: () => failed('[NOT_FOUND] Content item not found: nope') })
  const gone = await run(entry, {
    tool: 'content_get',
    arguments: { collection: 'home', id: 'nope', locale: 'en' }
  })
  assert.equal(gone.emdash, 'NOT_FOUND')
  assert.equal(gone.collections, undefined)
  assert.equal(entry.names().includes('schema_list_collections'), false, 'no read for an entry')
  // a menu keeps its own answer (G3), not a collection list
  const menu = collectionsSite({
    menu_get: () => failed("[NOT_FOUND] Menu 'main' not found"),
    menu_list: () => answer({ items: [{ name: 'primary' }] })
  })
  const nf = await run(menu, { tool: 'menu_get', arguments: { name: 'main', locale: 'en' } })
  assert.equal(nf.collections, undefined)
  assert.deepEqual(nf.menus, ['primary'])
  // a list that cannot be read (the site is slow, or answers nothing): the bare refusal, and the
  // static next `refusalNext` writes names the read — never "tell the customer"
  for (const [list, reads] of /** @type {[Function, number][]} */ ([
    // a read the site did not answer is asked once more (E2.4), as every read is
    [() => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'timed out' }), 2],
    [() => answer({ items: [] }), 1],
    [() => failed('[INTERNAL_ERROR] database is locked'), 1],
    // the list refusing in the very words this rule answers must not ask for the list again
    [() => failed("[COLLECTION_NOT_FOUND] Collection 'x' not found"), 1]
  ])) {
    const blind = collectionsSite({ schema_list_collections: list })
    const out = await run(
      blind,
      { tool: 'content_list', arguments: { collection: 'journal' } },
      { sleep: async () => {} }
    )
    assert.equal(out.emdash, 'COLLECTION_NOT_FOUND')
    assert.equal(out.collections, undefined)
    assert.equal(out.next, undefined, 'the bare refusal: refusalNext writes it')
    assert.equal(blind.names().filter((n) => n === 'schema_list_collections').length, reads, 'never a loop')
    const next = /** @type {any} */ (withNext(out, { platform: 'emdash', sealed: false })).next
    assert.match(next, /schema_list_collections lists the collections/)
    assert.doesNotMatch(next, /tell the customer/)
  }
})

// ── F4: the collection list carries the fields of the collections that hold records ────────────────────

/** A shop's collections: one page per product, a generic pages collection, entries with no page of their own. */
const SHOP = [
  { slug: 'site', label: 'Site chrome' },
  { slug: 'home', label: 'Home page', urlPattern: '/' },
  { slug: 'offers_page', label: 'Offers page', urlPattern: '/offers' },
  { slug: 'products', label: 'Shop', urlPattern: '/shop/{slug}' },
  { slug: 'pages', label: 'Pages', urlPattern: '/{slug}' },
  { slug: 'stock_notes', label: 'Stock notes' }
]
/** A collection as EmDash answers `schema_get_collection`: every column, most of which the model never writes with. */
const schemaOf = (/** @type {string} */ slug, /** @type {[string, string, boolean?][]} */ fields) => ({
  id: `01M36TA3XD7EGB6WZJF1A75F${slug.length}`,
  slug,
  label: slug,
  urlPattern: `/${slug}/{slug}`,
  supports: ['revisions'],
  hasSeo: false,
  sortOrder: 4,
  fields: fields.map(([name, type, required], i) => ({
    id: `F${i}`,
    collectionId: 'C1',
    slug: name,
    label: name,
    type,
    columnType: 'TEXT',
    required: required === true,
    unique: false,
    sortOrder: i
  }))
})
const SCHEMAS = {
  products: schemaOf('products', [
    ['title', 'string', true],
    ['price', 'number'],
    ['summary', 'text'],
    ['photo', 'image'],
    ['body', 'portableText']
  ]),
  pages: schemaOf('pages', [
    ['title', 'string', true],
    ['body', 'portableText']
  ]),
  stock_notes: schemaOf('stock_notes', [['note', 'text', true]])
}
/** What the site answers `schema_get_collection {slug}`: the collection's schema, or EmDash's own NOT_FOUND. */
const shopSchema = (/** @type {string} */ slug) =>
  SCHEMAS[/** @type {keyof typeof SCHEMAS} */ (slug)] !== undefined
    ? answer(SCHEMAS[/** @type {keyof typeof SCHEMAS} */ (slug)])
    : failed(`[NOT_FOUND] Collection '${slug}' not found`)
const shopSite = (/** @type {Record<string, Function>} */ on = {}, items = SHOP) =>
  fakeSite({
    on: {
      schema_list_collections: () => answer({ items }),
      schema_get_collection: (a) => shopSchema(a.slug),
      ...on
    }
  })
const gets = (/** @type {ReturnType<typeof fakeSite>} */ site) =>
  site.calls
    .filter((c) => 'name' in c && c.name === 'schema_get_collection')
    .map((c) => 'arguments' in c && c.arguments.slug)

test('🔒 F4: the collection list answers the fields of each collection that holds records — so the create needs no schema step', async () => {
  // Before: `{result:{items:[…]}}` alone, then a `schema_get_collection` step for the fields the create takes.
  const site = shopSite()
  const out = await run(site, { tool: 'schema_list_collections', arguments: {} })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual(out.recordFields, {
    products: 'title:string required, price:number, summary:text, photo:image, body:portableText',
    pages: 'title:string required, body:portableText',
    stock_notes: 'note:text required'
  })
  // the list itself is what it was: the same rows, nothing added inside `result`
  assert.deepEqual(
    out.result.items.map((/** @type {any} */ c) => c.slug),
    SHOP.map((c) => c.slug)
  )
  assert.equal(Object.hasOwn(out.result, 'recordFields'), false)
  // one read per collection, made by the door — none for a page of its own or the site chrome
  assert.deepEqual(gets(site).sort(), ['pages', 'products', 'stock_notes'])
  assert.equal(site.names()[0], 'schema_list_collections')
})

test('F4: at most six collections are read, the ones with a page first, and a site with none of them adds nothing', async () => {
  const many = [
    ...Array.from({ length: 9 }, (_, i) => ({
      slug: `kind_${i}`,
      label: `Kind ${i}`,
      urlPattern: `/k${i}/{slug}`
    })),
    { slug: 'bare', label: 'Bare' }
  ]
  const site = shopSite(
    { schema_get_collection: (a) => answer(schemaOf(a.slug, [['title', 'string', true]])) },
    many
  )
  const out = await run(site, { tool: 'schema_list_collections', arguments: {} })
  assert.deepEqual(Object.keys(out.recordFields), [
    'kind_0',
    'kind_1',
    'kind_2',
    'kind_3',
    'kind_4',
    'kind_5'
  ])
  assert.equal(gets(site).length, 6)
  // nothing that holds records: the plain list, no read, no key
  const plain = shopSite(
    {},
    SHOP.filter((c) => ['site', 'home', 'offers_page'].includes(c.slug))
  )
  const listed = await run(plain, { tool: 'schema_list_collections', arguments: {} })
  assert.equal(listed.ok, true)
  assert.equal(Object.hasOwn(listed, 'recordFields'), false)
  assert.equal(gets(plain).length, 0)
})

test('🔒 F4 fails open: a read the site refuses, answers badly or throws costs only that collection — the list itself always comes', async () => {
  for (const [name, schema] of /** @type {[string, Function][]} */ ([
    ['a refusal', () => failed('[NOT_FOUND] Collection gone')],
    ['a transport failure', () => ({ ok: false, code: 'SITE_UNREACHABLE', error: 'timed out' })],
    ['an answer that is not a schema', () => answer({ surprise: 1 })],
    ['an answer with no field', () => answer({ slug: 'products', fields: [] })],
    [
      'a read that throws',
      () => {
        throw new Error('exec chain broke')
      }
    ]
  ])) {
    const site = shopSite({
      schema_get_collection: (a) => (a.slug === 'products' ? schema() : shopSchema(a.slug))
    })
    const out = await run(site, { tool: 'schema_list_collections', arguments: {} })
    assert.equal(out.ok, true, name)
    assert.equal(out.result.items.length, SHOP.length, name)
    assert.deepEqual(Object.keys(out.recordFields).sort(), ['pages', 'stock_notes'], name)
  }
  // every read failing: the answer is the plain list, byte for byte what it was before this existed
  const blind = shopSite({ schema_get_collection: () => failed('[INTERNAL_ERROR] database is locked') })
  const out = await run(blind, { tool: 'schema_list_collections', arguments: {} })
  const plain = await run(
    shopSite({}, SHOP),
    { tool: 'schema_list_collections', arguments: {} },
    { fieldsToo: false }
  )
  assert.equal(out.ok, true)
  assert.equal(Object.hasOwn(out, 'recordFields'), false)
  assert.deepEqual(out, plain)
})

test('F4: the model’s own list is answered with fields, the list a refusal adds is not — and raw keeps EmDash’s shape', async () => {
  // A refusal for a collection the site lacks reads the list once (`collectionsAnswer`): names only, no schema read.
  const site = shopSite({
    content_list: (a) =>
      a.collection === 'shopfront'
        ? failed("[COLLECTION_NOT_FOUND] Collection 'shopfront' not found")
        : undefined
  })
  const refused = await run(site, { tool: 'content_list', arguments: { collection: 'shopfront' } })
  assert.equal(refused.emdash, 'COLLECTION_NOT_FOUND')
  assert.ok(refused.collections.products)
  assert.equal(gets(site).length, 0, 'a refusal adds one list read and no schema read')
  assert.equal(Object.hasOwn(refused, 'recordFields'), false)
  // raw: EmDash's own answer, unshaped — nothing is added to it
  const raw = shopSite()
  const out = await run(raw, { tool: 'schema_list_collections', arguments: {}, raw: true })
  assert.equal(out.ok, true)
  assert.equal(Object.hasOwn(out, 'recordFields'), false)
  assert.equal(gets(raw).length, 0)
})

test('🔒 F4: a site that answers slowly is not waited for — the list comes once the limit passes, with the fields that had arrived', async () => {
  // Before any limit, one stuck read would hold the list for the exec timeout (120 s) and its one retry.
  let held = 0
  const site = shopSite({
    schema_get_collection: (a) => {
      if (a.slug !== 'products') return shopSchema(a.slug)
      held += 1
      return new Promise(() => {})
    }
  })
  const started = Date.now()
  const out = await run(site, { tool: 'schema_list_collections', arguments: {} }, { fieldsMs: 40 })
  assert.equal(out.ok, true)
  assert.ok(Date.now() - started < 2_000, `${Date.now() - started} ms`)
  assert.equal(held, 1)
  assert.deepEqual(
    Object.keys(out.recordFields),
    ['pages', 'stock_notes'],
    'the collection that did not answer is left out'
  )
  // every read stuck: the plain list
  const stuck = shopSite({ schema_get_collection: () => new Promise(() => {}) })
  const plain = await run(stuck, { tool: 'schema_list_collections', arguments: {} }, { fieldsMs: 40 })
  assert.equal(plain.ok, true)
  assert.equal(Object.hasOwn(plain, 'recordFields'), false)
})

test('a cursor nobody was given is refused with the way to a real one, not "tell the customer"', async () => {
  const site = fakeSite({
    on: {
      content_list: (a) =>
        typeof a.cursor === 'string' && a.collection === 'articles'
          ? failed(`[INVALID_CURSOR] Invalid pagination cursor: ${a.cursor}`)
          : undefined
    }
  })
  const out = await run(site, {
    tool: 'content_list',
    arguments: { collection: 'articles', limit: 7, cursor: 'eyJvIjo3fQ==' }
  })
  assert.equal(out.emdash, 'INVALID_CURSOR')
  assert.equal(out.collections, undefined, 'no collection is missing')
  const next = /** @type {any} */ (withNext(out, { platform: 'emdash', sealed: false })).next
  assert.match(
    next,
    /^A cursor is never made by hand: send the nextCursor an earlier answer gave, exactly as it came;/
  )
  assert.match(next, /with none, the same call without cursor answers one/)
  assert.doesNotMatch(next, /tell the customer|another way/)
  assert.ok(next.length <= 200)
})

test('a list field sent as the items that change is merged onto the list as the read answered it', () => {
  const stored = {
    why_items: [
      { title: 'A', text: 'a' },
      { title: 'B', text: 'b' },
      { title: 'C', text: 'c' }
    ],
    title: 'Home'
  }
  const one = mergeListPatches({ why_items: { 1: { text: 'b2' } } }, stored)
  assert.deepEqual(one.data.why_items, [
    { title: 'A', text: 'a' },
    { title: 'B', text: 'b2' },
    { title: 'C', text: 'c' }
  ])
  assert.deepEqual(one.fields, ['why_items'])
  const more = mergeListPatches(
    { why_items: { 0: null, 2: { title: 'C2' }, '+': [{ title: 'D', text: 'd' }] } },
    stored
  )
  assert.deepEqual(
    more.data.why_items,
    [
      { title: 'B', text: 'b' },
      { title: 'C2', text: 'c' },
      { title: 'D', text: 'd' }
    ],
    'positions are the list as read: removing 0 does not shift 2'
  )
  // A whole list, a field that is not a list, an object with other keys: sent on untouched.
  const whole = [{ title: 'X' }]
  assert.equal(mergeListPatches({ why_items: whole }, stored).data.why_items, whole)
  assert.deepEqual(mergeListPatches({ title: { 0: 'x' } }, stored).fields, [])
  assert.deepEqual(mergeListPatches({ why_items: { title: 'x' } }, stored).fields, [])
  // A list sent whole keeps each stored row's _rowId by position; a row past them stays new (24/10/2026).
  const team = [
    { _rowId: 'r0', name: 'Ann' },
    { _rowId: 'r1', name: 'Bo' }
  ]
  const rewritten = mergeListPatches({ team: [{ name: 'Cara' }, { name: 'Dee' }, { name: 'Eli' }] }, { team })
  assert.deepEqual(rewritten.data.team, [
    { name: 'Cara', _rowId: 'r0' },
    { name: 'Dee', _rowId: 'r1' },
    { name: 'Eli' }
  ])
  assert.deepEqual(rewritten.rows, ['team'])
  // A position outside the list is refused, naming the range.
  const out = mergeListPatches({ why_items: { 3: { text: 'x' } } }, stored)
  assert.match(out.refusal.error, /has 3 items \(positions 0–2\); there is no item 3/)
  assert.match(
    mergeListPatches({ why_items: { '+': { title: 'x' } } }, stored).refusal.error,
    /must be a list/
  )
})

test('content_update with a list patch writes the whole merged list, from the read it makes anyway', async () => {
  const site = fakeSite()
  const services = A.homeGet.item.data.services_items
  const out = await run(site, {
    tool: 'content_update',
    arguments: {
      collection: 'home',
      id: HOME_ID,
      data: { services_items: { 2: { title: 'Boat interiors' } } },
      status: 'published'
    }
  })
  assert.equal(out.ok, true)
  assert.equal(writesOf(site).length, 1)
  const sent = writesOf(site)[0].arguments.data.services_items
  assert.equal(sent.length, services.length)
  assert.deepEqual(sent[2], { ...services[2], title: 'Boat interiors' })
  assert.deepEqual(sent[0], services[0])
  assert.ok(out.normalized.some((n) => /services_items: the items sent were merged/.test(n)))
  const bad = fakeSite()
  const refused = await run(bad, {
    tool: 'content_update',
    arguments: { collection: 'home', id: HOME_ID, data: { services_items: { 9: { title: 'x' } } } }
  })
  assert.equal(refused.ok, false)
  assert.deepEqual(writesOf(bad), [], 'nothing written')
})

const KIT = JSON.parse(readFileSync(new URL('./fixtures/emdash/kit-slides-v6.json', import.meta.url), 'utf8'))
/**
 * A site holding pages/kit-slides in en and ru as the bench's read answered them. `drafts` puts a
 * waiting change on those locales (the draft revision a `revision_restore` makes); `revision_restore`
 * stages the live revision it names as the entry's draft, as EmDash 0.37 does for a revisions collection.
 * @param {{ drafts?: string[] }} [opts]
 */
function kitSite({ drafts = [] } = {}) {
  const waiting = new Set(drafts)
  /** @param {string} locale */
  const entry = (locale) => {
    const { item, _rev } = KIT.entries[locale]
    return waiting.has(locale)
      ? { item: { ...item, draftRevisionId: `DRAFT-${locale}`, liveData: item.data }, _rev }
      : { item, _rev }
  }
  /** @param {Record<string, unknown>} args */
  const localeOf = (args) => (args.locale === 'ru' || args.id === KIT.entries.ru.item.id ? 'ru' : 'en')
  const site = fakeSite({
    served: ['en', 'ru'],
    on: {
      content_get: (args) => answer(entry(localeOf(args))),
      content_update: (args) => {
        const locale = localeOf(args)
        const { item } = entry(locale)
        if (args.status === 'published') waiting.delete(locale)
        return answer({
          item: {
            ...item,
            data: { ...item.data, ...args.data },
            ...(args.status === 'published' ? { draftRevisionId: null, liveData: undefined } : {})
          },
          _rev: 'bmV3LXJldg=='
        })
      },
      revision_restore: (args) => {
        const locale = Object.keys(KIT.entries).find(
          (l) => KIT.entries[l].item.liveRevisionId === args.revisionId
        )
        if (locale === undefined) return failed('[NOT_FOUND] Revision not found')
        waiting.add(locale)
        return answer(entry(locale))
      }
    }
  })
  return { ...site, waiting }
}

test('the partial `sample` the bench sent is merged into the value as it stands — no key lost, no HTTP 500', async () => {
  const site = kitSite()
  const stored = KIT.entries.en.item.data.sample
  const out = await run(site, {
    tool: 'content_update',
    arguments: {
      collection: 'pages',
      id: 'kit-slides',
      locale: 'en',
      status: 'published',
      data: KIT.sent.en
    }
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  const sent = site.calls.find((c) => c.name === 'content_update').arguments.data.sample
  assert.deepEqual(Object.keys(sent), Object.keys(stored), 'every key of the stored value is still there')
  assert.deepEqual(sent.slides, stored.slides, 'the slides and their pictures are untouched')
  assert.deepEqual(
    sent.pal[3],
    { n: 'Signal', v: '#1F3A5F', c: 'rgba(31,58,95,.996)' },
    'the name the patch did not send is kept'
  )
  assert.deepEqual(sent.pal.slice(0, 3), stored.pal.slice(0, 3))
  assert.equal(sent.rules[3], 'Signal navy is an accent only — one per slide at most.')
  assert.deepEqual(sent.rules.slice(0, 3), stored.rules.slice(0, 3))
  assert.ok(
    out.normalized.some((n) =>
      /^sample: merged into its value as it stands; kept h1, sub, meta, libT \+12$/.test(n)
    ),
    String(out.normalized)
  )
})

test('structured patches — a media item swapped is sent whole, its alt changed is merged, a list where a list stands is replaced', () => {
  const photo = {
    id: 'M1',
    provider: 'local',
    src: '/m/1.png',
    width: 1200,
    height: 760,
    alt: 'Frame erection'
  }
  const stored = {
    hero_image: photo,
    sample: { h1: 'Slides', slides: [{ n: '01', image: photo }], rules: ['a', 'b'] },
    title: 'Kit'
  }
  // Another picture: the old one's src and size would lie about it — written as sent.
  const swapped = mergeListPatches({ hero_image: { id: 'M2', provider: 'local' } }, stored)
  assert.deepEqual(swapped.data.hero_image, { id: 'M2', provider: 'local' })
  assert.deepEqual(swapped.objects, [])
  // The same picture, a new alt: every cached key stays.
  const alt = mergeListPatches({ hero_image: { alt: 'Frame, 2024' } }, stored)
  assert.deepEqual(alt.data.hero_image, { ...photo, alt: 'Frame, 2024' })
  assert.deepEqual(alt.objects, [{ field: 'hero_image', kept: ['id', 'provider', 'src', 'width', 'height'] }])
  // Inside a list item, at any depth.
  const deep = mergeListPatches({ sample: { slides: { 0: { image: { alt: 'x' } } } } }, stored)
  assert.deepEqual(deep.data.sample.slides[0].image, { ...photo, alt: 'x' })
  assert.equal(deep.data.sample.h1, 'Slides')
  // A whole list where a list stands is the new list; a whole value with every key is sent as is.
  const list = mergeListPatches({ sample: { rules: ['c'] } }, stored)
  assert.deepEqual(list.data.sample.rules, ['c'])
  const whole = { h1: 'New', slides: [], rules: [] }
  assert.deepEqual(mergeListPatches({ sample: whole }, stored), {
    data: { sample: whole },
    fields: [],
    objects: [],
    rows: [],
    refusal: null
  })
  // An object where a list stands inside the value names no item: refused, the path named.
  const odd = mergeListPatches({ sample: { rules: { first: 'c' } } }, stored)
  assert.match(odd.refusal.error, /^sample\.rules is a list of 2 items; an object there would replace it/)
  assert.equal(odd.refusal.field, 'sample')
  const past = mergeListPatches({ sample: { slides: { 4: { n: '05' } } } }, stored)
  assert.match(past.refusal.error, /^sample\.slides has 1 items \(positions 0–0\); there is no item 4\./)
})

const KIT_EN = KIT.entries.en.item
const KIT_RU = KIT.entries.ru.item

const kitWrite = {
  tool: 'content_update',
  arguments: { collection: 'pages', id: KIT_EN.id, status: 'published', data: KIT.sent.en }
}
const restoreEn = { tool: 'revision_restore', arguments: { revisionId: KIT_EN.liveRevisionId } }

test("restoring exactly the revision this conversation's receipt named leaves a draft it may publish", async () => {
  const site = kitSite()
  const state = createEmdashState()
  const write = await run(site, kitWrite, { state })
  assert.match(write.result.undo, new RegExp(`^revision_restore \\{revisionId:"${KIT_EN.liveRevisionId}"\\}`))
  await run(site, restoreEn, { state })
  assert.equal(state.isStaged('session-a', `${SITE.label}:${KIT_EN.id}`), true)

  const published = await run(
    site,
    { tool: 'content_publish', arguments: { collection: 'pages', id: KIT_EN.id } },
    { state }
  )

  assert.equal(published.ok, true, JSON.stringify(published).slice(0, 300))
})

test('the restore is spent — a second restore of the same revision is nobody’s own any more', async () => {
  const site = kitSite()
  const state = createEmdashState()
  await run(site, kitWrite, { state })
  await run(site, restoreEn, { state })
  state.unstage('session-a', `${SITE.label}:${KIT_EN.id}`)

  await run(site, restoreEn, { state })

  assert.equal(state.isStaged('session-a', `${SITE.label}:${KIT_EN.id}`), false)
})

{
  const publish = { tool: 'content_publish', arguments: { collection: 'pages', id: KIT_EN.id } }
  const cases = [
    {
      label: 'the model calls it on its own',
      arrange: async (site, state) => void (await run(site, restoreEn, { state })),
      staged: [],
      publishCode: 'PENDING_DRAFT'
    },
    {
      label: 'session-b uses session-a’s receipt',
      arrange: async (site, state) => {
        await run(site, kitWrite, { state })
        await run(site, restoreEn, { state, sessionId: 'session-b' })
      },
      staged: [['session-b', KIT_EN.id, false]]
    },
    {
      label: 'the ru revision is not en’s',
      arrange: async (site, state) => {
        await run(site, kitWrite, { state })
        await run(
          site,
          { tool: 'revision_restore', arguments: { revisionId: KIT_RU.liveRevisionId } },
          { state }
        )
      },
      staged: [
        ['session-a', KIT_RU.id, false],
        ['session-a', KIT_EN.id, false]
      ]
    }
  ]
  for (const { label, arrange, staged, publishCode } of cases)
    test(`a restore nobody named — no receipt, another conversation, another revision — stages nothing this conversation may publish: ${label}`, async () => {
      const site = kitSite()
      const state = createEmdashState()

      await arrange(site, state)

      for (const [session, id, expected] of staged)
        assert.equal(state.isStaged(session, `${SITE.label}:${id}`), expected, label)
      if (publishCode) assert.equal((await run(site, publish, { state })).code, publishCode, label)
    })
}

const kitPublish = (id, extra = {}) => ({
  tool: 'content_publish',
  arguments: { collection: 'pages', id },
  ...extra
})

test("PENDING_DRAFT: the agent's own confirm is nobody's word, on either language copy", async () => {
  const memory = fakeMemory()
  const state = createEmdashState()
  const site = kitSite({ drafts: ['en', 'ru'] })
  const plain = await run(site, kitPublish(KIT_EN.id), { memory, state })

  const own = await run(site, kitPublish(KIT_RU.id, { confirm: true }), { memory, state })

  assert.deepEqual([plain.code, own.code], ['PENDING_DRAFT', 'PENDING_DRAFT'])
})

test("PENDING_DRAFT: one customer yes covers the same operation on the entry's other language copy — no second card", async () => {
  const memory = fakeMemory()
  const state = createEmdashState()
  const site = kitSite({ drafts: ['en', 'ru'] })
  await run(site, kitPublish(KIT_EN.id), { memory, state })
  memory.customerAnswered('session-a')
  assert.equal((await run(site, kitPublish(KIT_EN.id, { confirm: true }), { memory, state })).ok, true)

  const ru = await run(site, kitPublish(KIT_RU.id, { confirm: true }), { memory, state })

  assert.equal(ru.ok, true, JSON.stringify(ru).slice(0, 300))
})

test('PENDING_DRAFT: the carry needs confirm:true and is never inherited by another session', async () => {
  const memory = fakeMemory()
  const state = createEmdashState()
  const site = kitSite({ drafts: ['en', 'ru'] })
  await run(site, kitPublish(KIT_EN.id), { memory, state })
  memory.customerAnswered('session-a')
  await run(site, kitPublish(KIT_EN.id, { confirm: true }), { memory, state })

  const withoutConfirm = await run(site, kitPublish(KIT_RU.id), { memory, state })
  const otherSession = await run(site, kitPublish(KIT_RU.id, { confirm: true }), {
    memory,
    state,
    sessionId: 'session-b'
  })

  assert.deepEqual([withoutConfirm.code, otherSession.code], ['PENDING_DRAFT', 'PENDING_DRAFT'])
})

{
  const business = { ...ARTIFACT, templateId: 'tracy-business' }
  const update = (collection, id, seo) => ({
    tool: 'content_update',
    arguments: { collection, id, seo, status: 'published' }
  })
  const cases = [
    {
      label: 'description on tracy-business',
      artifact: business,
      call: update('contact', 'contact', { description: 'New words' }),
      refused: true,
      next: /lede.*breadcrumb|breadcrumb.*lede/s
    },
    {
      label: 'noIndex on tracy-business',
      artifact: business,
      call: update('home', 'home', { noIndex: true }),
      refused: false,
      next: /^/
    },
    {
      label: 'description on another template',
      artifact: { ...ARTIFACT, templateId: 'other' },
      call: update('home', 'home', { description: 'x' }),
      refused: false,
      next: /^/
    }
  ]
  for (const { label, artifact, call, refused, next } of cases)
    test(`tracy-business: seo.title/description on content_update is refused with the lede road; noIndex passes; another template keeps the panel: ${label}`, async () => {
      const site = fakeSite()

      const out = await run(site, call, { artifact })

      assert.equal(out.code === 'SEO_NOT_RENDERED', refused, label)
      assert.match(out.next ?? '', next, label)
      assert.equal(writesOf(site).length > 0, !refused, label)
    })
}

{
  // ADR 0034 (council 19/10/2026): EmDash keeps no undo for these, and the public site shows them at once.
  const calls = [
    {
      call: { tool: 'content_unpublish', arguments: { collection: 'posts', id: HOME_ID, _rev: 'r' } },
      reason: 'hides'
    },
    { call: { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } }, reason: 'site' },
    { call: { tool: 'settings_update', arguments: { title: 'Nhà Xưởng' } }, reason: 'site' }
  ]
  for (const { call, reason } of calls)
    test(`🔒 (tracy_emdash): an entry off the site, the menu, the settings ask the customer first, and one yes opens one call: ${call.tool}`, async () => {
      const { createCallMemory } = await import('../src/host/call-memory.mjs')
      const memory = createCallMemory()
      const site = fakeSite()

      const asked = await run(site, call, { memory })
      const unasked = await run(site, { ...call, confirm: true }, { memory })

      assert.deepEqual([asked.code, asked.consequence], ['CONFIRM_FIRST', reason])
      assert.equal(unasked.code, 'CONFIRM_FIRST', "the agent's own confirm is not the customer's word")
      assert.deepEqual(writesOf(site), [], 'nothing written before the yes')

      const done = await runAgreed(site, call, { memory })
      const again = await run(site, { ...call, confirm: true }, { memory })

      assert.equal(done.ok, true)
      assert.equal(writesOf(site).length, 1)
      assert.equal(again.code, 'CONFIRM_FIRST', 'the yes is spent: the same call asks again')
    })
}

// 20/10/2026, staff on real customer sites: "when Tracy fixes one place it often breaks another place". The
// model's own update of the `site` entry (what every page's header and footer print) asks first, nothing sent;
// the customer's yes opens it. A door's own step (`modelCall` left out) runs as before.
test('the model’s own update of the site entry asks first, naming every page; its yes opens it once', async () => {
  const site = fakeSite()
  const memory = fakeMemory()
  const update = {
    tool: 'content_update',
    arguments: { collection: 'site', id: 'site', _rev: A.homeGet._rev, data: { phone: '0909 123 456' } }
  }
  const asked = await run(site, update, { memory, modelCall: true })
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(asked.consequence, 'shared')
  assert.match(asked.ask.questions[0].question, /on every page, not this page alone/)
  assert.deepEqual(writesOf(site), [], 'nothing written before the customer answers')
  const agreed = await runAgreed(fakeSite(), update, { modelCall: true })
  assert.notEqual(agreed.code, 'CONFIRM_FIRST')
  // a build's saved plan is the customer's yes; without one it still asks (pilot 24/10/2026)
  const planned = fakeSite()
  const built = await run(planned, update, {
    memory: fakeMemory(),
    modelCall: true,
    planAgreed: async () => true
  })
  assert.notEqual(built.code, 'CONFIRM_FIRST')
  assert.equal(writesOf(planned).length, 1)
  const unplanned = await run(fakeSite(), update, {
    memory: fakeMemory(),
    modelCall: true,
    planAgreed: async () => false
  })
  assert.equal(unplanned.code, 'CONFIRM_FIRST')
  const other = await run(
    fakeSite(),
    { ...update, arguments: { ...update.arguments, collection: 'pages', id: 'about' } },
    {
      memory: fakeMemory(),
      modelCall: true
    }
  )
  assert.notEqual(other.code, 'CONFIRM_FIRST')
})

test('🔒 (tracy_emdash): an entry taken off the site is asked about by its title, read first; an unreadable one is not asked about', async () => {
  const { createCallMemory } = await import('../src/host/call-memory.mjs')
  const named = fakeSite({
    on: {
      content_get: () =>
        answer({ item: { id: HOME_ID, slug: 'kaluga', data: { title: '500,000 work hours in Kaluga' } } })
    }
  })
  const asked = await run(
    named,
    { tool: 'content_unpublish', arguments: { collection: 'posts', id: HOME_ID, locale: 'en', _rev: 'r' } },
    { memory: createCallMemory() }
  )
  const dark = fakeSite({ on: { content_get: () => failed('[NOT_FOUND] Content item not found') } })
  const unread = await run(
    dark,
    { tool: 'content_unpublish', arguments: { collection: 'posts', id: HOME_ID, _rev: 'r' } },
    { memory: createCallMemory() }
  )

  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(
    asked.ask.questions[0].question,
    'This takes "500,000 work hours in Kaluga" (en) off your site\'s pages; it stays as a draft. Go ahead?'
  )
  assert.equal(unread.code, 'TARGET_UNREAD')
  assert.deepEqual(writesOf(dark), [], 'nothing unpublished')
})

// 🔒 Review of round 12 (26/10/2026): the residue sweep writes an EmDash template entry's research body on a read
// made for it, as on WordPress and Joomla; the same write from anywhere else keeps the guard.
test("🔒 EmDash body guard: the sweep's research body passes on a read made for it, the same write elsewhere is BODY_SHRINK", async () => {
  const { emdashBodyGuard } = await import('../src/host/emdash-call.mjs')
  const { withSweepRead } = await import('../src/host/site-call.mjs')
  const block = (text) => ({
    _type: 'block',
    _key: 'k',
    style: 'normal',
    children: [{ _type: 'span', _key: 'ks', text, marks: [] }]
  })
  const lorem = [block('Lorem ipsum dolor sit amet of the template. '.repeat(30))]
  const input = (read) => ({
    collection: 'posts',
    id: 'p1',
    data: { content: [block('Groups of 5 to 20 can book.')] },
    stored: { content: lorem },
    memory: { readOf: () => read },
    sessionId: 'session-e',
    removes: null,
    customerWords: () => ''
  })
  const read = { chars: 1320, baseline: 1320 }
  const swept = withSweepRead(async () => emdashBodyGuard(input(read)))
  const out = await swept
  assert.equal(out.refuse, undefined, JSON.stringify(out.refuse))
  assert.equal(out.reset, true)
  assert.equal(emdashBodyGuard(input(read)).refuse?.code, 'BODY_SHRINK')
  assert.equal((await withSweepRead(async () => emdashBodyGuard(input(null)))).refuse?.code, 'BODY_SHRINK')
})

// Local round 20, 25/10/2026: an EmDash build sent a row with its `_rowId` copied wrong.
test('mergeListPatches: a row sent with a _rowId no stored row has takes the one at its position; a stored one is kept', () => {
  const stored = {
    facts: [
      { _rowId: '7252ba1b-cd56-428b-ab89-d283495ceab2', label: 'a' },
      { _rowId: '11111111-0000-4000-8000-000000000000', label: 'b' }
    ]
  }
  const out = mergeListPatches(
    {
      facts: [
        { _rowId: '7252ba1b-cd5d-4d31-a0ae-0d0f21ea5b23', label: 'A' },
        { _rowId: '11111111-0000-4000-8000-000000000000', label: 'B' },
        { label: 'C' }
      ]
    },
    stored
  )
  assert.deepEqual(
    out.data.facts.map((r) => r._rowId),
    ['7252ba1b-cd56-428b-ab89-d283495ceab2', '11111111-0000-4000-8000-000000000000', undefined]
  )
})

// Local round 21, 25/10/2026: an EmDash build dropped list rows, then put them back with new ids.
test('reuseRemovedRowIds: a row a write left out comes back with its _rowId; a kept one is untouched', () => {
  const bank = createEmdashState().rowBank('site\0about\0e1\0en')
  const stored = {
    geo_list: [
      { _rowId: 'r1', city: 'a' },
      { _rowId: 'r2', city: 'b' },
      { _rowId: 'r3', city: 'c' }
    ]
  }
  // r3 left out: banked, nothing reused yet.
  const dropped = reuseRemovedRowIds({ geo_list: [stored.geo_list[0], stored.geo_list[1]] }, stored, bank)
  assert.deepEqual(dropped.back, [])
  // Put back with no id, then with a made-up one: each takes r3 in turn (one left in the bank after the first).
  const shorter = { geo_list: [stored.geo_list[0], stored.geo_list[1]] }
  const again = reuseRemovedRowIds({ geo_list: [...shorter.geo_list, { city: 'C' }] }, shorter, bank)
  assert.deepEqual(again.back, ['geo_list'])
  assert.deepEqual(
    again.data.geo_list.map((r) => r._rowId),
    ['r1', 'r2', 'r3']
  )
  const none = reuseRemovedRowIds({ geo_list: [...shorter.geo_list, { city: 'D' }] }, shorter, bank)
  assert.deepEqual(none.back, [], 'the bank is spent')
})
