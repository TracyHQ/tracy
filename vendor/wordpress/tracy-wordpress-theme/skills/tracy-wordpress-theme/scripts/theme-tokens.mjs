#!/usr/bin/env node
// theme-tokens.mjs — a design-contract's measured rules → the 56-token tokens.css the theme
// generator accepts as a target's root look (`rootTokens` in theme.config.json).
//
// The generator (packages/cms/tracy-wordpress-theme/scripts/build.mjs) reads a tokens.css with
// the same `tokensOf()` it reads a vendored OpenDesign system with, and refuses a name missing or
// unknown against its TOKEN_NAMES. So this tool answers every one of the 56 names, and says for
// each where the value came from: MEASURED when the contract has a rule for it, FALLBACK when the
// `--fallback` file (a vendored tokens.css, usually apple) had to stand in. A token with neither
// is a refusal, not a blank — the theme would ship a hole the Site Editor cannot see.
//
// Measuring is by role, not by CSS name: the contract's rules are computed styles keyed by
// selector (`h1`, `body`, `.btn-primary`, `.card`…), and the map below says which rule + property
// answers which token — `--text-4xl` is the h1's fontSize, `--accent` the primary button's
// backgroundColor, `--leading-body` the body's lineHeight ÷ fontSize. Computed values are
// normalised to the shape the vendored files use (hex colours, unitless leading, em tracking,
// ms durations). A token the contract's own `tokens[variant]` map declares by its contract name
// wins over any rule. The spacing scale is derived, not read: the unit is the gcd of every
// padding/margin/gap the rules carry, halved down to ≤ 6px, and `--space-N` = N × unit.
//
// Usage:
//   node scripts/theme-tokens.mjs --contract <design-contract.json> --out tokens.css \
//        [--variant desktop-light] [--fallback <vendor tokens.css>]
//
// Exit 0: the file was written, 56 tokens. Exit 1: a token had neither a measurement nor a
// fallback (named on stderr), nothing written. Exit 2: bad arguments or unreadable input.

import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDesign } from './design-contract.mjs'

/**
 * The 56 custom properties every vendored tokens.css declares — a copy of TOKEN_NAMES in
 * packages/cms/tracy-wordpress-theme/scripts/build.mjs (measured 07/09/2026 across all 152
 * systems). The generator checks the file against its own list; this one only exists so the tool
 * can refuse before the generator does. Keep the two in step.
 */
export const TOKEN_NAMES = Object.freeze([
  '--bg',
  '--surface',
  '--surface-warm',
  '--fg',
  '--fg-2',
  '--muted',
  '--meta',
  '--border',
  '--border-soft',
  '--accent',
  '--accent-on',
  '--accent-hover',
  '--accent-active',
  '--success',
  '--warn',
  '--danger',
  '--font-display',
  '--font-body',
  '--font-mono',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
  '--leading-body',
  '--leading-tight',
  '--tracking-display',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  '--space-12',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-pill',
  '--elev-flat',
  '--elev-ring',
  '--elev-raised',
  '--focus-ring',
  '--motion-fast',
  '--motion-base',
  '--ease-standard',
  '--section-y-desktop',
  '--section-y-tablet',
  '--section-y-phone',
  '--container-max',
  '--container-gutter-desktop',
  '--container-gutter-tablet',
  '--container-gutter-phone'
])

/**
 * name → value of every custom property declared in a tokens.css — the same rules as the
 * generator's `tokensOf()`: comments stripped first, the first declaration of a name wins.
 * @param {string} css
 * @returns {Record<string, string>}
 */
export function parseTokensCss(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = {}
  for (const match of code.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm)) {
    if (!(match[1] in tokens)) tokens[match[1]] = match[2].trim()
  }
  return tokens
}

// ---- value normalisers: a computed style → the shape a vendored tokens.css writes ----

const px = (v) => {
  const m = typeof v === 'string' && v.trim().match(/^(-?\d*\.?\d+)px$/)
  return m ? Number(m[1]) : null
}
const trimNumber = (n, digits) => String(Number(n.toFixed(digits)))

/** A colour as `#rrggbb` (or `#rrggbbaa` when translucent); transparent and unknown → null. */
export function colorValue(v) {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (s === '' || s === 'transparent' || s === 'currentcolor' || s === 'inherit') return null
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`
  if (/^#[0-9a-f]{6}$/.test(s) || /^#[0-9a-f]{8}$/.test(s)) return s
  const m = s.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/)
  if (!m) return null
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
  if (alpha <= 0) return null
  const hex = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')
  const rgb = `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
  return alpha >= 1 ? rgb : `${rgb}${hex(alpha * 255)}`
}

/** WCAG 2 contrast ratio of two opaque `#rrggbb` colours; null for anything else (translucent, unknown). */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const la = lum(a),
    lb = lum(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
const MIN_ACCENT_CONTRAST = 4.5

/** A length in px, `0px` and `auto`/`none`/`normal` excluded. */
const lengthValue = (v) => {
  const n = px(v)
  return n === null || n <= 0 ? null : `${trimNumber(n, 2)}px`
}

/** A container `width` as a maximum: a positive px length strictly below the viewport it was measured at. */
const containerWidth = (v, styles, ctx) => {
  const n = px(v)
  return n === null || n <= 0 || (ctx?.width && n >= ctx.width) ? null : `${trimNumber(n, 2)}px`
}

/** A font stack as written; `inherit`/empty excluded. */
const fontValue = (v) => (typeof v === 'string' && v.trim() !== '' && v.trim() !== 'inherit' ? v.trim() : null)

/** `lineHeight` → unitless: a px value divided by the rule's fontSize, a bare number kept. */
const leadingValue = (v, styles) => {
  if (typeof v !== 'string' || v.trim() === 'normal') return null
  if (/^\d*\.?\d+$/.test(v.trim())) return trimNumber(Number(v), 2)
  const lh = px(v)
  const fs = px(styles.fontSize)
  return lh !== null && fs ? trimNumber(lh / fs, 2) : null
}

/** `letterSpacing` → em: a px value divided by the rule's fontSize, `normal` is 0, em kept. */
const trackingValue = (v, styles) => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s === 'normal' || s === '0px' || s === '0') return '0'
  if (/^-?\d*\.?\d+em$/.test(s)) return s
  const ls = px(s)
  const fs = px(styles.fontSize)
  return ls !== null && fs ? `${trimNumber(ls / fs, 3)}em` : null
}

/** A border-radius that is a corner, not a capsule (< 999px, no percentage). */
const radiusValue = (v) => {
  const n = px(v)
  return n === null || n <= 0 || n >= 999 ? null : `${trimNumber(n, 2)}px`
}
/** A capsule radius: ≥ 999px, or a `9999px`/`980px`-style literal the site wrote. */
const pillValue = (v) => {
  const n = px(v)
  return n !== null && n >= 999 ? `${trimNumber(n, 0)}px` : null
}

/** A shadow or ring as computed; `none` excluded. */
const shadowValue = (v) => (typeof v === 'string' && v.trim() !== '' && v.trim() !== 'none' ? v.trim() : null)

/** A duration in ms: `0.2s` → `200ms`, `0s` excluded. */
const durationValue = (v) => {
  if (typeof v !== 'string') return null
  const s = v.trim().split(',')[0].trim()
  const ms = s.match(/^(\d*\.?\d+)ms$/)
  const sec = s.match(/^(\d*\.?\d+)s$/)
  const n = ms ? Number(ms[1]) : sec ? Number(sec[1]) * 1000 : null
  return n === null || n <= 0 ? null : `${trimNumber(n, 0)}ms`
}
/** The first easing of a transition list — a comma inside `cubic-bezier(…)` does not split it. */
const easingValue = (v) => {
  if (typeof v !== 'string' || v.trim() === '') return null
  const first = v.trim().match(/^[^,(]*(?:\([^)]*\))?[^,]*/)
  return first ? first[0].trim() : null
}

/** A border colour only counts on a rule whose border has a width. */
const borderColorValue = (v, styles) => {
  const width = styles.borderTopWidth ?? styles.borderWidth ?? styles.borderBottomWidth
  if (typeof width === 'string' && px(width) === 0) return null
  return colorValue(v)
}

// ---- the role map: token → probes tried in order; a probe is a selector/id pattern + property ----

/** A selector without its negation/relational groups: `a:not(.btn)` is a link, not a button. Only for negations and haystacks: `subjectOf` never uses it to look through `:is()`. */
export const stripNegations = (selector) => {
  let out = String(selector)
  for (let prev = null; prev !== out; ) {
    prev = out
    out = out.replace(/:(?:not|is|where|has)\([^()]*\)/g, '')
  }
  return out
}
/** Split at top level only: outside `(…)`, `[…]` and quotes. `separators` is a test on one character. */
function splitTop(text, isSep) {
  const parts = []
  let cur = ''
  let paren = 0
  let quote = null
  let bracket = false
  for (const ch of String(text)) {
    if (quote) {
      if (ch === quote) quote = null
    } else if (bracket) {
      if (ch === ']') bracket = false
      else if (ch === '"' || ch === "'") quote = ch
    } else if (ch === '[') bracket = true
    else if (ch === '(') paren++
    else if (ch === ')') paren = Math.max(0, paren - 1)
    else if (paren === 0 && isSep(ch)) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts
}
/** A compound without its `:not()/:has()` groups (balanced) and attribute selectors. */
function bareCompound(compound) {
  let out = ''
  for (let i = 0; i < compound.length; i++) {
    const m = /^:(?:not|has)\(/i.exec(compound.slice(i))
    if (m) {
      let depth = 0
      let j = i + m[0].length - 1
      for (; j < compound.length; j++) {
        if (compound[j] === '(') depth++
        else if (compound[j] === ')' && --depth === 0) break
      }
      i = j
    } else out += compound[i]
  }
  return out.replace(/\[[^\]]*\]/g, '')
}
/**
 * The last compound of a selector — what the rule MEASURES, not the ancestors that scope it (`.hero .btn` → `.btn`).
 * A subject with no type, class or id of its own is not decided by what is left of it (`.hero :not(.btn)`,
 * `.hero [data-role=button]`, `.hero *`): such a rule has NO subject and is left unmeasured.
 */
export const subjectOf = (selector) => {
  // `.hero :is(.btn)` measures the button, `:is(.hero, .band)` the sections: which one is not decided by
  // stripping the group, so a rule that uses one has NO subject and is left unmeasured.
  if (/:(?:is|where|matches|-webkit-any|-moz-any)\(/i.test(String(selector))) return ''
  const groups = splitTop(selector, (ch) => ch === ',').map((group) => {
    const last = splitTop(group.trim(), (ch) => /[\s>+~]/.test(ch)).filter(Boolean).pop() ?? ''
    const bare = bareCompound(last).trim()
    return /^[a-zA-Z]|[.#][\w-]/.test(bare) ? bare : null
  })
  return groups.includes(null) ? '' : groups.join(' ').toLowerCase()
}
/**
 * A section band: subject is a `<section>` or a class that IS a band (`.hero`, `.t3-section`, `.acm-hero`,
 * `.band`), not a part of one (`.hero-title`, `.section__inner`, `.hero-btn`, `.hero-btn-primary`). A part
 * word anywhere in the name disqualifies it, and a grouped selector is a section only when EVERY group is.
 */
const SECTION_PART = /(?:^|[-_])(?:title|text|btn|button|link|img|image|content|inner|item|caption|heading|desc\w*|sub\w*|cta|icon|label|badge|nav|menu|form|primary|secondary|outline|action|actions)(?:$|[-_])/
export const isSectionSubject = (subject) =>
  subject.split(' ').every((compound) => {
    if (/^section\b/.test(compound)) return true
    return [...compound.matchAll(/[.#]([\w-]+)/g)].some(([, name]) => !name.includes('__') && /(?:^|-)(?:section|hero|band|banner)(?:-|$)/.test(name) && !SECTION_PART.test(name))
  })
const SECTION_SUBJECT = { test: isSectionSubject }
/** Chrome — its background is not a content surface. */
const CHROME = /footer|header|masthead|\bnav|navbar|menu|copyright|sidebar|toolbar/
/** Chrome that stays chrome for what it contains: a card inside the footer or header is not a content surface (a sidebar's card is). */
const CHROME_ANCESTOR = /footer|header|masthead|\bnav|navbar|menu|copyright|toolbar/

const BTN = /button|\.btn|cta|primary/
const LINK = /\ba\b|link/
const BODY = /\bbody\b|\bhtml\b|\bpage\b/
const CARD = /card|panel|tile|surface/
const HEAD1 = /\bh1\b|display|hero-title|hero__title/
const CONTAINER = /container|\.wrap|\.inner|\bmain\b/

/**
 * Which rule and which computed property answer each token. Patterns match `${rule.id}
 * ${rule.selector}` lowercased; the first probe whose rule exists and whose value normalises
 * wins. `variant: 'phone' | 'tablet'` reads the companion variant of that size (same mode)
 * instead of the primary one.
 * `subject: true` matches the rule's subject selector only (never an ancestor or the id); `exclude` drops a rule whose subject matches it.
 * @type {Record<string, Array<{ match: { test(s: string): boolean }, prop: string, value: (v: string, styles: Record<string, string>, ctx?: { width: number }) => string | null, variant?: 'phone' | 'tablet', subject?: boolean, exclude?: RegExp }>>}
 */
export const ROLE_MAP = Object.freeze({
  '--bg': [{ match: BODY, prop: 'backgroundColor', value: colorValue }],
  '--surface': [
    { match: CARD, prop: 'backgroundColor', value: colorValue, exclude: CHROME },
    { match: /alt|stripe|band/, prop: 'backgroundColor', value: colorValue, exclude: CHROME },
    { match: /\bmain\b|mainbody|content|article|item-page/, prop: 'backgroundColor', value: colorValue, exclude: CHROME, subject: true }
  ],
  '--surface-warm': [{ match: /footer|aside|warm|alt|band/, prop: 'backgroundColor', value: colorValue }],
  '--fg': [{ match: BODY, prop: 'color', value: colorValue }],
  '--fg-2': [
    { match: /subtitle|lead|secondary|fg-2|\bnav\b|menu/, prop: 'color', value: colorValue },
    { match: /\bh2\b|\bh3\b|heading|title/, prop: 'color', value: colorValue }
  ],
  '--muted': [{ match: /muted|caption|small|description|excerpt|helper|hint/, prop: 'color', value: colorValue }],
  '--meta': [{ match: /meta|date|time|byline|figcaption|footnote/, prop: 'color', value: colorValue }],
  '--border': [
    { match: /card|input|field|table|border|divider|\bhr\b/, prop: 'borderTopColor', value: borderColorValue },
    { match: /card|input|field|table|border|divider|\bhr\b/, prop: 'borderColor', value: borderColorValue }
  ],
  '--border-soft': [
    { match: /\bhr\b|divider|separator|soft|\brow\b/, prop: 'borderTopColor', value: borderColorValue },
    { match: /\bhr\b|divider|separator|soft|\brow\b/, prop: 'borderColor', value: borderColorValue }
  ],
  '--accent': [
    { match: BTN, prop: 'backgroundColor', value: colorValue },
    { match: LINK, prop: 'color', value: colorValue }
  ],
  '--accent-on': [{ match: BTN, prop: 'color', value: colorValue }],
  '--accent-hover': [{ match: /hover/, prop: 'backgroundColor', value: colorValue }],
  '--accent-active': [{ match: /active|pressed/, prop: 'backgroundColor', value: colorValue }],
  '--success': [
    { match: /success/, prop: 'backgroundColor', value: colorValue },
    { match: /success/, prop: 'color', value: colorValue }
  ],
  '--warn': [
    { match: /warn/, prop: 'backgroundColor', value: colorValue },
    { match: /warn/, prop: 'color', value: colorValue }
  ],
  '--danger': [
    { match: /danger|error/, prop: 'backgroundColor', value: colorValue },
    { match: /danger|error/, prop: 'color', value: colorValue }
  ],
  '--font-display': [
    { match: HEAD1, prop: 'fontFamily', value: fontValue },
    { match: /\bh2\b|heading|title/, prop: 'fontFamily', value: fontValue }
  ],
  '--font-body': [
    { match: BODY, prop: 'fontFamily', value: fontValue },
    { match: /\bp\b|paragraph|text/, prop: 'fontFamily', value: fontValue }
  ],
  '--font-mono': [{ match: /\bcode\b|\bpre\b|\bkbd\b|mono/, prop: 'fontFamily', value: fontValue }],
  '--text-xs': [{ match: /\bxs\b|badge|eyebrow|overline|figcaption|\blabel\b|tag/, prop: 'fontSize', value: lengthValue }],
  '--text-sm': [{ match: /small|caption|meta|\bh6\b|\bsm\b|button|\.btn|\bnav\b/, prop: 'fontSize', value: lengthValue }],
  '--text-base': [
    { match: BODY, prop: 'fontSize', value: lengthValue },
    { match: /\bp\b|paragraph|text/, prop: 'fontSize', value: lengthValue }
  ],
  '--text-lg': [{ match: /\bh5\b|lead|subtitle|intro|\blg\b/, prop: 'fontSize', value: lengthValue }],
  '--text-xl': [{ match: /\bh4\b|\bxl\b|card-title|card__title/, prop: 'fontSize', value: lengthValue }],
  '--text-2xl': [{ match: /\bh3\b|2xl/, prop: 'fontSize', value: lengthValue }],
  '--text-3xl': [{ match: /\bh2\b|3xl|section-title|section__title/, prop: 'fontSize', value: lengthValue }],
  '--text-4xl': [{ match: HEAD1, prop: 'fontSize', value: lengthValue }],
  '--leading-body': [
    { match: BODY, prop: 'lineHeight', value: leadingValue },
    { match: /\bp\b|paragraph|text/, prop: 'lineHeight', value: leadingValue }
  ],
  '--leading-tight': [
    { match: HEAD1, prop: 'lineHeight', value: leadingValue },
    { match: /\bh2\b|heading|title/, prop: 'lineHeight', value: leadingValue }
  ],
  '--tracking-display': [
    { match: HEAD1, prop: 'letterSpacing', value: trackingValue },
    { match: /\bh2\b|heading|title/, prop: 'letterSpacing', value: trackingValue }
  ],
  '--radius-sm': [{ match: /input|field|badge|tag|chip|select|textarea/, prop: 'borderRadius', value: radiusValue }],
  '--radius-md': [{ match: BTN, prop: 'borderRadius', value: radiusValue }],
  '--radius-lg': [{ match: /card|panel|modal|dialog|tile|image|\bimg\b|figure/, prop: 'borderRadius', value: radiusValue }],
  '--radius-pill': [
    { match: /pill|badge|tag|chip/, prop: 'borderRadius', value: pillValue },
    { match: BTN, prop: 'borderRadius', value: pillValue }
  ],
  '--elev-flat': [],
  '--elev-ring': [{ match: /ring|outline|input|field/, prop: 'boxShadow', value: shadowValue }],
  '--elev-raised': [{ match: /card|panel|dropdown|modal|dialog|raised|shadow/, prop: 'boxShadow', value: shadowValue }],
  '--focus-ring': [
    { match: /focus/, prop: 'boxShadow', value: shadowValue },
    { match: /focus/, prop: 'outline', value: shadowValue }
  ],
  '--motion-fast': [{ match: /fast|hover/, prop: 'transitionDuration', value: durationValue }],
  '--motion-base': [
    { match: BTN, prop: 'transitionDuration', value: durationValue },
    { match: LINK, prop: 'transitionDuration', value: durationValue }
  ],
  '--ease-standard': [
    { match: BTN, prop: 'transitionTimingFunction', value: easingValue },
    { match: LINK, prop: 'transitionTimingFunction', value: easingValue }
  ],
  '--section-y-desktop': [{ match: SECTION_SUBJECT, subject: true, prop: 'paddingTop', value: lengthValue }],
  '--section-y-tablet': [{ match: SECTION_SUBJECT, subject: true, prop: 'paddingTop', value: lengthValue, variant: 'tablet' }],
  '--section-y-phone': [{ match: SECTION_SUBJECT, subject: true, prop: 'paddingTop', value: lengthValue, variant: 'phone' }],
  // Bootstrap 3 / T3 containers set `width` (1260), not `max-width`: it counts only when narrower than the
  // variant's viewport — a full-width container's width is the viewport, not a maximum.
  '--container-max': [
    { match: CONTAINER, prop: 'maxWidth', value: lengthValue, subject: true },
    { match: CONTAINER, prop: 'width', value: containerWidth, subject: true }
  ],
  '--container-gutter-desktop': [{ match: CONTAINER, prop: 'paddingLeft', value: lengthValue, subject: true }],
  '--container-gutter-tablet': [{ match: CONTAINER, prop: 'paddingLeft', value: lengthValue, variant: 'tablet', subject: true }],
  '--container-gutter-phone': [{ match: CONTAINER, prop: 'paddingLeft', value: lengthValue, variant: 'phone', subject: true }]
})

const SPACING_PROPS = Object.freeze([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
  'rowGap',
  'columnGap'
])

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))

/**
 * The spacing unit the rules imply: the gcd of every integer px spacing value they carry, halved
 * while above 6px (16 → 4, 24 → 6, 40 → 5), and null when the values share nothing (gcd 1).
 * @param {Array<{ id: string, styles: Record<string, string> }>} rules - already narrowed to one variant
 * @returns {{ unit: number, values: number[], rules: string[] } | null}
 */
export function spacingUnit(rules) {
  const values = new Set()
  const from = new Set()
  for (const rule of rules) {
    for (const prop of SPACING_PROPS) {
      for (const part of String(rule.styles[prop] ?? '').split(/\s+/)) {
        const n = px(part)
        if (n !== null && n > 0 && Number.isInteger(n)) {
          values.add(n)
          from.add(rule.id)
        }
      }
    }
  }
  if (values.size === 0) return null
  let unit = [...values].reduce((a, b) => gcd(a, b))
  while (unit > 6 && unit % 2 === 0) unit /= 2
  if (unit < 2) return null
  return { unit, values: [...values].sort((a, b) => a - b), rules: [...from] }
}

/**
 * The 56 tokens for one variant of a validated design contract, each with its provenance.
 * @param {Record<string, any>} contract - a design-contract.json, validated by validateDesign()
 * @param {{ variant?: string, fallback?: Record<string, string> | null, fallbackLabel?: string }} [opts]
 * @returns {{ tokens: Record<string, string>, provenance: Array<{ name: string, value: string, source: 'measured' | 'fallback' | 'derived', detail: string }>, missing: string[] }}
 */
export function tokensFromContract(contract, { variant = 'desktop-light', fallback = null, fallbackLabel = 'fallback' } = {}) {
  const primary = contract.variants.find((v) => v.id === variant)
  if (!primary) {
    throw new Error(
      `variant ${variant} is not in the contract (it has ${contract.variants.map((v) => v.id).join(', ')})`
    )
  }
  const companion = {
    phone: contract.variants.find((v) => v.mode === primary.mode && v.width <= 430) ?? null,
    tablet: contract.variants.find((v) => v.mode === primary.mode && v.width > 430 && v.width < 1280) ?? null
  }
  const stylesOf = (rule, which) => {
    const id = which ? companion[which]?.id : primary.id
    return id ? (rule.styles[id] ?? null) : null
  }
  const haystack = (rule) => `${rule.id} ${stripNegations(rule.selector)}`.toLowerCase()
  const declared = contract.tokens[primary.id] ?? {}

  const tokens = {}
  const provenance = []
  const missing = []
  let declaredOn = false
  const spacing = spacingUnit(
    contract.rules.map((r) => ({ id: r.id, styles: stylesOf(r) ?? {} }))
  )

  for (const name of TOKEN_NAMES) {
    let found = null
    // 1. the contract's own token map, by the contract name
    if (typeof declared[name] === 'string' && declared[name].trim() !== '') {
      found = { value: declared[name].trim(), detail: `contract tokens.${primary.id}` }
    }
    // 2. the spacing scale
    const step = name.startsWith('--space-') ? Number(name.slice('--space-'.length)) : null
    if (!found && step !== null && spacing) {
      found = {
        value: `${String(spacing.unit * step)}px`,
        detail: `spacing scale: unit ${String(spacing.unit)}px from ${spacing.values.map((v) => `${String(v)}px`).join(', ')} (rules ${spacing.rules.join(', ')}), ×${String(step)}`
      }
    }
    // 3. a rule by role
    if (!found) {
      for (const probe of ROLE_MAP[name] ?? []) {
        if (probe.variant && !companion[probe.variant]) continue
        for (const rule of contract.rules) {
          if (!probe.match.test(probe.subject ? subjectOf(rule.selector) : haystack(rule))) continue
          if (probe.exclude && (probe.exclude.test(subjectOf(rule.selector)) || CHROME_ANCESTOR.test(rule.selector.toLowerCase()))) continue
          const styles = stylesOf(rule, probe.variant)
          if (!styles || typeof styles[probe.prop] !== 'string') continue
          const value = probe.value(styles[probe.prop], styles, { width: (probe.variant ? companion[probe.variant] : primary).width })
          if (value === null) continue
          const at = probe.variant ? ` at ${companion[probe.variant].id}` : ''
          found = { value, detail: `rule ${rule.id} (${rule.selector}) ${probe.prop}${at}` }
          break
        }
        if (found) break
      }
    }
    if (found) {
      tokens[name] = found.value
      provenance.push({ name, value: found.value, source: 'measured', detail: found.detail })
      if (name === '--accent-on' && found.detail.startsWith('contract tokens')) declaredOn = true
      continue
    }
    // 4. the fallback file
    if (fallback && typeof fallback[name] === 'string') {
      tokens[name] = fallback[name]
      provenance.push({ name, value: fallback[name], source: 'fallback', detail: fallbackLabel })
      continue
    }
    missing.push(name)
  }
  // The text on the accent must be readable on it: a measured or fallback `--accent-on` that fails
  // 4.5:1 against `--accent` (a link colour that IS the accent: red on red) is replaced by the first
  // of `--bg`, white, black that passes, else by the best of the three. A value the contract's own
  // token map declares stays: that is the author's decision, and it is reported, not overridden.
  const on = tokens['--accent-on'],
    accent = tokens['--accent']
  const ratio = on && accent ? contrastRatio(colorValue(on) ?? on, colorValue(accent) ?? accent) : null
  if (ratio !== null && ratio < MIN_ACCENT_CONTRAST && !declaredOn) {
    const options = [...new Set([colorValue(tokens['--bg'] ?? ''), '#ffffff', '#000000'].filter(Boolean))]
    const scored = options.map((c) => ({ c, r: contrastRatio(c, colorValue(accent) ?? accent) })).filter((x) => x.r !== null)
    const pick = scored.find((x) => x.r >= MIN_ACCENT_CONTRAST) ?? scored.sort((x, y) => y.r - x.r)[0]
    if (pick) {
      const entry = provenance.find((p) => p.name === '--accent-on')
      const was = entry ? `${entry.source} ${entry.value} (${entry.detail})` : `fallback ${on}`
      tokens['--accent-on'] = pick.c
      const detail = `contrast: ${was} is ${ratio.toFixed(2)}:1 on --accent ${accent}, below ${String(MIN_ACCENT_CONTRAST)}:1; used ${pick.c} (${pick.r.toFixed(2)}:1)`
      if (entry) Object.assign(entry, { value: pick.c, source: 'derived', detail })
      else provenance.push({ name: '--accent-on', value: pick.c, source: 'derived', detail })
    }
  } else if (ratio !== null && ratio < MIN_ACCENT_CONTRAST && declaredOn) {
    const entry = provenance.find((p) => p.name === '--accent-on')
    entry.detail += ` — WARNING: ${ratio.toFixed(2)}:1 on --accent, below ${String(MIN_ACCENT_CONTRAST)}:1 (kept: declared by the contract)`
  }
  return { tokens, provenance, missing }
}

/**
 * The tokens.css text: a header naming its origin, the 56 declarations on :root (each marked
 * measured or fallback), and a trailing block listing what came from where — so a reviewer sees
 * what was guessed without opening the contract.
 * @param {{ tokens: Record<string, string>, provenance: ReturnType<typeof tokensFromContract>['provenance'] }} result
 * @param {{ contractId: string, revision: number, variant: string, contractPath: string, fallbackPath?: string | null }} meta
 */
export function renderTokensCss({ tokens, provenance }, meta) {
  const measured = provenance.filter((p) => p.source === 'measured')
  const fallback = provenance.filter((p) => p.source === 'fallback')
  const derived = provenance.filter((p) => p.source === 'derived')
  const width = Math.max(...TOKEN_NAMES.map((n) => n.length)) + 1
  const lines = [
    '/* tokens.css — written by scripts/theme-tokens.mjs of the tracy-wordpress-theme skill.',
    ` * Design contract: ${meta.contractPath} (id ${meta.contractId}, revision ${String(meta.revision)}), variant ${meta.variant}.`,
    ` * Fallback: ${meta.fallbackPath ?? 'none'}.`,
    ' *',
    ` * ${String(measured.length)} tokens MEASURED from the contract, ${String(derived.length)} DERIVED (contrast-checked), ${String(fallback.length)} taken from the fallback — the block at the`,
    ' * end says which is which. A fallback value is a guess standing in until a rule measures it.',
    ' * Schema: the 56 custom properties the theme generator accepts (TOKEN_NAMES in its build.mjs).',
    ' */',
    '',
    ':root {'
  ]
  for (const name of TOKEN_NAMES) {
    const source = provenance.find((p) => p.name === name)?.source ?? 'fallback'
    lines.push(`  ${`${name}:`.padEnd(width + 1)} ${tokens[name]}; /* ${source} */`)
  }
  lines.push('}', '', '/* Provenance — every token once; "measured" came from a contract rule or its token map,')
  lines.push(' * "fallback" from the fallback file and is a GUESS until a rule measures it.')
  lines.push(' *')
  lines.push(` * measured (${String(measured.length)}):`)
  for (const p of measured) lines.push(` *   ${p.name.padEnd(width)} ${p.detail}`)
  if (derived.length) {
    lines.push(` * derived (${String(derived.length)}):`)
    for (const p of derived) lines.push(` *   ${p.name.padEnd(width)} ${p.detail}`)
  }
  lines.push(` * fallback (${String(fallback.length)}):`)
  for (const p of fallback) lines.push(` *   ${p.name.padEnd(width)} ${p.detail}`)
  lines.push(' */', '')
  return lines.join('\n')
}

function main(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--contract' || a === '--out' || a === '--variant' || a === '--fallback') {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) {
        console.error(`${a} needs a value`)
        return 2
      }
      args[a.slice(2)] = v
      i += 1
    } else {
      console.error(`unknown argument ${a}`)
      return 2
    }
  }
  if (!args.contract || !args.out) {
    console.error(
      'usage: theme-tokens.mjs --contract <design-contract.json> --out tokens.css [--variant desktop-light] [--fallback <vendor tokens.css>]'
    )
    return 2
  }
  let contract
  try {
    contract = JSON.parse(readFileSync(args.contract, 'utf8'))
    validateDesign(contract)
  } catch (error) {
    console.error(`${args.contract}: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
  let fallback = null
  if (args.fallback) {
    try {
      fallback = parseTokensCss(readFileSync(args.fallback, 'utf8'))
    } catch (error) {
      console.error(`${args.fallback}: ${error instanceof Error ? error.message : String(error)}`)
      return 2
    }
    const holes = TOKEN_NAMES.filter((n) => typeof fallback[n] !== 'string')
    if (holes.length > 0) {
      console.error(`${args.fallback}: not a complete token file, missing ${holes.join(', ')}`)
      return 2
    }
  }
  const variant = args.variant ?? 'desktop-light'
  let result
  try {
    result = tokensFromContract(contract, {
      variant,
      fallback,
      fallbackLabel: args.fallback ? basename(resolve(args.fallback, '..')) + '/' + basename(args.fallback) : 'fallback'
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  if (result.missing.length > 0) {
    console.error(
      `${String(result.missing.length)} tokens have neither a measurement nor a fallback: ${result.missing.join(', ')}` +
        (args.fallback ? '' : ' — pass --fallback <vendor tokens.css>')
    )
    return 1
  }
  const css = renderTokensCss(result, {
    contractId: contract.id,
    revision: contract.revision,
    variant,
    contractPath: args.contract,
    fallbackPath: args.fallback ?? null
  })
  const back = parseTokensCss(css)
  const lost = TOKEN_NAMES.filter((n) => back[n] !== result.tokens[n])
  if (lost.length > 0) {
    console.error(`internal: the written file would not read back ${lost.join(', ')}`)
    return 2
  }
  writeFileSync(args.out, css)
  const count = (source) => result.provenance.filter((p) => p.source === source).length
  console.log(
    `theme-tokens: ${args.out}: 56 tokens, ${String(count('measured'))} measured, ${count('derived') ? `${String(count('derived'))} derived, ` : ''}${String(count('fallback'))} from the fallback`
  )
  return 0
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
