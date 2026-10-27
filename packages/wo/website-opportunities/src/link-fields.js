/**
 * ONE BUSINESS FROM SEVERAL LINKS: the opportunity fields of the links a person pasted for one business (a Google
 * Maps or share link, its website, its social pages, its pages on listing sites). Shared by the Website
 * Opportunities create door (`route.js`) and Build from my business (the builder's own-site door).
 *
 * Which links are usable is `judgeLinks` (`domain/link-kinds.mjs`, the browser runs the same), then the server's
 * own checks: the public-URL guard on every link, a Google link turned into exactly one place or left out
 * (`unresolvable`), a listing page read once (`domain/listing-page.mjs`). Partial success is the rule: unusable links
 * are reported in `links` and the rest are used.
 *
 * The opportunity's identity, in this order: the Google place, else the website, else the first social page, else
 * the first listing page. Every other link stays PRIVATE to the opportunity (`places.js privateRefs`): the website
 * and socials in `candidate`, the listings in `candidate.listings` with what their pages said in a `wo_source` row
 * `listing` (`saveListingSource`), merged into the profile at the lowest priority (`executor.js mergeProfile`).
 */
import { dropTracking, judgeLinks } from '../domain/link-kinds.mjs'
import { isPlaceId } from './place-suggest.js'
import { LISTING_SOURCE, SOCIAL_SOURCES, normalizeUrl, sourceOfUrl } from './sources.js'

/** Most entries a request's `links` may carry; past `MAX_LINKS` they are reported as `limit`, not used. */
export const LINK_REQUEST_MAX = 20
const LINK_MAX_CHARS = 2000
/** Places a Google link's words are matched against (one billable Text Search). */
const GOOGLE_SEARCH_LIMIT = 10

/**
 * The link part of a create body: `{links: string[], name?, place?}`, or the old `{url, name?}` meaning one link.
 * @returns {{ raws: string[], typedName: string | null, place: any, legacy: boolean } | { error: { status: number,
 *   code: string, next: string } } | null} null when the body names no link at all
 */
export function linkRequestOf(b) {
  const typedName = typeof b?.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 200) : null
  const place = b?.place && typeof b.place === 'object' ? b.place : null
  if (b?.links !== undefined) {
    const ok =
      Array.isArray(b.links) &&
      b.links.length >= 1 &&
      b.links.length <= LINK_REQUEST_MAX &&
      b.links.every((l) => typeof l === 'string' && l.length <= LINK_MAX_CHARS)
    if (!ok)
      return {
        error: {
          status: 400,
          code: 'INVALID_LINKS',
          next: `Send "links" as 1 to ${LINK_REQUEST_MAX} addresses of one business, each a string.`
        }
      }
    return { raws: b.links.map((l) => l.trim()), typedName, place, legacy: false }
  }
  if (typeof b?.url === 'string' && b.url.length <= LINK_MAX_CHARS)
    return { raws: [b.url.trim()], typedName, place, legacy: true }
  return null
}

/** A Google place as the picker shows it (the 409 `GOOGLE_LINK_AMBIGUOUS` answer). */
export function pickerCandidateOf(c) {
  return {
    provider: 'google-places',
    providerId: c.providerId,
    name: c.name,
    ...(c.address ? { address: c.address } : {}),
    ...(Number.isFinite(c.rating) ? { rating: c.rating } : {}),
    ...(c.category ? { category: c.category } : {})
  }
}

/**
 * The ref a used link is saved as: the address as the person pasted it (`www.` kept, as the place's own links spell
 * it), with `https://` added to a bare domain and share-tracking parameters removed, in `normalizeUrl`'s spelling.
 */
function refOf(judged) {
  try {
    const raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(judged.raw) ? judged.raw : `https://${judged.raw}`
    const u = new URL(raw)
    dropTracking(u.searchParams)
    return normalizeUrl(u.href)
  } catch {
    return normalizeUrl(judged.url)
  }
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * @param {{ domainDeps: () => any, runtime: () => Promise<any>, candidateFields: (raw: any) => any }} deps
 */
export function createLinkFields({ domainDeps, runtime, candidateFields }) {
  /**
   * The fields of one business from its links. `{fields, links, listings}` to save, or `{refusal}`:
   * 409 `GOOGLE_LINK_AMBIGUOUS` with `candidates`, 422 `NO_USABLE_LINKS`, 400 `INVALID_PLACE`; with `legacy` (the
   * old `{url}` body) the old codes `INVALID_URL`, `URL_BLOCKED` and `URL_UNRESOLVABLE` when its one link fails.
   * @param {any} domain
   * @param {{ raws: string[], typedName: string | null, place: any, legacy: boolean }} request
   */
  return async function linkFields(domain, { raws, typedName, place, legacy }) {
    const deps = domainDeps()
    const judged = judgeLinks(raws)
    const report = judged.map((j) => ({
      url: j.url ?? j.raw,
      kind: j.kind,
      ...(j.source ? { source: j.source } : {}),
      used: j.used,
      ...(j.reason ? { reason: j.reason } : {})
    }))
    const drop = (i, reason) => {
      report[i] = { ...report[i], used: false, reason }
    }
    let guardCode = null
    // The public-URL guard on every link but Google's (its resolver guards each of its own hops).
    await Promise.all(
      judged.map(async (j, i) => {
        if (!j.used || j.kind === 'google') return
        try {
          await domain.assertPublicUrl(j.url, deps)
        } catch (error) {
          guardCode = error?.code === 'URL_BLOCKED' ? 'URL_BLOCKED' : 'URL_UNRESOLVABLE'
          drop(i, 'blocked')
        }
      })
    )
    const usedOf = (kind) =>
      judged.map((j, i) => ({ ...j, i })).filter((j) => report[j.i].used && kind(j.kind))

    // Listing pages: one limited read of each page, never a crawl; a page that blocks keeps its link and a name hint.
    const listings = await Promise.all(
      usedOf((k) => k === 'listing').map(async (j) => {
        const read = await domain.readListingPage(j.url, { fetch: deps.fetch, resolve: deps.resolve })
        return {
          url: refOf(j),
          source: j.source ?? hostOf(j.url),
          ok: read.ok === true,
          ...(read.ok ? { facts: read.facts } : { reason: read.reason, nameHint: read.nameHint ?? null })
        }
      })
    )

    // The Google place: the one the person picked, else the one the Google link means.
    let google = null
    const googleLink = usedOf((k) => k === 'google')[0] ?? null
    if (place) {
      google = await pickedPlace(domain, place, deps)
      if (!google)
        return refusal(400, 'INVALID_PLACE', 'Send "place" exactly as a candidate of the 409 answer.', report)
    } else if (googleLink) {
      const hints = listings
        .filter((l) => l.facts)
        .map((l) => ({
          name: l.facts.name,
          phone: l.facts.telephone,
          ...(l.facts.geo ? { lat: l.facts.geo.lat, lng: l.facts.geo.lng } : {})
        }))
      const names = [...hints.map((h) => h.name), ...listings.map((l) => l.nameHint)].filter(Boolean)
      const found = await googlePlaceOf(domain, googleLink.url, { typedName, hints, names }, deps)
      if (found.ambiguous)
        return {
          refusal: {
            status: 409,
            code: 'GOOGLE_LINK_AMBIGUOUS',
            next: 'Pick the right place and send the same request again with it as "place".',
            extra: { candidates: found.ambiguous.map(pickerCandidateOf), links: report }
          }
        }
      if (found.match) google = found.match
      else drop(googleLink.i, 'unresolvable')
    }

    const website = usedOf((k) => k === 'website')[0] ?? null
    const socials = {}
    let firstSocial = null
    for (const j of usedOf((k) => SOCIAL_SOURCES.includes(k))) {
      const source = sourceOfUrl(j.url)
      if (!SOCIAL_SOURCES.includes(source) || socials[source]) continue
      socials[source] = refOf(j)
      firstSocial ??= socials[source]
    }
    const websiteUrl = website ? refOf(website) : null

    if (!google && !websiteUrl && !firstSocial && listings.length === 0) {
      if (legacy) return legacyRefusal(report, guardCode)
      return refusal(
        422,
        'NO_USABLE_LINKS',
        'None of these links can be read: check them, or search by name.',
        report
      )
    }

    const listed = listings.map((l) => ({ url: l.url, source: l.source }))
    const listingName = listings.find((l) => l.facts?.name)?.facts.name ?? null
    let fields
    if (google) {
      const base = candidateFields(google)
      if (!base) return refusal(400, 'INVALID_PLACE', 'The Google place has no name.', report)
      const name = typedName ?? base.name
      fields = {
        ...base,
        name,
        candidate: {
          ...base.candidate,
          // Google's own name stays Google's claim; the name the person typed is final (`business-name.js`).
          ...(typedName ? { typedName } : {}),
          website: websiteUrl ?? base.candidate.website ?? null,
          socials: { ...base.candidate.socials, ...socials },
          ...(listed.length ? { listings: mergeListings(base.candidate.listings, listed) } : {})
        }
      }
    } else {
      const primary = websiteUrl ?? firstSocial ?? listed[0].url
      const placeholder =
        primary === listed[0]?.url && !websiteUrl && !firstSocial
          ? (listings[0].nameHint ?? hostOf(primary))
          : hostOf(primary)
      // The name a person typed is evidence (`mergeProfile`); a listing's name is only the row's label until the
      // research says more, so the candidate keeps the placeholder and the listing row carries its facts.
      const name = typedName ?? listingName ?? placeholder
      fields = {
        name,
        branch: null,
        provider: 'url',
        providerId: primary,
        candidate: {
          provider: 'url',
          providerId: primary,
          name: typedName ?? hostOf(primary),
          ...(typedName ? { typedName } : {}),
          ...(websiteUrl ? { website: websiteUrl } : {}),
          ...(Object.keys(socials).length ? { socials } : {}),
          ...(listed.length ? { listings: listed } : {})
        }
      }
    }
    return { fields, links: report, listings }
  }

  /** The place a person picked from the 409 candidates, read again from Google by its id (the client's copy is a hint). */
  async function pickedPlace(domain, place, deps) {
    if (place.provider !== 'google-places' || !isPlaceId(place.providerId)) return null
    const { keys } = await runtime()
    if (keys.google)
      try {
        const found = await domain.searchNamedPlaces(
          { placeId: place.providerId, anyKind: true },
          { ...deps, googleKey: keys.google }
        )
        const exact = found.candidates.find((c) => c.providerId === place.providerId)
        if (exact) return exact
      } catch {
        // Google did not answer: the picked candidate as sent, which is what the search door saves too.
      }
    return typeof place.name === 'string' && place.name.trim() ? place : null
  }

  /**
   * The one place a Google link means: `{match}`, `{ambiguous: candidates}` or `{}` when it cannot be turned into a
   * place (no Google key, a short link that does not resolve, no words to search, no result).
   */
  async function googlePlaceOf(domain, url, { typedName, hints, names }, deps) {
    const { keys } = await runtime()
    if (!keys.google) return {}
    let parsed = domain.parseGoogleLink(url)
    if (!parsed) return {}
    try {
      if (parsed.short) {
        const resolved = await domain.resolveShortLink(url, { fetch: deps.fetch, resolve: deps.resolve })
        parsed = domain.parseGoogleLink(resolved.url)
        if (!parsed) return {}
      }
      const query = parsed.q ?? typedName ?? names[0] ?? null
      if (!parsed.placeId && !query) return {}
      const found = await domain.searchNamedPlaces(
        parsed.placeId
          ? { placeId: parsed.placeId, anyKind: true }
          : { query, limit: GOOGLE_SEARCH_LIMIT, anyKind: true },
        { ...deps, googleKey: keys.google }
      )
      const answer = domain.matchGooglePlace({ candidates: found.candidates, parsed, typedName, hints })
      return answer.none ? {} : answer
    } catch {
      return {}
    }
  }
}

/** A candidate's listings plus new ones, one entry per page. */
export function mergeListings(held, added) {
  const out = Array.isArray(held) ? held.filter((l) => typeof l?.url === 'string') : []
  for (const l of added ?? []) if (!out.some((h) => h.url === l.url)) out.push(l)
  return out
}

function refusal(status, code, next, links) {
  return { refusal: { status, code, next, extra: { links } } }
}

/** The old `{url}` body's refusals, kept for clients that still send it. */
function legacyRefusal(report, guardCode) {
  if (report[0]?.reason === 'invalid' || report[0]?.reason === 'not-public')
    return report[0].reason === 'invalid'
      ? refusal(400, 'INVALID_URL', 'Send an http(s) address of a website or social page.', report)
      : refusal(
          422,
          'URL_BLOCKED',
          'Send a public address: private and local networks are not crawled.',
          report
        )
  if (guardCode === 'URL_BLOCKED')
    return refusal(
      422,
      'URL_BLOCKED',
      'Send a public address: private and local networks are not crawled.',
      report
    )
  if (guardCode === 'URL_UNRESOLVABLE')
    return refusal(422, 'URL_UNRESOLVABLE', 'Check the address: its host could not be resolved.', report)
  return refusal(
    422,
    'NO_USABLE_LINKS',
    'None of these links can be read: check them, or search by name.',
    report
  )
}

/**
 * What the listing pages of an opportunity said, as its private `listing` source: one row (the first page is its
 * `ref`), every page in `collected.listings`, the first page that named the business as `collected.profile`, which
 * `mergeProfile` reads after every other source. Pages already held are kept; a page read again replaces its entry.
 */
export async function saveListingSource(db, opportunityId, listings) {
  if (!Array.isArray(listings) || listings.length === 0) return
  const held = (
    await db.query('select collected from wo_source where opportunity_id = $1 and source = $2', [
      opportunityId,
      LISTING_SOURCE
    ])
  ).rows[0]?.collected?.listings
  const all = Array.isArray(held) ? held.filter((l) => !listings.some((n) => n.url === l.url)) : []
  all.push(...listings)
  const named = all.find((l) => l.facts?.name)?.facts ?? null
  const profile = named
    ? {
        name: named.name,
        ...(named.telephone ? { phone: named.telephone } : {}),
        ...(named.address ? { address: named.address } : {}),
        ...(named.category ? { businessType: named.category } : {}),
        ...(Array.isArray(named.hours) && named.hours.length ? { hours: named.hours } : {})
      }
    : null
  const ok = all.some((l) => l.ok)
  await db.query(
    `insert into wo_source (opportunity_id, source, ref, status, reason, coverage, collected, updated_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())
     on conflict (opportunity_id, source) do update set ref = excluded.ref, status = excluded.status,
       reason = excluded.reason, coverage = excluded.coverage, collected = excluded.collected, updated_at = now()`,
    [
      opportunityId,
      LISTING_SOURCE,
      all[0].url,
      ok ? 'complete' : 'failed',
      ok ? null : (all[0].reason ?? 'error'),
      JSON.stringify({ fetched: all.filter((l) => l.ok).length, pages: all.length }),
      JSON.stringify({ listings: all, ...(profile ? { profile } : {}) })
    ]
  )
}
