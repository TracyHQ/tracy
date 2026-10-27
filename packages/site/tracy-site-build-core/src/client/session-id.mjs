/**
 * Which dsh session this page is showing.
 *
 * The Build tab's calls to its own host half are plain GETs from a page, so they carry no session
 * and the host had to guess from the last tool call. That guess is wrong the moment two sessions
 * on one lane build at the same time (measured 09/09). The address already names the session —
 * dsh serves a session at `/s/<id>`, under the lane's mount when it has one — so the tab can say
 * which one it is instead of leaving the host to remember.
 */

/**
 * @param {string} [pathname] - defaults to the page's own path.
 * @returns {string | null} the session id in the address, or null when the page is not on one.
 */
export function currentSessionId(pathname = globalThis.location?.pathname ?? '') {
  const found = /(?:^|\/)s\/(session-[0-9a-zA-Z-]+)(?:\/|$)/.exec(pathname)
  return found ? found[1] : null
}
