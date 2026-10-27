/** Outreach language detection lives in tracy-web; the domain has no npm dependencies. */
import { detectAll } from 'tinyld'
import { readFileSync } from 'node:fs'
import { OUTREACH_LANGUAGES } from './plugins/outreach.js'

const COUNTRIES = JSON.parse(readFileSync(new URL('./outreach-countries.json', import.meta.url), 'utf8'))
// Every language with an outreach template (`plugins/outreach.js`).
export const MESSAGE_LANGUAGES = new Set(OUTREACH_LANGUAGES)

/** Strip non-linguistic tokens, preserving accents and normalising styled Unicode letters. */
export function cleanCaption(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .split(/\n\s*[_=-]{3,}/u)[0]
    .replace(/^\s*[📍📞☎🕖⏰][^\n]*$/gmu, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/[@#][\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{M}\s'’.,!?-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

/** Conservative evidence thresholds, measured against the stand's caption corpus (evidence/wo-outreach-v3). */
export function postLanguage(posts, detect = detectAll) {
  const captions = [...new Set(posts.map((p) => cleanCaption(p.caption ?? p.text ?? p.body ?? '')))]
    .filter(Boolean)
    .slice(0, 60)
  if (captions.length < 3 || (captions.join('').match(/\p{L}/gu) ?? []).length < 80) return null
  const scores = detect(captions.join('\n'))
  const best = scores[0]
  if (!best || best.accuracy < 0.8 || best.accuracy - (scores[1]?.accuracy ?? 0) < 0.2) return null
  const votes = captions.filter((c) => detect(c)[0]?.lang === best.lang).length
  if (votes / captions.length < 0.7) return null
  return {
    language: best.lang,
    confidence: best.accuracy,
    agreement: votes / captions.length,
    captions: captions.length
  }
}

/** Google country first; unambiguous international dialling prefixes only, never address-word guessing. */
export function countryOf(candidate = {}, profile = {}) {
  const components = profile.googlePlace?.addressComponents ?? candidate.addressComponents ?? []
  const google = components.find((c) => c.types?.includes('country'))?.shortText
  const explicit = google ?? profile.googlePlace?.country ?? candidate.country
  if (/^[A-Za-z]{2}$/.test(explicit ?? '')) return explicit.toUpperCase()
  const phone = String(candidate.phone ?? '')
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+')
  if (!phone.startsWith('+')) return null
  for (const [prefix, country] of Object.entries(COUNTRIES.phone))
    if (phone.startsWith(`+${prefix}`)) return country
  return null
}

/** A confidently detected unsupported language goes to English, not the country's different language. */
export function messageLanguage({ posts = [], candidate = {}, profile = {} }, detect = detectAll) {
  const detected = postLanguage(posts, detect)
  if (detected)
    return {
      ...detected,
      language: MESSAGE_LANGUAGES.has(detected.language) ? detected.language : 'en',
      detectedLanguage: detected.language,
      source: 'posts'
    }
  const country = countryOf(candidate, profile)
  const language = COUNTRIES.language[country] ?? 'en'
  return { language, source: country ? 'country' : 'english', country }
}
