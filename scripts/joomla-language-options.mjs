/**
 * The language options a Joomla questionnaire offers, derived from the language-pack catalog.
 *
 * One function for two callers so they cannot disagree: `sync-questions.mjs` WRITES this list into
 * `tracy-site-build-joomla/questions.json`, and `check-questions.ts` refuses the file when it says
 * anything else. The spelling is the questionnaire's (an option must match `^[a-z][a-z0-9-]*$`), and
 * the seeder's `normaliseLocale` turns `zh-tw` back into `zh-TW` before anything is installed.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { supportedLocales } from '../packages/cms/tracy-seeder/src/language-catalog.mjs'
import { DROPPED_LANGUAGE_OPTIONS } from '../packages/site/tracy-site-build-core/src/questions.mjs'

/**
 * Every locale a Joomla 6 site can be built in, source first, lowercased for the questionnaire —
 * less the obsolete and duplicate regional tags the default set no longer offers
 * (`DROPPED_LANGUAGE_OPTIONS`, 07/10/2026).
 */
export function joomlaLanguageOptions() {
  return supportedLocales(6)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => !DROPPED_LANGUAGE_OPTIONS.includes(tag))
}

/**
 * The language options of ONE contract's questionnaire.
 *
 * A contract that carries `editions.json` offers what its archive actually ships — its source, the
 * languages the contract governs row by row, and the editions it takes (23/09/2026). Offering
 * every pack the catalog holds let a customer pick `en-US` beside the `en-GB` source (a copy of
 * English into English) or `de-AT` beside the shipped `de-DE`, and both came out as copies with no
 * main menu: the template reads `tb-main-<sef>`, which only a shipped edition has. A contract with
 * no editions offers the whole catalog, as before.
 *
 * Another variant of the SOURCE language is offered too (en-US, en-AU, en-CA, en-NZ): it is not a
 * copy, it RELABELS the source edition (`sourceLanguage.set`, Claude Cowork plugin 0.17.2) — the same English,
 * under the tag the customer writes in, with `/en/` and its menus untouched (23/09/2026).
 * @param {string} contractDir - `packages/cms/tracy-joomla-quickstart/contracts/<id>/<major>/<ver>`.
 * @returns {string[]} lowercased, source first
 */
export function joomlaContractLanguageOptions(contractDir) {
  const editionsFile = path.join(contractDir, 'editions.json')
  if (!existsSync(editionsFile)) return joomlaLanguageOptions()
  const editions = JSON.parse(readFileSync(editionsFile, 'utf8'))
  const map = JSON.parse(readFileSync(path.join(contractDir, 'content-map.json'), 'utf8'))
  const source = editions.source.language
  const primary = source.split('-')[0]
  const offered = new Set([
    source,
    ...supportedLocales(6).filter((tag) => tag.split('-')[0] === primary),
    ...map.entities.map((e) => e.identity?.language).filter((l) => typeof l === 'string' && l !== '*'),
    ...Object.keys(editions.locales)
  ])
  // In the catalog's own order, so the list reads the same as every other Joomla questionnaire.
  return supportedLocales(6)
    .filter((tag) => offered.has(tag))
    .map((tag) => tag.toLowerCase())
}
