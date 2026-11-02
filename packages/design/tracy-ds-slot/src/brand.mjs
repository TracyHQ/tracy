/**
 * Brand mode (02/11/2026): the brand step of the site build paints a site in the customer's OWN colours
 * through the same Design system door a library system goes through. Two parts, both PURE:
 *
 *  - `brandProfile`: the customer's { bg, fg, accent, fonts } → a `tracy-ds-profile/v1` profile, built by
 *    `fromOpenDesign` from the template's own 56 tokens with those colours laid over them. What the customer
 *    did not give stays the template's (its fonts, read from the contract; its surfaces and lines when the
 *    ground is the template's own). A colour that would not read is shifted, never refused silently: the
 *    shift is returned in `adjusted`, as the emitters record theirs.
 *  - `brandKeptRules`: in the bands a contract keeps (`keepScopes`: a photo hero, a call-to-action band, a
 *    video card) the slot resets every `--ds-c-*` and gives the template's own values back
 *    (`keepDefaults`), so under a library system those bands keep the template's red. In brand mode the
 *    customer's accent is the point, so inside each kept band the ACCENT ROLE alone takes the brand accent:
 *    the tokenized accent variables and every given-back variable that carried the template's accent. Its
 *    ground, picture, words and layout stay the template's. The accent is made readable on the band's
 *    ground (words 4.5:1, fills and lines 3:1), shifted toward white or black when it is not, and recorded.
 *
 * A Design system press (no brand mode) never reaches this file: its module is byte for byte what it was
 * (test/brand-mode-default-unchanged.test.mjs).
 */
import { bandColours } from './bands.mjs'
import { contrast, luminance, mix, parseHex, readable, readableLightness, readableOn } from './colour.mjs'
import { fromOpenDesign, gate } from './normalise.mjs'
import { keptScopes } from './tokens56.mjs'

/** A brand profile's id: `brand:<bg>-<fg>-<accent>`, hex without `#`, fg empty when the template's is kept. */
export const BRAND_ID = /^brand:([0-9a-f]{6})-([0-9a-f]{6})?-([0-9a-f]{6})$/

const hex6 = (/** @type {unknown} */ v) => {
  const c = parseHex(v)
  return c ? `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}` : null
}

/** @param {{ bg: string, fg?: string | null, accent: string }} c */
export function brandId(c) {
  const h = (/** @type {unknown} */ v) => (hex6(v) ?? '').slice(1)
  return `brand:${h(c.bg)}-${c.fg ? h(c.fg) : ''}-${h(c.accent)}`
}

/** @param {string} id @returns {{ bg: string, fg: string | null, accent: string } | null} */
export function parseBrandId(id) {
  const m = BRAND_ID.exec(String(id ?? '').toLowerCase())
  return m ? { bg: `#${m[1]}`, fg: m[2] ? `#${m[2]}` : null, accent: `#${m[3]}` } : null
}

/**
 * The template's own accent colours: accent, accent-hover and accent-active of its base tokens and of every
 * palette the contract names (dark tokens, extraPalettes), lower-case hex. A given-back variable holding one
 * of these is the accent role inside a kept band.
 * @param {Record<string, any>} contract
 * @param {Record<string, string>} base  the template's 56 tokens (library.contractBase)
 * @returns {string[]}
 */
export function templateAccents(contract, base) {
  const names = ['accent', 'accent-hover', 'accent-active']
  const sets = [
    Object.fromEntries(names.map((n) => [n, base?.[`--${n}`]])),
    Object.fromEntries(names.map((n) => [n, contract?.darkTokens?.[`--${n}`]])),
    ...(Array.isArray(contract?.extraPalettes) ? contract.extraPalettes : [])
  ]
  return [...new Set(sets.flatMap((s) => names.map((n) => hex6(s?.[n]))).filter(Boolean))]
}

const ratio = (/** @type {string} */ a, /** @type {string} */ b) => (contrast(a, b) ?? 0).toFixed(2)
const towardOf = (/** @type {string} */ g) =>
  luminance(parseHex(g) ?? { r: 0, g: 0, b: 0 }) < 0.3 ? '#ffffff' : '#000000'
/** `c` made to read at `min`:1 on `g`: toward the ground's far side first, then the other. */
const readableEither = (/** @type {string} */ c, /** @type {string} */ g, /** @type {number} */ min) => {
  const toward = towardOf(g)
  return readable(c, g, toward, min) ?? readable(c, g, toward === '#ffffff' ? '#000000' : '#ffffff', min)
}

/**
 * The customer's colours → a profile the slot can wear.
 *
 *   bg      the page ground (default: the template's)
 *   fg      the page text (default: the template's); shifted until it reads 4.5:1 on bg
 *   accent  the brand colour (required); its text colour is black or white, whichever reads
 *   fonts   { display?, body? } CSS stacks (default: the template's own, `baseTokens` of the contract)
 *
 * On the template's own ground the template's surfaces, lines and secondary text stay. On another ground
 * they are mixed from bg and fg, so a dark template's surfaces never sit on a light brand page.
 * @param {{ bg?: string, fg?: string | null, accent: string, fonts?: { display?: string, body?: string } }} input
 * @param {Record<string, any>} contract  the template's slot contract (library.loadContract)
 * @param {Record<string, string>} base  the template's 56 tokens (library.contractBase)
 * @returns {{ profile: any, adjusted: string[] } | { refused: string[] }}
 */
export function brandProfile(input, contract, base) {
  const bg = hex6(input?.bg ?? base['--bg'])
  const accent = hex6(input?.accent)
  const refused = [...(bg ? [] : ['no-bg']), ...(accent ? [] : ['no-accent'])]
  if (input?.fg && !hex6(input.fg)) refused.push('no-fg')
  if (refused.length) return { refused }
  /** @type {string[]} */
  const adjusted = []
  const toward = towardOf(/** @type {string} */ (bg))
  const ownFg = hex6(input.fg ?? base['--fg']) ?? toward
  let fg = ownFg
  if ((contrast(fg, bg) ?? 0) < 4.5) {
    fg = readableEither(fg, /** @type {string} */ (bg), 4.5) ?? /** @type {string} */ (readableOn(bg))
    adjusted.push(`fg:${ratio(ownFg, /** @type {string} */ (bg))}→${ratio(fg, /** @type {string} */ (bg))}`)
  }
  const own = bg === hex6(base['--bg'])
  const m = (/** @type {number} */ t) => /** @type {string} */ (mix(bg, fg, t))
  const muted = readable(mix(fg, bg, 0.25) ?? fg, /** @type {string} */ (bg), fg, 4.5) ?? fg
  const neutrals = own
    ? {}
    : {
        '--surface': m(0.04),
        '--surface-warm': m(0.07),
        '--surface-hover': m(0.1),
        '--border-soft': m(0.12),
        '--border': m(0.2),
        '--muted': muted,
        '--meta': muted,
        '--fg-2': mix(fg, toward, 0.6) ?? fg
      }
  const on = /** @type {string} */ (readableOn(accent))
  // hover and active move away from the accent's own words, so those words still read on them
  const away = on === '#ffffff' ? '#000000' : '#ffffff'
  const step = (/** @type {number} */ t) => {
    const c = mix(accent, away, t)
    return c && (contrast(on, c) ?? 0) >= 4.5 ? c : accent
  }
  const fonts = {
    display: input.fonts?.display ?? contract?.baseTokens?.['--font-display'] ?? base['--font-display'],
    body: input.fonts?.body ?? contract?.baseTokens?.['--font-body'] ?? base['--font-body']
  }
  const tokens = {
    ...base,
    ...neutrals,
    '--bg': bg,
    '--fg': fg,
    '--accent': accent,
    '--accent-on': on,
    '--accent-hover': step(0.12),
    '--accent-active': step(0.2),
    ...(fonts.display ? { '--font-display': String(fonts.display) } : {}),
    ...(fonts.body ? { '--font-body': String(fonts.body) } : {})
  }
  const id = brandId({
    bg: /** @type {string} */ (bg),
    fg: input.fg ? fg : null,
    accent: /** @type {string} */ (accent)
  })
  const p = fromOpenDesign(tokens, { id: id.slice('brand:'.length), name: 'Brand colours' })
  // where each value came from: the customer's three colours stated, the rest derived from them or the template's
  const given = new Set(['bg', 'accent', ...(input.fg ? ['fg'] : [])])
  for (const group of [p.colors, p.extraColours])
    for (const [k, f] of Object.entries(group))
      if (f && f.s !== 'empty')
        Object.assign(
          f,
          given.has(k)
            ? { f: `brand ${k}` }
            : { s: 'derived', f: `brand step from the template and the brand colours (${k})` }
        )
  const profile = { ...p, id, source: 'brand' }
  const g = gate(profile)
  return g.ok ? { profile, adjusted } : { refused: g.reasons }
}

/**
 * The ground a kept band's accent is judged on: what its `bands` entry says it shows (the photo's recorded
 * ground, or the system ground it wears), else its kept buttons' ground, else the template's page as the
 * released page computed it.
 * @returns {{ ground: string, text: string, fill: string } | null}  ground, the readable accent as words, as a fill
 */
function bandAccent(contract, tokens, base, scope, opts) {
  const accent = tokens['--accent']
  const spec = contract.bands?.[scope]
  if (spec && typeof spec === 'object') {
    const c = bandColours(tokens, spec, { ...opts, brand: true })
    if (c) return { ground: c.ground, text: c.accent, fill: c.accentFill }
  }
  const ground =
    hex6(contract.keptButtons?.[scope]?.ground) ??
    hex6(contract.keepDefaults?.['--body-bg-color']) ??
    hex6(base['--bg'])
  if (!ground || !parseHex(accent)) return null
  return {
    ground,
    text:
      readableLightness(accent, [ground], 4.5) ??
      readableEither(accent, ground, 4.5) ??
      /** @type {string} */ (readableOn(ground)),
    fill:
      readableLightness(accent, [ground], 3) ??
      readableEither(accent, ground, 3) ??
      /** @type {string} */ (readableOn(ground))
  }
}

/**
 * In brand mode, the accent role on the page itself (outside the kept bands), made readable keeping the brand's
 * hue: the same lightness shift the kept bands get. Without it the slot's generic clamp moves accent words
 * toward the body text colour, so a brand accent that does not read as words (bronze on white, moss on near
 * black) came out as the body text grey and lost its colour (measured on JA Boxing 1.0.10, 02/11/2026). And a
 * filled shape in the accent (a button, its border) must stand out from its ground at 3:1 (WCAG non-text
 * contrast): moss #042515 on #121111 was 1.15:1, a button that sank into the page.
 *
 *   words  `--ds-accent-text` (and its hover) reach 4.5:1 on the page and its surface;
 *   fills  `--accent` (and hover, pressed) reach 3:1 on both, and the button text is made to read on them.
 *
 * Mutates `tokens` and `text.colours` of one side (joomlaSheet calls it after the kept bands are computed from
 * the brand accent as stated). Each shift is recorded `brand:page:accent-text:a→b` / `brand:page:accent-fill:a→b`.
 * @param {Record<string, string>} tokens  the worn 56 tokens of the side
 * @param {{ colours: Record<string, string> }} text  readableText of the side
 * @returns {string[]} adjusted
 */
export function brandPageAccent(tokens, text) {
  /** @type {string[]} */
  const adjusted = []
  const accent = tokens['--accent']
  const bg = tokens['--bg']
  if (!parseHex(accent) || !parseHex(bg)) return adjusted
  const grounds = [bg, text.colours['--color-surface'] ?? tokens['--surface']].filter((g) => parseHex(g))
  const worst = (/** @type {string} */ c) => Math.min(...grounds.map((g) => contrast(c, g) ?? 0))
  const far = towardOf(bg)
  /** `c` shifted by lightness alone (keeping its hue) until it reads at `min` on every ground. */
  const onAll = (/** @type {string} */ c, /** @type {number} */ min) => readableLightness(c, grounds, min)
  const words = onAll(accent, 4.5)
  if (words && words !== accent) {
    text.colours['--ds-accent-text'] = words
    // the hover one step further from the ground: still readable, and apart from the words at rest
    text.colours['--ds-accent-text-hover'] =
      onAll(/** @type {string} */ (mix(words, far, 0.15)), 4.5) ?? words
    adjusted.push(`brand:page:accent-text:${ratio(accent, bg)}→${ratio(words, bg)}`)
  }
  const fill = onAll(accent, 3)
  if (fill && fill !== accent) {
    const on =
      (contrast(tokens['--accent-on'], fill) ?? 0) >= 4.5
        ? tokens['--accent-on']
        : /** @type {string} */ (readableOn(fill))
    const step = (/** @type {number} */ t) => {
      const c = /** @type {string} */ (mix(fill, far, t))
      return worst(c) >= 3 && (contrast(on, c) ?? 0) >= 4.5 ? c : fill
    }
    tokens['--accent'] = fill
    tokens['--accent-on'] = on
    tokens['--accent-hover'] = step(0.1)
    tokens['--accent-active'] = step(0.18)
    adjusted.push(`brand:page:accent-fill:${ratio(accent, bg)}→${ratio(fill, bg)}`)
  }
  return adjusted
}

/**
 * In brand mode, the accent role inside every kept band: written after keepRules with the same weight, so it
 * wins over the band's reset of `--ds-c-accent*` and over the template accent `keepDefaults` gave back.
 * @param {Record<string, any>} contract
 * @param {Record<string, string>} tokens  the worn 56 tokens (tokens56)
 * @param {Record<string, string>} base  the template's own 56 tokens
 * @param {string} prefix  the emitter's specificity prefix
 * @param {{ page?: string }} [opts]  page: the template's own page colour (bandColours)
 * @returns {{ rules: string[], adjusted: string[] }}
 */
export function brandKeptRules(contract, tokens, base, prefix, opts = {}) {
  const rules = []
  /** @type {string[]} */
  const adjusted = []
  const accent = tokens['--accent']
  const own = new Set(templateAccents(contract, base))
  const given = Object.entries(contract.keepDefaults ?? {})
    .filter(([k, v]) => /^--[\w-]+$/.test(k) && own.has(hex6(v) ?? ''))
    .map(([k]) => k)
  for (const scope of keptScopes(contract)) {
    const a = bandAccent(contract, tokens, base, scope, opts)
    if (!a) continue
    if (a.text !== accent)
      adjusted.push(`brand:${scope}:accent-text:${ratio(accent, a.ground)}→${ratio(a.text, a.ground)}`)
    if (a.fill !== accent)
      adjusted.push(`brand:${scope}:accent-fill:${ratio(accent, a.ground)}→${ratio(a.fill, a.ground)}`)
    const on =
      (contrast(tokens['--accent-on'], a.fill) ?? 0) >= 4.5 ? tokens['--accent-on'] : readableOn(a.fill)
    const hover =
      a.fill === accent &&
      (contrast(tokens['--accent-hover'], a.ground) ?? 0) >= 3 &&
      (contrast(on, tokens['--accent-hover']) ?? 0) >= 4.5
        ? tokens['--accent-hover']
        : a.fill
    const decls = [
      `--ds-c-accent:${a.fill}`,
      `--ds-c-accent-hover:${hover}`,
      `--ds-c-accent-active:${hover}`,
      `--ds-c-accent-on:${on}`,
      `--ds-c-accent-text:${a.text}`,
      `--ds-c-accent-text-hover:${a.text}`,
      // a given-back variable reads as words in one rule and a fill in another: the words' accent, which
      // reads as both (4.5:1 is past 3:1)
      ...given.map((k) => `${k}:${a.text}`)
    ]
    rules.push(`${prefix} ${scope}{${decls.join(';')}}`)
    // an inline SVG of the band's markup painted in a template accent (JA Boxing's call-to-action marks,
    // fill="#F44141" in acm/cta/tmpl/style-1.php): a presentation attribute loses to any stylesheet rule,
    // so the band's fill reaches it by attribute, matched without regard to case
    for (const h of own)
      for (const p of ['fill', 'stroke'])
        rules.push(`${prefix} ${scope} [${p}="${h}" i]{${p}:var(--ds-c-accent)}`)
  }
  return { rules, adjusted }
}
