/**
 * REL-2: the Pages question lists every content page of the template, submenu pages included
 * (spec `tasks/spec-template-customization-question-readiness.md`, REL-2).
 *
 * A = the release's `tracy_site_pages.json`. B = the list REGENERATED from the release's own demo
 * content by the rule that writes the file (`../site-pages/`). The rule compares the two sets of
 * ids in BOTH directions. Checking only that each id of A names a real page, as the writer's
 * `--check` does, passes the old two-page JA Essence list (measured 09/10/2026), so it is not used.
 *
 * Fails when: (1) an id of B is not in A (a page is missing); (2) an id of A is not in B (a page no
 * longer on the main menu, or a system page); (3) the home of A is not the demo's real front page;
 * (4) an id of A names zero or several pages; (5) there is no file, or it fails `validateSitePages`
 * (which also holds it to exactly one `home: true`).
 */
import { SITE_PAGES_FILE, readSitePages } from '../../site-pages-schema.mjs'
import { UnreadableContent } from '../readers/release-content.js'
import { pagesFileFix } from '../readers/site-pages-of-release.js'
import { emdashMenu } from '../site-pages/emdash-menu.js'
import { joomlaMenu } from '../site-pages/joomla-menu.js'
import { wordpressMenu } from '../site-pages/wordpress-menu.js'

/**
 * The regenerated list and the index that tells how many pages an id names.
 * @param {import('../index.js').RuleContext} context
 * @param {(message: string) => void} warn
 */
async function regenerate(context, warn) {
  const { platform } = context.release
  if (platform === 'emdash') {
    const menu = emdashMenu(await context.content.siteModel())
    return { ...menu.build(warn), index: menu.index }
  }
  const sql = await context.content.sql()
  if (platform === 'joomla') {
    const menu = joomlaMenu(sql)
    return { ...menu.build(warn), index: menu.index }
  }
  const menu = wordpressMenu(sql)
  const header =
    menu.needsThemeHeader && menu.stylesheet
      ? await context.content.themeFile(menu.stylesheet, 'parts/header.html')
      : null
  return { ...menu.build(warn, header), index: menu.index }
}

const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`

const names = (/** @type {{ id: string, label: string }[]} */ pages) =>
  pages.map((p) => (p.label === p.id ? p.id : `${p.label} (${p.id})`)).join(', ')

export const rel2PageList = {
  id: 'REL-2',
  title: 'The Pages question lists every content page of the template, submenu pages included',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    const fix = pagesFileFix(context.release.tag)
    if (!(await context.source.names()).includes(SITE_PAGES_FILE))
      return { status: 'fail', message: `${name}: the release carries no ${SITE_PAGES_FILE}.`, fix }
    const { pages, pagesReason } = await readSitePages(SITE_PAGES_FILE, async (file) =>
      String(await context.source.read(file))
    )
    if (!pages) return { status: 'fail', message: `${name}: ${pagesReason}.`, fix }

    const details = []
    let generated
    try {
      generated = await regenerate(context, (m) => details.push(m))
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      const why = e instanceof Error ? e.message : String(e)
      return {
        status,
        message: `${name}: the page list cannot be regenerated from the demo content: ${why}.`,
        fix,
        details
      }
    }

    const listed = new Map(pages.map((p) => [p.id, p]))
    const expected = new Map(generated.pages.map((p) => [p.id, p]))
    const missing = generated.pages.filter((p) => !listed.has(p.id))
    const extra = pages.filter((p) => !expected.has(p.id))
    const problems = []
    if (missing.length) problems.push(`missing: ${names(missing)}`)
    if (extra.length) problems.push(`not a content page of the main menu: ${names(extra)}`)
    const home = pages.find((p) => p.home)
    if (home && home.id !== generated.index.home)
      problems.push(`home is "${home.id}" but the demo's front page is "${generated.index.home}"`)
    for (const p of pages) {
      const count = generated.index.count(p.id)
      if (count !== 1)
        problems.push(`"${p.id}" must name exactly one ${generated.index.what}, it names ${count}`)
    }
    if (problems.length === 0)
      return {
        status: 'pass',
        message: `${name}: ${SITE_PAGES_FILE} lists the ${pages.length} pages of the main menu, home "${home?.id}".`,
        details
      }
    return {
      status: 'fail',
      message: `${name} fails REL-2: ${SITE_PAGES_FILE} lists ${plural(pages.length, 'page')}, the main menu has ${generated.pages.length}; ${problems.join('; ')}.`,
      fix,
      details
    }
  }
}
