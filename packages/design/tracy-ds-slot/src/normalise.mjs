/**
 * Design system → profile (`tracy-ds-profile/v1`). PURE: no I/O, so the same call runs in the gate,
 * the CLI and the tests. The sources (Refero, OpenDesign) are read, never edited.
 *
 * Every field is `{ v, s, f }`: value, status, and where it came from.
 *   stated       the source says it in a structured field
 *   derived      computed from stated fields by a fixed rule (never a guess at brand intent)
 *   substituted  a different family stood in because the named one is not on Google Fonts
 *   empty        the source does not say it; the template keeps ITS OWN value
 * A field that cannot be proven is `empty`. Nothing is invented.
 */
import { contrast, distance, luminance, mix, parseHex, readable, readableOn, toHex } from './colour.mjs'
import { fromStack, kindOf, nearestWeight, REFUSED_KINDS, resolveFont, stackOf, weightsOf } from './fonts.mjs'

export const SCHEMA = 'tracy-ds-profile/v1'

const empty = (why) => ({ v: null, s: 'empty', f: why ?? null })
const stated = (v, f) => ({ v, s: 'stated', f })
const derived = (v, f) => ({ v, s: 'derived', f })

/** `"1000px"` → 1000 · `"8-14px"` → { range:[8,14] } · anything else → null. */
export function px(text) {
  const s = String(text ?? '').trim()
  const one = /^(\d+(?:\.\d+)?)\s*px$/i.exec(s)
  if (one) return { v: Number(one[1]) }
  const r = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*px$/i.exec(s)
  if (r) return { v: Number(r[1]), range: [Number(r[1]), Number(r[2])] }
  return null
}

const pxField = (text, f) => {
  const p = px(text)
  if (!p) return empty(f)
  return p.range ? { v: p.v, s: 'derived', f, range: p.range } : stated(p.v, f)
}

/** The "Quick Color Reference" lines of a Refero system's "Agent Prompt Guide". */
export function quickColours(system) {
  const sec = (system.customSections ?? []).find((c) => /prompt guide/i.test(c.title ?? ''))
  const text = String(sec?.content ?? '')
  const out = {}
  const block = /Quick Color Reference([\s\S]*?)(?:\n\s*\*\*|$)/i.exec(text)?.[1] ?? text
  for (const m of block.matchAll(/^\s*[-*]\s*([a-z][a-z ]{1,24}?)\s*:\s*(#[0-9a-fA-F]+)\b/gim)) {
    const key = m[1].trim().toLowerCase()
    if (parseHex(m[2]) && !(key in out)) out[key] = m[2].toLowerCase()
  }
  return out
}

const hexOf = (v) => (parseHex(v) ? String(v).toLowerCase() : null)

/** Pick a colour from the structured list by the words in its role. */
function byRole(system, re, group) {
  for (const c of system.colors ?? []) {
    if (group && c.group !== group) continue
    if (re.test(String(c.role ?? '')) && hexOf(c.hex) && !c.gradient) return hexOf(c.hex)
  }
  return null
}

const HEX = String.raw`#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b`
const LABEL_WORDS = { white: '#ffffff', black: '#000000' }

/** The hex a prose clause gives `what` ("Background #0075de", "#0071e3 background", "Magenta (#e57cd8) background"). */
function hexFor(text, what) {
  const after = new RegExp(
    String.raw`\b(?:${what})(?:[- ]colou?r)?\s*(?:of|is|in|:)?\s*(?:[A-Za-z ]{0,20}\(\s*)?(${HEX})`,
    'i'
  ).exec(text)
  const before = new RegExp(String.raw`(${HEX})\s*\)?\s*(?:${what})\b`, 'i').exec(text)
  // the nearer of the two to its word, when both are there ("Bone (#fefbfa) text" next to "text #…")
  const m = [after, before].filter(Boolean).sort((a, b) => a[0].length - b[0].length)[0]
  return m ? hexOf(m[1]) : null
}

/**
 * The system's primary filled button as its components describe it in prose: "Background #0075de,
 * text #ffffff at 14px NotionInter weight 500, border-radius 8px, padding 6px 15px"; "Magenta
 * (#e57cd8) background, Bone (#fefbfa) text, 26px border-radius". Only a component the source names
 * primary, CTA or main: Spotify's "Pill Button (Filled White)" is a button, not its action colour.
 * Null when no such component states a fill.
 * @param {any} system  a Refero `design-system.json`
 */
export function primaryButton(system) {
  const name = (c) => String(c.name ?? '')
  const primary = (c) =>
    /\b(primary|cta|main)\b/i.test(name(c)) &&
    !/ghost|outline|secondary|tertiary|\btext\b|link|inverse|inverted|white|group|nav/i.test(name(c))
  for (const c of (system.components ?? []).filter(primary)) {
    const d = String(c.description ?? '')
    const fill = hexFor(d, 'background|fill')
    if (!fill) continue
    const word = /\b(white|black)\s+(?:text|label)\b/i.exec(d)?.[1]?.toLowerCase()
    const label = hexFor(d, 'text|label') ?? (word ? LABEL_WORDS[word] : null)
    const num = (re) => {
      const m = re.exec(d)
      return m ? Number(m[1]) : null
    }
    const pad =
      /padding[:\s]*(\d+(?:\.\d+)?)px\s*(?:vertical\s*)?(?:[×x]\s*)?(\d+(?:\.\d+)?)px/i.exec(d) ??
      /(\d+(?:\.\d+)?)px\s*vertical\s*[×x/]\s*(\d+(?:\.\d+)?)px\s*horizontal/i.exec(d)
    const size =
      num(/\bat\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*\d+)?\s*px/i) ?? num(/(\d+(?:\.\d+)?)px\s+(?:text|label)/i)
    const track =
      /letter-spacing[:\s]*(-?\d*\.?\d+)\s*(px|em)\b/i.exec(d) ??
      /(-?\d*\.?\d+)(em)\s+(?:tracking|letter-spacing)/i.exec(d)
    const tracking = track
      ? track[2].toLowerCase() === 'em'
        ? `${Number(track[1])}em`
        : size
          ? `${Math.round((Number(track[1]) / size) * 1000) / 1000}em`
          : null
      : null
    return {
      from: `components[${name(c)}]`,
      fill,
      label,
      radius:
        num(/(\d+(?:\.\d+)?)px\s*(?:border-)?radius/i) ?? num(/radius[:\s]*(?:of\s*)?(\d+(?:\.\d+)?)px/i),
      pad: pad ? { y: Number(pad[1]), x: Number(pad[2]) } : null,
      weight: num(/weight\s*(\d{3})/i),
      size,
      transform: /\buppercase\b|all[- ]caps/i.test(d) ? 'uppercase' : null,
      tracking
    }
  }
  return null
}

// what a colour's role says when it is NOT the page's main text ("Muted body text", "Secondary headings")
const NOT_MAIN_TEXT =
  /muted|secondary|tertiary|placeholder|inactive|helper|disabled|caption|subtle|button text/i
const MAIN_TEXT = /primary text|primary heading|\bheadings?\b|headline|body (?:text|copy)|main text|\bink\b/i

function refero_colours(system) {
  const q = quickColours(system)
  const pick = (names, rolePattern, group) => {
    for (const n of names) if (q[n]) return stated(q[n], `quick:${n}`)
    const r = rolePattern ? byRole(system, rolePattern, group) : null
    return r ? stated(r, 'colors[].role') : null
  }
  const level0 = hexOf(system.surfaces?.find((s) => s.level === 0)?.hex)
  // the page's own ground before any colour that merely says "canvas": Toggl Track's first colour is
  // its "Hero, header, and footer canvases" plum, its page is Bone (13/10/2026)
  const bg =
    pick(
      ['background', 'page background', 'canvas', 'background canvas'],
      /page canvas|page background|background of the page/i
    ) ??
    (level0 ? stated(level0, 'surfaces[0]') : null) ??
    pick([], /canvas/i)
  // the main text reads on that ground and is not one the source calls muted or secondary: Linear's
  // first "body text" is its "Muted body text" #62666d, 3.45:1 on its page (13/10/2026)
  const mainText = () => {
    for (const c of system.colors ?? []) {
      const h = hexOf(c.hex)
      const role = String(c.role ?? '').split(/[—–:;.(]/)[0]
      if (!h || c.gradient || !MAIN_TEXT.test(role) || NOT_MAIN_TEXT.test(role)) continue
      if (bg && (contrast(h, bg.v) ?? 0) < 4.5) continue
      return stated(h, 'colors[].role')
    }
    return null
  }
  const fg =
    pick(['text', 'primary text', 'text primary', 'foreground'], null) ??
    mainText() ??
    pick([], /primary text|body text|headline|main text/i)
  const c = { bg: bg ?? empty('no background'), fg: fg ?? empty('no foreground') }
  const b = parseHex(c.bg.v)
  const f = parseHex(c.fg.v)
  const brand = byRole(system, /./, 'brand')
  const button = primaryButton(system)
  // the action colour: what the source calls its primary action, else the fill of the button it
  // names primary, before a colour it calls an "accent" (Pitch's accent is a decorative yellow; its
  // primary button is violet), else its brand
  const accentQ =
    pick(['primary action'], null) ??
    (button ? stated(button.fill, button.from) : null) ??
    pick(['cta button fill', 'cta fill', 'primary button', 'button fill', 'cta', 'action', 'accent'], null)
  if (accentQ) c.accent = accentQ
  else if (brand) c.accent = derived(brand, 'colors[group=brand][0] (no CTA colour stated)')
  else if (f) c.accent = derived(c.fg.v, 'fg (no CTA colour stated)')
  else c.accent = empty('no accent')
  // the label the source puts on that fill when it reads (Notion's white on its blue); a label that
  // reads just under AA keeps its colour and the fill steps darker or lighter until it does
  // (Voiceflow's white on #397dff, 3.9:1) — a black label on a brand that is never black is a
  // different system
  const label = button && button.fill === c.accent.v ? button.label : null
  if (label && parseHex(c.accent.v) && (contrast(label, c.accent.v) ?? 0) >= 4.5)
    c.accentOn = stated(label, button.from)
  else if (label && parseHex(c.accent.v)) {
    const away = luminance(parseHex(label)) > 0.5 ? '#000000' : '#ffffff'
    const moved = readable(c.accent.v, label, away)
    if (moved && distance(moved, c.accent.v) <= 60) {
      c.accent = derived(moved, `${c.accent.f}, stepped until its label ${label} reads`)
      c.accentOn = stated(label, button.from)
    } else c.accentOn = derived(readableOn(c.accent.v), 'readable on accent')
  } else
    c.accentOn = parseHex(c.accent.v)
      ? derived(readableOn(c.accent.v), 'readable on accent')
      : empty('no accent')
  // the level the source names its cards' first (Spotify's level 1 is its #000 canvas, its "Card" is
  // #1f1f1f: its cards had vanished into the page; Figma's "Card" is its white canvas, set apart by a
  // line), else level 1 as the sources mostly number it
  const surfaceQ =
    // a level named plainly "Card" (Stripe's "Frosted Card" is its border and hover wash)
    system.surfaces?.find(
      (x) => /^(content )?cards?( surface)?$/i.test(String(x.name ?? '').trim()) && hexOf(x.hex)
    ) ?? system.surfaces?.find((x) => x.level === 1 && hexOf(x.hex))
  if (surfaceQ) c.surface = stated(hexOf(surfaceQ.hex), `surfaces[level ${surfaceQ.level}]`)
  else c.surface = b && f ? derived(mix(c.bg.v, c.fg.v, 0.05), 'mix(bg, fg, 5%)') : empty('needs bg and fg')
  const borderQ = q.border
  if (borderQ) c.border = stated(borderQ, 'quick:border')
  else c.border = b && f ? derived(mix(c.bg.v, c.fg.v, 0.16), 'mix(bg, fg, 16%)') : empty('needs bg and fg')
  // a colour the source says sets TEXT first ("Secondary text, metadata" over "Muted UI elements": Spotify)
  const mutedQ =
    byRole(system, /\b(muted|secondary) (body )?(text|copy)\b/i, 'neutral') ??
    byRole(system, /muted|secondary text|caption|meta/i, 'neutral')
  if (mutedQ) c.muted = stated(mutedQ, 'colors[].role')
  else c.muted = b && f ? derived(mix(c.fg.v, c.bg.v, 0.42), 'mix(fg, bg, 42%)') : empty('needs bg and fg')
  return c
}

const WEIGHT_IN_TEXT = /weight\s*(\d{3})/i

/** The first clause of a Refero role ("Body copy — …", "Display headlines, …"): where the role is SAID. */
const headOf = (t) =>
  String(t?.role ?? '')
    .split(/[—–:;,.(]/)[0]
    .trim()
    .toLowerCase()
const IS_MONO = (t) => /\bmono\b|monospace|\bcode\b/i.test(`${t.family} ${headOf(t)}`)
const IS_SOLE = (t) =>
  /\bsole\b|single[- ]family|only typeface|one typeface|entire|every (ui|text)|all text|universal/.test(
    headOf(t)
  )
const HEAD_DISPLAY = /display|heading|headline|hero|title|wordmark|logo|editorial/
const HEAD_BODY =
  /body|\bui\b|interface|workhorse|copy|\btext\b|paragraph|navigation|reading|primary typeface|primary sans/
// A mono face that is a companion (code, data, labels) is never the display or body face; a mono face
// the source names as THE face (MotherDuck: "Universal brand face — headlines, body, nav…") is.
const COMPANION =
  /code|data|label|companion|snippet|numer|technical|tabular|eyebrow|overline|caption|metadata|micro|tagline|chrome|\btags?\b|stamp|trademark/
const mainFace = (t) =>
  !IS_MONO(t) ||
  (!COMPANION.test(headOf(t)) && (IS_SOLE(t) || HEAD_DISPLAY.test(headOf(t)) || HEAD_BODY.test(headOf(t))))

// A face the source keeps for a wordmark or an accent ("Wordmark only — a hand-drawn cursive",
// "Handwritten accent for emotional kickers") sets no heading and no running text, unless the first
// clause of its role also names headings or body ("Brand wordmark, hero display headlines, section
// headings, editorial body": Fallen Grape's Romie stays its display face).
const ACCENT = /accent|wordmark|logo|handwrit|hand-drawn|script|calligraph|decorative|ornament|flourish/
const NAMES_HEADINGS = /display|heading|headline|title|\bbody\b|\bui\b/
const clauseOf = (t) =>
  String(t?.role ?? '')
    .split(/[—–:;.(]/)[0]
    .toLowerCase()
const isAccent = (t) => ACCENT.test(clauseOf(t)) && !NAMES_HEADINGS.test(clauseOf(t))
// The face a system calls its main one ("Primary voice — every editorial moment", "Primary serif face").
const PRIMARY = /\bprimary\b|\bmain\b|universal|everywhere/
/** Whether `t` can be worn in `role`: some family of it (named, else a substitute) is not of a refused kind. */
const wearable = (t, role) => !resolveFont(t.family, t.substitute, REFUSED_KINDS[role]).refused

/**
 * Which family is display and which is body. Decided by the head of each role, never by a word
 * anywhere in it ("Universal UI font … for body and headings" is a body font that also mentions
 * headings — measured 09/10: reading the whole role swapped display and body in 104 systems, and
 * let a mono "data label" font become the body font in 109).
 * The body is always a text face and the display face never a script (Google's own category,
 * {@link REFUSED_KINDS}); an accent face is neither. When no face says "body", the face that sets
 * "headings and body" is the body, before whatever face happens to be listed next (Acctual's body was
 * its signature script Caveat, 12/10/2026).
 */
export function fontRoles(typography) {
  const typo = (typography ?? []).filter((t) => !/detected in extracted data but not/i.test(t.role ?? ''))
  const main = typo.filter((t) => mainFace(t) && !isAccent(t))
  const forDisplay = main.filter((t) => wearable(t, 'display'))
  const forBody = main.filter((t) => wearable(t, 'body'))
  const display =
    forDisplay.find((t) => HEAD_DISPLAY.test(headOf(t)) && !HEAD_BODY.test(headOf(t))) ??
    forDisplay.find((t) => HEAD_DISPLAY.test(headOf(t))) ??
    forDisplay.find(IS_SOLE) ??
    forDisplay.find((t) => /display|headline|heading/i.test(t.role ?? '') && !HEAD_BODY.test(headOf(t))) ??
    null
  // "Primary body, UI labels" over "Secondary body and footer text" (Oevra, 09/10).
  const minor = (t) => /secondary|footer|micro|caption|label|small|fine print|legal/.test(headOf(t))
  const body =
    forBody.find(
      (t) => t !== display && HEAD_BODY.test(headOf(t)) && !HEAD_DISPLAY.test(headOf(t)) && !minor(t)
    ) ??
    // the system's one face before a secondary one ("Universal brand face" over "Secondary face for UI text")
    forBody.find(IS_SOLE) ??
    forBody.find((t) => t !== display && HEAD_BODY.test(headOf(t)) && !HEAD_DISPLAY.test(headOf(t))) ??
    forBody.find((t) => t !== display && HEAD_BODY.test(headOf(t))) ??
    // the face for "headings and body", or the main one, when it can be loaded (Shopify's main face is
    // not on Google and names no substitute: its secondary Inter stays the body)
    forBody.find(
      (t) =>
        t === display &&
        (HEAD_BODY.test(headOf(t)) || PRIMARY.test(headOf(t))) &&
        resolveFont(t.family, t.substitute, REFUSED_KINDS.body).family
    ) ??
    forBody.find((t) => t !== display && !minor(t)) ??
    // a mono face that is the system's own voice, not a code or label companion (Rou Hun Fan)
    typo.find(
      (t) => IS_MONO(t) && !COMPANION.test(headOf(t)) && !minor(t) && !isAccent(t) && wearable(t, 'body')
    ) ??
    forBody.find((t) => t !== display) ??
    forBody.find((t) => t === display) ??
    null
  const mono = typo.find(IS_MONO) ?? null
  return { display: display ?? (body && wearable(body, 'display') ? body : null), body, mono }
}

function refero_fonts(system) {
  const { display, body, mono } = fontRoles(system.typography)
  const one = (t, role) => {
    if (!t) return empty(`no ${role} font`)
    const r = resolveFont(t.family, t.substitute, REFUSED_KINDS[role] ?? [])
    const wants = [...String(t.weight ?? '').matchAll(/\d{3}/g)].map((m) => Number(m[0]))
    return {
      v: r.family,
      s: r.status,
      f: `typography[${role}]`,
      source: r.source,
      substituteOf: r.substituteOf ?? null,
      named: String(t.family).trim(),
      stack: r.family ? stackOf(r.family) : null,
      load:
        r.family && r.source === 'google'
          ? [{ family: r.family, weights: weightsOf(r.family, wants.length ? wants : [400]) }]
          : []
    }
  }
  return {
    display: one(display, 'display'),
    body: one(body, 'body'),
    mono: mono ? one(mono, 'mono') : empty('no mono font'),
    _raw: { display, body }
  }
}

function refero_weights(system, fonts) {
  const { display, body } = fonts._raw
  const clamp = (font, want) => (font?.v ? (nearestWeight(font.v, want) ?? want) : want)
  const w = {}
  const dText = WEIGHT_IN_TEXT.exec(display?.role ?? '')
  const dList = [...String(display?.weight ?? '').matchAll(/\d{3}/g)].map((m) => Number(m[0]))
  const bText = WEIGHT_IN_TEXT.exec(body?.role ?? '')
  const bList = [...String(body?.weight ?? '').matchAll(/\d{3}/g)].map((m) => Number(m[0]))
  w.display = dText
    ? stated(clamp(fonts.display, Number(dText[1])), 'typography[display].role')
    : dList.length
      ? stated(clamp(fonts.display, dList[0]), 'typography[display].weight[0]')
      : empty('no display weight')
  w.heading = w.display.v !== null ? derived(w.display.v, 'same as display') : empty('no display weight')
  w.body = bText
    ? stated(clamp(fonts.body, Number(bText[1])), 'typography[body].role')
    : bList.length
      ? stated(clamp(fonts.body, bList.includes(400) ? 400 : bList[0]), 'typography[body].weight')
      : empty('no body weight')
  const strongList = bList.filter((n) => n > (w.body.v ?? 400) && n <= 700)
  w.strong = strongList.length
    ? derived(clamp(fonts.body, Math.max(...strongList)), 'heaviest body weight ≤ 700')
    : empty('no heavier body weight')
  const primary = primaryButton(system)
  const btn = (system.components ?? []).find((c) => /button|cta|pill/i.test(c.name ?? ''))
  const bw = WEIGHT_IN_TEXT.exec(btn?.description ?? '')
  // the primary button's own weight first: the first button listed may be a nav pill
  w.button = primary?.weight
    ? stated(clamp(fonts.body, primary.weight), `${primary.from}.description`)
    : bw
      ? stated(clamp(fonts.body, Number(bw[1])), 'components[button].description')
      : empty('no button weight')
  return w
}

function refero_scale(system) {
  const by = Object.fromEntries((system.typeScale ?? []).map((s) => [s.role, s]))
  const of = (role, f) => {
    const s = by[role]
    if (!s || !(s.size > 0)) return empty(f)
    // Refero writes lineHeight as a ratio (1.1) or, in some systems, as pixels (83 on a 119px line):
    // a value above 4 is pixels and becomes a ratio, so it can never multiply the font size.
    const lh = Number(s.lineHeight)
    const leading = lh > 4 ? Math.round((lh / Number(s.size)) * 100) / 100 : lh > 0 ? lh : null
    return { v: { size: Number(s.size), leading }, s: 'stated', f: `typeScale[${role}]` }
  }
  const display = of('display', 'typeScale[display]')
  const heading = of('heading', 'typeScale[heading]')
  const card = of('heading-sm', 'typeScale[heading-sm]')
  const body = of('body', 'typeScale[body]')
  // Tracking comes from the structured scale only (px on that step, turned into em so it scales with
  // whatever size it is set on). The prose `letterSpacing` mixes label sizes, ranges and a Unicode
  // minus: reading it flipped the sign in 30 systems (measured 09/10/2026).
  const step = ['display', 'display-lg', 'display-xl', 'hero']
    .map((r) => by[r])
    .find((x) => x && Number(x.size) > 0 && typeof x.letterSpacing === 'number')
  const tracking = step
    ? derived(
        `${Math.round((step.letterSpacing / Number(step.size)) * 1000) / 1000}em`,
        `typeScale[${step.role}].letterSpacing / size`
      )
    : empty('no structured tracking')
  return { display, heading, card, body, tracking }
}

function refero_shape(system) {
  const r = system.spacing?.radius ?? {}
  const get = (...keys) => {
    for (const k of keys) {
      const hit = Object.entries(r).find(([name]) => name.toLowerCase() === k)
      if (hit) return pxField(hit[1], `spacing.radius.${hit[0]}`)
    }
    return empty('not stated')
  }
  const btn = (system.components ?? []).find((c) => /button|cta|pill/i.test(c.name ?? ''))
  const pad = /(\d+)px\s*vertical\s*\/\s*(\d+)px\s*horizontal/i.exec(btn?.description ?? '')
  const primary = primaryButton(system)
  const radius = get('buttons', 'button')
  return {
    button:
      radius.s === 'empty' && primary?.radius != null
        ? stated(primary.radius, `${primary.from}.description`)
        : radius,
    card: get('cards', 'card'),
    input: get('inputs', 'input'),
    buttonPad: primary?.pad
      ? stated(primary.pad, `${primary.from}.description`)
      : pad
        ? stated({ y: Number(pad[1]), x: Number(pad[2]) }, 'components[button].description')
        : empty('not stated')
  }
}

/** A CSS shadow a card component states ("soft shadow rgba(0,0,0,0.15) 0px 3px 10px"), or null. */
const SHADOW =
  /shadow[:\s]*((?:rgba?\([\d\s.,%]+\)\s*)?(?:-?\d+(?:\.\d+)?(?:px)?\s+){2,3}-?\d+(?:\.\d+)?px(?:\s*rgba?\([\d\s.,%]+\))?)/i

/**
 * What the 56 tokens have no field for, from a Refero style's components (the same shape an
 * OpenDesign profile reads off its reference page): the primary button's label (size, case,
 * tracking), the plain card's shadow, the pill's radius. What the prose does not say stays null.
 */
function refero_type(system) {
  const b = primaryButton(system)
  const card = (system.components ?? []).find(
    (c) =>
      /\bcards?\b/i.test(c.name ?? '') &&
      !/testimonial|cookie|hero|chat|stat|calendar|table|kanban|data|dark|accent|highlight|floating/i.test(
        c.name ?? ''
      )
  )
  const shadow = /\bno (?:visible )?shadow\b/i.test(card?.description ?? '')
    ? null
    : (SHADOW.exec(card?.description ?? '')?.[1]?.trim() ?? null)
  const r = system.spacing?.radius ?? {}
  const pill = Object.entries(r).find(([k]) => /^(pills?|tags?|badges?)$/i.test(k))
  const pillPx = pill ? px(pill[1]) : null
  return {
    display: { transform: null },
    heading: { face: null, tracking: null },
    button: {
      size: b?.size ?? null,
      leading: null,
      transform: b?.transform ?? null,
      tracking: b?.tracking ?? null
    },
    eyebrow: null,
    card: shadow ? { radius: null, pad: null, shadow } : null,
    field: null,
    pill: pillPx && !pillPx.range ? { radius: pillPx.v } : null,
    source: 'refero components'
  }
}

function refero_layout(system) {
  const sp = system.spacing ?? {}
  return {
    container: pxField(sp.pageMaxWidth, 'spacing.pageMaxWidth'),
    sectionY: pxField(sp.sectionGap, 'spacing.sectionGap')
  }
}

const modeOf = (bg) => (parseHex(bg) ? (luminance(parseHex(bg)) < 0.3 ? 'dark' : 'light') : null)

/**
 * A Refero style → profile. `manifest` is the per-style `manifest.json` (id, name, theme, url).
 * @param {object} system  `design-system.json`
 * @param {object} manifest
 */
export function fromRefero(system, manifest) {
  const colors = refero_colours(system)
  const fonts = refero_fonts(system)
  const weights = refero_weights(system, fonts)
  const { _raw, ...fontOut } = fonts
  return finish({
    id: `refero:${manifest.id}`,
    name: manifest.name,
    source: 'refero',
    sourceUrl: manifest.url,
    sourceWebsite: manifest.sourceWebsite ?? null,
    sourceTheme: manifest.theme ?? system.theme ?? null,
    colors,
    fonts: fontOut,
    weights,
    scale: refero_scale(system),
    shape: refero_shape(system),
    type: refero_type(system),
    layout: refero_layout(system)
  })
}

// ── OpenDesign ───────────────────────────────────────────────────────────────────────────────

const REF = /var\(\s*(--[\w-]+)\s*\)/

/** Resolve one level of `var(--x)` inside a tokens map. */
const res = (tokens, name) => {
  let v = tokens[name]
  for (let i = 0; i < 4 && typeof v === 'string' && REF.test(v); i++)
    v = v.replace(REF, (_, n) => tokens[n] ?? '')
  return typeof v === 'string' ? v.trim() : null
}

/**
 * An OpenDesign system → profile, from its 56 tokens (`tokensOf(tokens.css)`) and what its reference
 * page says its components look like (`components`, src/components.mjs: weights, the type scale, case
 * and letter spacing, the button's shape and padding, the card's radius and shadow, the eyebrow).
 * @param {Record<string, string>} tokens
 * @param {{ id: string, name: string }} meta
 * @param {ReturnType<typeof import('./components.mjs').componentsOf> | null} [components]
 */
export function fromOpenDesign(tokens, meta, components = null) {
  const hex = (n) => {
    const v = res(tokens, n)
    return v && parseHex(v)
      ? stated(v.toLowerCase(), `tokens.css ${n}`)
      : empty(`tokens.css ${n} is not a plain hex`)
  }
  const colors = {
    bg: hex('--bg'),
    fg: hex('--fg'),
    surface: hex('--surface'),
    muted: hex('--muted'),
    border: hex('--border'),
    accent: hex('--accent'),
    accentOn: hex('--accent-on'),
    accentHover: hex('--accent-hover')
  }
  const font = (name) => {
    const raw = res(tokens, name)
    if (!raw) return empty(`${name} missing`)
    const r = fromStack(raw)
    return {
      v: r.s === 'substituted' ? r.load[0].family : r.named,
      s: r.s,
      f: `tokens.css ${name}`,
      source: 'stack',
      named: r.named,
      substituteOf: r.substituteOf ?? null,
      stack: r.v,
      load: r.load
    }
  }
  const radius = (name) => {
    // `0` is a radius (BMW's square corners) though it carries no unit
    const zero = res(tokens, name) === '0'
    const p = zero ? { v: 0 } : px(res(tokens, name))
    // named apart: read since 12/10/2026, so a slot that keeps its measured look skips it (slotVars)
    return p
      ? stated(p.v, zero ? `tokens.css ${name} = 0` : `tokens.css ${name}`)
      : empty(`tokens.css ${name}`)
  }
  const cont = px(res(tokens, '--container-max'))
  const sec = px(res(tokens, '--section-y-desktop'))
  const c = components ?? {}
  return finish({
    id: `od:${meta.id}`,
    name: meta.name,
    source: 'opendesign',
    sourceUrl: null,
    sourceWebsite: null,
    sourceTheme: null,
    colors,
    fonts: { display: font('--font-display'), body: font('--font-body'), mono: font('--font-mono') },
    // tokens.css carries no weight, case or button shape: those come from the system's own reference
    // page (components.html, src/components.mjs), stated with where they were read; what it does not
    // say stays empty, never guessed
    ...odComponentFields(c, tokens, radius),
    layout: {
      container: cont ? stated(cont.v, 'tokens.css --container-max') : empty('--container-max'),
      sectionY: sec ? stated(sec.v, 'tokens.css --section-y-desktop') : empty('--section-y-desktop')
    },
    extraColours: {
      fg2: hex('--fg-2'),
      meta: hex('--meta'),
      borderSoft: hex('--border-soft'),
      accentActive: hex('--accent-active'),
      surfaceWarm: hex('--surface-warm'),
      surfaceHover: hex('--surface-hover')
    }
  })
}

/** Below this a fixture's h1 is a page title, not a display line (Spotify's 24px): left the template's. */
const DISPLAY_MIN = 40
/** Below this an h2 is a label, not a section heading. */
const HEADING_MIN = 22

/**
 * The weights, scale, shape and type of an OpenDesign profile from its components (components.mjs),
 * each field stated with the rule it was read from.
 */
function odComponentFields(c, tokens, radius) {
  const at = (sel, prop) => `components.html ${sel} ${prop}`
  const num = (x) => typeof x === 'number' && Number.isFinite(x)
  const weight = (part, sel) =>
    num(c[part]?.weight)
      ? stated(c[part].weight, at(sel, 'font-weight'))
      : empty(`components.html ${sel}: no weight`)
  const size = (part, sel, min, token) => {
    const x = c[part]
    if (num(x?.size) && x.size >= min)
      return stated({ size: x.size, leading: x.leading ?? null }, at(sel, 'font-size'))
    // the scale's own top step, when the reference page's rule is a title rather than the display line
    const t = px(res(tokens, token))
    return t && t.v >= min
      ? stated({ size: t.v, leading: x?.leading ?? null }, `tokens.css ${token}`)
      : empty(`components.html ${sel}: no ${min}px+ size`)
  }
  const b = c.button ?? {}
  const zeroOk = (x) => num(x) && x >= 0
  return {
    weights: {
      display: weight('display', 'h1'),
      heading: weight('heading', 'h2'),
      body: num(c.body?.weight)
        ? stated(c.body.weight, at('body', 'font-weight'))
        : empty('components.html body: no weight'),
      strong: empty('not read'),
      button: num(b.weight)
        ? stated(b.weight, at('.btn', 'font-weight'))
        : empty('components.html .btn: no weight')
    },
    scale: {
      display: size('display', 'h1', DISPLAY_MIN, '--text-4xl'),
      heading: size('heading', 'h2', HEADING_MIN, '--text-2xl'),
      card: num(c.subheading?.size)
        ? stated({ size: c.subheading.size, leading: c.subheading.leading ?? null }, at('h3', 'font-size'))
        : empty('components.html h3: no size'),
      body: num(c.body?.size)
        ? stated({ size: c.body.size, leading: c.body.leading ?? null }, at('body', 'font-size'))
        : empty('components.html body: no size'),
      tracking: c.display?.tracking
        ? stated(c.display.tracking, at('h1', 'letter-spacing'))
        : empty('components.html h1: no letter-spacing')
    },
    shape: {
      button: zeroOk(b.radius)
        ? stated(b.radius, at('.btn', 'border-radius'))
        : empty('components.html .btn: no radius'),
      // the card's and field's radius stay the tokens' (what EmDash was measured with); the reference
      // page's own, when it states one, rides in `type` for the slots that read it
      card: radius('--radius-lg'),
      input: radius('--radius-sm'),
      buttonPad:
        b.pad && num(b.pad.y) && num(b.pad.x)
          ? stated(b.pad, at('.btn', 'padding'))
          : empty('components.html .btn: no padding')
    },
    // what tokens.css has no field for at all: case and spacing of the display, heading face, button
    // label, eyebrow, card padding and shadow
    type: {
      display: { transform: c.display?.transform ?? null },
      heading: { face: c.heading?.face ?? null, tracking: c.heading?.tracking ?? null },
      button: {
        size: num(b.size) ? b.size : null,
        leading: num(b.leading) ? b.leading : null,
        transform: b.transform ?? null,
        tracking: b.tracking ?? null
      },
      eyebrow: c.eyebrow
        ? {
            size: num(c.eyebrow.size) ? c.eyebrow.size : null,
            weight: num(c.eyebrow.weight) ? c.eyebrow.weight : null,
            transform: c.eyebrow.transform ?? null,
            tracking: c.eyebrow.tracking ?? null
          }
        : null,
      card: c.card
        ? {
            radius: zeroOk(c.card.radius) ? c.card.radius : null,
            pad: c.card.pad ?? null,
            shadow: c.card.shadow ?? null
          }
        : null,
      field: c.field && zeroOk(c.field.radius) ? { radius: c.field.radius } : null,
      // the pill's radius is a token (a label's rounding), worn with the rest of the reference page
      pill: (() => {
        const r = res(tokens, '--radius-pill')
        const p = r === '0' ? { v: 0 } : px(r)
        return p ? { radius: p.v } : null
      })(),
      source: 'components.html'
    }
  }
}

function finish(p) {
  const mode = modeOf(p.colors.bg?.v)
  const out = { schema: SCHEMA, ...p, mode: mode ? derived(mode, 'luminance of bg') : empty('no bg') }
  out.flags = flagsOf(out)
  return out
}

/** What a person should know before a customer picks this system. */
function flagsOf(p) {
  const flags = []
  for (const role of ['display', 'body']) {
    const f = p.fonts[role]
    if (f.s === 'substituted') flags.push(`font-substituted:${role}:${f.named}→${f.v}`)
    if (f.s === 'empty') flags.push(`font-unavailable:${role}`)
  }
  if (p.colors.accent?.s === 'derived') flags.push('accent-derived')
  for (const [k, f] of Object.entries(p.shape)) if (f.s === 'derived') flags.push(`range:${k}`)
  return flags
}

/**
 * The quality gate. A profile that fails is never offered to a customer. Reasons are returned, not
 * thrown, so a report can count them.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function gate(p) {
  const reasons = []
  for (const k of ['bg', 'fg', 'accent']) if (!parseHex(p.colors[k]?.v)) reasons.push(`no-${k}`)
  const text = contrast(p.colors.fg?.v, p.colors.bg?.v)
  if (text !== null && text < 4.5) reasons.push(`contrast-fg-bg:${text.toFixed(2)}`)
  const on = contrast(p.colors.accentOn?.v, p.colors.accent?.v)
  if (on !== null && on < 4.5) reasons.push(`contrast-accent:${on.toFixed(2)}`)
  if (p.fonts.body.s === 'empty' && p.fonts.display.s === 'empty') reasons.push('no-usable-font')
  // Running text is never set in a script or a display face, headings never in a script: whatever
  // a source says, a profile that would do it is not offered (Acctual in Caveat, 12/10/2026).
  for (const role of ['body', 'display']) {
    const family = p.fonts[role]?.v
    const kind = family ? kindOf(family) : null
    if (kind && REFUSED_KINDS[role].includes(kind)) reasons.push(`font-${role}-${kind}:${family}`)
  }
  return { ok: reasons.length === 0, reasons }
}

export { toHex }
