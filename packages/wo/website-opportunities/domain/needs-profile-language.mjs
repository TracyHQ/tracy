// The site language of a needs profile (ticket #592), read from the language each source uses publicly. Pure rules,
// no model. Split out of `needs-profile-questions.mjs`, which re-exports `languageTag` and `siteLanguageOf`.
import { TRUST_ORDER } from './needs-profile-merge.mjs'

const NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
export const languageName = (tag) => {
  try {
    return NAMES.of(tag) ?? tag
  } catch {
    return tag
  }
}
export const primary = (tag) => tag.split('-')[0]

/** English language names to their two letter tag; a name two tags share maps to null (ambiguous). */
let byName = null
function tagOfName(name) {
  if (!byName) {
    byName = new Map()
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    for (const a of letters)
      for (const b of letters) {
        const said = NAMES.of(a + b)?.toLowerCase()
        if (said) byName.set(said, byName.has(said) ? null : a + b)
      }
  }
  return byName.get(name.trim().toLowerCase()) ?? null
}

/**
 * A language tag a model returned, canonicalised, or null when it is not a tag of a known language. Validation only:
 * no language name is read (`answer-reading.mjs` checks the tag the model read from the owner's words with it).
 */
export function supportedLanguageTag(value) {
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(value.trim())) return null
  try {
    const [tag] = Intl.getCanonicalLocales(value.trim().replace(/_/g, '-'))
    return NAMES.of(primary(tag)) ? tag : null
  } catch {
    return null
  }
}

/**
 * A language as a BCP 47 tag, or null when it cannot be read. A tag is canonicalised and KEEPS its region (`pt_br`
 * gives `pt-BR`: Brazilian and European Portuguese are written differently, and Contract B takes such a tag); an
 * English language name the model may write instead (`English`) maps to its tag when exactly one tag has that name.
 * A tag whose language has no known name, or any other word, is null: never a silent default.
 */
export function languageTag(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const written = value.trim().replace(/_/g, '-')
  if (/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(written)) {
    try {
      const [tag] = Intl.getCanonicalLocales(written)
      return NAMES.of(primary(tag)) ? tag : null
    } catch {
      return null
    }
  }
  return tagOfName(written)
}

/**
 * The site language from each source's language (`research` first, then what the model read). Languages compare by
 * their primary subtag (`en-US` beside `en-GB` is one language, not a mix); each option is the tag of its most trusted
 * source, region kept. Mixed sources default to the language of the most trusted source and offer every language seen,
 * most trusted first. A language given but not readable is listed in `unread` (`{source, said, from}`), never guessed.
 * 🔒 The owner's chat statement (source `owner-statement`, D46) never decides it: the owner types in the app's language,
 * not always the site's. With that statement alone there is none (null): the plan says its English default as an
 * assumption the owner sees (`plan-composer.mjs`), never one guessed from the chat.
 * @param {{id: string, origin: string, language?: string}[]} sources
 * @param {Record<string, string>} read the language the model read per source id
 */
export function siteLanguageOf(all, read = {}) {
  const sources = all.filter((s) => s?.id !== 'owner-statement')
  const bySource = {}
  const unread = []
  for (const s of sources) {
    for (const [said, from] of [
      [s.language, 'research'],
      [read[s.id], 'model']
    ]) {
      if (said === undefined || said === null) continue
      const tag = languageTag(said)
      if (!tag) unread.push({ source: s.id, said: String(said), from })
      else if (!bySource[s.id]) bySource[s.id] = tag
    }
  }
  const ordered = [...sources]
    .filter((s) => bySource[s.id])
    .sort((a, b) => TRUST_ORDER.indexOf(a.origin) - TRUST_ORDER.indexOf(b.origin))
  const options = []
  for (const s of ordered)
    if (!options.some((tag) => primary(tag) === primary(bySource[s.id]))) options.push(bySource[s.id])
  return { value: options[0] ?? null, options, mixed: options.length > 1, bySource, unread }
}
