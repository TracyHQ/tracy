/**
 * The release's own page list (`tracy_site_pages.json`, list A of the spec) together with the
 * index the REL-2 readers build from its demo content, for the PAGE rules that ask what one page
 * id stands for (PAGE-1, PAGE-2, PAGE-4, PAGE-7):
 *
 *   const a = await sitePagesOfRelease(context)
 *   a.pages            // [{ id, label, home? }], or null when the release carries no valid list
 *   a.reason           // why `pages` is null
 *   a.count(id)        // how many demo pages the id names (REL-2's index), or null when unread
 *   a.home             // the demo's front page id
 *   a.paths(id)        // EmDash: the menu paths that open the page record `id` (`services_page` → ['services']); null elsewhere
 *
 * A missing or invalid list is REL-2's failure; the PAGE rules say so and check nothing more.
 */
import { SITE_PAGES_FILE, readSitePages } from '../../site-pages-schema.mjs'
import { emdashMenu } from '../site-pages/emdash-menu.js'
import { joomlaMenu } from '../site-pages/joomla-menu.js'
import { wordpressMenu } from '../site-pages/wordpress-menu.js'

/** @type {WeakMap<object, Promise<any>>} */
const memo = new WeakMap()

const RELEASES_REPO = 'JoomlArt-Products/joomlart-products'

/**
 * How to write the pages file again, for REL-2 and every PAGE rule that cannot read it. The tool is
 * only on the draft branch feat/site-pages-file of the tracy-template-dev repository (draft PR #1,
 * not merged); the released tracy-dev 0.7.1 answers `site-pages` with "unknown command" (measured
 * 12/10/2026), so the fix names the branch and the script, as the /ops polish prompt does.
 * @param {string | null} tag
 */
export function pagesFileFix(tag) {
  const tool =
    'the site-pages tool, which is only on the draft branch feat/site-pages-file of the tracy-template-dev repository (draft PR #1; the released tracy-dev 0.7.1 does not have it)'
  if (!tag || tag.startsWith('local/'))
    return `Make ${SITE_PAGES_FILE} again with ${tool}, from this pack's database or source, and replace the file in the pack.`
  return `Make ${SITE_PAGES_FILE} with ${tool}: in a checkout of that branch run node plugins/tracy-dev/lib/site-pages.mjs --release '${tag}' --out . and then gh release upload '${tag}' ${SITE_PAGES_FILE} --clobber -R ${RELEASES_REPO}. No new release is needed: the webroot and database do not change.`
}

/** @param {import('../index.js').RuleContext} context */
async function read(context) {
  /** @type {{ id: string, label: string, home?: true }[] | null} */
  let pages = null
  let reason = `the release carries no ${SITE_PAGES_FILE} (see REL-2)`
  if ((await context.source.names()).includes(SITE_PAGES_FILE)) {
    const got = await readSitePages(SITE_PAGES_FILE, async (file) => String(await context.source.read(file)))
    pages = got.pages ?? null
    if (!pages) reason = `${got.pagesReason} (see REL-2)`
  }
  const { platform } = context.release
  const index =
    platform === 'emdash'
      ? emdashMenu(await context.content.siteModel()).index
      : platform === 'joomla'
        ? joomlaMenu(await context.content.sql()).index
        : wordpressMenu(await context.content.sql()).index
  const paths = 'paths' in index ? index.paths : null
  return { pages, reason, count: index.count, home: index.home, paths }
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ pages: { id: string, label: string, home?: true }[] | null, reason: string, count: (id: string) => number, home: string | null, paths: ((id: string) => string[]) | null }>}
 */
export function sitePagesOfRelease(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<any>} */ (memo.get(context))
}
