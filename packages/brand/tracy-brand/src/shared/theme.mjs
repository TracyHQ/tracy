/**
 * What the user's choices turn into on dsh's theme service. Pure: no DOM, no context.
 *
 * Every value is a `{ light, dark }` pair of literal strings — the shape `ctx.theme.overrideTokens`
 * validates, and the shape that cannot form a CSS variable cycle.
 */
import { CODE_FONTS, DEFAULT_FONT, DEFAULT_PRIMARY, GLOBAL_FONTS } from './settings.mjs'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const both = (value) => ({ light: value, dark: value })

/** Accept `#rgb` / `#rrggbb`; anything else is the default accent. */
export function normalizePrimary(value) {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : DEFAULT_PRIMARY
}

/**
 * The accent: dsh's brand tokens plus Tracy's own `--primary`/`--ring`, so a dsh button and a
 * Tracy button agree. Hover shades are mixed at use time by the browser — literal strings, no
 * variables — darker on light backgrounds, lighter on dark ones.
 */
export function primaryTokens(value) {
  const color = normalizePrimary(value)
  return {
    '--dsw-alias-brand-primary': both(color),
    '--dsw-alias-brand-text': both(color),
    '--dsw-alias-button-primary-fill': both(color),
    '--dsw-alias-button-primary-hover': {
      light: `color-mix(in oklab, ${color} 88%, black)`,
      dark: `color-mix(in oklab, ${color} 88%, white)`
    },
    '--dsw-alias-button-primary-dimmed': both(`color-mix(in oklab, ${color} 55%, transparent)`),
    '--dsw-alias-brand-primary-invert': both('#ffffff'),
    '--dsw-alias-state-business-primary': both(color),
    '--primary': both(color),
    '--ring': both(color)
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
