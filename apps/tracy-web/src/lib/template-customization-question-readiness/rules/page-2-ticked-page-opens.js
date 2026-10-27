/**
 * PAGE-2: a page the customer kept ticked opens normally, with its own content (spec
 * `tasks/spec-template-customization-question-readiness.md`, PAGE-2).
 *
 * The template's side is the demo trim map: it must not cut a page of `tracy_site_pages.json`, nor
 * the content that page needs to show.
 * - Joomla: a `hide` row of kind `menuItem` set to `0` whose content-map entity's path is a page of
 *   the list; a row of kind `article` for the article a listed page's menu item opens
 *   (`view=article&id=N`).
 * - WordPress: a `hide` row `page-<ID>` of a listed page, or of the posts page (`page_for_posts`).
 * - EmDash: `personalize.json` `hide` must be empty (the old rule is gone, `templateHideRules`
 *   returns []), and no `trim` rule may cut a page collection (`pages`, `*_page`).
 * A Joomla menu entry of a listed page that the trim unpublishes is NOT a failure (decided 12/10/2026, measured in
 * the code): Apply publishes every ticked page's entry again (`tickedMenuItems` in `brief-engines/picked-pages.js`,
 * written as `published: 1` before the tidy-up in `brief-engines/joomla.js`), and an unanswered Pages question ticks
 * every page (`pagesOfBrief`), so the page opens on every site. It is a note: Tracy Business j6 builds its trim map
 * with `scripts/build-joomla-demo-trim.mjs`, which hides every listing entry, and gate `joomla-demo-trim` holds it
 * byte for byte. A trimmed article a listed page opens still fails: Tracy does not bring an article back.
 * Whether the page then shows its own content is only known on a built site, and is mostly Tracy's.
 * Joomla also: articles of one category tied on the order Previous / Next follow fail, since an
 * article page's neighbours are then undefined (`page-2-tied-article-order.js`, g59 10/10/2026).
 */
import { demoTables } from '../readers/demo-tables.js'
import { contractEntities, releaseContract } from '../readers/contract-profile-of-release.js'
import { counted, findings, listed } from '../readers/rule-findings.js'
import { sitePagesOfRelease } from '../readers/site-pages-of-release.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { joomlaTiedArticleOrder } from './page-2-tied-article-order.js'

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f, /** @type {Set<string>} */ ids) {
  const contract = releaseContract(context)
  const trim = contract?.json('demo-trim-map.json')
  if (!trim) return
  const entities = new Map(contractEntities(contract).map((e) => [e.key, e]))
  const t = await demoTables(context)
  // The article each listed page's menu item opens.
  const opened = new Map()
  for (const r of t.rows('menu')) {
    const m = /option=com_content&view=article&id=(\d+)/.exec(String(r.link))
    if (m && Number(r.client_id) === 0 && ids.has(String(r.path))) opened.set(`article-${m[1]}`, r.path)
  }
  const cut = []
  const back = []
  for (const row of trim.hide ?? []) {
    if (row.kind === 'menuItem' && String(row.to) === '0') {
      const path = entities.get(row.key)?.identity?.path
      if (path && ids.has(path)) (row.field === 'published' ? back : cut).push(`${row.key} (${path})`)
    }
    if (row.kind === 'article' && opened.has(row.key))
      cut.push(`${row.key} (the article "${opened.get(row.key)}" opens)`)
  }
  if (back.length)
    f.note(
      `demo-trim-map.json unpublishes entries of listed pages that Apply publishes again when the page is ticked (tickedMenuItems): ${listed(back)}`
    )
  if (cut.length) {
    f.owner('contract')
    f.problem(`demo-trim-map.json cuts pages of the list: ${listed(cut)}`)
  }
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpress(context, f, /** @type {Set<string>} */ ids) {
  const trim = releaseContract(context)?.json('demo-trim-map.json')
  if (!trim) return
  const wp = await wordpressDemo(context)
  const pages = wp.pageById
  const pathOf = wp.pathOf
  const postsPage = String(wp.postsPage?.ID ?? '0')
  const cut = []
  for (const row of trim.hide ?? []) {
    const m = /^page-(\d+)$/.exec(String(row.key))
    if (!m) continue
    const page = pages.get(m[1])
    if (page && ids.has(pathOf(page))) cut.push(`${row.key} (${pathOf(page)})`)
    else if (m[1] === postsPage) cut.push(`${row.key} (the posts page)`)
  }
  if (cut.length) {
    f.owner('contract')
    f.problem(`demo-trim-map.json hides pages of the list: ${listed(cut)}`)
  }
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(context, f) {
  const text = (await templateSourceFiles(context)).get('seed/personalize.json')
  if (text === undefined) return
  const rules = JSON.parse(text)
  if (Array.isArray(rules.hide) && rules.hide.length)
    f.problem(
      `seed/personalize.json still has ${counted(rules.hide.length, 'hide rule', 'hide rules')}, which nothing reads any more`
    )
  const pageTrims = (rules.trim ?? []).filter((/** @type {any} */ r) =>
    /^pages$|_page$/.test(String(r.collection))
  )
  if (pageTrims.length)
    f.problem(
      `seed/personalize.json trims page collections: ${listed(pageTrims.map((/** @type {any} */ r) => r.collection))}`
    )
}

export const page2TickedPageOpens = {
  id: 'PAGE-2',
  title: 'A page the customer kept opens normally, with its own content',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-2')
    await f.part('the trim map', async () => {
      const a = await sitePagesOfRelease(context)
      if (!a.pages) {
        f.problem(a.reason)
        return
      }
      const ids = new Set(a.pages.map((p) => p.id))
      const { platform } = context.release
      if (platform === 'joomla') await joomla(context, f, ids)
      if (platform === 'wordpress') await wordpress(context, f, ids)
      if (platform === 'emdash') await emdash(context, f)
    })
    if (context.release.platform === 'joomla')
      await f.part('the article order', () => joomlaTiedArticleOrder(context, f))
    f.note('Whether a kept page shows its own content is only known on a built site, and is mostly Tracy.')
    return f.outcome({
      pass: 'the demo trim map cuts no page of the list and nothing such a page shows',
      fix: 'Take the rows that cut a listed page (or the content it shows) out of the trim map; cut only demo content no kept page needs. Give the articles of one category distinct dates (or ordering) so Previous / Next stay as in the demo.'
    })
  }
}
