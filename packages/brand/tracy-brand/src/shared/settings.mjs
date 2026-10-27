/**
 * The settings contract shared by the host half (volatile Config) and the browser half (rows +
 * theme layer). Plain JS so node --test can import it without a build.
 */

/**
 * The profile entry id of this plugin's row (`- id: tracy-brand` in both bundles). Since dsh 0.1.7
 * a settings form is addressed by ENTRY ID, not by a registered namespace: renaming the row id
 * silently detaches the rows from their values.
 */
export const SETTINGS_NS = 'tracy-brand'

/**
 * `globalThis` property the host half fills on every index render with the current values, so the
 * browser half can paint the right palette before (or without) the settings mirror.
 */
export const BOOT_GLOBAL = '__TRACY_BRAND__'

export const PRIMARY_FIELD = 'primaryColor'
export const GLOBAL_FONT_FIELD = 'globalFont'
export const CODE_FONT_FIELD = 'codeFont'

/**
 * Tracy terracotta — the one primary of the whole system, and what an empty preference means.
 * Akemi, 14/09/2026: the brand colour is not logo-only and not blue anymore; every primary
 * button, the send action, rings and selected borders carry it. tokens.css ships the same value.
 */
export const DEFAULT_PRIMARY = '#bf5b3d'

/** Font id meaning "leave dsh's own stack alone". */
export const DEFAULT_FONT = 'default'

/** Suggested accents. The first is the default (brand terracotta); the old Tracy blue stays as a choice. */
export const PRIMARY_SWATCHES = ['#bf5b3d', '#5b8def', '#00b96b', '#ef4444', '#f59e0b', '#8b5cf6']

/**
 * Fonts the Global font row offers. `google` is the css2 family query; the family stack is what
 * lands on `--dsw-font-family`. Every entry ships a Vietnamese subset on Google Fonts.
 */
export const GLOBAL_FONTS = [
  { id: DEFAULT_FONT, label: 'Default', family: null, google: null },
  { id: 'inter', label: 'Inter', family: "'Inter', sans-serif", google: 'Inter:wght@400;500;600;700' },
  {
    id: 'manrope',
    label: 'Manrope',
    family: "'Manrope', sans-serif",
    google: 'Manrope:wght@400;500;600;700'
  },
  {
    id: 'geist',
    label: 'Geist',
    family: "'Geist', sans-serif",
    google: 'Geist:wght@400;500;600;700'
  },
  { id: 'roboto', label: 'Roboto', family: "'Roboto', sans-serif", google: 'Roboto:wght@400;500;700' },
  {
    id: 'nunito-sans',
    label: 'Nunito Sans',
    family: "'Nunito Sans', sans-serif",
    google: 'Nunito+Sans:wght@400;600;700'
  }
]

/** Fonts the Code font row offers; they land on `--ds-font-family-code`. */
export const CODE_FONTS = [
  { id: DEFAULT_FONT, label: 'Default', family: null, google: null },
  {
    id: 'geist-mono',
    label: 'Geist Mono',
    family: "'Geist Mono', monospace",
    google: 'Geist+Mono:wght@400;500;700'
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: "'JetBrains Mono', monospace",
    google: 'JetBrains+Mono:wght@400;500;700'
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    family: "'Fira Code', monospace",
    google: 'Fira+Code:wght@400;500;700'
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    family: "'IBM Plex Mono', monospace",
    google: 'IBM+Plex+Mono:wght@400;500;700'
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    family: "'Source Code Pro', monospace",
    google: 'Source+Code+Pro:wght@400;500;700'
  }
]

/** Values used when neither the served page nor the settings form has supplied any yet. */
export const DEFAULT_SETTINGS = Object.freeze({
  [PRIMARY_FIELD]: '',
  [GLOBAL_FONT_FIELD]: DEFAULT_FONT,
  [CODE_FONT_FIELD]: DEFAULT_FONT
})

/**
 * Normalise an untrusted value (the boot global, a settings section) into the three string fields.
 * Anything missing or not a string falls back to the default, so a malformed page never throws in
 * the theme layer.
 * @param {unknown} raw
 * @returns {{ [k: string]: string }}
 */
export function brandSettingsFrom(raw) {
  const source = raw !== null && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  /** @type {{ [k: string]: string }} */
  const result = { ...DEFAULT_SETTINGS }
  for (const field of [PRIMARY_FIELD, GLOBAL_FONT_FIELD, CODE_FONT_FIELD]) {
    const value = source[field]
    if (typeof value === 'string') result[field] = value
  }
  return result
}
