/**
 * English baseline for the `tracy-mode-picker` namespace. This package OWNS the namespace: `en`
 * ships here, Vietnamese arrives from `@tracy/dsh-tracy-locale-vi`. `NS` lives beside `en` so
 * `check-dsh-locale` can find the owner.
 *
 * Role and group labels are UI chrome, not proper nouns, so they're translatable here. Platform
 * names (WordPress, Joomla, Emdash) are third-party/product names and stay literal in the
 * component — translating them would be a data-corruption bug, not localization.
 */
export const NS = 'tracy-mode-picker'

export const en = {
  'group.mode': 'Mode',
  'group.platform': 'Platform',
  'role.designer': 'Designer',
  'role.developer': 'Developer',
  'role.writer': 'Writer',
  'role.seo-geo': 'SEO/GEO',
  noDescription: 'No description',
  seatHint: 'Mode and platform for the next session',
  switchRefused: '{name} was refused: {reason}',
  lockedHint: 'This session already has history. Mode and platform only apply to a new session',
  'platform.adds': 'adds {tools} tool · {skills} skill',
  'platform.nothingYet': 'nothing yet: agents run on their mode alone',
  'platform.siteRuns': 'this site runs {platform}'
} as const

export type StringKey = keyof typeof en
export type Translate = (key: StringKey, vars?: Record<string, string>) => string

/** Read a string through the injected translator, or fall back to English when dsh hands none. */
export function fallback(t: Translate | undefined, key: StringKey, vars?: Record<string, string>): string {
  if (t) return t(key, vars)
  let text: string = en[key]
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v)
  return text
}
