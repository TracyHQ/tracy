/**
 * Words that tell a value's role from the NAME around it: a custom property or preprocessor variable
 * (`--color-fg-muted`, `$brand-primary`), a selector (`.btn-primary:hover`), or the component a
 * Tailwind class sits in (`ResourcesMenu.tsx`). PURE. Roles are the standard role variables
 * (`../role-variables.mjs`); a word that names no role returns null and the palette decides.
 */
import { chromaOf, SATURATED } from '../auto-palette.mjs'
import { isRoleVariable } from '../role-variables.mjs'

const c = (r) => `--ds-c-${r}`
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/^[-$@]+/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** Status family of a name or selector: success · warn · danger · info, or null. */
export function statusOf(text) {
  // `.page-info`, `.contact-info` (information) and `.error-code`, `.error-page` (the 404 page) name a
  // part of a page, not a state: the status word must be the state itself or a state modifier
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/[\w-]*-info(?![\w-])/g, (m) =>
      /^(alert|text|bg|badge|btn|is|has|notice|callout|toast|label|border|status)-info$/.test(
        m.replace(/^[.-]+/, '')
      )
        ? m
        : ' '
    )
    .replace(
      /(error|success|warning|info)-(code|page|title|number|heading|section|meta|wrap|wrapper|content|image|box)(?![\w-])/g,
      ' '
    )
  const w = words(s)
  if (w.some((x) => /^(success|valid|positive|ok|done)$/.test(x))) return 'success'
  if (w.some((x) => /^(warn|warning|caution|pending)$/.test(x))) return 'warn'
  if (w.some((x) => /^(error|danger|invalid|destructive|negative|failure)$/.test(x))) return 'danger'
  if (w.some((x) => /^(info|notice|information)$/.test(x))) return 'info'
  return null
}

/**
 * The status role variable for a family, by what the value paints: its pale ground, its words, or the
 * state colour itself.
 * @param {string} family @param {'fill'|'text'|'line'|'glyph'|null} kind @param {string} name
 * @param {number} lum relative luminance of the value
 */
export function statusRole(family, kind, name, lum) {
  const w = words(name)
  if (w.some((x) => /^(bg|background|surface|tint|soft)$/.test(x)) || (kind === 'fill' && lum > 0.7))
    return c(`${family}-bg`)
  if (w.some((x) => /^(fg|text|foreground|ink)$/.test(x)) || kind === 'text') return c(`${family}-text`)
  return c(family)
}

/**
 * Role of a colour custom property or preprocessor variable from its own name, or null.
 * `kind` (what the uses paint, when known) breaks the tie of names that are both a ground and a text.
 * @param {string} name @param {number} lum
 */
export function colourRoleOfName(name, lum = 0.5, kind = null, hex = null) {
  const all = words(name)
  // `--brand-color-*` (the brand engine) uses `brand` as a namespace, not as the accent
  const ns = all[0] === 'brand' && /^(color|colour)$/.test(all[1] ?? '') ? 1 : 0
  let w = all.slice(ns).filter((x) => !/^(color|colour|clr|c|ds|tw|wp|preset|theme)$/.test(x))
  // a brand constant named for what it is (`--brand-paper`, `--brand-prose`, `--brand-header`): `brand`
  // is the namespace; it names the accent only beside a modifier (`--brand`, `--brand-hover`)
  if (w.includes('brand') && w.some((x) => x !== 'brand' && !BRAND_MODIFIER.test(x)))
    w = w.filter((x) => x !== 'brand')
  const has = (re) => w.some((x) => re.test(x))
  // the words of an ink band (`--tb-ink-meta`, `--ink-line`): text on the ink, or a line there (no role)
  if (has(/^(ink|inverse|night)$/) && !has(/^on$/)) {
    if (has(/^(line|border|divider|rule|outline|separator|hairline)$/)) return null
    if (has(/^(text|fg|foreground|meta|muted|faint|caption|subtle|soft)$/)) return c('on-ink')
  }
  const alt = w.some((x) => /^(2|3|alt|alternate|subtle|muted|secondary|warm)$/.test(x))
  if (!w.length) return null
  if (has(/^(white|black|transparent|current)$/) && w.length === 1) return null
  if (has(/^(shadow|overlay|scrim|backdrop|gradient)$/)) return null
  const status = statusOf(name)
  if (status) return statusRole(status, kind, name, lum)
  if (has(/^(focus|ring)$/)) return c('focus-ring')
  if (has(/^disabled$/))
    return kind === 'text' || has(/^(fg|text|foreground)$/) ? c('disabled-fg') : c('disabled-bg')
  const on = w.indexOf('on')
  if (on !== -1) {
    const of = w.slice(on + 1)
    if (of.some((x) => /^(line|border|muted|meta|faint)$/.test(x))) return null
    if (of.some((x) => /^(ink|dark|inverse|night)$/.test(x))) return c('on-ink')
    if (of.some((x) => /^(accent|primary|brand)$/.test(x))) return c('accent-on')
    return null
  }
  if (has(/^foreground$/) && has(/^(primary|accent|brand)$/) && w[0] !== 'accent') return c('accent-on')
  if (has(/^foreground$/) && w.length > 1 && !has(/^(card|popover|background|muted)$/)) return null
  if (has(/^(link|links)$/))
    return has(/^(hover|active|focus|visited)$/) ? c('accent-text-hover') : c('accent-text')
  if (has(/^(primary|brand|accent|cta)$/)) {
    // the SUFFIX names what the value paints; `primary` only says which family (dry run of JA Kinetic:
    // `--brand-color-primary-contrast`, `--t4-primary-bg-subtle` were all forced to the accent)
    const sat = hex ? chromaOf(hex) >= SATURATED : null
    const hover = has(/^(hover|focus)$/)
    const active = has(/^(active|pressed)$/)
    const soft = has(/^(subtle|soft|light|lighter|pale|faint|tint|muted)$/)
    if (has(/^(contrast|inverse)$/)) return c('accent-on')
    if (has(/^ink$/)) return null
    if (has(/^(border|line|outline|divider)$/))
      return soft ? c('border-soft') : sat === false ? c('border') : c('accent')
    if (has(/^(bg|background|fill|surface)$/)) {
      if (soft || sat === false) return c('surface')
      return hover ? c('accent-hover') : active ? c('accent-active') : c('accent')
    }
    if (has(/^(text|fg|emphasis)$/))
      return sat === false ? c('fg') : hover ? c('accent-text-hover') : c('accent-text')
    if (kind === 'text') return has(/^(hover|active|focus)$/) ? c('accent-text-hover') : c('accent-text')
    if (has(/^(hover|dark|darker)$/)) return c('accent-hover')
    if (has(/^(active|pressed)$/)) return c('accent-active')
    if (has(/^(text|fg)$/)) return c('accent-text')
    return c('accent')
  }
  if (has(/^(border|line|divider|rule|outline|separator|hairline)$/) || (has(/^input$/) && w.length === 1)) {
    if (has(/^(soft|faint|light|subtle|weak)$/)) return c('border-soft')
    if (has(/^(strong|dark|heavy)$/)) return c('border')
    return c('border')
  }
  // a ground named by its tier (`--t4-tertiary-bg`, `--t4-secondary-bg`): the suffix wins over the tier
  if (has(/^(bg|background)$/) && !has(/^(fg|text|foreground|heading|title)$/)) {
    // a neutral ground named for its hover (`--t4-card-hover-bg`): the hover ground, not the rest one
    if (has(/^hover$/)) return c('surface-hover')
    if (has(/^(surface|card|panel|popover|elevated|raised|tile|sheet|dropdown|fill)$/)) return c('surface')
    return alt || has(/^(tertiary|quaternary)$/) ? c('surface-warm') : c('bg')
  }
  if (has(/^(heading|headings|title|headline|display)$/)) return c('heading')
  if (has(/^(meta|caption|faint|fainter|hint|placeholder|small|tertiary)$/)) return c('meta')
  if (has(/^(muted|subdued|dim|quiet)$/) && (kind === 'text' || has(/^(fg|text|foreground)$/)))
    return c('muted')
  if (has(/^(fg|text|foreground|body|copy|prose)$/) && !has(/^(bg|background)$/))
    return alt ? c('fg-2') : c('fg')
  if (has(/^(ink|inverse|night)$/)) return kind === 'text' ? c('fg') : c('ink')
  if (has(/^(surface|card|panel|popover|elevated|raised|tile|sheet|dropdown|fill)$/))
    return has(/^hover$/) && kind !== 'text' ? c('surface-hover') : alt ? c('surface-warm') : c('surface')
  if (has(/^(bg|background|page|canvas|paper|base|body)$/)) return alt ? c('surface-warm') : c('bg')
  return null
}

const BRAND_MODIFIER =
  /^(\d+|hover|focus|active|pressed|dark|darker|light|lighter|soft|subtle|text|fg|bg|background|border|line|contrast|inverse|on|tint|muted|pale|faint|emphasis|fill|surface|outline|divider|primary|accent|strong)$/

const SUFFIX = /^(bg|background|color|colour|text|fg|border|fill)$/
const ROLE_WORD =
  /^(bg|background|page|body|base|canvas|paper|surface|card|fg|text|foreground|heading|headings|title|muted|meta|caption|border|line|divider|outline|primary|secondary|tertiary|quaternary|accent|brand|cta|link|links|hover|active|focus|visited|disabled|subtle|soft|emphasis|contrast|fill|ink|on|inverse|alt|alternate|warm|light|lighter|dark|darker|strong|faint|elevated|raised|layout|container|default|main|site|color|colour|clr|ds|tw|wp|bs|t4|preset|theme|custom|rgb|\d+|success|warn|warning|danger|error|info|valid|invalid|white|black)$/

/**
 * A component's own colour variable (`--t4-btn-bg`, `--cats-tile-bg`, `--split-code-bg`): its last
 * word names what it paints and another word names a part of the page. Its role is that of the
 * component it is set on, not of its name, and one name may hold a different colour per component
 * (`.btn-primary`, `.btn-light` both set `--t4-btn-bg`).
 */
export function isComponentVar(name) {
  if (!String(name ?? '').startsWith('--')) return false
  const w = words(name)
  return w.length > 1 && SUFFIX.test(w[w.length - 1]) && w.some((x) => !ROLE_WORD.test(x))
}

const RADIUS = [
  [/(^|[^a-z])(btn|button|submit|cta)s?([^a-z]|$)/, '--ds-btn-radius'],
  [
    /(^|[^a-z])(input|field|search|select|textarea|textfield|combobox|form-control)s?([^a-z]|$)/,
    '--ds-input-radius'
  ],
  [/(^|[^a-z])(chip|tag|badge|pill|label-tag|filter)s?([^a-z]|$)/, '--ds-pill-radius'],
  [
    /(^|[^a-z])(card|panel|popover|dropdown|menu|dialog|modal|sheet|tooltip|toast|tile|box)s?([^a-z]|$)/,
    '--ds-card-radius'
  ]
]

/** Radius role from any text that names the component (selector, file, the element's line), or null. */
export function radiusRoleOf(...texts) {
  for (const t of texts) {
    const s = String(t ?? '')
      // what a selector excludes is not what it styles (`input:not([type=submit])` is a field)
      .replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')
      // utilities that only share a word with a component (`select-none`, `box-border`, `filter`)
      .replace(
        /(^|[\s:"'`])!?(select|box|filter|backdrop-filter|outline|decoration|ring)(-[\w-]+)?(?=$|[\s"'`])/g,
        '$1'
      )
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
    // a call to action that is a BLOCK (`CtaBand`, `InlineCta`, `.cta-inner`) is a card: only a
    // bare `cta` or `cta-button` names the button itself
    if (CTA_BLOCK.test(s)) return '--ds-card-radius'
    for (const [re, role] of RADIUS) if (re.test(s)) return role
  }
  return null
}
const CTA_BLOCK =
  /(^|[^a-z])(cta-+(band|section|block|banner|inner|box|strip|panel|wrap|wrapper|container|card|capsule)|(inline|final|closing)-cta)s?([^a-z]|$)/

/** Font role from a family variable's name or a selector, or null. */
export function fontRoleOf(text) {
  const w = words(text)
  if (w.some((x) => /^(mono|code|monospace)$/.test(x))) return '--ds-font-mono'
  if (w.some((x) => /^(display|heading|headings|title|headline|h[1-6])$/.test(x))) return '--ds-font-display'
  // `--t4-font-sans-serif` is the sans face: `serif` names the display face only without `sans`
  if (w.some((x) => /^(sans|body|base|text|copy|ui|html)$/.test(x))) return '--ds-font-body'
  if (w.includes('serif')) return '--ds-font-display'
  return null
}

/** The selector reads a heading. */
export const isHeadingSelector = (sel) =>
  /(^|[\s>,+~(])h[1-6]\b|heading|title|headline|display/i.test(sel ?? '')

/** Something deliberately kept: pictures, brand art, flags, masks, display-only swatches. */
export function keepReasonOf(text, kind = null) {
  const s = String(text ?? '').toLowerCase()
  // a flag is a picture; the words around a language menu's TEXT are not (`flagship` is no flag either)
  if (kind !== 'text' && /\bflags?\b|language-?menu|lang-?switch/.test(s))
    return 'flag colours are part of a picture'
  if (/logo|brand-?mark|wordmark/.test(s)) return 'brand logo art'
  if (/style-?guide|swatch|kit-?style/.test(s)) return 'display-only swatch of the template palette'
  if (
    /facebook|twitter|linkedin|youtube|instagram|pinterest|whatsapp|tiktok|github|google|apple-pay|paypal|visa/.test(
      s
    )
  )
    return 'third-party brand colour'
  return null
}

/** Only role variables of the shared list leave this module. */
export const roleOrNull = (r) => (r && isRoleVariable(r) ? r : null)
