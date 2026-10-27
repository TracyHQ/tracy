/**
 * Where the language choice lives, and how it is read back.
 *
 * A COOKIE, not localStorage (ADR 0004 §3). The deciding reason is not the SPA but
 * `fleet-bar/src/pages.js`: it renders HTML for customers INSIDE THE WORKER (sign-in door, team
 * page). With localStorage the Worker has no way to know which language to render; with a cookie
 * it just reads a header. Second benefit: the cookie follows the user to every `<label>.tracy.ai`,
 * not only `cowork.tracy.ai`.
 *
 * NOT HttpOnly — the SPA must read and write it. It is no secret: it is a language tag, and the
 * value read back always goes through `resolveLanguage()`, so a hand-edited cookie can only yield
 * a language we ship, or `null`.
 *
 * `writeLanguageCookie` no longer guesses the domain. The old version hard-coded
 * `Domain=.tracy.ai` from `location.hostname.endsWith('.tracy.ai')` — right in production, wrong on
 * `localhost` or a dev lane with another domain, and this package may not import
 * `@tracy/core/config` to ask (`@tracy/core` depends on `@tracy/i18n`, so the other direction is a
 * cycle). The caller — which already has `tracyConfig()` — passes `cookieDomain`; empty means the
 * cookie follows only the current host, the same convention as `cookieDomain` of `GET /api/config`.
 */
import { type LanguageId, resolveLanguage } from './languages'

export const LANGUAGE_COOKIE = 'tracy_lang'

/** One year: a language choice is not something people want to make again every month. */
const MAX_AGE_S = 365 * 24 * 60 * 60

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/**
 * A non-empty `cookieDomain` makes the cookie follow to every copy of the customer's site
 * (`.tracy.ai` in production — read from `GET /api/config`, not hard-coded here). Empty sets NO
 * domain (browsers reject a cookie whose Domain does not match the host, exactly what happens on
 * localhost when hard-coded) and no `Secure` — otherwise dev could never save a choice.
 * @param language The language just picked.
 * @param cookieDomain `config.cookieDomain` of the current deployment; empty = host-only.
 */
export function writeLanguageCookie(language: LanguageId, cookieDomain = ''): void {
  if (typeof document === 'undefined') return
  const bits = [
    `${LANGUAGE_COOKIE}=${encodeURIComponent(language)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_S}`,
    'SameSite=Lax',
    ...(cookieDomain ? [`Domain=${cookieDomain}`, 'Secure'] : [])
  ]
  document.cookie = bits.join('; ')
}

/**
 * The effective language: **cookie → `navigator.language` → null**.
 *
 * Returns `null` rather than falling back to `en-US` here, so the caller can tell "this person
 * chose" from "nobody chose anything" — `initI18n` is where the default applies.
 */
export function preferredLanguage(): LanguageId | null {
  const chosen = resolveLanguage(readCookie(LANGUAGE_COOKIE))
  if (chosen) return chosen
  if (typeof navigator === 'undefined') return null
  for (const tag of navigator.languages ?? [navigator.language]) {
    const guess = resolveLanguage(tag)
    if (guess) return guess
  }
  return null
}
