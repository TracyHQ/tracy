/**
 * A band the template paints on its own — a dark hero, a call to action in the brand colour, a dark
 * footer, a light panel — wears the system's GROUND while its words keep their own colours.
 *
 * Until 12/10/2026 such a band was kept whole (`keepScopes`: the template's ground, text and accent),
 * so under every system the first screen of a site whose hero, topbar and footer are bands looked the
 * same as before the press: on WordPress Tracy Business ~90% of the 1440×900 first screen (reported
 * 12/10/2026: "it is still the old UI"). Recolouring every text in a band would need every rule of every
 * template; the ground is one colour, and it is what the eye reads. So:
 *
 *   - the band's ground becomes one colour of the worn system, chosen so that every text colour the
 *     band shows (`texts`, measured on the released page) still reads on it — at 4.5:1, or at what the
 *     template itself reached when that was less. The template's light words on its dark hero stay
 *     light words on the system's ink; nothing in the band is left unreadable by construction.
 *   - which colours are tried, in order, follows what the band is (`kind`, or read off its ground):
 *     `ink` (a dark neutral ground) → the system's ink on a light page, its surface on a dark one;
 *     `brand` (a coloured ground) → the system's accent, then its ink; `panel` (a light ground) →
 *     the system's surface, warm surface, page. No candidate reads → the band stays as it was.
 *   - what the template paints with ITS accent inside the band (an orange word, a rule, an icon)
 *     takes the system's accent, made readable on the new ground.
 *   - pictures, logos and the words themselves are untouched; the band's calls to action already
 *     wear the system (`keptButtons`) and now judge their fill against the NEW ground.
 *
 *   "bands": {
 *     "<band>": {                      a keepScopes entry, optionally narrowed like keptButtons
 *       "ground": "#14171a",           the fill the released page shows (discover / bands.mjs)
 *       "texts": ["#f5f3ee", ...],     every text colour the band shows on that ground
 *       "kind": "ink|brand|panel",     optional: read off the ground when absent
 *       "root": true,                  the band element paints the ground itself (default true)
 *       "vars":  { "--x": "<role>" },                         the template's own variables
 *       "paint": { "<selector inside, or & for the band>": { "<property>": "<role>" } },
 *                                       roles: ground, accent, accent-fill, text, text-2, and card (the
 *                                       ground a tenth away from the band's words: a card inside it)
 *       "repaint": false,              true: the band's words are painted through `vars`/`paint`
 *                                       with `text` / `text-2`, so `texts` do not bind the ground
 *       "important": false,            T4's generated palettes paint with !important literals
 *       "fill": false,                 true: a block of the template's own colour that is NOT a
 *                                       keepScopes band (its key need not be one)
 *       "words": [".title", "p"],      a fill's words that sit on it (repainted); scripts/bands.mjs
 *       "media": "(max-width: 991px)"  the band is one only at these widths
 *       "picture": true                its ground is a photo: kept; its paints and buttons are worn
 *       "gradient": false              true: the band's ground is a gradient (no picture): it wears
 *                                       one of the system's (its ground into a darker step)
 *       "dropPicture": false           true: its ground is a picture of one flat colour (an opaque
 *                                       texture), dropped so the worn ground shows
 *       "accentLarge": "(min-width: 1200px)"  its accent words are large text (24px, or 18.67px bold) at
 *                                       those widths, measured on the release (true: at every width):
 *                                       they take the 3:1 accent
 *       "buttonGround": "#ffffff"      what its buttons sit on, when not the band's ground (a white
 *                                       form card in a photo band)
 *     }
 *   },
 *   "keepWhole": { "#contact": "…" }   bands kept exactly as the template paints them, each with its
 *                                       reason: never worn, never drafted again by scripts/bands.mjs
 *
 * Roles: `ground`; `accent` (the system's accent as text, readable on the ground, 4.5:1);
 * `accent-fill` (the same as a fill or a rule, 3:1); `text` and `text-2` (the band's words when it
 * repaints them: the accent's own text on an accent ground, else the readable side of the system).
 *
 * PURE: the worn 56 tokens in, CSS rules out. Every colour is a hex the colour module can check.
 */
import { contrast, luminance, mix, parseHex, readable } from './colour.mjs'

/** A band key: one of keepScopes, narrowed by classes / ids / :not(.x) only (as keptButtons). */
const BAND_KEY = /^([.#][\w-]+)((?:[.#][\w-]+|:not\([.#][\w-]+\))*)$/
/** A selector inside a band or a variable name: nothing that could close the rule. */
const safeSelector = (s) => typeof s === 'string' && s.trim() !== '' && !/[{};<\\]|\/\*/.test(s)
/** Tag names only (`div`, `span p`): every such element of a band, never a band's own part. */
// a selector of tag names only names every such element of the band (a drafted `div` painted all of
// them), and one that walks through body or html inside a band (a drafted `.com_content body div`, GK
// Compact 13/10/2026) names nothing: both are refused
const bareTags = (s) =>
  /^[a-z][a-z0-9]*(\s+[a-z][a-z0-9]*)*(::?(before|after))?$/.test(String(s).trim()) ||
  /(^|[\s>+~])(body|html)([\s>+~.#:[]|$)/.test(String(s).trim())
const VAR = /^--[\w-]+$/
/** A band's `accentLarge` width: from a min-width up only (`(min-width: 992px)`). */
const LARGE_MEDIA = /^\(min-width:\s*\d{3,4}px\)$/
/** The step a panel keeps off the worn page (contrast): at least PANEL_STEP, at most PANEL_STEP_MAX. */
export const PANEL_STEP = 1.05
export const PANEL_STEP_MAX = 1.2
// an outline button: its label and line are the words of the ground it sits on (JA Smallbiz's
// .btn-border, white outline, 13/10/2026). A light button (.btn-white, .btn-light) is solid in one
// template and an outline in another, so it wears the band's button pair instead (keptButtonRules):
// as an outline it put JA Impact's solid white "Join our event" in white on white
const OUTLINE = ':is([class*=btn-outline], [class*=btn-border], .is-style-outline .wp-block-button__link)'
/**
 * Text paints stop at buttons: the guard sits inside :where(), so it adds no weight and a paint the contract
 * names for one element of the band still wins over the band's words (Tracy Business WordPress's footer
 * monogram, a <p> painted ground on text, kept the words' grey on its turned fill, 1.7-2:1 under all fifteen,
 * 14/10/2026).
 */
const NOT_BUTTON = ':where(:not(.btn, .btn *, [class*=button], [class*=button] *))'
/** A selector list split at its top-level commas only (`a, :is(b, c)` → two selectors). */
const topLevel = (s) => {
  const out = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(from, i))
      from = i + 1
    }
  }
  out.push(s.slice(from))
  return out
}
const ROLES = new Set(['ground', 'accent', 'accent-fill', 'text', 'text-2', 'card'])
const PROPS = new Set([
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color'
])

/**
 * Whether a fill's words are repainted on its new ground: it names them (`words`), or every word it
 * showed read on its own ground (no card set inside it). Otherwise its words keep their colours and
 * bind the ground like a kept band's.
 */
export function fillRepaints(band) {
  if ((band.words ?? []).some(safeSelector)) return true
  return (band.texts ?? []).every((x) => (contrast(x, band.ground) ?? 0) >= 3)
}

/** Max minus min channel: how coloured a ground is (0 grey … 255 pure hue). */
export function chroma(hex) {
  const c = parseHex(hex)
  if (!c) return 0
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
}

/** What a band is, read off its ground when the contract does not say. */
export function kindOf(ground) {
  const c = parseHex(ground)
  if (!c) return null
  if (luminance(c) >= 0.35) return 'panel'
  return chroma(ground) >= 40 ? 'brand' : 'ink'
}

/**
 * The system's ink: the stronger of the two text colours on its page. `--fg` is not always it — a
 * template whose headings take `--fg-2` gets the system's strongest text there and its second at
 * `--fg` (textOrder), so JA Nova's dark bands took MotherDuck's #676665 for its #383838 and its sky
 * blue button read 2.96:1 on them (13/10/2026).
 * @param {Record<string, string>} tokens
 * @returns {string | null}
 */
export function strongestInk(tokens) {
  const inks = [tokens['--fg'], tokens['--fg-2']].filter((x) => parseHex(x))
  const bg = parseHex(tokens['--bg']) ? tokens['--bg'] : '#ffffff'
  return inks.sort((a, b) => (contrast(b, bg) ?? 0) - (contrast(a, bg) ?? 0))[0] ?? null
}

/**
 * The colours of the worn system a band of this kind may take as its ground, most fitting first.
 * Deeper inks are offered after the system's own (its ink mixed toward black), so a system whose ink
 * is a mid grey still gives a dark band a dark ground — the same colour, deepened, never another hue.
 * A panel that repaints its words is a panel of the system, light or dark: its surface first.
 * @param {Record<string, string>} tokens  the worn 56 tokens
 * @param {'ink' | 'brand' | 'panel'} kind
 * @param {{ repaint?: boolean }} [opts]
 */
export function groundCandidates(tokens, kind, opts = {}) {
  const t = (n) => (parseHex(tokens[n]) ? tokens[n] : null)
  const darkPage = luminance(parseHex(t('--bg') ?? '#ffffff') ?? { r: 255, g: 255, b: 255 }) < 0.3
  const fg = strongestInk(tokens)
  const inks = darkPage
    ? [t('--surface'), t('--bg'), t('--bg') && mix(t('--bg'), '#000000', 0.35)]
    : [fg, fg && mix(fg, '#000000', 0.3), fg && mix(fg, '#000000', 0.6)]
  const surfaces = [t('--surface'), t('--surface-warm'), t('--bg')]
  // a light panel whose words stay the template's dark ones needs a light ground: on a dark page,
  // the system's light side (its text colour)
  const lights = darkPage && opts.repaint !== true ? [fg, fg && mix(fg, '#ffffff', 0.5)] : surfaces
  const brand = [t('--accent'), t('--accent-active'), t('--accent-hover')]
  const order = { ink: inks, brand: [...brand, ...inks], panel: lights }[kind] ?? []
  return [...new Set(order.filter(Boolean))]
}

/**
 * The ground, accent text and accent fill one band wears under the worn system, or null when no
 * colour of the system reads under every text the band shows (the band then stays the template's).
 * @param {Record<string, string>} tokens
 * @param {{ ground?: string, texts?: string[], kind?: string, repaint?: boolean }} band
 * @param {{ page?: string }} [opts]  page: the template's own page colour, from which a panel stood apart
 * @returns {{ kind: string, keptGround: boolean, buttonGround: string, ground: string, accent: string, accentLarge: string, accentFill: string, line: string | null, text: string, text2: string } | null}
 */
export function bandColours(tokens, band, opts = {}) {
  const ground = band?.ground
  if (!parseHex(ground)) return null
  const kind = ['ink', 'brand', 'panel'].includes(String(band.kind)) ? String(band.kind) : kindOf(ground)
  if (!kind) return null
  // a fill sits in the page, whose words follow the system: its words are repainted like a band's
  const repaint = band.repaint === true || (band.fill === true && fillRepaints(band))
  const texts = repaint ? [] : (band.texts ?? []).filter((x) => parseHex(x))
  // never ask more of the new ground than the template's own ground gave the same words
  const need = texts.map((x) => [x, Math.min(4.5, (contrast(x, ground) ?? 0) - 0.01)])
  const own = (g) => wordsOn(tokens, g)
  // a band that repaints its words takes a ground only where the system's own words read on it
  const reads = (g) =>
    need.every(([x, min]) => (contrast(x, g) ?? 0) >= min) && (!repaint || (contrast(own(g), g) ?? 0) >= 4.5)
  // a picture band keeps its own ground (the photo): only its accent marks and buttons are worn, judged on
  // it — on the side its words say: light words sit on a dark photo or overlay whatever was read under
  // it (JA Diner's photo band measured the page's #fcfaf6 behind it, its words white on a #222 overlay)
  const pictureGround = () => {
    const w = (band.texts ?? []).map(parseHex).filter(Boolean)
    if (!w.length) return ground
    // a word that reads on what was measured sits on it: that ground is real, whatever the other words
    // (JA Beauty's testimonials, dark and white words on a white card: averaged as light words, the
    // accent was judged on a dark photo and came out near white on the white, 1.29:1, 13/10/2026)
    if ((band.texts ?? []).some((x) => (contrast(x, ground) ?? 0) >= 3)) return ground
    const lightWords = w.reduce((a, c) => a + luminance(c), 0) / w.length > 0.4
    const lightGround = luminance(parseHex(ground) ?? { r: 0, g: 0, b: 0 }) > 0.4
    if (lightWords === lightGround) return lightWords ? '#222222' : '#f5f5f5'
    return ground
  }
  // a band whose own words do not read on the ground read under it (white words on a white page) is
  // laid over something else — a transparent header over a dark hero (JA Educatsy, 13/10/2026): it is
  // handled as a picture band, its ground kept, its accents judged on the side its words say. What is
  // read through a see-through band is the page: near white or near black. A coloured block whose own
  // words are faint on it by the template's choice (JA Sensei's grey on its slate topbar, 2.58:1; JA
  // Impact's white on its green event card, 2.62:1) is that block's own ground, and wears the system's
  // A word that does not read at all on what was recorded (1.5:1 or less: JA Resort's room card, its green
  // title recorded on the same green while it sits on the card's cream) says the band is laid over
  // something else, whatever that ground is
  const gl = luminance(parseHex(ground) ?? { r: 128, g: 128, b: 128 })
  const ratios = (band.texts ?? []).map((x) => contrast(x, ground) ?? 0)
  const overlay =
    band.picture !== true &&
    !repaint &&
    ratios.length > 0 &&
    ratios.every((r) => r < 3) &&
    (gl > 0.8 || gl < 0.01 || ratios.some((r) => r <= 1.5))
  const keptGround = band.picture === true || overlay
  // a panel the template set apart from its page (a light masthead on white) keeps a step off the worn page:
  // a system whose surface is its page (Mailchimp) made the panel vanish — 1080 of 6486 panel × system pairs
  // across ten contracts, 14/10/2026. The step is the template's own, between PANEL_STEP and PANEL_STEP_MAX;
  // the system's surface first, then its warm surface, then its surface moved toward its text until it stands
  const ownStep = parseHex(opts.page) ? (contrast(ground, opts.page) ?? 1) : 1
  const step =
    kind === 'panel' && !keptGround && ownStep >= 1.03 && parseHex(tokens['--bg'])
      ? Math.min(Math.max(ownStep, PANEL_STEP), PANEL_STEP_MAX)
      : 0
  const off = (g) => contrast(g, tokens['--bg']) ?? 1
  const stepped = () => {
    const from = parseHex(tokens['--surface']) ? tokens['--surface'] : tokens['--bg']
    const to = strongestInk(tokens)
    if (!parseHex(from) || !parseHex(to)) return []
    const out = []
    for (let t = 0.02; t <= 0.4001; t += 0.02) out.push(mix(from, to, t))
    return out.filter(Boolean)
  }
  const candidates = groundCandidates(tokens, kind, { repaint })
  // the template's step, else at least PANEL_STEP, else the first ground its words read on
  const standing = (min) =>
    [...candidates, ...(step ? stepped() : [])].find((g) => reads(g) && off(g) >= min - 0.005)
  const picked = keptGround
    ? pictureGround()
    : ((step ? (standing(step) ?? standing(PANEL_STEP)) : undefined) ?? candidates.find(reads))
  if (!picked) return null
  // a panel no ground of the system sets apart without its words reading worse than the template let them
  // (JA Fit's white card of grey words on its dark page: any grey ground under a light system drops its
  // #9e9e9e under the template's 2.68:1) stands apart by the system's line instead
  const lineOn = (g) => {
    const b = tokens['--border']
    return parseHex(b) && (contrast(b, g) ?? 1) >= 1.15 ? b : mix(g, strongestInk(tokens) ?? '#000000', 0.18)
  }
  const line = step && off(picked) < PANEL_STEP - 0.005 ? lineOn(picked) : null
  const dark = luminance(parseHex(picked) ?? { r: 0, g: 0, b: 0 }) < 0.3
  const toward = dark ? '#ffffff' : '#000000'
  // a mid-tone ground (a grey #8d8d8d, L 0.27) is "dark" by the 0.3 line yet reads better under black:
  // an accent that no step toward white makes readable there is moved toward black instead (found across
  // the library, scripts/matrix.mjs 14/10/2026). Where the first side reaches, nothing changes
  const other = toward === '#ffffff' ? '#000000' : '#ffffff'
  const readableEither = (c, g, min) => readable(c, g, toward, min) ?? readable(c, g, other, min)
  // on a band painted with the accent itself, the accent's words are its own text colour
  const onAccent = picked === tokens['--accent'] && parseHex(tokens['--accent-on'])
  const accentBase = onAccent ? tokens['--accent-on'] : tokens['--accent']
  // a photo's ground varies under the words: the accent must read where the photo runs 30% toward
  // them too (JA Candidate's section title read 4.5 on the white measured on a desktop, 3.4–4.0 on
  // the photo's pale grey under it on a phone; at 15% JA Titan's slide links still read 2.5–2.75 on
  // its mid-grey photo, 13/10/2026)
  const judged = keptGround ? (mix(picked, toward, 0.3) ?? picked) : picked
  // a photo band whose words are both light and dark sits on both (JA Beauty's testimonials: its title
  // on white on a desktop, on the photo's dark on a phone, 1.68:1 there with an accent made for white,
  // 13/10/2026): its accent is the system's own moved to the tone that reads best on both
  const lums = (band.texts ?? []).map(parseHex).filter(Boolean).map(luminance)
  const bothSides = band.picture === true && lums.some((l) => l > 0.6) && lums.some((l) => l < 0.2)
  const balanced = (base) => {
    let best = null
    for (const end of ['#ffffff', '#000000'])
      for (let t = 0; t <= 1.001; t += 0.05) {
        const c = mix(base, end, t)
        if (!c) continue
        const worst = Math.min(contrast(c, '#ffffff') ?? 0, contrast(c, '#222222') ?? 0)
        if (!best || worst > best.worst + 0.01) best = { c, worst }
      }
    return best?.c ?? null
  }
  // an accent with no hue (Airbnb.org's Carbon Ink #222222) moved until it reads on a band is a mid grey
  // that looks switched off (#838383 on #181818: Tracy Business's hero words, 13/10/2026): there the
  // accent is the system's own words on that ground, as its page sets them
  const greyAccent = !bothSides && chroma(accentBase) < 24 && (contrast(accentBase, judged) ?? 0) < 4.5
  const accent = parseHex(accentBase)
    ? bothSides
      ? balanced(accentBase)
      : greyAccent
        ? own(picked)
        : readableEither(accentBase, judged, 4.5)
    : null
  const accentFill = parseHex(accentBase)
    ? bothSides
      ? accent
      : greyAccent
        ? own(picked)
        : readableEither(accentBase, judged, 3)
    : null
  const text = own(picked)
  const text2 = readable(mix(text, picked, 0.28) ?? text, picked, text, 4.5) ?? text
  return {
    kind,
    keptGround,
    // what its buttons are judged on: a kept ground (a photo, an overlay) with a 15% margin toward its
    // words (JA Educatsy's header button, BMW blue on the guessed #222: 3.05:1, on the hero's #262626
    // it shows on: 2.90, 13/10/2026). Not the accents' 30%: on a light photo that is a mid grey on which
    // no fill reaches 3:1, and JA Vital's hero button was left the template's
    buttonGround: keptGround ? (mix(picked, toward, 0.15) ?? picked) : picked,
    ground: picked,
    accent: accent ?? (dark ? '#ffffff' : '#000000'),
    // the accent as large text (24px, or 18.67px bold: WCAG's 3:1), judged on the same ground as the
    // accent: on a mid-grey photo the 4.5:1 accent is near white and the system's hue is lost (JA Rent's
    // hero word under Stripe, #eeebff; at 3:1 #c5bcfe, 14/10/2026). A band uses it only where it says its
    // accent words are that large (`accentLarge`)
    accentLarge: accentFill ?? accent ?? (dark ? '#ffffff' : '#000000'),
    accentFill: accentFill ?? accent ?? (dark ? '#ffffff' : '#000000'),
    // a panel that stands apart by a line, not its ground (null: its ground does)
    line,
    text,
    text2
  }
}

/**
 * The words a system sets on one of its own colours: the accent's text on the accent, else the side
 * of the system that reads there (its page colour on its ink, its ink on its page), else white/black.
 * @param {Record<string, string>} tokens
 * @param {string} g
 */
export function wordsOn(tokens, g) {
  if (g === tokens['--accent'] && parseHex(tokens['--accent-on'])) return tokens['--accent-on']
  const side = [tokens['--bg'], tokens['--fg'], tokens['--fg-2'], tokens['--surface']].filter((x) =>
    parseHex(x)
  )
  const best = side.sort((a, b) => (contrast(b, g) ?? 0) - (contrast(a, g) ?? 0))[0]
  if (best && (contrast(best, g) ?? 0) >= 4.5) return best
  // neither side of the system reads there: whichever of white and black reads better
  return (contrast('#ffffff', g) ?? 0) >= (contrast('#000000', g) ?? 0) ? '#ffffff' : '#000000'
}

/**
 * The bands of a contract that are worn, keyed as written, each with the keepScopes entry it narrows.
 * @param {{ keepScopes?: string[], bands?: Record<string, any> }} contract
 * @returns {[string, string, any][]}  [band key, its scope, its spec]
 */
export function wornBands(contract) {
  const scopes = (contract.keepScopes ?? []).filter((x) => /^[.#][\w-]+$/.test(x))
  const out = []
  for (const [key, spec] of Object.entries(contract.bands ?? {})) {
    const m = BAND_KEY.exec(key)
    if (!m || !spec || typeof spec !== 'object') continue
    // `keepWhole`: a band the contract keeps exactly as the template paints it, with the reason (the
    // same key the readiness check's BAND-1 reads)
    if (Object.hasOwn(contract.keepWhole ?? {}, key)) continue
    // a fill (`fill: true`) is a block of the template's own colour the page does NOT keep (an orange
    // call band, a green card): it wears the system's ground the same way, its buttons the system's pair
    // judged on that ground (keptButtonRules), while its tokenized words follow the page
    if (!scopes.includes(m[1]) && spec.fill !== true) continue
    out.push([key, m[1], spec])
  }
  return out
}

/**
 * The CSS that puts the worn system's ground (and accent) on each band of the contract.
 * @param {{ keepScopes?: string[], bands?: Record<string, any> }} contract
 * @param {Record<string, string>} tokens  the worn 56 tokens
 * @param {string} prefix  the emitter's specificity prefix (`:root`×6)
 * @param {{ page?: string }} [opts]  page: the template's own page colour (bandColours)
 * @returns {{ rules: string[], grounds: Record<string, string>, media: Record<string, { ground: string, media: string }> }}
 *   rules, each band key's ground, and the ground of each band that is one only at some widths
 */
export function bandRules(contract, tokens, prefix, opts = {}) {
  const rules = []
  /** @type {Record<string, string>} */
  const grounds = {}
  /** @type {Record<string, { ground: string, media: string }>} */
  const mediaGrounds = {}
  for (const [key, , spec] of wornBands(contract)) {
    const c = bandColours(tokens, spec, opts)
    if (!c) continue
    // `media`: a band that is one only at some widths (JA Alumni's header is a solid navy bar on a
    // phone, white on a desktop) wears the system there only; its buttons are judged on the template's
    // ground elsewhere, so its ground is handed to keptButtonRules for those widths only (`media`): left
    // to no rule there, JA Mood's green "Creat Account" kept its green on the phone header's accent,
    // green on Spotify's green, 1.47:1 (15/10/2026)
    const media = /^\((max|min)-width:\s*\d{3,4}px\)$/.test(String(spec.media ?? '')) ? spec.media : null
    const start = rules.length
    // `buttonGround`: what the band's buttons sit on when it is not the band's ground (JA Cityguide's
    // search form, a white card in its photo band: the pair judged on the photo turned the button
    // white on that white, 13/10/2026)
    const buttonGround = /^#[0-9a-f]{6}$/i.test(String(spec.buttonGround ?? ''))
      ? spec.buttonGround
      : c.keptGround
        ? c.buttonGround
        : c.ground
    if (media) mediaGrounds[key] = { ground: buttonGround, media }
    else grounds[key] = buttonGround
    const bang = spec.important === true ? '!important' : ''
    // `card`: a card set apart inside the band, its ground a tenth away from the band's words, so they
    // read on it better than on the band: mixed toward its words, JA Kidscorner's footer cards took
    // white on Notion's blue to 3.91:1 (15/10/2026). On a ground already at the end (black under white
    // words) that step shows nothing: there it goes toward the words, while they still read on it
    const lum = (/** @type {string} */ x) => luminance(parseHex(x) ?? { r: 128, g: 128, b: 128 })
    const away = mix(c.ground, lum(c.text) > lum(c.ground) ? '#000000' : '#ffffff', 0.1) ?? c.ground
    const toward = mix(c.ground, c.text, 0.1) ?? c.ground
    // only a ground already at the end (black under white words) steps toward them, and only while the band's words
    // and its accent still read there: Toggl Track's ink band stepped toward white and its pink accent words fell
    // to 3.65:1 on the card (JA Kidscorner, 15/10/2026)
    const reads = (/** @type {string} */ bg) =>
      [c.text, c.accent].every((w) => (contrast(w, bg) ?? 0) >= Math.min(4.5, contrast(w, c.ground) ?? 0))
    const card = (contrast(away, c.ground) ?? 1) < 1.03 && reads(toward) ? toward : away
    const value = (role) =>
      ({
        ground: c.ground,
        accent: c.accent,
        'accent-fill': c.accentFill,
        text: c.text,
        'text-2': c.text2,
        card
      })[role]
    const own = []
    if (spec.root !== false && !c.keptGround) own.push(`background-color:${c.ground}${bang}`)
    // a panel set apart by the system's line: an outline drawn inside its edge, so nothing moves
    if (c.line && spec.root !== false)
      own.push(`outline:1px solid ${c.line}${bang};outline-offset:-1px${bang}`)
    // `dropPicture`: the band's ground is a picture of one flat colour (an opaque texture over the fill):
    // left, it hid the worn ground (JA Impact's "Helping hands" panel, a navy texture, 14/10/2026)
    if (spec.dropPicture === true && !c.keptGround) own.push(`background-image:none${bang}`)
    // a gradient band: the system's gradient between its ground and the next darker of its colours
    // when the band's words read on both ends, else its ground flat
    if (spec.gradient === true) {
      const to = mix(c.ground, '#000000', 0.25)
      const both = (contrast(c.text, c.ground) ?? 0) >= 4.5 && (contrast(c.text, to) ?? 0) >= 4.5
      own.push(`background-image:${both ? `linear-gradient(135deg, ${c.ground}, ${to})` : 'none'}${bang}`)
    }
    for (const [name, role] of Object.entries(spec.vars ?? {}))
      if (VAR.test(name) && ROLES.has(role)) own.push(`${name}:${value(role)}`)
    if (own.length) rules.push(`${prefix} ${key}{${own.join(';')}}`)
    // a fill's words: the page's heading and text rules would paint them the system's text colour on
    // the system's accent (GK Compact's video panel: #262626 on BMW blue, 2.90:1, 13/10/2026); they
    // take the words the system sets on that ground. Its buttons are the button rules'
    if (spec.fill === true) {
      // only the words that sit on the fill (`words`, read by scripts/bands.mjs): a white card set inside
      // it keeps its own (JA Alpha's overlap cards turned white on white, 13/10/2026). With no list, all
      // of them only when every word the fill showed read on it (no card inside) — headings drawn by class
      // too (JA Alpha's call band titles are `div.title.h4`: white on Linear's lime fill, 1.23:1, 13/10/2026)
      const words = (spec.words ?? []).filter((w) => safeSelector(w) && !bareTags(w))
      // never a button's label: the fill's buttons wear the system's pair (JA Impact's "read more"
      // button inside its green card, white words on its turned white fill, 1:1, 13/10/2026)
      // inside :where(), so the guard keeps buttons out without outweighing a paint the contract names for one
      // element of the band (Tracy Business's footer monogram, a <p>: its own colour lost to the words' rule)
      const notButton =
        ':where(:not(.btn, .btn *, [class*=btn], [class*=btn] *, [class*=button], [class*=button] *))'
      const list = words.length
        ? words.map((w) => `${prefix} ${key} ${w}${w.includes('::') ? '' : notButton}`)
        : fillRepaints(spec)
          ? [
              `${prefix} ${key}`,
              `${prefix} ${key} :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6, p, li, span, small, strong, em, label, a:not([class*=btn]):not([class*=button]))`
            ]
          : []
      if (list.length) rules.push(`${list.join(',')}{color:${c.text}${bang}}`)
    }
    // and its light or outline buttons (a white-outline button on a green band: white on Spotify's
    // green, 1.92:1) take the same words for their text and line
    if (spec.fill === true)
      rules.push(`${prefix} ${key} ${OUTLINE}{color:${c.text}${bang};border-color:${c.text}${bang}}`)
    // the page's accent words (`followRules`, colour accent-text) stop at every worn band's edge (outsideKept):
    // inside the band they kept the template's literal (T4 blank's orange section eyebrows on its light panel,
    // 2.22:1 on Moxie's cream, 14/10/2026). They take the band's own accent, judged on its ground, unless the
    // band paints the same words itself; the innermost band's where bands nest
    const painted = new Set(
      Object.entries(spec.paint ?? {})
        .filter(([, d]) => d?.color)
        .map(([sel]) => sel.trim())
    )
    const accentWords = Object.entries(contract.followRules ?? {})
      .filter(
        ([sel, d]) =>
          safeSelector(sel) && !bareTags(sel) && /^accent-text(-hover)?!?$/.test(String(d?.color ?? ''))
      )
      .flatMap(([sel, d]) => topLevel(sel).map((x) => [x.trim(), String(d.color).endsWith('!')]))
      .filter(([x]) => x && !x.includes('::') && !painted.has(x))
    if (accentWords.length) {
      const others = wornBands(contract)
        .map(([k]) => k)
        .filter((k) => k !== key)
      const inner = others.length ? `:where(:not(${key} :is(${others.join(', ')}) *))` : ''
      for (const important of [false, true]) {
        const list = accentWords
          .filter(([, i]) => i === important)
          .map(([x]) => `${prefix} ${key} ${x}${NOT_BUTTON}${inner}`)
        if (list.length) rules.push(`${list.join(',')}{color:${c.accent}${important ? '!important' : bang}}`)
      }
    }
    for (const [sel, decls] of Object.entries(spec.paint ?? {})) {
      if (!safeSelector(sel) || (sel !== '&' && bareTags(sel)) || !decls || typeof decls !== 'object')
        continue
      const body = Object.entries(decls)
        .filter(([p, role]) => PROPS.has(p) && ROLES.has(role))
        .filter(([p, role]) => !(c.keptGround && p === 'background-color' && role === 'ground'))
        .map(([p, role]) => `${p}:${value(role)}${bang}`)
      // an accent word inside a button would sit on the button's accent fill (JA Educatsy's menu item
      // drawn as a primary button: accent on accent, 1:1): text paints stop at buttons
      const textOnly = Boolean(decls.color) && !decls['background-color']
      // a label filled with the accent takes the words that read on that fill, unless the paint names
      // its colour (GK/T4 blank's section pill: white on Spotify's green, 3.12:1, 13/10/2026)
      const filled = ['accent', 'accent-fill'].includes(decls['background-color'])
        ? value(decls['background-color'])
        : null
      if (filled && !decls.color) body.push(`color:${wordsOn(tokens, filled)}${bang}`)
      if (!body.length) continue
      const list = topLevel(sel)
        .map((s) => s.trim())
        .filter(Boolean)
        // `&` is the band element itself (a topbar whose words take their colour from the band's own rule);
        // every other text paint stops at buttons
        .map((s) =>
          s === '&'
            ? `${prefix} ${key}`
            : `${prefix} ${key} ${s}${textOnly && !s.includes('::') ? NOT_BUTTON : ''}`
        )
        .join(',')
      rules.push(`${list}{${body.join(';')}}`)
      // and the words inside it that carry a colour of their own, which the box's colour does not reach
      // by inheritance (JA Vital's stat counter, white on the stats bubble's accent fill: white on BMW's
      // white turned fill, 1:1, 13/10/2026)
      // and the outline buttons in it (JA Smallbiz's slider box, its white outline button on the box's
      // light accent fill, 1.64:1, 13/10/2026)
      if (filled && sel !== '&' && !sel.includes('::'))
        rules.push(
          `${topLevel(sel)
            .map((s) => `${prefix} ${key} ${s.trim()} ${OUTLINE}`)
            .join(
              ','
            )}{color:${wordsOn(tokens, filled)}${bang};border-color:${wordsOn(tokens, filled)}${bang}}`
        )
      if (filled && !decls.color && sel !== '&' && !sel.includes('::'))
        rules.push(
          `${topLevel(sel)
            .map((s) => s.trim())
            .filter(Boolean)
            .map(
              (s) =>
                `${prefix} ${key} ${s} :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6, p, li, span, small, strong, em)${NOT_BUTTON}`
            )
            .join(',')}{color:${wordsOn(tokens, filled)}${bang}}`
        )
    }
    // `accentLarge`: the band's accent words are large text where the contract measured them (`true`: at every
    // width; a min-width query: from that width up, the phone keeping the 4.5:1 accent): they take the 3:1
    // accent, which keeps the system's hue on a mid-grey photo
    const large =
      spec.accentLarge === true
        ? ''
        : LARGE_MEDIA.test(String(spec.accentLarge ?? ''))
          ? spec.accentLarge
          : null
    if (large !== null) {
      const words = Object.entries(spec.paint ?? {})
        .filter(([sel, d]) => d?.color === 'accent' && safeSelector(sel) && sel !== '&' && !bareTags(sel))
        .flatMap(([sel]) => topLevel(sel).map((s) => s.trim()))
        .filter(Boolean)
        .map((s) => `${prefix} ${key} ${s}${s.includes('::') ? '' : NOT_BUTTON}`)
      if (words.length) {
        const r = `${words.join(',')}{color:${c.accentLarge}${bang}}`
        rules.push(large ? `@media ${large}{${r}}` : r)
      }
    }
    if (media && rules.length > start)
      rules.splice(start, rules.length - start, `@media ${media}{${rules.slice(start).join('')}}`)
  }
  return { rules, grounds, media: mediaGrounds }
}
