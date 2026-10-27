// One browser, N contexts — the Playwright contract every tool in this skill shares.
//
// Before this file each tool launched its own Chromium (26 launches for a 13-page scanner run)
// and walked its routes one after another. Launching costs ~1.5 s; a page costs ~1–4 s; the
// machine has cores to spare. So: `withBrowser` launches once for the whole tool, `withPage`
// gives a job its own context (a context is isolation: cookies, storage, the dark hook) and
// closes it whatever happens, and `mapLimit` keeps at most N jobs in flight while returning
// results in INPUT order — a parallel run must write the same report as a serial one, so the
// order of the output never depends on which page answered first.
//
// Timeouts are explicit at every layer (page.goto, page.evaluate) because a page that never
// answers is the failure mode nothing else reports: the tool sits, the log stops, and the
// operator reads "still running". A hung page.evaluate becomes a named error after
// `evaluateTimeoutMs` (30 s) — `withPage` guards the page's own `evaluate` so every scanner
// inherits it without each call site remembering to.
//
// The dark hook grammar (class:…, attr:…=…, cookie:…=…, ls:…=…, joined with `+`) lives here
// because shoot, verify-parity and verify all apply the same hook the same way: as an init
// script that runs BEFORE the page's own scripts, so a site that resolves its theme at boot
// paints dark from the first frame.
import { createRequire } from 'node:module'

export const DEFAULT_CONCURRENCY = 4
export const DEFAULT_GOTO_TIMEOUT_MS = 60000
const DEFAULT_EVALUATE_TIMEOUT_MS = 30000

// Chromium flag shared by the review scanners (runtime.mjs) — kept in one place.
export const LAUNCH_ARGS = ['--disable-features=MacAppCodeSignClone']

export function concurrencyFrom(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--concurrency')
  const raw = i === -1 ? env.TRACY_CONCURRENCY : argv[i + 1]
  if (raw === undefined || raw === '') return DEFAULT_CONCURRENCY
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`--concurrency must be a positive integer, got ${raw}`)
  return n
}

export function withTimeout(promise, ms, label = 'operation') {
  let timer
  const clock = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer))
}

// An init script runs when the document is CREATED — before `<html>` exists — so a class/attr
// hook must wait for the root element (a MutationObserver on the document fires the moment the
// parser inserts `<html>`, still before any of the page's scripts). Writing to
// `document.documentElement` directly threw a TypeError that Playwright swallowed, and the hook
// silently did nothing; cookie and localStorage hooks never needed the element.
const onRoot = (js) =>
  `(() => { const apply = () => { ${js} }; if (document.documentElement) apply(); else new MutationObserver((_, o) => { if (document.documentElement) { apply(); o.disconnect() } }).observe(document, { childList: true }) })();`
export function initScriptFor(hook) {
  const [kind, spec] = hook.split(':')
  if (kind === 'class') return onRoot(`document.documentElement.classList.add(${JSON.stringify(spec)})`)
  if (kind === 'attr') {
    const [name, value] = spec.split('=')
    return onRoot(`document.documentElement.setAttribute(${JSON.stringify(name)}, ${JSON.stringify(value ?? 'dark')})`)
  }
  if (kind === 'cookie') return `document.cookie = ${JSON.stringify(spec + ';path=/')};`
  // A site whose boot script reads localStorage and then sets the attribute itself (the Northgate
  // canvas reads `ngi-theme`) undoes an attribute set before it runs; seed the storage instead.
  if (kind === 'ls') {
    const [k, v] = spec.split('=')
    return `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v ?? 'dark')});`
  }
  throw new Error(`unknown dark hook: ${hook}`)
}
// Both T4 hooks at once when asked for "class:t4-dark+attr:data-bs-theme=dark".
export const darkInitScript = (hook) => hook.split('+').map(initScriptFor).join('\n')

// `launch` is injectable so tests run without Chromium; the default imports playwright lazily so
// tools that never need a browser (a parity run served entirely from snapshots) never load it.
export async function withBrowser(fn, { headless = true, launch, launchOptions = {} } = {}) {
  const doLaunch =
    launch ??
    (async () => {
      const { chromium } = await import('playwright')
      return chromium.launch({ headless, args: LAUNCH_ARGS, ...launchOptions })
    })
  const browser = await doLaunch()
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

// A lazily-launched browser for tools that only sometimes need one (http-parity renders a source
// route only when its snapshot is missing or stale). `get()` launches on first use; `close()` is
// a no-op when nothing was launched.
/**
 * Which binary drew the evidence, and which Playwright drove it.
 *
 * A report that does not name its renderer cannot be compared with another one: Chromium changes
 * how it rasterises between releases, so a difference between two runs a month apart may be the
 * site or may be the browser, and nothing in the files says which. `version()` is what the running
 * browser reports, not what the manifest hoped for.
 */
export function browserIdentity(browser) {
  return {
    engine: browser.browserType().name(),
    version: browser.version(),
    playwright: playwrightVersion()
  }
}
function playwrightVersion() {
  // ⚠ The `try` here is for a Playwright that is not resolvable, NOT for a mistake in this file.
  // It shipped once with `createRequire` used and never imported: the ReferenceError was swallowed
  // and `browser.playwright` was `null` in every report, which reads exactly like "not installed".
  try {
    return createRequire(import.meta.url)('playwright/package.json').version
  } catch {
    return null
  }
}

/**
 * One browser for a run, launched on first use. `restart(dead)` replaces it after it died: before
 * this, one Chromium crash turned EVERY axis still queued into `axis-error` (Tracy Base visual-01 lost
 * 13/38 pages that way; killing the browser 20 s into a 6-page run lost 3/6). The argument is the
 * instance the caller saw die, so several jobs noticing the same death restart it once — a caller
 * holding an older instance gets the current one. `restarts()` counts them for the report.
 */
export function lazyBrowser(opts = {}) {
  let pending = null
  let current = null
  let restarts = 0
  const launch = () =>
    (
      opts.launch?.() ??
      import('playwright').then(({ chromium }) =>
        chromium.launch({ headless: opts.headless ?? true, args: LAUNCH_ARGS, ...(opts.launchOptions ?? {}) })
      )
    ).then((b) => (current = b))
  return {
    get() {
      if (!pending) pending = launch()
      return pending
    },
    launched: () => pending !== null,
    restarts: () => restarts,
    // Synchronous up to the relaunch on purpose: jobs that saw the same death call this at the same
    // time, and an `await` before the decision let each of them relaunch.
    restart(dead) {
      if (pending && current !== dead) return pending // already replaced, or the replacement is launching
      if (pending && dead && isAlive(dead)) return pending // not dead: keep it
      const old = current
      current = null
      restarts++
      pending = launch()
      old?.close().catch(() => {})
      return pending
    },
    async close() {
      if (pending) await (await pending).close()
      pending = null
      current = null
    }
  }
}

/** False once Playwright's browser has disconnected (crashed, killed, closed). A fake without the method counts as alive. */
export const isAlive = (browser) => (typeof browser?.isConnected === 'function' ? browser.isConnected() : true)

// One context + one page for one job. `theme: 'dark'` sets colorScheme AND installs the dark hook
// as an init script; `initScripts` are added on top (the scanners' AOS neutraliser). The context
// is closed in `finally`, so a job that throws never leaks a page into the next job.
// `lightHook` (default none) is the light pass of a source that is dark by default: a `cookie:`
// part is a real request cookie set on the context for `hookUrl`'s origin before the first
// navigation, so a server that decides the theme reads it on the document request (an init-script
// cookie arrives after the document was answered); any other part is an init script, as on the
// dark pass.
// `darkRequestHook` (default none) is the same thing for the dark pass of a source that is light by
// default and decides its theme on the server: its `cookie:` part is a request cookie too, set before
// the first navigation; the init-script `darkHook` would be undone by the source's own theme script.
export async function withPage(browser, opts = {}, fn) {
  const {
    viewport = { width: 1440, height: 900 },
    theme = 'light',
    colorScheme = theme === 'dark' ? 'dark' : 'light',
    darkHook = null,
    lightHook = null,
    darkRequestHook = null,
    hookUrl = null,
    initScripts = [],
    ignoreHTTPSErrors = false,
    hasTouch = false,
    deviceScaleFactor = 1,
    evaluateTimeoutMs = DEFAULT_EVALUATE_TIMEOUT_MS
  } = opts
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor, ignoreHTTPSErrors, ...(hasTouch ? { hasTouch: true } : {}) })
  try {
    if (theme === 'dark' && darkHook) await context.addInitScript(darkInitScript(darkHook))
    if (theme === 'light' && lightHook) await applyRequestHook(context, lightHook, hookUrl, 'light')
    if (theme === 'dark' && darkRequestHook) await applyRequestHook(context, darkRequestHook, hookUrl, 'dark request')
    for (const s of initScripts) await context.addInitScript(s)
    const page = await context.newPage()
    guardEvaluate(page, evaluateTimeoutMs)
    return await fn(page, context)
  } finally {
    await context.close()
  }
}

async function applyRequestHook(context, hook, hookUrl, what) {
  for (const part of hook.split('+')) {
    const [kind, spec] = part.split(':')
    if (kind !== 'cookie') {
      await context.addInitScript(initScriptFor(part))
      continue
    }
    if (!hookUrl) throw new Error(`withPage: ${what} hook ${part} needs hookUrl, the site the cookie is for`)
    const [name, ...value] = spec.split('=')
    // `hookUrl` may list several sites (verify-parity drives both stands through one context).
    for (const url of [hookUrl].flat())
      await context.addCookies([{ name, value: value.join('='), url: `${new URL(url).origin}/` }])
  }
}

// Every page.evaluate gets a deadline. The guard is an own property shadowing the prototype
// method, so the page keeps its type and every other API untouched.
export function guardEvaluate(page, ms = DEFAULT_EVALUATE_TIMEOUT_MS) {
  if (!ms || page.__evaluateGuarded) return page
  const original = page.evaluate.bind(page)
  page.evaluate = (fn, arg) => withTimeout(original(fn, arg), ms, 'page.evaluate')
  page.__evaluateGuarded = true
  return page
}

// Run `fn(item, index)` over `items` with at most `limit` in flight. Resolves to results in input
// order. `onDone(index, result)` is called in input order too, as soon as every earlier item has
// finished — a tool can stream its log lines in the same order a serial run would print them.
// The first rejection rejects the whole map (after in-flight work settles) — a partial result
// that looks complete is worse than a loud stop.
export async function mapLimit(items, limit, fn, { onDone } = {}) {
  const list = Array.from(items)
  const results = new Array(list.length)
  const done = new Array(list.length).fill(false)
  let next = 0
  let flushed = 0
  let firstError = null
  const flush = () => {
    while (flushed < list.length && done[flushed]) {
      if (onDone && !firstError) onDone(flushed, results[flushed])
      flushed++
    }
  }
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      if (firstError) return
      try {
        results[i] = await fn(list[i], i)
      } catch (e) {
        firstError ??= e
        return
      }
      done[i] = true
      flush()
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker))
  if (firstError) throw firstError
  return results
}
