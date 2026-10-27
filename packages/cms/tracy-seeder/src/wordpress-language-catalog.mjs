/**
 * Which languages Tracy will build a WordPress site in, and how each one is spelled at the edge.
 *
 * 🔒 ONE SPELLING IN THE PRODUCT, THE CMS SPELLING AT THE EDGE. The catalogue is keyed by the same
 * lowercase BCP-47 tag the Joomla catalogue offers (`vi-vn`, `zh-cn`, `pt-br`), so a Build form,
 * an answer row and a plan say the same word whichever CMS is underneath. WordPress files its
 * translations under a different spelling — `vi`, `zh_CN`, `pt_BR`, and `bel` for Belarusian — and
 * that spelling appears exactly where a command is handed to WordPress, never upstream of it.
 *
 * 🔒 NOTHING HERE IS HASH-PINNED, AND THAT IS NOT AN OVERSIGHT. Joomla's catalogue pins the bytes
 * of every pack because Tracy downloads them. Tracy downloads no WordPress translation: it runs
 * `wp language core install <wpLocale>` and WordPress fetches from translate.wordpress.org over
 * its own update channel. There is no artifact in this repo's hands to pin. What is checked is the
 * key set — see `validateWordpressLanguageCatalog` and the catalogue's own `note`.
 *
 * 🔒 ADMISSION IS STILL A REVIEWED COMMIT. Discovering that WordPress has a locale is a lookup
 * against its translations API; deciding Tracy will build a customer site in it is an edit to
 * `wordpress-language-packs.json` (beside this module) that a person read. Runtime reads only the
 * reviewed file.
 *
 * 🔒 THE FILE LIVES IN THE SEEDER'S OWN `src/`. tracy-web's image copies that directory alone
 * (`COPY packages/cms/tracy-seeder/src ./src/seeder`), so a path into a sibling package loads in a
 * checkout and fails in the image — #1019 imported it from `tracy-wordpress-quickstart/` and every
 * WordPress brief on dev failed. `scripts/test/tracy-web-seeder-image.test.mjs` holds this.
 */
import catalog from './wordpress-language-packs.json' with { type: 'json' }
import { AmbiguousLocaleError } from './locales.mjs'

/**
 * The locale a WordPress site already speaks the moment it is installed.
 *
 * `en-us`, not `en`: WordPress's built-in locale IS `en_US`, and every other option in this
 * catalogue is a region-tagged BCP-47 tag, so a bare `en` would be the one option in the
 * questionnaire shaped differently from its neighbours — and the one that does not say WHICH
 * English, next to `en-gb`, `en-au`, `en-ca` and `en-nz`, which WordPress does distinguish. A
 * bare `en` arriving from an older answer is still accepted; `normaliseWordpressLocale` resolves
 * it here.
 */
export const WORDPRESS_SOURCE_LOCALE = 'en-us'

/**
 * @typedef {{ wpLocale: string, englishName: string, nativeName: string, rtl: boolean }} WordpressLocale
 */

/** Refuse a malformed catalogue loudly, before a bad tag can reach a customer's site.
 * @param {unknown} value
 * @returns {{ schemaVersion: string, version: string, locales: Record<string, WordpressLocale>,
 *   unsupported: Record<string, string> }}
 */
export function validateWordpressLanguageCatalog(value) {
  const data = /** @type {any} */ (value)
  if (data?.schemaVersion !== 'tracy-wordpress-language-packs/v1' || typeof data.version !== 'string')
    throw new Error('Unsupported WordPress language catalogue')
  if (typeof data.note !== 'string' || data.note.length < 40)
    throw new Error('The WordPress language catalogue carries no note saying why it exists')
  if (!data.locales || typeof data.locales !== 'object' || Array.isArray(data.locales))
    throw new Error('The WordPress language catalogue carries no locales')
  if (!data.unsupported || typeof data.unsupported !== 'object' || Array.isArray(data.unsupported))
    throw new Error('The WordPress language catalogue carries no `unsupported` block')
  const seen = new Set()
  for (const [tag, entry] of Object.entries(/** @type {Record<string, any>} */ (data.locales))) {
    if (
      // The questionnaire's option pattern is `^[a-z][a-z0-9-]*$`; this is the stricter shape the
      // product actually uses, so a `zh_CN` pasted in here is refused rather than offered.
      !/^[a-z]{2,3}-[a-z]{2,4}$/.test(tag) ||
      typeof entry?.wpLocale !== 'string' ||
      // WordPress locales are `vi`, `bel`, `pt_BR`, `de_CH_informal` — letters and underscores.
      !/^[a-z]{2,3}(_[A-Za-z]{2,8})*$/.test(entry.wpLocale) ||
      typeof entry.englishName !== 'string' ||
      !entry.englishName ||
      typeof entry.nativeName !== 'string' ||
      !entry.nativeName ||
      typeof entry.rtl !== 'boolean'
    )
      throw new Error(`Invalid WordPress locale: ${tag}`)
    // Two tags pointing at one WordPress locale would build two languages onto one translation.
    if (seen.has(entry.wpLocale)) throw new Error(`Two tags claim the WordPress locale ${entry.wpLocale}`)
    seen.add(entry.wpLocale)
    // Lee's rule, same as Joomla's: the themes Tracy ships are laid out left-to-right.
    if (entry.rtl) throw new Error(`${tag} is right-to-left and cannot be admitted`)
  }
  for (const [tag, why] of Object.entries(/** @type {Record<string, any>} */ (data.unsupported))) {
    if (typeof why !== 'string' || why.length < 10)
      throw new Error(`${tag} is listed as unsupported without saying why`)
    if (data.locales[tag]) throw new Error(`${tag} is both admitted and unsupported`)
  }
  return data
}

/** The reviewed catalogue, validated once at import so a bad edit cannot reach a site. */
export const WORDPRESS_LANGUAGE_CATALOG = validateWordpressLanguageCatalog(catalog)

/**
 * Bare codes an older Build answer may still carry, resolved to a tag.
 *
 * Deliberately the SAME resolutions Joomla's `locales.mjs` makes (`fr` → French of France, `pt`
 * and `zh` refused as ambiguous), minus `en`: WordPress's own default is `en_US` where Joomla's is
 * `en-GB`. Two CMS resolving one word differently is the bug this table exists to prevent.
 */
const ALIASES = Object.freeze({
  en: 'en-us',
  fr: 'fr-fr',
  de: 'de-de',
  es: 'es-es',
  it: 'it-it',
  nl: 'nl-nl',
  ja: 'ja-jp',
  ko: 'ko-kr',
  ru: 'ru-ru',
  vi: 'vi-vn'
})

/** Codes that name a language but not a written form; the customer must be asked. */
const AMBIGUOUS = Object.freeze({
  zh: ['zh-cn', 'zh-tw'],
  pt: ['pt-br', 'pt-pt']
})

/**
 * Every locale a WordPress site can be built in, the source language first.
 *
 * Source first for the same reason Joomla's list puts `en-GB` first: the questionnaire shows the
 * option a site already has before the ones it would have to install.
 * @returns {string[]}
 */
export function supportedWordpressLocales() {
  const tags = Object.keys(WORDPRESS_LANGUAGE_CATALOG.locales).sort()
  return [WORDPRESS_SOURCE_LOCALE, ...tags.filter((tag) => tag !== WORDPRESS_SOURCE_LOCALE)]
}

/**
 * The catalogue tag for whatever spelling arrived — the WordPress twin of `normaliseLocale`.
 *
 * Output is LOWERCASE, because that is the spelling the product uses everywhere: the
 * questionnaire's options, the stored answer, the plan. Uppercasing happens once, in `wpLocaleFor`,
 * at the edge that speaks to WordPress.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function normaliseWordpressLocale(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new Error('A language is required')
  const raw = input.trim().replace(/_/g, '-')
  const lower = raw.toLowerCase()
  if (ALIASES[lower]) return ALIASES[lower]
  if (AMBIGUOUS[lower]) throw new AmbiguousLocaleError(raw, AMBIGUOUS[lower])
  if (/^(zh-hans|zh-hant)$/.test(lower)) throw new AmbiguousLocaleError(raw, AMBIGUOUS.zh)
  if (!/^[a-z]{2,3}-[a-z]{2,4}$/.test(lower)) {
    // A bare code with exactly one candidate in the catalogue is that candidate; more than one and
    // the customer is asked, because picking silently would hand them a finished site in the wrong
    // variety of their own language.
    const kin = Object.keys(WORDPRESS_LANGUAGE_CATALOG.locales).filter((tag) => tag.split('-')[0] === lower)
    if (kin.length === 1) return kin[0]
    if (kin.length > 1) throw new AmbiguousLocaleError(raw, kin)
    throw new Error(`"${raw}" is not a language tag such as fr-fr or zh-cn`)
  }
  return lower
}

/**
 * The spelling WordPress itself uses for a tag, or a refusal that names what IS available.
 *
 * Unlike Joomla's `packFor`, the source language is NOT `null` here: `en_US` is a real WordPress
 * locale that `wp option update WPLANG` and Polylang both take, it simply needs no install.
 *
 * @param {string} tag A catalogue tag, or any spelling `normaliseWordpressLocale` accepts.
 * @returns {string}
 */
export function wpLocaleFor(tag) {
  const key = normaliseWordpressLocale(tag)
  const entry = WORDPRESS_LANGUAGE_CATALOG.locales[key]
  if (!entry) {
    const why = WORDPRESS_LANGUAGE_CATALOG.unsupported[key]
    throw new Error(
      why
        ? `WordPress cannot be built in ${key}: ${why}`
        : `No WordPress locale is registered for ${key}. Registered: ${supportedWordpressLocales().join(', ')}`
    )
  }
  return entry.wpLocale
}

/** True when the locale is the one WordPress installs with, so nothing has to be fetched for it. */
export function isWordpressSourceLocale(tag) {
  return normaliseWordpressLocale(tag) === WORDPRESS_SOURCE_LOCALE
}

/**
 * The slug Polylang should file each chosen language under.
 *
 * 🔒 POLYLANG'S SLUG IS A URL SEGMENT, AND IT IS NOT THE LOCALE. Polylang's own defaults are the
 * two-letter base (`fr` for `fr_FR`, `vi` for `vi`) and it only lengthens the slug when two of the
 * site's languages share a base — which is exactly the rule applied here, over the languages this
 * one build was asked for. Deriving it from the whole catalogue instead would give a customer who
 * picked only Brazilian Portuguese the URLs `/pt-br/`, where Polylang itself would have said
 * `/pt/`; deriving it per language in isolation would collide the day they picked both.
 *
 * Tags this catalogue does not know pass through lowercased, so a build that predates this module
 * (`en`, `fr`) keeps the slugs it already produced.
 *
 * @param {string[]} tags The languages of one build, first one first.
 * @returns {Map<string, string>} tag as it arrived → Polylang slug
 */
export function polylangSlugsFor(tags) {
  // Deduplicated first: the caller hands in the chosen languages AND the per-language plans, so a
  // language named twice would look like two languages sharing a base and lengthen its own slug.
  const list = [...new Set((Array.isArray(tags) ? tags : []).map(String))]
  const bases = new Map()
  for (const tag of list) {
    const base = tag.toLowerCase().split('-')[0]
    bases.set(base, (bases.get(base) ?? 0) + 1)
  }
  const out = new Map()
  for (const tag of list) {
    const lower = tag.toLowerCase()
    const base = lower.split('-')[0]
    out.set(tag, bases.get(base) === 1 ? base : lower)
  }
  return out
}
