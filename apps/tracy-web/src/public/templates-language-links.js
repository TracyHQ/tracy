/**
 * Keeps the visitor's language on the public Templates pages when it was chosen in the address
 * (`?lang=de`) and not yet remembered in the `tracy_lang` cookie: every local link the page renders
 * (`/templates/...` and the app's own sign-in address) carries the same `?lang=`, so the next click
 * does not fall back to English. A visitor with a cookie or a browser language needs nothing: the
 * next request resolves the same language by itself, so the links stay clean.
 *
 * Pure functions; the links to the landing site already carry their language in the path.
 */
import { matchLanguage } from '../lib/i18n/index.js'

/** The language asked for in the address, or null when the address names none (or an unknown one). */
export function languageInAddress(c) {
  return matchLanguage(c.req.query('lang'))
}

/**
 * @param {string} html - a complete page.
 * @param {string | null} lang - from `languageInAddress`; null leaves the page as it is.
 * @param {string} appOrigin - the app's own address, whose root is the Get Started link.
 */
export function carryLanguage(html, lang, appOrigin = '') {
  if (!lang) return html
  const q = `?lang=${lang}`
  return html
    .replace(/href="(\/templates\/[^"?#]*)"/g, (_, path) => `href="${path}${q}"`)
    .replaceAll(`href="${appOrigin}/"`, `href="${appOrigin}/${q}"`)
}
