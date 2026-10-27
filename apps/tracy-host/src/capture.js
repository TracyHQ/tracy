/**
 * The demo screenshotter — the browser half of "Capture shots from demo" that only tracy-host can
 * run. tracy-web asks over the signed channel; the shot comes back as base64 PNGs.
 *
 * ⚠ TWO WAYS TO REACH A DEMO, BECAUSE THE FIRST ONE IS NOT ALWAYS TRUE. This file used to say that
 * this process sits "beside every site on the `tracy_tracy` network" and can therefore reach a
 * demo by its container name. Measured 17/09 on the dev machine: `tracy-tracy-host-1` runs with
 * `network_mode: host`, so it resolves names through the MACHINE's DNS and `<label>-web-1` — an
 * alias that exists only inside that Docker network — does not resolve at all. Every capture there
 * failed with `ERR_NAME_NOT_RESOLVED` while the demo itself answered HTTP 200 the whole time.
 *
 * ⚠ AND LOOPBACK IS NOT ENOUGH EITHER, FOR THE SAME KIND OF REASON. A Tracy-built demo is
 * configured for the address it will be visited at — measured 17/09 on `apple-joomla`:
 * `force_ssl = 2`, `live_site = https://apple-joomla.tracy.site/`. Joomla then answers
 * `http://127.0.0.1:52019/` with a 301 to `https://127.0.0.1:52019/`, where nothing speaks TLS, and
 * the shot dies as `ERR_SSL_PROTOCOL_ERROR` on a URL that plainly says `http`. A demo Tracy did not
 * build (`ja-voyara`: `force_ssl = 0`) has no such redirect, which is why one worked and the other
 * did not.
 *
 * So the order is: the demo's OWN PUBLIC ADDRESS first — the one it is configured for, and the one
 * a visitor sees, so the card's picture is the page people get — then the loopback port for a demo
 * that has no public address yet, then the container name.
 *
 * 🔒 THE TARGET IS STILL COMPOSED HERE — never a URL handed in. A caller names a label (held to
 * `SAFE_LABEL`), a platform, on-demo paths, and at most a HOSTNAME and a PORT NUMBER, each held to
 * its own shape. It cannot point this browser at an arbitrary origin: the only three shapes this
 * file will fetch are `https://<host>/…`, `http://127.0.0.1:<port>/…` and the web container's own
 * docker-network name `http://<webDnsName(label)>[:4321]/…` (`<label>-web-1`, or a bounded
 * `tracy-web-<hash>` alias when that would exceed the 63-octet DNS-label cap — issue #165).
 *
 * 🔒 THIS FILE DOES NOT NAME THE PICTURES. It returns each shot keyed by the layout key and the
 * width it was taken at; tracy-web turns that into `<template>-<release>-<key>-<width>.png` with the shared
 * `shotName`. The reason is boundaries: this image copies only `apps/tracy-host/src`
 * (`apps/tracy-host/Dockerfile`), so it cannot import that single source, and a second copy of the
 * naming rule living here — untested against the store's own shape — is exactly the drift
 * `template-shots.js` exists to prevent.
 *
 * 🔒 EVERY SHOT IS TIME-BOXED, AND ONE FAILURE IS ONE FAILURE. A demo page that never settles must
 * not hang the whole batch or the request; each shot races a timer, and a shoot that throws or
 * times out is reported as `{ ok: false, error }` beside the ones that worked — the operator sees
 * which pages came back, not a single opaque 502.
 */
import { createHash } from 'node:crypto'
import { ownPublicOrigin } from './public-origin.js'
import { SAFE_LABEL } from './provision.js'

/** The two viewports a Design inspiration card frames — the thumbnail's, and the preview phone's.
 * Restated here because this image cannot import the shared list; `check`/the tracy-web side hold
 * the same pair, and a shot's WIDTH (not its bytes) is what names it, so these must not drift. */
export const CAPTURE_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 390, height: 844 })
])

/** How long one page has to settle and paint before its shot is given up on. Generous enough for
 * fonts and lazy images at both widths (the checkout script waits 3.5s per page), bounded so a
 * demo that will never answer cannot hold the batch open. Overridable per app for tests. */
export const CAPTURE_TIMEOUT_MS = 30000

/** A layout key and a path on the demo — the store's own key shape, so a name is refused before a
 * browser starts rather than after the door rejects the picture it produced. */
const KEY = /^[a-z0-9][a-z0-9-]*$/

/** A port a site can be published on. Loopback only, so the number is the whole of the reach. */
const PORT = (value) => Number.isInteger(value) && value > 0 && value < 65536

/** A demo's public hostname — labels and dots, nothing that could carry a path, port or credential. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** The docker-network name to dial the web container by — a COPY of `webDnsName` in
 * `apps/tracy-web/src/sites/label.js`, restated because this image cannot import across the app
 * boundary (same reason `CAPTURE_VIEWPORTS` is restated above). `<label>-web-1` for any label short
 * enough to fit a 63-octet DNS label; a bounded `tracy-web-<32-hex-of-SHA256(label)>` alias
 * otherwise (issue #165). The parity test in `render-compose.test.mjs` and the algorithm's own
 * fixed shape keep this identical to the canonical copy and to `render-compose.sh`. */
function webDnsName(label) {
  const name = `${label}-web-1`
  if (name.length <= 63) return name
  return `tracy-web-${createHash('sha256').update(label).digest('hex').slice(0, 32)}`
}

/**
 * Where the demo answers from this process.
 *
 * `port` is the site's own published loopback port — what `render-compose.sh` binds as
 * `127.0.0.1:<port>->80/tcp` and what `site.port` records. Given one, it is used: it works whether
 * or not this process shares a Docker network with the site, which the container-name form does
 * not (see the block at the top).
 *
 * Without one, the web container's docker-network name (`webDnsName` — the container name for a
 * short label, a bounded `tracy-web-<hash>` alias for a long one, issue #165): EmDash's standalone
 * Node server listens on 4321, every PHP platform keeps Apache's 80 — the one arithmetic line
 * `siteTarget`'s same-host branch runs, kept here because this process has no import of it.
 *
 * @param {string} label
 * @param {string} platform
 * @param {number|null} [port] the site's published loopback port, when the caller knows it
 * @returns {string} the base URL, with a trailing slash so a path joins cleanly
 */
export function captureTarget(label, platform, port = null, host = null) {
  if (typeof host === 'string' && HOSTNAME.test(host)) return `https://${host}/`
  if (PORT(port)) return `http://127.0.0.1:${String(port)}/`
  const suffix = platform === 'emdash' ? ':4321' : ''
  return `http://${webDnsName(label)}${suffix}/`
}

/**
 * Read the request into what a capture needs, or the first thing wrong with it — pure, so a bad
 * argument is a sentence before any browser work. Same grammar as `parseShoot` in the checkout
 * script: a label that could spell a path, a key outside the store's shape, a path that is not one.
 * @param {any} body
 * @returns {{ label: string, platform: string, layouts: { key: string, path: string }[], error: string | null }}
 */
export function captureBody(body) {
  const fail = (error) => ({
    label: '',
    platform: '',
    layouts: [],
    port: null,
    host: null,
    publicOrigin: null,
    maxBytes: null,
    error
  })
  if (!body || typeof body !== 'object') return fail('not an object')
  if (typeof body.label !== 'string' || !SAFE_LABEL.test(body.label)) return fail('refused label')
  if (typeof body.platform !== 'string' || body.platform === '') return fail('refused platform')
  if (!Array.isArray(body.layouts) || body.layouts.length === 0) return fail('need at least one layout')
  /** @type {{ key: string, path: string, address?: string }[]} */
  const layouts = []
  for (const layout of body.layouts) {
    if (!layout || typeof layout !== 'object') return fail('a layout is { key, path }')
    if (typeof layout.key !== 'string' || !KEY.test(layout.key)) return fail('refused layout key')
    if (typeof layout.path !== 'string' || !layout.path.startsWith('/')) return fail('refused layout path')
    if (layouts.some((l) => l.key === layout.key)) return fail(`layout ${layout.key} named twice`)
    // `address` is where the page ANSWERS when that is not its `path` — checked like a path and
    // dropped when it is neither, because an unusable address must fall back to the old behaviour
    // rather than refuse a capture that would have worked.
    const address =
      typeof layout.address === 'string' && layout.address.startsWith('/') ? layout.address : undefined
    layouts.push({ key: layout.key, path: layout.path, ...(address === undefined ? {} : { address }) })
  }
  // A port is optional and checked rather than trusted: absent or unusable simply falls back to the
  // container name, which is the behaviour every caller had before this existed.
  const port = PORT(body.port) ? body.port : null
  const host = typeof body.host === 'string' && HOSTNAME.test(body.host) ? body.host : null
  // 🔒 THE CEILING IS CARRIED, NOT RESTATED. The store's limit belongs to the store
  // (`MAX_PICTURE_BYTES` in `apps/tracy-web/src/lib/template-shots.js`), and this image cannot
  // import it — the same boundary that makes `CAPTURE_VIEWPORTS` and `webDnsName` copies above.
  // A copy of a NUMBER would drift the day someone raises it, and drift here is invisible: shots
  // would keep coming back over a limit this side still believed in. So the caller names it, and
  // a caller that names nothing gets exactly the behaviour it had before ceilings existed.
  const maxBytes = Number.isInteger(body.maxBytes) && body.maxBytes > 0 ? body.maxBytes : null
  // The name the demo gives itself (WordPress redirects every page to it): pages open there (`demoAddress`).
  const publicOrigin = ownPublicOrigin(body.publicOrigin, host)
  if (publicOrigin === undefined) return fail('refused public origin')
  return {
    label: body.label,
    platform: body.platform,
    layouts,
    port,
    host,
    publicOrigin,
    maxBytes,
    error: null
  }
}

/**
 * Race a shoot against its time box: whichever comes first, and the timer is always cleared. On
 * the timeout the race is lost FIRST, with `describe()`'s sentence, and only then is `cancel()`
 * called: a shot that rejects as it is cancelled must not win with "context closed".
 */
async function withTimeout(promise, ms, describe, cancel) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(describe()))
      cancel()
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Take every layout at both viewports off the demo, reporting each shot rather than throwing.
 *
 * @param {object} input
 * @param {string} input.label
 * @param {string} input.platform
 * @param {{ key: string, path: string, address?: string }[]} input.layouts
 * @param {number|null} [input.port] the site's published loopback port, when the caller knows it
 * @param {string|null} [input.host] the demo's public hostname, when it has one
 * @param {number|null} [input.maxBytes] the store's per-picture ceiling, when the caller named one
 * @param {(args: { url: string, width: number, height: number, maxBytes: number | null, deadlineMs: number, signal: AbortSignal, progress: { phase: string, timings: Record<string, number> } }) => Promise<Uint8Array>} input.shoot
 * @param {number} input.timeoutMs
 * @returns {Promise<{ shots: { key: string, width: number, ok: boolean, png?: string, error?: string, ms: number, timings: Record<string, number> }[] }>}
 */
export async function runCapture({
  label,
  platform,
  layouts,
  port = null,
  host = null,
  maxBytes = null,
  shoot,
  timeoutMs,
  base: reached = null,
  serveFrom = null
}) {
  // `reached`: the address the route found answering (`demo-qa.js` `reachableBase`); else the first rule.
  const base = reached ?? captureTarget(label, platform, port, host)
  const shots = []
  for (const layout of layouts) {
    // `new URL(path, base)` joins an absolute demo path onto the container's own origin.
    //
    // ⚠ THE ADDRESS WHEN THERE IS ONE, because `path` is the page's IDENTITY and not always its
    // address. Every Joomla demo Tracy provisions runs SEF with rewriting off, so the menu's own
    // links are `/index.php/our-services` and the stripped `/our-services` is Apache's 404.
    // Measured 17/09: three of ja_vital's four layouts were photographs of the "Not Found" page,
    // and nothing said so — a 404 screenshots exactly as well as a site does.
    const url = new URL(layout.address ?? layout.path, base).href
    for (const view of CAPTURE_VIEWPORTS) {
      // 🔒 A SHOT THAT RAN OUT OF TIME IS STOPPED, AND SAYS WHERE IT WAS (12/10/2026, fleet01).
      // The timer used to only stop WAITING: the shot kept loading and screenshotting in the
      // background while the next width started, on a 2-core host, so one slow page sank both
      // widths, and "shot timed out after 30000ms" never said whether the time went to the load,
      // the waits or the picture. `signal` closes the shot's browser context; `progress` is what
      // the shot reports as it goes (`makeShoot` in browser.js), and comes back on every shot.
      const controller = new AbortController()
      const progress = { phase: 'starting the browser', timings: {} }
      const started = Date.now()
      try {
        const bytes = await withTimeout(
          shoot({
            url,
            width: view.width,
            height: view.height,
            maxBytes,
            deadlineMs: timeoutMs,
            signal: controller.signal,
            progress,
            // Opened at the demo's own name, served from the address that answered (`self-named.js`).
            ...(serveFrom ? { serveFrom, siteHosts: host ? [host] : [] } : {})
          }),
          timeoutMs,
          () => `shot timed out after ${timeoutMs}ms while ${progress.phase}`,
          () => controller.abort()
        )
        shots.push({
          key: layout.key,
          width: view.width,
          ok: true,
          png: Buffer.from(bytes).toString('base64'),
          ms: Date.now() - started,
          timings: progress.timings
        })
      } catch (e) {
        shots.push({
          key: layout.key,
          width: view.width,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          ms: Date.now() - started,
          timings: progress.timings
        })
      }
    }
  }
  return { shots }
}
