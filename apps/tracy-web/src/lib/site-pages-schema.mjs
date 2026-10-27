/**
 * `tracy_site_pages.json` — the pages a released template has, as the release itself says.
 *
 *   { "pages": [ { "id": "home-3", "label": "Home", "home": true }, { "id": "about", "label": "About" } ] }
 *
 * 🔒 THE LIST TRAVELS WITH THE TEMPLATE, NOT WITH TRACY. A template's pages change whenever its
 * menu does, so the release tool writes this file from the restored site (every content page of the
 * main menu at any depth, no system page, no other demo of the home page — WordPress: the header
 * navigation; Joomla: `mainmenu`; EmDash: `menus[primary]` in `seed/site-model.json`) and attaches it
 * beside `tracy_setting.json`.
 * Tracy only reads it: the Pages question offers these pages, and the engines hide, by `id`, the
 * ones the customer unticked.
 *
 * `id` is what the engine hides by: a WordPress page path (`get_page_uri`), a Joomla `mainmenu`
 * entry's path (`product/features`; a level-1 entry's path is its alias), an EmDash page slug. `home: true` marks the one page that is never hidden (WordPress: the `page_on_front`
 * page, whatever its slug). `label` is the page as the menu names it.
 *
 * Shared by the release reader (`quickstart-releases.js`), the local pack reader
 * (`local-releases.js`) and the `design-templates` gate, so a file that reads in one reads in all.
 */

/** The release asset this file is attached as. */
export const SITE_PAGES_FILE = 'tracy_site_pages.json'

const PAGE_FIELDS = new Set(['id', 'label', 'home'])
const nonEmpty = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== ''

/**
 * Every way the document is wrong, as sentences. Empty is valid. Never throws.
 * @param {unknown} doc the parsed file
 * @returns {string[]}
 */
export function validateSitePages(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc))
    return ['the file must be an object { pages: [...] }']
  const problems = []
  for (const key of Object.keys(doc)) if (key !== 'pages') problems.push(`unknown field "${key}"`)
  const pages = /** @type {any} */ (doc).pages
  if (!Array.isArray(pages) || pages.length === 0) return [...problems, 'pages must be a non-empty list']
  const seen = new Set()
  let homes = 0
  pages.forEach((page, i) => {
    const at = `pages[${i}]`
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      problems.push(`${at} must be an object { id, label, home? }`)
      return
    }
    for (const key of Object.keys(page))
      if (!PAGE_FIELDS.has(key)) problems.push(`${at}: unknown field "${key}"`)
    if (!nonEmpty(page.id)) problems.push(`${at}: id must be a non-empty string`)
    else if (seen.has(page.id)) problems.push(`${at}: id "${page.id}" is listed twice`)
    else seen.add(page.id)
    if (!nonEmpty(page.label)) problems.push(`${at}: label must be a non-empty string`)
    if (page.home !== undefined && page.home !== true) problems.push(`${at}: home may only be true`)
    if (page.home === true) homes += 1
  })
  if (homes !== 1) problems.push(`exactly one page must be home: true (found ${homes})`)
  return problems
}

/**
 * A release's (or a local pack's) `tracy_site_pages.json`, read and held to its validator: the pages, or why there are
 * none. No file is no pages and no reason — the gate, not the reading, says a template lacks one.
 * @template A
 * @param {A | null} asset the asset, or null when the release carries none
 * @param {(asset: A) => Promise<string>} textOf how to read its bytes
 * @returns {Promise<{ pages: any[] | null, pagesReason: string | null }>}
 */
export async function readSitePages(asset, textOf) {
  if (!asset) return { pages: null, pagesReason: null }
  try {
    const doc = JSON.parse(await textOf(asset))
    const problems = validateSitePages(doc)
    if (problems.length === 0) return { pages: doc.pages, pagesReason: null }
    return { pages: null, pagesReason: `${SITE_PAGES_FILE}: ${problems.join('; ')}` }
  } catch (e) {
    return {
      pages: null,
      pagesReason: `${SITE_PAGES_FILE} could not be read: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

/**
 * The pages of a release as last read, or null when it ships no valid file.
 * @param {{ pages?: unknown } | null | undefined} release a row from `readReleases`
 * @returns {{ id: string, label: string, home?: true }[] | null}
 */
export function pagesOf(release) {
  const pages = release?.pages
  return Array.isArray(pages) && pages.length > 0 ? pages : null
}
