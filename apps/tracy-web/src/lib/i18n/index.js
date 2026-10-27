/**
 * The language a tracy-web page or mail is written in, and the words in that language (#753).
 *
 * WHICH LANGUAGES: the eight of `@tracy/core/interface-languages` (spec #730). This app cannot
 * import that package at runtime — its image copies `apps/tracy-web/src` alone and installs from
 * its own lockfile (`Dockerfile`) — so the ids are repeated here, and `test/web-languages.test.mjs`
 * fails the moment the two lists differ.
 *
 * WHICH ONE FOR A REQUEST, first that answers wins:
 *   1. `?lang=` — an explicit choice in the link;
 *   2. the `tracy_lang` cookie — written by `@tracy/dsh-settings` only when the person PICKS a
 *      language in Settings › Language (never from the automatic, browser-derived one), so a
 *      signed-out reload of `/login` speaks the language they chose, and a person who never chose
 *      keeps following their device;
 *   3. `Accept-Language`, each tag in the browser's order: exact id, then primary subtag;
 *   4. English.
 * `zh` is Simplified Chinese only: `zh-TW`, `zh-HK`, `zh-MO` and any `Hant` tag fall through to
 * the next tag rather than land on a script the reader may not read.
 *
 * WORDS: `en` lives in `./strings.js`; every other language is data in `./locales/<id>.json`
 * (translations are data, never code: gate `language` scans code files for Vietnamese). A key
 * missing from a translation falls back to English, so a gap shows English, never a raw key —
 * and gate `web-languages` keeps that gap from reaching `develop` in the first place.
 */
import { readFileSync } from 'node:fs'
import { parseCookies } from '../cookies.js'
import { escapeHtml } from '../html.js'
import { en } from './strings.js'

/** Same ids, same order as `INTERFACE_LANGUAGES` in `@tracy/core/interface-languages`. */
export const WEB_LANGUAGES = Object.freeze(['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es'])

export const DEFAULT_LANGUAGE = 'en'

/** Cookie `@tracy/dsh-settings` writes on an explicit pick in Settings › Language. */
export const LANGUAGE_COOKIE = 'tracy_lang'

/** `<html lang>` per id: BCP 47, and `zh` written the way dsh writes it (`zh-CN`). */
const HTML_LANG = Object.freeze({ zh: 'zh-CN' })

const DICTIONARIES = new Map(
  WEB_LANGUAGES.filter((id) => id !== DEFAULT_LANGUAGE).map((id) => [
    id,
    Object.freeze(JSON.parse(readFileSync(new URL(`./locales/${id}.json`, import.meta.url), 'utf8')))
  ])
)

/** Traditional-script Chinese: region or script says so. Never mapped to `zh` (Simplified). */
const TRADITIONAL_CHINESE = /^zh-(?:.*-)?(?:tw|hk|mo|hant)(?:-|$)/

/**
 * One language tag → one of `WEB_LANGUAGES`, or `null`. Exact id first, then the primary subtag.
 * @param {unknown} tag
 * @returns {string | null}
 */
export function matchLanguage(tag) {
  if (typeof tag !== 'string') return null
  const lower = tag.trim().toLowerCase().replace(/_/g, '-')
  if (!lower || lower.length > 35) return null
  if (WEB_LANGUAGES.includes(lower)) return lower
  const primary = lower.split('-')[0]
  if (primary === 'zh' && TRADITIONAL_CHINESE.test(lower)) return null
  return WEB_LANGUAGES.includes(primary) ? primary : null
}

/**
 * The browser's languages in its own order of preference (`q` descending, ties keep header
 * order), `q=0` and `*` dropped.
 * @param {string | undefined | null} header
 * @returns {string[]}
 */
function acceptedTags(header) {
  if (typeof header !== 'string' || header.length > 1000) return []
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const weight = q === undefined ? 1 : Number(q.slice(2))
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag)
}

/**
 * The resolution order of this module's header, as a pure function.
 * @param {{query?: string|null, cookie?: string|null, acceptLanguage?: string|null}} input
 * @returns {string} one of `WEB_LANGUAGES`.
 */
export function resolveLanguage({ query, cookie, acceptLanguage } = {}) {
  const explicit = matchLanguage(query)
  if (explicit) return explicit
  const remembered = matchLanguage(cookie)
  if (remembered) return remembered
  for (const tag of acceptedTags(acceptLanguage)) {
    const matched = matchLanguage(tag)
    if (matched) return matched
  }
  return DEFAULT_LANGUAGE
}

/**
 * The language of a request — a Hono context (`c`) or a plain Fetch `Request` (the public design
 * doors take `c.req.raw`). Safe on any request: a missing header is just a missing answer.
 * @param {{req: {query: (name: string) => string | undefined, header: (name: string) => string | undefined}} | Request} source
 * @returns {string}
 */
export function requestLanguage(source) {
  const header = source?.req
    ? (name) => source.req.header(name)
    : (name) => source?.headers?.get?.(name) ?? undefined
  let query = null
  try {
    query = source?.req ? source.req.query('lang') : new URL(source.url).searchParams.get('lang')
  } catch {
    query = null
  }
  let cookie = null
  try {
    cookie = decodeURIComponent(parseCookies(header('cookie')).get(LANGUAGE_COOKIE) ?? '')
  } catch {
    cookie = null
  }
  return resolveLanguage({ query, cookie, acceptLanguage: header('accept-language') })
}

/** `<html lang>` for a language id. */
export function htmlLang(lang) {
  const id = WEB_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE
  return HTML_LANG[id] ?? id
}

/**
 * One string in `lang`, `{name}` placeholders filled from `vars` (values as plain text). An
 * unknown language reads as English; a key the language lacks reads as its English text.
 * @param {string} lang
 * @param {string} key - a key of `en`.
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function translate(lang, key, vars = {}) {
  const source = DICTIONARIES.get(lang)?.[key] ?? en[key]
  if (source === undefined) throw new Error(`i18n: unknown key "${key}"`)
  return typeset(lang, fill(source, vars))
}

/**
 * Chinese sets no space after a full-width closing bracket. A sentence that starts with a person,
 * "{who} 邀请你…", gets "David（david@x.com） 邀请你" once `mail.n.person` fills in (mail audit
 * 04/10/2026); the space belongs after a Latin name, not after "）".
 */
function typeset(lang, text) {
  return lang === 'zh' ? text.replace(/）[ \u00a0]+/g, '）') : text
}

/**
 * The same string as HTML: the translation is escaped FIRST, then each placeholder is replaced by
 * a value that is already HTML (a `<strong>` around an escaped address, a link). Never pass
 * unescaped data in `htmlVars`.
 */
export function translateHtml(lang, key, htmlVars = {}) {
  const source = DICTIONARIES.get(lang)?.[key] ?? en[key]
  if (source === undefined) throw new Error(`i18n: unknown key "${key}"`)
  return typeset(lang, fill(escapeHtml(source), htmlVars))
}

function fill(text, vars) {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole
  )
}

/**
 * Both helpers bound to one language — what a page or mail renderer takes.
 * @param {string} [lang]
 */
export function translator(lang = DEFAULT_LANGUAGE) {
  const id = WEB_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE
  const t = (key, vars) => translate(id, key, vars)
  t.html = (key, htmlVars) => translateHtml(id, key, htmlVars)
  t.lang = id
  t.htmlLang = htmlLang(id)
  return t
}
