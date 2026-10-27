/**
 * The 56-token contract (OpenDesign `tokens.css` names) filled from a profile: the template's own
 * values first (its base system), the system's stated and derived values laid over them. One
 * mapping for every CMS whose template reads the 56 names (WordPress through theme.json presets,
 * Joomla T4 directly).
 */
import { buttonPair, contrast, luminance, mix, parseHex, readable } from './colour.mjs'
import { palette, readableText, safeValue } from './emit.mjs'
import { omittedRoles, ROLE_VARIABLES } from './role-variables.mjs'

const val = (f) => (f && f.s !== 'empty' && f.v !== null && f.v !== undefined ? f.v : null)

/** @returns {{ tokens: Record<string, string>, text: ReturnType<typeof readableText>, palette: ReturnType<typeof palette> }} */
export function tokens56(profile, base) {
  const p = palette(profile)
  const text = readableText(p)
  const t = text.colours
  const tokens = { ...base }
  const set = (name, v) => {
    if (v !== null && v !== undefined && safeValue(String(v))) tokens[name] = String(v)
  }
  set('--bg', p.bg)
  set('--surface', t['--color-surface'] ?? p.surface)
  set('--surface-warm', p.surfaceWarm)
  // the system's texts, strongest first, go to the template's text roles in the template's own order
  // of strength (textOrder): most templates ink their headings with --fg-2 and set body copy in a
  // softer --fg, the opposite of the 56 tokens' meaning, so a dark system's derived --fg-2 (25% toward
  // its page) made every heading dimmer than the text under it (JA Essence under Moxie, 13/10/2026)
  const inks = [
    p.fg,
    t['--color-fg-2'] ?? p.fg2,
    t['--color-fg-muted'] ?? p.muted,
    t['--color-fg-meta'] ?? p.meta
  ]
  for (const [i, role] of textOrder(base).entries()) set(`--${role}`, inks[i])
  set('--border', p.line)
  set('--border-soft', p.lineSoft)
  set('--accent', p.accent)
  set('--accent-on', p.accentOn)
  set('--accent-hover', t['--color-accent-hover'] ?? p.accentHover)
  set('--accent-active', t['--color-accent-active'] ?? p.accentActive)
  const { display, body, mono } = profile.fonts
  if (val(body)) set('--font-body', body.stack ?? `"${body.v}", sans-serif`)
  if (val(display)) set('--font-display', display.stack ?? `"${display.v}", sans-serif`)
  else if (val(body)) set('--font-display', body.stack ?? `"${body.v}", sans-serif`)
  if (val(mono)) set('--font-mono', mono.stack ?? `"${mono.v}", monospace`)
  // status colours (success, warn, danger): no system states them, so they are the template's hues
  // tuned to the worn system — a fifth of the way toward its text colour, then made to read on its page
  // (as well as the template's own did, 4.5:1 to 7:1). Left as the template's literals, they kept the light page's dark red on a dark page (Tracy
  // Business Joomla's form errors under Figma's dark side, #7a2016 on #141414, 1.6:1) and stayed the
  // template's own colour under every system (TPL-1, 15/10/2026)
  const page = parseHex(p.bg) ? p.bg : null
  for (const n of ['success', 'warn', 'danger']) {
    const own = base[`--${n}`]
    if (!page || !parseHex(own) || !parseHex(p.fg)) continue
    const toward = luminance(parseHex(page)) < 0.3 ? '#ffffff' : '#000000'
    // as legible as the template made it on its own page (up to 7:1), never under 4.5:1: at the bare
    // 4.5 the dark side's status lines read muddy next to the template's own pastel ones
    const want = Math.min(7, Math.max(4.5, contrast(own, base['--bg']) ?? 4.5))
    set(`--${n}`, readable(mix(own, p.fg, 0.2), page, toward, want))
  }
  // a status colour stays the template's own (tokens56 never sets one, so the base's is worn), and the released
  // sheets also set WORDS in it: form feedback, outline buttons, .text-*, links (70 templates, 164 uses,
  // 15/10/2026), each under 4.5:1 on the worn page or surface under 313 to 1160 of the 1334 systems (JA Nova's
  // #fd7e14 stat number, 2.33:1 on Toggl Track's card). Its words get their own shade, the smallest move toward
  // the system's ink that reads 4.5:1 on both, as accent-text is for the accent; fills and lines keep the status
  for (const s of STATUS_ROLES) {
    const shade = statusText(tokens[`--${s}`], [tokens['--bg'], tokens['--surface']], p.fg)
    if (shade) t[`--color-${s}-text`] = shade
  }
  // no --container-max and no --section-y-* from the system: the content width and the section
  // rhythm are the template's (layoutRules), so a template reading the 56 names keeps its own base's
  return { tokens, text, palette: p }
}

/** The status roles: the template's own colours under every system (tokens56 leaves the base's). */
export const STATUS_ROLES = Object.freeze(['success', 'warn', 'danger'])

/** A status colour as words on every ground: itself when it reads 4.5:1 there, else the first step toward `ink` that does. */
function statusText(colour, grounds, ink) {
  if (!parseHex(colour) || !parseHex(ink) || !grounds.every((g) => parseHex(g))) return null
  const worst = (c) => Math.min(...grounds.map((g) => contrast(c, g) ?? 0))
  if (worst(colour) >= 4.5) return colour
  for (let k = 1; k <= 50; k++) {
    const c = mix(colour, ink, k / 50)
    if (worst(c) >= 4.5) return c
  }
  return null
}

const TEXT_ROLES = ['fg', 'fg-2', 'muted', 'meta']

/** A colour token as a solid hex over `ground` (`rgba(37, 36, 36, 0.7)` is JA Essence's body text), or null. */
function solidOn(v, ground) {
  const s = String(v ?? '').trim()
  // #rrggbbaa: JA Essence WordPress writes its body text #252424b3
  const a8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(s)
  if (a8) return parseHex(ground) ? mix(ground, `#${a8[1]}`, Number.parseInt(a8[2], 16) / 255) : null
  if (parseHex(s)) return s
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (!m || !parseHex(ground)) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4])
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`
  return mix(ground, hex, a)
}

/**
 * The template's text roles, strongest first: `fg`, `fg-2`, `muted`, `meta` ordered by how they read
 * on the template's own page. Roles closer than half a point keep the 56 tokens' order, so a template
 * that follows it (and one whose base cannot be read) gets that order back unchanged.
 * @param {Record<string, string>} base  the template's 56 tokens
 */
export function textOrder(base) {
  const page = solidOn(base['--bg'], '#ffffff')
  const strength = Object.fromEntries(
    TEXT_ROLES.map((r) => [r, page ? (contrast(solidOn(base[`--${r}`], page), page) ?? null) : null])
  )
  // a role that does not read on the page at all is not text for that page (JA Fresco's --fg #1d1d1f
  // on its near-black --bg): the base says nothing about order then
  if (TEXT_ROLES.some((r) => strength[r] === null || strength[r] < 2)) return [...TEXT_ROLES]
  const order = [...TEXT_ROLES]
  // a stable insertion sort that moves a role ahead only when it reads clearly stronger
  for (let i = 1; i < order.length; i++)
    for (let j = i; j > 0 && strength[order[j]] > strength[order[j - 1]] + 0.5; j--)
      [order[j - 1], order[j]] = [order[j], order[j - 1]]
  return order
}

/** The 16 colour tokens a template's own CSS may be tokenized against (`var(--ds-c-<name>, <hex>)`). */
export const COLOUR_TOKENS = Object.freeze([
  'bg',
  'surface',
  'surface-warm',
  'fg',
  'fg-2',
  'muted',
  'meta',
  'border',
  'border-soft',
  'accent',
  'accent-on',
  'accent-hover',
  'accent-active',
  'success',
  'warn',
  'danger'
])

/**
 * The `--ds-c-*` variables a worn system defines. A released template's stylesheet reads each colour
 * of its own palette as `var(--ds-c-<name>, <its hex>)`: undefined until a system is worn, so the
 * template's default look — light and dark — is byte for byte what it was. Accent used as TEXT gets
 * its own readable pair (`accent-text`, `accent-text-hover`), as in the EmDash slot.
 * Not `ink`: it is a ground worn with its words (`on-ink`, `accent-on-ink`), and the three are
 * computed together by role-values.mjs (addWornRoles). A reference to the strongest text colour here was
 * the dark side's light text under a dark system, while on-ink was computed for another ink: under
 * Moxie dark JA Kinetic's ink band went cream under cream words (15/10/2026).
 * @param {ReturnType<typeof readableText>} text
 * @param {(name: string) => string} ref  how this CMS names a token's worn value (`var(--accent)`, a preset…)
 */
export function colourVars(text, ref) {
  const o = {}
  for (const n of COLOUR_TOKENS) o[`--ds-c-${n}`] = ref(n)
  o['--ds-c-accent-text'] = text.colours['--ds-accent-text'] ?? ref('accent')
  o['--ds-c-accent-text-hover'] = text.colours['--ds-accent-text-hover'] ?? ref('accent-hover')
  // a status colour's words (`success-text`, `warn-text`, `danger-text`): what a sheet or a followRule sets
  // text in; the status token itself stays for fills and lines
  for (const s of STATUS_ROLES) o[`--ds-c-${s}-text`] = text.colours[`--color-${s}-text`] ?? ref(s)
  return o
}

/** A profile field the system states or derives (not left empty). */
export const stated = (f) => !!(f && f.s !== 'empty' && (f.v || f.range))

/**
 * The content width is the template's (Akemi, 15/10/2026, LAYOUT-3): wearing a system never changes
 * the template's layout. The system may change colours, faces, radii and shadows; container widths,
 * gutters and the spacing scale stay the template's, so every slot leaves its containers alone.
 * Forcing the system's width on the containers a contract names (JA Kinetic's 1240px → Moxie's,
 * Figma's) moved them while the template's other columns (its prose column, its related-posts row,
 * the header bar of its archive pages) kept 1240px, and one page started at two left edges
 * (edge-split on 3 Joomla and 9 WordPress pages, 15/10/2026). No contract can list every column a
 * template draws on every page; keeping the template's width keeps every edge where it put it.
 * The section rhythm (padding above and below a section) is a layout metric too: the system's 100px
 * moved every section of JA Kinetic WordPress off its 80px (15/10/2026); it stays the template's.
 *
 * Rules for the parts of a template's page a contract names beyond type and colour: the page
 * (`selectors.bodyFace`: face and weight) and the faces it names by family (`displayFace`,
 * `textFace`) — only where the system states them, so a silent system keeps the template's own.
 * `selectors.container` and `selectors.section` are not worn: width and rhythm stay the template's.
 */
export function layoutRules(profile, tokens, sel, scoped, rule, sv = {}) {
  const out = []
  // the page's face and weight. Not its colours: a T3 template paints a dark <body> behind a light
  // page wrapper and sets its footer on that body (JA Donate) — a light body would put the
  // footer's light text on light. Page colours follow through the tokenized stylesheets, which
  // keep inverse fills and their text together.
  if (sel.bodyFace)
    out.push(
      rule(scoped(sel.bodyFace), {
        'font-family': stated(profile.fonts?.body) ? tokens['--font-body'] : null,
        'font-weight': sv['--ds-weight-body']
      })
    )
  // the parts a template sets in its faces by name rather than through a variable (JA Kinetic Joomla
  // writes "Space Grotesk" on its logo, client logos and testimonial quotes, "IBM Plex Sans" on its
  // menu, buttons and metrics): they take the system's display or body face, the family only (their
  // own weights stay), and only when the system states its faces (14/10/2026)
  const fontsStated = stated(profile.fonts?.display) || stated(profile.fonts?.body)
  if (sel.displayFace && fontsStated)
    out.push(rule(scoped(sel.displayFace), { 'font-family': tokens['--font-display'] }))
  if (sel.textFace && stated(profile.fonts?.body))
    out.push(rule(scoped(sel.textFace), { 'font-family': tokens['--font-body'] }))
  return out.filter(Boolean)
}

/**
 * Every `--ds-c-*` colour role the slot defines, reset inside a kept band: the 16 tokenized colours,
 * ink, accent text and status words first (the order the reset had before), then each other colour
 * role of ROLE_VARIABLES. The rule is that inside a kept band the template's own colours win, so no
 * colour role may reach it from the worn system: heading and on-ink left out put Moxie's cream on JA
 * Symphony's hero title and JA Donate's footer, where the template draws white (20/10/2026). The
 * paired roles (role-values.mjs PAIRED_ROLES: on-ink, accent-on-ink, accent-band, on-accent-band)
 * are reset with ink and the accent, already reset here, since a pair is never worn apart: the
 * system's accent-on-ink was computed to read on the system's ink, not on the band the template keeps.
 * A template sheet reads each role with its own value as the fallback (`var(--ds-c-heading, #fff)`),
 * so the reset gives that value back. Derived from ROLE_VARIABLES, a new colour role is reset too.
 */
export const KEPT_COLOUR_ROLES = Object.freeze([
  ...new Set([
    ...COLOUR_TOKENS.map((n) => `--ds-c-${n}`),
    '--ds-c-ink',
    '--ds-c-accent-text',
    '--ds-c-accent-text-hover',
    ...STATUS_ROLES.map((n) => `--ds-c-${n}-text`),
    ...ROLE_VARIABLES.map((r) => r.name).filter((n) => n.startsWith('--ds-c-'))
  ])
])

/** One compound of a kept band's name: classes and ids only (`.c#d`). */
const KEPT_COMPOUND = '[.#][\\w-]+(?:[.#][\\w-]+)*'
const KEPT_SCOPE = new RegExp(`^${KEPT_COMPOUND}(?:\\s*>\\s*${KEPT_COMPOUND}|\\s+${KEPT_COMPOUND})*$`)

/**
 * The bands the page keeps (`keepScopes`), each a selector of classes and ids joined by descendant or
 * child combinators (`.owl-item > .item`), spaced the one way (`.a .b > .c`); anything else (a comma, a
 * pseudo-class, a brace) is dropped. Before, only a single class or id was taken and every other entry
 * was dropped without a word: JA Resort's hero slides (`.owl-item > .item`) were never reset, and their
 * title took Moxie's cream over the template's white (20/10/2026).
 * @param {{ keepScopes?: string[] }} contract
 * @returns {string[]}
 */
export function keptScopes(contract) {
  return (contract.keepScopes ?? [])
    .map((x) =>
      String(x)
        .trim()
        .replace(/\s*>\s*/g, ' > ')
        .replace(/\s+/g, ' ')
    )
    .filter((x) => KEPT_SCOPE.test(x))
}

/**
 * Inside an inverse band the page keeps (`keepScopes`), the template's own page and text colours:
 * those `--ds-c-*` reset to `initial` (a tokenized rule then falls back to its hex) and each variable
 * the slot repoints for them (T4 runtime, WordPress presets, a template's own family) given back the
 * value the released page computed (`keepDefaults`, measured by discover.mjs before any slot) — the
 * band's whole look, its buttons included.
 */
export function keepRules(contract, prefix) {
  const scopes = keptScopes(contract)
  if (!scopes.length) return []
  // the band's whole look, its buttons included: a band painted with the accent (JA Impact's navy
  // contact band) keeps that accent under its white text
  const given = Object.entries(contract.keepDefaults ?? {})
    .filter(([k, v]) => /^--[\w-]+$/.test(k) && !/[;{}<>]/.test(String(v)))
    .map(([k, v]) => `${k}:${v}`)
  // `keepDefaultsYield`: the values given back yield to the band's own declarations (zero specificity,
  // still above what the band inherits from the worn page). JA Rights' dark feature panel sets its own
  // --headings-color: #fff on the band; the root's #172433 given back over it put navy on #212121
  const yieldDefaults = contract.keepDefaultsYield === true && given.length > 0
  const decls = [
    // a role the module does not write (`omit`) needs no reset
    ...KEPT_COLOUR_ROLES.filter((n) => !omittedRoles(contract).has(n)).map((n) => `${n}:initial`),
    ...(contract.alphaVars ?? []).filter((n) => /^[a-z0-9-]+$/.test(n)).map((n) => `--ds-a-${n}:initial`),
    ...(yieldDefaults ? [] : given)
  ]
  // a kept band that paints no text colour of its own inherits the worn page's text (a Bootstrap
  // .bg-light section under a dark system: light on light). `keepText` names such bands; each takes
  // the template's own page text back, as its released page computed it (keepDefaults)
  const text = contract.keepDefaults?.['--body-text-color']
  const own = (contract.keepText ?? []).filter((x) => scopes.includes(x))
  // a kept band with no ground of its own shows the worn page through it (JA Lawfirm's FAQ: its
  // questions run past the white photo panel onto the page, dark text on a dark worn page).
  // `keepGround` names such bands; each takes the template's own page ground back
  // (keepDefaults['--body-bg-color'], as the released page computed it)
  const ground = contract.keepDefaults?.['--body-bg-color']
  const grounded = (contract.keepGround ?? []).filter((x) => scopes.includes(x))
  const hex = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v ?? ''))
  return [
    `${scopes.map((x) => `${prefix} ${x}`).join(',')}{${decls.join(';')}}`,
    ...(yieldDefaults ? [`:where(${scopes.join(',')}){${given.join(';')}}`] : []),
    // a hex, or an rgb()/rgba() literal (JA Fresco's page text is rgba(255, 255, 255, 0.8))
    ...(own.length && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i.test(String(text ?? ''))
      ? [`${own.map((x) => `${prefix} ${x}`).join(',')}{color:${text}}`]
      : []),
    // keepColors: each band's own text colour as its released page computed it (a T3 band too, where
    // no --body-text-color exists): what its texts inherit stays the template's (JA Alumni's topbar)
    ...scopes
      .filter((x) => !own.includes(x))
      .filter((x) => /^(rgba?\([\d.,\s]+\)|#[0-9a-f]{3,8})$/i.test(String(contract.keepColors?.[x] ?? '')))
      .map((x) => `${prefix} ${x}{color:${contract.keepColors[x]}}`),
    ...(grounded.length && hex(ground)
      ? [`${grounded.map((x) => `${prefix} ${x}`).join(',')}{background-color:${ground}}`]
      : [])
  ]
}

/** A selector list split at its top-level commas only (`a, :is(b, c:not(.d))` → two selectors). */
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

/**
 * The calls to action inside a kept band follow the worn system (`keptButtons`), while the band
 * itself (its ground, picture and text) stays the template's. Tracy Business's hero and closing
 * call kept their orange button under every system, so "the main button" a customer points at never
 * wore the system (walkthrough 11/10/2026, note 12).
 *
 *   "keptButtons": { "<band>": { "ground": "#hex", "buttons": ["<selector inside the band>"] } }
 *
 * `<band>` starts with one of `keepScopes` and may narrow it (`.wtb-hero:not(.wtb-hero--404)`,
 * `.wtb-cta.wtb-cta--panel`); `ground` is the fill the band shows behind its buttons, as the
 * released page computes it. Inside a kept band every `--ds-c-*` is reset, so the colours are the
 * worn literals: the accent fill with its own text, the system's button pair. Checked against the
 * band: the fill must stand out from the ground (3:1, WCAG non-text contrast) and the text read on
 * the fill (4.5:1). When the accent does not stand out but its text colour does (a black accent on
 * an ink band), the pair is turned over (accent-on fill, accent text): still the system's two
 * colours. When neither does, the template's own button stays. Shapes (radius, padding, weight)
 * already follow through the contract's button rule, which no band stops.
 * @param {{ keepScopes?: string[], keptButtons?: Record<string, { ground?: string, buttons?: string[] }>, bands?: Record<string, { important?: boolean }> }} contract
 * @param {Record<string, string>} tokens  the worn 56 tokens (tokens56)
 * @param {string} prefix  the emitter's specificity prefix (`:root`×6)
 * @param {Record<string, string>} [grounds]  the ground each worn band now shows (bandRules), by band key
 * @param {string | string[]} [buttons]  the contract's primary-button selectors (for worn bands without keptButtons)
 * @param {Record<string, { ground: string, media: string }>} [media]  the ground of each band that is one
 *   only at some widths (bandRules), its button rules written inside that media query
 * @returns {string[]}
 */
export function keptButtonRules(contract, tokens, prefix, grounds = {}, buttons = [], media = {}) {
  const scopes = (contract.keepScopes ?? []).filter((x) => /^[.#][\w-]+$/.test(x))
  const out = []
  // a kept band that wears the system's ground (bands.mjs) and names no buttons of its own: the
  // template's primary buttons inside it wear the system's pair too, judged on that ground — left
  // alone they kept the template's colour on the new ground (GK Compact's red button on Stripe's
  // navy hero, 13/10/2026). A button selector is taken from its last ancestor-free part
  // (`.tracy .wp-block-button > a` → `.wp-block-button > a`)
  const own = (list) =>
    [
      ...new Set(
        (Array.isArray(list) ? list : list ? [list] : []).map((x) =>
          String(x)
            .replace(/^\.tracy\s+/, '')
            .trim()
        )
      )
    ].filter((x) => x && !/[{};<\\]|\/\*/.test(x))
  const all = { ...contract.keptButtons }
  // a fill (a coloured block outside the kept bands, bands.mjs) is worn the same way: its buttons were
  // left to the page's button rule, the plain accent on the fill's new ground (JA Civica's dark block
  // under BMW: blue on #262626, 2.9:1, 13/10/2026)
  const fill = (band) => contract.bands?.[band]?.fill === true
  // a band that is one only at some widths (bands.mjs `media`): its buttons wear the pair there, on its
  // ground at those widths, and are left to the template elsewhere
  /** @type {Record<string, string>} */
  const at = {}
  for (const [band, m] of Object.entries(media ?? {}))
    if (
      m &&
      /^#[0-9a-f]{6}$/i.test(String(m.ground)) &&
      /^\((max|min)-width:\s*\d{3,4}px\)$/.test(String(m.media))
    )
      at[band] = m.media
  const on = { ...grounds, ...Object.fromEntries(Object.keys(at).map((k) => [k, media[k].ground])) }
  for (const band of Object.keys(on))
    if (!all[band] && (scopes.includes(/^[.#][\w-]+/.exec(band)?.[0]) || fill(band)) && own(buttons).length)
      // and its light buttons, solid in one template and outlined in another: the pair reads either way
      all[band] = { ground: on[band], buttons: [...own(buttons), '.btn-white', '.btn-light'] }
  const buttonsOf = (spec) =>
    (spec?.buttons ?? []).filter((s) => typeof s === 'string' && s.trim() && !/[{};<\\]|\/\*/.test(s))
  // a band whose buttons this writes: a kept band or a fill, keyed by classes and ids only
  const worn = (band) => {
    const m = /^([.#][\w-]+)((?:[.#][\w-]+|:not\([.#][\w-]+\))*)$/.exec(band)
    return m && (scopes.includes(m[1]) || fill(band)) ? m : null
  }
  for (const [band, spec] of Object.entries(all)) {
    const m = worn(band)
    if (!m) continue
    const buttons = buttonsOf(spec)
    // a band that wears the system's ground (bands.mjs) is judged against that ground, not its own
    const pair = keptButtonPair(tokens, on[band] ?? on[m[1]] ?? spec?.ground)
    if (!pair || !buttons.length) continue
    // a button belongs to the innermost band around it: an outer band keyed by id outweighed the inner band
    // that holds the button, which was judged on the outer ground (JA Fit's #Section98 around its call band,
    // 14/10/2026). Inside :where(), so the guard adds no weight
    const others = Object.keys(all).filter((k) => k !== band && worn(k) && buttonsOf(all[k]).length)
    const inner = others.length ? `:where(:not(${band} :is(${others.join(', ')}) *))` : ''
    // the guard closes each selector (after :hover, on the descendant of ` *`), so a Joomla module writes it once a
    // rule (joomla.mjs nestNots): per selector it doubled JA Impact's module past the 64 KB its column holds. Not
    // an :is() list of the buttons, which weighs every button as the heaviest of them and turned JA Rent's slide
    // button over under Stripe where the page's button rule used to win
    const sel = (suffix) => buttons.map((s) => `${prefix} ${band} ${s.trim()}${suffix}${inner}`).join(',')
    // a band painted `!important` (T4's palettes: JA Helple's red donate button kept its fill under a
    // plain rule while its text changed, 1.31:1) gives its buttons `!important` too
    const b = contract.bands?.[band]?.important === true ? '!important' : ''
    const rules = [
      // background-image none: a template's gradient button (GK Restly's orange-to-blue) would paint over the fill
      `${sel('')}{background-color:${pair.fill}${b};background-image:none${b};border-color:${pair.fill}${b};color:${pair.text}${b}}`,
      `${sel(':hover')}{background-color:${pair.hover}${b};border-color:${pair.hover}${b};color:${pair.text}${b}}`,
      // and what is inside it with a colour of its own (JA Impact's "read more" label, a white <p> in the
      // button, white on its turned white fill, 13/10/2026)
      `${sel(' *')}{color:${pair.text}${b}}`
    ]
    out.push(...(at[band] ? [`@media ${at[band]}{${rules.join('')}}`] : rules))
  }
  return out
}

/**
 * The fill and text a kept band's button wears on `ground`, or null when the system's pair cannot
 * stand out there (the template's own button then stays). See keptButtonRules.
 * @param {Record<string, string>} tokens
 * @param {string | undefined} ground
 * @returns {{ fill: string, text: string, hover: string, turned: boolean } | null}
 */
export function keptButtonPair(tokens, ground) {
  return buttonPair(tokens['--accent'], tokens['--accent-on'], tokens['--accent-hover'], ground)
}

/**
 * The selectors of a rule that paints a worn system's colours, stopped at the edge of every band the
 * page keeps (`keepScopes`): inside one, the template's own rule paints. keepRules gives a band back
 * the variables a template paints with, but a slot rule that names its own colour still reached in —
 * Tracy Business's hero and closing call are kept, yet under every system their orange button
 * (`is-style-orange`, painted from a variable of the template's own) measured the accent the band
 * keeps (#14483a), because the primary-button rule matches every button (10/10/2026). A
 * pseudo-element stays last (`summary::after` → `summary:not(…)::after`). No kept band: unchanged.
 * @param {{ keepScopes?: string[] }} contract
 * @param {(key: string, band: any) => boolean} [worn]  whether the worn system wears a fill (bands.mjs
 *   bandColours gives it colours); every fill when omitted
 * @returns {(list: string | string[]) => string[]}
 */
export function outsideKept(contract, worn = () => true) {
  // and a fill (bands.mjs): its ground is chosen so the words it shows still read, so a page rule that
  // recolours words reaching into it fought that ground (JA Landscape's green block took Spotify's
  // surface for its pale-green words, and the page's on-accent rule turned them black on it, 1.18:1,
  // 13/10/2026). Its buttons are keptButtonRules'. A fill the system cannot wear (no ground of the
  // system reads every word it shows) is painted by nothing of its own, so the page's rules reach it as
  // before fills: JA Alpha's red services band, with white cards and white words on it, kept its red
  // under every system while its own followRules stopped at its edge (13/10/2026)
  const fills = Object.entries(contract.bands ?? {})
    .filter(([k, b]) => b?.fill === true && /^[.#][\w-]+([.#][\w-]+)*$/.test(k) && worn(k, b))
    .map(([k]) => k)
  const scopes = [...keptScopes(contract), ...fills]
  const as = (list) => (Array.isArray(list) ? list : [list])
  if (!scopes.length) return as
  const not = `:not(${scopes.flatMap((x) => [x, `${x} *`]).join(', ')})`
  return (list) =>
    as(list)
      .flatMap(topLevel)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const pseudo = /::?(before|after|marker|placeholder|first-line|first-letter)$/.exec(s)
        return pseudo ? `${s.slice(0, pseudo.index)}${not}${pseudo[0]}` : `${s}${not}`
      })
}

/**
 * The template's eyebrows — the small label over a section heading — where the system's eyebrow is
 * worn (size, weight, case, letter spacing): `selectors.eyebrow`, else the accent-text selectors whose
 * names say so (`.tracy-eyebrow`, `.sub-heading`, `.kicker`…). Never their colour: that is accentText's.
 * @param {{ eyebrow?: string | string[], accentText?: string | string[] }} sel
 * @returns {string[]}
 */
export function eyebrowSelectors(sel) {
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : [])
  const named = list(sel?.eyebrow)
  if (named.length) return named
  return list(sel?.accentText).filter((s) =>
    /eyebrow|kicker|sub-?heading|subtitle|overline|pre-?title|tagline/i.test(String(s))
  )
}

/**
 * Form controls keep the template's box metrics (Akemi, 14/10/2026, LAYOUT-3): a field and its button
 * are sized together by the template (JA Kinetic's footer: a 45 px e-mail field and a 45 px Subscribe in
 * one row), and the system's button padding, line height, size, weight, case and spacing on one of them
 * only (Moxie's 7 px padding: Subscribe went 33 px tall beside its 45 px field) broke the row. A system
 * may change a control's colours, face, radius and shadow; the box metrics stay the template's. So
 * every rule of the slot that sets a button's box metrics stops at a form: `:where()` adds no
 * specificity, so outside forms the rules win exactly as before.
 */
export const OUTSIDE_FORMS = ':where(:not(form *))'

/** Each selector of a list (an array, a comma list) made to stop at a form ({@link OUTSIDE_FORMS}). */
export const outsideForms = (/** @type {string | string[] | undefined} */ list) =>
  [list ?? []]
    .flat()
    .flatMap((x) => splitList(String(x)))
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      // before a pseudo-element, which must end a selector
      const at = x.indexOf('::')
      return at === -1 ? `${x}${OUTSIDE_FORMS}` : `${x.slice(0, at)}${OUTSIDE_FORMS}${x.slice(at)}`
    })

/**
 * The rules that wear what a system's reference page says of its type and components, beyond the 56
 * tokens (slotVars: case and spacing of the display, the heading's face and spacing, the button's
 * label, the eyebrow, the card's shadow), on the contract's selectors. Empty when the profile states
 * none of it.
 * @param {Record<string, any>} sel  the contract's selectors
 * @param {Record<string, string>} sv  slotVars
 * @param {(list: string | string[]) => string} scoped
 * @param {(selector: string, decls: Record<string, any>) => string} rule
 * @param {(list: string | string[]) => string[]} outside  stops a rule at the bands the page keeps
 * @param {(list: string[]) => string[]} [buttons]  narrows the buttons whose type the system sets (Joomla: not in
 *   the header, not the menu toggles)
 */
export function componentRules(sel, sv, scoped, rule, outside, buttons = (l) => l) {
  const has = (x) => (Array.isArray(x) ? x.length > 0 : Boolean(x))
  const eyebrows = eyebrowSelectors(sel)
  return [
    has(sel.display)
      ? rule(scoped(sel.display), {
          'text-transform': sv['--ds-transform-display'],
          'letter-spacing': sv['--ds-tracking-display']
        })
      : '',
    has(sel.heading)
      ? rule(scoped(sel.heading), {
          'font-family': sv['--ds-font-heading'],
          'letter-spacing': sv['--ds-tracking-heading']
        })
      : '',
    has(sel.button) || has(sel.buttonPrimary)
      ? rule(
          scoped(outsideForms(buttons([...[sel.button ?? []].flat(), ...outside(sel.buttonPrimary ?? [])]))),
          {
            'font-size': sv['--ds-size-button'],
            'text-transform': sv['--ds-transform-button'],
            'letter-spacing': sv['--ds-tracking-button']
          }
        )
      : '',
    eyebrows.length
      ? rule(scoped(eyebrows), {
          'font-size': sv['--ds-eyebrow-size'],
          'font-weight': sv['--ds-eyebrow-weight'],
          'text-transform': sv['--ds-eyebrow-transform'],
          'letter-spacing': sv['--ds-eyebrow-tracking']
        })
      : '',
    // the display line keeps its own face and weight where it is also a section heading (JA Blockk's
    // display is an h2: the heading's face reached it, BMW's body face at 400 over its light display)
    has(sel.display) || has(sel.displaySize)
      ? rule(
          scoped(
            [...[sel.display ?? []].flat(), ...[sel.displaySize ?? []].flat()]
              // top-level commas only: one inside :is() would cut a selector in two (19/10/2026)
              .flatMap((x) => topLevel(String(x)))
              .map((x) => x.trim())
              .filter(Boolean)
              .map((x) => `${x}:not(.tracy-ds-display)`)
          ),
          { 'font-family': sv['--ds-font-display'], 'font-weight': sv['--ds-weight-display'] }
        )
      : '',
    has(sel.card) ? rule(scoped(sel.card), { 'box-shadow': sv['--ds-card-shadow'] }) : '',
    // the template's other rounded boxes and labels, found on its page (scripts/bands.mjs)
    has(sel.cardLike) ? rule(scoped(sel.cardLike), { 'border-radius': sv['--ds-card-radius'] }) : '',
    has(sel.pill) ? rule(scoped(sel.pill), { 'border-radius': sv['--ds-pill-radius'] }) : ''
  ].filter(Boolean)
}

/**
 * The featured item of a pricing block keeps its accent edge under a system (15/10/2026). Tracy Base WP
 * marks its "Studio" plan with a ring of its own (box-shadow), and the card rule above (box-shadow: the
 * system's card shadow) replaced it, so under Mailchimp it looked like the other plans; JA Kinetic marks
 * its popular plan with a border in the accent preset, which became Mailchimp's yellow at 1.2:1 on the
 * page. The contract names its featured cards, `selectors.featuredCard: { selector: "ring" | "border" }`:
 * "ring" (the template draws the mark as a box-shadow) gets `0 0 0 2px <ring>` followed by the system's
 * card shadow when it states one; "border" (the template draws a border) keeps the border's width and
 * style and takes the ring colour. The ring colour is the system's accent where it reads 3:1 on the page
 * (non-text contrast), else its readable accent text.
 * @param {Record<string, any>} sel  the contract's selectors
 * @param {Record<string, string>} sv  slotVars
 * @param {{ accent?: string, accentText?: string, page?: string }} colours  of the side being written
 * @param {(list: string | string[]) => string} scoped
 * @param {(selector: string, decls: Record<string, any>) => string} rule
 * @param {(list: string | string[]) => string[]} outside  stops a rule at the bands the page keeps
 * @returns {string[]}
 */
export function featuredCardRules(sel, sv, colours, scoped, rule, outside) {
  const featured = sel?.featuredCard
  if (!featured || typeof featured !== 'object' || Array.isArray(featured)) return []
  const { accent, accentText, page } = colours
  const ring = accent && page && (contrast(accent, page) ?? 0) >= 3 ? accent : (accentText ?? accent)
  if (!ring) return []
  const of = (kind) =>
    Object.entries(featured)
      .filter(([, k]) => k === kind)
      .map(([s]) => s)
  const rings = of('ring')
  const borders = of('border')
  const shadow = sv['--ds-card-shadow']
  return [
    rings.length
      ? rule(scoped(outside(rings)), { 'box-shadow': `0 0 0 2px ${ring}${shadow ? `, ${shadow}` : ''}` })
      : '',
    borders.length ? rule(scoped(outside(borders)), { 'border-color': ring }) : ''
  ].filter(Boolean)
}

// a repeated item of a list or a grid — a card, a post in a blog list, a list item: its title is the item's,
// sized by the template for the item's width, not a section heading. Card and blog titles took the system's
// section heading size and stood four lines tall in a three-column grid (JA Educatsy's and JA Essence's category
// pages, JA Comics' news list, 14/10/2026)
export const ITEM = 'article *, li *, .card *, [class*="-item"] *, [class*="item-"] *'

/** A selector list split at its own commas, never at those inside `:not(…)` / `:is(…)`. */
export function splitList(x) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < x.length; i++) {
    if (x[i] === '(') depth++
    else if (x[i] === ')') depth--
    else if (x[i] === ',' && depth === 0) {
      out.push(x.slice(start, i))
      start = i + 1
    }
  }
  out.push(x.slice(start))
  return out
}

/**
 * Each selector of a list, limited to elements that are not `not` (a selector list of its own). The limit
 * weighs nothing (`:where`): it leaves elements out without outranking what the contract names for them — as a
 * plain `:not(#t4-header *, …)` it added an id to every button rule, and JA Beauty's outline button lost its
 * followRules text colour to the button's accent-on: white on its white section (14/10/2026)
 */
export function outsideOf(list, not) {
  return (Array.isArray(list) ? list : [list])
    .flatMap((x) => splitList(String(x)))
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => `${x}:where(:not(${not}))`)
}
