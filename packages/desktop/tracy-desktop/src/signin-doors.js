/**
 * Two decisions about where a product window is going, kept out of src/main.js so they run under
 * `node --test`:
 *
 * - `signInDoor`: is this navigation one of the sign-in doors on Tracy's sign-in page — Google,
 *   GitHub, or email (`/signin/email?email=`, tasks/todo-desktop-onboard-v2.md contract 2)? Reaching
 *   one from the app starts a desktop sign-in round instead (src/signin-handoff.js); the email door
 *   hands the typed address to that round, which sends it in a request body, never in a URL.
 * - `firstRunLoginUrl`: on a first run (the first-run screen was never closed on this device), the
 *   sign-in page is asked for with `onboard=1`, so tracy-web draws it inside the Setup frame
 *   (contract 5). An older server ignores the parameter.
 */

/** The doors on Tracy's sign-in page whose sign-in the app runs as a desktop round. */
const SIGN_IN_DOORS = new Set(['/signin/google', '/signin/github', '/signin/email'])

/** The sign-in page a first run marks. */
const LOGIN_PATH = '/login'
const ONBOARD_PARAM = 'onboard'

/**
 * @param {string} target - where the window is being asked to go.
 * @param {string} home - the origin the window was opened on.
 * @returns {{ email: string | undefined } | null} the door's address (email door only), or null
 *   when `target` is not a sign-in door on `home`'s origin.
 */
function signInDoor(target, home) {
  let url
  try {
    url = new URL(target, home)
    if (url.origin !== new URL(home).origin || !SIGN_IN_DOORS.has(url.pathname)) return null
  } catch {
    return null
  }
  const email = url.pathname === '/signin/email' ? (url.searchParams.get('email') ?? undefined) : undefined
  return { email }
}

/**
 * @param {string} target - a URL a product window is about to load.
 * @param {string} origin - the pinned origin.
 * @returns {string | null} `target` with `onboard=1` added, or null when it is not `<origin>/login`
 *   or already carries `onboard`.
 */
function firstRunLoginUrl(target, origin) {
  let url
  try {
    url = new URL(target)
    if (url.origin !== new URL(origin).origin || url.pathname !== LOGIN_PATH) return null
  } catch {
    return null
  }
  if (url.searchParams.has(ONBOARD_PARAM)) return null
  // Appended to the query as written, so the other parameters keep their exact encoding.
  url.search = url.search === '' ? `?${ONBOARD_PARAM}=1` : `${url.search}&${ONBOARD_PARAM}=1`
  return url.href
}

/**
 * Where a window goes when its sign-in round ended without a session: the sign-in page, with a
 * `reason` word tracy-web turns into a short message (`/login?reason=`), so the person is never
 * sent back without being told why. Only these words are ever sent; the server draws nothing for
 * any other. On a first run `markFirstRunSignIn` then adds `onboard=1`.
 * @param {string} origin - the pinned origin.
 * @param {{ outcome: string, refusal?: string }} result - what `handoff.start` resolved.
 * @returns {string}
 */
function signInFailedUrl(origin, result) {
  const reason =
    result.refusal === 'not-admitted'
      ? 'not-admitted'
      : result.outcome === 'denied' || result.outcome === 'expired'
        ? result.outcome
        : 'failed'
  return `${origin}${LOGIN_PATH}?reason=${reason}`
}

module.exports = { signInDoor, firstRunLoginUrl, signInFailedUrl, SIGN_IN_DOORS }
