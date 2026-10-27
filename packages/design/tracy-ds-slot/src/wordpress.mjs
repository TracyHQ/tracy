/**
 * Profile → one WordPress theme.json style variation the `tracy` / `tracy-base` themes wear through
 * their own `tracy_apply_inspiration()` (the door Claude Cowork's `theme.style` calls with a
 * `variation`). PURE: fonts are resolved by the caller (`googleFontFaces`, I/O) and passed in.
 *
 * Why a variation and not a stylesheet: it is WordPress's own slot. The variation's palette, fonts,
 * sizes and `custom` values become the `--wp--preset--*` / `--wp--custom--*` variables every theme
 * stylesheet already reads; `styles.elements` restyles buttons and headings; and its `styles.css`
 * REPLACES the theme's (measured 09/10/2026 on WordPress 7.1.2: the theme's dark set is gone), so a
 * worn system is one look. No theme file changes, so every running tracy-base site can wear one.
 *
 * Everything the profile leaves empty keeps the template's own value: the 56 tokens start from the
 * template's base system (`contract.baseSystem`), and a CSS rule is only written for a field that is
 * set.
 */
import { variationOf } from '@tracy/wordpress-theme/variation'
import {
  onVietnamese,
  safeDeclaration,
  safeValue,
  slotVars,
  STACKED_MARKS_LEADING,
  templateSizes
} from './emit.mjs'
import {
  colourVars,
  componentRules,
  featuredCardRules,
  keepRules,
  ITEM,
  keptButtonRules,
  keptScopes,
  outsideOf,
  layoutRules,
  outsideForms,
  outsideKept,
  tokens56
} from './tokens56.mjs'
import { followRules, nestNots } from './joomla.mjs'
import { autoPaletteCss, splitTop } from './auto-palette.mjs'
import { bandColours, bandRules } from './bands.mjs'
import { gate } from './normalise.mjs'
import { inlineFaceRules } from './inline-faces.mjs'
import { addWornRoles, facesOf } from './role-values.mjs'
import { twoSides } from './sides.mjs'

/** The variation's id on the site: `ds-<source>-<key>`, inside the theme's `^[a-z0-9-]+$`. */
export function variationSlug(profileId) {
  const [source, key] = profileId.split(':')
  return `ds-${source}-${key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 24)}`.replace(/-+$/, '')
}

const firstFamily = (stack) =>
  String(stack ?? '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')

/**
 * @param {object} profile          a `tracy-ds-profile/v1`
 * @param {Record<string,string>} base  the template's 56 tokens (its base system's tokens.css)
 * @param {{ selectors: Record<string, any> }} contract  `templates/wordpress-*.json`
 * @param {{ fontFaces?: { fontFamily: string, fontWeight: string, fontStyle: string, src: string[], unicodeRange?: string }[] }} [opts]
 * @returns {{ slug: string, name: string, variation: object, css: string, adjusted: string[] } | { refused: string[] }}
 */
export function wordpressVariation(profile, base, contract, opts = {}) {
  const g = gate(profile)
  if (!g.ok) return { refused: g.reasons }
  const { tokens, text } = tokens56(profile, base)
  const t = text.colours
  const sv = slotVars(profile, templateSizes(contract))

  const slug = variationSlug(profile.id)
  const name =
    String(profile.name)
      .replace(/[^\p{L}\p{N} .,:'&+_-]/gu, '')
      .slice(0, 80) || slug
  const v = variationOf(tokens, { id: slug, name })
  // the layout metrics stay the theme's, as the template's containers do (layoutRules): the variation
  // sets no content size, no container width or gutters, no spacing scale and no section rhythm. Written from the 56
  // tokens they came from the base system, not the theme: under a silent system the content size stood
  // at the token's 1024px while the containers kept the theme's 1240px, so the header and footer, which
  // read it, stood narrower than every section (Spotify, 14/10/2026); the base's 22px gutter moved JA
  // Kinetic's header and footer 10px off its 32px-gutter sections under every system (15/10/2026)
  delete v.settings.layout
  delete v.settings.spacing
  if (v.settings.custom) {
    delete v.settings.custom.container
    // nor the section rhythm: the base's 100px against JA Kinetic's 80px (15/10/2026)
    delete v.settings.custom.sectionY
  }

  // fonts the page must load: each Google face hangs on the family that names it
  const faces = (opts.fontFaces ?? []).filter(
    (f) => safeValue(f.fontFamily) && f.src.every((u) => u.startsWith('https://fonts.gstatic.com/'))
  )
  if (faces.length)
    for (const fam of v.settings.typography.fontFamilies) {
      const own = faces.filter((f) => f.fontFamily === firstFamily(fam.fontFamily))
      if (own.length) fam.fontFace = own.map((f) => ({ ...f, fontDisplay: 'swap' }))
    }
  v.settings.custom.ds = { profile: profile.id }

  // ── WordPress's own element styles: buttons and headings ──
  const elements = {}
  const button = {}
  if (sv['--ds-btn-radius']) button.border = { radius: sv['--ds-btn-radius'] }
  if (sv['--ds-weight-button']) button.typography = { fontWeight: String(sv['--ds-weight-button']) }
  if (sv['--ds-btn-pad-y'])
    button.spacing = {
      padding: {
        top: sv['--ds-btn-pad-y'],
        bottom: sv['--ds-btn-pad-y'],
        left: sv['--ds-btn-pad-x'],
        right: sv['--ds-btn-pad-x']
      }
    }
  if (Object.keys(button).length) elements.button = button
  if (sv['--ds-weight-heading'])
    elements.heading = { typography: { fontWeight: String(sv['--ds-weight-heading']) } }
  // WordPress paints links from the accent preset (a fill colour): they take the readable accent
  if (t['--ds-accent-text'] || t['--ds-accent-text-hover'])
    elements.link = {
      ...(t['--ds-accent-text'] && { color: { text: t['--ds-accent-text'] } }),
      ...(t['--ds-accent-text-hover'] && { ':hover': { color: { text: t['--ds-accent-text-hover'] } } })
    }
  const styles = {}
  if (Object.keys(elements).length) styles.elements = elements
  if (sv['--ds-weight-body']) styles.typography = { fontWeight: String(sv['--ds-weight-body']) }

  // ── styles.css: replaces the theme's, so it also carries the one-look rules, or both modes ──
  // Written as Joomla's module is (joomla.mjs): the rules both sides write alike once (side-merge.mjs), and
  // each band guard once a rule instead of once a selector (nestNots). The same rules reach the same
  // elements at the same specificity in the same order; the sheet is what every page of a site carries,
  // and written whole JA Impact's was 543 KB under Moxie (19/10/2026)
  // `css` is that sheet readable: each side whole, every guard on its selector (what the tests read)
  const head = `/* tracy-ds-slot: ${profile.id.replace(/[^a-z0-9:-]/gi, '')} */`
  let adjusted = text.adjusted
  let mode
  let css
  if (contract.modes === true) {
    // a template with a light/dark switch (sides.mjs): both modes, the switch kept
    const two = twoSides(profile, (x) => wordpressSheet(x, base, contract), contract, { shared: true })
    css = `${head}\n${two.css}`
    styles.css = `${head}\n${nestNots(/** @type {string} */ (two.shared))}`
    adjusted = [...two.own.adjusted, ...two.derived.adjusted.map((a) => `derived:${a}`)]
    mode = two.mode
  } else {
    const one = wordpressSheet(profile, base, contract).css
    css = `${head}\n${one}`
    styles.css = `${head}\n${nestNots(one)}`
  }
  v.styles = styles
  return { slug, name, variation: v, css, adjusted, ...(mode && { mode }) }
}

/**
 * The styles.css rules for one profile, without the header line. A one-look contract hides the
 * template's switch; a two-mode one (`modes`) leaves it and also writes what WordPress prints from
 * the variation for the system's own side only: the colour presets and the link colours.
 * @returns {{ css: string, adjusted: string[] }}
 */
function wordpressSheet(profile, base, contract) {
  const { tokens, text, palette: p } = tokens56(profile, base)
  const t = text.colours
  const sv = slotVars(profile, templateSizes(contract))
  const sel = contract.selectors
  const two = contract.modes === true
  const rule = (selector, decls) => {
    const body = Object.entries(decls)
      // safeDeclaration: safeValue, or a contract's inline SVG mask (PIC-1)
      .filter(([k, x]) => x !== null && x !== undefined && safeDeclaration(k, String(x)))
      .map(([k, x]) => `${k}:${x}`)
      .join(';')
    return body ? `${selector}{${body}}` : ''
  }
  // :root×6 = (0,6,0): above every theme rule (deepest measured (0,5,1)), below a block's own inline
  // style — a system's stated value beats the template's contextual one, an editor's per-block choice
  // still beats the system. No !important, which would beat that inline style too.
  const HI = ':root:root:root:root:root:root'
  // every selector of a list takes the scope, also a string that is itself a comma list (a contract's
  // `h1.hero-title, .tracy-display`): prefixed whole, only its first selector was scoped and the rest
  // matched at the template's own weight (19/10/2026, as Joomla). Commas inside :is(), :not() or [] stay
  const scoped = (list) =>
    (Array.isArray(list) ? list : [list])
      .flatMap((x) => splitTop(String(x)))
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${HI} ${s}`)
      .join(',')
  // a picture that is really there: not hidden, and an <img> with a non-empty src
  const shown = (list) =>
    (Array.isArray(list) ? list : [list]).map((s) => `${s}:not([hidden]):not([src=""]):not(img:not([src]))`)
  // the display line is also a heading: one class heavier than the all-headings rule
  // (`.tracy :is(h1, …)` is (0,7,1), `.tracy-display` (0,7,0)), or a system's heading weight would
  // win over its display weight (Tracy Base under BMW: 400 over 300, 13/10/2026)
  const display = (list) =>
    (Array.isArray(list) ? list : [list])
      // top-level commas only: one inside :is() would cut a selector in two (19/10/2026)
      .flatMap((x) => splitTop(String(x)))
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `${HI} ${x}:not(.tracy-ds-display)`)
      .join(',')
  // a panel keeps the step off the page the template gave it: the template's own page colour
  const page = { page: base?.['--bg'] }
  const outside = outsideKept(contract, (_, band) => bandColours(tokens, band, page) !== null)
  const dark = p.dark
  // the colours a tokenized template stylesheet reads, and the theme's own variable family
  const own = {
    ...colourVars(text, (n) => `var(--wp--preset--color--${n})`),
    // the system's button corner as a variable too: a reader (the preview's button-role check) compares
    // the template's own buttons with the system's corner (15/10/2026). Not on Joomla, whose module
    // stays under its 64 KB column; there the check reads the corner of the accent-filled buttons
    ...(sv['--ds-btn-radius'] ? { '--ds-btn-radius': sv['--ds-btn-radius'] } : {}),
    ...contract.templateVars
  }
  // every standard role variable the sheet does not write yet (role-values.mjs), as literals of this
  // side; ink, its words and the accent on it always together, from the same ink, on every contract
  addWornRoles(own, { tokens, text, palette: p }, sv, facesOf(profile))
  // the bands the template paints on its own wear the system's ground (bands.mjs)
  const bands = bandRules(contract, tokens, HI, page)
  // each side's presets and link colours: WordPress prints the variation's (the system's own side) on
  // :root and :root :where(a), which the other side overrides. The presets are written at HI, above a
  // template that pins its own presets on the html element for some pages (JA Kinetic's Blueprint and
  // Signal homes: html[data-style="blueprint"] { --wp--preset--color--bg: … }, 0,1,1 against :root's
  // 0,1,0, so both pages kept their own indigo and teal under every system, 15/10/2026). Only rules on
  // the html element compete: a band that sets presets on its own element still wins inside it
  const presets = two
    ? Object.fromEntries(
        (variationOf(tokens, { id: 'side', name: 'side' }).settings.color?.palette ?? []).map((c) => [
          `--wp--preset--color--${wpKebab(c.slug)}`,
          c.color
        ])
      )
    : {}
  const css = [
    two ? rule(HI, presets) : '',
    // every side writes its own link colours, the accent where it reads as text: a side whose accent needed no
    // move wrote none, and its links kept the colour WordPress prints for the other side (Tracy Base under
    // Mailchimp: the light side's #7f6f18 on the derived dark page, 3.3:1, 14/10/2026)
    two
      ? rule(':root :where(a:where(:not(.wp-element-button)))', {
          color: t['--ds-accent-text'] ?? tokens['--accent']
        })
      : '',
    two
      ? rule(':root :where(a:where(:not(.wp-element-button)):hover)', {
          color:
            t['--ds-accent-text-hover'] ??
            tokens['--accent-hover'] ??
            t['--ds-accent-text'] ??
            tokens['--accent']
        })
      : '',
    rule(HI, own),
    // the side of light the worn page is on, above the theme's own :root{color-scheme: light dark}: a
    // plain html rule lost to it, so a visitor whose system is light saw a dark system's light-dark()
    // presets on their light arm (JA Nova under Moxie: a cream page, 14/10/2026)
    // (a two-mode contract keeps the html form: twoSides scopes it to each side of the switch)
    `${two ? 'html' : HI}{color-scheme:${dark ? 'dark' : 'light'}}`,
    two ? '' : `${sel.themeToggle}{display:none!important}`,
    ...keepRules(contract, HI),
    // every colour of the template's own stylesheets, mapped to the system by role (auto-palette.mjs)
    autoPaletteCss(contract.autoPalette, {
      dark: dark === true,
      hi: HI,
      // inside a band's fill too (bands.mjs): its words are the band's, the blocks in it are the page's
      outside: outsideKept({ ...contract, bands: {} }),
      keep: (contract.paletteKeep ?? []).map((/** @type {any} */ k) => k?.selector),
      // the bands the contract still paints itself: its fills, and the bands it keeps
      bands: Object.entries(contract.bands ?? {})
        .filter(([k, b]) => b?.fill === true || (contract.keepScopes ?? []).includes(k))
        .map(([k]) => k),
      known: Object.keys(own)
    }),
    // a kept band is the template's released look, which its page computes in the light scheme: under a
    // dark system (html color-scheme dark) a theme rule written light-dark(<light>, <dark>) inside it took
    // its dark arm (JA Impact's footer bar text #ced4da → #fff, re-measured 11/10/2026)
    dark && keptScopes(contract).length ? `${scoped(keptScopes(contract))}{color-scheme:light}` : '',
    ...bands.rules,
    // a logo picture is shown on its side only when there is one: the theme prints
    // <img hidden class="tracy-logo-dark" src=""> when no dark logo was uploaded, and forcing that
    // visible drew a broken image beside the brand mark (Tracy Business WordPress previews, and since
    // #1315 every OS in dark mode, sides.mjs copying the dark side into the no-data-theme block)
    `${scoped(dark ? sel.logoLight : shown(sel.logoLight))}{display:${dark ? 'none' : 'block'}!important}`,
    `${scoped(dark ? shown(sel.logoDark) : sel.logoDark)}{display:${dark ? 'block' : 'none'}!important}`,
    rule(scoped(sel.headingsAll), {
      'font-weight': sv['--ds-weight-headings'] ?? sv['--ds-weight-heading'],
      'font-family': sv['--ds-font-headings'] ?? sv['--ds-font-display'],
      // every heading in the system's face wraps to lines of even length: a face wider than the
      // template's left one word alone on the last line (JA Morgan's "Check Out All The / Pages", an h3
      // styled .h2 that the section-heading role does not name, 13/10/2026). The longhand only: the
      // `text-wrap` shorthand also sets text-wrap-mode and undid a heading's own `white-space: nowrap`
      'text-wrap-style': (sv['--ds-font-headings'] ?? sv['--ds-font-display']) ? 'balance' : null
    }),
    // a card's or a listed post's title keeps the template's size (ITEM, as on Joomla)
    rule(scoped(outsideOf(sel.heading, ITEM)), {
      'font-size': sv['--ds-size-heading'],
      // lines of even length: a worn size wraps where the template's did not, and left "faster" or
      // "next-" alone on the last line (13/10/2026)
      'text-wrap-style': sv['--ds-size-heading'] ? 'balance' : null,
      // a headline-only face is the section headings' (--ds-font-headings took the rest)
      'font-family': sv['--ds-font-headings'] ? sv['--ds-font-display'] : null,
      'font-weight': sv['--ds-font-headings'] ? sv['--ds-weight-heading'] : null
    }),
    sv['--ds-size-heading-phone']
      ? `@media (max-width:639px){${rule(scoped(outsideOf(sel.heading, ITEM)), { 'font-size': sv['--ds-size-heading-phone'] })}}`
      : '',
    // the type the page content writes inline in the template's faces by name (inline-faces.mjs)
    ...inlineFaceRules(contract.inlineFaces, profile, tokens, sv, scoped, rule),
    rule(scoped(sel.button), { 'border-radius': sv['--ds-btn-radius'] }),
    // the box metrics stop at a form: a field and its button keep the template's sizes (OUTSIDE_FORMS)
    outsideForms(sel.button).length
      ? rule(scoped(outsideForms(sel.button)), {
          'font-weight': sv['--ds-weight-button'],
          'padding-top': sv['--ds-btn-pad-y'],
          'padding-bottom': sv['--ds-btn-pad-y'],
          'padding-left': sv['--ds-btn-pad-x'],
          'padding-right': sv['--ds-btn-pad-x'],
          'line-height': sv['--ds-btn-leading']
        })
      : '',
    rule(scoped(sel.body), { 'font-weight': sv['--ds-weight-body'] }),
    rule(display(sel.display), {
      'font-family': sv['--ds-font-display'],
      'font-weight': sv['--ds-weight-display'],
      'font-size': sv['--ds-size-display'],
      'line-height': sv['--ds-leading-display'],
      'letter-spacing': sv['--ds-tracking-display'],
      'text-wrap-style': sv['--ds-size-display'] ? 'balance' : null
    }),
    sv['--ds-size-display-phone']
      ? `@media (max-width:639px){${rule(display(sel.display), { 'font-size': sv['--ds-size-display-phone'] })}}`
      : '',
    Number(sv['--ds-leading-display']) < STACKED_MARKS_LEADING
      ? rule(onVietnamese(display(sel.display)), { 'line-height': String(STACKED_MARKS_LEADING) })
      : '',
    rule(scoped(sel.card), { 'border-radius': sv['--ds-card-radius'] }),
    // a template whose primary button paints its own literal text (the JA themes) takes the accent's;
    // the colour rules stop at a kept band, where the template's own rule paints (outsideKept)
    sel.buttonPrimary
      ? rule(scoped(outside(sel.buttonPrimary)), {
          'background-color': 'var(--wp--preset--color--accent)',
          'border-color': 'var(--wp--preset--color--accent)',
          color: 'var(--wp--preset--color--accent-on)'
        })
      : '',
    // the calls to action inside a kept band: the band stays, its buttons wear the system
    ...keptButtonRules(contract, tokens, HI, bands.grounds, sel.buttonPrimary, bands.media),
    ...layoutRules(profile, tokens, sel, scoped, rule, sv),
    // the system's type and components beyond its tokens, read off its reference page
    ...componentRules(sel, sv, scoped, rule, outside),
    // the featured plan keeps its accent edge, after the card rule it outranks (featuredCardRules)
    ...featuredCardRules(
      sel,
      sv,
      { accent: tokens['--accent'], accentText: t['--ds-accent-text'], page: tokens['--bg'] },
      scoped,
      rule,
      outside
    ),
    // a theme rule painting a literal colour the tokenizer left alone (JA Essence's pagination #000 and
    // card "Read more" #252424: black on a dark system's page, 1:1, re-measured 11/10/2026) follows the
    // role the contract names (followRules: { selector: { property: role } }), as on Joomla
    ...followRules(contract).map(([selector, decls]) => rule(scoped(outside(selector)), decls)),
    // what a template draws for one side of light (JA Kinetic: its dark default keeps literal #161B18
    // grounds under :root[data-theme="dark"], which a light system leaves dark), as on Joomla:
    // sideRules.light / sideRules.dark apply when the worn page is on that side (html color-scheme above)
    ...Object.entries(contract.sideRules?.[dark ? 'dark' : 'light'] ?? {})
      // '>' kept: a child combinator was dropped here without a word (JA Impact, 19/10/2026); a key that
      // is a comma list scopes every selector of it, not only its first (commas inside :is() stay)
      .filter(([s]) => typeof s === 'string' && s && !/[{};<\\]|\/\*/.test(s))
      .map(([s, o]) =>
        rule(
          scoped(
            outside(
              splitTop(s)
                .map((x) => x.trim())
                .filter(Boolean)
            )
          ),
          o ?? {}
        )
      ),
    t['--ds-accent-text'] && sel.accentText
      ? rule(scoped(outside(sel.accentText)), { color: `${t['--ds-accent-text']}!important` })
      : '',
    t['--ds-accent-text-hover'] && sel.accentTextHover
      ? rule(scoped(outside(sel.accentTextHover)), { color: `${t['--ds-accent-text-hover']}!important` })
      : ''
  ]
    .filter(Boolean)
    .join('\n')
  return { css, adjusted: text.adjusted }
}

/**
 * WordPress's kebab case for a theme.json key (`_wp_to_kebab_case`): words and runs of digits joined
 * by `-`, lower case — `gutterDesktop` → `gutter-desktop`, `sectionY` → `section-y`, `2xl` → `2-xl`.
 * @param {string} s
 */
export function wpKebab(s) {
  const parts = String(s).match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g) ?? []
  return parts.map((p) => p.toLowerCase()).join('-')
}

/**
 * The CSS WordPress prints for a style variation (`wp_get_global_stylesheet()` of the variation's own
 * part): its presets and `custom` values as `--wp--preset--*` / `--wp--custom--*` on :root, its font
 * faces, its element styles, then its `styles.css`. What a site would wear, WITHOUT writing it: the
 * Design system panel's live preview puts this right after the page's own global styles, where
 * WordPress puts the variation it wears (scripts/preview.mjs measures one against the other). A theme
 * with fluid type would compute clamp() sizes; the themes that wear the slot set `fluid: false`.
 * @param {any} variation  a `wordpressVariation(...).variation`
 * @returns {string}
 */
export function variationCss(variation) {
  const s = variation?.settings ?? {}
  const vars = []
  for (const c of s.color?.palette ?? []) vars.push(`--wp--preset--color--${wpKebab(c.slug)}:${c.color}`)
  for (const f of s.typography?.fontFamilies ?? [])
    vars.push(`--wp--preset--font-family--${wpKebab(f.slug)}:${f.fontFamily}`)
  for (const f of s.typography?.fontSizes ?? [])
    vars.push(`--wp--preset--font-size--${wpKebab(f.slug)}:${f.size}`)
  for (const x of s.spacing?.spacingSizes ?? [])
    vars.push(`--wp--preset--spacing--${wpKebab(x.slug)}:${x.size}`)
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node ?? {})) {
      if (v && typeof v === 'object') walk(v, [...path, wpKebab(k)])
      else if (v !== null && v !== undefined)
        vars.push(`--wp--custom--${[...path, wpKebab(k)].join('--')}:${v}`)
    }
  }
  walk(s.custom, [])
  if (s.layout?.contentSize) vars.push(`--wp--style--global--content-size:${s.layout.contentSize}`)
  if (s.layout?.wideSize) vars.push(`--wp--style--global--wide-size:${s.layout.wideSize}`)
  const out = [`:root{${vars.filter((d) => safeValue(d.slice(d.indexOf(':') + 1))).join(';')}}`]
  for (const f of s.typography?.fontFamilies ?? [])
    for (const face of f.fontFace ?? []) {
      const src = (face.src ?? []).map((u) => `url('${u}')`).join(',')
      out.push(
        `@font-face{font-family:${JSON.stringify(face.fontFamily)};font-style:${face.fontStyle ?? 'normal'};font-weight:${face.fontWeight ?? '400'};font-display:${face.fontDisplay ?? 'swap'};src:${src};${face.unicodeRange ? `unicode-range:${face.unicodeRange};` : ''}}`
      )
    }
  const st = variation?.styles ?? {}
  const decl = (o) =>
    Object.entries(o)
      .filter(([, v]) => v !== null && v !== undefined && safeValue(String(v)))
      .map(([k, v]) => `${k}:${v}`)
      .join(';')
  if (st.typography?.fontWeight) out.push(`body{${decl({ 'font-weight': st.typography.fontWeight })}}`)
  const button = st.elements?.button
  if (button) {
    const p = button.spacing?.padding ?? {}
    const d = decl({
      'border-radius': button.border?.radius,
      'font-weight': button.typography?.fontWeight,
      'padding-top': p.top,
      'padding-right': p.right,
      'padding-bottom': p.bottom,
      'padding-left': p.left
    })
    if (d) out.push(`:root :where(.wp-element-button, .wp-block-button__link){${d}}`)
  }
  const heading = st.elements?.heading?.typography?.fontWeight
  if (heading) out.push(`h1, h2, h3, h4, h5, h6{${decl({ 'font-weight': heading })}}`)
  const link = st.elements?.link
  if (link?.color?.text) out.push(`:root :where(a:where(:not(.wp-element-button))){color:${link.color.text}}`)
  if (link?.[':hover']?.color?.text)
    out.push(`:root :where(a:where(:not(.wp-element-button)):hover){color:${link[':hover'].color.text}}`)
  if (typeof st.css === 'string') out.push(st.css)
  return out.join('\n')
}
