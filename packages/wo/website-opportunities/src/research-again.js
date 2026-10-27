/**
 * Research again: which parts of a place a pressed button looks at again, and
 * why. One answer for the three previews (/ops, the account's place card, `/find`), the run itself and each row's
 * state on the research card. Pure: the caller hands the place's rows, the collector versions, what it cannot run
 * and each part's reserved price.
 */
import { providerOrderFor, resolveProviderOrder } from './wo-settings.js'
import { apifyCeilingCents, ceilingCents } from './cost-prices.js'
import { GOOGLE_MAPS_VERSION } from './google-maps-research.js'
import { joinPlace } from './place-jobs.js'
import {
  SOURCE_MAX_AGE_MS,
  currentSnapshotOf,
  linksOf,
  placeSettled,
  snapshotMediaOf,
  snapshotProfileOf,
  sourceDue
} from './places.js'
import { MENU_FILE_PART, MENU_FILE_VERSION, menuApplicable } from './menu-items.js'
import {
  MENU_PHOTOS_PART,
  menuPhotoCandidates,
  menuPhotoCeilingCents,
  menuPhotoScope,
  menuPhotoVersion
} from './menu-photo-reading.js'
import { SHOWN_SOURCES, SOURCES } from './sources.js'
import { misjudged } from './link-rejudge.js'
import { tripadvisorProviders } from './tripadvisor-research.js'
import { TRIPADVISOR_VERSION } from './tripadvisor.js'
import { SOURCE_VERSIONS } from './collector-versions.js'

/** The rule that searched a place's Facebook and Instagram pages (`place-executor.js findSocialBySearch`). */
// 4: the decided business name is searched and matched besides Google's (`social-search.mjs socialQueries`).
export const SOCIAL_SEARCH_VERSION = 'social-search-4'
/** The networks a place without a website of its own is searched for. */
export const SEARCH_NETWORKS = Object.freeze(['facebook', 'instagram'])
/** Every part the plan may name, in the research card's order. */
export const AGAIN_PARTS = SHOWN_SOURCES

const time = (v) => (v ? new Date(v).getTime() : Number.NaN)

/**
 * The `parts` a door was sent to limit a Research again to ("Read menu again" = `menu-file,menu-photos`): a list or a
 * comma-separated string of `AGAIN_PARTS`. `{parts: null}` when none was sent, `{error}` when one is not a part.
 * @returns {{parts: string[] | null} | {error: string}}
 */
export function againPartsOf(value) {
  if (value === undefined || value === null || value === '') return { parts: null }
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null
  const named = (list ?? []).map((p) => (typeof p === 'string' ? p.trim() : p))
  if (!named.length || named.some((p) => !AGAIN_PARTS.includes(p)))
    return { error: `Send "parts" as a list of ${AGAIN_PARTS.join(', ')}, or leave it out.` }
  return { parts: [...new Set(named)] }
}

/** Why a due part runs: `never` tried, its `rule-changed`, its data `outdated`, or our setup `failed` last time. */
function runReason(row, now, version) {
  if (!row?.attempted_at && !row?.collected_at) return 'never'
  if (version && row.collector_version !== version) return 'rule-changed'
  const collected = time(row.collected_at)
  if (
    placeSettled(row) ||
    (Number.isFinite(collected) && now - collected > SOURCE_MAX_AGE_MS && !row.last_error)
  )
    return 'outdated'
  return 'failed'
}

/**
 * @param {Record<string, object>} rows the place's rows by part (`wo_place_snapshot_source` shape)
 * @param {{now: number, parts: string[], versions?: Record<string, string>, unavailable?: Record<string, string>,
 *   prices?: Record<string, number>, capCents?: number,
 *   custom?: Record<string, {due: boolean, reason?: string, kept?: string, photos?: string[]}>}} opts `parts` in
 *   display order; `unavailable` names a part this deployment cannot run (no key, switched off); `capCents` drops the
 *   dearest parts until the rest fits; `custom` decides a part whose due-ness is not its row's age (`menu-photos`:
 *   due while a selected photo has no reading), with the photos it freezes
 * @returns {{run: {part: string, reason: string, ceilingCents: number, photos?: string[]}[],
 *   kept: {part: string, reason: string, detail?: string}[], ceilingCents: number}}
 */
export function researchAgainPlan(
  rows,
  { now, parts, versions = {}, unavailable = {}, prices = {}, capCents, custom = {} }
) {
  let run = []
  const kept = []
  for (const part of parts) {
    if (unavailable[part]) {
      kept.push({ part, reason: 'unavailable', detail: unavailable[part] })
      continue
    }
    const own = custom[part]
    if (own) {
      if (own.due)
        run.push({
          part,
          reason: own.reason ?? 'never',
          ceilingCents: prices[part] ?? 0,
          ...(own.photos ? { photos: own.photos } : {})
        })
      else kept.push({ part, reason: own.kept ?? 'up-to-date' })
      continue
    }
    const row = rows[part]
    const version = versions[part] ?? null
    if (!row || sourceDue(row, now, version, { manual: true }))
      run.push({ part, reason: runReason(row, now, version), ceilingCents: prices[part] ?? 0 })
    else kept.push({ part, reason: placeSettled(row) ? 'none' : 'up-to-date' })
  }
  if (Number.isFinite(capCents)) {
    const total = () => run.reduce((sum, r) => sum + r.ceilingCents, 0)
    for (const dear of [...run].sort((a, b) => b.ceilingCents - a.ceilingCents)) {
      if (total() <= capCents) break
      run = run.filter((r) => r !== dear)
      kept.push({ part: dear.part, reason: 'over-cap' })
    }
  }
  return { run, kept, ceilingCents: run.reduce((sum, r) => sum + r.ceilingCents, 0) }
}

const APIFY_ACTOR = {
  facebook: 'apify~facebook-posts-scraper',
  instagram: 'apify~instagram-scraper',
  tiktok: 'clockworks~tiktok-scraper',
  youtube: 'streamers~youtube-scraper'
}
const SEARCH_KEY = {
  'scrapecreators-google': 'scrapecreators',
  jina: 'jina',
  firecrawl: 'firecrawl',
  'serpapi-google-search': 'serpapi'
}
const SEARCH_PRICE = {
  'scrapecreators-google': ['scrapecreators', 'google-search'],
  jina: ['jina', 'search'],
  firecrawl: ['firecrawl', 'search'],
  'serpapi-google-search': ['serpapi', 'web-search']
}
// A search tries up to three queries and reads up to three pages a query (`domain/social-search.mjs`); a Tripadvisor
// match reads up to three places a provider (`tripadvisor-research.js`). The preview holds all of them; the
// per-call reservation still holds every call (`cost-ledger.js`).
const SEARCH_QUERIES = 3
const SEARCH_PAGES = 3
const TRIPADVISOR_PLACES = 3
const price = (provider, operation) => {
  try {
    return ceilingCents(provider, operation)
  } catch {
    return 0
  }
}

/** One social page read: ScrapeCreators when it has a key, else an Apify run. */
function profilePrice(network, keys) {
  if (keys.scrapecreators && network !== 'youtube') return price('scrapecreators', `${network}-profile`)
  if (keys.apify && APIFY_ACTOR[network]) return apifyCeilingCents(APIFY_ACTOR[network], { items: 30 })
  return 0
}

/** One network's search part: each query a search plus up to three page reads (ScrapeCreators), then the page found. */
function searchPartPrice(network, keys, searcher) {
  const search = searcher ? price(...SEARCH_PRICE[searcher]) : 0
  const pageRead = keys.scrapecreators ? price('scrapecreators', `${network}-profile`) : 0
  return SEARCH_QUERIES * (search + SEARCH_PAGES * pageRead) + profilePrice(network, keys)
}

/**
 * Tripadvisor: Google's location of the branch when the research does not hold it yet, then each keyed provider in
 * turn (a failure falls through to the next): a search, up to three place reads and the reviews.
 */
function tripadvisorPrice(providers, { locate }) {
  const op = (p, step) => (p === 'litescrape' ? price('litescrape', step) : price(p, `tripadvisor-${step}`))
  const each = providers.reduce(
    (sum, p) => sum + op(p, 'search') + TRIPADVISOR_PLACES * op(p, 'place') + op(p, 'reviews'),
    0
  )
  return (locate ? price('google', 'place-location') : 0) + each
}

/**
 * The plan of one place as this deployment would run it now: its current research, its links, the keys and the
 * operator's settings. `domain` gives the social connectors (`connectorsFor`). `onlyParts` limits the plan to those parts
 * ("Read menu again" = `['menu-file', 'menu-photos']`).
 * @returns {Promise<ReturnType<typeof researchAgainPlan> & {researched: boolean}>}
 */
export async function placeAgainPlan(
  db,
  placeId,
  { now, keys = {}, settings = {}, domain, capCents, onlyParts = null }
) {
  const snapshot = await currentSnapshotOf(db, placeId)
  if (!snapshot) return { run: [], kept: [], ceilingCents: 0, researched: false }
  const links = await linksOf(db, placeId)
  const google =
    (
      await db.query("select 1 from wo_place_identity where place_id = $1 and namespace = 'google' limit 1", [
        placeId
      ])
    ).rows.length > 0
  const rows = Object.fromEntries(snapshot.sources.map((s) => [s.source, s]))
  const parts = []
  const unavailable = {}
  const prices = {}
  const versions = {
    ...SOURCE_VERSIONS,
    'google-maps': GOOGLE_MAPS_VERSION,
    tripadvisor: TRIPADVISOR_VERSION
  }
  const connectors = domain?.connectorsFor
    ? domain.connectorsFor(
        { APIFY_TOKEN: keys.apify ?? undefined, SCRAPECREATORS_API_KEY: keys.scrapecreators ?? undefined },
        { order: providerOrderFor(settings) }
      )
    : {}
  const custom = {}
  // A source today's link rules no longer call that kind (`link-rejudge.js`): the run drops it, whatever its age.
  const wrong = new Set(misjudged(links, snapshot.sources).sources.map((s) => s.source))
  for (const source of SOURCES) {
    if (!rows[source]?.ref) continue
    parts.push(source)
    if (wrong.has(source)) {
      custom[source] = { due: true, reason: 'rule-changed' }
      prices[source] = 0
      continue
    }
    if (settings.autoCollectSources?.[source] === false) unavailable[source] = 'switched_off'
    else if (source === 'website' && resolveProviderOrder(settings, 'website-content').order.length === 0)
      unavailable[source] = 'switched_off'
    else if (source !== 'website' && connectors[source] && !connectors[source].available)
      unavailable[source] = connectors[source].reason ?? 'unsupported'
    prices[source] = source === 'website' ? 0 : profilePrice(source, keys)
  }
  if (google && !links.some((l) => l.kind === 'website')) {
    const searchers = resolveProviderOrder(settings, 'web-search').order.filter((id) => keys[SEARCH_KEY[id]])
    for (const network of SEARCH_NETWORKS) {
      if (links.some((l) => l.kind === network)) continue
      const part = `${network}-search`
      parts.push(part)
      versions[part] = SOCIAL_SEARCH_VERSION
      if (!searchers.length) unavailable[part] = 'credential_missing'
      prices[part] = searchPartPrice(network, keys, searchers[0])
    }
  }
  if (google) {
    parts.push('google-places')
    if (!keys.google) unavailable['google-places'] = 'credential_missing'
    prices['google-places'] = price('google', 'place-details')
    if (rows['google-maps'] || keys.serpapi) {
      parts.push('google-maps')
      if (!keys.serpapi) unavailable['google-maps'] = 'credential_missing'
      else if (settings.googleMapsMenu === false) unavailable['google-maps'] = 'switched_off'
      prices['google-maps'] = 3 * price('serpapi', 'google-maps-place')
    }
  }
  const ta = tripadvisorProviders(settings, keys)
  if (rows.tripadvisor || ta.length) {
    parts.push('tripadvisor')
    if (!ta.length) unavailable.tripadvisor = 'credential_missing'
    else if (settings.tripadvisorReviews === false) unavailable.tripadvisor = 'switched_off'
    prices.tripadvisor = tripadvisorPrice(ta, {
      locate: Boolean(keys.google) && !rows['google-places']?.collected?.matchFacts
    })
  }
  await menuParts(db, snapshot, rows, {
    now,
    keys,
    settings,
    domain,
    parts,
    versions,
    unavailable,
    prices,
    custom
  })
  const ordered = AGAIN_PARTS.filter((p) => parts.includes(p) && (!onlyParts || onlyParts.includes(p)))
  return {
    ...researchAgainPlan(rows, { now, parts: ordered, versions, unavailable, prices, capCents, custom }),
    researched: true
  }
}

/**
 * The Menu's two parts of a food place (`menuApplicable`): its files and pages (`menu-file`, free, due by age and rule)
 * and its photos (`menu-photos`, due while a selected photo has no reading under the vision model assigned now; the
 * preview freezes WHICH photos and reserves each one's vision ceiling). `keys.menuVision` resolves that model
 * (`menuVisionDoorFor`); without it photo reading counts as not configured.
 */
async function menuParts(
  db,
  snapshot,
  rows,
  { now, keys, settings, domain, parts, versions, unavailable, prices, custom }
) {
  const profile = (await snapshotProfileOf(db, snapshot.id))?.profile ?? null
  const media = await snapshotMediaOf(db, snapshot.id)
  const candidates = menuPhotoCandidates(media, { graphic: domain?.looksGraphic })
  const google = rows['google-places']?.collected ?? profile?.googlePlace ?? null
  const items = [
    ...(rows[MENU_FILE_PART]?.collected?.items ?? []),
    ...(rows[MENU_PHOTOS_PART]?.collected?.items ?? []),
    ...(profile?.menuItems ?? [])
  ]
  const menuPhotos = candidates.filter((m) => m.category === 'menu').length
  if (!menuApplicable({ google, profile, items, menuPhotos })) return
  const order = resolveProviderOrder(settings, 'menu-items').order
  parts.push(MENU_FILE_PART)
  versions[MENU_FILE_PART] = MENU_FILE_VERSION
  prices[MENU_FILE_PART] = 0
  if (!order.includes('document-text')) unavailable[MENU_FILE_PART] = 'switched_off'
  parts.push(MENU_PHOTOS_PART)
  const limit = settings.menuPhotosPerPlace ?? 0
  if (!order.includes('photo-vision') || limit <= 0) {
    unavailable[MENU_PHOTOS_PART] = 'switched_off'
    return
  }
  const door = typeof keys.menuVision === 'function' ? await keys.menuVision() : { state: 'not_configured' }
  if (door?.state !== 'ready') {
    unavailable[MENU_PHOTOS_PART] = door?.state ?? 'not_configured'
    return
  }
  const row = rows[MENU_PHOTOS_PART]
  const version = menuPhotoVersion(door.door)
  const held = row?.collected?.photos ?? []
  const scope = menuPhotoScope({ candidates, limit, held, version, now, manual: true })
  prices[MENU_PHOTOS_PART] = scope.toRead.length * menuPhotoCeilingCents(door.door.model)
  if (!scope.toRead.length) {
    custom[MENU_PHOTOS_PART] = { due: false, kept: scope.selected.length ? 'up-to-date' : 'none' }
    return
  }
  const failed = new Set(held.filter((r) => r.read === 'failed').map((r) => r.sha256))
  custom[MENU_PHOTOS_PART] = {
    due: true,
    reason: !row?.collected_at
      ? 'never'
      : row.collector_version !== version
        ? 'rule-changed'
        : scope.toRead.some((p) => failed.has(p.sha256))
          ? 'failed'
          : 'outdated',
    photos: scope.toRead.map((p) => p.sha256)
  }
}

/**
 * Queue a Research again of one place: the plan is worked out again under the place's lock, and an empty one
 * queues nothing. A run already queued or running is joined as it is (never widened); the plan is frozen into a
 * new run (`again_plan`) for `starter` to pay.
 * @returns {Promise<{plan: object, job?: object, joined?: boolean}>}
 */
export async function queueResearchAgain(
  pool,
  placeId,
  { now, keys, settings, domain, starter, capCents, onlyParts = null }
) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_place where id = $1 for no key update', [placeId])
    const plan = await placeAgainPlan(client, placeId, { now, keys, settings, domain, capCents, onlyParts })
    if (!plan.run.length) {
      await client.query('rollback')
      return { plan }
    }
    const out = await joinPlace(client, placeId, { againPlan: plan, starter, now })
    await client.query('commit')
    return { plan, ...out }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** A plan as every door answers it: the parts to run, the parts kept, the most the run may cost. */
export function againShape(plan) {
  return {
    run: plan.run.map((r) => ({
      part: r.part,
      reason: r.reason,
      ceilingCents: r.ceilingCents,
      // `menu-photos`: how many photos the run reads (the hashes stay in the frozen plan).
      ...(r.photos ? { photos: r.photos.length } : {})
    })),
    kept: plan.kept.map((k) => ({
      part: k.part,
      reason: k.reason,
      ...(k.detail ? { detail: k.detail } : {})
    })),
    ceilingCents: plan.ceilingCents
  }
}
