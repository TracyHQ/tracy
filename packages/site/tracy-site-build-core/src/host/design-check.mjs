/**
 * The adherence check — a page measured against the design system its site wears (ADR 0023).
 *
 * BY VALUE, IN THE BROWSER, NEVER BY `var()` NAME. On Joomla T4 the tokens are compiled into
 * `template.css` and no variable name survives at runtime; on EmDash the page is Tailwind. What every
 * platform has in common is a computed style on every element, so the probe (`STYLE_PROBE`, run in
 * the page by `design-probe.mjs` at the build's `shot` stage and by `tracy_design_check` later)
 * collects `color`, `background-color`, the border colours that have a width, and `font-family`,
 * aggregated by value; `judge` measures each value against the palette frozen in
 * `docs/agents/design.json` (`design-record.mjs`).
 *
 * WARNINGS, NEVER A REFUSAL (ADR 0022 §2, `LENGTH_RATIO` is the precedent): the report names what
 * drifted and the nearest token; nothing here stops a write or a build. Three bands, from the skill's
 * own `inline-colors.mjs`: a max channel difference ≤ 16 is ON the palette, ≤ 48 is NEAR it (the
 * hand-typed `#ddd` beside `--border`), anything else is OFF. Transparent and translucent values are
 * not judged — they are composited, the palette has no say in them. A font is on when its first
 * family is a token's first family, or a generic (`sans-serif`, `system-ui`…) that some token stack
 * ends in. `allow` (from `design.json.allow`) silences a property/value pair a person accepted.
 */

/** A few named colours a theme's CSS still writes by name. @type {Record<string, string>} */
const NAMED = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'rgba(0,0,0,0)',
  ivory: '#fffff0',
  beige: '#f5f5dc',
  snow: '#fffafa',
  linen: '#faf0e6',
  whitesmoke: '#f5f5f5',
  gainsboro: '#dcdcdc',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  navy: '#000080'
}

/**
 * A CSS colour as `{r, g, b, a}`, or null when the value is not a literal colour. The same parser
 * `scripts/lib/od-dark-rules.mjs` uses (copied: `scripts/` ships in no image).
 * @param {string} tok
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseColor(tok) {
  tok = String(tok ?? '')
    .trim()
    .toLowerCase()
  if (NAMED[tok]) tok = NAMED[tok]
  let m
  if ((m = /^#([0-9a-f]{3,8})$/.exec(tok))) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a
    }
  }
  if ((m = /^rgba?\(([^)]+)\)$/.exec(tok))) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (p.length < 3 || p.some(Number.isNaN)) return null
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
  }
  if ((m = /^hsla?\(([^)]+)\)$/.exec(tok))) {
    const p = m[1]
      .replace(/%/g, '')
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (p.length < 3 || p.some(Number.isNaN)) return null
    const [h, s, l] = [p[0] / 360, p[1] / 100, p[2] / 100]
    const f = (/** @type {number} */ n) => {
      const k = (n + h * 12) % 12
      const a = s * Math.min(l, 1 - l)
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: p[3] ?? 1 }
  }
  return null
}

/** Where a site folder keeps the latest report, beside the build's picture. */
export const REPORT_FILE = 'docs/agents/build/design-check.json'

/** The bands, as max channel difference: on the palette, near it, off it. */
export const BANDS = Object.freeze({ on: 16, near: 48 })

/** Generic families a token stack may end in; a page using one of them is not off the system. */
const GENERIC = new Set([
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
  'cursive',
  'fantasy'
])

/**
 * The first family of a `font-family` stack, unquoted.
 *
 * Astro's font API (every Tracy EmDash template) serves a family under its own name plus a hash —
 * the token says `"Archivo"`, the page computes `Archivo-d7009d10e90b12ba` — so the hash comes off
 * before the two are compared. Without it every font on an EmDash page read as off-system
 * (measured 29/09/2026: Tracy Business 240 of 240, SaaS 341 of 341).
 * @param {unknown} stack
 */
const firstFamily = (stack) =>
  String(stack ?? '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/-[0-9a-f]{12,}$/, '')

/**
 * The ruler: every colour token as rgb, every font token as its first family (plus the generics its
 * stack ends in).
 * @param {Record<string, string> | null | undefined} tokens `design.json.tokens`
 * @returns {{ colors: { token: string, rgb: { r: number, g: number, b: number } }[], fonts: { token: string, family: string, generics: string[] }[] }}
 */
export function paletteOf(tokens) {
  /** @type {{ token: string, rgb: { r: number, g: number, b: number } }[]} */
  const colors = []
  /** @type {{ token: string, family: string, generics: string[] }[]} */
  const fonts = []
  for (const [token, value] of Object.entries(tokens ?? {})) {
    if (token.startsWith('--font')) {
      const family = firstFamily(value)
      if (family === '') continue
      const generics = String(value)
        .split(',')
        .map((f) =>
          f
            .trim()
            .replace(/^["']|["']$/g, '')
            .toLowerCase()
        )
        .filter((f) => GENERIC.has(f))
      fonts.push({ token, family, generics })
      continue
    }
    const c = parseColor(value)
    if (c && c.a === 1)
      colors.push({ token, rgb: { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) } })
  }
  return { colors, fonts }
}

/**
 * Runs IN THE PAGE (`Runtime.evaluate`, returnByValue): the computed colours and fonts of every
 * visible element, aggregated by value. Skips what is never the site's own look: scripts, styles,
 * SVG internals, iframes, WordPress's admin bar, and anything under `[data-tracy-design-ignore]`.
 * `where` keeps up to three short selectors per value so a person can find one. Bounded at 400
 * samples — a page with more distinct values has told its story by then.
 */
export const STYLE_PROBE = `(() => {
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|TEMPLATE|LINK|META|SVG|PATH|G|USE|DEFS|CIRCLE|RECT|LINE|POLYGON|POLYLINE)$/
  const inSkipped = (el) => typeof el.closest === 'function' && !!(el.closest('svg') || el.closest('#wpadminbar') || el.closest('.wp-block-social-link') || el.closest('[data-tracy-design-ignore]'))
  const name = (el) => { const t = String(el.tagName || '').toLowerCase(); if (el.id) return t + '#' + el.id; const c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''; return c ? t + '.' + c : t }
  const map = new Map(); let seen = 0
  const add = (prop, value, el) => { if (!value) return; const k = prop + '|' + value; let e = map.get(k); if (!e) { e = { prop, value, count: 0, where: [] }; map.set(k, e) } e.count += 1; if (e.where.length < 3) { const n = name(el); if (!e.where.includes(n)) e.where.push(n) } }
  const all = document.body ? document.body.querySelectorAll('*') : []
  for (const el of all) {
    if (SKIP.test(String(el.tagName || ''))) continue
    if (inSkipped(el)) continue
    let rects = []; try { rects = el.getClientRects() } catch {}
    if (!rects || rects.length === 0) continue
    const cs = getComputedStyle(el); if (!cs) continue
    seen += 1
    add('color', cs.color, el)
    add('background-color', cs.backgroundColor, el)
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const w = parseFloat(cs['border' + side + 'Width'] || '0'); if (w > 0) add('border-' + side.toLowerCase() + '-color', cs['border' + side + 'Color'], el) }
    add('font-family', cs.fontFamily, el)
    if (map.size > 400) break
  }
  return { href: String(document.location && document.location.href || ''), seen, samples: [...map.values()] }
})()`

/** Max channel difference between two rgb values. @param {{ r: number, g: number, b: number }} a @param {{ r: number, g: number, b: number }} b */
const distance = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))

/**
 * @typedef {{ prop: string, value: string, band: 'near' | 'off', nearest: { token: string, distance: number }, count: number, where: string[] }} ColorOffender
 * @typedef {{ family: string, count: number, where: string[] }} FontOffender
 * @typedef {{ schemaVersion: string, design?: { id: string | null, source: string }, url: string, checkedAt: string, elements: { seen: number, judged: number }, colors: { on: number, near: number, off: number, offenders: ColorOffender[] }, fonts: { on: number, off: number, offenders: FontOffender[] }, score: number | null }} Report
 */

/**
 * The report for one probe against one palette.
 * @param {{ href?: string, seen?: number, samples?: { prop: string, value: string, count: number, where?: string[] }[] }} probe
 * @param {ReturnType<typeof paletteOf>} palette
 * @param {{ allow?: { prop: string, value: string }[], design?: { id: string | null, source: string }, now?: () => Date }} [opts]
 * @returns {Report}
 */
export function judge(probe, palette, opts = {}) {
  const allow = new Set((opts.allow ?? []).map((a) => `${a.prop}|${a.value}`))
  /** @type {Report['colors']} */
  const colors = { on: 0, near: 0, off: 0, offenders: [] }
  /** @type {Report['fonts']} */
  const fonts = { on: 0, off: 0, offenders: [] }
  let judged = 0
  const familyOn = (/** @type {string} */ family) => {
    const f = family.toLowerCase()
    if (palette.fonts.some((t) => t.family.toLowerCase() === f)) return true
    return GENERIC.has(f) && palette.fonts.some((t) => t.generics.includes(f))
  }
  for (const s of probe.samples ?? []) {
    const count = Number.isFinite(s.count) && s.count > 0 ? Math.floor(s.count) : 1
    const where = Array.isArray(s.where) ? s.where.slice(0, 3).map(String) : []
    if (allow.has(`${s.prop}|${s.value}`)) continue
    if (s.prop === 'font-family') {
      const family = firstFamily(s.value)
      if (family === '') continue
      judged += count
      if (familyOn(family)) fonts.on += count
      else {
        fonts.off += count
        fonts.offenders.push({ family, count, where })
      }
      continue
    }
    const c = parseColor(s.value)
    if (!c || c.a < 1) continue
    if (palette.colors.length === 0) continue
    judged += count
    /** @type {{ token: string, distance: number } | null} */
    let nearest = null
    for (const t of palette.colors) {
      const d = distance(c, t.rgb)
      if (nearest === null || d < nearest.distance) nearest = { token: t.token, distance: d }
    }
    if (nearest === null) continue
    const near = nearest
    /** @type {'on' | 'near' | 'off'} */
    const band = near.distance <= BANDS.on ? 'on' : near.distance <= BANDS.near ? 'near' : 'off'
    colors[band] += count
    if (band !== 'on')
      colors.offenders.push({ prop: s.prop, value: s.value, band, nearest: near, count, where })
  }
  colors.offenders.sort((a, b) => (a.band === b.band ? b.count - a.count : a.band === 'off' ? -1 : 1))
  fonts.offenders.sort((a, b) => b.count - a.count)
  const on = colors.on + fonts.on
  // Floored, not rounded: a page with anything off must never read 100 (measured 29/09 on a
  // Joomla site — 2 colours off in 1,688 rounded up to a perfect score).
  const score = judged === 0 ? null : Math.floor((100 * on) / judged)
  return {
    schemaVersion: 'tracy-design-check/v1',
    ...(opts.design ? { design: opts.design } : {}),
    url: String(probe.href ?? ''),
    checkedAt: (opts.now ?? (() => new Date()))().toISOString(),
    elements: { seen: Number(probe.seen ?? 0), judged },
    colors,
    fonts,
    score
  }
}

/**
 * The one sentence a report carries as `next`, or null when nothing drifted: the worst few by
 * name, each with the token to write instead. The shape `lengthAdviceNext` set (ADR 0022).
 * @param {Report} report
 * @returns {string | null}
 */
export function checkNext(report) {
  const offs = report.colors.offenders.filter((o) => o.band === 'off')
  const nears = report.colors.offenders.filter((o) => o.band === 'near')
  const fonts = report.fonts.offenders
  if (offs.length === 0 && nears.length === 0 && fonts.length === 0) return null
  const at = (/** @type {string[]} */ where) =>
    where.length > 0 ? ` on ${where.slice(0, 2).join(', ')}` : ''
  const parts = []
  for (const o of offs.slice(0, 3))
    parts.push(
      `${o.value}${at(o.where)} is off the palette — write var(${o.nearest.token}) if that is the colour meant`
    )
  for (const o of nears.slice(0, 2))
    parts.push(
      `${o.value}${at(o.where)} is near var(${o.nearest.token}) (${o.nearest.distance} off) — use the token`
    )
  for (const f of fonts.slice(0, 2))
    parts.push(`the font ${f.family}${at(f.where)} is not in the system — use a --font-* token`)
  const more = offs.length + nears.length + fonts.length - parts.length
  return `Drifted from the design system: ${parts.join('; ')}${more > 0 ? `; and ${more} more` : ''}. Fix what is real, then check again.`
}

/** At most this many drift warnings ride on one write's answer; the rest are counted (`more`). */
export const DRIFT_WARNINGS_MAX = 8

/** @param {{ prop: string, value: string }} o */
const colorKey = (o) => `color|${o.prop}|${o.value}`
/** @param {{ family: string }} f */
const fontKey = (f) => `font|${f.family.toLowerCase()}`

/**
 * What a WRITE is told about the page it changed (ADR 0023, "Addendum 30/09"): the findings of one
 * `judge` report, reduced to what that write may have caused. Warnings only — the caller puts them
 * on an `ok: true` answer, never on a refusal (ADR 0022).
 *
 * 🔒 AGAINST THE LAST MEASURE OF THE SAME PAGE, WHEN THERE IS ONE. A site carries drift the agent
 * did not write — the seeder's `#ddd`, 93 near-blues on a T4 page (measured 29/09 on `dfinj1`) — and
 * repeating it after every look write sends the agent chasing it instead of the customer's errand.
 * So with a `before` report of the same page, a finding is a warning only when it is NEW (its
 * property/value or family was not there) or GREW (more elements carry it); the rest is counted as
 * `existing`. Near colours are warned only then: a new near value is the agent's own typo of a
 * token, while old ones are rounding in the theme.
 *
 * 🔒 AND AGAINST THE FIRST MEASURE OF THE PAGE (`origin`): what it wore before any write. The last
 * measure alone read a REVERT as drift — measured 30/09 on df2jbiz1, the heading made pink and then
 * put back to the template's own #F0865A was reported as a new off colour, since the pink measure
 * had none. So a finding is new only when it is new (or grew) against EVERY baseline there is.
 *
 * Without either there is no way to tell, so every OFF colour and foreign font is a warning and
 * near ones are left out (93 of them would bury the one that matters).
 * @param {Report} report - the page just after the write.
 * @param {Report | null} before - the last report of the same page, or null.
 * @param {Report | null} [origin] - the first report of the same page, before any write, or null.
 */
export function driftFindings(report, before, origin = null) {
  const bases = [before, origin].filter((r) => r !== null && typeof r === 'object')
  const baseline = bases.length > 0
  /** @type {Map<string, number>[]} */
  const had = bases.map((r) => {
    /** @type {Map<string, number>} */
    const m = new Map()
    for (const o of r.colors?.offenders ?? []) m.set(colorKey(o), o.count)
    for (const f of r.fonts?.offenders ?? []) m.set(fontKey(f), f.count)
    return m
  })
  const fresh = (/** @type {string} */ key, /** @type {number} */ count) =>
    had.every((m) => !m.has(key) || count > /** @type {number} */ (m.get(key)))
  let existing = 0
  const colors = report.colors.offenders.filter((o) => {
    if (!baseline) return o.band === 'off'
    if (fresh(colorKey(o), o.count)) return true
    existing += 1
    return false
  })
  const fonts = report.fonts.offenders.filter((f) => {
    if (!baseline || fresh(fontKey(f), f.count)) return true
    existing += 1
    return false
  })
  // One colour on one element is one finding, whatever sides it paints: a button filled and bordered
  // in the same off value was five warnings and five clauses of `next` (measured 30/09 on dfinwp1).
  /** @type {Map<string, ColorOffender & { props: string[] }>} */
  const grouped = new Map()
  for (const o of colors) {
    const key = `${o.value}|${o.where[0] ?? ''}`
    const had = grouped.get(key)
    if (had) {
      had.props.push(o.prop)
      had.count = Math.max(had.count, o.count)
    } else grouped.set(key, { ...o, props: [o.prop] })
  }
  const merged = [...grouped.values()]
  const all = [
    ...merged.map((o) => ({
      code: 'OFF_PALETTE_COLOR',
      prop: o.prop,
      ...(o.props.length > 1 ? { props: o.props } : {}),
      value: o.value,
      band: o.band,
      nearest: o.nearest,
      count: o.count,
      where: o.where
    })),
    ...fonts.map((f) => ({ code: 'OFF_SYSTEM_FONT', family: f.family, count: f.count, where: f.where }))
  ]
  const next = checkNext({
    ...report,
    colors: { ...report.colors, offenders: merged },
    fonts: { ...report.fonts, offenders: fonts }
  })
  return {
    baseline,
    warnings: all.slice(0, DRIFT_WARNINGS_MAX),
    ...(all.length > DRIFT_WARNINGS_MAX ? { more: all.length - DRIFT_WARNINGS_MAX } : {}),
    existing,
    next
  }
}
