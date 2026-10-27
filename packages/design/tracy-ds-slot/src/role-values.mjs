/**
 * The value of every standard role variable (role-variables.mjs) for one side of light, from the
 * worn colours of that side. PURE. Every CMS emitter writes these, so a template that reads the roles
 * gets a whole, readable set from any system, whatever the system leaves unsaid:
 *
 * - lines are derived from the page and the text with contrast bounds (`LINE`): a system's black
 *   border (Figma) or text-coloured one (Moxie dark) drew every card and table as a black frame, and a
 *   border 1.6:1 off a dark page (Figma dark) vanished (review stand, 15/10/2026);
 * - a surface equal to the page gets a small lift (`LIFT`), or cards read as nothing;
 * - the accent band is the accent moved the least that lets the accent's own button stand out on it
 *   (3:1): a band painted in the accent hid the accent-filled button on it;
 * - status colours, their grounds and their words, info included, read 4.5:1;
 * - faces and corners fall back to the system's nearest stated value.
 */
import { groundCandidates, wordsOn } from './bands.mjs'
import { contrast, luminance, mix, parseHex, readable, readableOn } from './colour.mjs'
import { ROLE_VARIABLES } from './role-variables.mjs'

/** Contrast bounds of the two lines against the page: [least, most, the value a derived line takes]. */
export const LINE = Object.freeze({ border: [2, 3, 2.3], soft: [1.3, 2, 1.5] })

/** The least contrast a surface keeps off its page, and the one a lifted surface takes, per side. */
export const LIFT = Object.freeze({
  light: { surface: [1.05, 1.08], warm: [1.025, 1.04] },
  dark: { surface: [1.1, 1.2], warm: [1.05, 1.1] }
})

/**
 * How far the neutral hover ground (`--ds-c-surface-hover`) stands off the surface, per side: a step the
 * eye sees under the pointer, as the accent's hover fill is the accent 12% darker or lighter. A dark
 * system needs the larger ratio for the same visible step (LIFT).
 */
export const SURFACE_HOVER = Object.freeze({ light: 1.08, dark: 1.15 })

/** The template status hues a system never states, tuned to each system (`statusColour`). */
export const STATUS_HUES = Object.freeze({
  success: '#2e7d32',
  warn: '#c8891b',
  danger: '#c0392b',
  info: '#2563eb'
})

const isDark = (bg) => (parseHex(bg) ? luminance(parseHex(bg)) < 0.3 : false)

/** A disabled control's contrast floors: its fill off every ground it may sit on, its words on all of them. */
export const DISABLED = Object.freeze({ apart: 1.2, words: 3 })

/** The first mix of `from` toward `to` (1% steps) that reaches `min`:1 on every one of `grounds`, or `to`. */
function stepAll(from, to, grounds, min) {
  for (let i = 0; i <= 100; i++) {
    const c = mix(from, to, i / 100)
    if (grounds.every((g) => (contrast(c, g) ?? 0) >= min)) return c
  }
  return to
}

/** The first mix of `from` toward `to` (1% steps) that reaches `min`:1 on `ground`, or `to`. */
function stepTo(from, to, ground, min) {
  for (let i = 0; i <= 100; i++) {
    const c = mix(from, to, i / 100)
    if ((contrast(c, ground) ?? 0) >= min) return c
  }
  return to
}

/**
 * A line on the page `bg`: the system's own when it lies within `[lo, hi]`:1 of the page, else the
 * page moved toward the system's line (or its text, when the line is fainter than wanted) until it
 * reaches `want`:1, which keeps the line's hue.
 */
export function lineOn(bg, stated, fg, [lo, hi, want]) {
  if (!parseHex(bg) || !parseHex(fg)) return stated ?? null
  const c = contrast(stated, bg)
  if (c !== null && c >= lo && c <= hi && stated.toLowerCase() !== fg.toLowerCase()) return stated
  const toward = c !== null && c >= want ? stated : fg
  return stepTo(bg, toward, bg, want)
}

/** A ground at least `least`:1 off the page: the stated one, else the page lifted toward its text to `want`. */
export function liftOff(bg, stated, fg, [least, want]) {
  if (!parseHex(bg) || !parseHex(fg)) return stated ?? null
  if ((contrast(stated, bg) ?? 0) >= least) return stated
  return stepTo(bg, fg, bg, want)
}

/**
 * The neutral hover ground of a surface: the system's own when it stands at least half the step off the
 * surface and the text still reads 4.5:1 on it; else the surface moved the least toward its text (or, when
 * that leaves the text under 4.5:1, away from it) that reaches the step. Before the role, a template had
 * only the surface for a grey hover, so under a system its rows and grey buttons did not move on hover
 * (JA Restaurant's dark variants, 20/10/2026).
 */
export function surfaceHoverOf(surface, stated, fg, dark) {
  if (!parseHex(surface) || !parseHex(fg)) return stated ?? surface ?? null
  const want = dark ? SURFACE_HOVER.dark : SURFACE_HOVER.light
  const reads = (c) => (contrast(fg, c) ?? 0) >= 4.5
  if (parseHex(stated) && (contrast(stated, surface) ?? 1) >= 1 + (want - 1) / 2 && reads(stated))
    return stated
  const toward = stepTo(surface, fg, surface, want)
  if (reads(toward)) return toward
  const away = stepTo(surface, luminance(parseHex(fg)) > 0.5 ? '#000000' : '#ffffff', surface, want)
  return reads(away) && (contrast(away, surface) ?? 1) > 1.01 ? away : toward
}

/** The colour a band painted in the accent takes: the accent deepened (else lightened) the least that sets it 3:1 apart. */
export function accentBand(accent) {
  if (!parseHex(accent)) return accent
  const ways = ['#000000', '#ffffff']
    .map((to) => stepTo(accent, to, accent, 3))
    .filter((c) => (contrast(c, accent) ?? 0) >= 3)
  // the deeper way when there is one: a band lightened toward white glared on a dark page (Figma dark's
  // lavender call band, review stand 15/10/2026) and stood less apart from a light one
  return ways[0] ?? accent
}

/**
 * `ground` moved the least toward black or white that sets `fill` `min`:1 apart from it: a band whose
 * accent-filled button must stand out on it (Figma's dark ink band under its blue button, 2.8:1).
 */
export function apart(ground, fill, min = 3) {
  if (!parseHex(ground) || !parseHex(fill) || (contrast(ground, fill) ?? 0) >= min) return ground
  const steps = ['#000000', '#ffffff']
    .map((to) => {
      for (let i = 1; i <= 100; i++) {
        const c = mix(ground, to, i / 100)
        if ((contrast(c, fill) ?? 0) >= min) return { c, i }
      }
      return null
    })
    .filter(Boolean)
    .sort((a, b) => a.i - b.i)
  return steps[0]?.c ?? ground
}

/** The words on a ground: the page or the text colour that reads more, else white or black. */
export function wordsFor(ground, bg, fg) {
  const best = [bg, fg]
    .filter((x) => parseHex(x))
    .sort((a, b) => (contrast(b, ground) ?? 0) - (contrast(a, ground) ?? 0))[0]
  return best && (contrast(best, ground) ?? 0) >= 4.5 ? best : readableOn(ground)
}

/**
 * One status state on a page: its colour (fills, icons, lines; read 4.5:1 on the page), its pale
 * ground and its words, read 4.5:1 on that ground and on the page.
 */
export function statusColour(hue, bg, fg, tuned) {
  const toward = isDark(bg) ? '#ffffff' : '#000000'
  const colour =
    parseHex(tuned) && (contrast(tuned, bg) ?? 0) >= 4.5
      ? tuned
      : (readable(mix(hue, fg, 0.2), bg, toward, 4.5) ?? fg)
  const ground = mix(bg, colour, isDark(bg) ? 0.14 : 0.08)
  const words = readable(colour, ground, toward, 4.5) ?? fg
  const text = (contrast(words, bg) ?? 0) >= 4.5 ? words : (readable(words, bg, toward, 4.5) ?? fg)
  return { colour, ground, text }
}

const px = (v) => {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Every role variable of one side.
 * @param {object} side  the worn colours of the side, literal hexes: bg, surface, surfaceWarm, surfaceHover
 *   (the system's own, optional), fg, fg2,
 *   muted, meta, line, lineSoft, accent, accentOn, accentHover, accentActive, accentText,
 *   accentTextHover, ink, onInk; `status` the tuned status colours a CMS already writes ({ success }…),
 *   `hues` the template's own status hues
 * @param {Record<string, string>} slot  slotVars (corners, faces read off the reference page)
 * @param {{ body?: string | null, display?: string | null, mono?: string | null }} faces  the system's stacks
 * @returns {Record<string, string>}  every name of ROLE_VARIABLES
 */
export function roleVariableValues(side, slot = {}, faces = {}) {
  const { bg, fg } = side
  const dark = isDark(bg)
  const accentOn =
    (contrast(side.accentOn, side.accent) ?? 0) >= 4.5 ? side.accentOn : readableOn(side.accent)
  const hoverOn = (fill) => (parseHex(fill) && (contrast(accentOn, fill) ?? 0) >= 4.5 ? fill : side.accent)
  const band = accentBand(side.accent)
  const accentText = side.accentText ?? side.accent
  // a disabled control: quieter than a live one, never lost. Its fill stands apart from every ground it
  // may sit on and its words read 3:1 on the fill and on each of those grounds (DISABLED): the page's own
  // 12% step toward the text sat 1.03:1 on Moxie dark's card and its words 3:1 on it, a faint word with no
  // button around it (/contact's Send request before the consent tick, 15/10/2026)
  const grounds = [bg, side.surface, side.surfaceWarm].filter((g) => parseHex(g))
  const disabledBg = stepAll(mix(bg, fg, dark ? 0.12 : 0.08), fg, grounds, DISABLED.apart)
  const disabledFg = stepAll(disabledBg, fg, [disabledBg, ...grounds], DISABLED.words)
  // the ink band holds the accent-filled button too: it stands out there (3:1), its words still read
  const ink = apart(side.ink, side.accent, 3)
  const onInk = (contrast(side.onInk, ink) ?? 0) >= 4.5 ? side.onInk : wordsFor(ink, bg, fg)
  // the accent on the ink band: the system's own accent when it already reads 4.5:1 there (a light or
  // yellow accent on a dark band stays vivid: Mailchimp's #ffe01b reads ~13:1 on its ink, while the walk
  // from its page accent text gave a dull olive #93863d, JA Tour 17/10/2026); else the readable accent
  // text moved toward the band's words until it reads 4.5:1 there (Toggl Track's pink accent on its
  // pink ink hero read 1:1)
  const accentOnInk =
    parseHex(side.accent) && (contrast(side.accent, ink) ?? 0) >= 4.5
      ? side.accent
      : (readable(accentText, ink, onInk, 4.5) ?? onInk)
  const o = {
    '--ds-c-bg': bg,
    '--ds-c-surface': side.surface,
    '--ds-c-surface-warm': side.surfaceWarm,
    '--ds-c-surface-hover': surfaceHoverOf(side.surface, side.surfaceHover, fg, dark),
    '--ds-c-ink': ink,
    '--ds-c-on-ink': onInk,
    '--ds-c-accent-on-ink': accentOnInk,
    '--ds-c-fg': fg,
    '--ds-c-heading': fg,
    '--ds-c-fg-2': side.fg2,
    '--ds-c-muted': side.muted,
    '--ds-c-meta': side.meta,
    '--ds-c-accent': side.accent,
    '--ds-c-accent-on': accentOn,
    '--ds-c-accent-hover': hoverOn(side.accentHover),
    '--ds-c-accent-active': hoverOn(side.accentActive),
    '--ds-c-accent-text': accentText,
    '--ds-c-accent-text-hover': side.accentTextHover ?? accentText,
    '--ds-c-accent-band': band,
    '--ds-c-on-accent-band': wordsFor(band, bg, fg),
    '--ds-c-border': side.line,
    '--ds-c-border-soft': side.lineSoft,
    '--ds-c-focus-ring': accentText,
    '--ds-c-disabled-bg': disabledBg,
    '--ds-c-disabled-fg': disabledFg
  }
  for (const s of ['success', 'warn', 'danger', 'info']) {
    const st = statusColour(side.hues?.[s] ?? STATUS_HUES[s], bg, fg, side.status?.[s])
    o[`--ds-c-${s}`] = st.colour
    o[`--ds-c-${s}-bg`] = st.ground
    o[`--ds-c-${s}-text`] = st.text
  }
  // corners: what the system states, else its nearest stated corner; a field never rounder than a card
  const btn = slot['--ds-btn-radius'] ?? slot['--ds-card-radius'] ?? '6px'
  const card = slot['--ds-card-radius'] ?? btn
  const smaller = [px(btn), px(card)].filter((n) => n !== null)
  o['--ds-btn-radius'] = btn
  o['--ds-card-radius'] = card
  o['--ds-input-radius'] = slot['--ds-input-radius'] ?? (smaller.length ? `${Math.min(...smaller)}px` : card)
  o['--ds-pill-radius'] = slot['--ds-pill-radius'] ?? btn
  // faces: the system's, each falling back to the nearest one it states
  const body = faces.body ?? faces.display ?? 'system-ui, sans-serif'
  const display = slot['--ds-font-display'] ?? faces.display ?? body
  o['--ds-font-body'] = body
  o['--ds-font-display'] = display
  o['--ds-font-heading'] = slot['--ds-font-heading'] ?? display
  o['--ds-font-mono'] = faces.mono ?? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  // only names of the standard list, each with a value
  return Object.fromEntries(ROLE_VARIABLES.map((r) => [r.name, o[r.name]]).filter(([, v]) => v))
}

/** The system's stacks as role-variable faces, or null where it states none. */
export function facesOf(profile) {
  const stack = (f, generic) => (f && f.s !== 'empty' && f.v ? (f.stack ?? `"${f.v}", ${generic}`) : null)
  return {
    body: stack(profile.fonts?.body, 'sans-serif'),
    display: stack(profile.fonts?.display, 'sans-serif'),
    mono: stack(profile.fonts?.mono, 'monospace')
  }
}

/**
 * Every role variable of one side of a Joomla or WordPress sheet, from the worn 56 tokens (tokens56)
 * and the ink a band the template paints dark wears. The emitter adds only the names it does not
 * write already (its own `--ds-c-*` references to the CMS's tokens stay).
 * @param {{ tokens: Record<string, string>, text: { colours: Record<string, string> }, palette: any }} worn
 * @param {{ ink: string, onInk: string }} inkPair
 * @param {Record<string, string>} slot  slotVars
 * @param {ReturnType<typeof facesOf>} faces
 */
export function wornRoleValues({ tokens, text, palette: p }, { ink, onInk }, slot, faces) {
  const t = text.colours
  return roleVariableValues(
    {
      ...p,
      surface: t['--color-surface'] ?? p.surface,
      fg2: t['--color-fg-2'] ?? p.fg2,
      muted: t['--color-fg-muted'] ?? p.muted,
      meta: t['--color-fg-meta'] ?? p.meta,
      accentHover: t['--color-accent-hover'] ?? p.accentHover,
      accentActive: t['--color-accent-active'] ?? p.accentActive,
      accentText: t['--ds-accent-text'] ?? p.accent,
      accentTextHover: t['--ds-accent-text-hover'] ?? t['--ds-accent-text'] ?? p.accentHover,
      ink,
      onInk,
      // the status colours tokens56 tuned from the template's own: kept as they are
      status: { success: tokens['--success'], warn: tokens['--warn'], danger: tokens['--danger'] },
      hues: { success: tokens['--success'], warn: tokens['--warn'], danger: tokens['--danger'] }
    },
    slot,
    faces
  )
}

/**
 * The roles a ground and its words make together: never written apart, or a sheet can pair one
 * side's ground with words computed for another (ink == on-ink under Moxie dark, 15/10/2026).
 */
export const PAIRED_ROLES = Object.freeze([
  '--ds-c-ink',
  '--ds-c-on-ink',
  '--ds-c-accent-on-ink',
  '--ds-c-accent-band',
  '--ds-c-on-accent-band'
])

/**
 * Every role variable of one side of a Joomla or WordPress sheet, merged into the variables the sheet
 * already writes (`own`, its references to the CMS's tokens): a name the sheet writes is kept, except
 * the paired roles (PAIRED_ROLES), which always come from this one computation on the same ink, the
 * ground a band the template paints dark wears (bands.mjs groundCandidates). Every contract and both
 * sides get them, whatever the contract mentions. Mutates and returns `own`.
 * @param {Record<string, string>} own
 * @param {Parameters<typeof wornRoleValues>[0]} worn
 * @param {Record<string, string>} slot  slotVars
 * @param {ReturnType<typeof facesOf>} faces
 */
export function addWornRoles(own, worn, slot, faces) {
  const ink = groundCandidates(worn.tokens, 'ink')[0] ?? worn.tokens['--fg']
  const roles = wornRoleValues(worn, { ink, onInk: wordsOn(worn.tokens, ink) }, slot, faces)
  for (const [k, v] of Object.entries(roles)) if (PAIRED_ROLES.includes(k) || !(k in own)) own[k] = v
  return own
}
