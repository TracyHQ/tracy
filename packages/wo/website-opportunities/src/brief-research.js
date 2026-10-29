/**
 * The research a site brief reads: a place's shared snapshot with the account's overlay, or the per-account rows of
 * an opportunity not researched as a place yet. Shared by every builder, so a brief reads the same whoever builds it.
 */
import { revokedHubCopy } from './hub/local-cache.js'
import { mediaJunk } from './media-junk.js'
import { withoutNearCopies } from '../domain/pictures/brief-media.mjs'
import { addReviewSources } from './review-sources.js'
import { placeViewOf } from './place-view.js'
import { withNameDecision } from './business-name.js'
import { withHoursDecision } from './business-hours.js'
import { withRatingDecision } from './business-rating.js'
import { withPhoneDecision } from './business-phones.js'
import { candidateAsRead } from '../domain/candidate-as-read.mjs'
import { cleanProfileLinks } from '../domain/social-links.mjs'
import { suppliedBySource, withAttemptedSources } from '../domain/brief-sources.mjs'

export const opportunityOf = (opp) => ({
  id: opp.id,
  name: opp.name,
  branch: opp.branch,
  provider: opp.provider,
  providerId: opp.provider_id,
  // As read today, whenever it was saved (`candidate-as-read.mjs`).
  candidate: candidateAsRead(structuredClone(opp.candidate ?? {}))
})

/** Sources never collected (`pending`) are not evidence of anything yet. */
export const EVIDENCE = new Set(['complete', 'partial', 'blocked', 'failed'])
/** Sources whose `collected` holds what was read (posts included). */
export const COLLECTED = new Set(['complete', 'partial'])

const mediaOfBrief = (m) => ({
  id: m.id,
  ...(m.origin ? { origin: m.origin } : {}),
  kind: m.kind,
  category: m.category,
  sha256: m.sha256,
  mime: m.mime,
  width: m.width,
  height: m.height,
  source: m.source,
  sourceUrl: m.source_url,
  // The post a picture belongs to: a review's on a listing, the place's own post on a social page (dish photos read it).
  ...(m.post_id ? { postId: m.post_id } : {}),
  ...(['tripadvisor', 'google-maps', 'google-places'].includes(m.source)
    ? { postId: m.post_id, credit: m.credit ?? null }
    : {}),
  labels: m.labels ?? null,
  caption: m.caption ?? null,
  alt: m.alt ?? null,
  bytes: m.bytes ?? null,
  postedAt: m.posted_at ? new Date(m.posted_at).toISOString() : null
})

/**
 * The brand a brief carries: the website's observation, else the social one, with the logo the place's research chose and
 * the other candidates (`place-logo.js`). A place whose logo was looked for and not found carries that state, so the brief
 * says "none found" instead of saying nothing.
 */
export function briefBrand(brand) {
  const base = brand?.website ?? brand?.social ?? null
  const research = brand?.logoResearch
  if (!research) return base
  return {
    ...(base ?? { origin: 'social', official: false, colors: [], fonts: [], evidence: [] }),
    ...(research.chosen ? { logo: research.chosen.mediaId } : {}),
    logoResearch: {
      ...(research.version ? { version: research.version } : {}),
      ...(research.at ? { at: research.at } : {}),
      // A page-named avatar can be chosen without OCR. Keep why it was not read instead of hiding that distinction.
      ...(research.vision ? { vision: structuredClone(research.vision) } : {}),
      status: research.status,
      chosen: research.chosen ?? null,
      candidates: (research.candidates ?? []).slice(0, 6).map((c) => ({
        mediaId: c.mediaId,
        via: c.via,
        source: c.source,
        width: c.width ?? null,
        height: c.height ?? null,
        reading: c.reading
          ? {
              isLogo: c.reading.isLogo,
              kind: c.reading.kind,
              ...(c.reading.showsName !== undefined ? { showsName: c.reading.showsName } : {}),
              ...(c.reading.readsAs !== undefined ? { readsAs: c.reading.readsAs } : {}),
              ...(c.reading.key ? { key: c.reading.key } : {}),
              ...(c.reading.at ? { at: c.reading.at } : {})
            }
          : null
      }))
    }
  }
}

/** The ids of the chosen logo and the candidates the model also called a logo: kept in a brief whatever their size. */
const logoIds = (brand) =>
  new Set(
    [
      brand?.logoResearch?.chosen?.mediaId,
      ...(brand?.logoResearch?.candidates ?? [])
        .filter((c) => c?.reading?.isLogo === true)
        .map((c) => c.mediaId)
    ].filter(Boolean)
  )

/** What a brief reads of a place's snapshot with the account's overlay. */
export function fromPlace(view) {
  return {
    // `updated_at` is when a source was last tried, not what it said: a Retry that changes nothing keeps the key.
    rawSources: structuredClone(view.sources.map(({ updated_at: _tried, ...source }) => source)),
    profile: view.profile,
    brand: view.brand,
    sources: view.sources
      .filter((s) => EVIDENCE.has(s.status))
      .map((s) => ({
        source: s.source,
        ref: s.ref,
        status: s.status,
        reason: s.reason,
        coverage: s.coverage ?? { fetched: 0 }
      })),
    // Every source the run tried, failures included (the research card's rows): the brief lists them all, so a reader
    // sees a Google Maps 429 or a TripAdvisor 402 behind thin reviews (`brief-sources.mjs`).
    attemptedSources: (view.shown ?? [])
      .filter((s) => EVIDENCE.has(s.status))
      .map((s) => ({
        source: s.source,
        status: s.status,
        reason: s.reason ?? null,
        coverage: s.coverage ?? null
      })),
    // The restaurant's photographs and its logos: the icons, maps and spacers of its website's markup stay out (`media-junk.js`),
    // and so does the smaller copy of a photograph two sources both hold (`brief-media.mjs`).
    media: withoutNearCopies(
      view.media.filter((m) => m.status === 'stored' && (!mediaJunk(m) || logoIds(view.brand).has(m.id))),
      { keep: logoIds(view.brand) }
    ).map(mediaOfBrief),
    posts: view.sources
      .filter((s) => COLLECTED.has(s.status))
      .flatMap((s) => (s.collected?.posts ?? []).map((post) => ({ source: s.source, ...post })))
  }
}

/** What a brief reads of the per-account rows (no place, or a place not researched yet). */
export async function fromOpportunity(client, opp) {
  const rawSources = (
    await client.query(
      `select source, ref, status, reason, coverage, collected from wo_source where opportunity_id = $1 and status = any($2)`,
      [opp.id, [...EVIDENCE]]
    )
  ).rows.map((s) => ({ ...s, coverage: s.coverage ?? { fetched: 0 } }))
  const sources = rawSources.map(({ collected: _collected, ...source }) => source)
  const media = (
    await client.query(
      `select id, kind, category, sha256, mime, width, height, source, source_url, post_id, posted_at, status, labels, caption, alt, bytes, dhash
       from wo_media where opportunity_id = $1 and status = 'stored' order by collected_at, id`,
      [opp.id]
    )
  ).rows
  const profileRow = (
    await client.query('select profile, brand from wo_profile where opportunity_id = $1', [opp.id])
  ).rows[0]
  // The restaurant's own posts, each source's as collected: the brief makes its content from them.
  const posts = (
    await client.query(
      `select s.source, p.post from wo_source s, jsonb_array_elements(coalesce(s.collected->'posts', '[]'::jsonb)) p(post)
       where s.opportunity_id = $1 and s.status = any($2)`,
      [opp.id, [...COLLECTED]]
    )
  ).rows.map((r) => ({ source: r.source, ...r.post }))
  return {
    // The name on the site with the person's pick, made after research or not (`business-name.js`); its links clean.
    profile: cleanProfileLinks(
      withPhoneDecision(
        withRatingDecision(
          withHoursDecision(
            withNameDecision(profileRow?.profile ?? {}, { opportunity: opp, brand: profileRow?.brand }),
            { opportunity: opp }
          ),
          { opportunity: opp }
        ),
        { opportunity: opp }
      )
    ),
    brand: profileRow?.brand ?? null,
    sources,
    media: withoutNearCopies(media, { keep: logoIds(profileRow?.brand) }).map(mediaOfBrief),
    posts,
    rawSources
  }
}

/**
 * Facts the place's current snapshot took from a shared hub that has since revoked them (`hub/local-cache.js`):
 * `[{hubPlaceId, source, revokedAt}]`. Empty where no hub was ever read (the table is absent on such a host).
 */
async function revokedHubUses(db, placeId) {
  const { rows } = await db.query(`select to_regclass('wo_hub_client_use') is not null as present`)
  if (!rows[0].present) return []
  return (
    await db.query(
      `select u.hub_place_id, u.source, u.revoked_at from wo_place p
         join wo_hub_client_use u on u.snapshot_id = p.current_snapshot_id
        where p.id = $1 and u.revoked_at is not null order by u.hub_place_id`,
      [placeId]
    )
  ).rows.map((r) => ({ hubPlaceId: r.hub_place_id, source: r.source, revokedAt: r.revoked_at.toISOString() }))
}

/** A read without what a revoked hub copy gave it: its source rows, and the Google facts they became. */
function withoutRevoked(read, revoked) {
  const gone = new Set(revoked.map((r) => r.source))
  const keep = (s) => !gone.has(s.source)
  const profile = { ...read.profile }
  if (gone.has('google-places')) delete profile.googlePlace
  return {
    ...read,
    profile,
    rawSources: read.rawSources.filter(keep),
    sources: read.sources.filter(keep),
    ...(read.attemptedSources ? { attemptedSources: read.attemptedSources.filter(keep) } : {}),
    posts: read.posts.filter(keep),
    hubRevoked: revoked
  }
}

/**
 * Pictures with the vision label a build already paid for (F08): a place's picture keeps its label in
 * `wo_media_analysis` by sha256, not on its row, so the brief reads it there. Of several answers, one with a content kind
 * first, then the newest. A picture that carries a label on its own row, or has none anywhere, is returned as it is.
 * @param {any[]} media a brief read's media
 * @param {{media_sha256: string, model: string, version: string, result: any, updated_at: any}[]} analyses done rows
 */
export function withCachedVision(media, analyses) {
  const best = new Map()
  const rank = (r) => [r.result?.content ? 1 : 0, new Date(r.updated_at).getTime() || 0]
  for (const r of analyses) {
    if (!r?.result || typeof r.result !== 'object') continue
    const held = best.get(r.media_sha256)
    const [c, t] = rank(r)
    const [hc, ht] = held ? rank(held) : [-1, -1]
    if (c > hc || (c === hc && t > ht)) best.set(r.media_sha256, r)
  }
  return media.map((m) => {
    const r = m.labels?.vision ? null : best.get(m.sha256)
    if (!r) return m
    return {
      ...m,
      labels: { ...m.labels, vision: { key: r.version, model: r.model, labels: r.result } }
    }
  })
}

/** The done vision labels of these pictures' bytes; none where the table is absent. */
async function cachedVisionOf(db, media) {
  const shas = [...new Set(media.filter((m) => !m.labels?.vision && m.sha256).map((m) => m.sha256))]
  if (!shas.length) return []
  const { rows } = await db.query(`select to_regclass('wo_media_analysis') is not null as present`)
  if (!rows[0]?.present) return []
  return (
    await db.query(
      `select media_sha256, model, version, result, updated_at from wo_media_analysis
        where media_sha256 = any($1) and state = 'done' and result is not null`,
      [shas]
    )
  ).rows
}

/** A read whose pictures carry the vision labels already paid for. */
async function withVision(db, read) {
  return { ...read, media: withCachedVision(read.media, await cachedVisionOf(db, read.media)) }
}

/** What a brief of this opportunity reads now: `{read, view}`, `view` null without a place. */
export async function briefResearchOf(db, opp) {
  const view = opp.place_id ? await placeViewOf(db, opp) : null
  if (!view) {
    const read = await withVision(db, await fromOpportunity(db, opp))
    const revoked = await revokedHubCopy(db, read.profile?.googlePlace)
    return { read: revoked ? withoutRevoked(read, [{ ...revoked, source: 'google-places' }]) : read, view }
  }
  const revoked = await revokedHubUses(db, opp.place_id)
  const read = await withVision(db, fromPlace(view))
  return { read: revoked.length ? withoutRevoked(read, revoked) : read, view }
}

/** The site brief of one research read (`fromPlace`/`fromOpportunity`), with its review sources; not yet validated. */
export function makeSiteBrief(domain, read, { opportunity, madeAt, placeProfile = null }) {
  // A revision's frozen place profile (`freezePlaceProfile`): the brief states its facts with its frozen decisions, the
  // ones the Profile card and the build read (#1791). One made from research, not a sender's request.
  const frozen =
    placeProfile?.origin === 'research' &&
    placeProfile.assessment?.profileHash === placeProfile.profileHash &&
    Array.isArray(placeProfile.assessment?.facts)
      ? placeProfile
      : null
  // Every source the research tried joins the brief's own, failures with their codes (`brief-sources.mjs`).
  const brief = addReviewSources(
    domain.buildBrief({
      opportunity,
      ...(frozen ? { placeProfile: frozen.profile, factAssessment: frozen.assessment.facts } : {}),
      profile: read.profile,
      googlePlace: read.profile?.googlePlace ?? null,
      currentSite: read.profile?.pageSpeed ?? null,
      sources: read.sources,
      // `origin` is the manifest's (which table a picture is in), not the brief's.
      media: read.media.map(({ origin: _origin, ...m }) => m),
      posts: read.posts,
      // One observation: the website's when there is one, else the social profiles'.
      brand: briefBrand(read.brand),
      madeAt
    }),
    read.profile
  )
  // How the photographs were labelled when this brief was made (F08), failure included: the brief says it.
  // Each asset left unlabelled carries the reason the labelling step gave for it; the note keeps the counts.
  if (read.assetLabelling) {
    const { unlabelled = {}, ...note } = read.assetLabelling
    brief.assetLabelling = note
    for (const a of brief.assets ?? [])
      if (a.content === 'unlabelled' && typeof unlabelled[a.id] === 'string')
        a.unlabelledReason = unlabelled[a.id]
  }
  // A source row that counted nothing (Google Places) reports what the brief holds of it (`suppliedBySource`).
  return withAttemptedSources(brief, read.attemptedSources, {
    supplied: suppliedBySource({ googlePlace: brief.googlePlace, media: read.media, posts: read.posts })
  })
}
