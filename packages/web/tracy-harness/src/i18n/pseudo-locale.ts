/**
 * Dev-only pseudo language: each English value wrapped in «…», so any text on screen without the
 * guillemets never went through the dictionary. Callers reach it only behind `import.meta.env.DEV`
 * (`?lang=pseudo`), so a production bundle drops this module; it is not a real language: never
 * remembered, never in the switcher, never in INTERFACE_LANGUAGES.
 */
export const PSEUDO_LANGUAGE = 'pseudo'

export const isPseudo = (lang: unknown): boolean =>
  typeof lang === 'string' && lang.trim().toLowerCase() === PSEUDO_LANGUAGE

export const pseudoize = (value: string): string => `«${value}»`

export function pseudoTable(en: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(en).map(([key, value]) => [key, pseudoize(value)]))
}
