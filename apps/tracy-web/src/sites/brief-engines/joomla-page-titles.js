/**
 * The site name in every page title of a Joomla site the customer named (TCH #1013, D1): Global Configuration › Site Name in
 * Page Titles set to "after" (`sitename_pagetitles` = 2, "Page - Site") through the plugin's `site.identity` (Claude Cowork for
 * Joomla 0.24.5+). A template ships it off, so a site Tracy had named still read a bare "Contact" in every tab and result.
 *
 * 🔒 THE HOME TAB NEVER READS "NAME - NAME". Joomla adds the site name to a title that is not empty, whatever it says
 * (`HtmlView::setDocumentTitle`), and Tracy writes the owner's name into the home entry's own page title (`pageMetaSteps`,
 * `joomla-tidy.js`), so with the switch on the home tab would read the name twice. The home tab reads the name ALONE (spec
 * NAME-1): Joomla core cannot do that (an empty page title falls back to the entry's title, `SiteApplication::getParams`), so
 * the plugin does it (0.24.5, `lib/HomeTitle.php`): on the home entry's own page, a switch `site.identity` set, it takes the
 * page part off "Home - Name" or "Name - Name". Its mark rides the same apply id, so `apply.revert` takes it back too.
 * The home entry whose page title is the name alone is still emptied in the same apply: a page with no menu entry of its own
 * (a login form, a search result) is titled by the home entry, and the plugin leaves it, so it reads "Home - Name" rather
 * than "Name - Name".
 *
 * A plugin older than the key refuses the whole set naming it (`unsupported`) and writes nothing, so the key goes in a call of
 * its own, after the site name, and only to a plugin that has it.
 */
import { readMenu } from './joomla-tidy.js'

/** The first plugin release whose `site.identity` writes `sitename_pagetitles`. */
export const PAGE_TITLES_SINCE = '0.24.5'
/** "Page - Site": the site name after the page's own title. */
export const NAME_AFTER = 2

/** Text as one line, compared without case. */
const same = (/** @type {unknown} */ a, /** @type {string} */ b) =>
  String(a ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

/** A row's `params` as an object, whichever way the door hands it; null when it is neither. */
function paramsOf(/** @type {unknown} */ params) {
  try {
    const read = typeof params === 'string' ? JSON.parse(params) : params
    return read && typeof read === 'object' && !Array.isArray(read) ? read : null
  } catch {
    return null
  }
}

/**
 * Turn the site name on in page titles, then take the name off the home entries that carry it as their whole title.
 * Never throws: what did not happen is a skip.
 * @param {object} input
 * @param {string} input.name - the name just written as `sitename`
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.write - carries the apply id; a refusal throws
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.read
 * @param {(where: string) => void} input.wrote
 * @param {(where: string, reason: string) => void} input.skip
 * @returns {Promise<boolean>} whether the switch is on now
 */
export async function writePageTitles({ name, write, read, wrote, skip }) {
  try {
    await write('site.identity', { operation: 'set', fields: { sitename_pagetitles: NAME_AFTER } })
  } catch (error) {
    const answer = /** @type {any} */ (error)?.answer
    const old =
      answer?.error === 'unsupported' ||
      answer?.error === 'bad_action' ||
      /unknown action|unsupported/i.test(String(answer?.message ?? ''))
    skip(
      'page-titles',
      old
        ? 'plugin too old'
        : `the site refused the name in page titles (${error instanceof Error ? error.message : error})`
    )
    return false
  }
  wrote('page-titles')
  let menu
  try {
    menu = await readMenu(({ action, params }) => read(action, params), '')
  } catch (error) {
    skip(
      'home-title',
      `the menu could not be read, so the home tab may name the site twice (${error instanceof Error ? error.message : error})`
    )
    return true
  }
  for (const row of menu) {
    if (Number(row.home) !== 1) continue
    const params = paramsOf(row.params)
    if (!params || !same(params.page_title, name)) continue
    try {
      await write('content.update', {
        kind: 'menuItem',
        id: Number(row.id),
        fields: { params: JSON.stringify({ ...params, page_title: '' }) }
      })
      wrote('home-title')
    } catch (error) {
      skip(
        'home-title',
        `the home tab names the site twice: its title could not be changed (${error instanceof Error ? error.message : error})`
      )
    }
  }
  return true
}
