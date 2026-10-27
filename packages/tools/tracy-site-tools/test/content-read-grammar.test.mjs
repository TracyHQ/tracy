/**
 * `content.read` grammar, round 7 (30/09/2026): what the model is told when a read is refused, and the
 * two mistakes the tool corrects by itself. Bench, 14 runs on Joomla and WordPress (22 wasted calls):
 *   - `locale:"en"` for a site that lists `en-GB` — refused, and the model typed the tag the message named;
 *   - `{view:"pages", url:"/"}` on a multilingual Joomla site — `pages: []`, the home lives at `/en`;
 *   - `{id: 42}`, the post number a pick's mark carries — CONTENT_NOT_FOUND, "refresh the list".
 * The `fields` keys are in `normalize-content-read.test.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { projectionOf } from '../../../../apps/tracy-web/src/sites/content-fields.js'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { addressAgain, localeAgain, unprefixedMiss } from '../src/host/content-read-again.mjs'
import { normalizeFields } from '../src/host/content-read-fields.mjs'
import { planCall, refusalNext } from '../src/host/site.mjs'
import { contentReadNext, runSiteCall } from '../src/host/site-call.mjs'

/**
 * A relay that answers from a script and records every call.
 * @param {(action: string, params: Record<string, any>, n: number) => unknown} answer
 */
function relay(answer) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    return answer(action, params, sent.length)
  }
  return { sent, send }
}

/** @param {Record<string, any>} over */
const joomla = (over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-a',
  label: 'j-multi',
  actorKey: 'ana@example.com',
  facts: { platform: 'joomla', sealed: true },
  sleep: async () => {},
  ...over
})

/** @param {unknown} args */
const plan = (args) => {
  const p = planCall(args)
  assert.ok(p.ok, JSON.stringify(p))
  return p
}

const SITE = { id: 's-1', url: 'https://demo.example', defaultLocale: null, locales: ['en-GB', 'ru-RU'] }
/** The refusal the relay words for a language the site lists under another tag. */
const REFUSED = (/** @type {string} */ asked, /** @type {string} */ hint = '; use "en-GB"') => ({
  ok: false,
  httpStatus: 400,
  error: {
    code: 'CONTENT_BAD_QUERY',
    message: `locale "${asked}" is not one of this site's locales: en-GB, ru-RU${hint}`
  }
})
const LISTING = {
  schemaVersion: 'tracy-content/v1',
  site: SITE,
  contents: [{ id: 'content_a', title: 'Home' }]
}

test('the relay words the locale refusal the way this tool reads it (apps/tracy-web route.js)', () => {
  const source = readFileSync(
    new URL('../../../../apps/tracy-web/src/sites/route.js', import.meta.url),
    'utf8'
  )
  assert.ok(source.includes("is not one of this site's locales: ${shown}"))
  assert.ok(source.includes('`; use ${JSON.stringify(same[0])}`'))
  // `use` only when exactly one listed locale shares the language: that is what makes it no guess.
  assert.ok(source.includes('same.length === 1'))
})

test('localeAgain: only a refusal that names ONE tag, and only for the locale that was sent', () => {
  const again = localeAgain({ type: 'page', locale: 'en', limit: 5 }, REFUSED('en'))
  assert.deepEqual(again?.params, { type: 'page', locale: 'en-GB', limit: 5 })
  assert.match(again?.note ?? '', /^locale "en" is "en-GB" here/)
  assert.ok((again?.note ?? '').length <= 90)
  // No tag named (the language matches none, or more than one): nothing is guessed.
  assert.equal(localeAgain({ locale: 'vi' }, REFUSED('vi', '')), null)
  // Another refusal, an answer, a call without locale, the tag already sent: nothing to repeat.
  assert.equal(
    localeAgain({ locale: 'en' }, { ok: false, error: { code: 'CONTENT_NOT_FOUND', message: 'x' } }),
    null
  )
  assert.equal(localeAgain({ locale: 'en' }, LISTING), null)
  assert.equal(localeAgain({ type: 'page' }, REFUSED('en')), null)
  assert.equal(localeAgain({ locale: 'en-GB' }, REFUSED('en-GB')), null)
  assert.equal(localeAgain(null, REFUSED('en')), null)
})

test('🔒 a locale the site lists under another tag is read with that tag in the same call, and said', async () => {
  const { sent, send } = relay((_action, params) =>
    params.locale === 'en-GB' ? LISTING : REFUSED(String(params.locale))
  )
  const answer = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send }),
      plan: plan({ action: 'content.read', params: { type: 'page', locale: 'en' } })
    })
  )
  assert.deepEqual(
    sent.map(([action, params]) => [action, params.locale]),
    [
      ['content.read', 'en'],
      ['content.read', 'en-GB']
    ]
  )
  assert.equal(answer.schemaVersion, 'tracy-content/v1')
  assert.ok(
    answer.normalized.some((/** @type {string} */ note) => note.startsWith('locale "en" is "en-GB" here'))
  )
})

test('a refusal that names no tag, or a second refusal, goes to the model as the relay worded it', async () => {
  // No single tag: one send, the refusal, and a next that says what to do with the tags it lists.
  const none = relay(() => REFUSED('vi', ''))
  const first = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: none.send }),
      plan: plan({ action: 'content.read', params: { type: 'page', locale: 'vi' } })
    })
  )
  assert.equal(none.sent.length, 1)
  assert.equal(first.error.code, 'CONTENT_BAD_QUERY')
  assert.match(first.next, /one of the tags the message lists/)
  // The corrected call is refused too: the FIRST refusal is answered, the read was sent twice at most.
  const stubborn = relay(() => REFUSED('en'))
  const second = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: stubborn.send }),
      plan: plan({ action: 'content.read', params: { type: 'page', locale: 'en' } })
    })
  )
  assert.equal(stubborn.sent.length, 2)
  assert.equal(second.error.code, 'CONTENT_BAD_QUERY')
  assert.match(second.next, /locale:"en-GB"/)
  assert.equal(second.normalized, undefined)
})

test('the locale next names the tag the relay named, or the tags it listed — within T10', () => {
  const named = refusalNext(REFUSED('en'), { action: 'content.read', platform: 'joomla' }) ?? ''
  assert.equal(named, 'Send the same call with locale:"en-GB", the tag this site lists for that language.')
  const listed = refusalNext(REFUSED('vi', ''), { action: 'content.read' }) ?? ''
  assert.match(listed, /^locale is one of the tags the message lists/)
  for (const next of [named, listed]) assert.ok(next.length <= 200, next)
  // Any other bad query keeps the field-fixing sentence.
  const limit = refusalNext({
    ok: false,
    error: { code: 'CONTENT_BAD_QUERY', message: 'limit must be 1-100' }
  })
  assert.match(limit ?? '', /^Fix the one field its message names/)
})

test('🔒 a CMS number given as a content id is said to be one, with the road to the real id', async () => {
  const notFound = {
    ok: false,
    httpStatus: 404,
    error: { code: 'CONTENT_NOT_FOUND', message: 'Content not found.' }
  }
  for (const id of [42, '441']) {
    const { send } = relay(() => notFound)
    const answer = /** @type {any} */ (
      await runSiteCall({ ...joomla({ send }), plan: plan({ action: 'content.read', params: { id } }) })
    )
    assert.match(answer.next, new RegExp(`^${id} is a CMS number, not a content id`), String(id))
    assert.match(answer.next, /\{view:"pages", url:"\/…"\}/)
    assert.ok(answer.next.length <= 200, `${answer.next.length}`)
  }
  // An opaque id that is simply not there keeps the general sentence; so does a refusal with no params.
  const { send } = relay(() => notFound)
  const opaque = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send }),
      plan: plan({ action: 'content.read', params: { id: 'content_9f2a' } })
    })
  )
  assert.match(opaque.next, /^Refresh the authorized content list/)
  assert.match(refusalNext(notFound) ?? '', /^Refresh the authorized content list/)
  assert.match(refusalNext(notFound, { asked: { id: 42.5 } }) ?? '', /^Refresh/)
  assert.match(refusalNext(notFound, { asked: { id: '42abc' } }) ?? '', /^Refresh/)
})

test('🔒 a link that shows no page says what to try: the language prefix, or one language’s list', () => {
  const empty = (/** @type {string[]} */ locales) => ({
    schemaVersion: 'tracy-content-pages/v1',
    site: { ...SITE, locales },
    link: '/',
    pages: [],
    truncated: false
  })
  const several = /** @type {any} */ (contentReadNext(empty(['en-GB', 'ru-RU']), true))
  assert.equal(several.next.action, 'content.read')
  assert.deepEqual(several.next.params, { view: 'pages', locale: '<a locale of site.locales>' })
  assert.match(
    several.next.why,
    /^No page has this address\. On a site in several languages an address may start with its language \(\/en, \/en\/about\)/
  )
  const one = /** @type {any} */ (contentReadNext(empty(['en-GB']), true))
  assert.deepEqual(one.next.params, { view: 'pages' })
  assert.match(one.next.why, /^No page has this address: check it/)
  for (const answer of [several, one]) assert.ok(answer.next.why.length <= 200, `${answer.next.why.length}`)
  // A list that found pages, a listing with no link asked (an empty site), and an answer with its own next: left alone.
  const found = { ...empty(['en-GB', 'ru-RU']), pages: [{ id: 'content_a', path: '/en' }] }
  assert.equal(contentReadNext(found, true), found)
  const { link: _link, ...unlinked } = empty(['en-GB', 'ru-RU'])
  assert.equal(contentReadNext(unlinked, true), unlinked)
  const own = { ...empty(['en-GB', 'ru-RU']), next: 'keep me' }
  assert.equal(contentReadNext(own, true), own)
})

test('the empty pages answer reaches the model with that next, through the tool', async () => {
  const { send } = relay(() => ({
    schemaVersion: 'tracy-content-pages/v1',
    site: SITE,
    link: '/',
    pages: [],
    truncated: false
  }))
  const answer = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send }),
      plan: plan({ action: 'content.read', params: { view: 'pages', url: '/' } })
    })
  )
  assert.deepEqual(answer.pages, [])
  assert.match(answer.next.why, /^No page has this address/)
})

test('the describe’s next shows a `fields` call the relay accepts and the tool sends as it is', () => {
  const described = /** @type {any} */ (
    contentReadNext(
      { schemaVersion: 'tracy-content-describe/v1', site: SITE, types: [{ type: 'page', count: 3 }] },
      false
    )
  )
  const example = /fields:"([^"]+)"/.exec(described.next.why)?.[1] ?? ''
  assert.match(example, /revision/)
  assert.ok(Array.isArray(projectionOf(example).paths), example)
  // No note and no change: a model that copies the example is not corrected.
  assert.equal(normalizeFields(example), null)
})

// ── an address with no language prefix, on a site that serves its default language under one ────────────

/** The answer a site gives when no page has the address it was asked for. */
const NO_PAGE = (/** @type {string} */ link, /** @type {Record<string, unknown>} */ site = {}) => ({
  schemaVersion: 'tracy-content-pages/v1',
  site: { id: 's-1', url: 'https://demo.example', defaultLocale: null, locales: ['en-GB', 'ru-RU'], ...site },
  link,
  pages: [],
  truncated: false
})
const ASK = (/** @type {string} */ url, /** @type {Record<string, unknown>} */ over = {}) => ({
  view: 'pages',
  url,
  ...over
})
/** What `collect-site-facts.mjs` measures of a Joomla site with the language filter on. */
const JOOMLA_FACTS = {
  siteLanguage: 'en-GB',
  languagePrefixes: { 'en-GB': 'en', 'ru-RU': 'ru' },
  defaultPrefixRemoved: false
}

test('🔒 addressAgain: an address with no prefix is sent again under the prefix of the default language the site names', () => {
  // A Joomla site does not say its default in a listing (`defaultLocale: null`); its measured facts do.
  const joomla = addressAgain(ASK('/blog'), NO_PAGE('/blog'), JOOMLA_FACTS)
  assert.deepEqual(joomla?.params, { view: 'pages', url: '/en/blog' })
  assert.match(joomla?.note ?? '', /"\/blog" is "\/en\/blog"/)
  assert.match(joomla?.note ?? '', /en-GB/)
  assert.ok((joomla?.note ?? '').length <= 90, joomla?.note)
  // A WordPress site says its default in the listing itself; the prefix is the language's short code.
  const wordpress = addressAgain(
    ASK('/blog'),
    NO_PAGE('/blog', { defaultLocale: 'en-US', locales: ['en-US', 'ru-RU'] }),
    null
  )
  assert.equal(wordpress?.params.url, '/en/blog')
  // The prefix is the one the site serves, not the first half of the tag: `pt-PT` is `/pt-pt/`.
  const pt = addressAgain(ASK('/blog'), NO_PAGE('/blog', { locales: ['pt-BR', 'pt-PT'] }), {
    siteLanguage: 'pt-PT',
    languagePrefixes: { 'pt-BR': 'pt', 'pt-PT': 'pt-pt' },
    defaultPrefixRemoved: false
  })
  assert.equal(pt?.params.url, '/pt-pt/blog')
  // The home page of the default language is its prefix alone; a query and a fragment stay where they were.
  assert.equal(addressAgain(ASK('/'), NO_PAGE('/'), JOOMLA_FACTS)?.params.url, '/en')
  assert.equal(
    addressAgain(ASK('/blog?utm_source=x#top'), NO_PAGE('/blog?utm_source=x#top'), JOOMLA_FACTS)?.params.url,
    '/en/blog?utm_source=x#top'
  )
  // Every other parameter of the call is kept as it was.
  assert.deepEqual(
    addressAgain(ASK('/blog', { ifVersion: 'cv1.abc' }), NO_PAGE('/blog'), JOOMLA_FACTS)?.params,
    { view: 'pages', url: '/en/blog', ifVersion: 'cv1.abc' }
  )
})

test('addressAgain: no default language known for sure, no retry — the order of the listed locales is not an answer', () => {
  // Joomla, no facts read: the listing says no default, and its locales are sorted, not ranked.
  assert.equal(addressAgain(ASK('/blog'), NO_PAGE('/blog'), null), null)
  assert.equal(addressAgain(ASK('/blog'), NO_PAGE('/blog'), {}), null)
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog'), {
      siteLanguage: 'de-DE',
      languagePrefixes: { 'de-DE': 'de' }
    }),
    null
  )
  // A default the site says but does not list a page in is nothing to look under.
  assert.equal(addressAgain(ASK('/blog'), NO_PAGE('/blog', { defaultLocale: 'de-DE' }), null), null)
  // Prefixes measured but no language named the default: the first locale listed is not it.
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog'), {
      languagePrefixes: { 'en-GB': 'en', 'ru-RU': 'ru' },
      defaultPrefixRemoved: false
    }),
    null
  )
  // The default is the one the facts name, wherever it stands in the list the site sends.
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog', { locales: ['ru-RU', 'en-GB'] }), JOOMLA_FACTS)?.params.url,
    '/en/blog'
  )
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog', { locales: ['en-GB', 'ru-RU'] }), {
      ...JOOMLA_FACTS,
      siteLanguage: 'ru-RU'
    })?.params.url,
    '/ru/blog'
  )
  // Facts with the language filter off name no prefix: there is none to add.
  assert.equal(addressAgain(ASK('/blog'), NO_PAGE('/blog'), { siteLanguage: 'en-GB' }), null)
  // A default served WITHOUT its prefix is what `/blog` already asks for.
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog'), { ...JOOMLA_FACTS, defaultPrefixRemoved: true }),
    null
  )
})

test('addressAgain: two listed locales that share a language have no short code to guess — the prefix is the site’s to say', () => {
  // A listing that names its default gives no prefix. The short code of the tag is the site's own only when no
  // other locale shares it: with `pt-BR` and `pt-PT` (or `en-US` and `en-GB`), `/pt` and `/en` can be either
  // edition, and a wrong-language page is the one mistake this retry must not make.
  const shared = [
    { defaultLocale: 'pt-BR', locales: ['pt-BR', 'pt-PT', 'en-US'] },
    { defaultLocale: 'en-US', locales: ['en-GB', 'en-US', 'ru-RU'] },
    { defaultLocale: 'en-us', locales: ['en-GB', 'en-US'] }
  ]
  for (const site of shared)
    assert.equal(addressAgain(ASK('/blog'), NO_PAGE('/blog', site), null), null, JSON.stringify(site))
  // The default's language alone in the list is no doubt: its short code is the prefix, as before.
  assert.equal(
    addressAgain(
      ASK('/blog'),
      NO_PAGE('/blog', { defaultLocale: 'pt-BR', locales: ['pt-BR', 'en-US'] }),
      null
    )?.params.url,
    '/pt/blog'
  )
  // A site that says its own prefixes is believed whether or not its languages share a code.
  assert.equal(
    addressAgain(ASK('/blog'), NO_PAGE('/blog', { defaultLocale: 'pt-BR', locales: ['pt-BR', 'pt-PT'] }), {
      languagePrefixes: { 'pt-BR': 'pt-br', 'pt-PT': 'pt-pt' },
      defaultPrefixRemoved: false
    })?.params.url,
    '/pt-br/blog'
  )
})

test('addressAgain: only the call and the answer it is for — no language asked, a path, no page, several languages', () => {
  const miss = NO_PAGE('/blog')
  const ok = (/** @type {unknown} */ params, /** @type {unknown} */ answer = miss) =>
    addressAgain(params, answer, JOOMLA_FACTS)
  assert.ok(ok(ASK('/blog')))
  // The model named a language, a different call, an address that is not a path.
  assert.equal(ok(ASK('/blog', { locale: 'ru-RU' })), null)
  assert.equal(ok({ view: 'pages' }), null)
  assert.equal(ok({ type: 'page', url: '/blog' }), null)
  assert.equal(ok(ASK(42)), null)
  assert.equal(
    ok(ASK('https://demo.example/blog')),
    null,
    'a pasted link carries the prefix the visitor sees'
  )
  assert.equal(ok(ASK('demo.example/blog')), null)
  assert.equal(ok(null), null)
  // An address that already starts with a language: the tag, its short code, the site's own prefix, any case.
  for (const url of ['/en/blog', '/ru/blog', '/EN/blog', '/en-gb/blog', '/ru-RU', '/ru'])
    assert.equal(ok(ASK(url)), null, url)
  assert.equal(
    addressAgain(ASK('/pt-pt/blog'), NO_PAGE('/pt-pt/blog', { locales: ['pt-BR', 'pt-PT'] }), {
      siteLanguage: 'pt-PT',
      languagePrefixes: { 'pt-BR': 'pt', 'pt-PT': 'pt-pt' }
    }),
    null
  )
  // The site answered with a page, with a refusal, with something that is not the pages document, or has one language.
  assert.equal(ok(ASK('/blog'), { ...miss, pages: [{ id: 'content_a' }] }), null)
  assert.equal(ok(ASK('/blog'), { ok: false, error: { code: 'CONTENT_BAD_QUERY' } }), null)
  assert.equal(ok(ASK('/blog'), { schemaVersion: 'tracy-content/v1', contents: [] }), null)
  assert.equal(ok(ASK('/blog'), NO_PAGE('/blog', { locales: ['en-GB'] })), null)
  assert.equal(ok(ASK('/blog'), { ...miss, link: undefined }), null)
  assert.equal(ok(ASK('/blog'), { ...miss, site: null }), null)
  assert.equal(ok(ASK('/blog'), null), null)
})

test('unprefixedMiss: the cheap look before any facts are read — the same call and answer, nothing else', () => {
  assert.ok(unprefixedMiss(ASK('/blog'), NO_PAGE('/blog')))
  assert.equal(unprefixedMiss(ASK('/blog', { locale: 'en-GB' }), NO_PAGE('/blog')), null)
  assert.equal(unprefixedMiss(ASK('/en/blog'), NO_PAGE('/en/blog')), null)
  assert.equal(unprefixedMiss(ASK('/blog'), { ...NO_PAGE('/blog'), pages: [{ id: 'c' }] }), null)
  assert.equal(unprefixedMiss(ASK('/blog'), NO_PAGE('/blog', { locales: ['en-GB'] })), null)
  assert.equal(unprefixedMiss({ type: 'page' }, NO_PAGE('/blog')), null)
})
