/**
 * Every language a person can switch Tracy to, in one list — the only place that answers
 * "which languages must a questionnaire cover?".
 *
 * 🔒 ONE LIST FOR THE MENU AND THE FORMS. Since spec #730 (02/10/2026) the interface languages
 * are declared once, in `@tracy/core/interface-languages`: the Settings › Language picker, the
 * bundles' language registrations and the translation gate all read it. A questionnaire is drawn
 * in the interface language (`document.documentElement.lang`), so it must cover exactly the
 * languages that list SHOWS. Before 02/10 this file stitched its own list together from Tracy's
 * `APP_LANGUAGES` and the better-locale fork's `languages.ts`, and Spanish — registered by a third
 * plugin — was in the menu but not here, so a Spanish customer was asked in English.
 *
 * A language with `shown: false` is not required: a customer cannot pick it yet.
 *
 * The import is relative on purpose: `scripts/` is not a workspace package and cannot resolve
 * `@tracy/core` by name (same as `check-interface-languages.ts`).
 */
import { INTERFACE_LANGUAGES } from '../packages/core/tracy-core/src/interface-languages/index.mjs'

/**
 * `{ id: 'de', label: 'Deutsch' }` — the id a page carries, the name written in that language.
 * Sorted so a generated file's key order does not move when a language is added.
 * @type {{ id: string, label: string }[]}
 */
export const SHIPPED_LANGUAGES = INTERFACE_LANGUAGES.filter((language) => language.shown)
  .map(({ id, label }) => ({ id, label }))
  .sort((a, b) => a.id.localeCompare(b.id))
