/**
 * The languages an EmDash template offers in its Build questionnaire: the locales it ships.
 *
 * An EmDash template compiles its locales into the site at build time (`template.config.json` →
 * `astro.config.mjs`), so a language it does not ship cannot be chosen at all, and one it ships
 * but does not offer can never be switched on. The list is therefore READ from the template, the
 * way the Joomla and WordPress lists are read from their language-pack catalogues
 * (`joomla-language-options.mjs`, `wordpress-language-options.mjs`), and written into the
 * template's `seed/questions.json` by `sync-questions.mjs`; `check-questions` refuses drift.
 *
 * Spelled the way the questionnaire spells an option — lowercase — and matched back to the
 * template's own spelling by `localesFrom` in `tools/personalize.mjs`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The EmDash templates in this repo; each carries `template.config.json` and `seed/questions.json`. */
export const EMDASH_TEMPLATES = Object.freeze([
  'packages/cms/tracy-emdash-theme-business',
  'packages/cms/tracy-emdash-theme-base'
])

/**
 * The regional Englishes offered beside a template's bare `en` — the same five a Joomla build
 * offers. The template stores ONE English (`en`: entries, URLs, admin locale); the region is the
 * label it prints (`<html lang="en-US">`, hreflang), decided by `displayLocalesFrom` in
 * `tools/personalize.mjs` and read by the template's `src/lib/display-locale.ts`. The Build form
 * folds all of them into one "English" row that answers `en-us` (`rowsFor` in
 * tracy-site-build-core), so without these the English row could only ever answer bare `en`.
 */
export const ENGLISH_VARIANTS = Object.freeze(['en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz'])

/**
 * @param {string} templateDir absolute path of one template
 * @returns {string[]} its locales, default first as the config lists them, lowercased, with the
 *   regional Englishes right after `en` when the template ships it
 */
export function emdashLanguageOptions(templateDir) {
  const config = JSON.parse(readFileSync(join(templateDir, 'template.config.json'), 'utf8'))
  const locales = (Array.isArray(config.locales) ? config.locales : []).map((l) => String(l).toLowerCase())
  const out = []
  for (const l of locales) {
    out.push(l)
    if (l === 'en') for (const v of ENGLISH_VARIANTS) if (!locales.includes(v)) out.push(v)
  }
  return out
}
