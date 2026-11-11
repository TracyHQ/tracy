// The build's selected writing language fills a missing brand voice at the bench boundary only.
// Research observations and frozen WO revisions remain unchanged; no tone is inferred from the business.
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
export const BRAND_LANGUAGE_INPUT = 'brand-brief-language/1'

export function briefWithSiteLanguage(brief, siteLanguage) {
  const unchanged = { ok: true, brief, projection: null }
  if (!isObject(brief) || !isObject(brief.brand)) return unchanged
  const voice = brief.brand.voice
  if (typeof voice === 'string' && voice.trim()) return unchanged
  // A malformed authored value is a shape error, never silently repaired.
  if (voice != null && typeof voice !== 'string') return unchanged
  let tag
  let language
  try {
    if (typeof siteLanguage !== 'string' || !siteLanguage.trim()) throw new Error('missing language')
    tag = Intl.getCanonicalLocales(siteLanguage.trim())[0]
    if (['und', 'mul', 'zxx'].includes(tag.split('-')[0])) throw new Error('no writing language')
    language = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag)
    if (!language) throw new Error('unknown language')
  } catch {
    return {
      ok: false,
      code: 'BRAND_SITE_LANGUAGE_REQUIRED',
      reason: 'A missing brand voice needs the selected site language; no language or tone is guessed.'
    }
  }
  return {
    ok: true,
    brief: { ...brief, brand: { ...brief.brand, voice: language } },
    projection: { version: BRAND_LANGUAGE_INPUT, source: 'selected-site-language', tag, language }
  }
}
