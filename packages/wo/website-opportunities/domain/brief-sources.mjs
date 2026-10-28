/**
 * The `sources` of a site brief: every source the research tried, the failed ones with their status, error code
 * and the providers each one called, so a reader knows why some data is thin (a Google Maps 429, a TripAdvisor
 * 402 when its paid quota is spent). Entries only ever gain fields: `source`, `status`, `reason` and `coverage`
 * read as they always did (brief schema 2).
 */

/** Statuses that are evidence of a try; `pending` was never collected. */
const TRIED = new Set(['complete', 'partial', 'blocked', 'failed'])

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
/** A machine code (`HTTP_429`, `APPLICATION_ERROR`); free text is a reason, not a code. */
const codeOf = (v) => (nonEmpty(v) && /^[A-Z][A-Z0-9_]*$/.test(v) ? v : null)
const httpStatusOf = (code) => {
  const hit = /^HTTP_(\d{3})$/.exec(code ?? '')
  return hit ? Number(hit[1]) : null
}
const withCode = (reason) => {
  const code = codeOf(reason)
  const httpStatus = httpStatusOf(code)
  return { ...(code ? { code } : {}), ...(httpStatus ? { httpStatus } : {}) }
}

/**
 * The providers one source called, in order: `coverage.attempts` (capability runs) or `coverage.outcomes`
 * (TripAdvisor's steps), each `{provider, status, step?, code?, httpStatus?}`.
 */
function attemptsOf(coverage) {
  const raw = Array.isArray(coverage?.attempts)
    ? coverage.attempts
    : Array.isArray(coverage?.outcomes)
      ? coverage.outcomes
      : []
  return raw
    .filter((a) => nonEmpty(a?.provider) && nonEmpty(a?.status))
    .map((a) => ({
      provider: a.provider,
      status: a.status,
      ...(nonEmpty(a.step) ? { step: a.step } : {}),
      ...withCode(a.reason ?? a.code)
    }))
}

/**
 * What a reader needs of a source's coverage: counts and the providers it tried, no job ids or pipeline state. A row
 * that counted nothing itself (Google Places stores no coverage) takes what the brief holds of it (`supplied`).
 */
function coverageOf(coverage, supplied = null) {
  const c = coverage && typeof coverage === 'object' ? coverage : {}
  const counted = Number.isInteger(c.fetched)
  return {
    fetched: counted ? c.fetched : (supplied?.fetched ?? 0),
    ...(!counted && supplied?.reviews ? { reviews: supplied.reviews } : {}),
    ...(!counted && supplied?.photos ? { photos: supplied.photos } : {}),
    ...(Number.isInteger(c.total) ? { total: c.total } : {}),
    ...(Number.isInteger(c.pages) ? { pages: c.pages } : {}),
    ...(nonEmpty(c.until) ? { until: c.until } : {}),
    ...(Array.isArray(c.attempts) ? { attempts: c.attempts } : {})
  }
}

/**
 * The reason a brief states (pure): a social search that found a page it could not confirm is stored `complete` with
 * reason `pending`, which reads as "not done"; the brief says what it means. A failure's reason is its code.
 */
const reasonOf = (s) =>
  s.status === 'complete' && s.reason === 'pending'
    ? 'unconfirmed-page'
    : nonEmpty(s.reason)
      ? s.reason
      : null

/**
 * One brief `sources` entry of a research source row (`wo_source`-shaped). `supplied` is what the brief holds of a
 * source whose row counted nothing (`suppliedBySource`).
 */
export function briefSourceEntry(s, supplied = null) {
  const attempts = attemptsOf(s.coverage)
  const reason = reasonOf(s)
  return {
    source: s.source,
    status: s.status,
    ...(reason ? { reason } : {}),
    ...withCode(s.reason),
    coverage: coverageOf(s.coverage, supplied?.[s.source]),
    ...(attempts.length ? { attempts } : {})
  }
}

/** The `missing` line of a source that gave nothing (the same words `buildBrief` writes). */
export const missingOfSource = (s) => ({
  field: `source:${s.source}`,
  why: `${s.status}${nonEmpty(s.reason) ? `: ${s.reason}` : ''}; nothing from this source is in the brief.`
})

/**
 * A brief with every source its research tried (`attempted`, the research card's rows): the ones it does not list
 * yet are added after its own, a failed or blocked one with its `missing` line. Without a list, the brief as it was.
 */
export function withAttemptedSources(brief, attempted, { supplied = null } = {}) {
  if (!Array.isArray(attempted)) return brief
  const listed = new Set((brief.sources ?? []).map((s) => s.source))
  const added = []
  for (const s of attempted) {
    if (!nonEmpty(s?.source) || !TRIED.has(s.status) || listed.has(s.source)) continue
    listed.add(s.source)
    added.push(s)
  }
  if (!added.length) return brief
  const gave = added.filter((s) => s.status === 'failed' || s.status === 'blocked').map(missingOfSource)
  const missingFields = new Set((brief.missing ?? []).map((m) => m.field))
  return {
    ...brief,
    ...(gave.length
      ? { missing: [...(brief.missing ?? []), ...gave.filter((m) => !missingFields.has(m.field))] }
      : {}),
    sources: [...(brief.sources ?? []), ...added.map((s) => briefSourceEntry(s, supplied))]
  }
}

/**
 * What the brief holds of each source (pure): `{[source]: {fetched, reviews?, photos?}}`. Google Places gave the place
 * itself, its reviews (shown or held) and its photos; another source its posts and pictures. A row that counted its
 * own fetches keeps its count (`coverageOf`).
 */
export function suppliedBySource({ googlePlace = null, media = [], posts = [] } = {}) {
  // A Map keeps a source named like an Object.prototype key ('__proto__') an ordinary row.
  const out = new Map()
  const add = (source, key, n) => {
    if (!nonEmpty(source) || !n) return
    if (!out.has(source)) out.set(source, { fetched: 0 })
    const o = out.get(source)
    o.fetched += n
    if (key) o[key] = (o[key] ?? 0) + n
  }
  if (googlePlace?.placeId) {
    add('google-places', null, 1)
    add(
      'google-places',
      'reviews',
      (googlePlace.reviews?.length ?? 0) + (googlePlace.heldReviews?.length ?? 0)
    )
  }
  for (const m of Array.isArray(media) ? media : []) if (m?.kind === 'image') add(m.source, 'photos', 1)
  for (const p of Array.isArray(posts) ? posts : []) add(p?.source, null, 1)
  return Object.fromEntries(out)
}

/** How much a source gave, in the brief's Markdown: `14 (3 reviews, 10 photos)`, `12/40`, `0`. */
export function fetchedLine(cov = {}) {
  const count = cov.total !== undefined ? `${cov.fetched}/${cov.total}` : `${cov.fetched ?? 0}`
  const parts = [cov.reviews ? `${cov.reviews} reviews` : null, cov.photos ? `${cov.photos} photos` : null]
  const detail = parts.filter(Boolean)
  return `${count}${detail.length ? ` (${detail.join(', ')})` : ''}`
}

/** The providers line of a source in the brief's Markdown, or '' when it names none. */
export function attemptsLine(s) {
  const attempts = Array.isArray(s?.attempts) ? s.attempts : []
  if (!attempts.length) return ''
  return `; tried ${attempts.map((a) => `${a.provider} ${a.status}${a.code ? ` ${a.code}` : ''}`).join(', ')}`
}
