/**
 * A product window whose page cannot load shows the shell's local "can't reach" page
 * (src/unreachable.html) with Retry, instead of Chromium's blank `chrome-error://chromewebdata/`.
 * Measured 11/10/2026 on 0.6.0-dev.1 with the network cut: the window stayed empty, not one word —
 * the person cannot tell a dead network from a broken app.
 *
 * Pure apart from the listener: `retryTarget` decides whether a failure is one to show and where
 * Retry goes; `unreachableQuery` builds what the page is loaded with. Like the sign-in waiting page
 * (src/waiting-page.js) the words travel in the query, already in the system's language with their
 * placeholders filled: the page may fetch nothing (CSP `default-src 'none'`) and has to work with
 * no network, which is the whole point of it.
 */
const { STRINGS, shellLanguage, shellWords } = require('./shell-strings.js')

/** Chromium's net error for a navigation that was stopped (a guard, a newer navigation, a download). */
const ERR_ABORTED = -3

/** The page's own keys in src/shell-strings.json. */
const KEYS = Object.keys(STRINGS.en).filter((key) => key.startsWith('unreachable.'))

/**
 * Where Retry goes for this failure, or null when the window must be left alone.
 *
 * Shown only for the MAIN frame: a site preview or any other frame failing is that frame's business,
 * and replacing the window for it would take the person's whole workspace away. Never for
 * `ERR_ABORTED` (someone stopped the navigation on purpose). Never for a page that is not http(s):
 * the shell's own local pages failing must not bring this page back over itself in a loop.
 *
 * @param {{ errorCode: number, isMainFrame: boolean, url: string, home: string }} failure - `home`:
 *   the address the window belongs to (its origin is Tracy's).
 * @returns {string | null} the failed address when it is on Tracy's origin, else the window's home.
 */
function retryTarget({ errorCode, isMainFrame, url, home }) {
  if (!isMainFrame || errorCode === ERR_ABORTED) return null
  let target
  try {
    target = new URL(url)
  } catch {
    return null
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
  // Retry never takes the window somewhere else than Tracy.
  return target.origin === new URL(home).origin ? target.href : home
}

/**
 * @param {{ retry: string, detail: string, app: string, languages: unknown }} input - `detail`:
 *   Chromium's error name (`ERR_INTERNET_DISCONNECTED`), shown as is; `languages`:
 *   `app.getPreferredSystemLanguages()`.
 * @returns {Record<string, string>} the query for `loadFile`.
 */
function unreachableQuery({ retry, detail, app, languages }) {
  const lang = shellLanguage(Array.isArray(languages) ? languages : [])
  const t = shellWords(lang)
  const words = Object.fromEntries(KEYS.map((key) => [key, t(key, { app, code: String(detail ?? '') })]))
  return { lang, retry: String(retry), detail: String(detail ?? ''), t: JSON.stringify(words) }
}

/**
 * Watch one window's `webContents` for a page that could not load.
 * @param {{ on: Function }} contents
 * @param {{ home: string, show: (failure: { retry: string, detail: string }) => void }} deps
 */
function watchLoadFailure(contents, { home, show }) {
  contents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => {
    const retry = retryTarget({ errorCode, isMainFrame, url, home })
    if (retry !== null) show({ retry, detail: String(errorDescription ?? '') })
  })
}

module.exports = { retryTarget, unreachableQuery, watchLoadFailure }
