// The locales this site serves right now, shared by the page chrome and the middleware.
import { getEmDashCollection } from 'emdash'
import { DEFAULT_LOCALE, LOCALES } from './i18n'

/**
 * How long one answer is reused. The question is 40 small queries; the middleware asks it for every
 * request to a prefixed URL and the chrome for every page, so it is answered at most once per
 * window. A language switched on or off shows within this window.
 */
const TTL_MS = 30_000
let cached: { at: number; value: Promise<string[]> } | null = null

/**
 * The languages the switcher may offer, and the URLs may serve: the ones whose site chrome is
 * PUBLISHED.
 *
 * 🔒 NOT `LOCALES`. The template ships every language and a customer keeps the ones they asked for;
 * `personalize` unpublishes the rest, and a switcher built from the shipped list offered dead links
 * (measured 16/09 on a site built in English and Vietnamese). The chrome entry is the tell:
 * `personalize` unpublishes it with everything else in a language nobody chose.
 */
export function servedLocales(): Promise<string[]> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.value
  const value = readServed()
  cached = { at: now, value }
  // A failed read must not be reused for the whole window.
  value.catch(() => {
    if (cached?.value === value) cached = null
  })
  return value
}

async function readServed(): Promise<string[]> {
  const served = await Promise.all(
    LOCALES.map(async (l) => {
      try {
        // 🔒 ASK THE COLLECTION, FILTERED. `getEmDashEntry` hands back an unpublished entry with
        // its live data and a `published` status (measured 16/09: `/ru` still rendered after
        // personalize dropped Russian), so neither its presence nor its status answers the
        // question. The collection reader takes `status` and answers it.
        const { entries } = await getEmDashCollection('site', { locale: l, status: 'published', limit: 1 })
        return entries.length > 0 ? l : null
      } catch {
        return null
      }
    })
  )
  const kept = served.filter((l): l is string => l !== null)
  // A site with nothing published anywhere still has one language: the one being read.
  return kept.length > 0 ? kept : [DEFAULT_LOCALE]
}
