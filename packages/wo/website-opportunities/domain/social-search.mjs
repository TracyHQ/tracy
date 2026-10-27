// Social pages of a place that has no website of its own (or whose Google "website" is a social page),
// found by web search (plan-wo-public-research.md, contract §6). A page found this way is a confirmed
// source ONLY with: a matching name, a matching locality, and one branch-specific proof read off the
// page itself (its street address, a phone that is this branch's own, or a link to exactly this place's
// Maps entry / branch page), and nothing on the page contradicting the place. Name + city, a chain's
// shared hotline or root domain, or a search snippet alone stay `pending`: never a confirmed source.
import { parseSocialUrl } from './social-stats/handles.mjs'
import { socialNetworkOf } from './discovery-osm.mjs'

export const SEARCH_NETWORKS = Object.freeze(['facebook', 'instagram'])
const MAX_PAGES_PER_NETWORK = 3
const MAX_QUERIES_PER_NETWORK = 3
const SC_TIMEOUT_MS = 20_000
// A search with no answer is asked once more (measured 24/10/2026: the same query answered 2 s later).
const SEARCH_ATTEMPTS = 2
const RATE_LIMIT_PAUSE_MS = 2_000

// Words many restaurant names share; a name match needs one word beyond them.
const GENERIC = new Set([
  'the',
  'and',
  'of',
  'a',
  'an',
  'cafe',
  'caffe',
  'coffee',
  'restaurant',
  'restaurants',
  'resto',
  'bar',
  'grill',
  'kitchen',
  'bistro',
  'eatery',
  'house',
  'lounge',
  'bakery',
  'shop',
  'co',
  'llc',
  'fze',
  'by'
])

// Dish and venue words a social page often drops from a restaurant's name ("Kirami Sushi Bar" → "Kiram • Dubai").
const CUISINE = new Set([
  'sushi',
  'pizza',
  'pizzeria',
  'ramen',
  'burger',
  'burgers',
  'shawarma',
  'noodle',
  'noodles',
  'steakhouse',
  'tacos',
  'taqueria',
  'dumplings',
  'bbq',
  'diner',
  'pub',
  'tea'
])
// Words on a page saying the place does not trade now: such a page is never a confirmed source.
const CLOSED = /\b(?:temporarily|permanently)\s+closed\b|\bclosed\s+(?:permanently|temporarily|for\s+good)\b/i

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const fold = (v) =>
  String(v ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
/** Lower case, no accents, words separated by single spaces. */
const norm = (v) =>
  fold(v)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const contains = (hay, needle) => Boolean(needle) && ` ${hay} `.includes(` ${needle} `)
const tokens = (v) => norm(v).split(' ').filter(Boolean)
const digits = (v) =>
  String(v ?? '')
    .replace(/\D+/g, '')
    .replace(/^0+/, '')

// The address parts a social page names its town by, widest last.
const AREA_TYPES = [
  'locality',
  'postal_town',
  'sublocality',
  'neighborhood',
  'administrative_area_level_2',
  'administrative_area_level_1'
]
const LATIN = /\p{Script=Latin}/u
/** Both written in Latin letters, or both not: a name with no letters at all goes with any script. */
function sameScript(a, b) {
  const letters = (v) => String(v ?? '').replace(/[^\p{L}]/gu, '')
  if (!letters(a) || !letters(b)) return true
  return LATIN.test(letters(a)) === LATIN.test(letters(b))
}

/** Pure: the place as search and matching read it, from Google Place Details facts plus the search seed. */
export function searchPlaceOf(facts = {}, seed = {}) {
  const comps = Array.isArray(facts.addressComponents) ? facts.addressComponents : []
  const found = (type) => comps.find((c) => Array.isArray(c?.types) && c.types.includes(type))
  const comp = (type) => text(found(type)?.longText)
  const route = [comp('street_number'), comp('route')].filter(Boolean).join(' ')
  const address = text(seed.address)
  const first = address?.split(',')[0]?.trim()
  const site = text(facts.website) ?? text(seed.website)
  const net = site ? socialNetworkOf(site) : null
  const socials = { ...(seed.socials && typeof seed.socials === 'object' ? seed.socials : {}) }
  if (net && !socials[net]) socials[net] = site
  const name = text(facts.name) ?? text(seed.name)
  // The name the business was decided to carry (`nameCheck`), when it is not Google's: searched and matched too.
  const otherNames = [
    ...new Set((Array.isArray(seed.otherNames) ? seed.otherNames : []).map(text).filter(Boolean))
  ].filter((n) => !name || norm(n) !== norm(name))
  // Google may name the city in the local script ("دبي" for a place called "Kirami Sushi Bar"): a search
  // and a page read in the name's script, so a city in another script is left out of both.
  const areas = AREA_TYPES.map(comp).filter((a) => a && sameScript(a, name))
  const country = text(found('country')?.shortText)
  return {
    placeId: text(facts.placeId) ?? text(seed.providerId),
    name,
    ...(otherNames.length ? { otherNames } : {}),
    address,
    street: route || (first && /\d/.test(first) ? first : undefined),
    locality: ['locality', 'postal_town', 'administrative_area_level_1']
      .map(comp)
      .find((a) => a && sameScript(a, name)),
    localities: [...new Set(areas)],
    ...(country && /^[A-Za-z]{2}$/.test(country) ? { country: country.toUpperCase() } : {}),
    phone: text(seed.phone),
    mapsUrl: text(seed.mapsUrl),
    website: site && !net ? site : undefined,
    socials,
    sharedPhones: Array.isArray(seed.sharedPhones) ? seed.sharedPhones.filter((p) => text(p)) : []
  }
}

/** A toll-free/shared-cost number (800, 600, 1800, 1300, 1900 …) a chain publishes for every branch. */
function isHotline(d) {
  return /^(?:\d{1,3})?(?:0?800|0?600|1800|1300|1900)\d{3,}$/.test(d)
}

function samePhone(a, b) {
  const x = digits(a)
  const y = digits(b)
  if (x.length < 7 || y.length < 7) return false
  return x.length >= y.length ? x.endsWith(y) : y.endsWith(x)
}

export function nameMatches(placeName, pageName) {
  const a = tokens(placeName)
  const b = new Set(tokens(pageName))
  if (!a.length || !b.size) return false
  const significant = a.filter((t) => !GENERIC.has(t))
  const need = significant.length ? significant : a
  if (need.every((t) => b.has(t))) return true
  // "Sansation" vs "SansationCafe": compare the names written without spaces.
  const joined = [...b].join('')
  return need.join('').length >= 5 && joined.includes(need.join(''))
}

/** One edit (insert, delete, substitute or swap) turns `a` into `b`. */
function oneEditApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  if (a.length === b.length)
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    )
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/**
 * A near name: the page drops dish words and spells each remaining word of the place's name, or one word of five
 * letters or more one letter off. Never enough alone: `matchSocialPage` then asks for the branch phone or address.
 */
function nameNear(placeName, pageName) {
  const want = tokens(placeName).filter((t) => !GENERIC.has(t) && !CUISINE.has(t))
  const have = tokens(pageName)
  if (!want.length || !have.length) return false
  let fuzzy = 0
  for (const t of want) {
    if (have.includes(t)) continue
    if (t.length < 5 || !have.some((h) => oneEditApart(t, h))) return false
    fuzzy++
  }
  return fuzzy <= 1
}

/** The two numbers are one line in full (country code or trunk 0 aside), not a shared tail. */
function sameFullPhone(a, b) {
  const x = digits(a)
  const y = digits(b)
  if (Math.min(x.length, y.length) < 8) return false
  return samePhone(a, b) && Math.abs(x.length - y.length) <= 3
}

/** 'match' | 'mismatch' | 'unknown' — a city on the page, or a multi-part address naming another one. */
function localityOf(place, page) {
  const wants = [place.locality, ...(place.localities ?? [])].map(norm).filter(Boolean)
  if (!wants.length) return 'unknown'
  const city = text(page.city)
  if (city)
    return wants.some((w) => contains(norm(city), w) || contains(w, norm(city))) ? 'match' : 'mismatch'
  const address = text(page.address)
  if (!address) return 'unknown'
  if (wants.some((w) => contains(norm(address), w))) return 'match'
  return address.includes(',') ? 'mismatch' : 'unknown'
}

/** The Maps entry of exactly this place: its place id in the URL. */
function linksThisPlace(place, url) {
  if (!place.placeId || typeof url !== 'string') return false
  return url.includes(place.placeId) || (Boolean(place.mapsUrl) && url === place.mapsUrl)
}

/** A website naming this branch: same host AND the same non-root path (a chain's root domain is shared). */
function sameBranchPage(a, b) {
  try {
    const x = new URL(a)
    const y = new URL(b)
    const path = (u) => u.pathname.replace(/\/+$/, '')
    const host = (u) => u.hostname.toLowerCase().replace(/^www\./, '')
    return host(x) === host(y) && path(x) !== '' && path(x) === path(y)
  } catch {
    return false
  }
}

function sameHost(a, b) {
  try {
    return (
      new URL(a).hostname.toLowerCase().replace(/^www\./, '') ===
      new URL(b).hostname.toLowerCase().replace(/^www\./, '')
    )
  } catch {
    return true
  }
}

/**
 * Pure: does `page` (facts read off a social page: name, address, city, phone, website, links) belong to
 * `place` (`searchPlaceOf`)? Returns {verdict: 'confirmed'|'pending'|'rejected', proofs, reasons}.
 */
export function matchSocialPage(place, page) {
  const reasons = []
  if (!page || typeof page !== 'object') return { verdict: 'pending', proofs: [], reasons: ['no_page_facts'] }
  // The page may carry Google's name or the name the business was decided to carry.
  const names = [place.name, ...(place.otherNames ?? [])].filter(text)
  const placeName = names.find((n) => nameMatches(n, page.name)) ?? names.find((n) => nameNear(n, page.name))
  const near = !names.some((n) => nameMatches(n, page.name))
  if (near && !placeName) return { verdict: 'rejected', proofs: [], reasons: ['name_mismatch'] }
  if (near) reasons.push('name_near')
  const locality = localityOf(place, page)
  if (locality === 'mismatch') return { verdict: 'rejected', proofs: [], reasons: ['locality_mismatch'] }
  if (locality === 'unknown') reasons.push('locality_unknown')

  const proofs = []
  const street = norm(place.street)
  if (street && /\d/.test(street) && contains(norm(page.address), street)) proofs.push('address')

  const shared = (place.sharedPhones ?? []).some((p) => samePhone(p, place.phone))
  if (text(page.phone) && text(place.phone)) {
    if (!samePhone(page.phone, place.phone)) reasons.push('phone_differs')
    else if (shared || isHotline(digits(place.phone)) || isHotline(digits(page.phone)))
      reasons.push('shared_phone')
    else proofs.push('phone')
  }

  const links = [text(page.website), ...(Array.isArray(page.links) ? page.links : [])].filter(Boolean)
  if (links.some((u) => linksThisPlace(place, u) || (place.website && sameBranchPage(u, place.website))))
    proofs.push('link')
  if (place.website && text(page.website) && !sameHost(page.website, place.website))
    reasons.push('website_differs')

  const contradicted = reasons.includes('phone_differs') || reasons.includes('website_differs')
  if (!proofs.length) reasons.push('no_branch_proof')
  if ([page.name, page.bio, page.category].some((v) => CLOSED.test(String(v ?? ''))))
    reasons.push('page_closed')
  // A near name stands only on the branch's full phone or its street address, never on a link alone.
  const nearProved =
    !near ||
    proofs.includes('address') ||
    (proofs.includes('phone') && sameFullPhone(page.phone, place.phone))
  const verdict =
    locality === 'match' && proofs.length && !contradicted && nearProved && !reasons.includes('page_closed')
      ? 'confirmed'
      : 'pending'
  return { verdict, proofs, reasons }
}

const REASON_OF_CODE = {
  CREDENTIAL_MISSING: 'credential_missing',
  CREDENTIAL_INVALID: 'credential_invalid',
  QUOTA: 'quota',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited'
}

/** Refusals that say every later search fails the same way (no key, a bad key, no credit): the network stops. */
const PERMANENT = new Set(['credential_missing', 'credential_invalid', 'quota'])

/** A failure worth asking once more: no answer, a timeout, a 5xx, a rate limit or an unreadable body. */
const transient = (error) =>
  error?.code === 'TIMEOUT' || error?.noAnswer === true || error?.transient === true

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One provider turn as contract §3 shapes it. A thrown {code} becomes `skipped` with its reason; a transient failure is
 * asked once more first, after a pause when rate limited (each call is its own priced search: the caller's `search`
 * reserves it).
 */
async function searchWith(provider, search, query, rethrow, where, wait) {
  if (typeof search !== 'function')
    return { provider, status: 'skipped', reason: 'credential_missing', data: null }
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = await search(query, where)
      const links = (Array.isArray(raw) ? raw : []).filter((l) => typeof l?.url === 'string')
      return links.length
        ? { provider, status: 'complete', data: { links } }
        : { provider, status: 'not_found', data: { links: [] } }
    } catch (error) {
      if (rethrow(error)) throw error
      if (attempt < SEARCH_ATTEMPTS && transient(error)) {
        if (error?.code === 'RATE_LIMITED') await wait(RATE_LIMIT_PAUSE_MS)
        continue
      }
      return {
        provider,
        status: 'skipped',
        reason: REASON_OF_CODE[error?.code] ?? 'provider_error',
        data: null
      }
    }
  }
}

/**
 * The searches for one network, cheapest guess first: the name in its city, the branch's own phone (never a
 * hotline or a number branches share), then the name's distinctive words on the network's own site.
 */
export function socialQueries(place, network) {
  const queries = [[place.name, place.locality, network].filter(Boolean).join(' ')]
  // The decided name, searched second: a business whose Google name is not the one it goes by is found by its own.
  const others = (place.otherNames ?? []).filter(text)
  for (const other of others) queries.push([other, place.locality, network].filter(Boolean).join(' '))
  const phone = text(place.phone)
  const shared = (place.sharedPhones ?? []).some((p) => samePhone(p, phone))
  if (phone && digits(phone).length >= 8 && !isHotline(digits(phone)) && !shared)
    queries.push(`"${phone}" ${network}`)
  const core = tokens(place.name)
    .filter((t) => !GENERIC.has(t) && !CUISINE.has(t))
    .join(' ')
  if (core) queries.push([core, place.locality, `site:${network}.com`].filter(Boolean).join(' '))
  return [...new Set(queries)].slice(0, MAX_QUERIES_PER_NETWORK + others.length)
}

/**
 * Search the web for the place's missing social pages and judge each found page.
 * deps.order: web-search provider ids in the admin's order (`[]` searches nothing);
 * deps.searchers: {[id]: (query, {country?}) => Promise<{title?, url, description?}[]>} — `country` is the place's
 *   ISO 3166-1 alpha-2 code; a thrown {code} falls to the next;
 * deps.pageFacts: (network, url) => Promise<{name, address?, city?, phone?, website?, links?, bio?} | null>;
 * deps.networks: which networks to look for (default facebook, instagram);
 * deps.rethrow: (error) => true for an error that must stop the search (the caller's budget running out);
 * deps.wait: (ms) => Promise, the pause before asking a rate-limited provider again.
 * Each network runs `socialQueries` in turn until one finds a confirmed page. A query no provider answered moves on to
 * the next query, unless every provider refused for good (`PERMANENT`), which ends the network; a network with no
 * page found and a failed query is `failed` with the last reason, never `not_found`. Returns {tried, confirmed, pending,
 * rejected, searched: {[network]: {status, queries,
 * reason?}}} — `status` confirmed | pending | not_found | failed; only `confirmed` may become a place's source.
 */
export async function findSocialPages(place, deps = {}) {
  const order = Array.isArray(deps.order) ? deps.order : []
  const searchers = deps.searchers ?? {}
  const rethrow = typeof deps.rethrow === 'function' ? deps.rethrow : () => false
  const wait = typeof deps.wait === 'function' ? deps.wait : pause
  const networks = (deps.networks ?? SEARCH_NETWORKS).filter((n) => !text(place?.socials?.[n]))
  const out = { tried: [], confirmed: [], pending: [], rejected: [], searched: {} }
  if (!text(place?.name) || !order.length) return out
  // Search as from the place's country: unasked, a provider answers as from the US and buries a local page.
  const where = place.country ? { country: place.country } : {}
  for (const network of networks) {
    const judged = new Map()
    let queries = 0
    let failure = null
    for (const query of socialQueries(place, network)) {
      let answer = null
      let answered = false
      const reasons = []
      for (const provider of order) {
        const turn = await searchWith(provider, searchers[provider], query, rethrow, where, wait)
        out.tried.push({
          provider: turn.provider,
          status: turn.status,
          ...(turn.reason ? { reason: turn.reason } : {}),
          network,
          query
        })
        if (turn.reason) reasons.push(turn.reason)
        if (turn.status === 'complete') answer = turn
        if (turn.status === 'complete' || turn.status === 'not_found') {
          answered = true
          break
        }
      }
      if (!answered) {
        failure = reasons.at(-1) ?? 'provider_error'
        // Every provider refused for good: the next query would be refused too. A transient failure tries the next query.
        if (reasons.every((r) => PERMANENT.has(r))) break
        continue
      }
      queries++
      if (!answer) continue
      const pages = new Map()
      for (const link of answer.data.links) {
        const parsed = parseSocialUrl(link.url, { network })
        if (parsed && !pages.has(parsed.url) && !judged.has(parsed.url)) pages.set(parsed.url, link)
      }
      for (const [url, link] of [...pages].slice(0, MAX_PAGES_PER_NETWORK)) {
        let facts = null
        try {
          facts = typeof deps.pageFacts === 'function' ? await deps.pageFacts(network, url) : null
        } catch (error) {
          if (rethrow(error)) throw error
          facts = null
        }
        const m = matchSocialPage(place, facts)
        judged.set(url, {
          network,
          url,
          provider: answer.provider,
          verdict: m.verdict,
          evidence: {
            query,
            title: text(link.title) ?? null,
            proofs: m.proofs,
            reasons: m.reasons,
            page: facts ? pageEvidence(facts) : null
          }
        })
      }
      if ([...judged.values()].some((j) => j.verdict === 'confirmed')) break
    }
    // Two pages both proving to be this branch: neither is certain.
    const all = [...judged.values()]
    const sure = all.filter((j) => j.verdict === 'confirmed')
    if (sure.length > 1)
      for (const j of sure) {
        j.verdict = 'pending'
        j.evidence.reasons.push('ambiguous')
      }
    for (const j of all) out[j.verdict].push(j)
    const status = all.some((j) => j.verdict === 'confirmed')
      ? 'confirmed'
      : all.some((j) => j.verdict === 'pending')
        ? 'pending'
        : failure
          ? 'failed'
          : 'not_found'
    out.searched[network] = { status, queries, ...(status === 'failed' ? { reason: failure } : {}) }
  }
  return out
}

function pageEvidence(facts) {
  const keep = {}
  for (const k of ['name', 'address', 'city', 'phone', 'website'])
    if (text(facts[k])) keep[k] = facts[k].trim()
  return keep
}

const scError = (code, message) => Object.assign(new Error(message), { code })

/**
 * ScrapeCreators Google search (`/v1/google/search?query=&region=`, 1 credit): `{title, url, description}` links.
 * Its 404 "no results" is an empty list with `charged: false`. Throws {code: CREDENTIAL_MISSING|CREDENTIAL_INVALID|
 * QUOTA|RATE_LIMITED|TIMEOUT|PROVIDER_ERROR}; `transient: true` (or `noAnswer`) marks a failure worth asking once more.
 */
export async function scrapeCreatorsGoogleSearch(
  query,
  { key, country, fetch = globalThis.fetch, timeoutMs = SC_TIMEOUT_MS } = {}
) {
  if (!key) throw scError('CREDENTIAL_MISSING', 'scrapecreators: no key')
  const url = new URL('https://api.scrapecreators.com/v1/google/search')
  url.searchParams.set('query', String(query))
  if (text(country)) url.searchParams.set('region', country.trim().toUpperCase())
  const signal = AbortSignal.timeout(timeoutMs)
  let res
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      redirect: 'error',
      signal
    })
  } catch (e) {
    if (signal.aborted || e?.name === 'TimeoutError' || e?.name === 'AbortError')
      throw scError('TIMEOUT', 'scrapecreators: timed out')
    throw Object.assign(scError('PROVIDER_ERROR', 'scrapecreators: request failed'), { noAnswer: true })
  }
  const body = await res.json().catch(() => undefined)
  if (res.status === 401 || res.status === 403)
    throw scError('CREDENTIAL_INVALID', `scrapecreators: HTTP ${res.status}`)
  if (res.status === 402) throw scError('QUOTA', `scrapecreators: HTTP ${res.status}`)
  if (res.status === 429)
    throw Object.assign(scError('RATE_LIMITED', 'scrapecreators: HTTP 429'), { transient: true })
  // Its "no results" answer, not charged (measured 24/10/2026: `{error: 'not_found', credits_charged: 0}`).
  if (res.status === 404 && body?.error === 'not_found') return Object.assign([], { charged: false })
  if (!res.ok || !body || typeof body !== 'object')
    throw Object.assign(scError('PROVIDER_ERROR', `scrapecreators: HTTP ${res.status}`), { transient: true })
  const list = [body.results, body.data, body.links, body.organic_results].find(Array.isArray) ?? []
  return list
    .filter((r) => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url))
    .map((r) => ({ title: text(r.title) ?? '', url: r.url, description: text(r.description) ?? '' }))
}
