/**
 * PAGE-7: the child articles of an unticked page no longer open, except those a kept page still
 * lists (spec `tasks/spec-template-customization-question-readiness.md`, PAGE-7).
 *
 * The template's side is that "which page lists which articles" is readable as data:
 * - WordPress: a listed page lists children through child pages, the posts page (`page_for_posts`)
 *   or a `core/query` block (readable; Tracy only acts on the posts page yet, noted). A page that
 *   lists posts through a theme block rendered in PHP or a shortcode fails: nobody can tell which
 *   posts belong to it. Category and tag archives are Tracy's (D4).
 * - Joomla: a listed page whose menu item opens `com_content` lists its children through categories. A
 *   page that opens another component (JA Resort's Rooms, `com_solidres`, its booking engine) is a page
 *   like any other (12/10/2026): the Pages answer keeps or drops it by its menu entry
 *   (`brief-engines/picked-pages.js`), and the component's own items are not articles Tracy hides, so
 *   it is a note, never a failure.
 * - EmDash: the theme has the map of children a kept page still lists (`src/lib/listed-children.ts`)
 *   and the link gate whose `RECORDS` table names every listed page (`src/lib/link-gate.ts`).
 * Whether a child really answers 404 is only known on a built site.
 */
import { linkGateRecords, pagesOutsideLinkGate } from '../readers/emdash-link-gate.js'
import { demoTables } from '../readers/demo-tables.js'
import { counted, findings, listed } from '../readers/rule-findings.js'
import { pagesFileFix, sitePagesOfRelease } from '../readers/site-pages-of-release.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'

/** Joomla components whose pages have no child items of their own. */
const NO_CHILDREN = /^com_(contact|users|finder|search|tags|privacy|config|wrapper|ajax|mailto)$/
/** A theme block or shortcode that reads as a list of posts. */
const LISTING =
  /(^|[-_])(posts|post-list|recent-posts|query|blog|articles|article-list|news|feed|loop|listing|latest)([-_]|$)/i

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpress(context, f, /** @type {string[]} */ ids) {
  const wp = await wordpressDemo(context)
  const pages = [...wp.pageById.values()]
  const pathOf = wp.pathOf
  const postsPage = String(wp.postsPage?.ID ?? '0')
  const queries = []
  const opaque = []
  for (const p of pages.filter((x) => x.post_status === 'publish' && ids.includes(pathOf(x)))) {
    const content = String(p.post_content ?? '')
    if (String(p.ID) === postsPage) continue
    if (/<!-- wp:query\s+\{[^]*?"inherit":false/.test(content)) queries.push(pathOf(p))
    const blocks = [...content.matchAll(/<!-- wp:([a-z0-9-]+\/[a-z0-9-]+)/g)].map((m) => m[1])
    const custom = [...new Set(blocks.filter((b) => !b.startsWith('core/') && LISTING.test(b.split('/')[1])))]
    const shortcodes = [
      ...new Set(
        [...content.matchAll(/\[([a-z0-9_-]+)[\s\]]/g)].map((m) => m[1]).filter((s) => LISTING.test(s))
      )
    ]
    if (custom.length || shortcodes.length)
      opaque.push(`${pathOf(p)} (${[...custom, ...shortcodes.map((s) => `[${s}]`)].join(', ')})`)
  }
  if (opaque.length) f.problem(`pages that list posts in a way no data says which: ${listed(opaque)}`)
  if (queries.length)
    f.note(
      `${counted(queries.length, 'listed page lists', 'listed pages list')} posts with a core/query block (${listed(queries)})${postsPage === '0' ? ' and the site sets no posts page' : ''}: readable, but Tracy only drafts the posts of page_for_posts yet.`
    )
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f, /** @type {string[]} */ ids) {
  const t = await demoTables(context)
  const items = t.rows('menu').filter((r) => Number(r.client_id) === 0 && Number(r.published) === 1)
  const foreign = []
  const lists = new Map()
  for (const id of ids) {
    for (const r of items.filter((x) => String(x.path || x.alias) === id && x.type === 'component')) {
      const component = /option=(com_[a-z0-9_]+)/.exec(String(r.link))?.[1] ?? ''
      if (component !== 'com_content' && !NO_CHILDREN.test(component))
        foreign.push(`${id} (${component || r.link})`)
      const category = /view=(?:category|blog)&(?:layout=[^&]*&)?id=(\d+)/.exec(String(r.link))?.[1]
      if (component === 'com_content' && category) lists.set(category, [...(lists.get(category) ?? []), id])
    }
  }
  if (foreign.length)
    f.note(
      `pages that open a component other than com_content, kept or dropped by their menu entry like any page; the component's own items (rooms, listings) are not hidden with them: ${listed(foreign)}`
    )
  for (const [category, pages] of lists)
    if (pages.length > 1)
      f.note(
        `Category ${category} is listed by ${pages.join(' and ')}: its articles stay while either is kept.`
      )
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(
  context,
  f,
  /** @type {string[]} */ ids,
  /** @type {((id: string) => string[]) | null} */ pathsOf
) {
  const files = await templateSourceFiles(context)
  if (!files.has('src/lib/listed-children.ts'))
    f.problem(
      'the theme has no src/lib/listed-children.ts, so nothing says which children a kept page still lists'
    )
  const keys = linkGateRecords(files)
  if (!keys) {
    f.problem('the theme has no src/lib/link-gate.ts')
    return
  }
  const absent = pagesOutsideLinkGate(ids, keys, pathsOf)
  if (absent.length)
    f.problem(
      `listed pages whose menu path is missing from the RECORDS table of src/lib/link-gate.ts: ${listed(absent)}`
    )
}

export const page7ChildrenOfUntickedPage = {
  id: 'PAGE-7',
  title: 'Child articles of an unticked page no longer open, unless a kept page lists them',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-7')
    // A missing or refused page list is REL-2's failure, and so is its fix.
    let noList = false
    await f.part('the page list and demo content', async () => {
      const a = await sitePagesOfRelease(context)
      if (!a.pages) {
        f.problem(a.reason)
        noList = true
        return
      }
      const ids = a.pages.filter((p) => !p.home).map((p) => p.id)
      const run = { wordpress, joomla, emdash }[context.release.platform]
      if (run) await run(context, f, ids, a.paths)
    })
    f.note('Whether a child of an unticked page really answers 404 is only known on a built site.')
    return f.outcome({
      pass: 'which articles each listed page lists is readable as data',
      fix: noList
        ? pagesFileFix(context.release.tag)
        : `List child articles through the platform (${
            context.release.platform === 'wordpress'
              ? 'child pages, the posts page or a query block'
              : context.release.platform === 'joomla'
                ? 'com_content categories and menu items'
                : 'the RECORDS table and listed-children map of src/lib/link-gate.ts'
          }), then cut a new release.`
    })
  }
}
