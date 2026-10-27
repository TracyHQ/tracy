/**
 * The interface-language rule for pages that run outside dsh and pick their own language (the
 * public Design templates page, `/ops`): one copy, shared, instead of one per page.
 *
 * `matchLanguage` is tracy-web's rule line for line (`apps/tracy-web/src/lib/i18n/index.js`, which
 * reads its dictionaries with `node:fs` and cannot be bundled for a browser): Traditional Chinese is
 * never mapped to `zh` (Simplified). Tests compare the two over a table of tags.
 *
 * Pure: no DOM, no storage, no file system. Callers read `location`, `document.cookie` and
 * `navigator.languages` themselves and hand the values in.
 */
import { SHOWN_LANGUAGE_IDS } from './index.mjs'

export const DEFAULT_LANGUAGE = 'en'

/** The cookie `@tracy/dsh-settings` writes on an explicit pick in Settings › Language. */
export const LANGUAGE_COOKIE = 'tracy_lang'

/** Traditional-script Chinese: region or script says so. Never mapped to `zh` (Simplified). */
const TRADITIONAL_CHINESE = /^zh-(?:.*-)?(?:tw|hk|mo|hant)(?:-|$)/

/**
 * One language tag → one of the shown interface languages, or null. Exact id first, then the
 * primary subtag.
 * @param {unknown} tag
 * @returns {string | null}
 */
export function matchLanguage(tag) {
  if (typeof tag !== 'string') return null
  const lower = tag.trim().toLowerCase().replace(/_/g, '-')
  if (!lower || lower.length > 35) return null
  if (SHOWN_LANGUAGE_IDS.includes(lower)) return lower
  const primary = lower.split('-')[0] ?? ''
  if (primary === 'zh' && TRADITIONAL_CHINESE.test(lower)) return null
  return SHOWN_LANGUAGE_IDS.includes(primary) ? primary : null
}

/**
 * The first tag of a list that names a shown language, or null. Anything but an array is no list.
 * @param {unknown} tags
 * @returns {string | null}
 */
export function firstLanguage(tags) {
  if (!Array.isArray(tags)) return null
  for (const tag of tags) {
    const matched = matchLanguage(tag)
    if (matched) return matched
  }
  return null
}

/**
 * `?lang=`, then the remembered pick, then the browser's languages in their order, then English.
 * @param {{ query?: unknown, cookie?: unknown, browser?: unknown }} [input]
 * @returns {string}
 */
export function resolveLanguage({ query, cookie, browser } = {}) {
  return matchLanguage(query) ?? matchLanguage(cookie) ?? firstLanguage(browser) ?? DEFAULT_LANGUAGE
}

/**
 * The value of one cookie in a `document.cookie` string, or null: absent, or not decodable.
 * @param {unknown} header
 * @param {string} name
 * @returns {string | null}
 */
export function cookieValue(header, name) {
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at === -1 || part.slice(0, at).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(at + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/**
 * `<html lang>` for a language id: BCP 47, and `zh` written the way dsh writes it.
 * @param {string} lang
 * @returns {string}
 */
export function htmlLang(lang) {
  return lang === 'zh' ? 'zh-CN' : lang
}

/**
 * A dictionary's own non-empty text for a key, or null.
 * @param {Readonly<Record<string, unknown>> | undefined | null} table
 * @param {string} key
 * @returns {string | null}
 */
export function textOf(table, key) {
  if (!table || !Object.hasOwn(table, key)) return null
  const value = table[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * `{name}` placeholders filled from `params`; a name `params` does not have stays as written.
 * @param {string} text
 * @param {Readonly<Record<string, string | number>>} [params]
 * @returns {string}
 */
export function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (m, name) =>
    params && Object.hasOwn(params, name) ? String(params[name]) : m
  )
}

/**
 * A key's text from the first dictionary that has it (the picked language, then English), filled;
 * the key itself only when no dictionary has it at all.
 * @param {readonly (Readonly<Record<string, unknown>> | undefined | null)[]} tables
 * @param {string} key
 * @param {Readonly<Record<string, string | number>>} [params]
 * @returns {string}
 */
export function translate(tables, key, params) {
  for (const table of tables) {
    const text = textOf(table, key)
    if (text !== null) return interpolate(text, params)
  }
  return key
}
