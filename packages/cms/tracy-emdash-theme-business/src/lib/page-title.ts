// The tab title of a page (TCH #1013, NAME-1 and NAME-2).
//
// 🔒 THE HOME TAB NAMES THE BUSINESS ALONE, once the site has a name of its own: "Tamarind Bakery", as Joomla and
// WordPress print it. Every other page reads "Page — Name". The template as released keeps "Home — Northgate
// Industrial": a blank name answer leaves the template as it is, and the seed's `settings.title` is the demo's name.
//
// Pure on purpose, so a plain `node --test` can hold the rule (tests/page-title.test.mjs).

/** The demo company's name: the seed's `settings.title`, and the title a site with none falls back to. */
export const TEMPLATE_NAME = 'Northgate Industrial'

/** The site name the page shows: core `settings.title`, or the demo's when none is set. */
export function siteTitleOf(title: string | null | undefined): string {
  const own = typeof title === 'string' ? title.trim() : ''
  return own || TEMPLATE_NAME
}

/** The `<title>` of a page: the name alone on the home page of a site with a name of its own, else "Page — Name". */
export function pageTitleOf({
  title,
  siteTitle,
  home
}: {
  title: string
  siteTitle: string | null | undefined
  home: boolean
}): string {
  const name = siteTitleOf(siteTitle)
  if (home && name !== TEMPLATE_NAME) return name
  return `${title} — ${name}`
}
