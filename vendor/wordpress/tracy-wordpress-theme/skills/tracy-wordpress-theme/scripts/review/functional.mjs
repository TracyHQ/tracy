#!/usr/bin/env node
// functional.mjs — does the built site WORK, page by page: the minimal smoke a visitor would notice
// before any pixel. The visual review measures how pages look; nothing in this skill asked whether
// a link answers, a form can be filled, or search finds anything. This is the small set, not a copy
// of tracy-dev's functional suite:
//
//   page-status        the route itself answers < 400 — or exactly its declared status: a page-map's
//                      `view: "404"` page (or an entry with `status`) must answer that, and is read
//                      for every other check like any page
//   console-error      no console error and no uncaught exception while the page loads
//   link-broken        every internal link on the routes (same origin, deduplicated) ends < 400;
//                      a same-page `#fragment` href is not a link
//   img-alt            every <img> carries alt (alt="" is the right answer for a decorative one)
//   form-label         every visible field of a form has a label (<label>, aria-label(ledby), title)
//                      — a placeholder is not one; hidden fields need none
//   form-submit        every visible form has a submit control
//   html-lang          <html lang> is set
//   h1-count           exactly one rendered <h1>
//   search             the search page answers a word taken from the site's own headings with at
//                      least one result that CONTAINS the word — a page that only repeats the query
//                      in its heading ("Results for …", nothing found) is not a result
//   drawer-*           the header's drawer on a phone (390 px, a touch screen), in light and in dark:
//                      opened by a real tap on its button, open (panel shown, aria-expanded "true" —
//                      or a dialog button whose panel is aria-modal), the close button's centre hit-
//                      tests to the close button itself (not a panel drawn over it), a tap there
//                      closes it, aria-expanded goes back to "false" and focus returns to the open
//                      button. Never `force`, element.click() or Escape: a close button a visitor
//                      cannot tap fails. core/navigation's overlay by default (`--drawer auto`: a
//                      site without one is recorded, not failed); `--drawer core`, or a port's own
//                      `--drawer-open/--drawer-panel/--drawer-close` selectors, require it
//
//   node scripts/review/functional.mjs <site> --routes /a,/b|<page-map.json> [--out <file.json>]
//        [--search-path '/?s='] [--search-word <word>] [--concurrency 4] [--timeout-ms 30000]
//        [--drawer auto|core|none] [--drawer-open <sel> --drawer-panel <sel> --drawer-close <sel>]
//        [--drawer-routes /a,/b] [--dark-hook attr:data-theme=dark]
//
// Writes <out>.json and <out>.md (default functional.json in the working directory); `examined`
// counts what each check looked at, so "0 findings" over 0 links reads as what it is. Every page of
// a page-map is measured, synthetic ones (the 404 page, a post standing in for the single view)
// included; a link to a page answering 404 is broken wherever it is. Exit 1 on any finding, 2 on
// usage or on a --routes file that cannot be read.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { concurrencyFrom, darkInitScript, guardEvaluate, mapLimit, withBrowser, withPage } from '../lib/browser.mjs'
import { exitOnInputError, readRoutes } from '../lib/routes.mjs'

/** Runs in the page: what the checks read. */
function inspectInPage() {
  const rendered = (el) => {
    if (!el.getClientRects().length || el.closest('[aria-hidden="true"], [hidden]')) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('name') ? `[name=${el.getAttribute('name')}]` : ''}`
  const labelled = (f) => {
    if ([...(f.labels ?? [])].some((l) => text(l))) return true
    if ((f.getAttribute('aria-label') ?? '').trim()) return true
    const by = (f.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
    if (by.some((id) => text(document.getElementById(id)))) return true
    return Boolean((f.getAttribute('title') ?? '').trim())
  }
  const forms = [...document.querySelectorAll('form')].filter(rendered).map((form) => {
    const fields = [...form.querySelectorAll('input, select, textarea')].filter(
      (f) => !/^(hidden|submit|button|reset|image)$/i.test(f.getAttribute('type') ?? '') && rendered(f)
    )
    const submit =
      Boolean(form.querySelector('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]')) ||
      (form.id && Boolean(document.querySelector(`[form="${CSS.escape(form.id)}"][type="submit"]`)))
    return {
      form: `${describe(form)}${form.getAttribute('role') === 'search' || form.querySelector('[type="search"], [name="s"]') ? ' (search)' : ''}`,
      fields: fields.length,
      unlabelled: fields.filter((f) => !labelled(f)).map((f) => `${describe(f)}${f.getAttribute('placeholder') ? ` (placeholder "${f.getAttribute('placeholder')}" only)` : ''}`),
      submit
    }
  })
  return {
    lang: document.documentElement.getAttribute('lang') ?? '',
    h1: [...document.querySelectorAll('h1')].filter(rendered).map(text),
    images: [...document.querySelectorAll('img')].map((img) => ({
      src: img.currentSrc || img.getAttribute('src') || '',
      alt: img.hasAttribute('alt') || img.closest('[aria-hidden="true"]') !== null || /^(presentation|none)$/.test(img.getAttribute('role') ?? '')
    })),
    forms,
    // A same-page fragment (`#`, a skip link) is not a link to another page: resolved, it is this
    // page's own URL, which on the 404 page answers 404.
    links: [...document.querySelectorAll('a[href]')].filter((a) => !a.getAttribute('href').trim().startsWith('#')).map((a) => a.href),
    headings: [...document.querySelectorAll('h1, h2, h3')].filter(rendered).map(text)
  }
}

const STOP = new Set('about above after again against their there these those which while would could should other where being before under between through during without within across along among around because every people really things very your yours ours from with this that have more most some such than then them they what when will into only over also just like home page welcome read learn contact search results result'.split(' '))

/** A word from the site's own headings that search should find: the longest ≥ 5 letters, not a stop word. */
export function pickSearchWord(headings) {
  const words = headings
    .flatMap((h) => h.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{5,}/g) ?? [])
    .filter((w) => !STOP.has(w))
  return words.sort((a, b) => b.length - a.length || words.indexOf(a) - words.indexOf(b))[0] ?? null
}

/** Internal http(s) links, fragment removed, deduplicated in first-seen order; admin and login excluded. */
export function internalLinks(hrefs, site) {
  const origin = new URL(site).origin
  const out = new Map()
  for (const h of hrefs) {
    let u
    try {
      u = new URL(h, site)
    } catch {
      continue
    }
    if (!/^https?:$/.test(u.protocol) || u.origin !== origin) continue
    if (/\/wp-(admin|login\.php)/.test(u.pathname) || /[?&](replytocom|action=logout)/.test(u.search)) continue
    u.hash = ''
    out.set(u.href, true)
  }
  return [...out.keys()]
}

async function status(url, timeoutMs) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    await r.body?.cancel().catch(() => {})
    return { status: r.status, final: r.url }
  } catch (e) {
    return { status: 0, error: String(e?.cause?.code ?? e?.name ?? e?.message ?? e) }
  }
}

// ── the drawer ──────────────────────────────────────────────────────────────────

/** core/navigation's overlay: the open button, the panel and the close button inside it, per navigation block. */
const CORE_DRAWER = Object.freeze({
  open: '.wp-block-navigation__responsive-container-open',
  panel: '.wp-block-navigation__responsive-container',
  close: '.wp-block-navigation__responsive-container-close',
  core: true
})
const DRAWER_VIEWPORT = Object.freeze({ width: 390, height: 844 })

/**
 * The drawer check asked for: `{ mode, required, selectors, routes }`. `auto` (default) looks for
 * core/navigation's overlay and records a site without one; `core` requires it; the three port
 * selectors (all or none) require the port's drawer; `none` skips the check. Throws on a
 * half-given selector set or an unknown mode.
 */
export function drawerConfig({ drawer = 'auto', open = null, panel = null, close = null, routes = null } = {}) {
  const given = [open, panel, close].filter((v) => v != null)
  if (given.length && given.length !== 3) throw new Error('drawer: --drawer-open, --drawer-panel and --drawer-close go together')
  if (given.some((v) => typeof v !== 'string' || !v.trim())) throw new Error('drawer: a selector is empty')
  if (given.length) return { mode: 'custom', required: true, selectors: { open, panel, close, core: false }, routes }
  if (!['auto', 'core', 'none'].includes(drawer)) throw new Error(`drawer: "${drawer}" is not auto, core or none`)
  return { mode: drawer, required: drawer === 'core', selectors: CORE_DRAWER, routes }
}

/** Runs in the page: whether the dark hook's mark is on the document, and the colours in force. */
function readTheme(hook) {
  const holds = (part) => {
    const [kind, spec = ''] = part.split(':')
    const [k, v = 'dark'] = spec.split('=')
    if (kind === 'attr') return document.documentElement.getAttribute(k) === v
    if (kind === 'class') return document.documentElement.classList.contains(spec)
    if (kind === 'cookie') return document.cookie.split(/;\s*/).includes(`${k}=${v}`)
    if (kind === 'ls') return localStorage.getItem(k) === v
    return false
  }
  const cs = getComputedStyle(document.body)
  const root = getComputedStyle(document.documentElement)
  return {
    hook: hook ? hook.split('+').every(holds) : null,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    background: cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? root.backgroundColor : cs.backgroundColor,
    color: cs.color
  }
}

/**
 * Runs in the page: marks the drawer's parts with `data-tracy-drawer` (open-<n>, panel-<n>) and
 * says what it found — every open button the selector matches that is drawn inside the viewport,
 * with its panel (core: the one inside the same navigation block; a port: the one element the
 * panel selector matches).
 */
function markDrawers(sel) {
  const shown = (el) => {
    if (!el || !el.getClientRects().length) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    const r = el.getBoundingClientRect()
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight
  }
  const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}` : null)
  const opens = [...document.querySelectorAll(sel.open)].filter(shown)
  const panels = sel.core ? null : [...document.querySelectorAll(sel.panel)]
  return opens.map((o, i) => {
    o.setAttribute('data-tracy-drawer', `open-${i}`)
    const panel = sel.core ? o.closest('.wp-block-navigation')?.querySelector(sel.panel) ?? null : panels.length === 1 ? panels[0] : null
    panel?.setAttribute('data-tracy-drawer-panel', `panel-${i}`)
    return { index: i, open: describe(o), label: o.getAttribute('aria-label') ?? o.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), panel: describe(panel), panels: sel.core ? (panel ? 1 : 0) : panels.length, ariaExpanded: o.getAttribute('aria-expanded'), haspopup: o.getAttribute('aria-haspopup') }
  })
}

/** Runs in the page: the state of drawer `i` — its panel shown, the open button's aria, the close button's centre and what is drawn there, focus. */
function drawerState({ i, sel }) {
  const shown = (el) => {
    if (!el || !el.getClientRects().length) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight
  }
  const describe = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : ''}` : null)
  const open = document.querySelector(`[data-tracy-drawer="open-${i}"]`)
  const panel = document.querySelector(`[data-tracy-drawer-panel="panel-${i}"]`)
  const isOpen = Boolean(panel && shown(panel) && (!sel.core || panel.classList.contains('is-menu-open')))
  const closes = (sel.core ? [...(panel?.querySelectorAll(sel.close) ?? [])] : [...document.querySelectorAll(sel.close)]).filter(shown)
  let close = null
  if (closes.length === 1) {
    const c = closes[0]
    const r = c.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const inView = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
    const hit = inView ? document.elementFromPoint(x, y) : null
    close = { x, y, inView, element: describe(c), hit: describe(hit), hitsItself: Boolean(hit && c.contains(hit)) }
  }
  const dialog = panel && (panel.matches('[aria-modal="true"]') || panel.querySelector('[aria-modal="true"]')) ? true : false
  const active = document.activeElement
  let openBox = null
  if (open) {
    const r = open.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    openBox = { x, y, hit: describe(hit), hitsItself: Boolean(hit && open.contains(hit)) }
  }
  return {
    present: Boolean(open),
    isOpen,
    ariaExpanded: open?.getAttribute('aria-expanded') ?? null,
    dialog,
    closes: closes.length,
    close,
    open: openBox,
    focusOnOpen: Boolean(open && active && (active === open || open.contains(active))),
    active: describe(active)
  }
}

/**
 * One pass of the drawer check: route `route` on a 390 px touch screen in `mode` (light / dark —
 * a dark pass carries `darkHook` when one is given, and prefers-color-scheme dark either way).
 * Returns `{ route, mode, theme, drawers: [...], findings: [...] }`; a failure of the browser or of
 * the page is a finding, never a pass.
 */
async function drawerPass(browser, { site, route, mode, cfg, darkHook = null, timeoutMs = 30000 }) {
  const out = { route, mode, theme: null, drawers: [], findings: [] }
  const F = (kind, detail = {}) => out.findings.push({ kind, route, mode, ...detail })
  const context = await browser.newContext({ viewport: DRAWER_VIEWPORT, hasTouch: true, isMobile: true, colorScheme: mode, deviceScaleFactor: 1 })
  try {
    if (mode === 'dark' && darkHook) await context.addInitScript(darkInitScript(darkHook))
    const page = await context.newPage()
    guardEvaluate(page, timeoutMs)
    page.setDefaultTimeout(timeoutMs)
    const res = await page.goto(new URL(route, site).href, { waitUntil: 'load', timeout: timeoutMs })
    await page.waitForTimeout(300)
    if (!res || res.status() >= 400) F('drawer-page', { status: res?.status() ?? 0 })
    out.theme = await page.evaluate(readTheme, darkHook)
    if (darkHook && out.theme.hook !== (mode === 'dark')) F('drawer-mode', { detail: `the ${mode} pass ${mode === 'dark' ? 'did not reach' : 'is in'} the dark mode of ${darkHook}` })
    const found = await page.evaluate(markDrawers, cfg.selectors)
    if (!found.length) {
      if (cfg.required) F('drawer-missing', { detail: `no drawer button (${cfg.selectors.open}) drawn at ${DRAWER_VIEWPORT.width} px` })
      return out
    }
    if (!cfg.selectors.core && (found.length > 1 || found[0].panels !== 1))
      return F('drawer-ambiguous', { detail: `${found.length} open button(s), ${found[0].panels} panel(s) match — name one of each` }), out
    // Waits for the drawer to reach `want` (open / closed), up to 3 s, without acting on it.
    const settle = async (i, want) => {
      let st = null
      for (const until = Date.now() + 3000; ; ) {
        st = await page.evaluate(drawerState, { i, sel: cfg.selectors })
        if (st.isOpen === want || Date.now() > until) return st
        await page.waitForTimeout(100)
      }
    }
    for (const d of found) {
      const rec = { ...d, tapped: [], steps: {} }
      out.drawers.push(rec)
      const where = { drawer: d.open }
      const before = await page.evaluate(drawerState, { i: d.index, sel: cfg.selectors })
      if (before.isOpen) {
        F('drawer-state', { ...where, detail: 'the drawer is already open before the tap' })
        continue
      }
      if (!before.open.hitsItself) F('drawer-open-covered', { ...where, hit: before.open.hit })
      await page.touchscreen.tap(before.open.x, before.open.y)
      rec.tapped.push('open')
      const opened = await settle(d.index, true)
      rec.steps.opened = opened.isOpen
      if (!opened.isOpen) {
        F('drawer-open-failed', { ...where, detail: 'a tap on the button did not show the panel' })
        continue
      }
      // The open state a screen reader hears: aria-expanded on the button, or a dialog button whose panel is modal.
      rec.steps.ariaOpen = opened.ariaExpanded
      if (opened.ariaExpanded !== null ? opened.ariaExpanded !== 'true' : !(d.haspopup === 'dialog' && opened.dialog))
        F('drawer-aria-expanded', { ...where, when: 'open', value: opened.ariaExpanded, detail: opened.ariaExpanded === null ? 'no aria-expanded, and no aria-haspopup="dialog" with a modal panel' : 'not "true" while open' })
      if (opened.closes !== 1) {
        F(opened.closes ? 'drawer-ambiguous' : 'drawer-close-missing', { ...where, detail: `${opened.closes} close button(s) (${cfg.selectors.close}) drawn in the open drawer` })
        continue
      }
      rec.steps.close = opened.close
      if (!opened.close.inView) {
        F('drawer-close-offscreen', { ...where, close: opened.close.element })
        continue
      }
      if (!opened.close.hitsItself) F('drawer-close-covered', { ...where, close: opened.close.element, hit: opened.close.hit })
      // The tap lands where a finger does — the centre — whatever is drawn there.
      await page.touchscreen.tap(opened.close.x, opened.close.y)
      rec.tapped.push('close')
      const closed = await settle(d.index, false)
      rec.steps.closed = !closed.isOpen
      if (closed.isOpen) {
        F('drawer-close-failed', { ...where, detail: `a tap at the close button's centre (${Math.round(opened.close.x)}, ${Math.round(opened.close.y)}) did not close the drawer`, hit: opened.close.hit })
        continue
      }
      rec.steps.ariaClosed = closed.ariaExpanded
      if (closed.ariaExpanded !== null && closed.ariaExpanded !== 'false') F('drawer-aria-expanded', { ...where, when: 'closed', value: closed.ariaExpanded })
      if (opened.ariaExpanded !== null && closed.ariaExpanded === null) F('drawer-aria-expanded', { ...where, when: 'closed', value: null, detail: 'aria-expanded removed on close' })
      rec.steps.focus = closed.active
      if (!closed.focusOnOpen) F('drawer-focus', { ...where, active: closed.active, detail: 'focus did not return to the open button' })
    }
  } catch (e) {
    F('drawer-error', { error: String(e?.message ?? e).split('\n')[0] })
  } finally {
    await context.close().catch(() => {})
  }
  return out
}

/**
 * The drawer check over `routes` (the configured ones, else the first route that answered), light
 * and dark: `{ mode, required, selectors, passes, findings, examined }`. With a dark hook, a route
 * whose two passes draw the same colours did not switch mode: a finding.
 */
export async function runDrawer(browser, { site, routes, cfg, darkHook = null, timeoutMs = 30000 }) {
  const passes = []
  for (const route of routes) for (const mode of ['light', 'dark']) passes.push(await drawerPass(browser, { site, route, mode, cfg, darkHook, timeoutMs }))
  const findings = passes.flatMap((p) => p.findings)
  if (darkHook)
    for (const route of routes) {
      const [l, d] = ['light', 'dark'].map((m) => passes.find((p) => p.route === route && p.mode === m)?.theme)
      if (l && d && l.background === d.background && l.color === d.color) findings.push({ kind: 'drawer-mode', route, mode: 'dark', detail: `light and dark draw the same colours (${l.background} / ${l.color}): the mode did not switch` })
    }
  const examined = {
    passes: passes.length,
    drawers: passes.reduce((n, p) => n + p.drawers.length, 0),
    taps: passes.reduce((n, p) => n + p.drawers.reduce((m, d) => m + d.tapped.length, 0), 0),
    closedByTap: passes.reduce((n, p) => n + p.drawers.filter((d) => d.steps.closed).length, 0),
    modes: [...new Set(passes.filter((p) => p.drawers.some((d) => d.tapped.length)).map((p) => p.mode))]
  }
  if (cfg.required && !routes.length) findings.push({ kind: 'drawer-missing', route: null, mode: null, detail: 'no route answered to look for the drawer on' })
  return { mode: cfg.mode, required: cfg.required, selectors: cfg.selectors, viewport: DRAWER_VIEWPORT, darkHook, passes, findings, examined }
}

/**
 * The whole check. `browser` is an open Playwright browser (withBrowser); a route is a path or
 * `{ path, status }` (status: the answer it must give, e.g. 404). `drawer` is drawerConfig's
 * answer (default: auto). Returns the report; nothing is written here.
 */
export async function runFunctional(browser, { site, routes: routeList, searchPath = '/?s=', searchWord = null, concurrency = 4, timeoutMs = 30000, drawer = drawerConfig(), darkHook = null }) {
  const routes = routeList.map((r) => (typeof r === 'string' ? r : r.path))
  const expected = new Map(routeList.filter((r) => typeof r !== 'string' && r.status != null).map((r) => [r.path, Number(r.status)]))
  const pages = await mapLimit(routes, concurrency, (route) =>
    withPage(browser, { viewport: { width: 1440, height: 900 } }, async (page) => {
      const errors = []
      const url = new URL(route, site).href
      // The document's own failed load is page-status, not a second finding.
      page.on('console', (m) => m.type() === 'error' && !(m.location()?.url === url && /^Failed to load resource/.test(m.text())) && errors.push(m.text().slice(0, 300)))
      page.on('pageerror', (e) => errors.push(`uncaught: ${String(e.message).slice(0, 300)}`))
      let res = null
      try {
        res = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
        await page.waitForTimeout(300)
      } catch (e) {
        return { route, url, status: 0, error: String(e.message).split('\n')[0], errors, seen: null }
      }
      // The route's OWN first answer, beside the one the browser lands on: a route declared 3xx
      // (Joomla's /user-profile → 303 to the login) is judged by its redirect, not by the 200 after it.
      let first = res?.request() ?? null
      while (first?.redirectedFrom()) first = first.redirectedFrom()
      const own = first && first !== res?.request() ? ((await first.response())?.status() ?? null) : null
      return { route, url, status: res?.status() ?? 0, ownStatus: own, errors, seen: await page.evaluate(inspectInPage) }
    })
  )
  const report = { site, at: new Date().toISOString(), routes: [], links: [], search: null, examined: {}, findings: 0, ok: false }
  // A declared redirect's landing page is another route's content: it feeds no content-derived check.
  const isRedirect = (p) => expected.has(p.route) && p.ownStatus != null && p.ownStatus >= 300 && p.ownStatus < 400
  const linkFrom = new Map()
  for (const p of pages) {
    const f = []
    const F = (kind, detail) => f.push({ kind, ...detail })
    const want = expected.get(p.route) ?? null
    const declared = want === null ? {} : { expectedStatus: want }
    if (!p.seen) {
      F('page-status', { status: 0, error: p.error, ...(want === null ? {} : { expected: want }) })
      report.routes.push({ route: p.route, status: 0, ...declared, findings: f, examined: {} })
      continue
    }
    // A declared status is the route's OWN answer, whatever it is; an undeclared route is judged by
    // the page a visitor lands on.
    const status = want !== null && p.ownStatus != null ? p.ownStatus : p.status
    if (want === null ? p.status >= 400 || p.status === 0 : status !== want) F('page-status', { status, ...(want === null ? {} : { expected: want }) })
    // A declared route that answered with a redirect is judged by that answer alone: the page it lands
    // on is another route's content (audited under its own route if it is one), not this route's.
    if (isRedirect(p)) {
      report.routes.push({ route: p.route, status, ...declared, redirect: true, findings: f, examined: {} })
      continue
    }
    for (const e of p.errors) F('console-error', { message: e })
    for (const img of p.seen.images.filter((i) => !i.alt)) F('img-alt', { src: img.src.slice(0, 200) })
    for (const form of p.seen.forms) {
      for (const field of form.unlabelled) F('form-label', { form: form.form, field })
      if (!form.submit) F('form-submit', { form: form.form })
    }
    if (!p.seen.lang.trim()) F('html-lang', {})
    if (p.seen.h1.length !== 1) F('h1-count', { count: p.seen.h1.length, h1: p.seen.h1.slice(0, 3) })
    const links = internalLinks(p.seen.links, site)
    for (const l of links) linkFrom.set(l, [...(linkFrom.get(l) ?? []), p.route])
    report.routes.push({
      route: p.route,
      status,
      ...declared,
      findings: f,
      examined: { images: p.seen.images.length, forms: p.seen.forms.length, fields: p.seen.forms.reduce((n, x) => n + x.fields, 0), links: links.length, h1: p.seen.h1.length, consoleErrors: p.errors.length }
    })
  }
  // Links: each distinct URL once, however many pages carry it.
  const urls = [...linkFrom.keys()]
  const answers = await mapLimit(urls, concurrency, (u) => status(u, timeoutMs))
  urls.forEach((u, i) => {
    const a = answers[i]
    report.links.push({ url: u, ...a, from: linkFrom.get(u) })
    if (!(a.status > 0 && a.status < 400)) {
      for (const route of linkFrom.get(u)) report.routes.find((r) => r.route === route).findings.push({ kind: 'link-broken', url: u, status: a.status, ...(a.error ? { error: a.error } : {}) })
    }
  })
  // Search: a word the site itself uses.
  const word = searchWord ?? pickSearchWord(pages.filter((p) => !isRedirect(p)).flatMap((p) => p.seen?.headings ?? []))
  if (!word) report.search = { ok: false, error: 'no word of five letters or more in the headings of the routes — pass --search-word' }
  else {
    const url = new URL(`${searchPath}${encodeURIComponent(word)}`, site).href
    report.search = await withPage(browser, { viewport: { width: 1440, height: 900 } }, async (page) => {
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
        const found = await page.evaluate((word) => {
          const w = word.toLowerCase()
          // The word counts only outside a phrase that repeats the query ("Results for northwind",
          // "You searched for: northwind"): a wrapper around that heading is no hit on the word.
          const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const echo = new RegExp(`(?:you\\s+searched\\s+for|search(?:ed)?(?:\\s+results?)?\\s*(?:for|:)|results?\\s*(?:for|:))\\s*["'“”‘’«»]?\\s*${esc}`, 'gi')
          const has = (el) => el.innerText.replace(/\s+/g, ' ').replace(echo, ' ').toLowerCase().includes(w)
          // A block that says nothing was found is the empty state, whatever wraps it.
          const empty = /\b(nothing (was )?found|no results?( found)?|no posts found|did not match any|no matches)\b/i
          // Result items as WordPress themes draw them — the block theme's post template, classic
          // articles, and a ported Joomla finder list (`.search-results > .result-item`, JA Kinetic).
          // A result links to what it found; a link back to a search page is not a found item. The
          // heading that repeats the query and a "Nothing found" line inside `.search-results` are
          // no results even when a theme wraps the heading in a link: a heading, the page title,
          // anything holding the page's h1, or a block carrying the empty-state message is never an
          // item, and a wrapper whose only use of the word is the repeated query does not match.
          const found = (a) => {
            try {
              const u = new URL(a.href, location.href)
              return /^https?:$/.test(u.protocol) && !u.searchParams.has('s') && !u.searchParams.has('searchword') && !/\/search\b/.test(u.pathname)
            } catch {
              return false
            }
          }
          const items = [...document.querySelectorAll('.wp-block-post-template > li, .wp-block-post, article, .search-result, .result-item, :not(body)[class*="search-results"] > *, :not(body)[class*="search-results"] li')].filter(
            (el) =>
              !el.closest('header, nav, footer, form') &&
              !el.closest('h1, h2, h3, h4, h5, h6, [role="heading"], .page-title, .wp-block-query-title, .search-title') &&
              !el.querySelector('h1, .page-title, .wp-block-query-title, .search-title') &&
              !el.querySelector('article, .wp-block-post') &&
              !empty.test(el.innerText) &&
              el.getClientRects().length &&
              [...(el.matches('a[href]') ? [el] : []), ...el.querySelectorAll('a[href]')].some(found)
          )
          return { items: items.length, matching: items.filter(has).length, noResults: document.body.classList.contains('search-no-results') }
        }, word)
        return { word, url, status: res?.status() ?? 0, ...found, ok: (res?.status() ?? 0) < 400 && found.matching > 0 && !found.noResults }
      } catch (e) {
        return { word, url, status: 0, error: String(e.message).split('\n')[0], ok: false }
      }
    })
  }
  // The drawer: on the routes asked for, else on the first route that answered.
  if (drawer.mode !== 'none') {
    const first = report.routes.find((r) => !r.redirect && r.status > 0 && r.status < 400)?.route
    report.drawer = await runDrawer(browser, { site, routes: drawer.routes ?? (first ? [first] : []), cfg: drawer, darkHook, timeoutMs })
  }
  report.examined = {
    pages: report.routes.length,
    links: urls.length,
    images: report.routes.reduce((n, r) => n + (r.examined.images ?? 0), 0),
    forms: report.routes.reduce((n, r) => n + (r.examined.forms ?? 0), 0),
    fields: report.routes.reduce((n, r) => n + (r.examined.fields ?? 0), 0),
    searches: report.search?.word ? 1 : 0
  }
  report.findings = report.routes.reduce((n, r) => n + r.findings.length, 0) + (report.search.ok ? 0 : 1) + (report.drawer?.findings.length ?? 0)
  report.ok = report.findings === 0
  return report
}

export function formatMarkdown(r) {
  const e = r.examined
  const lines = [
    `# Functional smoke — ${r.site}`,
    '',
    `${r.ok ? 'PASS' : 'FAIL'} · ${r.findings} finding(s) · examined ${e.pages} pages, ${e.links} internal links, ${e.images} images, ${e.forms} forms (${e.fields} fields), ${e.searches} search`,
    '',
    `Search: ${r.search.word ? `"${r.search.word}" → ${r.search.ok ? `${r.search.matching} matching result(s)` : `FAIL (${r.search.error ?? `HTTP ${r.search.status}, ${r.search.items ?? 0} result item(s), ${r.search.matching ?? 0} with the word${r.search.noResults ? ', search-no-results' : ''}`})`} — ${r.search.url}` : `FAIL — ${r.search.error}`}`,
    ''
  ]
  if (r.drawer) {
    const d = r.drawer
    lines.push(`Drawer (${d.mode}${d.required ? ', required' : ''}, ${d.viewport.width} px touch): ${d.examined.drawers} drawer(s) over ${d.examined.passes} pass(es), ${d.examined.taps} tap(s), ${d.examined.closedByTap} closed by a tap, modes ${d.examined.modes.join(' + ') || 'none'} — ${d.findings.length} finding(s)`)
    for (const f of d.findings) {
      const { kind, ...rest } = f
      lines.push(`- **${kind}** ${Object.entries(rest).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
    }
    lines.push('')
  }
  for (const route of r.routes) {
    lines.push(`## ${route.route} — HTTP ${route.status}${route.expectedStatus ? ` (expected ${route.expectedStatus})` : ''}, ${route.findings.length} finding(s)`)
    for (const f of route.findings) {
      const { kind, ...rest } = f
      lines.push(`- **${kind}** ${Object.entries(rest).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' | ') : v}`).join(' · ')}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  const site = argv[0]
  const routesArg = opt('--routes')
  if (!site || site.startsWith('--') || !routesArg) {
    console.error("usage: functional.mjs <site> --routes /a,/b|<page-map.json> [--out functional.json] [--search-path '/?s='] [--search-word w] [--concurrency 4] [--timeout-ms 30000]")
    process.exit(2)
  }
  const routes = exitOnInputError(() => readRoutes(routesArg)).map((r) => (r.status == null ? r.path : { path: r.path, status: r.status }))
  let drawer
  try {
    for (const n of ['--drawer', '--drawer-open', '--drawer-panel', '--drawer-close', '--drawer-routes', '--dark-hook'])
      if (argv.includes(n) && (opt(n) == null || opt(n).startsWith('--'))) throw new Error(`${n} needs a value`)
    drawer = drawerConfig({
      drawer: opt('--drawer', 'auto'),
      open: opt('--drawer-open'),
      panel: opt('--drawer-panel'),
      close: opt('--drawer-close'),
      routes: opt('--drawer-routes') ? opt('--drawer-routes').split(',').map((s) => s.trim()).filter(Boolean) : null
    })
    if (drawer.routes && !drawer.routes.length) throw new Error('--drawer-routes names no route')
  } catch (e) {
    console.error(`functional: ${e.message}`)
    process.exit(2)
  }
  const report = await withBrowser((browser) =>
    runFunctional(browser, { site, routes, searchPath: opt('--search-path', '/?s='), searchWord: opt('--search-word'), concurrency: concurrencyFrom(argv), timeoutMs: Number(opt('--timeout-ms', 30000)), drawer, darkHook: opt('--dark-hook') })
  )
  const out = opt('--out', 'functional.json')
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(out.replace(/\.json$/, '') + '.md', formatMarkdown(report))
  console.log(formatMarkdown(report))
  process.exitCode = report.ok ? 0 : 1
}
