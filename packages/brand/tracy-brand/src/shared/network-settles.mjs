/**
 * When the shell has finished asking the server for things. Testable: the scope is a parameter,
 * so a test can hand it a fake `fetch` and a fake `XMLHttpRequest` and drive the clock.
 *
 * 🔒 WHY NOT "THE DOM STOPPED CHANGING", WHICH THIS REPLACED. A quiet DOM is true at BOTH ends:
 * after the render finishes, and before it starts. The observer version began watching in a gap
 * between React's passes, measured 260ms of calm, and lifted the cover while the screen was still
 * filling — Akemi saw the half-built shell twice, once through each version.
 *
 * Requests do not have that ambiguity. Both fetch and XHR are counted: dsh uses fetch today, but a
 * single XHR left uncounted would hand back a false idle, and the wrapper costs nothing.
 */

/** No request in flight for this long means the screen has the data it is going to get. */
export const IDLE_MS = 500

/**
 * The request that opens the counting window.
 *
 * 🔒 WHY A GATE AT ALL. The page does not load in one wave, it loads in two, and the quiet between
 * them is longer than IDLE_MS. Measured on production 07/09, fresh account, five runs:
 *
 *   wave 1  1291-2379ms   shell.get, settings.get, inventory, modelCatalog, credentials
 *   quiet    952ms        <- the cover lifted here, at 2744ms
 *   wave 2  3331-5365ms   auth/me, api/sites, api/team, session/list, skills/list
 *
 * Wave 1 is dsh raising an empty frame. Wave 2 is the data a person came to see. Counting from the
 * first request of any kind let wave 1 satisfy the idle window on its own, so the cover lifted
 * 1.0-2.3s before the screen had anything in it (four clean runs: -2295, -1785, -1040, -1653ms).
 * Arming on this request instead moves the window past the gap.
 *
 * 🔒 WHY THIS REQUEST AND NOT A PIECE OF THE SCREEN. The obvious alternative was to wait for
 * rendered content -- a named workspace, a populated panel. Those belong to the empty-account
 * screen: someone opening an existing session has a different panel and a workspace named from the
 * start, so the cover would hold them to the deadline. Identity has no such variation. Everybody
 * authenticates.
 *
 * It is also OURS. /auth/me is served by the Tracy worker, not by dsh, so a dsh upgrade cannot
 * quietly move it the way it can move markup.
 */
export const GATE_PATTERN = /\/auth\/me(?:[?#]|$)/

/**
 * How long to wait for the gate request before falling back to "any request will do".
 *
 * 🔒 LOCAL HAS NO IDENTITY AND THAT IS NOT A BUG. A dev profile serves no /auth/me at all (the
 * worker does, and it is not in front of local), so a gate without a fallback would park every
 * local run at the deadline. Past this, the old behaviour resumes.
 */
export const GATE_TIMEOUT_MS = 2500

/**
 * The idle window used when the gate never came, instead of IDLE_MS.
 *
 * 🔒 WHY THE FALLBACK NEEDS A WIDER WINDOW THAN THE GATE PATH. GATE_TIMEOUT_MS is counted from
 * the moment the cover mounts (~1.5s into the page), so it fires around 4.0s -- and on production
 * /auth/me answers at 4.2-4.6s. The fallback can therefore open the counting window a beat BEFORE
 * the gate arrives. Harmless while requests are still in flight, but if it lands inside the quiet
 * between the two waves it would lift the cover early, which is the whole bug this file exists to
 * fix. The measured gap is 952ms, so a window wider than that cannot fit inside it.
 */
export const FALLBACK_IDLE_MS = 1500

/** Where a wrapped XHR parks its url between open() and send(). A symbol so nothing collides. */
const URL_TAG = Symbol('tracy-boot-cover-url')

/** A fetch input is a string, a URL, or a Request. @returns its url, or the empty string. */
function urlOf(input) {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href
  return typeof input?.url === 'string' ? input.url : ''
}

/**
 * Resolve once the page stops asking for things, counting only from the gate response onward.
 * @param scope - the window-like object carrying fetch and XMLHttpRequest.
 * @returns a promise that resolves after IDLE_MS with no request outstanding.
 */
export function networkSettles(scope) {
  return new Promise((resolve) => {
    let inFlight = 0
    let seen = false
    let armed = false
    let armedByGate = false
    let timer
    let gateTimer

    const idle = () => {
      clearTimeout(timer)
      const window = armedByGate ? IDLE_MS : FALLBACK_IDLE_MS
      if (inFlight === 0 && armed) timer = setTimeout(finish, window)
    }
    /**
     * Open the counting window. Idempotent: the gate request may be retried.
     * @param byGate - true when the identity response opened it, false for the timeout fallback.
     */
    const arm = (byGate) => {
      if (armed) return
      armed = true
      armedByGate = byGate
      clearTimeout(gateTimer)
      idle()
    }
    const started = () => {
      seen = true
      inFlight += 1
      clearTimeout(timer)
    }
    const ended = (url) => {
      inFlight = Math.max(0, inFlight - 1)
      // Arm on the response, not the request: the answer is what the screen is waiting for.
      if (GATE_PATTERN.test(url)) arm(true)
      idle()
    }

    // Once finished, a wrapper still installed under someone else's only passes calls through.
    let done = false
    const realFetch = scope.fetch
    const patchedFetch = function patched(...args) {
      if (done) return realFetch.apply(this, args)
      const url = urlOf(args[0])
      started()
      return realFetch.apply(this, args).finally(() => ended(url))
    }
    scope.fetch = patchedFetch

    // XHR carries its url on open(), not on send(), so both are wrapped to keep the pair.
    const xhr = scope.XMLHttpRequest?.prototype
    const realOpen = xhr?.open
    const realSend = xhr?.send
    const patchedOpen = function patched(...args) {
      if (!done) this[URL_TAG] = typeof args[1] === 'string' ? args[1] : String(args[1] ?? '')
      return realOpen.apply(this, args)
    }
    const patchedSend = function patched(...args) {
      if (done) return realSend.apply(this, args)
      const url = this[URL_TAG] ?? ''
      started()
      this.addEventListener('loadend', () => ended(url), { once: true })
      return realSend.apply(this, args)
    }
    if (xhr) {
      xhr.open = patchedOpen
      xhr.send = patchedSend
    }

    // The gate never arrived — no identity endpoint in front of this build, or it was renamed.
    // Fall back to the old rule so the cover cannot outlive the data it is hiding.
    gateTimer = setTimeout(() => {
      if (seen) arm(false)
    }, GATE_TIMEOUT_MS)

    // Nothing asked for anything at all: give the page one idle window from now rather than
    // waiting out the ceiling.
    timer = setTimeout(() => {
      if (!seen) finish()
    }, IDLE_MS * 2)

    function finish() {
      clearTimeout(timer)
      clearTimeout(gateTimer)
      done = true
      // Put back only what is still ours: a plugin that wrapped fetch or XHR after this one keeps its
      // wrapper (restoring the saved original dropped dsh-passwords' picker wrapper, 09/10/2026), and
      // the layer left under it is now a pass-through.
      if (scope.fetch === patchedFetch) scope.fetch = realFetch
      if (xhr) {
        if (xhr.open === patchedOpen) xhr.open = realOpen
        if (xhr.send === patchedSend) xhr.send = realSend
      }
      resolve()
    }
  })
}
