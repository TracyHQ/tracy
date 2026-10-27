/**
 * The interface languages Tracy supports: the ONE list the Settings › Language picker, the
 * language registrations in the bundles and the translation gate are checked against (spec #730,
 * decided by Akemi 02/10/2026 from JoomlArt customer data plus zh and es by product choice).
 *
 * A language is listed here only when Tracy means to keep it complete on BOTH sides: Tracy's own
 * namespaces and dsh's. `shown: false` marks a language whose translation is still in progress; it
 * is not registered, so the picker and browser detection cannot reach it until it flips to true.
 *
 * Who registers each id (registering one twice throws and takes down dsh's plugin tree):
 * - `en`, `zh`: dsh itself (built in);
 * - `vi`: `dsh-locale-vi`;
 * - `de`, `fr`, `it`, `nl`: `@huanlin/dsh-plugin-better-locale` (Tracy fork, `languages.ts`);
 * - `es`: `@tracy/dsh-tracy-locales` (its `languages.json`, ticket #739).
 */

/** @type {readonly { id: string, label: string, shown: boolean }[]} */
export const INTERFACE_LANGUAGES = Object.freeze(
  [
    { id: 'en', label: 'English', shown: true },
    { id: 'vi', label: 'Tiếng Việt', shown: true },
    { id: 'de', label: 'Deutsch', shown: true },
    { id: 'it', label: 'Italiano', shown: true },
    { id: 'fr', label: 'Français', shown: true },
    { id: 'nl', label: 'Nederlands', shown: true },
    { id: 'zh', label: '中文', shown: true },
    { id: 'es', label: 'Español', shown: true }
  ].map((language) => Object.freeze(language))
)

/** Ids of the languages a customer can pick today. */
export const SHOWN_LANGUAGE_IDS = Object.freeze(INTERFACE_LANGUAGES.filter((l) => l.shown).map((l) => l.id))

/**
 * The interface language as a BCP 47 tag for `Intl` and `toLocale*String`, or `undefined` outside a
 * browser. dsh's locale plugin keeps `<html lang>` equal to the active language (zh is written
 * `zh-CN`), so a date formatted with this follows Settings › Language instead of the browser's own
 * language: a German interface on an English browser shows "2. Okt.", not "Oct 2" (spec #730).
 * @returns {string | undefined} the tag, or undefined to let the runtime pick its default.
 */
export function interfaceLocale() {
  if (typeof document === 'undefined') return undefined
  return document.documentElement.lang || undefined
}
