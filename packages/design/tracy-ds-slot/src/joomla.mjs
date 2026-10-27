/**
 * Profile → the HTML one Joomla site module carries so a T4 `tracy-base` site wears a system: a
 * Google Fonts link and one <style>. Created and changed through Claude Cowork's content.update kind
 * `module` (+ moduleAssignment: every page), first in `header-r` so it is parsed before the page it styles — no template file, so the presentation lock is untouched
 * and no quickstart release is needed. PURE.
 *
 * Why a module: T4 reads its own custom-code params (`system_advancedCode*`) only from
 * `etc/global.json`, a file the presentation lock holds (measured 09/10/2026 on tracy-base/j6 1.0.2:
 * a value written to the style's params never reaches the page). A <style> in the body still applies
 * to the whole document and comes after every head stylesheet.
 *
 * What the sheet sets:
 *  - the 56 tokens on every theme scope, light and dark alike: a system is one look;
 *  - T4's runtime variables (`--body-bg-color`…) pointed at the tokens — T4 writes them as literals
 *    from etc/theme/*.json, and only the template's dark block repoints them;
 *  - the landing's `--brand-*` variables (it is a brand-engine page drawn with them inline);
 *  - weights and families on headings and body, at (0,6,0) specificity, below inline styles.
 */
import { compactCss } from './compact-css.mjs'
import { luminance, parseHex } from './colour.mjs'
import {
  fontsHref,
  onVietnamese,
  safeDeclaration,
  slotVars,
  STACKED_MARKS_LEADING,
  templateSizes
} from './emit.mjs'
import { autoPaletteCss, roleValues, splitTop } from './auto-palette.mjs'
import { bandColours, bandRules } from './bands.mjs'
import { gate } from './normalise.mjs'
import { addWornRoles, facesOf } from './role-values.mjs'
import { omittedRoles } from './role-variables.mjs'
import { twoSides } from './sides.mjs'
import {
  COLOUR_TOKENS,
  colourVars,
  componentRules,
  featuredCardRules,
  keepRules,
  ITEM,
  keptButtonRules,
  outsideOf,
  layoutRules,
  outsideForms,
  outsideKept,
  STATUS_ROLES,
  splitList,
  tokens56
} from './tokens56.mjs'

const HI = ':root:root:root:root:root:root'
const FOLLOW_ROLES = new Set([
  ...COLOUR_TOKENS,
  // the neutral hover ground (role-values.mjs surfaceHoverOf): a grey row or button's :hover
  'surface-hover',
  'accent-text',
  'accent-text-hover',
  ...STATUS_ROLES.map((s) => `${s}-text`),
  'ink',
  'on-ink',
  // the accent as words on an ink band (role-values.mjs): JA Kinetic WordPress's ticker LIVE label
  'accent-on-ink',
  // a whole band painted in the accent and its words (role-values.mjs accentBand): the accent-filled
  // button stands out on it (3:1). Tracy Business Joomla's closing call band, the same on the published
  // release (whose stylesheet reads no role) as on the one that reads them (15/10/2026)
  'accent-band',
  'on-accent-band'
])
// a band and its words, on the side of light the page is on (auto-palette.mjs roleValues)
const BAND_ROLES = /** @type {Record<string, string>} */ ({
  band: roleValues().band,
  'on-band': roleValues()['on-band']
})
// outline-color: a field's focus ring the content writes inline (Tracy Business WordPress's form states, 15/10/2026)
const FOLLOW_PROPS =
  /^(color|background-color|border-color|border-top-color|border-bottom-color|outline-color|fill)$/

/** A contract's followRules as [selector, {property: var(--ds-c-<role>)}], unknown roles and properties dropped. */
export function followRules(contract) {
  return (
    Object.entries(contract.followRules ?? {})
      // a child combinator is a selector like any other ('>' cannot close the <style>; '<' stays out)
      .filter(([sel]) => typeof sel === 'string' && sel && !/[{}<;]/.test(sel))
      .map(([sel, decls]) => [
        sel,
        Object.fromEntries(
          Object.entries(decls ?? {})
            // `role!` beats a template rule marked !important (T4's palette nav links)
            .map(([prop, role]) => [prop, String(role).replace(/!$/, ''), String(role).endsWith('!')])
            .filter(
              ([prop, role]) => FOLLOW_PROPS.test(prop) && (FOLLOW_ROLES.has(role) || role in BAND_ROLES)
            )
            .map(([prop, role, important]) => [
              prop,
              `${BAND_ROLES[role] ?? `var(--ds-c-${role})`}${important ? '!important' : ''}`
            ])
        )
      ])
      .filter(([, d]) => Object.keys(d).length)
  )
}

// the page header's elements, as Joomla templates mark them: HTML's own header and nav, Bootstrap's navbar,
// T4's header block and the Gavick header
const HEADER = 'header *, nav *, .navbar *, .t4-header *, #t4-header *, #gkHeader *'

/** Each selector of a list, limited to elements outside the page header. */
function notInHeader(list) {
  return outsideOf(list, HEADER)
}

// the page's menu toggles: icon-only buttons whose icon is drawn in the template's colour, often as a picture.
// Filled with a system's button colour the icon vanished (JA Diner's black blob under Airbnb, JA Donate's blank
// white square under Notion, 14/10/2026): they keep the template's look
const TOGGLES =
  '.navbar-toggler, .navbar-toggle, .off-canvas-toggle, .t3-off-canvas-toggle, .t4-offcanvas-toggle, .menu-toggle, [data-toggle="collapse"], [data-bs-toggle="collapse"], [data-toggle="offcanvas"], [data-bs-toggle="offcanvas"]'

// a toggle's icon drawn as bars (Bootstrap's .icon-bar, T3's off-canvas spans, T4's .toggle-bars): their
// background is the icon's colour
const TOGGLE_BARS = '.icon-bar, .bar-first, .bar-mid, .bar-last, .toggle-bars'

/** A button list without the menu toggles. */
const notToggle = (list) => outsideOf(list, TOGGLES)

// Bootstrap's own components: their grounds are Bootstrap's literal white or grey, which no tokenizing of a
// template's palette reaches, while their words follow the system — under a dark system a row of blank white
// boxes with pale labels (JA Insight's and JA Impact's pagination, JA Impact's login inputs, 14/10/2026). They
// wear the system's surface, text and line; the current page and the chosen item its accent
const FRAMEWORK_SURFACE = [
  '.pagination > li > a',
  '.pagination > li > span',
  '.page-link',
  '.form-control',
  '.input-group-addon',
  '.input-group-text',
  '.well',
  '.list-group-item',
  '.dropdown-menu',
  // Joomla's own tabs (joomla-tab, an article's or a module's tab set): its #fefefe panel (joomla-tab-element), its
  // #f5f5f5 tab strip and accordion heads, from Joomla's sheet: under a dark system a white panel of pale words (JA
  // Alumni's course page, 3.83:1, 15/10/2026)
  'joomla-tab > joomla-tab-element',
  'joomla-tab > div[role=tablist]',
  'joomla-tab[view=accordion] > button'
]
const FRAMEWORK_ACTIVE = [
  '.pagination > .active > a',
  '.pagination > .active > span',
  '.page-item.active .page-link',
  '.list-group-item.active'
]
const FRAMEWORK_WORDS = ['.dropdown-menu > li > a', '.dropdown-item', 'joomla-tab button[role=tab]']
// the frameworks' off-canvas menu panels: their ground is the framework's literal (Bootstrap's #212529, a white
// panel) while the menu's words follow the system — opened on a phone, dark words on #212529 under a light system
// (JA Fresco, 1.13:1) or pale ones on white under a dark one (JA Podcast, 14/10/2026). They wear the system's page
const FRAMEWORK_PANELS = ['.t4-offcanvas', '.t3-off-canvas', '.offcanvas', '.off-canvas']
// what the frameworks paint apart inside that panel: its header strip, the close button on it and T4's submenu
// chevrons — JA Fresco's strip stayed white over a dark page, JA Podcast's close × read 3.9:1 on its white disc
// and its chevrons were black on a black panel (DOM round 3, 14/10/2026)
const PANEL_HEADERS = ['.t4-off-canvas-header', '.t3-off-canvas-header']
const PANEL_CLOSES = ['.t4-off-canvas-header .close', '.t3-off-canvas-header .close']
const PANEL_CHEVRONS = ['.t4-offcanvas .btn-toggle::after']
// Bootstrap's ground and text utilities: `!important` literals (a white `.bg-white` section, `.text-dark` words) —
// a section kept its light ground while its words took a dark system's pale text (JA Purity IV's "A perfect starting
// point", 1.3:1 under Moxie, 14/10/2026). Light grounds wear the system's surface, dark words its text
const FRAMEWORK_GROUNDS = ['.bg-white', '.bg-body', '.bg-body-tertiary', '.bg-body-secondary']
// .bg-light is the template's quiet raised ground (a section lifted 1.04-1.09:1 off its page): the system's surface
// made it a 1.21:1 block on Moxie's black page (JA Trip's .t4-section-4, JA Vega's about-us, lane D 16/10/2026), so it
// wears the alternate surface, as JA Kinetic WordPress's light band does
const FRAMEWORK_RAISED = ['.bg-light']
const FRAMEWORK_INKS = ['.text-black']
// dark words on a Bootstrap colour fill (.badge.bg-warning.text-dark, .card.bg-info.text-dark, a progress bar) read
// the page's text colour on the fill, 1.0-2.0:1 under Moxie (lane D 16/10/2026): on a fill, or inside one, they are
// left to the fill's own words (ja-products' shared Bootstrap block pairs each .bg-* fill with its on-colour)
// (one :is() member and a compact list: the module stays under the 64000 bytes Joomla stores)
const FRAMEWORK_INKS_OFF_FILL = [':is(.text-dark,.text-body)']
// .bg-light counts too: it is a worn fill of its own (FRAMEWORK_RAISED), and the page's text colour on it read
// quieter than the heading a badge sits in (JA Vega's typography "New" badge, HIER-1 under Moxie, 16/10/2026)
const COLOUR_FILLS =
  ':is(.bg-primary,.bg-secondary,.bg-success,.bg-info,.bg-warning,.bg-danger,.bg-dark,.bg-light)'
const ON_A_FILL = `${COLOUR_FILLS},${COLOUR_FILLS} *`
// Bootstrap's muted words: .text-muted (and BS 5.3's .text-body-secondary) paint --t4-secondary-color / --bs-secondary-color
// !important, which T4 BS5 releases write as a literal rgba(33, 37, 41, 0.75): every blog's and article's byline (T4's
// info block, <dl class="article-info text-muted">) stayed that dark grey on a dark system's page (JA Coach's /blog under
// Moxie, 1.36:1, 15/10/2026). They take the system's muted text, readable on its page and surface by construction
const FRAMEWORK_MUTED = ['.text-muted', '.text-body-secondary']

// the logo T4 draws for each side of light (its logo element's span.d-light and span.d-dark): the one made for the
// worn side, which a contract shows there (sideRules), is never inverted — inverted on top of the swap, JA Purity IV's
// light dark-mode wordmark turned dark on a dark system's black header and JA Boxing's light-mode one a black box
// under a light system (look review v8, 15/10/2026)
const SIDE_LOGO = { dark: 'span.d-dark *', light: 'span.d-light *' }

// the logo pictures of the Joomla frameworks (T3, T4, Gavern, Bootstrap's navbar brand)
const LOGOS = [
  '.logo img',
  '.logo-img',
  '.navbar-brand img',
  '.t3-logo img',
  '.t4-logo img',
  '#gkLogo img',
  '.site-logo img'
]

/**
 * The declarations of one `pictureRules` entry, each through `safeDeclaration` (a safe value, or a mask whose
 * picture is an inline percent-encoded SVG: a data URI fetches nothing, so it draws on the site, in the live
 * preview and in the static one alike). A `mask-image` is written `-webkit-` prefixed too.
 * @param {Record<string, unknown>} o
 */
export function pictureDecls(o) {
  const out = []
  for (const [k, raw] of Object.entries(o ?? {})) {
    if (!/^[a-z-]+$/.test(k) || raw === null || raw === undefined) continue
    const v = String(raw)
    if (k === '-webkit-mask-image' || !safeDeclaration(k, v)) continue
    if (k === 'mask-image') out.push(`-webkit-mask-image:${v}`)
    out.push(`${k}:${v}`)
  }
  return out.join(';')
}

// a button never rounder than 2em: a pill on a button a line tall, a rounded box on a link the size of a card
// (JA Helple's "Check Out Our Work" card wore a pill's 9999px and its label was cut by the curve, 14/10/2026)
export const BUTTON_RADIUS_MAX = '2em'
const buttonRadius = (r) => (r ? `min(${r}, ${BUTTON_RADIUS_MAX})` : r)

/** Each selector of a list made to skip a button that directly follows a field (a joined control). */
const notJoined = (/** @type {string | string[]} */ list) =>
  [list]
    .flat()
    .flatMap((x) => splitList(String(x)))
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => `${x}:where(:not(:is(input, select, textarea) + *))`)

/**
 * `css` is the readable sheet (each side of a two-mode template whole); `sheet` is what the module's <style>
 * carries before nestNots (for two modes: side-merge.mjs, the same rules on each side in fewer bytes).
 * @returns {{ html: string, css: string, sheet: string, fontsHref: string | null, adjusted: string[] } | { refused: string[] }}
 */
export function joomlaSlot(profile, base, contract) {
  const g = gate(profile)
  if (!g.ok) return { refused: g.reasons }
  const href = fontsHref(profile)
  const head = `/* tracy-ds-slot: ${profile.id.replace(/[^a-z0-9:-]/gi, '')} */`
  let css
  // what the module carries: the sheet itself, or for two modes the same sheet with the rules both sides
  // write alike written once (side-merge.mjs), so both modes and the bands fit MODULE_MAX_BYTES
  let sheet
  let adjusted
  let mode
  if (contract.modes === true) {
    // a template with a light/dark switch (sides.mjs): both modes, the switch kept
    const two = twoSides(profile, (p) => joomlaSheet(p, base, contract), contract, { shared: true })
    css = `${head}\n${two.css}`
    sheet = `${head}\n${two.shared}`
    adjusted = [...two.own.adjusted, ...two.derived.adjusted.map((a) => `derived:${a}`)]
    mode = two.mode
  } else {
    const one = joomlaSheet(profile, base, contract)
    css = `${head}\n${one.css}`
    sheet = css
    adjusted = one.adjusted
  }
  const moduleOf = (text) =>
    `${href ? `<link rel="stylesheet" href="${href}">` : ''}<style id="tracy-ds-slot">${text}</style>`
  let html = moduleOf(nestNots(sheet))
  let bytes = new TextEncoder().encode(html).length
  // A module past the bound is written without the whitespace CSS never reads (compact-css.mjs): JA Impact
  // two-mode under Stripe, Nike and five other systems was 64.0-64.6 KB (17/10/2026). A module that fits
  // keeps its bytes.
  if (bytes > MODULE_MAX_BYTES) {
    html = moduleOf(compactCss(nestNots(sheet)))
    bytes = new TextEncoder().encode(html).length
  }
  if (bytes > MODULE_MAX_BYTES)
    throw new Error(`the module is ${bytes} bytes, over the ${MODULE_MAX_BYTES} Joomla stores`)
  return { html, css, sheet, fontsHref: href, adjusted, ...(mode && { mode }) }
}

/**
 * What a module's `content` holds: Joomla's `#__modules.content` is a MySQL TEXT column, 65,535 bytes. JA Impact's
 * sheet reached 72 KB (14/10/2026) and the write failed ("Data too long for column 'content'"). The module's content
 * is this html exactly (the font link included; the Cowork plugin finds it by its own <style id> mark), so the bound
 * keeps 1.5 KB under the column: a two-mode template writes its sheet for three sides, and Tracy Business Joomla
 * reached 60.9 KB under OpenDesign's Stripe (15/10/2026)
 */
export const MODULE_MAX_BYTES = 64000

/**
 * The same sheet, its long band guards written once a rule instead of once a selector: a rule whose every
 * selector ends in the same `:not(<kept bands>)` (outsideKept) or `:where(…)` (the kept-band buttons' innermost
 * band) becomes `:not(…){<selector>&, …{…}}`. `x&` is `x:is(:not(…))` (or `x:is(:where(…))`, which weighs nothing):
 * the same elements, the same specificity, the rules in the same order (CSS nesting). Rules next to each other
 * under the same guard share one block.
 * @param {string} css
 */
export function nestNots(css) {
  // \u0000 guard \u0001 rules \u0002 marks a block while the neighbours are merged
  const marked = css.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selectors, body) => {
    // whitespace and comments before the selectors stay where they are: a sheet's `/* mode: dark */` line
    // went into the first guard's block (JA Kinetic WordPress, whose side condition reads as a guard)
    const lead = /^(?:\s|\/\*[\s\S]*?\*\/)*/.exec(selectors)[0]
    let guard = null
    const own = []
    for (const s of splitList(selectors.slice(lead.length).trim()).map((x) => x.trim())) {
      const g = trailingNot(s)
      if (!g || g.not.length < 40 || (guard !== null && guard !== g.not)) return whole
      guard = g.not
      own.push(`${g.before}&${g.pseudo}`)
    }
    return guard ? `${lead}\u0000${guard}\u0001${own.join(',')}{${body}}\u0002` : whole
  })
  // the markers are control characters on purpose: no CSS holds them
  // oxlint-disable-next-line no-control-regex
  const neighbours = /\u0000([^\u0001]*)\u0001[^\u0002]*\u0002(?:\s*\u0000\1\u0001[^\u0002]*\u0002)+/g
  // oxlint-disable-next-line no-control-regex
  const block = /\u0000[^\u0001]*\u0001([^\u0002]*)\u0002/g
  // oxlint-disable-next-line no-control-regex
  const unmark = /\u0000([^\u0001]*)\u0001([^\u0002]*)\u0002/g
  return marked
    .replace(neighbours, (run, guard) => {
      const rules = [...run.matchAll(block)].map((m) => m[1])
      return `\u0000${guard}\u0001${rules.join('')}\u0002`
    })
    .replace(unmark, '$1{$2}')
}

/**
 * The `:not(…)` or `:where(…)` a selector ends with (before a pseudo-element), found from its closing
 * parenthesis back to the one that opens it, or null.
 * @param {string} s
 * @returns {{ before: string, not: string, pseudo: string } | null}
 */
function trailingNot(s) {
  const pseudo = /::[\w-]+$/.exec(s)?.[0] ?? ''
  const body = s.slice(0, s.length - pseudo.length)
  if (!body.endsWith(')')) return null
  let depth = 0
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i] === ')') depth++
    else if (body[i] === '(' && --depth === 0) {
      const fn = /:(not|where)$/.exec(body.slice(0, i))
      if (!fn) return null
      const start = i - fn[0].length
      return { before: body.slice(0, start), not: body.slice(start), pseudo }
    }
  }
  return null
}

/**
 * The module sheet for one profile, without its header line. A one-look contract hides the
 * template's switch; a two-mode one (`modes`) leaves it, each side written by its own call.
 * @returns {{ css: string, adjusted: string[] }}
 */
function joomlaSheet(profile, base, contract) {
  const { tokens, text, palette: wornPalette } = tokens56(profile, base)
  const sv = slotVars(profile, templateSizes(contract))
  const sel = contract.selectors ?? {}
  const decls = (o) =>
    Object.entries(o)
      // safeDeclaration: safeValue, or a contract's inline SVG mask (PIC-1)
      .filter(([k, v]) => v !== null && v !== undefined && safeDeclaration(k, String(v)))
      .map(([k, v]) => `${k}:${v}`)
      .join(';')
  const rule = (selector, o) => {
    const d = decls(o)
    return d ? `${selector}{${d}}` : ''
  }
  // a template whose content sizes and shapes with Bootstrap 5 utilities (`.fs-1`, `.rounded-pill`,
  // `.rounded-4`: each `!important`) takes the system's sizes and shapes only as `!important` too —
  // opted into per contract (`utilitiesImportant`), never for the JA family, whose rules win plainly
  const shape = (selector, o) =>
    contract.utilitiesImportant
      ? rule(
          selector,
          Object.fromEntries(
            Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? v : `${v}!important`])
          )
        )
      : rule(selector, o)
  // `weightImportant`: a template whose demo content forces weights with Bootstrap's `!important`
  // utilities (JA Campaign's hero title `.font-weight-bold`) takes the system's weights `!important`
  // too — opted into per contract; without it the weights stay plain, byte for byte as before
  const weight = (v) =>
    v === null || v === undefined || contract.weightImportant !== true ? v : `${v}!important`
  // `displayImportant`: a template whose sheets set its display line `!important` somewhere holds it there
  // whatever the system says — JA Justitia's `h1, .h1 { font-size: 1.8rem !important }` up to 575.98px (its
  // slide title stayed 27px at 390 under all fifteen systems, the system's 33-34px written plainly), JA
  // Kinetic's article title `.hx-article .hx-article__title { font-size: 44px !important; line-height: 1.1
  // !important }` (44px under every system, 15/10/2026): the display line's size, line height and letter
  // spacing are written `!important` too, and the Vietnamese line height with them, so it still wins over
  // the display's own. Opted into per contract; utilitiesImportant already writes them so
  const displayDecl = (v) =>
    v === null || v === undefined || contract.displayImportant !== true || contract.utilitiesImportant
      ? v
      : `${v}!important`
  // every selector of a list takes the scope, also a string that is itself a comma list (a contract's
  // sideRules key): prefixed whole, only its first selector was scoped and the rest matched at the
  // template's own weight (19/10/2026). Commas inside :is(), :not() or [] are not list commas
  const scoped = (list) =>
    (Array.isArray(list) ? list : [list])
      .flatMap((x) => splitTop(String(x)))
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${HI} ${s}`)
      .join(',')
  // the display line is also a heading: one class heavier than the all-headings rule
  // (`.tracy :is(h1, …)` is (0,7,1), `.tracy-display` (0,7,0)), or a system's heading weight would
  // win over its display weight (Tracy Base under BMW: 400 over 300, 13/10/2026)
  const display = (list) =>
    (Array.isArray(list) ? list : [list])
      // top-level commas only: one inside :is() would cut a selector in two halves (19/10/2026)
      .flatMap((x) => splitTop(String(x)))
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `${HI} ${x}:not(.tracy-ds-display)`)
      .join(',')
  // the colour rules stop at a band the page keeps, where the template's own rule paints: inside one
  // keepRules resets --ds-c-* to initial, so var(--ds-c-accent) there is no colour at all. JA Mood
  // 1.0.1 (its primary-button rule names every link), 10/10/2026: under each system 10 of the 16
  // links in its kept bands lost their own colours (the topbar's white-at-60% on a white-at-5% fill
  // turned #999 on nothing); stopped at the edge, none did
  // a panel keeps the step off the page the template gave it: the template's own page colour
  const page = { page: base?.['--bg'] }
  const outside = outsideKept(contract, (_, band) => bandColours(tokens, band, page) !== null)
  // the display line's size: the contract's displaySize, else the element its display role names — a
  // system that states its display size (every OpenDesign one since 13/10/2026) wore it nowhere on a
  // contract without displaySize (JA Company: 36px under BMW's 60)
  const displaySize = sel.displaySize ?? contract.roles?.display ?? null
  const bands = bandRules(contract, tokens, HI, page)
  const wornKeys = [...Object.keys(bands.grounds), ...Object.keys(bands.media ?? {})]

  // A template that reads the 56 names (tracy-base) gets them; a JA template may define those short
  // names itself (JA Kinetic's --accent is its own): there the slot writes only --ds-c-*, as literals
  const generic = contract.genericTokens !== false
  const vars = generic
    ? { ...tokens, ...contract.runtime, ...colourVars(text, (n) => `var(--${n})`) }
    : {
        ...contract.runtime,
        ...colourVars(text, (n) => tokens[`--${n}`]),
        // faces and width for a template's own variables (templateVars): the system's faces where
        // it states them, else the template's own (its base); the width is always the template's
        // (tokens56 takes no container width from the system)
        '--ds-font-body': tokens['--font-body'],
        '--ds-font-display-face': tokens['--font-display'],
        '--ds-font-mono': tokens['--font-mono'],
        '--ds-container': tokens['--container-max']
      }
  // Bootstrap 5 / T4 paint links and primary through RGB triplets (rgba(var(--t4-link-color-rgb), a)):
  // the triplet of the colour each takes
  const triplet = (h) =>
    /^#[0-9a-f]{6}$/i.test(h ?? '')
      ? [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)).join(', ')
      : null
  for (const [k, role] of Object.entries(contract.runtimeRgb ?? {})) {
    const hex =
      role === 'accent-text'
        ? (text.colours['--ds-accent-text'] ?? tokens['--accent'])
        : role === 'accent-text-hover'
          ? (text.colours['--ds-accent-text-hover'] ?? tokens['--accent-hover'])
          : tokens[`--${role}`]
    const t = triplet(hex)
    if (t) vars[k] = t
  }
  // translucent text of the template's (alphaText): each name the contract lists is the worn role's
  // colour at the template's own opacity, as a literal (no relative colour syntax)
  const worn = colourVars(text, (n) => tokens[`--${n}`])
  for (const name of contract.alphaVars ?? []) {
    const m = /^([a-z0-9-]+?)-(\d{2})$/.exec(name)
    const t = m && triplet(worn[`--ds-c-${m[1]}`])
    if (t) vars[`--ds-a-${name}`] = `rgba(${t}, ${Number(m[2]) / 100})`
  }
  // every standard role variable the sheet does not write yet (role-values.mjs), as literals of this
  // side: a template that reads the roles finds a whole set, a template that does not reads none of
  // them; ink, its words and the accent on it always together, from the same ink, on every contract
  addWornRoles(vars, { tokens, text, palette: wornPalette }, sv, facesOf(profile))
  // an optional role the template does not read, left out where the module has no bytes to spare
  // (`omit`, as on EmDash): JA Impact two-mode sat 17 bytes under MODULE_MAX_BYTES before
  // --ds-c-surface-hover (20/10/2026). Only optional roles: a required one is always written
  for (const k of omittedRoles(contract)) delete vars[k]
  // the template's own variable family (JA Voyara's --voy-*), pointed at the tokens
  Object.assign(vars, contract.templateVars ?? {})
  for (const [k, v] of Object.entries(text.colours)) if (k.startsWith('--ds-')) vars[k] = v
  const brand = { ...contract.brandVars }
  for (const [k, from] of Object.entries(contract.brandFromSlot ?? {})) if (sv[from]) brand[k] = sv[from]
  for (const [k, from] of Object.entries(contract.landingFromSlot ?? {})) if (sv[from]) brand[k] = sv[from]
  const brandPhone = {}
  for (const [k, from] of Object.entries(contract.landingFromSlotPhone ?? {}))
    if (sv[from]) brandPhone[k] = sv[from]
  for (const [k, from] of Object.entries(contract.tokenFromSlot ?? {})) if (sv[from]) vars[k] = sv[from]
  if (sv['--ds-btn-pad-y']) vars['--tracy-capsule-pad'] = `${sv['--ds-btn-pad-y']} ${sv['--ds-btn-pad-x']}`
  // the system's button size stops at a form (OUTSIDE_FORMS), but a token sizes every button of the page at
  // once: inside a form each token of `formTokens` the slot set takes back the template's own value (Tracy
  // Base 1.0.4 under Moxie: the sign-in, search and contact buttons went from 44 to 34px beside 44px fields,
  // LAYOUT-3, 16/10/2026)
  const formTokens = Object.fromEntries(
    Object.entries(contract.formTokens ?? {}).filter(([k, v]) => k in vars && typeof v === 'string')
  )
  const bodyFont = tokens['--font-body'] !== base['--font-body'] ? 'var(--font-body)' : null
  // pictures drawn for one side of light (JA Mason's white logo and the dark striped disc behind each
  // section eyebrow, both made for its dark page): `sideRules.light` / `sideRules.dark` name the
  // declarations a picture takes when the worn page is on that side (a filter, an opacity), so a light
  // system does not leave a white logo on white. Selector → declarations, every value through safeValue
  const breakWords = (Array.isArray(contract.breakWords) ? contract.breakWords : []).filter(
    // a child combinator is a selector like any other ('>' cannot close the <style>; '<' stays out)
    (x) => typeof x === 'string' && x && !/[{};<\\]|\/\*/.test(x)
  )
  const pageHex = parseHex(tokens['--bg'])
  const side = pageHex ? (luminance(pageHex) < 0.3 ? 'dark' : 'light') : null
  // the template's own side of light, read off its released page colour
  const ownHex = parseHex(base?.['--bg'])
  const ownSide = ownHex ? (luminance(ownHex) < 0.3 ? 'dark' : 'light') : null
  const flipped = side !== null && ownSide !== null && side !== ownSide
  const ownFilters = Object.values(contract.sideRules?.[side] ?? {}).some((o) => o && 'filter' in o)
  // an icon the template draws as a closed picture in its brand colour (an SVG through <img> or a
  // background url: a worn system's variables never reach inside it, rule PIC-1) is drawn with a role
  // instead, under every system: `pictureRules` names, per selector, a mask of the same file painted
  // with a role colour (JA Kinetic's Integrations icons, JA Nova's pricing ticks), a gradient, or
  // `background-image: none` where the slot already paints the icon (JA Impact's focused search field)
  const pictureRules = Object.entries(contract.pictureRules ?? {})
    .filter(([s]) => typeof s === 'string' && s && !/[{};<\\]|\/\*/.test(s))
    .map(([s, o]) => {
      const d = pictureDecls(o ?? {})
      return d ? `${scoped(s)}{${d}}` : ''
    })
  const sideRules = side
    ? Object.entries(contract.sideRules?.[side] ?? {})
        // '>' kept: a child combinator was dropped here without a word (19/10/2026)
        .filter(([s]) => typeof s === 'string' && s && !/[{};<\\]|\/\*/.test(s))
        .map(([s, o]) => rule(scoped(s), o ?? {}))
    : []

  const css = [
    rule(contract.tokenScope, vars),
    contract.brandScope &&
      rule(
        `${HI} ${contract.brandScope}, html.t4-dark ${contract.brandScope}, html[data-theme="dark"] ${contract.brandScope}`,
        brand
      ),
    Object.keys(brandPhone).length && contract.brandScope
      ? `@media (max-width:639px){${rule(`${HI} ${contract.brandScope}`, brandPhone)}}`
      : '',
    sv['--ds-weight-button'] && sel.landingButton
      ? rule(scoped(sel.landingButton), { 'font-weight': `${sv['--ds-weight-button']}!important` })
      : '',
    contract.modes === true ? '' : `${sel.themeToggle}{display:none!important}`,
    // the side of light the worn page is on, which light-dark() reads (the auto palette's bands, a
    // system band): a dark system's page is dark however the visitor's own system is set
    `${HI}{color-scheme:${wornPalette.dark === true ? 'dark' : 'light'}}`,
    ...keepRules(contract, HI),
    // every colour of the template's own stylesheets, mapped to the system by role (auto-palette.mjs);
    // before the contract's named rules, which win where they state something
    autoPaletteCss(contract.autoPalette, {
      dark: wornPalette.dark === true,
      hi: HI,
      // inside a band's fill too (bands.mjs): its words are the band's, the blocks in it are the page's
      outside: outsideKept({ ...contract, bands: {} }),
      keep: (contract.paletteKeep ?? []).map((/** @type {any} */ k) => k?.selector),
      // the bands the contract still paints itself: its fills, and the bands it keeps
      bands: Object.entries(contract.bands ?? {})
        .filter(([k, b]) => b?.fill === true || (contract.keepScopes ?? []).includes(k))
        .map(([k]) => k),
      known: Object.keys({ ...(generic ? tokens : {}), ...contract.runtime, ...contract.templateVars })
    }),
    // the bands the template paints on its own wear the system's ground (bands.mjs)
    ...bands.rules,
    // a ground the template paints as a picture of its own palette (JA Gamex: a light gradient image
    // behind the whole page, light gradient cards): a worn system is one look, so the picture gives
    // way and the fill under it — the system's page, through the tokenized stylesheets — shows.
    // Under a dark system the picture stayed light while the text on it turned light (11/10/2026)
    sel.groundPicture ? rule(scoped(outside(sel.groundPicture)), { 'background-image': 'none' }) : '',
    // images drawn in the template's dark ink for its light page (JA Gamex's wordmark, its client
    // logos): on a dark system's page they are shown inverted with their hues kept — the slot cannot
    // repaint an image, and left alone a dark wordmark all but vanished on Moxie's black (11/10/2026)
    wornPalette.dark && sel.inkImages
      ? rule(scoped(outside(sel.inkImages)), { filter: 'invert(1) hue-rotate(180deg)' })
      : '',
    rule(scoped(sel.headingsAll), {
      'font-weight': weight(sv['--ds-weight-headings'] ?? sv['--ds-weight-heading']),
      'font-family': sv['--ds-font-headings'] ?? sv['--ds-font-display'],
      // lines of even length in the system's face, as on WordPress (13/10/2026). The longhand only: the
      // `text-wrap` shorthand also sets text-wrap-mode, and undid a heading's own `white-space: nowrap`
      // (GK Compact's one-line ghost marquee broke into a clipped wall of words, 13/10/2026)
      'text-wrap-style': (sv['--ds-font-headings'] ?? sv['--ds-font-display']) ? 'balance' : null
    }),
    // a headline-only face is the section headings' (--ds-font-headings took the rest)
    sv['--ds-font-headings'] && sel.heading
      ? rule(scoped(sel.heading), {
          'font-family': sv['--ds-font-display'],
          'font-weight': weight(sv['--ds-weight-heading'])
        })
      : '',
    rule(display(sel.display), {
      'font-weight': weight(sv['--ds-weight-display']),
      'font-family': sv['--ds-font-display']
    }),
    rule(scoped(sel.body), { 'font-weight': weight(sv['--ds-weight-body']), 'font-family': bodyFont }),
    // a paragraph the template weights by class (`.lead`, `.mb-3`) does not inherit the body's weight:
    // the system's body weight reaches the page's paragraphs and list items too (JA Diner's p.lead,
    // JA Gamex under Stripe's 300, 13/10/2026)
    sv['--ds-weight-body'] && sel.body
      ? rule(scoped([sel.body].flat().map((x) => `${x} :is(p, li):not([class*=btn], [class*=button])`)), {
          'font-weight': weight(sv['--ds-weight-body'])
        })
      : '',
    // a template that names its display, headings, buttons, cards and container (the JA family) takes
    // the system's sizes and shapes there too — tracy-base's landing reads them through --brand-*
    // lines of even length: a worn size wraps where the template's did not (13/10/2026)
    sel.heading
      ? shape(scoped(outsideOf(sel.heading, ITEM)), {
          'font-size': sv['--ds-size-heading'],
          'text-wrap-style': sv['--ds-size-heading'] ? 'balance' : null
        })
      : '',
    sel.heading && sv['--ds-size-heading-phone']
      ? `@media (max-width:639px){${shape(scoped(outsideOf(sel.heading, ITEM)), { 'font-size': sv['--ds-size-heading-phone'] })}}`
      : '',
    // the display after the headings: a display that is also an h2 takes the display size
    displaySize
      ? shape(scoped(displaySize), {
          'font-size': displayDecl(sv['--ds-size-display']),
          'line-height': displayDecl(sv['--ds-leading-display']),
          'letter-spacing': displayDecl(sv['--ds-tracking-display']),
          'text-wrap-style': sv['--ds-size-display'] ? 'balance' : null
        })
      : '',
    displaySize && sv['--ds-size-display-phone']
      ? `@media (max-width:639px){${shape(scoped(displaySize), { 'font-size': displayDecl(sv['--ds-size-display-phone']) })}}`
      : '',
    displaySize && Number(sv['--ds-leading-display']) < STACKED_MARKS_LEADING
      ? shape(onVietnamese(scoped(displaySize)), {
          'line-height': displayDecl(String(STACKED_MARKS_LEADING))
        })
      : '',
    // the system's corner on the buttons, but not on a button joined to the field before it (a search
    // bar's input + button, a subscribe field + button): the field keeps the template's corner (form
    // metrics stay the template's), and a pill hung on a square field read as two controls glued
    // together (Tracy Business Joomla's search bar and disclosure alerts under Moxie, 15/10/2026)
    sel.button
      ? shape(scoped(notJoined(notToggle(sel.button))), {
          'border-radius': buttonRadius(sv['--ds-btn-radius'])
        })
      : '',
    // icon buttons (a header's search or menu toggle) take the system's corner only: their size,
    // fill and colour stay the template's
    sel.iconButton ? shape(scoped(sel.iconButton), { 'border-radius': sv['--ds-btn-radius'] }) : '',
    // the box metrics stop at a form: a field and its button keep the template's sizes (OUTSIDE_FORMS)
    sel.button
      ? shape(scoped(outsideForms(notToggle(sel.button))), {
          'font-weight': sv['--ds-weight-button']
        })
      : '',
    // the system's button size, except in the page's header: a header lays its logo, call to action and
    // menu toggle out on one row sized for the template's own button, and the system's roomier one pushed
    // them onto two rows on a phone (Guru Pro's "Buy Guru", 13/10/2026). There it keeps its colours and
    // shape, and its size
    sel.button
      ? shape(scoped(outsideForms(notToggle(notInHeader(sel.button)))), {
          'padding-top': sv['--ds-btn-pad-y'],
          'padding-bottom': sv['--ds-btn-pad-y'],
          'padding-left': sv['--ds-btn-pad-x'],
          'padding-right': sv['--ds-btn-pad-x'],
          'line-height': sv['--ds-btn-leading'],
          // the system's padding inside the button's own width: a full-width button or a fixed box never grows past
          // its container (JA Restaurant's subscribe box ran 25px past a phone's edge, 14/10/2026)
          'box-sizing': sv['--ds-btn-pad-x'] || sv['--ds-btn-pad-y'] ? 'border-box' : null,
          // a label longer than its box wraps inside it: Bootstrap 3's .btn is nowrap, so a customer's 40-character
          // label (the door takes 44) ran out of JA Donate's box and past a phone's edge (modify ladder, 14/10/2026);
          // a label that fits stays on its one line
          'white-space': 'normal'
        })
      : '',
    // `buttonTextImportant`: a template that sets its buttons' text `!important` (JA Rights:
    // `.btn.btn-secondary{color:#fff!important}`, white on its yellow) keeps that white on any accent
    // unless the accent's own text is `!important` too — opted into per contract, the fill stays plain
    sel.buttonPrimary
      ? rule(scoped(outside(notToggle(sel.buttonPrimary))), {
          'background-color': 'var(--ds-c-accent)',
          // a template's gradient button (GK Restly's orange-to-pink "Watch Showreel") paints its picture
          // over any fill: the system's button is its flat accent
          'background-image': 'none',
          'border-color': 'var(--ds-c-accent)',
          color: `var(--ds-c-accent-on)${contract.buttonTextImportant === true ? '!important' : ''}`
        })
      : '',
    // the calls to action inside a kept band: the band stays, its buttons wear the system
    ...keptButtonRules(contract, tokens, HI, bands.grounds, sel.buttonPrimary, bands.media),
    // a menu toggle inside a worn band takes the band's button pair, which reaches its words (color) but not its
    // bars (background): JA Fit's and JA Donate's white bars sat on the pair's white fill under nine systems
    // (review v8, 15/10/2026). The bars take the toggle's own words, in a band that is one only at some widths too
    // (JA Stark's phone header in the accent: white bars on Moxie's light accent); currentColor is the toggle's own
    // words at every width, so no media query is needed
    wornKeys.length
      ? rule(
          [
            `${HI} :is(${wornKeys.join(', ')}) :is(${TOGGLES}) :is(${TOGGLE_BARS})`,
            ...['::before', '::after'].map(
              (p) => `${HI} :is(${wornKeys.join(', ')}) :is(${TOGGLES}) .toggle-bars${p}`
            )
          ].join(','),
          { 'background-color': 'currentColor' }
        )
      : '',
    sel.card ? shape(scoped(sel.card), { 'border-radius': sv['--ds-card-radius'] }) : '',
    ...layoutRules(profile, tokens, sel, scoped, rule, sv),
    // the system's type and components beyond its tokens, read off its reference page
    // the display line's face, weight and case reach the same element its size does (JA Vital's hero
    // title is an h2 its display role names: BMW's 300 never reached it, 13/10/2026)
    // the button's type (size, case, tracking) as its padding: not in the header, where a system's capitals and
    // tracking widened JA Educatsy's "Join for free" off its row (MotherDuck, Pitch, 14/10/2026); not on toggles
    ...componentRules({ ...sel, displaySize }, sv, scoped, rule, outside, (l) => notToggle(notInHeader(l))),
    // the featured plan keeps its accent edge, after the card rule it outranks (featuredCardRules)
    ...featuredCardRules(
      sel,
      sv,
      { accent: tokens['--accent'], accentText: text.colours['--ds-accent-text'], page: tokens['--bg'] },
      scoped,
      rule,
      outside
    ),
    // parts the template paints from CSS the slot cannot tokenize — T4 writes its palette patterns
    // (.t4-palette-light…) and theme CSS into media/t4/css/ from the style's colours, again on every
    // request whose colours changed — named by the contract with the role each property takes
    // (followRules: { selector: { property: role } }); stopped at kept bands like every colour rule
    ...followRules(contract).map(([selector, decls]) => rule(scoped(outside(selector)), decls)),
    // text the template paints with a literal the tokenizer cannot read as a role — a translucent
    // black on its light page (JA Landscape's menu: rgba(0, 0, 0, .7), black on a dark system's page)
    sel.pageText ? rule(scoped(outside(sel.pageText)), { color: 'var(--ds-c-fg)' }) : '',
    // a band filled with the accent (Bootstrap's .bg-primary, which T4 points at the accent) and the
    // text set on it: the accent's own text colour, so a light system accent never sits under white
    // (JA Landscape's intro band, 11/10/2026: white on Moxie's light blue, 2.26:1)
    sel.onAccent
      ? rule(scoped(outside(sel.onAccent.flatMap((x) => [x, `${x} :not(.btn):not(.btn *)`]))), {
          color: 'var(--ds-c-accent-on)'
        })
      : '',
    // colours the demo CONTENT writes inline (an ACM module's heading with style="color:#403d75"),
    // which no stylesheet rule outranks: each palette colour the contract names takes its role,
    // !important being the only way past an inline style (JA Kidscorner, 11/10/2026: its indigo
    // section titles stayed indigo on Moxie's black)
    ...Object.entries(contract.inlineColours ?? {})
      .filter(([hex, role]) => /^#[0-9a-f]{3,8}$/i.test(hex) && /^[a-z0-9-]+$/.test(role))
      .map(([hex, role]) => {
        const forms = [';', '; ', ''].flatMap((lead) =>
          ['color:', 'color: '].map((c) =>
            lead === '' ? `[style^="${c}${hex}" i]` : `[style*="${lead}${c}${hex}" i]`
          )
        )
        return rule(scoped(outside(forms)), { color: `var(--ds-c-${role})!important` })
      }),
    // accent the template uses as TEXT (the landing's kicker reads --brand-color-primary, the fill)
    // paletteBands: T4 paints its palette sections (.t4-palette-<name>) from a stylesheet it
    // generates out of the template's palette settings (media/t4/css/<style>.css) — literal colours
    // no release can tokenize, so such a band stayed the template's while the text in it followed
    // (JA Eventcamp's light speaker band, 11/10/2026). A band named here takes the worn fill of its
    // role and the text that reads on it: body and headings the text colour, links the accent made
    // readable; a band in the accent role (JA Colab's .bg-primary band) takes the accent and its own
    // text colour throughout. Bands the page keeps (keepScopes) stay out.
    // `ink`: a band the template draws in its own dark brand colour as a contrast to its light page (JA
    // Resort's dark-green intro and rooms bands) takes the worn text colour as its ground and the worn
    // page colour as every text on it — dark under a light system, light under a dark one, so the band
    // stays a band and its text reads at the system's own text contrast
    ...Object.entries(contract.paletteBands ?? {})
      .filter(
        ([s, role]) =>
          /^[.#][\w-]+$/.test(s) && ['bg', 'surface', 'surface-warm', 'accent', 'ink'].includes(role)
      )
      .flatMap(([s, role]) => {
        const whole = role === 'accent' || role === 'ink'
        // an ink band is the system's band (auto-palette.mjs roleValues): its text colour as the ground
        // and its page as the text under a light system; a raised surface and its text under a dark one.
        // The fill was the system's secondary TEXT colour on both sides: under Moxie (black page) JA
        // Resort's rooms band turned a glaring khaki block with black text (14/10/2026)
        const band = roleValues()
        const on =
          role === 'accent' ? 'var(--ds-c-accent-on)' : role === 'ink' ? band['on-band'] : 'var(--ds-c-fg)'
        const fill = role === 'ink' ? band.band : `var(--ds-c-${role})`
        return [
          rule(scoped(outside([s])), { 'background-color': fill, color: on }),
          rule(scoped(outside([`${s} :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6)`])), {
            color: on
          }),
          rule(scoped(outside([`${s} a:not(.btn)`])), {
            color: whole ? on : 'var(--ds-accent-text, var(--ds-c-fg))'
          }),
          // on an accent (or ink) band every text but a button's reads the band's own text colour (JA
          // Colab's band headings are divs painted white by their own rules)
          whole
            ? rule(scoped(outside([`${s} :is(p, div, span, li, small, strong, em):not(.btn, .btn *)`])), {
                color: on
              })
            : ''
        ]
      }),
    // accentTextImportant: the template paints that text with !important (T4's generated palette
    // stylesheet, media/t4/css/<style>.css: JA Educatsy's active menu item), which no rule outranks
    // without it
    text.colours['--ds-accent-text'] && sel.accentText
      ? rule(scoped(outside(sel.accentText)), {
          color: `var(--ds-accent-text)${contract.accentTextImportant ? '!important' : ''}`
        })
      : '',
    // text a template sets on an accent fill from a rule of its own (JA Teline V's white category
    // titles on its red, which is its accent): the fill follows the system, so the text takes the
    // accent's own text colour, readable on it by the gate
    sel.onAccent ? rule(scoped(outside(sel.onAccent)), { color: 'var(--ds-c-accent-on)' }) : '',
    rule(scoped(outside(FRAMEWORK_SURFACE)), {
      'background-color': 'var(--ds-c-surface)',
      color: 'var(--ds-c-fg)',
      'border-color': 'var(--ds-c-border)'
    }),
    rule(scoped(outside(FRAMEWORK_ACTIVE)), {
      'background-color': 'var(--ds-c-accent)',
      color: 'var(--ds-c-accent-on)',
      'border-color': 'var(--ds-c-accent)'
    }),
    rule(scoped(outside(FRAMEWORK_WORDS)), { color: 'var(--ds-c-fg)' }),
    rule(scoped(outside(FRAMEWORK_PANELS)), {
      'background-color': 'var(--ds-c-bg)',
      color: 'var(--ds-c-fg)'
    }),
    rule(scoped(outside([...PANEL_HEADERS, ...PANEL_CLOSES])), {
      'background-color': 'var(--ds-c-bg)',
      color: 'var(--ds-c-fg)'
    }),
    rule(scoped(outside(PANEL_CHEVRONS)), { color: 'var(--ds-c-fg)' }),
    rule(scoped(outside(FRAMEWORK_GROUNDS)), { 'background-color': 'var(--ds-c-surface)!important' }),
    rule(scoped(outside(FRAMEWORK_RAISED)), { 'background-color': 'var(--ds-c-surface-warm)!important' }),
    rule(scoped(outside(FRAMEWORK_INKS)), { color: 'var(--ds-c-fg)!important' }),
    rule(scoped(outside(outsideOf(FRAMEWORK_INKS_OFF_FILL, ON_A_FILL))), {
      color: 'var(--ds-c-fg)!important'
    }),
    rule(scoped(outside(FRAMEWORK_MUTED)), { color: 'var(--ds-c-muted)!important' }),
    // a one-tone logo made for the template's side of light (JA Fit's white one for its dark page, JA Good's dark
    // one for its light page) vanished when the worn page is on the other side and the header follows the page
    // (14/10/2026): there it is shown inverted, its hues kept. Not in a band the page keeps (its ground stays),
    // and not where the contract already filters pictures on this side (its inkImages under a dark system, its
    // sideRules: JA Mason inverts its own logo — twice inverted it would be white on white again)
    flipped && !(side === 'dark' && sel.inkImages) && !ownFilters
      ? rule(scoped(outside(outsideOf(LOGOS, SIDE_LOGO[side]))), { filter: 'invert(1) hue-rotate(180deg)' })
      : '',
    // text a wider system face makes wider than its box — a heading word longer than a phone's line (GK
    // Archi's display "environmentally" in MotherDuck's monospace: the page scrolled 18px sideways at
    // 390px), a flex item sized by its longest line (GK Compact's third pricing column, 26px past a
    // 1440px page in IBM Plex, its plan title set nowrap) — wraps inside its box instead: lines wrap,
    // words break, a flex item may shrink below its content. Opt-in per contract (`breakWords`): no
    // contract's bytes change without it
    breakWords.length
      ? rule(scoped(breakWords), { 'white-space': 'normal', 'overflow-wrap': 'break-word', 'min-width': '0' })
      : '',
    Object.keys(formTokens).length ? rule(scoped('form'), formTokens) : '',
    ...sideRules,
    ...pictureRules
  ]
    .filter(Boolean)
    .join('\n')
  return { css, adjusted: text.adjusted }
}
