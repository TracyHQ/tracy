// The language tag a visitor's browser and a search engine read, when it is not the locale the
// content is stored under.
//
// 🔒 STORED `en`, SHOWN `en-US`. A template ships one English (`en`): its entries, URLs and admin
// locale. A customer who picked "English" in the Build form answered `en-us` (the form's English
// row carries `en-us`, as Joomla's does), and their site should say so in `<html lang>` and in
// hreflang — without a second English in the admin and without moving a single URL. `personalize`
// writes the decision to `<SITE_DATA_DIR>/display-locale.json` (`{ "en": "en-US" }`); this reads it.
// EmDash settings could not hold it: its settings schema strips any key it does not know.
//
// 🔒 STORED `en`, SHOWN `vi-VN` (TCH #1013, D10). A customer who picks ONE language that is not the
// root's gets the root written in that language (`personalize` `localesFrom` → `as: { en: 'vi' }`),
// and the file then says `{ "en": "vi-VN" }`. That tag is the truth about the page, so it is printed
// even though it names another language than the stored locale. What is still refused is anything that
// is not a language tag, and a locale the template does not ship.
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** A language, optionally with its region, as BCP 47 prints it: `vi`, `vi-VN`, `zh-TW`. */
const TAG = /^[a-z]{2,3}(?:-[A-Z]{2})?$/

/**
 * `{ stored → shown }` from what the file holds: a well-formed tag for a locale the template ships
 * (`en` → `en-US`, and `en` → `vi-VN` for a root written in Vietnamese). Pure, so a plain
 * `node --test` can hold it.
 */
export function parseDisplayLocales(raw: unknown, locales: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [stored, shown] of Object.entries(raw as Record<string, unknown>)) {
    if (!locales.includes(stored) || typeof shown !== 'string' || !TAG.test(shown)) continue
    out[stored] = shown
  }
  return out
}

const FILE = path.join(process.env.SITE_DATA_DIR ?? './data', 'display-locale.json')
let cached: { mtimeMs: number; value: Record<string, string> } | null = null

/** What the file says now, re-read only when it changed; a missing or broken file says nothing. */
function displayLocales(locales: readonly string[]): Record<string, string> {
  let mtimeMs: number
  try {
    mtimeMs = statSync(FILE).mtimeMs
  } catch {
    cached = null
    return {}
  }
  if (cached?.mtimeMs === mtimeMs) return cached.value
  let value: Record<string, string> = {}
  try {
    value = parseDisplayLocales(JSON.parse(readFileSync(FILE, 'utf8')), locales)
  } catch {
    value = {}
  }
  cached = { mtimeMs, value }
  return value
}

/** The tag to print for a stored locale: its display tag when one is set, else the locale itself. */
export function displayLocaleOf(locale: string, locales: readonly string[]): string {
  return displayLocales(locales)[locale] ?? locale
}

/**
 * One option of a language switcher, from the tag the page is SHOWN in (`displayLocaleOf`), not the stored locale.
 *
 * 🔒 THE SWITCHER NAMES THE LANGUAGE THE PAGE IS IN (TCH #1013, LANG-2, g60). A root stored as `en` and written in
 * Vietnamese printed `<html lang="vi-VN">` and offered "🇺🇸 English" in Tracy Business's top bar: the option took its code
 * and its name from the stored locale (measured 10/10/2026 on g59-biz-emd-full). `code` is the shown tag (its flag and its
 * short form follow it); `name` is the template's own name for that language (`nameOf`, given the primary subtag), else
 * the language's name in itself. Pure, so a plain `node --test` can hold it.
 */
export function switcherOptionOf(
  stored: string,
  shown: string,
  nameOf?: (language: string) => string | undefined
): { code: string; name: string } {
  const language = shown.split('-')[0].toLowerCase()
  let name = nameOf?.(language)
  if (!name) {
    try {
      const own = new Intl.DisplayNames([language], { type: 'language' }).of(language)
      name = own ? own.charAt(0).toLocaleUpperCase(language) + own.slice(1) : undefined
    } catch {
      name = undefined
    }
  }
  return { code: shown, name: name ?? stored }
}

/** `switcherOptionOf` for a stored locale of this site, read through `display-locale.json`. */
export function switcherOption(
  stored: string,
  locales: readonly string[],
  nameOf?: (language: string) => string | undefined
): { code: string; name: string } {
  return switcherOptionOf(stored, displayLocaleOf(stored, locales), nameOf)
}
