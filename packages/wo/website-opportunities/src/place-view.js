/**
 * What an account sees of an opportunity whose place has a published snapshot: the snapshot (shared) with
 * the account's own overlay on top — its candidate (name, phone, address it saved) and the sources only it
 * names (`wo_source` rows the place does not have, researched privately). The detail door and the brief
 * read the same view, so a brief says what the account was shown.
 *
 * Null when the place has no published snapshot: the reader falls back to the per-account rows
 * (`wo_source`, `wo_profile`, `wo_media`), which is also how data from before shared research reads.
 */
import { mergeProfile } from './executor.js'
import { withNameDecision } from './business-name.js'
import { withHoursDecision } from './business-hours.js'
import { withRatingDecision } from './business-rating.js'
import { withPhoneDecision } from './business-phones.js'
import { readingCardOf } from '../domain/business-reading.mjs'
import { briefTradeOf } from '../domain/trades.mjs'
import { cleanProfileLinks } from '../domain/social-links.mjs'
import {
  currentSnapshotOf,
  shownSourceRowsOf,
  snapshotMediaOf,
  snapshotProfileOf,
  sourceRowsOf
} from './places.js'
import { LISTING_SOURCE, SOURCES } from './sources.js'
import { judgedAs } from './link-rejudge.js'
import { MENU_FILE_PART, menuApplicable } from './menu-items.js'
import { MENU_PHOTOS_PART } from './menu-photo-reading.js'

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {object} opportunity - a `wo_opportunity` row
 * @returns {Promise<null | {snapshot: object, sources: object[], shown: object[], profile: object,
 *   brand: object | null, media: object[]}>} `sources` are `wo_source`-shaped with `shared` (true: the place's);
 *   `shown` is what the research card lists: every source the run tried, failures included; `media` rows carry
 *   `origin` ('place': `wo_place_media`, 'opportunity': `wo_media`); revoked place media are left out
 */
export async function placeViewOf(db, opportunity) {
  const snapshot = await currentSnapshotOf(db, opportunity.place_id)
  if (!snapshot) return null
  // Guest reviews reach the profile and brief only when collected; a failed refresh keeps the last quotations.
  const reviews = snapshot.sources
    .filter((s) => s.source === 'tripadvisor' && s.collected_at && s.ref && s.collected?.reviews?.length)
    .map((s) => ({
      source: s.source,
      ref: s.ref,
      status: 'complete',
      reason: null,
      cursor: null,
      coverage: { fetched: s.collected.reviews.length },
      collected: s.collected,
      updated_at: s.collected_at
    }))
  // A row today's link rules file under another kind (`link-rejudge.js`) is not shown as that source, even before
  // the place is researched again (a magicpin page once taken for the website).
  const shared = [
    ...sourceRowsOf(snapshot.sources).filter((s) => s.ref && judgedAs(s.source, s.ref)),
    ...reviews
  ]
  const sharedRefs = new Set(shared.map((s) => `${s.source}\n${s.ref}`))
  // The opportunity's own rows but the ones the place already has (its per-account research from before).
  const own = (
    await db.query('select * from wo_source where opportunity_id = $1 order by source', [opportunity.id])
  ).rows.filter((s) => s.ref && judgedAs(s.source, s.ref) && !sharedRefs.has(`${s.source}\n${s.ref}`))
  const ownKinds = new Set(own.map((s) => s.source))
  const rows = [
    ...shared.map((s) => ({ ...s, shared: true })),
    ...own.map((s) => ({ ...s, shared: false }))
  ].sort(
    (a, b) =>
      (SOURCES.indexOf(a.source) < 0 ? SOURCES.length : SOURCES.indexOf(a.source)) -
      (SOURCES.indexOf(b.source) < 0 ? SOURCES.length : SOURCES.indexOf(b.source))
  )
  const held = (await snapshotProfileOf(db, snapshot.id)) ?? { profile: {}, brand: null }
  // Search evidence belongs to this snapshot, not to the viewing account's candidate. Only accept
  // the seed when its identity still belongs to this place; never borrow a newer campaign seed.
  const publicProfiles = []
  for (const seed of snapshot.sources ?? []) {
    if (
      seed.source !== 'google-places-search' ||
      seed.status !== 'complete' ||
      !seed.ref ||
      seed.ref !== seed.collected?.externalId
    )
      continue
    const identity = (
      await db.query(
        "select 1 from wo_place_identity where place_id = $1 and namespace = 'google' and external_id = $2",
        [snapshot.place_id, seed.ref]
      )
    ).rows[0]
    if (identity)
      publicProfiles.push({
        source: 'google-places',
        profile: {
          name: seed.collected.name,
          phone: seed.collected.phone,
          address: seed.collected.address
        }
      })
  }
  // The name on the site: the sources' claims with the place's logo text and this account's pick (`business-name.js`).
  const profile = withNameDecision(
    mergeProfile(
      opportunity,
      rows.filter((s) => SOURCES.includes(s.source) || s.source === LISTING_SOURCE),
      publicProfiles
    ),
    { opportunity, brand: held.brand }
  )
  if (held.profile?.reviewSources) profile.reviewSources = held.profile.reviewSources
  if (held.profile?.googlePlace) profile.googlePlace = held.profile.googlePlace
  if (held.profile?.menuItems) profile.menuItems = held.profile.menuItems
  if (held.profile?.menuReads) profile.menuReads = held.profile.menuReads
  // What the business sells, who it is for, its team and story (`business-reading.js`); the account's removals apply in
  // the brief and on the Profile card (`readingPicks`).
  if (held.profile?.businessReading) {
    profile.businessReading = held.profile.businessReading
    // With the trade the brief speaks in, so the card says Services, or What it offers for an unknown trade.
    profile.readingCard = {
      ...readingCardOf(
        held.profile.businessReading,
        opportunity?.candidate?.readingPicks,
        opportunity?.candidate?.keyMessagePicks
      ),
      trade: briefTradeOf({
        candidate: opportunity?.candidate ?? {},
        googlePlace: held.profile.googlePlace ?? null,
        menuItems: held.profile.menuItems
      })
    }
  }
  // The audit is of the website the snapshot names; one it no longer shows (re-judged as a listing) shows no score.
  if (held.profile?.pageSpeed && held.profile.website === profile.website)
    profile.pageSpeed = held.profile.pageSpeed
  else if (own.some((s) => s.source === 'website' && s.ref === profile.website)) {
    // The account's own website: the PageSpeed its own research measured of that same site.
    const mine = (
      await db.query('select profile from wo_profile where opportunity_id = $1', [opportunity.id])
    ).rows[0]?.profile
    if (mine?.pageSpeed && mine.website === profile.website) profile.pageSpeed = mine.pageSpeed
  }
  const placeMedia = (await snapshotMediaOf(db, snapshot.id))
    .filter((m) => !m.revoked_at)
    .map((m) => ({ ...m, origin: 'place' }))
  // Pictures of the sources only this opportunity names. `mergeProfile` reads the place's source of a kind
  // first, so a private page never outranks the place's own.
  const ownMedia = ownKinds.size
    ? (
        await db.query('select * from wo_media where opportunity_id = $1 order by collected_at, id', [
          opportunity.id
        ])
      ).rows
        .filter((m) => ownKinds.has(m.source))
        .map((m) => ({ ...m, origin: 'opportunity' }))
    : []
  // The research card lists every source the run tried, failures too; collected reviews read as above.
  const reviewOf = new Map(reviews.map((r) => [r.source, r]))
  const shown = [
    ...shownSourceRowsOf(snapshot.sources).map((s) => ({ ...(reviewOf.get(s.source) ?? s), shared: true })),
    ...own.map((s) => ({ ...s, shared: false }))
  ]
  const part = (name) => snapshot.sources.find((s) => s.source === name) ?? null
  return {
    snapshot,
    sources: rows,
    shown,
    // The hours and Google's rating on the site, with this account's choices (`business-hours.js`, `business-rating.js`),
    // and every phone the business lists, the main one first (`business-phones.js`). Links read without share tracking
    // whenever they were saved (`social-links.mjs`, #1780 item 10).
    profile: cleanProfileLinks(
      withPhoneDecision(withRatingDecision(withHoursDecision(profile, { opportunity }), { opportunity }), {
        opportunity
      })
    ),
    brand: held.brand ?? null,
    media: [...placeMedia, ...ownMedia],
    menu: menuViewOf({
      file: part(MENU_FILE_PART),
      photos: part(MENU_PHOTOS_PART),
      profile: held.profile ?? {},
      menuPhotos: placeMedia.filter((m) => m.category === 'menu').length
    })
  }
}

const iso = (v) => (v ? new Date(v).toISOString() : null)
const lastReason = (row) => row?.last_error?.reason ?? (row?.collected_at ? null : (row?.reason ?? null))
/** Why the photos were not read, as the Menu says it (`reason`), from the `menu-photos` row's last try. */
const PHOTOS_OFF = {
  switched_off: 'photo-reading-off',
  not_configured: 'photo-reading-off',
  unavailable: 'photo-reading-off',
  not_tested: 'vision-not-tested'
}
/** A photo's record counts as read when the model's answer was kept (a menu, not a menu, nothing legible). */
const READ = new Set(['menu', 'not-menu', 'unreadable'])

function fileName(url) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.hostname
  } catch {
    return String(url)
  }
}

/** What the menu says a printed price means (`priceScale`): 1 full, 1000 / 10000 / 1000000 shortened; null unknown. */
const SCALES = new Set([1, 1000, 10_000, 1_000_000])
const scaleOf = (priced) => (SCALES.has(priced?.priceScale) ? priced.priceScale : null)

/**
 * The Menu of a place (the `menu` data contract): the merged dishes of its
 * snapshot profile with where each came from, and what its two research parts (`menu-file`, `menu-photos`) did last.
 * Null for a place that is not a food or drink business and holds no dishes. `ops` adds each photo's cost and model.
 * Pure: every value is read from the rows given, nothing is assumed.
 * @param {{file?: any, photos?: any, profile?: any, menuPhotos?: number, ops?: boolean}} input
 */
export function menuViewOf({ file = null, photos = null, profile = {}, menuPhotos = 0, ops = false }) {
  const dishes = Array.isArray(profile?.menuItems) ? profile.menuItems : []
  const applicable = menuApplicable({
    google: profile?.googlePlace ?? null,
    profile,
    items: dishes,
    menuPhotos
  })
  if (!applicable) return null
  const items = dishes.map((i) => {
    const photo = i?.source?.kind === 'photo'
    return {
      name: i.name,
      price: i.price ?? null,
      currency: i.currency ?? null,
      currencyAssumed: i.currencyAssumed === true,
      section: i.section ?? null,
      size: i.size ?? null,
      source: {
        kind: photo ? 'photo' : 'file',
        url: i.source?.url ?? null,
        mediaId: photo ? (i.source?.mediaId ?? i.source?.region ?? null) : null
      },
      verified: false,
      // The price is the printed number, never multiplied; the scale says what the menu says it means.
      priceScale: scaleOf(i),
      otherPrices: Array.isArray(i.otherPrices)
        ? i.otherPrices.map((o) => ({ price: o.price, mediaId: o.mediaId ?? null, priceScale: scaleOf(o) }))
        : []
    }
  })
  const records = Array.isArray(photos?.collected?.photos) ? photos.collected.photos : []
  const fileReads = Array.isArray(file?.collected?.reads)
    ? file.collected.reads
    : !file
      ? (profile?.menuReads ?? []).filter((r) => r?.kind !== 'photo')
      : []
  const tried = (row) => Boolean(row?.attempted_at || row?.collected_at)
  const photoReason = lastReason(photos)
  const off = PHOTOS_OFF[photoReason] ?? null
  const settled = (row) => ['not_found', 'private_or_empty', 'ambiguous'].includes(lastReason(row))
  const failed =
    (file?.last_error && !settled(file)) ||
    fileReads.some((r) => r?.status === 'failed') ||
    (photos?.last_error && !settled(photos) && !off) ||
    ['partial', 'budget'].includes(photos?.collected?.reading?.status) ||
    records.some((r) => r.read === 'failed')
  const state =
    !tried(file) && !tried(photos)
      ? items.length
        ? 'read'
        : 'never'
      : items.length
        ? failed
          ? 'partial'
          : 'read'
        : off
          ? 'off'
          : failed
            ? 'partial'
            : 'none'
  const readAt = [file?.collected_at, photos?.collected_at]
    .filter(Boolean)
    .map((v) => new Date(v).getTime())
    .sort((a, b) => b - a)[0]
  const currencies = new Map()
  for (const i of items) if (i.currency) currencies.set(i.currency, (currencies.get(i.currency) ?? 0) + 1)
  const currency = [...currencies].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const limit = photos?.collected?.limit ?? photos?.coverage?.limit
  return {
    applicable,
    state,
    reason: state === 'never' ? null : (off ?? (state === 'none' ? 'no-menu-found' : null)),
    readAt: readAt ? new Date(readAt).toISOString() : null,
    currency,
    counts: {
      file: items.filter((i) => i.source.kind === 'file').length,
      photo: items.filter((i) => i.source.kind === 'photo').length,
      photosRead: records.filter((r) => READ.has(r.read)).length,
      photosTotal: records.length,
      limit: Number.isInteger(limit) ? limit : null
    },
    items,
    files: fileReads
      .filter((r) => typeof r?.url === 'string')
      .map((r) => ({
        url: r.url,
        name: fileName(r.url),
        items: Number(r.items) || 0,
        readAt: iso(file?.collected_at)
      })),
    photos: records.map((r) => ({
      mediaId: r.mediaId ?? null,
      result: r.result ?? 'unread',
      items: Number(r.items) || 0,
      sameAs: r.sameAs ?? null,
      ...(ops ? { costCents: Number(r.costCents) || 0, model: r.model ?? null } : {})
    }))
  }
}

const SEARCH_ROWS = new Set(['facebook-search', 'instagram-search'])
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

/**
 * The pages a search row found, for the research card (Added / Needs a check / Not used): short evidence
 * only. Null for every other row, and for a search that kept no pages.
 * @param {{source: string, collected?: object, coverage?: object}} row
 * @returns {null | {queries: number | null, pages: {url: string, network: string, verdict: string,
 *   title: string | null, proofs: string[], reasons: string[]}[]}}
 */
export function searchRowPages(row) {
  if (!SEARCH_ROWS.has(row?.source)) return null
  const held = Array.isArray(row.collected?.pages) ? row.collected : row.coverage
  if (!Array.isArray(held?.pages)) return null
  return {
    queries: typeof held.queries === 'number' ? held.queries : null,
    pages: held.pages
      .filter((p) => typeof p?.url === 'string')
      .map((p) => ({
        url: p.url,
        network: p.network,
        verdict: p.verdict,
        title: typeof p.evidence?.title === 'string' ? p.evidence.title : null,
        proofs: strings(p.evidence?.proofs),
        reasons: strings(p.evidence?.reasons)
      }))
  }
}
