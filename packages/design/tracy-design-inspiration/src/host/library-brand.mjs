/**
 * A library inspiration as a `Brand` for the OpenDesign brand engine — so its six sample products
 * (landing · deck · poster · email · newsletter · form) can be BUILT the way a customer's own brand's
 * are (Brand builder), instead of served from what upstream ships in `system/artifacts/`: a 6 KB hero
 * card per kind, the same skeleton for all six (measured 06/09 on Airbnb, Revolut, and upstream `main`).
 *
 * Everything the engine needs is in the inspiration's own files: the palette and faces in `tokens.css`,
 * the tagline in `DESIGN.md`, the name and category in the catalog. Deterministic, no network, no
 * model — the same shape `brandFromMaterial` builds for a fetched site. Pure; `index.ts` caches the
 * built system per process.
 */

/**
 * @typedef {import('@tracy/od-brand-engine').Brand} Brand
 * @typedef {import('@tracy/od-brand-engine').BrandColor} BrandColor
 */

const SANS_FALLBACK = ['ui-sans-serif', 'system-ui', 'sans-serif']
const MONO_FALLBACK = ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']

/** The value of one custom property in a tokens.css, or null. Multi-line values (font stacks) included. @param {string} css @param {string} name */
export function tokenValue(css, name) {
  const m = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(css)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

/** `#rrggbb` lowercase, or null when the token is not a plain hex (a var() alias, an rgb()). @param {string} css @param {string} name */
function hex(css, name) {
  const v = tokenValue(css, name)
  if (!v) return null
  const m = /^#([0-9a-f]{6})\b/i.exec(v)
  if (m) return `#${m[1].toLowerCase()}`
  const short = /^#([0-9a-f]{3})\b/i.exec(v)
  return short
    ? `#${short[1]
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()}`
    : null
}

/** The first family of a font stack, unquoted. @param {string | null | undefined} stack */
export function firstFamily(stack) {
  const first = (stack ?? '').split(',')[0]?.trim() ?? ''
  return first.replace(/^["']|["']$/g, '')
}

/** The tagline of a library DESIGN.md: the first blockquote line that is not the category/surface note. @param {string | null | undefined} designMd */
export function taglineOf(designMd) {
  for (const line of (designMd ?? '').split('\n')) {
    const m = /^>\s*(.+)$/.exec(line.trim())
    if (!m) continue
    const text = m[1].trim()
    if (/^(Category|Surface)\s*:/i.test(text)) continue
    return text
  }
  return ''
}

/** A radius token as the engine's layout string (`14px`); `8px` when the inspiration has none. @param {string} css */
function radiusOf(css) {
  const v = tokenValue(css, '--radius-md') ?? tokenValue(css, '--radius-sm')
  return v && /^\d+(\.\d+)?(px|rem)$/.test(v) ? v : '8px'
}

/**
 * What the inspiration says beyond the Brand shape, laid over the engine's seed: its own text
 * colour on the accent (`--accent-on`), so the engine's buttons read the way the system's own
 * fixture does — the engine derives one by contrast when a system (or a brand pulled from a URL)
 * has none.
 * @param {{ tokensCss: string }} system
 * @returns {{ colorPrimaryContrast?: string }}
 */
export function seedOverridesFromSystem(system) {
  const on = hex(system.tokensCss, '--accent-on')
  return on ? { colorPrimaryContrast: on } : {}
}

/**
 * @param {{ id: string, name: string, category?: string, description?: string, tokensCss: string, designMd?: string }} system
 * @returns {Brand}
 */
export function brandFromSystem(system) {
  const css = system.tokensCss
  const bg = hex(css, '--bg') ?? '#ffffff'
  const fg = hex(css, '--fg') ?? '#111111'
  const accent = hex(css, '--accent') ?? fg
  /** @type {BrandColor[]} */
  const colors = [
    { role: 'background', hex: bg, oklch: '', name: 'Background', usage: 'page canvas' },
    {
      role: 'surface',
      hex: hex(css, '--surface') ?? bg,
      oklch: '',
      name: 'Surface',
      usage: 'cards / raised surfaces'
    },
    { role: 'foreground', hex: fg, oklch: '', name: 'Foreground', usage: 'body text' },
    { role: 'muted', hex: hex(css, '--muted') ?? fg, oklch: '', name: 'Muted', usage: 'secondary text' },
    {
      role: 'border',
      hex: hex(css, '--border') ?? fg,
      oklch: '',
      name: 'Border',
      usage: 'hairlines / dividers'
    },
    { role: 'accent', hex: accent, oklch: '', name: 'Accent', usage: 'primary brand color' }
  ]
  const secondary = hex(css, '--accent-hover')
  if (secondary && secondary !== accent) {
    colors.push({
      role: 'accent-secondary',
      hex: secondary,
      oklch: '',
      name: 'Accent secondary',
      usage: 'hover / links'
    })
  }
  const display = firstFamily(tokenValue(css, '--font-display')) || 'Inter'
  const body = firstFamily(tokenValue(css, '--font-body')) || display
  const mono = firstFamily(tokenValue(css, '--font-mono'))
  return {
    name: system.name,
    tagline: taglineOf(system.designMd) || system.category || '',
    description: system.description ?? '',
    // Where this design can be opened: the public design inspirations page. The artifact footers
    // link their "Inspired by" credit here, so a site built on a design says where it came from.
    sourceUrl: `https://cowork.tracy.ai/design-inspiration/${system.id}`,
    logo: { primary: null, alternates: [], notes: 'library inspiration: no logo' },
    colors,
    typography: {
      display: { family: display, fallbacks: SANS_FALLBACK, weights: [400, 700] },
      body: { family: body, fallbacks: SANS_FALLBACK, weights: [400, 700] },
      ...(mono ? { mono: { family: mono, fallbacks: MONO_FALLBACK, weights: [400] } } : {})
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [] },
    layout: { radius: radiusOf(css), borderWeight: '1px', spacing: '8px baseline grid', postureRules: [] }
  }
}
