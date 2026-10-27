/**
 * Profile → the CSS a template wears it with. PURE. One slot vocabulary (`--ds-*`) plus, per CMS,
 * a bridge onto that template's own token names. A field the profile leaves `empty` emits NOTHING:
 * the template then keeps the value it has today (`var(--ds-x, <today>)` in the template CSS).
 */

import { groundCandidates, wordsOn } from './bands.mjs'
import { buttonPair, contrast, distance, luminance, mix, parseHex, readable, readableOn } from './colour.mjs'
import { derive, modeOf } from './derive.mjs'
import { advanceOf, kindOf } from './fonts.mjs'
import { gate } from './normalise.mjs'
import { facesOf, LIFT, LINE, liftOff, lineOn, roleVariableValues } from './role-values.mjs'

const GOOGLE = 'https://fonts.googleapis.com/css2'

/** One `<link href>` for every Google family a profile loads, or null. */
export function fontsHref(profile) {
  const want = new Map()
  for (const role of ['display', 'body', 'mono']) {
    for (const l of profile.fonts[role]?.load ?? []) {
      const ws = new Set(want.get(l.family) ?? [])
      for (const w of l.weights?.length ? l.weights : [400]) ws.add(w)
      want.set(l.family, [...ws])
    }
  }
  if (want.size === 0) return null
  const fam = [...want].map(
    ([f, ws]) => `family=${f.replace(/ /g, '+')}:wght@${[...new Set(ws)].sort((a, b) => a - b).join(';')}`
  )
  return `${GOOGLE}?${fam.join('&')}&display=swap`
}

const PHONE_MAX = Object.freeze({ display: 56, heading: 40 })

/** Google faces drawn for headlines only: capitals, or condensed black that cramps under 20px. */
const HEADLINE_ONLY = new Set(['bebas neue', 'six caps', 'anton', 'league gothic', 'big shoulders display'])

/**
 * The widest a system's headline may set, as a share of the window: a template's hero gives its words a
 * column, not the page. Eddie's 119px display line ran "groundwork" across Tracy Business's picture at
 * 1440 (13/10/2026); 6vw is 86px there, larger than any template's own hero line measured. A system
 * whose size is under the cap keeps it exactly. On a phone, 10vw (39px at 390): at 11vw (43px) Tracy
 * Business's "next-generation" still broke at its hyphen under Airbnb, Eddie and Pitch, and a monospaced
 * face, a third wider, takes 8vw (MotherDuck's hero stood six lines tall there, 13/10/2026).
 */
export const VW_MAX = Object.freeze({ display: 6, displayPhone: 10, displayPhoneMono: 8, heading: 4.5 })

/**
 * The most a system's headline may outgrow the template's own (`discovered.display` of its contract): a
 * hero is laid out around its words, so JA Nova's 40px line set at Notion's 72px pushed into its floating
 * badges, and Tracy Business's 64px at Eddie's 86px stood six lines beside its picture (13/10/2026).
 */
export const DISPLAY_OVER_TEMPLATE = 1.25

/**
 * The least a section heading may set, desktop and phone: Figma's and Spotify's 24px heading (17px on a
 * phone) came out smaller than the template's own body copy and card titles (15-21px, 13/10/2026).
 */
export const HEADING_MIN = Object.freeze({ desktop: 28, phone: 24 })

/** The template's own hero size in px, as its contract measured it (`discovered.display`), or null. */
export function templateDisplayPx(contract) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(contract?.discovered?.display ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * The template's own hero size on a phone in px (`discovered.displayPhone`, measured at 390 on the published
 * release), or null. A template may set its hero far smaller on a phone than 0.714 of its desktop size: JA
 * Aiga's one-sentence hero, 45px on a desktop, is 20px on a phone, and Eddie's 40px made it seven lines over
 * the photo's face (13/10/2026).
 */
export function templateDisplayPhonePx(contract) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(contract?.discovered?.displayPhone ?? ''))
  return m ? Number(m[1]) : null
}

/** The template's own section heading size in px (`discovered.heading`), or null. */
export function templateHeadingPx(contract) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(contract?.discovered?.heading ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * The template's own button label size in px (`discovered.button`: a row of calls to action measured on
 * the published release), or null. A row of buttons is laid out around its labels' widths: a system's
 * larger label wraps it (Tracy Business WordPress's hero pair, 14px, one line in every locale; Figma's 16px
 * put the Tamil, Hungarian, Catalan and Belarusian pairs on two lines, LAYOUT-3, 16/10/2026).
 */
export function templateButtonPx(contract) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(contract?.discovered?.button ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * The template's own hero face (`discovered.displayFace`: `<family> <weight>, tracking <n>em`, the first
 * family of the hero line's stack as the published release computes it), or null.
 */
export function templateDisplayFace(contract) {
  const m = /^(.+?) (\d{3}), tracking (-?\d*\.?\d+)em$/.exec(
    String(contract?.discovered?.displayFace ?? '').trim()
  )
  return m ? { family: m[1], weight: Number(m[2]), tracking: Number(m[3]) } : null
}

/**
 * How far, in px, the template hangs its arrows and pictures off its container's edges (`containerGutter` of its
 * contract), never under the 32px every container keeps from the window's edges.
 */
export function containerGutter(contract) {
  const g = Number(contract?.containerGutter)
  return Number.isFinite(g) && g > 32 ? Math.round(g) : 32
}

/** The template's own hero and section heading sizes and its hero face, as slotVars takes them. */
export function templateSizes(contract) {
  return {
    templateDisplay: templateDisplayPx(contract),
    templateDisplayPhone: templateDisplayPhonePx(contract),
    templateHeading: templateHeadingPx(contract),
    templateButton: templateButtonPx(contract),
    templateDisplayFace: templateDisplayFace(contract),
    templateGutter: containerGutter(contract)
  }
}

/**
 * How much wider than the template's own hero face the system's sets the same words, letter spacing
 * included (1 when it sets them no wider, or when the table knows either face not): the hero was laid out
 * around a line's width, and the size alone does not hold it. Eddie's Inter 600 at 80px, within 1.25 of
 * Tracy Business's 64px Newsreader 400, still stood six lines in its half-width hero column (14/10/2026).
 */
export function displayWidthOver(own, face, weight, tracking) {
  const mine = advanceOf(face, weight)
  const theirs = own ? advanceOf(own.family, own.weight) : null
  if (!mine || !theirs) return 1
  return Math.max(1, (mine + (tracking ?? 0)) / (theirs + own.tracking))
}

/**
 * The largest hero a system's face may set over the template's own `size`: DISPLAY_OVER_TEMPLATE of its
 * line width, never down past 1/DISPLAY_OVER_TEMPLATE of its size — an extended face (Climate Crisis,
 * Bowlby One) or wide-tracked capitals would otherwise halve the hero under the section headings (JA
 * Restaurant's 58px Teko hero at 34px, 14/10/2026), where a line or two more is the lesser fault.
 */
export function heroCap(size, wider = 1) {
  return Math.round(Math.max((size * DISPLAY_OVER_TEMPLATE) / wider, size / DISPLAY_OVER_TEMPLATE))
}

/** A letter spacing (`-0.02em`, `-1.5px` at `size`) in em, 0 when there is none or it does not read. */
export function trackingEm(x, size) {
  const m = /^(-?\d*\.?\d+)(em|px)?$/.exec(String(x ?? '').trim())
  if (!m) return 0
  return m[2] === 'px' ? (size > 0 ? Number(m[1]) / size : 0) : Number(m[1])
}

/** `<n>px`, or `min(<n>px, <vw>vw)` when the size can outgrow the window share. */
function widthCapped(n, vw, phone = false) {
  return n > (vw * (phone ? 390 : 1440)) / 100 ? `min(${n}px, ${vw}vw)` : css(n)
}

/** The px a size the slot wrote (`36px`, `min(119px, 6vw)`) computes to in a window `viewport` px wide. */
export function pxAt(value, viewport) {
  const m = /^min\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)vw\)$/.exec(String(value ?? ''))
  return m ? Math.min(Number(m[1]), (Number(m[2]) * viewport) / 100) : Number.parseFloat(value)
}

const val = (f) => (f && f.s !== 'empty' && f.v !== null && f.v !== undefined ? f.v : null)
const valOf = val
const css = (n) => `${n}px`

/** The colours a template needs, from the 6–8 a profile has: fixed mixes, never guesses at brand. */
export function palette(profile) {
  const c = profile.colors
  const bg = val(c.bg)
  const fg = val(c.fg)
  const accent = val(c.accent)
  const dark = parseHex(bg) ? luminance(parseHex(bg)) < 0.3 : false
  const toward = dark ? '#ffffff' : '#000000'
  // lines and grounds held to contrast bounds (role-values.mjs): a system's black or text-coloured border
  // drew every card as a black frame, a 1.6:1 one vanished, and a surface equal to the page read as none
  const lift = dark ? LIFT.dark : LIFT.light
  const line = lineOn(bg, val(c.border) ?? mix(bg, fg, 0.16), fg, LINE.border)
  return {
    bg,
    fg,
    surface: liftOff(bg, val(c.surface) ?? mix(bg, fg, 0.05), fg, lift.surface),
    surfaceWarm: liftOff(bg, mix(bg, fg, 0.025), fg, lift.warm),
    // the neutral hover ground only when the system states one; else role-values.mjs steps it off the surface
    surfaceHover: val(profile.extraColours?.surfaceHover),
    fg2: val(profile.extraColours?.fg2) ?? mix(fg, bg, 0.25),
    muted: val(c.muted) ?? mix(fg, bg, 0.42),
    meta: val(profile.extraColours?.meta) ?? mix(fg, bg, 0.55),
    line,
    lineSoft: lineOn(bg, val(profile.extraColours?.borderSoft), line, LINE.soft),
    accent,
    accentOn: val(c.accentOn),
    accentHover: val(c.accentHover) ?? mix(accent, toward, 0.12),
    accentActive: val(profile.extraColours?.accentActive) ?? mix(accent, toward, 0.22),
    dark
  }
}

/**
 * The text colours a system's own values leave unreadable (WCAG AA, 4.5:1), each moved the least
 * it takes toward the system's text colour. A system's accent can be right as a FILL (a light blue
 * with dark text on it) and wrong as TEXT on the page — the template reads the two through separate
 * variables, so only the text use moves. Measured 09/10/2026: MotherDuck accent 1.70:1 on its
 * canvas, Toggl Track text 2.32:1 on its stated surface, muted text 2.3–3.3:1 in five of ten.
 * @returns {{ colours: Record<string, string>, adjusted: string[] }}
 */
export function readableText(p) {
  const { colours, adjusted } = clampedText(p)
  const hover = hoverApart(colours, p)
  return { colours: hover ? { ...colours, '--ds-accent-text-hover': hover } : colours, adjusted }
}

/**
 * Largest max-channel distance the HOVER-2 detector still reads as the same colour
 * (`SAME` in apps/tracy-web/scripts/preview-detectors/hover-same.mjs; a test holds the two equal).
 */
export const HOVER_SAME = 3

/**
 * The accent hover words stepped apart from the accent words, or null to keep today's. Clamping both for
 * contrast can land them on one colour (Moxie's light side: accent-text #4e6695, hover #4e6594; now
 * #4c6391), and a system's own hover can sit on its accent (a near-black accent whose 12% step toward black
 * moves it 3: #1a1a17, #171714), so a link's pointer changes nothing (HOVER-2, 21/10/2026). Only a hover
 * within HOVER_SAME of the accent words moves, the one the clamp wrote or else the one the sheet reads
 * (the button hover, as tokens56 sets --accent-hover): on toward the text colour, then away from the page
 * ground, in 2% steps, until it is distinct, never losing contrast on the page or the surface. No step → null.
 * @param {Record<string, string>} colours what clampedText wrote
 * @param {any} p the palette
 */
export function hoverApart(colours, p) {
  const hover = colours['--ds-accent-text-hover'] ?? colours['--color-accent-hover'] ?? p.accentHover
  const rest = colours['--ds-accent-text'] ?? p.accent
  if (!parseHex(hover) || !parseHex(rest) || distance(hover, rest) > HOVER_SAME) return null
  const grounds = [p.bg, colours['--color-surface'] ?? p.surface].filter((g) => parseHex(g))
  const worst = (c) => Math.min(...grounds.map((g) => contrast(c, g) ?? 0))
  const floor = worst(hover)
  // away from the page ground: the end of light on the hover's own side of it (dark words on a mid
  // violet page go to black, not white)
  const away =
    parseHex(p.bg) && luminance(parseHex(hover)) < luminance(parseHex(p.bg)) ? '#000000' : '#ffffff'
  for (const toward of [p.fg, away]) {
    if (!parseHex(toward)) continue
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const c = mix(hover, toward, t)
      if (distance(c, rest) > HOVER_SAME && worst(c) >= floor) return c
    }
  }
  return null
}

/** readableText before the hover step: each text colour clamped for contrast on its own. */
export function clampedText(p) {
  const out = {}
  const adjusted = []
  const worst = (c, grounds) => Math.min(...grounds.map((g) => contrast(c, g) ?? 0))
  // The smallest move toward the text colour that reads on every ground the text sits on.
  const onAll = (colour, grounds) => {
    if (worst(colour, grounds) >= 4.5) return colour
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const c = mix(colour, p.fg, t)
      if (worst(c, grounds) >= 4.5) return c
    }
    return null
  }
  let surface = p.surface
  // The surface the text can always be read on: bg toward fg 5%, or bg itself when the system's own
  // text only just reads on its page (then any tint takes it under 4.5).
  const fallbackSurface = (contrast(p.fg, mix(p.bg, p.fg, 0.05)) ?? 0) >= 4.5 ? mix(p.bg, p.fg, 0.05) : p.bg
  // A stated surface the text cannot be read on is replaced by that one.
  if ((contrast(p.fg, surface) ?? 21) < 4.5) {
    adjusted.push(
      `surface:${contrast(p.fg, surface).toFixed(2)}→${contrast(p.fg, fallbackSurface).toFixed(2)}`
    )
    surface = fallbackSurface
  }
  const texts = [
    ['--ds-accent-text', p.accent, 'accent-text'],
    ['--ds-accent-text-hover', p.accentHover, 'accent-text-hover'],
    ['--color-fg-muted', p.muted, 'muted'],
    ['--color-fg-meta', p.meta, 'meta'],
    ['--color-fg-2', p.fg2, 'fg-2']
  ]
  // A surface so close to a text colour that no shade of it reads on both (Oevra: surface = accent)
  // gives way to the derived surface instead.
  if (
    surface !== fallbackSurface &&
    texts.some(([, c]) => parseHex(c) && onAll(c, [p.bg, surface]) === null)
  ) {
    adjusted.push(`surface:text-unreadable→${contrast(p.fg, fallbackSurface).toFixed(2)}`)
    surface = fallbackSurface
  }
  if (surface !== p.surface) out['--color-surface'] = surface
  // a warm surface the page itself uses (same side of light as the page — a released template's
  // footer and bands) is a ground too; a dark band in a light system is not, its text is its own
  const warm = parseHex(p.surfaceWarm) && (contrast(p.surfaceWarm, p.bg) ?? 21) < 3 ? [p.surfaceWarm] : []
  for (const [name, colour, label] of texts) {
    if (!parseHex(colour)) continue
    // with the warm surface when some shade reads on all three; else as before, page and surface
    const r = (warm.length && onAll(colour, [p.bg, surface, ...warm])) || onAll(colour, [p.bg, surface])
    if (r && r !== colour) {
      out[name] = r
      adjusted.push(
        `${label}:${worst(colour, [p.bg, surface]).toFixed(2)}→${worst(r, [p.bg, surface]).toFixed(2)}`
      )
    } else if (name === '--ds-accent-text-hover' && out['--ds-accent-text'])
      out[name] = out['--ds-accent-text']
  }
  // 6: the text on a button stays readable on its hover and pressed fills, not only at rest.
  // Away from the button text, by its lightness (a system's accent-on is not always pure white/black);
  // when no step reaches 4.5 the hover keeps the rest fill, which the gate already proved readable.
  const away = parseHex(p.accentOn) && luminance(parseHex(p.accentOn)) > 0.5 ? '#000000' : '#ffffff'
  for (const [name, fill, label] of [
    ['--color-accent-hover', p.accentHover, 'button-hover'],
    ['--color-accent-active', p.accentActive, 'button-active']
  ]) {
    if (!parseHex(fill) || !parseHex(p.accentOn) || (contrast(p.accentOn, fill) ?? 0) >= 4.5) continue
    const r = readable(fill, p.accentOn, away) ?? p.accent
    out[name] = r
    adjusted.push(`${label}:${contrast(p.accentOn, fill).toFixed(2)}→${contrast(p.accentOn, r).toFixed(2)}`)
  }
  return { colours: out, adjusted }
}

/**
 * The CMS-neutral slot: `--ds-*` and the layout numbers, only where the profile states them.
 * `components: false` leaves out what an OpenDesign profile read off the system's reference page
 * (components.html): EmDash's three templates were measured before it was read and keep that look
 * until they are measured with it (David, 12/10/2026: EmDash works, WordPress and Joomla first).
 * @param {any} profile
 * @param {{ components?: boolean }} [opts]
 */
export function slotVars(profile, opts = {}) {
  // opts.templateDisplay, opts.templateDisplayPhone, opts.templateHeading: the template's own hero size on a
  // desktop and on a phone and its section heading size (templateSizes), which a system's may outgrow by
  // DISPLAY_OVER_TEMPLATE at most; opts.templateDisplayFace: the hero's face, whose line width holds too
  const v = {}
  const set = (name, x) => {
    if (x !== null && x !== undefined) v[name] = x
  }
  const read = opts.components !== false
  const val = (f) =>
    read || !/^components\.html|^tokens\.css \S+ = 0$/.test(String(f?.f ?? '')) ? valOf(f) : null
  const w = profile.weights
  set('--ds-weight-display', val(w.display))
  set('--ds-weight-heading', val(w.heading))
  set('--ds-weight-body', val(w.body))
  set('--ds-weight-button', val(w.button))
  const s = profile.scale
  const disp = val(s.display)
  const head = val(s.heading)
  const card = val(s.card)
  // Phone sizes are capped at the largest the template itself sets on a phone (56px display, 40px
  // heading): a 119px display line (Eddie) scaled by 0.714 is still 85px, wider than a 390px screen
  // for one long word (measured 09/10: /help 566px wide).
  if (disp) {
    // the cap holds the hero line's width, not only its size: a face that sets the same words wider than
    // the template's own takes the cap down by that much (displayWidthOver). The face is the one the
    // template's display token takes (tokens56: the system's display face, else its text face — Pitch's
    // Mark Pro does not load, and Tracy Business's hero sets Inter)
    const face = val(profile.fonts.display) ?? val(profile.fonts.body)
    const wider = face
      ? displayWidthOver(
          opts.templateDisplayFace,
          face,
          val(w.display),
          trackingEm(val(s.tracking), disp.size)
        )
      : 1
    const own = Number(opts.templateDisplay) > 0 ? heroCap(opts.templateDisplay, wider) : Infinity
    const size = Math.min(disp.size, own)
    const mono = kindOf(profile.fonts.display?.v) === 'monospace'
    set('--ds-size-display', widthCapped(size, VW_MAX.display))
    const ownPhone =
      Number(opts.templateDisplayPhone) > 0 ? heroCap(opts.templateDisplayPhone, wider) : Infinity
    set(
      '--ds-size-display-phone',
      widthCapped(
        Math.min(Math.round(size * 0.714), PHONE_MAX.display, ownPhone),
        mono ? VW_MAX.displayPhoneMono : VW_MAX.displayPhone,
        true
      )
    )
    // A 0.7 line height is right for one 200px hero line and makes wrapped headings collide: the
    // template's own tightest is 1.05, so a worn system goes no tighter than 0.95.
    if (disp.leading) set('--ds-leading-display', String(Math.max(disp.leading, 0.95)))
  }
  if (head) {
    // like the display line, a section heading grows at most DISPLAY_OVER_TEMPLATE over the template's own:
    // its layout was drawn for that size, and a system's 40px heading stood eight lines tall in JA Company's
    // narrow column drawn for 23px (Airbnb, Linear, 14/10/2026). Never under HEADING_MIN
    const own =
      Number(opts.templateHeading) > 0 ? Math.round(opts.templateHeading * DISPLAY_OVER_TEMPLATE) : Infinity
    const size = Math.max(Math.min(head.size, own), HEADING_MIN.desktop)
    set('--ds-size-heading', widthCapped(size, VW_MAX.heading))
    set(
      '--ds-size-heading-phone',
      css(Math.min(Math.max(Math.round(size * 0.7), HEADING_MIN.phone), PHONE_MAX.heading))
    )
  }
  if (card) {
    set('--ds-size-card', css(card.size))
    // a card title of 20px or less is already a phone size (BMW's 18px h3 became 13px); a larger one shrinks,
    // never under the text it heads: Notion's 22px and Mailchimp's 24px came out 16 and 17px over EmDash Tracy
    // Base's 17px card text (review 15/10/2026) — at least two pixels over the system's text size
    const text = Math.max(Number(val(s.body)?.size) || 16, 16)
    set(
      '--ds-size-card-phone',
      css(
        card.size <= 20 ? card.size : Math.max(Math.round(card.size * 0.714), Math.min(card.size, text + 2))
      )
    )
  }
  set('--ds-tracking-display', val(s.tracking))
  const sh = profile.shape
  const b = val(sh.button)
  const cr = val(sh.card)
  const ir = val(sh.input)
  if (b !== null) set('--ds-btn-radius', css(b))
  if (cr !== null) set('--ds-card-radius', css(cr))
  if (ir !== null) set('--ds-input-radius', css(ir))
  const pad = val(sh.buttonPad)
  if (pad) {
    set('--ds-btn-pad-y', css(pad.y))
    set('--ds-btn-pad-x', css(pad.x))
  }
  const dispFont = profile.fonts.display
  if (val(dispFont)) set('--ds-font-display', dispFont.stack ?? `"${dispFont.v}"`)
  // a face made only for headlines (capitals only or condensed black: Bebas Neue, which Google files as
  // sans-serif, Anton; or Google's "display" category) sets the display line and the section headings;
  // every smaller heading takes the text face, or a 13px card title is cramped capitals (Balsa on JA
  // Essence, tch-89's D2, 13/10/2026)
  const bodyFont = profile.fonts.body
  const headlineOnly =
    val(dispFont) && (HEADLINE_ONLY.has(String(dispFont.v).toLowerCase()) || kindOf(dispFont.v) === 'display')
  if (headlineOnly && val(bodyFont)) {
    set('--ds-font-headings', bodyFont.stack ?? `"${bodyFont.v}"`)
    // in the text face at the text's strong weight: the headline face's own 400 reads thin there
    set('--ds-weight-headings', String(val(w.strong) ?? 600))
  }
  // what tokens.css has no field for, read off the reference page: case and letter spacing of the
  // display line, the heading's face, the button's label, the eyebrow, the card's shadow
  const t = read ? profile.type : null
  if (t) {
    const caseOk = (x) => (['uppercase', 'lowercase', 'capitalize', 'none'].includes(x) ? x : null)
    const trackOk = (x) => (typeof x === 'string' && /^(0|-?\d*\.?\d+(em|px|rem))$/.test(x) ? x : null)
    set('--ds-transform-display', caseOk(t.display?.transform))
    if (t.heading?.face === 'body' && val(bodyFont))
      set('--ds-font-heading', bodyFont.stack ?? `"${bodyFont.v}"`)
    if (t.heading?.face === 'display' && val(dispFont))
      set('--ds-font-heading', dispFont.stack ?? `"${dispFont.v}"`)
    set('--ds-tracking-heading', trackOk(t.heading?.tracking))
    // never above the template's own label where its contract measured one (templateButtonPx): its
    // button rows were laid out around those widths
    if (typeof t.button?.size === 'number' && t.button.size >= 11 && t.button.size <= 22)
      set(
        '--ds-size-button',
        css(
          Number(opts.templateButton) > 0
            ? Math.min(t.button.size, Number(opts.templateButton))
            : t.button.size
        )
      )
    // only with the padding it goes with: the template's own button keeps its own line
    if (pad && typeof t.button?.leading === 'number' && t.button.leading >= 0.8 && t.button.leading <= 2.5)
      set('--ds-btn-leading', String(t.button.leading))
    set('--ds-transform-button', caseOk(t.button?.transform))
    set('--ds-tracking-button', trackOk(t.button?.tracking))
    const e = t.eyebrow
    if (e) {
      if (typeof e.size === 'number' && e.size >= 10 && e.size <= 18) set('--ds-eyebrow-size', css(e.size))
      if (typeof e.weight === 'number') set('--ds-eyebrow-weight', String(e.weight))
      set('--ds-eyebrow-transform', caseOk(e.transform))
      set('--ds-eyebrow-tracking', trackOk(e.tracking))
    }
    if (typeof t.card?.radius === 'number') set('--ds-card-radius', css(t.card.radius))
    if (typeof t.field?.radius === 'number') set('--ds-input-radius', css(t.field.radius))
    if (typeof t.pill?.radius === 'number') set('--ds-pill-radius', css(t.pill.radius))
    const shadow = t.card?.shadow
    if (typeof shadow === 'string' && safeValue(shadow)) set('--ds-card-shadow', shadow)
  }
  return v
}

/**
 * The tightest line a display line keeps on a page written in Vietnamese: its capitals carry stacked
 * marks (`Ấ`, `Ổ`, `Ỗ`) that rise above the cap height, so a system's 1.03 (Stripe) or 1.07 (Apple) lets
 * them touch the line above. Every slot writes it under `:lang(vi)` (the site's `<html lang>`), so an
 * English page keeps the system's own line (13/10/2026).
 */
export const STACKED_MARKS_LEADING = 1.2

/** A selector list of the slot (`:root:root… x, :root:root… y`) for a page written in Vietnamese only. */
export function onVietnamese(list) {
  return String(list)
    .split(',')
    .map((x) => x.replace(/^(\s*)((?::root)+)/, '$1$2:lang(vi)'))
    .join(',')
}

/**
 * A value goes into the sheet only if it cannot leave its declaration: source data is third-party,
 * so `;`, braces, angle brackets, backslashes, comments and `url(` are refused (the variable is then
 * not emitted and the template keeps its own value).
 */
export const safeValue = (v) =>
  typeof v === 'string' && v.length < 400 && !/[;{}<>\\]|\/\*|\*\/|url\(|@import|expression\(/i.test(v)

const MASK_PROPERTY = /^(-webkit-)?mask(-image)?$/i
// an inline SVG, percent-encoded: no quote, parenthesis, '#', backslash, semicolon, brace or angle bracket
const MASK_PICTURE = /^url\("data:image\/svg\+xml,[A-Za-z0-9%._~!$&'*+,=:@/?-]*"\)/

/**
 * A declaration of a slot contract rule goes into the sheet: its value passes `safeValue`, or it is a
 * mask (`mask`, `mask-image`, `-webkit-` too) whose picture is an inline percent-encoded
 * `data:image/svg+xml` URI followed by safe words (position, size, repeat). Rule PIC-1: an icon the
 * template shows as a closed picture in its brand colour becomes a shape the worn system paints
 * (`background-color: var(--ds-c-accent)` under the mask). A data URI fetches nothing, and the
 * character class keeps it inside its declaration.
 * @param {string} property @param {string} value
 */
export function safeDeclaration(property, value) {
  if (safeValue(value)) return true
  if (typeof value !== 'string' || value.length > 8000 || !MASK_PROPERTY.test(property)) return false
  const v = value.trim()
  const picture = MASK_PICTURE.exec(v)
  if (!picture) return false
  const rest = v.slice(picture[0].length).trim()
  return rest === '' || safeValue(rest)
}

/** A name or id inside a CSS comment: printable, no comment terminator. */
const commentSafe = (s) =>
  String(s ?? '')
    .replace(/[^\p{L}\p{N} .,:'&+_-]/gu, '')
    .slice(0, 120)

const block = (selector, vars) =>
  `${selector} {\n${Object.entries(vars)
    .map(([k, x]) => `  ${k}: ${x};`)
    .join('\n')}\n}\n`

/**
 * The stylesheet the EmDash `base` template reads (`data/ds-slot.css`). Both light and dark selectors
 * carry the SAME values: a design system is one look, so the template's own light/dark switch is
 * hidden while one is worn.
 * @returns {{ css: string, fontsHref: string | null, vars: Record<string, string> } | { refused: string[] }}
 */
/**
 * @param {object} profile
 * @param {{ omit?: string[], templateVars?: Record<string, string>, fontVars?: { body?: string[], display?: string[] }, selectors?: { themeToggle?: string } }} [contract]
 *   a template other than tracy-base (`templates/emdash-*.json`): the names it gives another meaning
 *   (`omit`: Tracy Business's `--color-accent` is a tint), its own variable family pointed at the
 *   worn colours (`templateVars`, reading `--ds-c-*`) and its theme toggle
 */
/** A Vietnamese page keeps STACKED_MARKS_LEADING on a display line set tighter (stacked tone marks). */
const viLeading = (scope, vars) =>
  Number(vars['--ds-leading-display']) < STACKED_MARKS_LEADING
    ? block(`${scope}:lang(vi)`, { '--ds-leading-display': String(STACKED_MARKS_LEADING) })
    : ''

// the page header's buttons keep the template's own padding: the header row was laid out around them, and a
// system's wider padding pushed EmDash Tracy Base's phone header (Contact, the light/dark switch, the menu)
// past the window (Toggl Track, 5px, 14/10/2026) — as Joomla keeps the button's type out of its header
const HEADER_BUTTONS = 'header { --ds-btn-pad-x: initial; --ds-btn-pad-y: initial; }\n'

export function emdashCss(profile, contract = {}) {
  const g = gate(profile)
  if (!g.ok) return { refused: g.reasons }
  const head =
    `/* tracy-ds-slot: ${commentSafe(profile.id)} (${commentSafe(profile.name)}) — generated, do not edit */\n` +
    (fontsHref(profile) ? `/* fonts: ${fontsHref(profile)} */\n` : '')
  const own = emdashSide(profile, contract)
  if (contract.modes !== true) {
    // one look: the same values on both sides of the template's switch, and the switch hidden
    const css =
      head +
      block(':root,\nhtml[data-theme="dark"]', own.vars) +
      viLeading(':root', own.vars) +
      `[data-tracy-theme-toggle]${contract.selectors?.themeToggle && safeValue(contract.selectors.themeToggle) ? `, ${contract.selectors.themeToggle}` : ''} { display: none !important; }\n` +
      HEADER_BUTTONS +
      own.rules
    return { css, fontsHref: fontsHref(profile), vars: own.vars, adjusted: own.adjusted }
  }
  // two sides (#1315, Akemi 13/10/2026): the system's own side under the side it is, the other side
  // derived from it (derive.mjs); the template's switch stays, the page opens on the system's side
  // (the theme reads the mode line)
  const native = modeOf(profile)
  const other = native === 'dark' ? 'light' : 'dark'
  const derived = emdashSide(derive(profile, other).profile, contract)
  // :root is the html element: the side selectors keep the `:root ` prefix every rule is written with
  const SIDE = { light: ':root:not([data-theme="dark"])', dark: ':root[data-theme="dark"]' }
  const rescope = (rules, side) => rules.replaceAll(':root ', `${side} `)
  const css =
    head +
    `/* mode: ${native} */\n` +
    block(SIDE[native], own.vars) +
    viLeading(SIDE[native], own.vars) +
    HEADER_BUTTONS +
    rescope(own.rules, SIDE[native]) +
    block(SIDE[other], derived.vars) +
    viLeading(SIDE[other], derived.vars) +
    rescope(derived.rules, SIDE[other])
  return {
    css,
    fontsHref: fontsHref(profile),
    vars: own.vars,
    derivedVars: derived.vars,
    mode: native,
    adjusted: [...own.adjusted, ...derived.adjusted.map((a) => `${other}:${a}`)]
  }
}

/**
 * One side of the EmDash slot: the variables of the template and the slot, and the band, text and
 * follow rules written with `:root ` in front (the caller scopes them to a side).
 * @param {object} profile
 * @param {object} contract
 * @returns {{ vars: Record<string, string>, rules: string, adjusted: string[] }}
 */
function emdashSide(profile, contract) {
  const p = palette(profile)
  const t = {
    '--color-bg': p.bg,
    '--color-surface': p.surface,
    '--color-surface-warm': p.surfaceWarm,
    '--color-fg': p.fg,
    '--color-fg-2': p.fg2,
    '--color-fg-muted': p.muted,
    '--color-fg-meta': p.meta,
    '--color-line': p.line,
    '--color-line-soft': p.lineSoft,
    '--color-accent': p.accent,
    '--color-accent-on': p.accentOn,
    '--color-accent-hover': p.accentHover,
    '--color-accent-active': p.accentActive,
    '--color-accent-tint': 'color-mix(in srgb, var(--color-accent) 10%, var(--color-bg))',
    'color-scheme': p.dark ? 'dark' : 'light'
  }
  const text = readableText(p)
  Object.assign(t, text.colours)
  const body = val(profile.fonts.body)
  if (body) t['--font-sans'] = profile.fonts.body.stack ?? `"${body}"`
  const mono = val(profile.fonts.mono)
  if (mono) t['--font-mono'] = profile.fonts.mono.stack ?? `"${mono}"`
  // no --container-site and no --band-y-*: content width and section rhythm stay the template's
  // (tokens56 layoutRules)
  // tracy-base keeps the look it was measured with (nothing read off the reference page); a theme that
  // reads the slot's type and shape tokens says so in its contract (`readsComponents`, Tracy Business).
  // The hero and section heading hold the template's own sizes and line width, as on WordPress and Joomla:
  // without them Eddie's 80px Inter stood five and six lines in tracy-base's and Tracy Business's hero
  // columns (14/10/2026)
  const slot = slotVars(profile, {
    components: contract.readsComponents === true,
    ...templateSizes(contract)
  })
  // Tailwind's `font-semibold` is how this template writes a heading in 42 places: it follows the system's heading weight.
  if (slot['--ds-weight-heading']) t['--font-weight-semibold'] = slot['--ds-weight-heading']
  // the ink role: what a band the template paints dark wears (bands.mjs groundCandidates, as Joomla and
  // WordPress): the text colour on a light system, the surface or deepened page on a dark one, and the
  // words that read on it. Before, Tracy Business's hero took the text colour under every system and
  // Moxie (black page, cream text) painted it cream (13/10/2026, #1309)
  const surface = t['--color-surface']
  const inkTokens = {
    '--bg': p.bg,
    '--surface': surface,
    '--surface-warm': p.surfaceWarm,
    '--fg': p.fg,
    '--accent': p.accent,
    '--accent-on': p.accentOn,
    '--accent-hover': t['--color-accent-hover'],
    '--accent-active': t['--color-accent-active']
  }
  const ink = groundCandidates(inkTokens, 'ink')[0] ?? p.fg
  // every role variable of this side (role-values.mjs): the one set of values a template reads, the
  // literals below and the band rules of a template not yet reading roles take theirs from it
  const roles = roleVariableValues(
    {
      ...p,
      surface,
      fg2: t['--color-fg-2'],
      muted: t['--color-fg-muted'],
      meta: t['--color-fg-meta'],
      accentHover: t['--color-accent-hover'],
      accentActive: t['--color-accent-active'],
      accentText: text.colours['--ds-accent-text'] ?? p.accent,
      accentTextHover:
        text.colours['--ds-accent-text-hover'] ?? text.colours['--ds-accent-text'] ?? p.accentHover,
      ink,
      onInk: wordsOn(inkTokens, ink)
    },
    slot,
    facesOf(profile)
  )
  // the worn colours as literals, for a template's own variable family (templateVars) and the band rules
  const lit = Object.fromEntries(
    Object.entries(roles)
      .filter(([k]) => k.startsWith('--ds-c-'))
      .map(([k, v]) => [k.slice('--ds-c-'.length), v])
  )
  // a template that reads the role variables itself (`readsRoles`: its stylesheets read var(--ds-*,
  // <own>) for every colour, corner and face) gets those and the type tokens, nothing written over its
  // own variable family; only its accent words on a worn band (bandText) still take a rule, no role
  // naming an accent that reads on a band. A published release that gives a few places the wrong role
  // (Tracy Business EmDash 1.7.22: the kit form's step labels read the ink band's meta words on the
  // card, its check marks the accent band's fill, which a dark system sinks into the page) may name
  // them in followRules (a role per property) and shapeRules (a corner token), as the releases before
  // the role line did; never its colour family, status colours or band buttons
  if (contract.readsRoles === true) {
    const vars = {
      'color-scheme': t['color-scheme'],
      '--font-weight-semibold': t['--font-weight-semibold'],
      ...slot,
      ...roles
    }
    return {
      vars: Object.fromEntries(Object.entries(vars).filter(([, v]) => v && safeValue(String(v)))),
      rules:
        bandTextRules(contract, colourVarsLiteral(text, lit), lit) +
        followRulesEmdash(contract, colourVarsLiteral(text, lit)) +
        shapeRulesEmdash(contract, slot),
      adjusted: text.adjusted
    }
  }
  const own = {
    ...roles,
    ...(contract.templateVars ? { ...colourVarsLiteral(text, lit), ...contract.templateVars } : {})
  }
  // the font variables a template reads directly, when the system states that face
  for (const v of contract.fontVars?.body ?? []) if (body && t['--font-sans']) own[v] = t['--font-sans']
  for (const v of contract.fontVars?.display ?? [])
    if (slot['--ds-font-display']) own[v] = slot['--ds-font-display']
  for (const k of contract.omit ?? []) delete t[k]
  const vars = Object.fromEntries(
    Object.entries({ ...t, ...slot, ...own }).filter(([, v]) => v && safeValue(String(v)))
  )
  // a release that does not read the roles yet (the contract of Tracy Business 1.7.6 to 1.7.19, Tracy
  // Base 0.5.0 to 0.5.4) keeps its template patches: its status colours, the corners it writes as
  // literals, the buttons and words on its painted bands, what it writes as literals on a worn ground
  Object.assign(vars, statusVarsEmdash(contract, lit))
  const rules =
    bandButtonRules(contract, colourVarsLiteral(text, lit), lit) +
    bandTextRules(contract, colourVarsLiteral(text, lit), lit) +
    followRulesEmdash(contract, colourVarsLiteral(text, lit)) +
    shapeRulesEmdash(contract, slot)
  return { vars, rules, adjusted: text.adjusted }
}

/**
 * The template's status colours (`status`: success, warning, error) tuned to the worn system, as the
 * Joomla and WordPress emitters do (tokens56): no system states them, so each is the template's hue a
 * fifth of the way toward the system's text, made to read 4.5:1 on its page; its tinted ground is that
 * colour at 8% on the page, and its text the template's own text colour moved the same way and made to
 * read on that ground. Left as the template's literals, Tracy Business EmDash kept its red error line,
 * its alerts' borders and their dark texts under every system (TPL-1, 15/10/2026), and the light
 * side's pale alert grounds glared on a dark system.
 *
 *   "status": { "<name>": { "colour": "#hex", "text": "#hex", "role"?: "danger", "vars": { "colour": "--color-error",
 *               "ground": "--color-error-bg", "text": "--color-error-fg" } } }
 * @param {{ status?: Record<string, any> }} contract @param {Record<string, string>} lit
 * @returns {Record<string, string>}
 */
function statusVarsEmdash(contract, lit) {
  const out = {}
  const page = parseHex(lit.bg) ? lit.bg : null
  if (!page || !parseHex(lit.fg)) return out
  const toward = luminance(parseHex(page)) < 0.3 ? '#ffffff' : '#000000'
  const name = (v) => (typeof v === 'string' && /^--[\w-]+$/.test(v) ? v : null)
  for (const spec of Object.values(contract.status ?? {})) {
    if (!parseHex(spec?.colour)) continue
    const colour = readable(mix(spec.colour, lit.fg, 0.2), page, toward, 4.5)
    const ground = mix(page, colour, 0.08)
    if (name(spec.vars?.colour)) out[spec.vars.colour] = colour
    // the status role by its slot name too, as Joomla and WordPress carry it: the page's own palette
    if (/^(success|warn|danger)$/.test(String(spec.role ?? ''))) out[`--ds-c-${spec.role}`] = colour
    if (name(spec.vars?.ground)) out[spec.vars.ground] = ground
    if (name(spec.vars?.text) && parseHex(spec.text)) {
      // the template's text is for its light ground: on a dark ground start from the tuned colour
      const start = toward === '#000000' ? mix(spec.text, lit.fg, 0.2) : colour
      out[spec.vars.text] = readable(start, ground, toward, 4.5)
    }
  }
  return out
}

/**
 * The corners a template writes as literals on controls the system's shape should own (`shapeRules`):
 * selector → { property: value }, the value a list of `btn`, `input`, `card` (the slot's
 * `--ds-btn-radius`, `--ds-input-radius`, `--ds-card-radius`) or `0`, one per corner. Tracy Business
 * EmDash draws four submit buttons with Tailwind classes and no `.btn-*` class (contact form, search,
 * investors' and the kit's newsletter): they stayed square while every other button wore the system's
 * pill (BTN-1, 15/10/2026). A button joined to its field takes the outer corners only ("0 btn btn 0").
 * Written only when the slot carries the token.
 * @param {{ shapeRules?: Record<string, Record<string, string>> }} contract @param {Record<string, string>} slot
 * @returns {string}
 */
function shapeRulesEmdash(contract, slot) {
  const token = { btn: '--ds-btn-radius', input: '--ds-input-radius', card: '--ds-card-radius' }
  const out = []
  for (const [sel, decls] of Object.entries(contract.shapeRules ?? {})) {
    if (typeof sel !== 'string' || !sel.trim() || /[{};<\\]|\/\*/.test(sel)) continue
    const body = []
    for (const [prop, value] of Object.entries(decls ?? {})) {
      if (prop !== 'border-radius') continue
      const parts = String(value ?? '')
        .trim()
        .split(/\s+/)
      if (!parts.length || parts.length > 4) continue
      if (!parts.every((x) => x === '0' || (token[x] && slot[token[x]]))) continue
      body.push(`border-radius: ${parts.map((x) => (x === '0' ? '0' : `var(${token[x]})`)).join(' ')};`)
    }
    if (body.length) out.push(`:root :is(${sel.trim()}) { ${body.join(' ')} }\n`)
  }
  return out.join('')
}

/**
 * The calls to action set on a band the template paints with one of the worn colours
 * (`bandButtons`): the band's ground is that colour, so the button pair is checked against it.
 * Tracy Business on EmDash paints its closing call with the readable accent (`.bg-forest`) and sets
 * the accent-filled button on it: where the two are one colour (Stripe, Spotify, Editorial, Runway:
 * every system whose accent already reads as text) the button had no edge at all (1.00:1, measured
 * 11/10/2026), and on the hero (`.band-ink`, the system's text colour) Spotify's green stood 1.92:1,
 * Runway's white 1.00:1. Each band names its ground by role, read from the worn literals:
 *
 *   "bandButtons": { "<band>": { "ground": "<role: fg, accent-text, …>", "buttons": ["<selector>"] } }
 *
 * The pair is colour.mjs `buttonPair`: the accent with its text, turned over when only its text
 * colour stands out on the band; where neither does, the template's own rule paints.
 * @param {{ bandButtons?: Record<string, { ground?: string, buttons?: string[] }> }} contract
 * @param {Record<string, string>} worn  the worn colours as `--ds-c-<role>` literals
 * @param {Record<string, string>} lit  the worn colours by role
 * @returns {string}
 */
function bandButtonRules(contract, worn, lit) {
  const out = []
  for (const [band, spec] of Object.entries(contract.bandButtons ?? {})) {
    if (!/^[.#][\w-]+(?:[.#][\w-]+|:not\([.#][\w-]+\))*$/.test(band)) continue
    const role = String(spec?.ground ?? '')
    const ground = /^[a-z-]+$/.test(role) ? worn[`--ds-c-${role}`] : null
    const buttons = (spec?.buttons ?? []).filter(
      (x) => typeof x === 'string' && x.trim() && !/[{};<\\]|\/\*/.test(x)
    )
    let pair = buttonPair(lit.accent, lit['accent-on'], lit['accent-hover'], ground)
    if (!pair || !buttons.length) continue
    // turned over on a dark page: the accent's light text as a fill is a light slab on the dark page
    // (Figma's dark side: white buttons on the lavender forest band, TPL-1 glare, 15/10/2026); the
    // page's own dark ground stands out on the light band as well and keeps the page's side
    const page = parseHex(lit.bg) ? lit.bg : null
    if (pair.turned && page && luminance(parseHex(page)) < 0.3 && (contrast(page, ground) ?? 0) >= 3) {
      const text = readable(ground, page, '#ffffff', 4.5)
      pair = { fill: page, text, hover: mix(page, ground, 0.12), turned: true }
    } else if (pair.turned && page && luminance(parseHex(page)) < 0.3) {
      // a dark band on a dark page (the ink band on Figma's dark side): the readable accent, lighter
      // than the accent, stands out where the accent did not, with the page's ground as its words
      const fill = worn['--ds-c-accent-text']
      if (parseHex(fill) && (contrast(fill, ground) ?? 0) >= 3 && (contrast(page, fill) ?? 0) >= 4.5)
        pair = { fill, text: page, hover: mix(fill, '#ffffff', 0.12), turned: true }
    }
    // one rule per button: a reader (and the tests) find each by its own selector
    for (const x of buttons)
      out.push(
        `:root ${band} ${x.trim()} { background-color: ${pair.fill}; border-color: ${pair.fill}; color: ${pair.text}; }\n`,
        `:root ${band} ${x.trim()}:hover { background-color: ${pair.hover}; border-color: ${pair.hover}; color: ${pair.text}; }\n`
      )
  }
  return out.join('')
}

/**
 * Accent-coloured words set on a band the template paints with one of the worn colours (`bandText`):
 * the accent is proven on the page ground, not on the band. Tracy Business on EmDash writes its hero's
 * second line in the signal colour on the ink band (the system's text colour): under Toggl Track the
 * pink accent on the pink ink band read 1:1, under Moxie light blue on cream (11/10/2026). Each such
 * text takes its colour (`colour`, a role, default the accent) moved the least toward black or white
 * that reads 4.5:1 on the band (the same 2% steps as colour.mjs `readable`), so it keeps the system's hue:
 *
 *   "bandText": { "<band>": { "ground": "<role>" | ["<role>", …], "tint"?: 0.12, "colour"?: "<role>",
 *                             "text": ["<selector>"] } }
 *
 * Several ground roles = a band painted between them (a gradient); `tint` = the band is also tinted
 * toward the text's own colour by that fraction (Tracy SaaS's call-to-action card: elevated → surface
 * with 12% of the readable accent at the top, where its eyebrow read 4.27 under Apple). The colour must
 * read on every one of those grounds.
 * @param {{ bandText?: Record<string, { ground?: string | string[], tint?: number, colour?: string, text?: string[] }> }} contract
 * @param {Record<string, string>} worn  the worn colours as `--ds-c-<role>` literals
 * @param {Record<string, string>} lit  the worn colours by role
 * @returns {string}
 */
function bandTextRules(contract, worn, lit) {
  const out = []
  const role = (r) => (/^[a-z-]+$/.test(String(r ?? '')) ? (worn[`--ds-c-${r}`] ?? null) : null)
  for (const [band, spec] of Object.entries(contract.bandText ?? {})) {
    if (!/^[.#][\w-]+(?:[.#][\w-]+|:not\([.#][\w-]+\))*$/.test(band)) continue
    const start = spec?.colour === undefined ? lit.accent : role(spec.colour)
    const tint = Number(spec?.tint ?? 0)
    let grounds = [].concat(spec?.ground ?? []).map(role)
    const sels = (spec?.text ?? []).filter(
      (x) => typeof x === 'string' && x.trim() && !/[{};<\\]|\/\*/.test(x)
    )
    if (!grounds.length || !grounds.every(parseHex) || !parseHex(start) || !sels.length) continue
    if (!(tint >= 0 && tint <= 0.5)) continue
    if (tint) grounds = [...grounds, ...grounds.map((g) => mix(g, start, tint))]
    const toward = readableOn(grounds[0])
    const reads = (c) => grounds.every((g) => (contrast(c, g) ?? 0) >= 4.5)
    let colour = null
    for (let t = 0; t <= 1.0001 && !colour; t += 0.02) {
      const c = t ? mix(start, toward, t) : start
      if (reads(c)) colour = c
    }
    if (!colour) continue
    for (const x of sels) out.push(`:root ${band} ${x.trim()} { color: ${colour}; }\n`)
  }
  return out.join('')
}

/**
 * What a template writes as a literal colour on a ground the system paints (`followRules`, as on Joomla
 * and WordPress): selector → { property: role }, the worn colour of that role written as a literal.
 * Tracy Business on EmDash sets its forest band's title in #F5F3EE and its active chip in #fff on the
 * forest fill, which a system turns into its readable accent (Moxie's light blue: 2.04-2.26:1,
 * re-measured 12/10/2026): they take the page colour. Unknown roles and properties are dropped.
 * @param {{ followRules?: Record<string, Record<string, string>> }} contract
 * @param {Record<string, string>} worn  the worn colours as `--ds-c-<role>` literals
 * @returns {string}
 */
function followRulesEmdash(contract, worn) {
  const out = []
  for (const [sel, decls] of Object.entries(contract.followRules ?? {})) {
    if (typeof sel !== 'string' || !sel.trim() || /[{};<\\]|\/\*/.test(sel)) continue
    const body = Object.entries(decls ?? {})
      .filter(
        ([prop, role]) =>
          /^(color|background-color|border-color|fill)$/.test(prop) && /^[a-z-]+$/.test(String(role))
      )
      .map(([prop, role]) => [prop, worn[`--ds-c-${role}`]])
      .filter(([, v]) => v && safeValue(v))
      .map(([prop, v]) => `${prop}: ${v};`)
    if (body.length) out.push(`:root :is(${sel.trim()}) { ${body.join(' ')} }\n`)
  }
  return out.join('')
}

/**
 * The ground of a band a template paints dark (`ink`) and the text on it (`on-ink`). Under a light
 * system the band takes the system's text colour and its words the page's: a dark band on a light
 * page, as the template drew it. Under a dark system the page is dark already: the band stays dark, a
 * step lifted off the page (the system's surface when it is one, else its page 6% toward its text),
 * and its words take the system's text. Before, the band took the text colour on both sides of light
 * and turned light under every dark system: Spotify's hero went white under its green words (1.9:1),
 * Moxie's cream (13/10/2026).
 * @param {ReturnType<typeof palette>} p
 * @param {string | undefined} surface  the worn surface (readableText may have replaced the stated one)
 */
export function inkPair(p, surface) {
  if (!p.dark) return { ink: p.fg, 'on-ink': p.bg }
  const step = contrast(surface, p.bg) ?? 1
  const lifted = parseHex(surface) && step >= 1.05 && step <= 1.6 ? surface : mix(p.bg, p.fg, 0.06)
  return { ink: lifted, 'on-ink': p.fg }
}

// colourVars with literal values (EmDash writes the worn colours themselves, not references)
function colourVarsLiteral(text, lit) {
  const o = {}
  for (const [n, v] of Object.entries(lit)) if (v) o[`--ds-c-${n}`] = v
  o['--ds-c-accent-text'] = text.colours['--ds-accent-text'] ?? lit.accent
  o['--ds-c-accent-text-hover'] = text.colours['--ds-accent-text-hover'] ?? lit['accent-hover']
  // a status colour's words, as colourVars gives them on Joomla and WordPress (tokens56 text.colours)
  for (const r of ['success', 'warn', 'danger']) {
    const shade = text.colours[`--color-${r}-text`] ?? lit[r]
    if (shade) o[`--ds-c-${r}-text`] = shade
  }
  return o
}

export { distance }
