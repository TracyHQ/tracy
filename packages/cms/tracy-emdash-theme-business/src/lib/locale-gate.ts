/**
 * Where a request for a HIDDEN locale goes: the same page in the default locale.
 *
 * 🔒 WHY A REDIRECT AND NOT JUST UNPUBLISHED ENTRIES. `personalize` hides the languages a customer
 * did not choose by unpublishing their entries (as Joomla retires them, PR #267). That alone takes
 * a locale out of the switcher, the hreflang links and the sitemaps — all three list published
 * entries only — but not off its own URLs: EmDash answers `/ru/about` from the default locale's
 * entry when the Russian one is unpublished, and the page went out in English under `lang="ru"`
 * (measured on the E2E site of 22–23/09). A link someone kept, or a search result from before,
 * lands on the page it asked for, in the language the site does serve.
 *
 * Temporary (302), not permanent: a customer can switch the language back on, and a cached 301
 * would keep sending visitors away from it.
 *
 * Pure on purpose — no EmDash, no Vite JSON import — so a plain `node --test` can hold it.
 */
export interface LocaleGate {
  /** Every locale the template ships (`template.config.json`). */
  locales: readonly string[]
  /** The one served at the root, never prefixed and never hidden. */
  defaultLocale: string
  /** The locales the site serves right now: those whose site chrome is published. */
  served: readonly string[]
}

/** The first path segment when it names a locale the default is not: the only URLs a gate can move. */
export function prefixedLocale(
  pathname: string,
  gate: Pick<LocaleGate, 'locales' | 'defaultLocale'>
): string | null {
  const first = pathname.split('/').filter(Boolean)[0]
  return first !== undefined && first !== gate.defaultLocale && gate.locales.includes(first) ? first : null
}

/** `/ru/about?x=1` → `/about?x=1` when Russian is hidden; null when the URL may stay. */
export function hiddenLocaleRedirect(pathname: string, search: string, gate: LocaleGate): string | null {
  const locale = prefixedLocale(pathname, gate)
  if (locale === null || gate.served.includes(locale)) return null
  const rest = pathname.split('/').filter(Boolean).slice(1).join('/')
  return `/${rest}${search}`
}
