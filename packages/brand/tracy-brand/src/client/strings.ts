/**
 * English baseline for the `tracy-brand` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 *
 * `NS` lives beside `en` on purpose: `check-dsh-locale` finds namespace owners by reading the
 * exported `NS` of each `strings.ts`.
 */
export const NS = 'tracy-brand'

export const en = {
  /** Beside the mark on a site's blank conversation, inviting the first request (Akemi, 29/09). */
  'hero.title': 'What would you like to change today?',
  /** Row title: the accent colour. */
  'primary.title': 'Primary color',
  /** Row description under the title. */
  'primary.description': 'Accent for buttons, links and selection',
  /** aria-label of the hex input. */
  'primary.hex': 'Hex color',
  /** aria-label of one suggested swatch; {color} is its hex. */
  'primary.swatch': 'Use {color}',
  /** Row title: interface font. */
  'font.global.title': 'Global font',
  /** Row description. */
  'font.global.description': 'Text across the interface',
  /** Row title: monospace font. */
  'font.code.title': 'Code font',
  /** Row description. */
  'font.code.description': 'Code blocks and the terminal',
  /** Select option meaning "keep the built-in font". */
  'font.default': 'Default',
  /** Font size row — replaces dsh's stepper with Tracy's compact one; same wording as dsh's. */
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  /** aria-label of the minus button. */
  'fontSize.decrease': 'Decrease font size',
  /** aria-label of the plus button. */
  'fontSize.increase': 'Increase font size',
  /** Appearance row — replaces dsh's three cubes with three window thumbnails. */
  'appearance.title': 'Appearance',
  /** Caption of the light-theme thumbnail. */
  'appearance.light': 'Light',
  /** Caption of the dark-theme thumbnail. */
  'appearance.dark': 'Dark',
  /** Caption of the thumbnail that follows the computer's setting. */
  'appearance.system': 'System'
} as const

export type BrandKey = keyof typeof en
