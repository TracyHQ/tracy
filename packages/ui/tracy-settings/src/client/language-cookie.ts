/**
 * The `tracy_lang` cookie, as seen from Settings › Language.
 *
 * apps/tracy-web renders the sign-in pages (/login, /verify, team invites) and their mails on the
 * server, where dsh's stored language is out of reach. #753 has those pages follow a `tracy_lang`
 * cookie (`apps/tracy-web/src/lib/i18n/index.js`) that this row writes when the person explicitly
 * picks a language, so a signed-out reload of `/login` speaks the language they chose.
 *
 * 🔒 ONLY ON A PICK, NEVER ON LOAD (Akemi, 02/10/2026): the language follows the device until the
 * person chooses one. Writing the cookie from the automatic, browser-derived language at page load
 * would pin the sign-in page to whatever the browser said that day, and a later change of the
 * device language would stop applying. So it is written from the Language row's own `setLocale`,
 * and nowhere else. "Follow device" (#756) means nothing is picked any more, so the cookie goes
 * too: otherwise the sign-in page keeps the old pick while the app follows the device.
 *
 * The cookie is host-only, path `/`, one year, SameSite=Lax (Secure on https). If the writer ever
 * adds a `Domain`, the deletion must carry the same `Domain`, or the browser keeps the cookie.
 */
import { SHOWN_LANGUAGE_IDS } from '@tracy/core/interface-languages'

/** Name of the cookie the server-rendered sign-in pages read the explicit language from. */
export const LANGUAGE_COOKIE = 'tracy_lang'

/** dsh writes Simplified Chinese as `zh-CN`; tracy-web and the interface list call it `zh`. */
export function languageCookieValue(id: string): string | null {
  const lower = String(id ?? '').toLowerCase()
  const value = lower === 'zh-cn' || lower === 'zh-hans' ? 'zh' : lower
  return SHOWN_LANGUAGE_IDS.includes(value) ? value : null
}

/** Write the cookie for a language the person just picked; an unknown id writes nothing. */
export function rememberLanguagePick(id: string): void {
  if (typeof document === 'undefined') return
  const value = languageCookieValue(id)
  if (!value) return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${LANGUAGE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax${secure}`
}

/** Delete the explicit-language cookie, so the sign-in pages follow the device again. */
export function clearLanguageCookie(): void {
  // Node renders (tests, server-side markup) have no document and no cookie to clear.
  if (typeof document === 'undefined') return
  document.cookie = `${LANGUAGE_COOKIE}=; path=/; max-age=0; samesite=lax`
}

/**
 * True while the language follows the device yet a `tracy_lang` cookie is still there: a pick made
 * before #756 deleted the cookie on "Follow device", or one the person reverted on an older build.
 * Such a cookie keeps pinning the sign-in pages to the old pick (Akemi, 04/10/2026).
 * @param preference - `LocaleSnapshot.preference`: present while an explicit choice stands.
 * @param cookieHeader - `document.cookie`.
 */
export function hasStaleLanguageCookie(preference: string | undefined, cookieHeader: string): boolean {
  if (preference !== undefined) return false
  return String(cookieHeader ?? '')
    .split(';')
    .some((part) => part.trim().startsWith(`${LANGUAGE_COOKIE}=`))
}

/**
 * Delete a stale cookie (see `hasStaleLanguageCookie`). Runs on every locale snapshot, so it heals
 * once and is a no-op afterwards; it never writes a value, so the automatic language still never
 * pins the sign-in pages.
 */
export function clearStaleLanguageCookie(preference: string | undefined): void {
  if (typeof document === 'undefined') return
  if (hasStaleLanguageCookie(preference, document.cookie)) clearLanguageCookie()
}
