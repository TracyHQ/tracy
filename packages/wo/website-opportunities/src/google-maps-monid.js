/**
 * Optional Google reviews through Monid (route pinned to litescrape `/google/reviews`): one run, a bounded poll and,
 * for a large answer, one download of the result. Official Google Place facts remain a separate source.
 */
import { createHash } from 'node:crypto'
import { mapsImageUrl, mapsSourceUrl } from './google-maps-serpapi.js'
import { tripadvisorJson } from './tripadvisor.js'

export const MONID_ROUTE = 'litescrape/google-reviews'
const API = 'https://api.monid.ai/v1/'
const PER_CALL = 100
const MAX_TEXT = 10_000
const RUNNING = new Set(['RUNNING', 'PENDING', 'QUEUED', 'STARTED'])
// A non-retryable answer keeps its HTTP code (credential, payment, refusal); these may succeed on the next run.
const RETRYABLE = new Set(['TIMEOUT', 'PROVIDER_ERROR', 'HTTP_429'])

const fail = (code) => Object.assign(new Error(`Monid provider ${code}`), { code })
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const placeIdOk = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value)
const runIdOk = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Whether a failed Monid call may be tried again on the next run rather than counted as a settled failure. */
export const monidRetryable = (error) => RETRYABLE.has(error?.code)

/** The signed result link Monid hands back: https on a monid.ai host, no credentials, default port; else null. */
export function monidDownloadUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /(^|\.)monid\.ai$/.test(url.hostname)
      ? url.href
      : null
  } catch {
    return null
  }
}

async function monidJson(url, { key, fetch: fetchImpl, timeoutMs, body }) {
  try {
    return await tripadvisorJson(
      url,
      {
        accept: 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      // A POST starts a paid run: never retried, so a 5xx cannot start two.
      { fetch: fetchImpl, timeoutMs, ...(body === undefined ? {} : { body, retry: { retries: 0 } }) }
    )
  } catch (error) {
    const code = String(error?.code ?? '')
    if (/^HTTP_5\d\d$/.test(code)) throw fail('PROVIDER_ERROR')
    if (/^HTTP_(401|402|403|429)$/.test(code)) throw fail(code)
    if (/^HTTP_\d+$/.test(code)) throw fail('APPLICATION_ERROR')
    if (code === 'TIMEOUT') throw fail('TIMEOUT')
    if (['BODY_LIMIT', 'INVALID_JSON', 'INVALID_RESPONSE'].includes(code)) throw fail('INVALID_RESPONSE')
    throw fail('PROVIDER_ERROR')
  }
}

/**
 * Up to 100 Google reviews of one exact place: `{placeInfo, reviews, costUsd, runId, fetchedAt}`, the reviews
 * normalized (`normalizeMonidReviews`). Never follows pagination. A poll that outlives `budgetMs` throws `TIMEOUT`.
 */
export async function monidGoogleReviewsCall(
  params,
  {
    key,
    fetch: fetchImpl = fetch,
    now = Date.now,
    sleep = wait,
    pollMs = 1_500,
    budgetMs = 60_000,
    timeoutMs = 20_000
  } = {}
) {
  if (!key) throw fail('CREDENTIAL_MISSING')
  if (!placeIdOk(params?.placeId)) throw fail('INVALID_LOCATION')
  const deadline = now() + budgetMs
  let run = await monidJson(new URL('run', API).href, {
    key,
    fetch: fetchImpl,
    timeoutMs,
    body: JSON.stringify({
      provider: 'litescrape',
      endpoint: '/google/reviews',
      input: { queryParams: { place_id: params.placeId, num: PER_CALL } }
    })
  })
  if (!object(run) || object(run.error)) throw fail('APPLICATION_ERROR')
  if (!runIdOk(run.runId)) throw fail('INVALID_RESPONSE')
  const runId = run.runId
  while (RUNNING.has(run.status)) {
    if (now() + pollMs > deadline) throw fail('TIMEOUT')
    await sleep(pollMs)
    run = await monidJson(new URL(`runs/${encodeURIComponent(runId)}`, API).href, {
      key,
      fetch: fetchImpl,
      timeoutMs
    })
    if (!object(run) || object(run.error)) throw fail('APPLICATION_ERROR')
  }
  if (run.status !== 'COMPLETED') throw fail('APPLICATION_ERROR')
  let body = run.output
  if (object(body?.data) && 'download_link' in body.data) {
    const link = monidDownloadUrl(body.data.download_link)
    if (!link) throw fail('INVALID_RESPONSE')
    if (now() > deadline) throw fail('TIMEOUT')
    // The link is signed: our key never goes to it.
    body = await monidJson(link, { fetch: fetchImpl, timeoutMs })
  }
  if (!object(body) || body.error) throw fail('APPLICATION_ERROR')
  if (!Array.isArray(body.reviews) || !object(body.place_info)) throw fail('INVALID_RESPONSE')
  const answered = body.search_parameters?.place_id
  if (answered !== undefined && answered !== params.placeId) throw fail('INVALID_RESPONSE')
  const fetchedAt = new Date(now()).toISOString()
  const cost = run.cost?.value
  return {
    runId,
    fetchedAt,
    costUsd: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null,
    placeInfo: {
      title: text(body.place_info.title),
      rating: Number.isFinite(body.place_info.rating) ? body.place_info.rating : null,
      reviews: Number.isInteger(body.place_info.reviews) ? body.place_info.reviews : null
    },
    reviews: normalizeMonidReviews(body.reviews, params.placeId, { fetchedAt })
  }
}

/** Google's own id of a review, read from a Maps review link (`…/maps/reviews/data=…!1s<id>!…`); else null. */
export function googleReviewIdOf(url) {
  if (typeof url !== 'string') return null
  return /\/maps\/reviews\/data=[^?#]*?!1s([A-Za-z0-9_-]{8,512}={0,2})!/.exec(url)?.[1] ?? null
}

const contributorOf = (url) =>
  typeof url === 'string' ? (/\/maps\/contrib\/(\d{1,30})(?:[/?#]|$)/.exec(url)?.[1] ?? null) : null

const rated = (value) => (Number.isFinite(value) && value >= 1 && value <= 5 ? value : null)

function quoted(entry) {
  const words = text(entry?.extracted_snippet?.original) ?? text(entry?.snippet)
  return words && words.length <= MAX_TEXT ? words : null
}

/**
 * litescrape review items → the review shape WO keeps for Google Maps (`normalizeMapsReviews`), plus provenance
 * (`provider`, `route`, `fetchedAt`, `googleReviewId`) and what this route adds (`ownerResponse`, `subratings`).
 * The author's own words are kept (`extracted_snippet.original`); a review with no text, author or link is left out.
 */
export function normalizeMonidReviews(raw, placeId, { fetchedAt = null } = {}) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : []).flatMap((review) => {
    if (!object(review)) return []
    const content = quoted(review),
      author = text(review.user?.name),
      url = mapsSourceUrl(review.link)
    if (!content || !author || !url) return []
    const googleReviewId = /^[A-Za-z0-9_-]{8,512}={0,2}$/.test(review.review_id ?? '')
      ? review.review_id
      : googleReviewIdOf(url)
    const id = createHash('sha256')
      .update(googleReviewId ? `google-review:${googleReviewId}` : url)
      .digest('hex')
      .slice(0, 24)
    if (seen.has(id)) return []
    seen.add(id)
    const contributorId = /^\d{1,30}$/.test(String(review.user?.contributor_id ?? ''))
      ? String(review.user.contributor_id)
      : contributorOf(review.user?.link)
    const answer = quoted(review.response)
    const subratings = Object.fromEntries(
      ['food', 'service', 'atmosphere'].flatMap((k) =>
        rated(review.subratings?.[k]) === null ? [] : [[k, review.subratings[k]]]
      )
    )
    return [
      {
        id,
        source: 'google-maps',
        provider: 'monid',
        route: MONID_ROUTE,
        attribution: 'Google',
        googlePlaceId: placeId,
        googleReviewId,
        text: content,
        author,
        authorUrl: contributorId ? `https://www.google.com/maps/contrib/${contributorId}` : null,
        authorAvatarUrl: mapsImageUrl(review.user?.thumbnail),
        contributorId,
        url,
        rating: rated(review.rating),
        date: text(review.iso_date) ?? text(review.date),
        fetchedAt,
        ownerResponse: answer
          ? { text: answer, date: text(review.response.iso_date) ?? text(review.response.date) }
          : null,
        subratings: Object.keys(subratings).length ? subratings : null,
        photos: (Array.isArray(review.images) ? review.images : []).slice(0, 10).flatMap((photo) => {
          const image = mapsImageUrl(typeof photo === 'string' ? photo : (photo?.image ?? photo?.thumbnail))
          return image ? [{ url: image, reviewId: id, sourceUrl: url }] : []
        })
      }
    ]
  })
}

/**
 * Monid reviews that are not already held: a held review with the same Google review id or link, or by the same
 * contributor with the same words, is the same review. The same author name alone proves nothing.
 * `held` mixes Place Details reviews (`googleMapsUri`, `authorUri`) and Maps reviews (`url`, `authorUrl`).
 */
export function monidSupplement(reviews, held = []) {
  const ids = new Set()
  const urls = new Set()
  const said = new Set()
  for (const review of held) {
    for (const link of [review?.googleMapsUri, review?.url]) {
      if (typeof link !== 'string') continue
      urls.add(link)
      const id = googleReviewIdOf(link)
      if (id) ids.add(id)
    }
    if (review?.googleReviewId) ids.add(review.googleReviewId)
    const contributor =
      review?.contributorId ?? contributorOf(review?.authorUri) ?? contributorOf(review?.authorUrl)
    const words = text(review?.text)
    if (contributor && words) said.add(`${contributor}\n${words}`)
  }
  return reviews.filter(
    (review) =>
      !(review.googleReviewId && ids.has(review.googleReviewId)) &&
      !urls.has(review.url) &&
      !(review.contributorId && said.has(`${review.contributorId}\n${review.text}`))
  )
}

/**
 * A Maps source's reviews with Monid's: the `held` ones (SerpApi) first and untouched, then each Monid review neither
 * they nor the Place Details reviews (`official`) already hold. Monid's set replaces the previous Monid set whole.
 */
export function withMonidReviews(held, monid, official = []) {
  const kept = held.filter((review) => review?.provider !== 'monid')
  return [...kept, ...monidSupplement(monid, [...official, ...kept])]
}
