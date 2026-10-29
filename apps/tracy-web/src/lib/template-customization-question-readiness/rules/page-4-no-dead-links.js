/**
 * PAGE-4: no link on the site leads to a page the customer dropped or to an error page (spec
 * `tasks/spec-template-customization-question-readiness.md`, PAGE-4).
 *
 * The template's side: every internal link sits where Tracy can take it out (a menu, a contract
 * slot, a database block, the EmDash link gate), none is written into a template file, and every
 * link of the demo reaches a real address.
 * - WordPress: (1) a theme `templates/*.html` or `parts/*.html` file the database does not override
 *   (Tracy's sweep covers the header, footer and sidebar parts and page content, not files such as
 *   `404.html`) links a page of `tracy_site_pages.json`; (2) a link inside published content
 *   (pages, posts, template parts, navigations, patterns) leads to no published page, post,
 *   category, tag or redirect.
 * - Joomla: (1) a `type: url` slot of the contract leads to a menu item (`Itemid`) or path that is
 *   not published (a path under a published component item is that component's own page: Joomla
 *   hands the rest of the path to its router, as VirtueMart's vendor terms page under the shop item;
 *   whether the component answers it is only known on a built site); (2) `error.php`, `index.php`, `html/**` or `acm/**` of the template links a page
 *   of the list by its path.
 * - EmDash: (1) a listed page is missing from `RECORDS` of `src/lib/link-gate.ts`; (2) a component
 *   or view writes `href="/<page>"` for a listed page without importing the link gate.
 */
import { linkGateRecords, pagesOutsideLinkGate } from '../readers/emdash-link-gate.js'
import { publishedAddresses } from '../readers/wordpress-addresses.js'
import { demoTables } from '../readers/demo-tables.js'
import { contractSlots, releaseContract } from '../readers/contract-profile-of-release.js'
import { findings, listed, plural } from '../readers/rule-findings.js'
import { pagesFileFix, sitePagesOfRelease } from '../readers/site-pages-of-release.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'

/** Template parts Tracy's sweep rewrites (`wp-residue.js`). */
const SWEPT_PART = /^parts\/(header|footer|sidebar-[^/]*)\.html$/
/** Templates that render the posts page's own world: its index, archives and single posts. */
const POSTS_WORLD = /^templates\/(home|archive|category|tag|author|date|single)(-[^/]*)?\.html$/
/**
 * Addresses that are not pages: files, feeds, the admin and WordPress's own scripts (`wp-login.php`,
 * `xmlrpc.php`, any `wp-*.php` at the root), search, anchors, mail and phone. Tested on the path
 * without its query, so `/wp-login.php?action=register` is the login script too.
 */
const NOT_A_PAGE =
  /^(#|mailto:|tel:|javascript:|\?|\/?wp-(content|admin|json|includes)\b|\/?wp-[a-z-]+\.php$|\/?xmlrpc\.php$|\/?feed\b)|\.[a-z0-9]{2,5}$/i
const pathOf = (/** @type {string} */ url) =>
  url
    .replace(/^https?:\/\/(quickstart\.invalid|localhost[^/]*)/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/?(index\.php\/?)?|\/+$/g, '')

/** The listed page a path leads to (itself or a page under it), or null. */
const listedPageOf = (/** @type {string} */ path, /** @type {string[]} */ ids) =>
  ids.find((id) => path === id || path.startsWith(`${id}/`)) ?? null

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function wordpress(context, f, /** @type {string[]} */ ids) {
  const wp = await wordpressDemo(context)
  const posts = wp.posts
  const live = posts.filter((p) => p.post_status === 'publish')
  const postsPage = wp.postsPage ? wp.pathOf(wp.postsPage) : null
  await f.part('the theme files', async () => {
    const hard = []
    for (const [file, text] of await templateSourceFiles(context)) {
      if (!/^(templates|parts)\/[^/]+\.html$/.test(file) || wp.overridden.has(file) || SWEPT_PART.test(file))
        continue
      // A template of the posts page's own world (its index, archives, single posts) only renders
      // while that page lives, so its link back to the page is never dead (posts and archives go
      // with the page: Tracy drafts them, D4).
      const ownWorld = POSTS_WORLD.test(file)
      const hits = [...text.matchAll(/href="(\/[^"]*)"/g)]
        .map((m) => pathOf(m[1]))
        .filter((p) => listedPageOf(p, ids) && !(ownWorld && p === postsPage))
      if (hits.length)
        hard.push(
          `${file} (${hits.length}: ${listed(
            [...new Set(hits)].map((p) => `/${p}`),
            4
          )})`
        )
    }
    if (hard.length)
      f.problem(`theme files write links to listed pages that Tracy cannot take out: ${listed(hard)}`)
  })
  const { addresses, languages } = publishedAddresses(wp)
  const dead = new Map()
  for (const p of live) {
    if (
      !['page', 'post', 'wp_template_part', 'wp_navigation', 'wp_block', 'wp_template'].includes(p.post_type)
    )
      continue
    const content = String(p.post_content ?? '')
    for (const m of content.matchAll(/(?:href="|"url":")((?:https?:\/\/quickstart\.invalid)?\/[^"]*)"/g)) {
      const raw = m[1].replaceAll('\\/', '/')
      const bare = raw.replace(/^https?:\/\/[^/]+/, '')
      if (NOT_A_PAGE.test(bare) || NOT_A_PAGE.test(bare.replace(/[?#].*$/, ''))) continue
      let path = pathOf(raw)
      try {
        path = decodeURIComponent(path)
      } catch {
        // Keep the raw path: a malformed escape is still a link to check.
      }
      const head = path.split('/')[0]
      const local = languages.has(head) ? path.slice(head.length + 1) : path
      if (addresses.has(path) || addresses.has(local)) continue
      // Search and feeds are served by the theme or the platform at their own routes.
      if (/(^|\/)((smart-)?search|feed|rss2?|atom)$/.test(path)) continue
      if (!dead.has(`/${path}`)) dead.set(`/${path}`, `${p.post_type} ${p.ID}`)
    }
  }
  if (dead.size)
    f.problem(
      `${plural(dead.size, 'demo link')} to no published address: ${listed(
        [...dead].map(([path, where]) => `${path} (in ${where})`),
        6
      )}`
    )
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f, /** @type {string[]} */ ids) {
  const t = await demoTables(context)
  const items = new Map(
    t
      .rows('menu')
      .filter((r) => Number(r.client_id) === 0)
      .map((r) => [String(r.id), r])
  )
  const published = [...items.values()].filter((r) => Number(r.published) === 1)
  const livePaths = new Set(published.map((r) => String(r.path)))
  const componentPaths = published.filter((r) => r.type === 'component').map((r) => String(r.path))
  /** A path an item serves: its own, or one under a published component item (that component routes the rest). */
  const served = (/** @type {string} */ p) =>
    livePaths.has(p) || componentPaths.some((item) => item !== '' && p.startsWith(`${item}/`))
  const articles = new Map(t.rows('content').map((r) => [String(r.id), r]))
  const broken = []
  for (const slot of contractSlots(releaseContract(context))) {
    if (slot.type !== 'url') continue
    const sample = String(slot.sample ?? '')
    const itemid = /[?&]Itemid=(\d+)/.exec(sample)?.[1]
    const article = /option=com_content&view=article&id=(\d+)/.exec(sample)?.[1]
    if (itemid && Number(items.get(itemid)?.published) !== 1)
      broken.push(`${slot.key} → Itemid ${itemid} (${items.has(itemid) ? 'unpublished' : 'no such item'})`)
    else if (article && !itemid && Number(articles.get(article)?.state) !== 1)
      broken.push(`${slot.key} → article ${article} (not published)`)
    else if (/^\/[^/]/.test(sample) && !served(pathOf(sample)))
      broken.push(`${slot.key} → ${sample} (no published menu item)`)
  }
  if (broken.length) {
    f.owner('contract')
    f.problem(`link slots lead nowhere: ${listed(broken, 6)}`)
  }
  await f.part('the template files', async () => {
    const hard = []
    for (const [file, text] of await templateSourceFiles(context)) {
      if (!/^(error|index|offline|component)\.php$|^html\/.*\.php$|^acm\/.*\/tmpl\/.*\.php$/.test(file))
        continue
      // A PHP base in front (`<?php echo $b; ?>/index.php/pricing`, JA Kinetic error.php) is the site root.
      const hits = [...text.matchAll(/href=["'](?:<\?php[^?]*\?>)?((?:\/?index\.php)?\/[^"'<]*)["']/g)]
        .map((m) => pathOf(m[1]))
        .filter((p) => p && listedPageOf(p, ids))
      if (hits.length)
        hard.push(
          `${file} (${listed(
            [...new Set(hits)].map((p) => `/${p}`),
            4
          )})`
        )
    }
    if (hard.length)
      f.problem(`template files write links to listed pages that Tracy cannot take out: ${listed(hard)}`)
  })
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(
  context,
  f,
  /** @type {string[]} */ ids,
  /** @type {((id: string) => string[]) | null} */ pathsOf
) {
  const files = await templateSourceFiles(context)
  const keys = linkGateRecords(files) ?? new Set()
  const absent = pagesOutsideLinkGate(ids, keys, pathsOf)
  if (absent.length)
    f.problem(
      `listed pages the link gate does not know at their menu path (RECORDS of src/lib/link-gate.ts): ${listed(absent)}`
    )
  const hard = []
  for (const [file, text] of files) {
    if (!/^src\/(components|views)\/.*\.astro$/.test(file) || /link-gate/.test(text)) continue
    const hits = [...text.matchAll(/href=["'](\/[^"'{]*)["']/g)]
      .map((m) => pathOf(m[1]))
      .filter((p) => listedPageOf(p, ids))
    if (hits.length)
      hard.push(
        `${file} (${listed(
          [...new Set(hits)].map((p) => `/${p}`),
          4
        )})`
      )
  }
  if (hard.length) f.problem(`components link listed pages without the link gate: ${listed(hard)}`)
}

export const page4NoDeadLinks = {
  id: 'PAGE-4',
  title: 'No link leads to a page the customer dropped or to an error page',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-4')
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
    return f.outcome({
      pass: 'every internal link sits where Tracy can take it out, and every demo link reaches a real address',
      fix: noList
        ? pagesFileFix(context.release.tag)
        : context.release.platform === 'emdash'
          ? 'Add every listed page to the RECORDS table of src/lib/link-gate.ts and link pages through it, point every demo link at a published page, then cut a new release.'
          : 'Link pages through the menu, a contract slot or a database block instead of writing them into template files, and point every demo link at a published page.'
    })
  }
}
