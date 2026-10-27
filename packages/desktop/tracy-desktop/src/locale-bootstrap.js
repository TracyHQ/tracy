/**
 * What the window's preload answers dsh's `__DSH_LOCALE__.read()` with (shell/preload.ts;
 * dsh `packages/client/locale/src/client/bootstrap.ts`): the operating system's languages, so a first
 * run opens in the person's language (tasks/todo-desktop-onboard-v2.md, contract 6), and the
 * language they PICKED, if any.
 *
 * WHY `preference` IS NOT ALWAYS NULL (measured by reading dsh's LocaleRuntime, 11/10/2026). On a
 * non-loopback page — every Tracy origin — dsh keeps the Language pick in localStorage, but ONLY
 * when no native bootstrap is given (`this.local = bootstrap === undefined && mode === 'memory'`).
 * With a bootstrap, dsh takes the pick from `bootstrap.preference` alone and its own writes go to a
 * memory-only settings form. So `preference: null` would drop a stored pick on every load, and
 * Tracy's row would then delete the `tracy_lang` cookie as stale.
 *
 * So the pick comes from the `tracy_lang` cookie: `@tracy/dsh-settings` writes it on an explicit pick
 * in Settings › Language and deletes it on "Follow device" (language-cookie.ts). Its values are the
 * eight interface ids, which are dsh's locale ids too (dsh's Chinese is `zh`). Read again on every
 * page load, so a pick made in this window holds after a reload.
 */
const { INTERFACE_LANGUAGES } = require('./interface-language.js')

const LANGUAGE_COOKIE = 'tracy_lang'
const MAX_LANGUAGES = 32

/**
 * @param {string | undefined} cookie - `document.cookie`.
 * @returns {string | null} the picked language, or null.
 */
function pickedLanguage(cookie) {
  for (const part of String(cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== LANGUAGE_COOKIE) continue
    const value = rest.join('=')
    return INTERFACE_LANGUAGES.includes(value) ? value : null
  }
  return null
}

/**
 * @param {{ languages: unknown, cookie: string | undefined }} input - the OS languages (from the main
 *   process) and the page's cookies.
 * @returns {{ languages: string[], preference: string | null }} dsh's `LocaleBootstrap`.
 */
function localeBootstrap({ languages, cookie }) {
  const list = Array.isArray(languages) ? languages.filter((tag) => typeof tag === 'string') : []
  return { languages: list.slice(0, MAX_LANGUAGES), preference: pickedLanguage(cookie) }
}

module.exports = { localeBootstrap, LANGUAGE_COOKIE }
