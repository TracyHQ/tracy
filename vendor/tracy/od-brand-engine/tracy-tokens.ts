/**
 * Tracy's mapping: the engine's 218 `--brand-*` DesignTokens → the 56 tokens every one of the 152
 * vendored systems declares in `tokens.css` (spec-brand-engine §3.1). With this file a brand pulled
 * from a URL is a direction like the others: same cards, same dialog, same slots, same Guideline.
 *
 * Every line here is a DESIGN DECISION of Tracy's, not a fact from upstream — `test/tracy-tokens.test.mjs`
 * pins each one. The rule of thumb: colour and type come from the derived tokens; rhythm (containers,
 * section padding) takes the values the 152 systems agree on, because the engine has no notion of a
 * page section.
 */
import type { DesignTokens } from './src/engine/types.js'

/** The 56 names, in the order `tokens.css` files list them. `TRACY_TOKEN_NAMES.length === 56` is tested. */
export const TRACY_TOKEN_NAMES = [
  '--accent',
  '--accent-active',
  '--accent-hover',
  '--accent-on',
  '--bg',
  '--border',
  '--border-soft',
  '--container-gutter-desktop',
  '--container-gutter-phone',
  '--container-gutter-tablet',
  '--container-max',
  '--danger',
  '--ease-standard',
  '--elev-flat',
  '--elev-raised',
  '--elev-ring',
  '--fg',
  '--fg-2',
  '--focus-ring',
  '--font-body',
  '--font-display',
  '--font-mono',
  '--leading-body',
  '--leading-tight',
  '--meta',
  '--motion-base',
  '--motion-fast',
  '--muted',
  '--radius-lg',
  '--radius-md',
  '--radius-pill',
  '--radius-sm',
  '--section-y-desktop',
  '--section-y-phone',
  '--section-y-tablet',
  '--space-1',
  '--space-12',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  '--success',
  '--surface',
  '--surface-warm',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
  '--text-base',
  '--text-lg',
  '--text-sm',
  '--text-xl',
  '--text-xs',
  '--tracking-display',
  '--warn'
] as const

/** Rec.709 luma of a #rrggbb; 1 = white. */
function luma(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
  if (!m) return 0.5
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => Number.parseInt(c!, 16) / 255)
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const px = (n: number): string => `${Math.round(n)}px`

/**
 * The 56 values for a derived token set. `display` lets a brand with a distinct display face name
 * it (the Brand kit's `typography.display.family`); absent, display = body, as most extracted sites are.
 */
/** Does a font stack begin with this family, quoted or bare? */
function leadsWith(stack: string, family: string): boolean {
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
  return first.toLowerCase() === family.replace(/^["']|["']$/g, '').toLowerCase()
}

export function tracyTokens(t: DesignTokens, display?: string | null): Record<(typeof TRACY_TOKEN_NAMES)[number], string> {
  const body = t.fontFamily
  const h1 = t.fontSizeHeading1
  return {
    '--accent': t.colorPrimary,
    '--accent-active': t.colorPrimaryActive,
    '--accent-hover': t.colorPrimaryHover,
    // Type on the accent: white on a dark accent, near-black on a light one.
    '--accent-on': luma(t.colorPrimary) > 0.6 ? '#111111' : '#ffffff',
    '--bg': t.colorBgLayout,
    '--border': t.colorBorder,
    '--border-soft': t.colorBorderSecondary,
    '--container-gutter-desktop': '32px',
    '--container-gutter-phone': '16px',
    '--container-gutter-tablet': '24px',
    '--container-max': '1200px',
    '--danger': t.colorError,
    '--ease-standard': t.motionEaseInOut,
    '--elev-flat': 'none',
    '--elev-raised': `0 1px 2px ${t.colorFillSecondary}, 0 8px 24px ${t.colorFillTertiary}`,
    '--elev-ring': `0 0 0 1px ${t.colorBorder}`,
    '--fg': t.colorText,
    '--fg-2': t.colorTextSecondary,
    '--focus-ring': `0 0 0 2px ${t.colorPrimaryBorder}`,
    '--font-body': body,
    // Prepend the display face only when the body stack does not already lead with it: a brand whose
    // display and body are one family (most extracted sites) would otherwise read `Poppins, Poppins, …`.
    '--font-display':
      display && display.trim() !== '' && !leadsWith(body, display.trim()) ? `${display}, ${body}` : body,
    '--font-mono': t.fontFamilyCode,
    '--leading-body': String(t.lineHeight),
    '--leading-tight': String(t.lineHeightHeading),
    '--meta': t.colorTextQuaternary,
    '--motion-base': t.motionDurationMid,
    '--motion-fast': t.motionDurationFast,
    '--muted': t.colorTextTertiary,
    '--radius-lg': px(t.borderRadiusLG),
    '--radius-md': px(t.borderRadius),
    '--radius-pill': '9999px',
    '--radius-sm': px(t.borderRadiusSM),
    '--section-y-desktop': '96px',
    '--section-y-phone': '48px',
    '--section-y-tablet': '64px',
    '--space-1': px(t.sizeXXS),
    '--space-12': px(t.sizeXXL * 1.5),
    '--space-2': px(t.sizeXS),
    '--space-3': px(t.sizeSM),
    '--space-4': px(t.size),
    '--space-5': px(t.sizeMD),
    '--space-6': px(t.sizeLG),
    '--space-8': px(t.sizeXL),
    '--success': t.colorSuccess,
    '--surface': t.colorBgContainer,
    '--surface-warm': t.colorBgElevated,
    '--text-2xl': px(t.fontSizeHeading3),
    '--text-3xl': px(t.fontSizeHeading2),
    // The 152 systems set their display ceiling at 48–96px; the engine's Heading1 is a UI size (~38px).
    '--text-4xl': px(Math.max(48, h1 * 1.5)),
    '--text-base': px(t.fontSize),
    '--text-lg': px(t.fontSizeLG),
    '--text-sm': px(t.fontSizeSM),
    '--text-xl': px(t.fontSizeXL),
    '--text-xs': px(Math.max(11, t.fontSizeSM - 2)),
    '--tracking-display': '-0.02em',
    '--warn': t.colorWarning
  }
}

/** `tokens.css` in the shape the 152 systems ship: one `:root` block, names sorted as they list them. */
export function tracyTokensCss(t: DesignTokens, display?: string | null): string {
  const values = tracyTokens(t, display)
  const lines = TRACY_TOKEN_NAMES.map((name) => `  ${name}: ${values[name]};`)
  return `:root {\n${lines.join('\n')}\n}\n`
}
