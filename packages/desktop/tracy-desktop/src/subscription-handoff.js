/**
 * Loopback OAuth callbacks return to the exact remote window that started the attempt.
 *
 * A subscription sign-in (Claude, ChatGPT Codex) redirects to a fixed loopback address the vendor
 * allows (`http://localhost:1455/auth/callback` for Codex). Nothing on the person's computer listens
 * there, so the browser shows "refused to connect" and the web asks the person to paste the address.
 * The app listens there itself while one attempt is open, answers the browser tab, and hands the full
 * callback URL to the window that started it (`tracy-subscription-callback`, which
 * `@tracy/dsh-model-plan` `connect.ts` listens for). If the port is taken (a real Codex CLI running),
 * the paste path still works.
 */
const http = require('node:http')

/** How long one attempt keeps listening: the server's own attempt lasts ten minutes. */
const LISTEN_MS = 10 * 60 * 1000

/** What the browser tab shows once the callback arrived. No scripts, no external assets. */
const SIGNED_IN_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tracy Cowork</title></head>' +
  '<body style="font-family:system-ui,sans-serif;margin:4rem auto;max-width:32rem;text-align:center">' +
  '<p>Signed in. You can close this tab and return to Tracy Cowork.</p></body></html>'

/** The event `@tracy/dsh-model-plan` `connect.ts` listens for on `window` (`CALLBACK_EVENT`). */
const CALLBACK_EVENT = 'tracy-subscription-callback'

/**
 * The script that hands a caught callback to the page's own world (the preload's `window` is not the
 * page's under context isolation). The URL travels as JSON data, never as code.
 * @param {string} url - the full callback URL.
 * @returns {string} for `webContents.executeJavaScript`.
 */
function callbackScript(url) {
  return `window.dispatchEvent(new CustomEvent('${CALLBACK_EVENT}', { detail: ${JSON.stringify({ url })} }))`
}

function callbackOf(target) {
  try {
    const url = new URL(target)
    const redirect = new URL(url.searchParams.get('redirect_uri'))
    const state = url.searchParams.get('state')
    const claude =
      url.origin === 'https://claude.ai' && redirect.port === '53692' && redirect.pathname === '/callback'
    const codex =
      url.origin === 'https://auth.openai.com' &&
      redirect.port === '1455' &&
      redirect.pathname === '/auth/callback'
    if (
      (!claude && !codex) ||
      redirect.protocol !== 'http:' ||
      (redirect.hostname !== 'localhost' && redirect.hostname !== '127.0.0.1') ||
      !state ||
      state.length > 512
    )
      return null
    return { redirect, state }
  } catch {
    return null
  }
}

/**
 * @param {object} deps
 * @param {string} deps.home - the address the window belongs to; only a page on its origin may start
 *   an attempt or receive its callback.
 * @param {() => string} deps.currentUrl - the window's current address.
 * @param {(url: string) => void} deps.deliver - hand the full callback URL to the window.
 * @param {(url: string) => unknown} deps.openExternal - the system browser.
 * @param {(line: string) => void} [deps.log] - one line per notable event.
 * @param {number} [deps.port] - listen here instead of the redirect's port (tests).
 * @param {number} [deps.timeoutMs] - how long an attempt listens.
 */
function subscriptionHandoff({
  home,
  currentUrl,
  deliver,
  openExternal,
  log = () => {},
  port,
  timeoutMs = LISTEN_MS
}) {
  let active
  const close = () => {
    if (!active) return
    clearTimeout(active.timer)
    active.server.close()
    active = undefined
  }
  async function open(target) {
    const attempt = callbackOf(target)
    if (!attempt || new URL(currentUrl()).origin !== new URL(home).origin) return false
    close()
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, attempt.redirect.origin)
      if (
        req.method !== 'GET' ||
        url.pathname !== attempt.redirect.pathname ||
        url.searchParams.get('state') !== attempt.state ||
        !url.searchParams.get('code')
      ) {
        // Not ours, or not this attempt's: say nothing about what was expected.
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not found.')
        return
      }
      if (new URL(currentUrl()).origin !== new URL(home).origin) {
        res.writeHead(409)
        res.end()
        close()
        return
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"
      })
      res.end(SIGNED_IN_PAGE)
      deliver(url.href)
      close()
    })
    // An occupied callback port leaves the existing paste-URL flow usable.
    const listening = await new Promise((resolve) => {
      server.once('error', (error) => {
        log(
          `subscription callback: cannot listen on port ${attempt.redirect.port} (${error.code ?? error.message}); the person pastes the address instead`
        )
        resolve(false)
      })
      server.listen(port ?? Number(attempt.redirect.port), '127.0.0.1', () => resolve(true))
    })
    if (listening) active = { server, timer: setTimeout(close, timeoutMs) }
    await openExternal(target)
    return true
  }
  /** @returns {number | null} the port an attempt listens on, or null when none does. */
  const listeningPort = () => {
    const address = active?.server.address()
    return address && typeof address === 'object' ? address.port : null
  }
  /**
   * The page asked for the system browser outright (`tracyDesktop.links.openExternal`): a
   * subscription sign-in starts the catcher first; anything else just opens.
   * @param {string} target
   */
  async function openOrBrowse(target) {
    if (!(await open(target))) await openExternal(target)
  }
  return { open, openOrBrowse, close, port: listeningPort }
}
module.exports = { CALLBACK_EVENT, callbackOf, callbackScript, subscriptionHandoff }
