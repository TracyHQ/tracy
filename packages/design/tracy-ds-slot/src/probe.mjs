/**
 * The role probe: what the page computes for each role a template marks, and the score of those
 * measurements against a profile. PURE (the probe is a string run IN the page).
 *
 * Roles are read by the EmDash base template's own classes today; a template that wears the slot
 * names its roles here. A role a page does not have is skipped, never failed.
 */
import { palette, pxAt, readableText, slotVars } from './emit.mjs'
import { textOrder } from './tokens56.mjs'

export const ROLES = Object.freeze({
  page: 'body',
  display: '.h-hero',
  heading: '.h-section',
  body: 'main p',
  'button-primary': '.btn-primary',
  'button-secondary': '.btn-secondary',
  card: '.card',
  container: '.wrap',
  section: '.band',
  input: '.ec-form-input'
})

const PROPS = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'borderTopLeftRadius',
  'paddingTop',
  'paddingLeft',
  'maxWidth'
]

/**
 * The role probe for one template's role → selector map (`templates/<template>.json`). `buttons`: the
 * contract's button selectors — whether the slot shapes the role's button at all.
 */
export const rolesProbe = (roles, buttons = []) => `(() => {
  const ROLES = ${JSON.stringify(roles)}
  const BUTTONS = ${JSON.stringify((Array.isArray(buttons) ? buttons : [buttons]).filter((x) => typeof x === 'string' && x.trim()).join(', '))}
  const P = ${JSON.stringify(PROPS)}
  const roles = {}
  for (const [role, sel] of Object.entries(ROLES)) {
    const el = document.querySelector(sel); if (!el) continue
    const cs = getComputedStyle(el); const o = {}
    for (const p of P) o[p] = cs[p]
    // a heading inside a repeated item keeps the template's size (ITEM in tokens56.mjs): said, so the score
    // does not ask the section heading size of it
    if (role === 'heading') o.inItem = !!el.parentElement?.closest('article, li, .card, [class*="-item"], [class*="item-"]')
    // a button's height (the score reads a pill off it); never a block's, which moves as its pictures arrive and
    // made the no-system control differ from its own baseline (JA Phio's page.height 7303 then 7177, 14/10/2026)
    if (role === 'button-primary') o.height = Math.round(el.getBoundingClientRect().height)
    // a role button the contract's button list leaves to the template (JA Restaurant's split .btn-decor, JA
    // Conference's round features link) keeps its own shape: the score does not ask the system's of it
    if (role === 'button-primary' && BUTTONS) { try { o.shaped = el.matches(BUTTONS) } catch {} }
    if (role === 'container') { o.contentWidth = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); o.boxWidth = Math.round(el.getBoundingClientRect().width); const pe = el.parentElement; if (pe) { const ps = getComputedStyle(pe); o.parentWidth = Math.round(pe.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight)) } }
    roles[role] = o
  }
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight))]
  const marker = /tracy-ds-slot: ([^ (]+)/.exec([...document.querySelectorAll('style')].map((s) => s.textContent.slice(0, 200000)).join('\\n'))
  return { href: location.href, theme: document.documentElement.getAttribute('data-theme'), slot: document.getElementById('tracy-ds-slot')?.dataset.ds ?? (marker ? marker[1] : null), roles, fonts, horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 && !['hidden', 'clip'].includes(getComputedStyle(document.documentElement).overflowX), overflow: (() => { const W = document.documentElement.clientWidth; if (document.documentElement.scrollWidth <= W + 1) return null; const out = []; for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1 && getComputedStyle(e).position !== 'fixed') { const p = e.parentElement && e.parentElement.getBoundingClientRect(); if (!p || p.right <= W + 1) out.push({ at: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''), right: Math.round(r.right), text: (e.textContent || '').trim().slice(0, 40) }) } if (out.length >= 5) break } return out })() }
})()`

/** EmDash base's probe (kept for the scripts that predate the per-template maps). */
export const ROLE_PROBE = rolesProbe(ROLES)

/**
 * A computed colour → [r, g, b, alpha] (0–255, alpha 0–1), or [] when it is not one. Both forms a
 * browser computes: `rgb()/rgba()` and `color(srgb r g b / a)` with 0–1 channels — what any
 * `color-mix()` computes to (read as 0–255 it is near-black: a 21:1 text measured as 1:1).
 * Injected into the page probes as source, so one parser serves both sides.
 */
export function channels(s) {
  const str = String(s ?? '')
  const n = (str.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number)
  if (n.length < 3) return []
  const srgb = str.trim().startsWith('color(srgb')
  // oklab()/oklch() — what Tailwind v4's colours compute to (EmDash's sticky header,
  // oklab(1 0 0 / 0.8)): its three numbers read as 0–255 are black, so the white veil over the
  // page read as a dark ground (1.34:1, 12/10/2026). Converted to sRGB 0–255
  const ok = /^okl(ab|ch)\(/.exec(str.trim())
  if (ok) {
    const L = n[0] > 1 ? n[0] / 100 : n[0]
    const [A, B] =
      ok[1] === 'ch'
        ? [n[1] * Math.cos((n[2] * Math.PI) / 180), n[1] * Math.sin((n[2] * Math.PI) / 180)]
        : [n[1], n[2]]
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    const q = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q
    ]
    const [r, g, b] = lin.map((v) =>
      Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)))
    )
    return [r, g, b, n[3] === undefined ? 1 : n[3]]
  }
  const [r, g, b] = n.slice(0, 3).map((v) => (srgb ? Math.round(v * 255) : v))
  return [r, g, b, n[3] === undefined ? 1 : n[3]]
}
const rgb = (s) => {
  const c = channels(s)
  return c.length ? c.slice(0, 3) : null
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const firstFamily = (ff) =>
  String(ff ?? '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
const n = (s) => parseFloat(s)

/**
 * What each role must compute when a profile is worn; null = the profile is silent there. Read off
 * the profile itself (its palette and slot values), never off one CMS's emitter, so the same
 * expectation judges EmDash, WordPress and Joomla alike. A CMS that has not adopted reference-page
 * component values must declare that capability explicitly; palette and stated tokens still apply.
 */
export function expected(profile, base = null, opts = {}) {
  const pal = palette(profile)
  // the page's text is the system's ink at the place the template's --fg holds in its own order of
  // text strength (tokens56): a template whose body copy is its softer text gets the system's softer one
  const t = readableText(pal).colours
  const inks = [
    pal.fg,
    t['--color-fg-2'] ?? pal.fg2,
    t['--color-fg-muted'] ?? pal.muted,
    t['--color-fg-meta'] ?? pal.meta
  ]
  const pageInk = base ? inks[textOrder(base).indexOf('fg')] : pal.fg
  const sv = slotVars(profile, {
    components: opts.components,
    templateDisplay: opts.templateDisplay,
    templateDisplayPhone: opts.templateDisplayPhone,
    templateHeading: opts.templateHeading,
    templateButton: opts.templateButton,
    templateDisplayFace: opts.templateDisplayFace,
    templateGutter: opts.templateGutter
  })
  const fam = (stack) => (stack ? firstFamily(stack) : null)
  const val = (f) => (f && f.s !== 'empty' && f.v !== null && f.v !== undefined ? f.v : null)
  const body = profile.fonts.body
  // a size the slot caps to the window (`min(119px, 6vw)`) is expected as it computes at 1440 and 390
  const size = sv['--ds-size-display']
    ? [pxAt(sv['--ds-size-display'], 1440), pxAt(sv['--ds-size-display-phone'], 390)]
    : null
  return {
    'page.backgroundColor': ['colour', pal.bg],
    'page.color': ['colour', pageInk],
    'page.fontFamily': ['family', val(body) ? fam(body.stack ?? `"${body.v}"`) : null],
    'display.fontFamily': ['family', fam(sv['--ds-font-display'])],
    'display.fontWeight': ['exact', sv['--ds-weight-display']],
    'display.fontSize': ['px', size],
    'display.lineHeight': [
      'leading',
      sv['--ds-leading-display'] && size ? [Number(sv['--ds-leading-display']), ...size] : null
    ],
    'display.letterSpacing': [
      'tracking',
      sv['--ds-tracking-display'] && size ? [parseFloat(sv['--ds-tracking-display']), ...size] : null
    ],
    'heading.fontWeight': ['exact', sv['--ds-weight-heading']],
    'heading.fontSize': [
      'px',
      sv['--ds-size-heading']
        ? [pxAt(sv['--ds-size-heading'], 1440), pxAt(sv['--ds-size-heading-phone'], 390)]
        : null
    ],
    'body.fontWeight': ['exact', sv['--ds-weight-body']],
    'button-primary.backgroundColor': ['colour', pal.accent],
    'button-primary.color': ['colour', pal.accentOn],
    'button-primary.borderTopLeftRadius': ['radius', sv['--ds-btn-radius']],
    'button-primary.fontWeight': ['exact', sv['--ds-weight-button']],
    'card.borderTopLeftRadius': ['radius', sv['--ds-card-radius']],
    // not worn: the content width stays the template's (tokens56 layoutRules)
    'container.contentWidth': ['width', null],
    // not worn: the section rhythm stays the template's (tokens56 layoutRules)
    'section.paddingTop': ['band', null]
  }
}

/**
 * Score one page measurement against an expectation.
 * Tolerances: colour ≤ 16 per channel (design-check's `on` band), sizes ±1px, weight exact,
 * tracking ±0.3px, width ±2px (capped by the viewport), radius ≥ 500px all count as a pill.
 * @param {{ roles: Record<string, Record<string, any>> }} view
 * @param {ReturnType<typeof expected>} exp
 * @param {'desktop'|'phone'} vw
 */
export function score(view, exp, vw, viewportWidth = vw === 'phone' ? 390 : 1440, base = null) {
  let ok = 0
  let total = 0
  const misses = []
  const phone = vw === 'phone'
  for (const [key, [kind, want]] of Object.entries(exp)) {
    if (want === null || want === undefined) continue
    const [role, prop] = key.split('.')
    const got = view.roles?.[role]?.[prop]
    if (got === undefined) continue
    // a heading inside a card or a listed post keeps the template's size: nothing of the system to score
    if (key === 'heading.fontSize' && view.roles?.[role]?.inItem === true) continue
    // nor the shape of a role button the contract leaves to the template
    if (
      role === 'button-primary' &&
      ['borderTopLeftRadius', 'fontWeight'].includes(prop) &&
      view.roles?.[role]?.shaped === false
    )
      continue
    let pass
    if (kind === 'colour') {
      const g = rgb(got)
      const w = hexRgb(want)
      pass = !!g && Math.max(...g.map((v, i) => Math.abs(v - w[i]))) <= 16
    } else if (kind === 'family') pass = firstFamily(got) === want
    else if (kind === 'exact') pass = Number(got) === Number(want)
    else if (kind === 'px') pass = Math.abs(n(got) - (phone ? want[1] : want[0])) <= 1
    else if (kind === 'leading') pass = Math.abs(n(got) - want[0] * (phone ? want[2] : want[1])) <= 1
    // `letter-spacing: 0em` computes to the keyword `normal`
    else if (kind === 'tracking')
      pass = Math.abs((got === 'normal' ? 0 : n(got)) - want[0] * (phone ? want[2] : want[1])) <= 0.3
    else if (kind === 'radius') {
      // the slot caps a button's radius at 2em (BUTTON_RADIUS_MAX): a pill is any radius of half its height
      // or more, and a radius over 2em is written as 2em
      const fs = n(view.roles?.[role]?.fontSize)
      const h = n(view.roles?.[role]?.height)
      pass =
        Math.abs(n(got) - n(want)) <= 1 ||
        (fs > 0 && Math.abs(n(got) - Math.min(n(want), 2 * fs)) <= 1) ||
        (n(want) >= 500 && (n(got) >= 500 || (h > 0 && n(got) >= h / 2 - 1)))
    }
    // A system's page width is its content column; whether that includes the gutters is the
    // template's convention, so the box or the content inside its padding may carry it. On a phone
    // the column is the viewport less the template's own gutters (each 0–32px), never the system's.
    else if (kind === 'width') {
      const box = view.roles?.[role]?.boxWidth
      // a container that fills all its parent gives it (a section the template pads: JA Spa's 1288px of
      // 1440) is as wide as the page lets the system make it
      const parentW = view.roles?.[role]?.parentWidth
      const fillsParent =
        !phone &&
        typeof parentW === 'number' &&
        typeof box === 'number' &&
        box >= parentW - 2 &&
        want >= parentW
      // a template whose phone gutters are wider than 32px (JA Vogue's 48px) keeps them: its phone
      // column as the default page draws it passes too
      const own = base?.roles?.[role]?.[prop]
      pass =
        fillsParent ||
        (phone
          ? (got >= viewportWidth - 64 - 2 && got <= viewportWidth) ||
            (typeof own === 'number' && Math.abs(got - own) <= 2)
          : want >= viewportWidth - 64
            ? // as wide as the viewport or wider: the column fills it, less the template's gutters (the
              // slot keeps a container 32px off each edge of the window)
              // (less a scrollbar's 16px: the slot's 100vw counts it, the page's layout does not — JA
              // Phio's container filled 1368px of its 1440px window, 13/10/2026)
              [got, box].some((w) => typeof w === 'number' && w >= viewportWidth - 64 - 16 - 2)
            : [got, box].some((w) => typeof w === 'number' && Math.abs(w - want) <= 2))
    } else if (kind === 'band') pass = Math.abs(n(got) - (phone ? want[1] : want[0])) <= 1
    total += 1
    if (pass) ok += 1
    else misses.push(`${key}=${got} (want ${Array.isArray(want) ? want.join('/') : want})`)
  }
  return { ok, total, match: total ? ok / total : null, misses }
}

/**
 * How far apart two systems' expectations are on what this page measures: the share of the checks
 * `score(view, a)` makes whose wanted value under `b` is a different one (outside the same
 * tolerance). A page that wears `a` perfectly scores `1 - separation` against `b`, so that is the most
 * any page can tell the two apart. Notion, Airbnb, ElevenLabs and Apple all want a near-white page,
 * near-black text and Inter: on a template that only measures those three, they are one look
 * (13/10/2026), and no slot could make them differ there.
 */
export function separation(view, a, b, vw) {
  const phone = vw === 'phone'
  const at = (w, i) => (Array.isArray(w) ? w[i] : w)
  let total = 0
  let apart = 0
  // over the checks score(view, b) makes: a value b does not name is not scored against b, so it can
  // not tell the two apart (Eddie's button weight under ElevenLabs, which names none: counted apart, it
  // asked a margin of 0.36 that no page could show, 13/10/2026); one only a names shows the template's
  // own there, judged apart from b's
  for (const [key, [kind, other]] of Object.entries(b)) {
    if (other === null || other === undefined) continue
    const [role, prop] = key.split('.')
    if (view.roles?.[role]?.[prop] === undefined) continue
    // what score does not judge on this page tells no two systems apart: a heading inside a card or a listed
    // post keeps the template's size (JA Essence WordPress's card titles, 14/10/2026)
    if (key === 'heading.fontSize' && view.roles?.[role]?.inItem === true) continue
    // nor the shape of a role button the contract leaves to the template (JA Conf's round arrow buttons: Eddie's
    // 600 weight, which ElevenLabs does not name, counted apart and asked 2/9 where the page judges 7 checks
    // and the two differ on one, 15/10/2026)
    if (
      role === 'button-primary' &&
      ['borderTopLeftRadius', 'fontWeight'].includes(prop) &&
      view.roles?.[role]?.shaped === false
    )
      continue
    total += 1
    const want = a[key]?.[1]
    if (want === null || want === undefined) {
      // a page wearing `a` shows the template's own value there, which this page shows: apart only when it
      // is not `b`'s (JA Essence WordPress's 400 button weight under Mailchimp, which names none, is
      // Apple's 400, 14/10/2026)
      const got = view.roles[role][prop]
      const g = kind === 'colour' ? rgb(got) : null
      const shows =
        kind === 'exact'
          ? Number(got) === Number(other)
          : kind === 'colour'
            ? !!g && Math.max(...g.map((v, i) => Math.abs(v - hexRgb(other)[i]))) <= 16
            : kind === 'family'
              ? firstFamily(got) === other
              : // a column as score judges it: on a phone every column is the viewport's, so any page shows a
                // width only b names (JA Phio under Spotify, which names none, held apart from Linear's 1200
                // at 390px, 15/10/2026)
                kind === 'width'
                ? score(view, { [key]: [kind, other] }, vw).ok === 1
                : false
      if (!shows) apart += 1
      continue
    }
    let same
    if (kind === 'colour') {
      const x = hexRgb(want)
      const y = hexRgb(other)
      same = Math.max(...x.map((v, i) => Math.abs(v - y[i]))) <= 16
    } else if (kind === 'family') same = want === other
    else if (kind === 'exact') same = Number(want) === Number(other)
    else if (kind === 'px' || kind === 'band')
      same = Math.abs(at(want, phone ? 1 : 0) - at(other, phone ? 1 : 0)) <= 1
    else if (kind === 'leading' || kind === 'tracking')
      same =
        Math.abs(want[0] * want[phone ? 2 : 1] - other[0] * other[phone ? 2 : 1]) <=
        (kind === 'leading' ? 1 : 0.3)
    else if (kind === 'radius') {
      // as score judges it: a radius over 2em is written as 2em, and one of half the element's height or
      // more is a pill, so a page wearing `a` passes `b`'s pill there (Eddie's 25px on a 50px button is
      // ElevenLabs' 9999px: one look, counted apart, it asked a margin no page could show, 14/10/2026)
      const fs = n(view.roles?.[role]?.fontSize)
      const h = n(view.roles?.[role]?.height)
      const shown = (r) => (fs > 0 ? Math.min(n(r), 2 * fs) : n(r))
      same =
        Math.abs(n(want) - n(other)) <= 1 ||
        (n(want) >= 500 && n(other) >= 500) ||
        Math.abs(shown(want) - shown(other)) <= 1 ||
        (n(other) >= 500 && h > 0 && shown(want) >= h / 2 - 1)
    }
    // as score judges it: on a phone every column is the viewport's, on a desktop every one as wide as
    // the window less its gutters is the window's (1200 and 1280 are one width at 390)
    else if (kind === 'width')
      same =
        phone ||
        (want >= 1440 - 64 && other >= 1440 - 64) ||
        Math.abs(want - other) <= 2 ||
        // a column this page shows as both, as score judges them (the box, or the content inside the
        // template's padding): JA Phio's container fills its 1368px parent under Notion's 1440 and holds
        // 1200px inside its 84px padding, Eddie's 1200 (15/10/2026)
        (score(view, { [key]: [kind, want] }, vw).ok === 1 &&
          score(view, { [key]: [kind, other] }, vw).ok === 1)
    else same = want === other
    if (!same) apart += 1
  }
  return total ? apart / total : 0
}

/** Every computed value of two measurements that differs (the no-system control). */
export function differences(a, b) {
  const out = []
  for (const [role, props] of Object.entries(a.roles ?? {}))
    for (const [p, v] of Object.entries(props))
      if (b.roles?.[role]?.[p] !== v) out.push(`${role}.${p}: ${v} → ${b.roles?.[role]?.[p]}`)
  for (const role of Object.keys(b.roles ?? {})) if (!(role in (a.roles ?? {}))) out.push(`${role}: appeared`)
  return out
}

/**
 * What every visible element paints: its own text colour (when it holds text), its fill (when
 * opaque enough to see) and its line (when it has a border). Keyed by a path of visible-sibling
 * indices, so a slot node that paints nothing (a module holding only <style>) shifts no key.
 */
/**
 * PAINT_PROBE, each paint marked (a fifth entry, 1) when the contract keeps its element as the template paints it,
 * so `follows` leaves it out of both its counts (ROLE-1, council 15/10/2026): inside one of `within` (the bands
 * kept whole, the kept bands that do not wear the system's ground, the palette's justified exceptions) and not one
 * of `scored` (a kept band's calls to action, which follow the system on purpose).
 * @param {{ within?: string[], scored?: string[] }} [kept]
 */
export const paintProbe = ({ within = [], scored = [] } = {}) => `(() => {
  const channels = ${channels.toString()}
  const out = {}
  const inside = (el, sel) => { if (!sel) return false; try { return !!el.closest(sel) } catch { return false } }
  const KEPT = ${JSON.stringify(within.join(', '))}
  const SCORED = ${JSON.stringify(scored.join(', '))}
  const seen = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const walk = (el, key) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return
    // a hidden element paints nothing itself, but its children may be visible (visibility inherits
    // and can be turned back on: a T3 page loader hides the wrapper, the content shows)
    const hidden = cs.visibility === 'hidden' || cs.opacity === '0'
    const own = !hidden && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const a = (c) => { const m = channels(c); return m.length && m[3] > 0.3 ? 'rgb(' + m.slice(0, 3).join(',') + ')' : null }
    const line = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 ? a(parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : cs.borderBottomColor) : null
    // the ground a text sits on: the nearest opaque fill, or 'image' when a picture is under it first
    const ground = () => { for (let e = el; e; e = e.parentElement) { const s2 = getComputedStyle(e); if (s2.backgroundImage !== 'none') return 'image'; const f = a(s2.backgroundColor); if (f && channels(s2.backgroundColor)[3] > 0.95) return f } return 'rgb(255,255,255)' }
    const text = own ? a(cs.color) : null
    const p = hidden ? [null, null, null, null] : [text, a(cs.backgroundColor), line, text ? ground() : null]
    if (p.slice(0, 3).some(Boolean)) out[key] = inside(el, KEPT) && !inside(el, SCORED) ? [...p, 1] : p
    let i = 0
    for (const c of el.children) if (seen(c) || c.children.length) walk(c, key + '/' + c.tagName.toLowerCase() + (i++))
  }
  walk(document.body, 'body')
  return out
})()`
export const PAINT_PROBE = paintProbe()

const rgbOf = (s) => channels(s).slice(0, 3)
const anyHexRgb = (h) => {
  const x = String(h).replace('#', '')
  const f = x.length === 3 ? [...x].map((c) => c + c).join('') : x.slice(0, 6)
  return /^[0-9a-f]{6}$/i.test(f) ? [0, 2, 4].map((i) => Number.parseInt(f.slice(i, i + 2), 16)) : null
}
const near = (a, b, tol = 16) =>
  a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol)

/**
 * How much of the page follows a worn system: of everything painted in the default view, what still
 * paints the SAME template colour now — and that colour is not one the system itself has (a white
 * page under a white system has followed). Fills and lines counted alike; a text only where its
 * ground changed (text kept on a kept ground — a photo, a band — is consistent, not left behind).
 * @param {Record<string, (string|null)[]>} before  PAINT_PROBE on the default view
 * @param {Record<string, (string|null)[]>} after   PAINT_PROBE with the system worn
 * @param {string[]} systemColours  the worn colours (hex)
 */
export function follows(before, after, systemColours) {
  const sys = systemColours.map(anyHexRgb).filter(Boolean)
  let samples = 0
  let left = 0
  let kept = 0
  const worst = {}
  for (const [key, was] of Object.entries(before)) {
    const now = after[key]
    if (!now) continue
    for (let i = 0; i < 3; i++) {
      if (!was[i] || !now[i]) continue
      // a text kept on a ground that was kept too (white on a photo, a band the template keeps) is
      // consistent, not a miss: what the system must restyle is text whose ground followed
      if (i === 0 && now[0] === was[0] && was[3] && now[3] === was[3]) continue
      // what the contract keeps as the template paints it is no part of what must follow (paintProbe)
      if (was[4] || now[4]) {
        kept += 1
        continue
      }
      samples += 1
      const c = rgbOf(was[i])
      if (now[i] !== was[i] || sys.some((s) => near(c, s))) continue
      left += 1
      const k = `${['text', 'fill', 'line'][i]} rgb(${c.join(',')})`
      worst[k] ??= { count: 0, at: key }
      worst[k].count += 1
    }
  }
  return {
    samples,
    left,
    kept,
    rate: samples ? Math.round((1 - left / samples) * 1000) / 1000 : null,
    worst: Object.entries(worst)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([k, v]) => ({ paint: k, ...v }))
  }
}
