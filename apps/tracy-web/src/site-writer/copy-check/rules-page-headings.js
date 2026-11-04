// W13 (ADR 0042, decision of 2026-11-04): the title of a `pages` entry (a created legal page, the not-found page) is the
// heading printed on that page, never the browser title. The browser title lives in `seo`. A title with a " | " separator,
// or that ends with the business name, reads as a tab title and the template prints it as the page's main heading.
const SEPARATOR = ' | '
const BUSINESS_NAME_FIELD = /^(business[._])?name$/i

const said = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The business names the brief states: its facts whose field is the name. */
function businessNames(brief) {
  return (Array.isArray(brief?.facts) ? brief.facts : [])
    .filter((f) => f && BUSINESS_NAME_FIELD.test(String(f.field ?? '')) && typeof f.value === 'string')
    .map((f) => said(f.value))
    .filter(Boolean)
}

export function checkW13({ R, view, brief }) {
  const names = businessNames(brief)
  for (const p of view.pages) {
    const title = said(p.title)
    if (p.title.includes(SEPARATOR))
      R.w13.fail(
        `${p.page} (title)`,
        `${p.page}: title "${p.title}" holds a " | " separator: it is the heading on the page, the browser title goes in seo`,
        'browser-title'
      )
    else if (names.some((n) => title !== n && title.endsWith(n)))
      R.w13.fail(
        `${p.page} (title)`,
        `${p.page}: title "${p.title}" ends with the business name: it is the heading on the page, the browser title goes in seo`,
        'browser-title'
      )
    else R.w13.ok()
  }
}
