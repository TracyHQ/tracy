/**
 * What the user's choices turn into on dsh's theme service. Pure: no DOM, no context.
 *
 * Every value is a `{ light, dark }` pair of literal strings — the shape `ctx.theme.overrideTokens`
 * validates, and the shape that cannot form a CSS variable cycle.
 */
import { CODE_FONTS, DEFAULT_FONT, DEFAULT_PRIMARY, DEFAULT_PRIMARY_FILL, GLOBAL_FONTS } from './settings.mjs'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const both = (value) => ({ light: value, dark: value })

/** Accept `#rgb` / `#rrggbb`; anything else is the default accent. */
export function normalizePrimary(value) {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : DEFAULT_PRIMARY
}

/** Relative luminance of an accepted hex colour (WCAG 2). */
function luminance(hex) {
  const full =
    hex.length === 4
      ? '#' +
        hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

/** Keep the chosen hue where possible, moving towards black or white until contrast passes. */
function readable(color, background, minimum) {
  const bg = luminance(background)
  const ratio = (hex) => (Math.max(luminance(hex), bg) + 0.05) / (Math.min(luminance(hex), bg) + 0.05)
  if (ratio(color) >= minimum) return color
  const full =
    color.length === 4
      ? '#' +
        color
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : color
  const channels = [1, 3, 5].map((i) => Number.parseInt(full.slice(i, i + 2), 16))
  const target = bg > 0.179 ? 0 : 255
  for (let percent = 1; percent <= 100; percent++) {
    const shade =
      '#' +
      channels
        .map((c) =>
          Math.round(c + ((target - c) * percent) / 100)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    if (ratio(shade) >= minimum) return shade
  }
  return target ? '#ffffff' : '#000000'
}

/** Separate button fills, readable accent words and focus strokes from the chosen brand colour. */
export function primaryTokens(value) {
  const color = normalizePrimary(value)
  const chosen = color.toLowerCase() === DEFAULT_PRIMARY ? DEFAULT_PRIMARY_FILL : color
  const fill = readable(chosen, '#fafafa', 4.5)
  const text = { light: readable(chosen, '#ffffff', 4.5), dark: readable(chosen, '#262626', 4.5) }
  return {
    '--dsw-alias-brand-primary': both(color),
    '--dsw-alias-brand-text': text,
    '--dsw-alias-button-primary-fill': both(fill),
    '--dsw-alias-button-primary-hover': both(`color-mix(in oklab, ${fill} 88%, black)`),
    '--dsw-alias-button-primary-dimmed': both(`color-mix(in oklab, ${fill} 55%, transparent)`),
    '--dsw-alias-brand-primary-invert': both('#ffffff'),
    '--dsw-alias-state-business-primary': text,
    '--primary': both(fill),
    '--ring': { light: readable(color, '#ffffff', 3), dark: readable(color, '#262626', 3) }
  }
}

/** Font choice → dsh font tokens. Default contributes nothing so dsh keeps its own stack. */
export function fontTokens(globalId, codeId) {
  const out = {}
  const global = GLOBAL_FONTS.find((f) => f.id === globalId && f.id !== DEFAULT_FONT)
  const code = CODE_FONTS.find((f) => f.id === codeId && f.id !== DEFAULT_FONT)
  if (global) out['--dsw-font-family'] = both(global.family)
  if (code) out['--ds-font-family-code'] = both(code.family)
  return out
}

/** Google Fonts stylesheet URLs the current choice needs (empty for defaults). */
export function fontStylesheets(globalId, codeId) {
  const picks = [GLOBAL_FONTS.find((f) => f.id === globalId), CODE_FONTS.find((f) => f.id === codeId)]
  return picks
    .filter((f) => f && f.google)
    .map((f) => `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`)
}

/** One layer for `overrideTokens`: palette first, then accent, then fonts — later wins. */
export function composeLayer(palette, primary, globalFont, codeFont) {
  return { ...palette, ...primaryTokens(primary), ...fontTokens(globalFont, codeFont) }
}

/** Product name the dsh client bakes into `document.title`, and what it becomes here. */
export const DSH_PRODUCT_NAMES = ['DeepSeek Harness', 'DSH Local Build']
export const PRODUCT_NAME = 'Tracy Cowork'

/** Between the site and the rest of the browser title. */
const SITE_SEPARATOR = ' · '

/**
 * Rebrand a browser title, leaving the session part untouched.
 *
 * With a site, the title leads with it: switching sites opens one browser tab per site, and a
 * narrow tab shows only the first words, so every tab reading "Tracy Cowork" left the person
 * clicking through them to find a site. Idempotent, because dsh rewrites the title on every
 * session change and the observer runs again on our own write.
 * @param {string} title - the title as dsh wrote it.
 * @param {string | null} [siteKey] - the site this page works on, if any.
 * @returns {string} the title to show.
 */
export function brandTitle(title, siteKey = null) {
  let out = title
  for (const name of DSH_PRODUCT_NAMES) out = out.split(name).join(PRODUCT_NAME)
  if (!siteKey) return out
  const lead = `${siteKey}${SITE_SEPARATOR}`
  return out.startsWith(lead) ? out : `${lead}${out}`
}

/**
 * The site named by a page address: `/<siteKey>` or `/<siteKey>/…`. A siteKey is a hostname, so
 * its segment carries a dot; the root, `/login`, `/agent` and fleet labels do not.
 * @param {string} pathname - `location.pathname`.
 * @returns {string | null} the siteKey, or `null` when the address names no site.
 */
export function siteKeyFromPath(pathname) {
  const match = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/.exec(pathname)
  return match ? match[1] : null
}
