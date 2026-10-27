/**
 * The 56-token contract and the pure functions that turn one system's `tokens.css` into one
 * WordPress style variation — a LIBRARY, shared by `scripts/build.mjs` (154 variations baked into
 * the theme) and by the WordPress Build plugin (a brand's variation made at build time from
 * `Brand/<host>/tokens.css`, ADR 0023). No I/O here: `tokensOf(css)` and `variationOf(tokens,
 * meta)` are the same two calls on either side, which is what keeps a runtime-made variation
 * byte-compatible with a baked one.
 */
/** The 56 custom properties every vendored tokens.css declares (measured 07/09/2026 across all 152). */
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

/** Colour tokens → settings.color.palette; slug = name without the dashes. */
const COLORS = [
  ['--bg', 'Background'],
  ['--surface', 'Surface'],
  ['--surface-warm', 'Surface warm'],
  ['--fg', 'Foreground'],
  ['--fg-2', 'Foreground 2'],
  ['--muted', 'Muted'],
  ['--meta', 'Meta'],
  ['--border', 'Border'],
  ['--border-soft', 'Border soft'],
  ['--accent', 'Accent'],
  ['--accent-on', 'On accent'],
  ['--accent-hover', 'Accent hover'],
  ['--accent-active', 'Accent active'],
  ['--success', 'Success'],
  ['--warn', 'Warn'],
  ['--danger', 'Danger']
]
/** Font tokens → settings.typography.fontFamilies. */
const FONTS = [
  ['--font-display', 'display', 'Display'],
  ['--font-body', 'body', 'Body'],
  ['--font-mono', 'mono', 'Mono']
]
/** Size tokens → settings.typography.fontSizes; slugs are letters only, so no kebab-casing surprise. */
const SIZES = [
  ['--text-xs', 'xs', 'XS'],
  ['--text-sm', 'sm', 'SM'],
  ['--text-base', 'base', 'Base'],
  ['--text-lg', 'lg', 'LG'],
  ['--text-xl', 'xl', 'XL'],
  ['--text-2xl', 'xxl', '2XL'],
  ['--text-3xl', 'xxxl', '3XL'],
  ['--text-4xl', 'xxxxl', '4XL']
]
/** Space tokens → settings.spacing.spacingSizes; core itself uses digit slugs (20…80). */
const SPACES = ['1', '2', '3', '4', '5', '6', '8', '12'].map((n) => [`--space-${n}`, n])
/** Everything else → settings.custom, as a path; no digits anywhere in a key. */
const CUSTOM = {
  '--leading-body': ['leading', 'body'],
  '--leading-tight': ['leading', 'tight'],
  '--tracking-display': ['tracking', 'display'],
  '--section-y-desktop': ['sectionY', 'desktop'],
  '--section-y-tablet': ['sectionY', 'tablet'],
  '--section-y-phone': ['sectionY', 'phone'],
  '--radius-sm': ['radius', 'sm'],
  '--radius-md': ['radius', 'md'],
  '--radius-lg': ['radius', 'lg'],
  '--radius-pill': ['radius', 'pill'],
  '--elev-flat': ['elev', 'flat'],
  '--elev-ring': ['elev', 'ring'],
  '--elev-raised': ['elev', 'raised'],
  '--focus-ring': ['focusRing'],
  '--motion-fast': ['motion', 'fast'],
  '--motion-base': ['motion', 'base'],
  '--ease-standard': ['ease', 'standard'],
  '--container-max': ['container', 'max'],
  '--container-gutter-desktop': ['container', 'gutterDesktop'],
  '--container-gutter-tablet': ['container', 'gutterTablet'],
  '--container-gutter-phone': ['container', 'gutterPhone']
}

/** camelCase → kebab-case the way WordPress does for `custom` keys (no digits in ours). */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Token name → the WordPress CSS variable that carries it. */
export const WP_VAR = Object.freeze(
  Object.fromEntries([
    ...COLORS.map(([n]) => [n, `--wp--preset--color--${n.slice(2)}`]),
    ...FONTS.map(([n, slug]) => [n, `--wp--preset--font-family--${slug}`]),
    ...SIZES.map(([n, slug]) => [n, `--wp--preset--font-size--${slug}`]),
    ...SPACES.map(([n, slug]) => [n, `--wp--preset--spacing--${slug}`]),
    ...Object.entries(CUSTOM).map(([n, p]) => [n, `--wp--custom--${p.map(kebab).join('--')}`])
  ])
)

/**
 * Rewrite `var(--x)` inside a token value to the WordPress variable for x.
 * @param {string} value
 * @param {string} token - the token being rewritten, for the error message
 */
export function rewriteVars(value, token) {
  return value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g, (_, name) => {
    const wp = WP_VAR[name]
    if (!wp) throw new Error(`${token} references ${name}, which is not one of the 56 contract tokens`)
    return `var(${wp})`
  })
}

/**
 * One style variation from a system's 56 tokens.
 * @param {Record<string, string>} tokens - name → value, all 56 present
 * @param {{ id?: string, name: string }} meta
 */
export function variationOf(tokens, meta) {
  const missing = TOKEN_NAMES.filter((n) => typeof tokens[n] !== 'string')
  if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`)
  const v = (n) => rewriteVars(tokens[n], n)
  const custom = {}
  for (const [name, pathParts] of Object.entries(CUSTOM)) {
    let node = custom
    for (const part of pathParts.slice(0, -1)) node = node[part] ??= {}
    node[pathParts[pathParts.length - 1]] = v(name)
  }
  // The variation names its design system, so the theme can read which one the site wears out
  // of the merged global styles — whether it was applied by tracy_apply_inspiration() or picked
  // in the Site Editor, which writes the variation but knows nothing of the theme's options.
  if (meta.id) custom.tracy = { inspiration: meta.id }
  return {
    $schema: 'https://schemas.wp.org/wp/6.6/theme.json',
    version: 3,
    title: meta.name,
    settings: {
      color: { palette: COLORS.map(([n, label]) => ({ slug: n.slice(2), name: label, color: v(n) })) },
      typography: {
        fontFamilies: FONTS.map(([n, slug, label]) => ({ slug, name: label, fontFamily: v(n) })),
        fontSizes: SIZES.map(([n, slug, label]) => ({ slug, name: label, size: v(n) }))
      },
      spacing: { spacingSizes: SPACES.map(([n, slug]) => ({ slug, name: slug, size: v(n) })) },
      layout: { contentSize: v('--container-max'), wideSize: v('--container-max') },
      custom
    }
  }
}

/**
 * name → value of every custom property declared in a tokens.css. Comments are stripped first
 * (values carry trailing `/* alias *\/` notes); the first declaration of a name wins, so a
 * reduced-motion or per-language override nested later in the file does not replace the default.
 * @param {string} css
 * @returns {Record<string, string>}
 */
export function tokensOf(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = {}
  for (const match of code.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm)) {
    if (!(match[1] in tokens)) tokens[match[1]] = match[2].trim()
  }
  return tokens
}
