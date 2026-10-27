/**
 * Tailwind classes in a template's markup and components (Astro, TSX/JSX, PHP, HTML, `@apply` lines)
 * that hard-code a colour or a corner — `bg-white`, `text-[#F5F3EE]`, `rounded-md` — and the class
 * that reads the role variable instead, with the class's own value as the fallback, so the page
 * computes exactly what it did while no system is worn. PURE.
 */
import { parseColour } from './literals.mjs'
import { RADIUS_V3 } from './tailwind-config.mjs'

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const VARIANTS = String.raw`((?:[\w-]+:|\[[^\]\s]+\]:)*)`
const COLOUR_UTILITY = String.raw`(bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent)`
const ARBITRARY = String.raw`\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^\]\s]*\))\]`
const EDGE_L = String.raw`(?<=^|[\s"'\x60{(,])`
const EDGE_R = String.raw`(?=$|[\s"'\x60}),])`
const RADIUS_SIZES = 'none|xs|sm|md|lg|xl|2xl|3xl|4xl|full'
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const byLength = (names) => [...names].sort((a, b) => b.length - a.length).map(esc)

/** The class patterns, with a Tailwind 3 config's own colour names and radius sizes added. */
function patterns(config) {
  const extraColours = config
    ? byLength([...config.colours.keys()].filter((n) => !/^(white|black)$/.test(n)))
    : []
  const colourValue = `(white|black|(?:${PALETTE})-(?:50|[1-9]00|950)|${extraColours.length ? `${extraColours.join('|')}|` : ''}${ARBITRARY})`
  const sizes = config
    ? [
        ...new Set([
          ...RADIUS_SIZES.split('|'),
          ...byLength([...config.radius.keys()].filter((k) => k !== 'DEFAULT'))
        ])
      ]
    : RADIUS_SIZES.split('|')
  return {
    colour: new RegExp(
      `${EDGE_L}${VARIANTS}(!?)${COLOUR_UTILITY}-${colourValue}(\\/\\d+|\\/\\[[^\\]\\s]+\\])?(!?)${EDGE_R}`,
      'g'
    ),
    radius: new RegExp(
      `${EDGE_L}${VARIANTS}(!?)rounded(-(?:tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e))?(?:-(${byLength(sizes).join('|')}|\\[[^\\]\\s]+\\]))?(!?)${EDGE_R}`,
      'g'
    )
  }
}
const DEFAULT_PATTERNS = patterns(null)

/** Tailwind 4 default radius scale (the fallback when the theme does not set its own variable). */
const RADIUS_V4 = {
  xs: '0.125rem',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  '4xl': '2rem'
}

const kindOfUtility = (u) => {
  if (/^(text|placeholder|caret)$/.test(u)) return 'text'
  if (/^(bg|from|via|to|accent)$/.test(u)) return 'fill'
  if (/^(fill|stroke)$/.test(u)) return 'glyph'
  return 'line'
}

/** `/50` → 0.5, `/[0.35]` → 0.35. */
const opacityOf = (o) =>
  o.startsWith('/[') ? Number.parseFloat(o.slice(2, -1)) : Number.parseInt(o.slice(1), 10) / 100

/** A line that is only a comment does not paint anything. */
const isCommentLine = (text, at) => {
  const ls = text.lastIndexOf('\n', at - 1) + 1
  return /^\s*(\/\/|\*|\/\*|<!--|\{\/\*)/.test(text.slice(ls, at))
}

/**
 * @param {string} text  the whole file
 * @param {{ cssApplyOnly?: boolean, config?: { colours: Map<string, string>, radius: Map<string, string> } | null }} [opts]
 *   cssApplyOnly: a stylesheet, only its `@apply` lines hold classes; config: a Tailwind 3 theme
 *   (`tailwind-config.mjs`), whose own colour names and radius sizes are classes too
 * @returns {object[]} raw findings: offsets into `text`, the class, what it paints
 */
export function tailwindFindings(text, opts = {}) {
  const out = []
  const { colour: COLOUR_CLASS, radius: RADIUS_CLASS } = opts.config
    ? patterns(opts.config)
    : DEFAULT_PATTERNS
  const inApply = (at) => {
    const ls = text.lastIndexOf('\n', at - 1) + 1
    return /@apply\b/.test(text.slice(ls, at))
  }
  const lineAt = (at) => {
    const ls = text.lastIndexOf('\n', at - 1) + 1
    const le = text.indexOf('\n', at)
    return text.slice(ls, le === -1 ? text.length : le)
  }
  const ok = (at) => !isCommentLine(text, at) && (!opts.cssApplyOnly || inApply(at))
  for (const m of text.matchAll(COLOUR_CLASS)) {
    if (!ok(m.index)) continue
    const [token, variants, imp1, utility, value, opacity = '', imp2] = m
    const arbitrary = value.startsWith('[')
    const named = /^(white|black)$/.test(value)
    const own = !arbitrary && !named ? opts.config?.colours.get(value) : undefined
    const colour = arbitrary
      ? parseColour(value.slice(1, -1))
      : named
        ? parseColour(value)
        : own
          ? parseColour(own)
          : null
    out.push({
      source: 'tailwind',
      valueType: 'colour',
      start: m.index,
      end: m.index + token.length,
      text: token,
      tw: { variants, important: imp1 || imp2, utility, value, opacity, arbitrary, ...(own ? { own } : {}) },
      kind: kindOfUtility(utility),
      hex: colour?.hex ?? null,
      alpha: opacity ? opacityOf(opacity) : (colour?.alpha ?? 1),
      selector: `${variants}`,
      lineText: lineAt(m.index)
    })
  }
  for (const m of text.matchAll(RADIUS_CLASS)) {
    if (!ok(m.index)) continue
    const [token, variants, imp1, side = '', size = '', imp2] = m
    if (/var\(\s*--ds-/.test(size)) continue
    out.push({
      source: 'tailwind',
      valueType: 'radius',
      start: m.index,
      end: m.index + token.length,
      text: token,
      tw: { variants, important: imp1 || imp2, side, size },
      kind: 'radius',
      selector: `${variants}`,
      lineText: lineAt(m.index)
    })
  }
  return out
}

/**
 * The class's own value as a CSS fallback, or null when it cannot be told from the class alone.
 * @param {object} f a finding of `tailwindFindings` @param {number} major the Tailwind major version
 * @param {{ colours: Map<string, string>, radius: Map<string, string> } | null} [config] a Tailwind 3 theme
 */
export function tailwindFallback(f, major, config = null) {
  if (f.valueType === 'colour') {
    if (f.tw.arbitrary) return f.tw.value.slice(1, -1)
    if (major >= 4) return `var(--color-${f.tw.value})`
    // Tailwind 3 paints an opacity modifier (or a `bg-opacity-*` class beside it) through its own
    // channel variable: an arbitrary var() class cannot carry it, so such a class is not rewritten
    if (f.tw.opacity || /(^|\s)(bg|text|border|divide|placeholder|ring)-opacity-/.test(f.classString ?? ''))
      return null
    const own = config?.colours.get(f.tw.value)
    if (own && parseColour(own)) return own
    return f.tw.value === 'white' ? '#fff' : f.tw.value === 'black' ? '#000' : null
  }
  const size = f.tw.size
  if (size === 'none') return '0px'
  if (size.startsWith('[')) return size.slice(1, -1)
  if (major >= 4) {
    if (size === 'full') return 'calc(infinity * 1px)'
    return RADIUS_V4[size] ? `var(--radius-${size},${RADIUS_V4[size]})` : null
  }
  if (size === 'full') return '9999px'
  const scale = config?.radius ?? (major === 3 ? new Map(Object.entries(RADIUS_V3)) : null)
  const v = scale?.get(size || 'DEFAULT')
  return v && /^[\d.]+(px|rem|em|%)?$/.test(v.trim()) ? v.trim() : null
}

/** The class that reads `role`, with `fallback` as its value until a system sets the role. */
export function tailwindReplacement(f, role, fallback) {
  const { variants, important } = f.tw
  if (f.valueType === 'colour')
    return `${variants}${important}${f.tw.utility}-[color:var(${role},${fallback.replace(/\s+/g, '_')})]${f.tw.opacity}`
  return `${variants}${important}rounded${f.tw.side}-[var(${role},${fallback.replace(/\s+/g, '_')})]`
}

/** The Tailwind major version a template builds with, from its package.json (0 = no Tailwind). */
export function tailwindMajor(pkg) {
  const v = pkg?.devDependencies?.tailwindcss ?? pkg?.dependencies?.tailwindcss
  const m = /(\d+)/.exec(v ?? '')
  return m ? Number(m[1]) : 0
}
