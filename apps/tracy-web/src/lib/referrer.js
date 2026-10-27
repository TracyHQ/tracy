/**
 * The page a quickstart download came from, carried from the first door a person reaches to the
 * `quickstart_download` row (`quickstart_download.referrer`, read by staff on App Statistic only).
 *
 * The path, in order: `GET /signin/joomlart` reads it (`ref` query, else the `Referer` header) and
 * puts it on the template landing `next` it keeps on the state row; the landing `/new?template=…`
 * reads it the same way and puts it on its Download link; the download door reads it from that
 * link and stores it. Every door cleans it again with `cleanReferrer`: each reads an address
 * anybody can type.
 *
 * What is recorded is what the browser or the link says, nothing inferred. joomlart.com sets no
 * Referrer-Policy, so a browser sends only its origin across sites (`https://www.joomlart.com/`);
 * the full page arrives only when the joomlart.com button adds `&ref=<page url>` itself (it does
 * since ja-mainsite #7). Only scheme, host and path are ever kept.
 */
import { safePath } from './safe-path.js'

const MAX_LENGTH = 512

/**
 * An absolute http(s) URL reduced to scheme, host and path — credentials, query and fragment
 * removed (a query can carry a visitor's own tokens or search terms) — at most 512 characters once
 * cleaned, or `null` for anything else.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function cleanReferrer(raw) {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_LENGTH * 4) return null
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  const cleaned = url.toString()
  return cleaned.length <= MAX_LENGTH ? cleaned : null
}

/**
 * The referring page a request names: its explicit `ref` when usable, else its `Referer` header.
 * A page on Tracy's own host is not a referrer — it would only ever name Tracy's own sign-in page —
 * whatever its scheme or port.
 * @param {{ ref?: unknown, referer?: unknown, origin: string }} request
 * @returns {string | null}
 */
export function referrerOf({ ref, referer, origin }) {
  const own = new URL(origin).hostname
  for (const candidate of [ref, referer]) {
    const cleaned = cleanReferrer(candidate)
    if (cleaned && new URL(cleaned).hostname !== own) return cleaned
  }
  return null
}

/** The template landing pages, the only `next` that forwards a ref to the Download link. */
const LANDINGS = new Set(['/', '/new', '/new/'])

/**
 * `next` (a value `safePath` already returned) with `ref` set on it when it is a template landing
 * (`?template=` on `/` or `/new`); otherwise, or with no ref, `next` untouched. The result goes
 * through `safePath` again, so it can only ever be a path on `origin`.
 * @param {string} next
 * @param {string | null} ref
 * @param {string} origin
 */
export function nextWithRef(next, ref, origin) {
  if (!ref) return next
  const url = new URL(next, origin)
  if (!LANDINGS.has(url.pathname) || !url.searchParams.has('template')) return next
  url.searchParams.set('ref', ref)
  return safePath(url.toString(), origin)
}
