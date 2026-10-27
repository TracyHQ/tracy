// Visual QA primitives ported from the JoomlArt T4 skill's review method into this kit, with the
// same conclusions that method paid for: a computed-style probe that passes over a visually broken
// render is a FAIL; a scanner that examined nothing proves nothing; dark is verified by reading dark,
// never by assuming it mirrors light; a closed panel is a blind spot until it is opened with a real
// pointer. Everything here is a page-side measurement or a pure comparison — no expectations are
// copied from the site under test into the report.
//
// Theme handling follows `template.config.json → qa.theme` (selector + attribute + values, and the
// storageKey the page reads before first paint). `values[theme] === null` means "attribute absent".
import { readFileSync, existsSync } from 'node:fs'
import { browserIdentity, launchBrowser } from './qa-browser.mjs'
export { browserIdentity, launchBrowser }

// ───────────────────────── colours ─────────────────────────
export function parseColor(str) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  let m
  if ((m = s.match(/^#([0-9a-f]{3})$/i)))
    return {
      r: parseInt(m[1][0] + m[1][0], 16),
      g: parseInt(m[1][1] + m[1][1], 16),
      b: parseInt(m[1][2] + m[1][2], 16),
      a: 1
    }
  if ((m = s.match(/^#([0-9a-f]{6})$/i)))
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: 1
    }
  if ((m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)))
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : Number(m[4]) }
  if ((m = s.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/)))
    return {
      r: +m[1],
      g: +m[2],
      b: +m[3],
      a: m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4])
    }
  return null
}
export const isColorLike = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,6}$|rgba?\()/i.test(v.trim())
export const luma = ({ r, g, b }) => r * 0.299 + g * 0.587 + b * 0.114
const lin = (v) => {
  v /= 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export const relLuminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a, b) => {
  const l1 = relLuminance(a),
    l2 = relLuminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// ───────────────────────── snapshots and the two-sided diff ─────────────────────────
// Astro's font pipeline renames a family to `<name>-<hash>`; the hash is not part of the design.
export const firstFamily = (v) =>
  String(v)
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/-[0-9a-f]{12,}$/i, '')
    .toLowerCase()
/**
 * Diff two computed-style snapshots `{ selector: { property: value } }`. Colours compare per channel
 * within `hexTolerance` (default 8/255 — antialiasing and webfont rendering shift a couple of levels,
 * a wrong token does not); alpha is exact. `px` values compare within `pxTolerance` (default 0.1:
 * sub-pixel rounding only). `font-family` compares the first family. Anything else compares as a
 * whitespace-normalised string. A selector or property present on one side only is a mismatch —
 * a missing measurement must never read as agreement.
 */
export function diffSnapshots(a, b, opts = {}) {
  const hexTolerance = opts.hexTolerance ?? 8,
    pxTolerance = opts.pxTolerance ?? 0.1
  if (!Number.isFinite(hexTolerance) || hexTolerance < 0 || hexTolerance > 255)
    throw new Error('hexTolerance must be between 0 and 255')
  for (const [label, snap] of [
    ['A', a],
    ['B', b]
  ]) {
    if (!snap || Array.isArray(snap) || typeof snap !== 'object' || !Object.keys(snap).length)
      throw new Error(`snapshot ${label} must contain selectors`)
    for (const [selector, props] of Object.entries(snap)) {
      if (!props || typeof props !== 'object' || Array.isArray(props) || !Object.keys(props).length)
        throw new Error(`snapshot ${label}: ${selector} has no properties`)
      if (Object.values(props).some((v) => typeof v !== 'string' || !v.trim()))
        throw new Error(`snapshot ${label}: ${selector} properties must be nonempty strings`)
    }
  }
  for (const [selector, properties] of Object.entries(opts.required ?? {}))
    for (const property of properties)
      if (!(property in (a[selector] ?? {})) || !(property in (b[selector] ?? {})))
        throw new Error(`required measurement missing: ${selector}.${property}`)
  const mismatches = []
  let checked = 0
  const norm = (v) => String(v).trim().replace(/\s+/g, ' ')
  for (const selector of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const pa = a[selector],
      pb = b[selector]
    if (!pa || !pb) {
      for (const property of Object.keys(pa ?? pb)) {
        checked++
        mismatches.push({
          selector,
          property,
          a: pa?.[property],
          b: pb?.[property],
          reason: 'missing on one side'
        })
      }
      continue
    }
    for (const property of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      checked++
      const va = pa[property],
        vb = pb[property]
      if (va === undefined || vb === undefined) {
        mismatches.push({ selector, property, a: va, b: vb, reason: 'missing on one side' })
        continue
      }
      if (/font-family/i.test(property)) {
        if (firstFamily(va) !== firstFamily(vb))
          mismatches.push({ selector, property, a: va, b: vb, reason: 'family' })
        continue
      }
      if (isColorLike(va) || isColorLike(vb)) {
        const ca = parseColor(va),
          cb = parseColor(vb)
        if (!ca || !cb) {
          if (norm(va) !== norm(vb))
            mismatches.push({ selector, property, a: va, b: vb, reason: 'unparsed colour' })
          continue
        }
        const delta = Math.max(Math.abs(ca.r - cb.r), Math.abs(ca.g - cb.g), Math.abs(ca.b - cb.b))
        if (delta > hexTolerance || Math.abs(ca.a - cb.a) > 0.001)
          mismatches.push({ selector, property, a: va, b: vb, reason: `colour delta ${delta}` })
        continue
      }
      const pxA = /^-?[\d.]+px$/.test(norm(va)),
        pxB = /^-?[\d.]+px$/.test(norm(vb))
      if (pxA && pxB) {
        const d = Math.abs(parseFloat(va) - parseFloat(vb))
        if (d > pxTolerance)
          mismatches.push({ selector, property, a: va, b: vb, reason: `px delta ${+d.toFixed(2)}` })
        continue
      }
      if (norm(va) !== norm(vb)) mismatches.push({ selector, property, a: va, b: vb, reason: 'value' })
    }
  }
  return { mismatches, checked }
}
/** The logical elements a two-sided diff reads by default, as in the T4 per-view snapshot set. */
export const SNAPSHOT_PROPERTIES = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'padding-top',
  'padding-bottom',
  'border-top-width',
  'border-top-color',
  'border-radius'
]

// ───────────────────────── theme ─────────────────────────
export function loadConfig(file = 'template.config.json') {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
}
export function themeOf(config) {
  const t = config?.qa?.theme
  if (!t?.selector || !t.attribute || !t.values)
    throw new Error(
      'template.config.json needs qa.theme {selector, attribute, values{light,dark}, storageKey?}'
    )
  return t
}
/** Seed the persisted choice before first paint so the page itself resolves the theme (the real path). */
export async function seedTheme(context, theme, mode) {
  if (!theme.storageKey) return
  await context.addInitScript(
    ({ key, value }) => {
      try {
        value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
      } catch {}
    },
    { key: theme.storageKey, value: theme.values[mode] ?? null }
  )
}
/** Force the hook on an already-loaded page (flip-and-read for scanners). Read in the NEXT call. */
export async function forceTheme(page, theme, mode) {
  await page.evaluate(
    ({ selector, attribute, value }) => {
      const el = document.querySelector(selector)
      if (!el) return
      value === null ? el.removeAttribute(attribute) : el.setAttribute(attribute, value)
    },
    { selector: theme.selector, attribute: theme.attribute, value: theme.values[mode] ?? null }
  )
  await page.waitForTimeout(120) // let transitions settle: flip-and-read returns stale transitioned values otherwise
}
export async function readTheme(page, theme) {
  const v = await page.evaluate(
    ({ selector, attribute }) => document.querySelector(selector)?.getAttribute(attribute) ?? null,
    theme
  )
  return Object.entries(theme.values).find(([, value]) => (value ?? null) === v)?.[0] ?? 'unknown'
}

// ───────────────────────── navigation ─────────────────────────
export async function navigate(page, url, { expectedStatus = 200, identity } = {}) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  let status = response?.status()
  if (!response) {
    // A same-document fragment navigation has no HTTP response. Verify the actual document
    // independently rather than treating a missing response as either success or a broken page.
    const requested = new URL(url)
    const current = new URL(page.url())
    requested.hash = ''
    current.hash = ''
    if (current.href !== requested.href)
      throw new Error(`navigation without a response landed at ${page.url()}, expected ${url}`)
    const documentResponse = await page.request.get(requested.href)
    try {
      if (new URL(documentResponse.url()).origin !== requested.origin)
        throw new Error(`cross-origin redirect to ${documentResponse.url()}`)
      status = documentResponse.status()
    } finally {
      await documentResponse.dispose()
    }
  }
  if (status !== expectedStatus) throw new Error(`HTTP ${status}, expected ${expectedStatus}: ${url}`)
  if (new URL(page.url()).origin !== new URL(url).origin)
    throw new Error(`cross-origin redirect to ${page.url()}`)
  if (
    identity &&
    !(await page
      .locator(identity)
      .first()
      .isVisible()
      .catch(() => false))
  )
    throw new Error(`identity selector not visible: ${identity}`)
  await settle(page)
  return status
}
/** Fonts ready, lazy content scrolled into existence, back to top. */
export async function settle(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight
    for (let y = 0; y < h; y += 500) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(250)
}
export const examinedCount = (page) =>
  page.evaluate(() => (document.body ? document.body.querySelectorAll('*').length : 0))
/** pass / needs-review / fail, with the "looked at nothing" guard the T4 review method insists on. */
export function scanStatus({ examined, findings = [], failure = false, minExamined = 20 }) {
  if (failure || examined < minExamined) return 'fail'
  return findings.length ? 'needs-review' : 'pass'
}

// ───────────────────────── page-side measurements ─────────────────────────
// Each is a plain function passed to page.evaluate; keep them self-contained (no closures).
/** Rules → per-element computed styles; coverage groups → elements no rule classified. */
export function captureDesign(request) {
  const visible = (e) =>
    e.getClientRects().length > 0 &&
    getComputedStyle(e).visibility !== 'hidden' &&
    getComputedStyle(e).display !== 'none'
  const pathOf = (e) => {
    const parts = []
    while (e && e.nodeType === 1 && e !== document.body) {
      let n = 1,
        s = e
      while ((s = s.previousElementSibling)) n++
      const id = e.id ? `#${e.id}` : ''
      parts.unshift(`${e.tagName.toLowerCase()}${id}:nth-child(${n})`)
      e = e.parentElement
    }
    return parts.join(' > ')
  }
  const css = (p) => (p.startsWith('--') ? p : p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()))
  const measured = new Map()
  const rules = (request.rules ?? []).map((rule) => ({
    id: rule.id,
    selector: rule.selector,
    elements: Array.from(document.querySelectorAll(rule.selector))
      .filter(visible)
      .map((e) => {
        const style = getComputedStyle(e)
        const set = measured.get(e) || new Set()
        rule.properties.forEach((p) => set.add(p))
        measured.set(e, set)
        const r = e.getBoundingClientRect()
        return {
          path: pathOf(e),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          styles: Object.fromEntries(rule.properties.map((p) => [p, style.getPropertyValue(css(p))]))
        }
      })
  }))
  const unclassified = []
  let coverageCount = 0
  for (const group of request.coverage ?? [])
    for (const e of document.querySelectorAll(group.selector)) {
      if (!visible(e)) continue
      if (/^(IMG|VIDEO|CANVAS|SVG)$/i.test(e.tagName) && (e.complete === undefined || e.naturalWidth > 0))
        continue // its own pixels cover the background
      coverageCount++
      const missing = group.properties.filter((p) => !measured.get(e)?.has(p) && !e.__vqa?.has(p))
      if (missing.length)
        unclassified.push({
          group: group.selector,
          element: pathOf(e),
          text: (e.textContent || '').trim().slice(0, 40),
          properties: missing
        })
    }
  const root = getComputedStyle(document.documentElement)
  return {
    url: location.href,
    width: innerWidth,
    height: innerHeight,
    fontsReady: document.fonts.status === 'loaded',
    // 🔒 `identityMatches` WAS REMOVED HERE, and the removal is the point. It was a
    // `querySelectorAll` plus a visibility filter on EVERY axis of EVERY page, and nothing in any
    // of these packages ever read the number. What it looks like it asserts is asserted for real
    // twice over: `navigate()` waits on the same selector and throws when it is not visible, and
    // `qa-browser.mjs` checks a match count directly. Found in the business template first (all 48
    // pages of its contract declare an identity); this copy went on paying for it.
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    tokens: Object.fromEntries((request.tokens ?? []).map((k) => [k, root.getPropertyValue(k).trim()])),
    rules,
    coverageCount,
    unclassified
  }
}
/** First VISIBLE match per selector → the flat snapshot shape diffSnapshots reads. */
/** The element snapshotOf would read for one spec (css string, {css}, or {text, tag}); page-side. */
export function findOneSpec({ spec }) {
  const visible = (e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'
  }
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim()
  if (typeof spec === 'string' || spec.css)
    return [...document.querySelectorAll(typeof spec === 'string' ? spec : spec.css)].find(visible) ?? null
  if (!spec.text) return null
  const want = norm(spec.text)
  const pool = [
    ...document.querySelectorAll(
      spec.tag
        ? `${spec.tag}, h1, h2, h3, h4, p, a, button, span, div, li, label`
        : 'h1, h2, h3, h4, p, a, button, span, div, li, label'
    )
  ].filter(visible)
  const score = (x) => {
    const t = norm(x.innerText || x.textContent)
    if (!t) return -1
    const exact = t === want,
      starts = want.length > 24 && t.startsWith(want)
    if (!exact && !starts) return -1
    return (
      (exact ? 1000 : 500) +
      (spec.tag && x.tagName.toLowerCase() === spec.tag.toLowerCase() ? 100 : 0) -
      Math.min(99, Math.floor(t.length / 20))
    )
  }
  return (
    pool
      .map((x) => [score(x), x])
      .filter(([sc]) => sc >= 0)
      .sort((a, b) => b[0] - a[0])[0]?.[1] ?? null
  )
}

export function snapshotOf({ selectors, properties }) {
  const visible = (e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'
  }
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim()
  const out = {}
  for (const [key, spec] of Object.entries(selectors)) {
    let e = null
    if (typeof spec === 'string' || spec.css)
      e = [...document.querySelectorAll(typeof spec === 'string' ? spec : spec.css)].find(visible)
    else if (spec.text) {
      // Locate by the source's own literal text (the content contract's `expected`), so a canvas
      // export without classes can still be measured against the site. innerText renders <br> as a
      // break, exact matches win, the site's tag is preferred, and the smallest match is the element
      // itself rather than an ancestor whose text merely starts the same way.
      const want = norm(spec.text)
      const pool = [
        ...document.querySelectorAll(
          spec.tag
            ? `${spec.tag}, h1, h2, h3, h4, p, a, button, span, div, li, label`
            : 'h1, h2, h3, h4, p, a, button, span, div, li, label'
        )
      ].filter(visible)
      const score = (x) => {
        const t = norm(x.innerText || x.textContent)
        if (!t) return -1
        const exact = t === want,
          starts = want.length > 24 && t.startsWith(want)
        if (!exact && !starts) return -1
        return (
          (exact ? 1000 : 500) +
          (spec.tag && x.tagName.toLowerCase() === spec.tag.toLowerCase() ? 100 : 0) -
          Math.min(99, Math.floor(t.length / 20))
        )
      }
      e =
        pool
          .map((x) => [score(x), x])
          .filter(([sc]) => sc >= 0)
          .sort((a, b) => b[0] - a[0])[0]?.[1] ?? null
    }
    if (!e) continue
    e.__vqa = e.__vqa || new Set()
    properties.forEach((p) => e.__vqa.add(p))
    const cs = getComputedStyle(e)
    out[key] = Object.fromEntries(properties.map((p) => [p, cs.getPropertyValue(p) || '(none)']))
  }
  return out
}
/** Elements with a near-white background (dark page): un-themed cards/panels/badges. */
export function scanWhiteSurfaces() {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const visible = (e) => {
    if (e.hidden) return false
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }
  const out = [],
    seen = new Set()
  for (const e of document.body.querySelectorAll('*')) {
    if (!visible(e)) continue
    const c = parse(getComputedStyle(e).backgroundColor)
    if (!c || c[3] < 0.5) continue
    if (c[0] > 225 && c[1] > 222 && c[2] > 216) {
      const k = (e.className && e.className.toString ? e.className.toString() : e.tagName).slice(0, 60)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        kind: 'white-surface',
        element: `${e.tagName.toLowerCase()}.${k}`,
        value: `rgb(${c[0]},${c[1]},${c[2]})`
      })
      if (out.length > 30) break
    }
  }
  return out
}
/** Near-black text sitting on a dark effective background. */
export function scanDarkText() {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const L = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
  const visible = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }
  const out = [],
    seen = new Set()
  for (const e of document.body.querySelectorAll('*')) {
    const txt = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim()
    if (!txt || txt.length < 2 || !visible(e)) continue
    const fg = parse(getComputedStyle(e).color)
    if (!fg || L(fg) > 80) continue
    let n = e,
      bg = null
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c[3] >= 0.55) {
        bg = c
        break
      }
      n = n.parentElement
    }
    if (!bg || L(bg) > 110) continue
    const k =
      e.tagName.toLowerCase() + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      kind: 'dark-on-dark',
      element: k,
      text: txt.slice(0, 24),
      fg: `rgb(${fg.slice(0, 3)})`,
      bg: `rgb(${bg.slice(0, 3)})`
    })
    if (out.length > 30) break
  }
  return out
}
/** WCAG contrast of every visible text node against its effective background. */
export function scanContrast(min) {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const lin = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const ratio = (a, b) => {
    const l1 = L(a),
      l2 = L(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const effBg = (e) => {
    let n = e
    while (n) {
      const cs = getComputedStyle(n)
      const c = parse(cs.backgroundColor)
      if (c && c[3] >= 0.55) return c
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
      n = n.parentElement
    }
    return [255, 255, 255, 1]
  }
  const out = [],
    seen = new Set()
  for (const e of document.body.querySelectorAll('*')) {
    const txt = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim()
    if (!txt || txt.length < 2) continue
    const cs = getComputedStyle(e)
    if (
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      parseFloat(cs.opacity) < 0.4 ||
      (!e.offsetParent && cs.position !== 'fixed')
    )
      continue
    const rc = e.getBoundingClientRect()
    if (rc.width < 4 || rc.height < 6) continue
    const fg = parse(cs.color)
    if (!fg || fg[3] < 0.4) continue
    const bg = effBg(e)
    if (!bg) continue
    const cr = ratio(fg, bg)
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 600)
    if (cr < min) {
      const k =
        e.tagName.toLowerCase() +
        '.' +
        (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        kind: 'contrast',
        element: k,
        text: txt.slice(0, 24),
        ratio: +cr.toFixed(2),
        need: large ? 3 : 4.5,
        fg: `rgb(${fg.slice(0, 3)})`,
        bg: `rgb(${bg.slice(0, 3)})`
      })
    }
  }
  return out.sort((a, b) => a.ratio - b.ratio).slice(0, 30)
}
/** Borders too bright for a dark page. */
export function scanBrightBorders(minLuma, accent = []) {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const L = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114
  const visible = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }
  const out = [],
    seen = new Set()
  for (const e of document.body.querySelectorAll('*')) {
    if (!visible(e)) continue
    const cs = getComputedStyle(e)
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs['border' + side + 'Width'])
      if (!w) continue
      const c = parse(cs['border' + side + 'Color'])
      if (!c || c[3] < 0.5 || L(c) < minLuma) continue
      if (cs['border' + side + 'Color'] === cs.color) continue // an underline/rule drawn in the text colour is the text, not a border leak
      // An accent/brand border is a deliberate mark in both themes (underlines, quote rules, active tabs):
      // dark mirrors light, so only a border that is BRIGHTER here than in light is a leak.
      if (accent.includes(cs['border' + side + 'Color'])) continue
      const key =
        e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40) + '|' + side
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        kind: 'bright-border',
        element: key.split('|')[0].toLowerCase(),
        side,
        width: `${w}px`,
        value: cs['border' + side + 'Color']
      })
      if (out.length > 40) return out
    }
  }
  return out
}
/** Two visible 1px lines from different elements within 2px → reads as a fat/doubled seam. */
export function scanSeams() {
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  const L = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114
  const vis = (e) => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 40 && r.height > 8
  }
  const lines = []
  const lbl = (e) =>
    e.tagName.toLowerCase() + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40)
  for (const e of document.body.querySelectorAll('*')) {
    if (!vis(e)) continue
    const cs = getComputedStyle(e),
      r = e.getBoundingClientRect()
    const add = (axis, pos, from, to, what, sample = pos) =>
      lines.push({
        axis,
        element: e,
        sample,
        pos: Math.round(pos + (axis === 'h' ? scrollY : scrollX)),
        from: Math.round(from),
        to: Math.round(to),
        label: lbl(e) + ':' + what
      })
    for (const [side, axis, pos, f, t] of [
      ['Top', 'h', r.top, r.left, r.right],
      ['Bottom', 'h', r.bottom, r.left, r.right],
      ['Left', 'v', r.left, r.top, r.bottom],
      ['Right', 'v', r.right, r.top, r.bottom]
    ]) {
      const w = parseFloat(cs['border' + side + 'Width'])
      if (!w) continue
      const c = parse(cs['border' + side + 'Color'])
      if (c && c[3] > 0.4 && L(c) >= 35) add(axis, pos, f, t, 'b' + side[0], pos + (side === 'Top' || side === 'Left' ? 0.5 : -0.5))
    }
    if (/inset 0(px)? 0(px)? 0(px)? 1px/.test(cs.boxShadow) || / 0px 0px 0px 1px inset/.test(cs.boxShadow)) {
      const c = parse(cs.boxShadow)
      if (c && L(c) >= 35) {
        add('h', r.top, r.left, r.right, 'ringT', r.top + 0.5)
        add('h', r.bottom, r.left, r.right, 'ringB', r.bottom - 0.5)
      }
    }
  }
  // Only discard a line when an unrelated opaque surface demonstrably covers every sample.
  // Offscreen samples cannot prove occlusion: full-page scans must still retain those seams.
  const occluded = (line, from, to) => [0.25, 0.5, 0.75].every((fraction) => {
    const along = from + (to - from) * fraction
    const x = line.axis === 'h' ? along : line.sample
    const y = line.axis === 'h' ? line.sample : along
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
    const top = document.elementFromPoint(x, y)
    if (!top || line.element.contains(top) || top.contains(line.element)) return false
    for (let cover = top; cover && cover !== document.body; cover = cover.parentElement) {
      if (cover.contains(line.element)) return false
      const rect = cover.getBoundingClientRect()
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue
      const style = getComputedStyle(cover)
      // An opaque border can cover the line even when its surface is translucent.
      const opaque = (color) => parse(color)?.[3] === 1
      const covered = opaque(style.backgroundColor) || [
        ['Top', y - rect.top], ['Bottom', rect.bottom - y],
        ['Left', x - rect.left], ['Right', rect.right - x]
      ].some(([side, distance]) => distance < parseFloat(style['border' + side + 'Width']) &&
        opaque(style['border' + side + 'Color']))
      if (!covered) continue
      let fullOpacity = true
      for (let ancestor = cover; ancestor; ancestor = ancestor.parentElement)
        if (Number(getComputedStyle(ancestor).opacity) !== 1) fullOpacity = false
      if (fullOpacity) return true
    }
    return false
  })
  const out = new Map()
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j]
      if (a.axis !== b.axis || Math.abs(a.pos - b.pos) > 2 || a.pos === 0 || a.label === b.label) continue
      if (Math.min(a.to, b.to) - Math.max(a.from, b.from) < 60) continue
      const overlapFrom = Math.max(a.from, b.from), overlapTo = Math.min(a.to, b.to)
      if (occluded(a, overlapFrom, overlapTo) || occluded(b, overlapFrom, overlapTo)) continue
      const key = `${a.axis}@${a.pos}:${a.label}+${b.label}`
      if (!out.has(key))
        out.set(key, {
          kind: 'doubled-seam',
          orientation: a.axis === 'h' ? 'horizontal' : 'vertical',
          position: a.pos,
          elements: [a.label, b.label]
        })
      if (out.size > 25) break
    }
  return [...out.values()]
}
/**
 * Image census. The site side counts decoded <img> (naturalWidth > 0) inside `scope`; the source
 * side also accepts custom slot elements (a Claude Design export renders pictures through
 * <image-slot src> with a shadow root, so a naive <img> count reads zero there). Placeholders are the
 * site's "no picture yet" element: every visible one is a picture the page promised and lost.
 */
export function imageCensus({ scope = 'main', slot = null, placeholder = null } = {}) {
  const root = document.querySelector(scope) ?? document.body
  const visible = (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 20
  const decoded = (img) => img.naturalWidth > 0 && visible(img)
  const imgs = [...root.querySelectorAll('img')].filter(decoded)
  const slots = slot ? [...root.querySelectorAll(slot)].filter(visible) : []
  const slotDecoded = slots.filter((e) => {
    const img = e.shadowRoot?.querySelector('img') ?? e.querySelector('img')
    return img ? img.naturalWidth > 0 : Boolean(e.getAttribute('src'))
  })
  const placeholders = placeholder
    ? [...root.querySelectorAll(placeholder)].filter(visible).map((e) => ({
        text: (e.textContent || '').trim().slice(0, 60),
        width: Math.round(e.getBoundingClientRect().width),
        height: Math.round(e.getBoundingClientRect().height)
      }))
    : []
  return {
    images: imgs.length + slotDecoded.length,
    slots: slots.map((e) => e.id || e.getAttribute('src') || e.tagName.toLowerCase()),
    placeholders
  }
}
/** Tag interactive elements so hover/rect probes can address them; returns their ids and rest rects. */
// One round trip per side of the hover check: (optionally) scroll the element into view, wait until
// nothing that can move its box is still animating, then read the box and the scroll offset it was
// read at -- or say why it never settled. Both sides use it: the REST side with `scrollIntoView`,
// the HOVERED side without.
//
// Why one round trip. This used to be three Playwright calls per element on the rest side alone --
// `locator.scrollIntoViewIfNeeded()` (which waits for the box to hold still over two animation
// frames, then scrolls over CDP), an `evaluate` for the rect, and after the hover an `evaluate` to
// settle and another for the rect. Measured 15/09 on a template built from this kit (320 elements,
// 3 pages x 2 widths x 4 reps, medians): the scroll call alone was 72 ms of a 195 ms element, the
// four rect/settle evaluates 1-2 ms each; this shape is 85 ms an element with the SAME rest rect,
// hovered rect and scroll offset on all 320 (the in-page `scrollIntoViewIfNeeded()` and Playwright's
// CDP scroll both centre-if-needed, so `hover()`'s own scroll is a no-op). The alternative of measuring
// every rest rect in one batch up front was rejected on correctness, not speed: a rect read before
// any scrolling and one read after `hover()` scrolled are in different viewport frames for in-flow
// elements and the SAME frame for sticky/fixed ones, so no single coordinate space makes a batch
// comparable, and anything that settles on the page between the batch and the hovers (a late
// image, a font swap) moves every later rect. Keeping the two reads ~100 ms apart at one scroll
// offset is what makes `hover-jump` mean "the box moved while the pointer sat on it".
//
// Why the box has to be settled. The hover check compares rest with hovered at a 1 px threshold, so
// both have to be the SETTLED box. A fixed 60 ms sample was not: a 4 px `translateY` behind
// `transition: transform 400ms` reads under 1 px at 60 ms and the page was called clean (measured
// 15/09 on a template built from this kit: caught 1/8 at 150 ms, 0/8 at 300 ms).
// `reducedMotion: 'reduce'` on the context does not help -- it flips the media query, it does not
// stop transitions, and a `prefers-reduced-motion` rule of the kind these templates ship (the base
// template has exactly one, `scroll-behavior: auto`) does not touch them either. Settling AFTER the
// scroll matters on the rest side too: a header that shrinks on scroll starts its transition at the
// scroll, and a box read
// before it ends is a hover jump that never happened.
//
// What is waited on: every running animation (Web Animations API, which includes CSS transitions and
// CSS animations) on the element, its descendants (`subtree: true` -- a hover rule often animates a
// child, and a child growing in size grows an auto-sized parent) and its ancestors (a transform or
// margin animation above moves everything below). Excluded on purpose: animations on a scroll/view
// timeline (their phase is a function of scroll position, which does not change once the element
// is in view) and animations that are not running (paused, finished, idle).
//
// Bounded, two ways. An animation with no end on the element or an ancestor
// (`animation-iteration-count: infinite` -- a pulse, a wiggle on hover) returns `endless-animation`
// at once: the box has no settled state, waiting would only burn the whole bound to learn that.
// Everything else waits for `finished` and re-collects, because a transition can start another
// (JS toggling a class in `transitionend`); the loop stops at `boundMs` with `unsettled`, naming
// what was still running. An endless animation on a DESCENDANT only (a spinning icon inside a
// button) is not waited on and does not block: a transform or opacity loop on a child never changes
// the parent's box, and blocking on it would report every button with a spinner as unmeasurable.
// Either bound outcome is the caller's to surface as a finding -- it must NOT fall back to measuring
// mid-motion, which is what the 60 ms sample did.
//
// `still`: after nothing animates, also require the box to read the same on two consecutive
// animation frames. That is the check Playwright's `scrollIntoViewIfNeeded()` made before every
// rest read, and the only thing it caught that the animation wait does not: motion driven by
// script frame by frame (a `requestAnimationFrame` marquee, a drag library mid-throw), which never
// shows up in `getAnimations()`. It costs two frames (~60 ms in this headless renderer), which is
// why it is NOT on by default: the caller asks for it only when rest and hovered differ, to tell a
// box that jumped from a box that was moving anyway -- the former reads the same twice and is
// reported with its settled numbers, the latter keeps changing until the bound and is reported as
// `unsettled`, the outcome the Playwright check gave it (after its own 1.5 s), not a hover jump.
export function settledRect([id, boundMs, opts]) {
  const { scrollIntoView = false, still = false } = opts ?? {}
  const el = document.querySelector(`[data-vqa="${id}"]`)
  if (!el) return { settled: false, reason: 'untagged' }
  if (scrollIntoView) {
    // No box at all (display:none since it was tagged -- a bar that dismisses on the first pointer
    // move -- or detached): nothing to scroll to or to hover. Say so now rather than let `hover()`
    // spend its whole timeout retrying a node without a layout box.
    if (!el.getClientRects().length) return { settled: false, reason: 'not-in-view' }
    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded()
    else el.scrollIntoView({ block: 'center', inline: 'center' })
  }
  const read = () => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  const done = (rect) => ({ settled: true, rect, scroll: { x: window.scrollX, y: window.scrollY } })
  const chain = new Set()
  for (let n = el; n; n = n.parentElement) chain.add(n)
  const endless = (a) => a.effect?.getComputedTiming().endTime === Infinity
  const describe = (a) => {
    const t = a.effect?.target
    const what = a.animationName ?? a.transitionProperty ?? a.id ?? ''
    return `${a.constructor.name}${what ? ':' + what : ''}@${t?.tagName?.toLowerCase() ?? '?'}${t === el ? '' : t && chain.has(t) ? '(ancestor)' : '(descendant)'}`
  }
  const running = () => {
    const seen = new Set(el.getAnimations({ subtree: true }))
    for (let n = el.parentElement; n; n = n.parentElement) for (const a of n.getAnimations()) seen.add(a)
    return [...seen].filter(
      (a) =>
        (a.playState === 'running' || a.playState === 'pending') &&
        (!a.timeline || a.timeline instanceof DocumentTimeline)
    )
  }
  const deadline = performance.now() + boundMs
  const holdsStill = () =>
    new Promise((resolve) => {
      let last = null
      const frame = () => {
        const r = read()
        if (last && same(r, last)) return resolve(done(r))
        if (performance.now() > deadline)
          return resolve({
            settled: false,
            reason: 'unsettled',
            animations: ['none running: the box moved between two frames']
          })
        last = r
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
  const step = () => {
    const live = running()
    const forever = live.filter((a) => endless(a) && chain.has(a.effect?.target))
    if (forever.length)
      return { settled: false, reason: 'endless-animation', animations: forever.map(describe) }
    const finite = live.filter((a) => !endless(a))
    if (!finite.length) return still ? holdsStill() : done(read())
    const left = deadline - performance.now()
    if (left <= 0) return { settled: false, reason: 'unsettled', animations: finite.map(describe) }
    return Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, left))
    ]).then(step)
  }
  return step()
}

export function siteSnapshotOf({ selectors, properties }) {
  const out = {}
  for (const [key, selector] of Object.entries(selectors)) {
    // ABSENCE IS AN ANSWER HERE -- a pair missing on both sides is a role the page does not have --
    // so a selector this reader cannot resolve must NOT be reported as a missing element. Only the
    // shape the contract actually uses is accepted: one CSS selector, optionally followed by one
    // `nth=` with a non-negative index. Everything else Playwright can express resolves differently
    // or not at all here: `nth=-1` (the LAST match), a multi-segment chain (`section >> a` narrows
    // to the anchor; this would return the section), a second `nth=`, the engine prefixes `text=`
    // `css=` `xpath=`, the pseudo-classes `:visible` `:has-text()` `:nth-match()`, and a valid CSS
    // attribute value that happens to contain `>>`. Each is reported as `__unsupported` and becomes
    // a finding in the caller -- the loud failure a contract error deserves, instead of a quiet
    // "not on the page".
    //
    // Open shadow roots are the one case the SHAPE cannot reveal: Playwright pierces them and
    // `querySelectorAll` does not, so a selector that used to resolve would now read as an absent
    // element -- an answer, and the wrong one. That case is caught on the miss path below instead,
    // by asking the open roots the same question before absence is believed.
    const raw = String(selector)
    const parts = raw.split('>>')
    const css = parts[0].trim()
    const nth = parts.length > 1 ? /^\s*nth=(\d+)\s*$/.exec(parts[1]) : null
    const shapeOk = parts.length === 1 || (parts.length === 2 && nth)
    const enginePrefix = /^\s*(text|css|xpath|id|data-testid|react|vue)\s*=/.test(css)
    const pwPseudo = /:visible\b|:has-text\(|:text\(|:text-is\(|:nth-match\(|:light\(/.test(css)
    if (!shapeOk || enginePrefix || pwPseudo) {
      out[key] = { __unsupported: raw }
      continue
    }
    let all
    try {
      all = document.querySelectorAll(css)
    } catch (err) {
      out[key] = { __unsupported: `${raw} (${err.message})` }
      continue
    }
    const el = nth ? all[Number(nth[1])] : all[0]
    if (!el) {
      // Absence is only an answer when the light DOM is the whole question. Playwright pierces open
      // shadow roots and `querySelectorAll` does not, so a selector that used to resolve would now
      // read as an absent element -- an answer, and the wrong one. Ask the open roots, depth-first,
      // before believing absence.
      //
      // This is a DETECTOR, not a second selector engine, and what it cannot see is worth naming
      // rather than discovering later. ⚠ ONE OF THE TWO STILL PRODUCES SILENCE, so read this
      // before trusting an absent pair:
      //   · a selector whose left-hand side is an ancestor OUTSIDE the host -- `main h2`, where
      //     `main` wraps the host and the `h2` is inside its shadow root -- is resolved by
      //     Playwright and matched by NEITHER the light-DOM read nor this probe, which repeats the
      //     whole selector inside the root and finds nothing. That pair reads as absent. A contract
      //     naming a parity target across a shadow boundary needs the host-relative selector;
      //   · `nth=` is ignored here, so the probe answers "a match exists somewhere in an open
      //     root", not "the requested index exists". That direction is safe: it reports a contract
      //     error the reader can act on rather than swallowing an element.
      const roots = []
      const collect = (node) => {
        for (const e of node.querySelectorAll('*')) {
          if (!e.shadowRoot) continue
          roots.push(e.shadowRoot)
          collect(e.shadowRoot)
        }
      }
      collect(document)
      if (roots.some((r) => r.querySelector(css)))
        out[key] = { __unsupported: `${raw} (matches inside an open shadow root)` }
      continue
    }
    // Match the source reader's visibility boundary, including display-none ancestors.
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    if (rect.width <= 1 || rect.height <= 1 || style.display === 'none' || style.visibility === 'hidden')
      continue
    el.__vqa = el.__vqa || new Set()
    properties.forEach((p) => el.__vqa.add(p))
    const cs = getComputedStyle(el)
    out[key] = {
      __tag: el.tagName.toLowerCase(),
      ...Object.fromEntries(properties.map((p) => [p, cs.getPropertyValue(p) || '(none)']))
    }
  }
  return out
}

export function tagInteractive(selectors) {
  const out = [],
    seen = new Set()
  selectors.forEach((sel, si) => {
    let list
    try {
      list = document.querySelectorAll(sel)
    } catch {
      return
    }
    let i = 0
    for (const e of list) {
      const r = e.getBoundingClientRect(),
        cs = getComputedStyle(e)
      if (
        r.width < 6 ||
        r.height < 6 ||
        cs.visibility === 'hidden' ||
        cs.display === 'none' ||
        (!e.offsetParent && cs.position !== 'fixed')
      )
        continue
      // 🔒 AN ELEMENT ALREADY TAGGED KEEPS ITS FIRST ID. `data-vqa` is a single attribute, so
      // re-tagging under a later selector OVERWRITES it and strands the earlier id: that id is
      // still in `out`, but no node carries it any more. The caller then waits the full
      // `scrollIntoViewIfNeeded` timeout on a selector that can never resolve, catches, and
      // `continue`s in silence.
      //
      // The overlap is not exotic, it is the default: `DEFAULT_INTERACTIVE` lists both `nav a` and
      // `header a`, and a `<nav>` inside a `<header>` is ordinary markup. Measured 14/09 on this
      // template: 1.5s lost per stranded id per axis, ~12s per page, and `scans.hover` reporting
      // 13 elements examined when one of them never was -- a coverage number that overstates what
      // the reviewer is signing for.
      //
      // Skipping does not narrow the sample. `seen` keys on `sel|className` and `i` caps at 3, so
      // the intent is "up to three distinct class signatures per selector"; an element already
      // scheduled for measurement does not need a second slot to be measured.
      if (e.hasAttribute('data-vqa')) continue
      const sig = sel + '|' + (e.className || '').toString().trim()
      if (seen.has(sig)) continue
      seen.add(sig)
      const id = `v${si}-${i++}`
      e.setAttribute('data-vqa', id)
      out.push({
        id,
        selector: sel,
        text: (e.textContent || '').trim().slice(0, 24),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height }
      })
      if (i >= 3) break
    }
  })
  return out
}
// Only the rect leaves this function, and only `x/y/width/height` of it are read -- the hover check
// compares the box before and after the pointer arrives. It used to also return the element's colour
// and the first opaque background found by walking its ancestors; no caller ever read either, and
// the walk costs a `getComputedStyle` per ancestor, twice per element, on every axis.
export function measureTagged(id) {
  const e = document.querySelector(`[data-vqa="${id}"]`)
  if (!e) return null
  const cs = getComputedStyle(e),
    r = e.getBoundingClientRect()
  let n = e,
    bg = null
  while (n) {
    const c = getComputedStyle(n).backgroundColor
    if (c && !c.startsWith('rgba(0, 0, 0, 0')) {
      bg = c
      break
    }
    n = n.parentElement
  }
  return {
    color: cs.color,
    bg: bg || 'rgb(255, 255, 255)',
    rect: { x: r.x, y: r.y, width: r.width, height: r.height }
  }
}
export const DEFAULT_INTERACTIVE = [
  'nav a',
  'header a',
  'a.btn, .btn, button.btn',
  'button',
  'main a',
  'footer a',
  '[role=tab]',
  '.pagination a',
  'input[type=submit]'
]

// ───────────────────────── page hash: what could change this page's pixels ─────────────────────────
// A page's evidence from an earlier run may stand in for a new measurement only when nothing that
// reaches its pixels changed: the global render inputs (styles, layouts, shared components — declared
// in visual.renderInputs), the page's own view and everything it imports, the seed entries it shows
// (pages[].render.collections), the acceptance criteria applied to it, and the measuring tools
// themselves. The hash is over CONTENT, never mtimes, so a checkout on another machine agrees.
import { createHash } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
const sha = (s) => createHash('sha256').update(s).digest('hex')
function listFiles(root, entry) {
  // `dir/**` = every file below dir; anything else = that one file (absent files hash as absent).
  const rel = entry.replace(/\/\*\*$/, '')
  const abs = path.join(root, rel)
  if (!existsSync(abs)) return []
  if (!entry.endsWith('/**')) return statSync(abs).isFile() ? [rel] : []
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(root, path.join(d, e.name))]
      )
  return walk(abs)
}
const IMPORT_RE =
  /(?:^|\n)\s*(?:import\s[^'"]*?from\s*|import\s*|export\s[^'"]*?from\s*)['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]/g
const EXTS = ['', '.astro', '.ts', '.tsx', '.mjs', '.js', '.css', '/index.ts', '/index.tsx', '/index.mjs']
/** tsconfig `paths` aliases (`@/*` → `./src/*`), the one indirection Astro templates use. */
function aliasesOf(root) {
  try {
    const paths =
      JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).compilerOptions?.paths ?? {}
    return Object.entries(paths)
      .filter(([k, v]) => k.endsWith('/*') && Array.isArray(v) && v[0]?.endsWith('/*'))
      .map(([k, v]) => [k.slice(0, -1), v[0].replace(/^\.\//, '').slice(0, -1)])
  } catch {
    return [['@/', 'src/']]
  }
}
/** The view file plus every local file it imports, transitively (astro/ts/tsx/js/css). */
export function importClosure(root, file) {
  const seen = new Set()
  const aliases = aliasesOf(root)
  const visit = (rel) => {
    if (seen.has(rel)) return
    const abs = path.join(root, rel)
    if (!existsSync(abs) || !statSync(abs).isFile()) return
    seen.add(rel)
    const src = readFileSync(abs, 'utf8')
    for (const m of src.matchAll(IMPORT_RE)) {
      const alias = aliases.find(([k]) => m[1].startsWith(k))
      const base = alias
        ? path.join(alias[1], m[1].slice(alias[0].length))
        : path.join(path.dirname(rel), m[1])
      const hit = EXTS.map((e) => base + e).find(
        (p) => existsSync(path.join(root, p)) && statSync(path.join(root, p)).isFile()
      )
      if (hit) visit(path.normalize(hit))
    }
  }
  visit(path.normalize(file))
  return [...seen].sort()
}
// Inputs every page's pixels depend on. Components are NOT here by default: a page depends on the
// components its view imports (importClosure), so a change to one component invalidates the pages that
// render it, not all of them. A contract that wants the conservative behaviour lists 'src/components/**'
// in visual.renderInputs itself.
export const DEFAULT_RENDER_INPUTS = [
  'src/styles/**',
  'src/layouts/**',
  'src/lib/**',
  'astro.config.mjs',
  'template.config.json',
  'package.json',
  'public/**'
]
export const TOOL_INPUTS = [
  'visual-qa.mjs',
  'visual-lib.mjs',
  'visual-scan.mjs',
  'mega-hover.mjs',
  'qa-browser.mjs'
]
/** Hash of everything that can reach one page's pixels; `parts` says what went in, for the report. */
export function pageHash(contract, spec, { root = process.cwd(), toolsDir } = {}) {
  const h = createHash('sha256')
  const parts = { files: 0, imports: 0, collections: [], seedBytes: 0 }
  const add = (label, text) => h.update(`${label}\n${text}\n`)
  const files = new Set()
  for (const entry of contract.visual?.renderInputs ?? DEFAULT_RENDER_INPUTS)
    for (const f of listFiles(root, entry)) files.add(f)
  if (spec.render?.view) for (const f of importClosure(root, spec.render.view)) files.add(f)
  parts.imports = spec.render?.view ? importClosure(root, spec.render.view).length : 0
  for (const f of [...files].sort()) {
    add(`file ${f}`, sha(readFileSync(path.join(root, f))))
    parts.files++
  }
  // Seed slices: the collections this page renders (+ settings and menus, which every page shows).
  const seedFile = path.join(root, 'seed', 'seed.json')
  if (existsSync(seedFile)) {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'))
    const cols = [...new Set(spec.render?.collections ?? Object.keys(seed.content ?? {}))].sort()
    parts.collections = cols
    for (const c of cols) {
      const slice = JSON.stringify(seed.content?.[c] ?? null)
      parts.seedBytes += slice.length
      add(`seed ${c}`, sha(slice))
    }
    add('seed settings+menus', sha(JSON.stringify([seed.settings ?? null, seed.menus ?? null])))
    const map = path.join(root, 'seed', 'media-map.json')
    if (existsSync(map)) {
      const items = JSON.parse(readFileSync(map, 'utf8')).items ?? []
      const mine = items
        .filter((it) => it.targets?.some((t) => cols.includes(t.collection)))
        .map((it) => [it.file, it.targets.filter((t) => cols.includes(t.collection))])
      add('media targets', sha(JSON.stringify(mine)))
      for (const [f] of mine) {
        const p = path.join(root, 'seed', 'media', f)
        if (existsSync(p)) add(`media ${f}`, sha(readFileSync(p)))
      }
    }
  }
  // The criteria applied to this page, and the instruments.
  const { pages: _p, ...rest } = contract
  add('contract.design', sha(JSON.stringify(rest.design ?? null)))
  // designSystem is the off-system scanner's whole input (scanOffSystem: palette, type scale, radii,
  // check scope). It is a top-level key, not under `design`, so the line above never saw it: measured
  // 2026-09-15, tightening `type.sizes` between two runs left every page hash unchanged and `--reuse`
  // copied the earlier PASS for a page that now violated the system. `contract.fonts` is NOT here on
  // purpose — visual-qa.mjs never reads it; only fast-gate.mjs (to pick cases) and qa-browser.mjs do.
  add('contract.designSystem', sha(JSON.stringify(rest.designSystem ?? null)))
  add('contract.interactions', sha(JSON.stringify(rest.interactions ?? null)))
  add('contract.variants', sha(JSON.stringify(rest.variants ?? null)))
  // what gets shot and for whom (visual.shots, stages, layouts): a changed picture list is changed evidence
  add('contract.visual', sha(JSON.stringify([rest.visual ?? null, rest.layouts ?? null])))
  add('page spec', sha(JSON.stringify(spec)))
  // the reference this page is compared against: its recorded hash in source.files — a re-exported
  // frame or a re-rendered source is a different reference, so the page's evidence is stale
  const refs = (spec.source ?? []).map(
    (f) => `${f}=${(contract.source?.files ?? []).find((x) => x.path === f)?.sha256 ?? 'unknown'}`
  )
  add('page source', sha(refs.join('\n')))
  const tdir = toolsDir ?? path.dirname(new URL(import.meta.url).pathname)
  for (const t of TOOL_INPUTS) {
    const p = path.join(tdir, t)
    if (existsSync(p)) add(`tool ${t}`, sha(readFileSync(p)))
  }
  return { hash: `sha256:${h.digest('hex')}`, parts }
}

// ───────────────────────── design system: values outside the declared sets ─────────────────────────
// Page-side. Every visible element in `check.scope` must draw its colours, text size and radius from
// the contract's designSystem (generated from tokens.css); a value outside the set is `off-system`.
// Elements a rule or pair already measured (`__vqa`) are skipped — headings with clamp() sizes are the
// rules' business. One finding per distinct (property, value), with the first element and a count, so a
// stray grey used 300 times is one line, not 300.
export function scanOffSystem(ds, theme) {
  const norm = (v) => {
    const m = (v || '').match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    if (!m) return v
    const a = m[4] === undefined ? 1 : Number(m[4])
    // the canvas writes `.996` where it means opaque; ≥ .99 is opaque here too
    return a >= 0.99 ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`
  }
  const palette = new Set([...(ds.colors?.[theme] ?? []), ...(ds.colorsAlways ?? [])])
  const sizes = (ds.type?.sizes ?? []).map(parseFloat)
  const ranges = ds.type?.ranges ?? []
  const tol = ds.type?.tolerance ?? 0.5
  const radii = new Set(ds.radius ?? [])
  const visible = (e) => {
    if (e.hidden) return false
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const name = (e) => {
    const cls =
      e.className && e.className.toString
        ? e.className.toString().trim().split(/\s+/).slice(0, 3).join('.')
        : ''
    return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}`.slice(0, 80)
  }
  const hasText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const found = new Map()
  const hit = (property, value, e) => {
    const k = `${property}|${value}`
    if (!found.has(k)) found.set(k, { kind: 'off-system', property, value, element: name(e), count: 0 })
    found.get(k).count++
  }
  const scope = document.querySelectorAll(ds.check?.scope ?? 'header, main, footer')
  for (const root of scope)
    for (const e of [root, ...root.querySelectorAll('*')]) {
      if (e.__vqa || !visible(e)) continue
      const cs = getComputedStyle(e)
      for (const p of ds.check?.colors ?? []) {
        if (p.startsWith('border') && parseFloat(cs.getPropertyValue(p.replace('-color', '-width'))) === 0)
          continue
        const v = norm(cs.getPropertyValue(p))
        if (v && !palette.has(v)) hit(p, v, e)
      }
      if (hasText(e))
        for (const p of ds.check?.type ?? []) {
          const v = parseFloat(cs.getPropertyValue(p))
          const ok =
            sizes.some((s) => Math.abs(s - v) <= tol) ||
            ranges.some(([lo, hi]) => v >= lo - tol && v <= hi + tol)
          if (Number.isFinite(v) && !ok) hit(p, `${v}px`, e)
        }
      const bg = norm(cs.backgroundColor)
      const bordered = ['top', 'right', 'bottom', 'left'].some(
        (s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0
      )
      if (bg !== 'rgba(0, 0, 0, 0)' || bordered)
        for (const p of ds.check?.radius ?? []) {
          const v = cs.getPropertyValue(p)
          // `full` in the set accepts circles/pills: 50%, or a radius no smaller than half the box.
          const r = e.getBoundingClientRect()
          const full = v.endsWith('%')
            ? parseFloat(v) >= 50
            : parseFloat(v) >= Math.min(r.width, r.height) / 2
          if (v && !radii.has(v) && !(radii.has('full') && full)) hit(p, v, e)
        }
    }
  return [...found.values()].slice(0, 60)
}

/**
 * Is the SOURCE render finished, or is it still showing empty picture frames?
 *
 * A design source is often a folder of plain HTML with ordinary `<img>` elements. Measured
 * 2026-09-17 on the base template this kit generates: 183 images across the 25 documents its
 * contract cites, 23 of them carrying `loading="lazy"`. A full-page screenshot does not scroll the page, so at the
 * moment the runner shoots it the images below the fold have never been asked for. Measured
 * 2026-09-17 on that template's `pages/company/about.html`, three loads at the point the runner shoots
 * (`networkidle` -> `fonts.ready` -> 200 ms): 5, 6 and 6 of 11 images undecoded -- non-deterministic,
 * which is why two runs of the same page disagree. One scroll pass through the document, then the
 * same read: 0 of 11, all three times.
 *
 * Two harms, not one. The saved artifact shows empty frames where the design has photos; and
 * `imageCensus` counts only `naturalWidth > 0`, so the SOURCE side under-reports what the page
 * promises and `image-missing` cannot fire for the pictures the site is really missing.
 *
 * `attribute` is optional, because a picture says it is ready in one of two ways. An export whose
 * picture component writes a marker onto itself (`image-slot[src]` + `data-filled`) is asked for
 * the marker AND for the decoded image behind its open shadow root; a plain `<img>` is asked only
 * whether it decoded. Pass `attribute: null` for the second.
 *
 * Two things this must NOT do:
 *   · pass because it examined nothing. Zero matches is reported as `total: 0` and the caller
 *     decides; a selector that matches nothing is not evidence that a page is ready.
 *   · trust a marker alone. A component sets it the moment it assigns `img.src` and an error
 *     handler does not take it back, so a broken picture carries it too.
 */
export function sourcePending({ selector, attribute = null }) {
  // A picture the page deliberately does not show is not a picture that failed to render, and a
  // lazy one can never decode: the browser does not request `loading="lazy"` behind `display:none`,
  // so no amount of scrolling or reloading will change it. Measured 2026-09-17 on
  // `pages/resources/home-variation.html`, the source `en-landing` cites: light gives `pending: 0`,
  // dark gives `pending: 6` -- exactly the six `.tracy-clients__light-image` logos that
  // `site-repairs.css` sets to `display: none` under `html[data-theme=dark]`. Without this filter
  // every dark axis of that page carries a `source-not-rendered` finding that names working images.
  // The test is participation in LAYOUT, not intersection with the viewport: a picture below the
  // fold is legitimately off-screen and must still be examined.
  const laidOut = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'
  const all = [...document.querySelectorAll(selector)].filter(
    (e) => (e.getAttribute('src') ?? '') !== '' && laidOut(e)
  )
  const describe = (e) => e.id || e.getAttribute('src') || '(no id)'
  const unmarked = attribute ? all.filter((e) => !e.hasAttribute(attribute)) : []
  const undecoded = all.filter((e) => {
    // A marker the element does not carry yet means it has not upgraded -- unknown, not broken;
    // `unmarked` owns that case, and an upgraded slot with no <img> is the component's own shape.
    if (attribute && !e.hasAttribute(attribute)) return false
    // The element named by `selector` is either the picture itself (`img`) or a wrapper that holds
    // one -- in its open shadow root, or in its light children. Ask whichever it is; a wrapper that
    // holds none is the component's own shape, not a broken picture.
    const img = e.tagName === 'IMG' ? e : (e.shadowRoot?.querySelector('img') ?? e.querySelector('img'))
    return img ? !(img.complete && img.naturalWidth > 0) : false
  })
  return {
    total: all.length,
    pending: unmarked.length + undecoded.length,
    unmarked: unmarked.length,
    undecoded: undecoded.length,
    examples: [...unmarked, ...undecoded].slice(0, 6).map(describe)
  }
}

// The full-page screenshot is cut into tiles here instead of asking the browser for one clip per
// tile. Seven extra renders per page cost ~6.4s and, worse, each clip is its own render: nothing
// guaranteed a tile was a crop of the picture printed beside it. Decoding once and cropping makes
// that identity hold: `tests/visual.test.mjs` F15 pins the tiles a run writes and the tiles a
// `--reuse` run points at, so a tile that stopped being a crop of its picture shows up there.
//
// `pngjs` does the codec work. A hand-rolled decoder lived here first and was correct — it kept
// each row's original filter bytes so pixel identity held by construction — but it was 120 lines
// of image format this repo would then own, and it accepted only the exact shape Chromium emits
// today. A dev-only dependency beside `playwright` is the cheaper thing to maintain.
import { PNG } from 'pngjs'

/** A PNG buffer decoded once, so every tile is a crop of the same pixels. */
export function pngRows(buf) {
  return PNG.sync.read(buf)
}

/** One horizontal strip of `png`, re-encoded. Bounds are checked: a silent short tile reads as a
 *  short page to whoever opens it. */
export function cutPng(png, { y, height, width = png.width }) {
  if (y < 0 || height < 1 || y + height > png.height || width < 1 || width > png.width)
    throw new Error(`cutPng: ${width}x${height} at y=${y} is outside ${png.width}x${png.height}`)
  const tile = new PNG({ width, height })
  PNG.bitblt(png, tile, 0, y, width, height, 0, 0)
  return PNG.sync.write(tile)
}
