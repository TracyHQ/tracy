/**
 * The demo blog articles of a Joomla template on a FULL site: which of them are posts of the blog, and their text lines.
 *
 * Each article that no page opens on its own is taken, whole: its title, intro and body lines (D10 of the TCQR spec first
 * rewrote them for the business; since 12/10/2026 the posts are translated only, below). Its pictures,
 * its links, its alias, its category and how many articles there are stay as the template ships them (images and links are
 * not text slots; an alias and a category are not slots at all). About left blank keeps them as they are, like every other
 * demo word (`aboutGiven`).
 *
 * An article a kit sample page shows is never planned (K3). An article a page opens (`view=article&id=N`) is planned with that
 * page, unless it is a post of the blog: its category holds articles no page opens (JA Essence's Detail › Layout 1..3,
 * Gallery and Video pages open posts of the blog categories 9 and 11).
 *
 * 🔒 THE POSTS OF THE BLOG ARE TRANSLATED, NEVER REWRITTEN (product owner, decision 1 after g65, 12/10/2026; TCH #1013): the
 * articles told apart here as posts of the blog (`stories`) are left out of the pages' planner and translated where they stand
 * on a site in another language (`blog-translate.js`). A legal article (privacy, terms, cookies) is no post: it is planned line
 * by line, beside the pages, as before.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** The most article lines one Apply takes: JA Essence's 51 posts of the blog are 714 lines once the posts its pages open are
 * counted too (g64). */
export const POST_SLOTS = 900
/** The most lines one contract write takes (`apply-joomla-contract`: "Review at most 1500 scalar slots in one revision"). */
const WRITE_CEILING = 1500

/** The articles a page of the site opens on its own, as the planner's `pages` surface counts them. */
function openedArticles(/** @type {any[]} */ pages) {
  const out = new Set()
  for (const page of pages ?? []) {
    const link = String(page?.link ?? '')
    const id = /[?&]view=article(?:&|$)/.test(link) && /[?&]id=(\d+)/.exec(link)
    if (id) out.add(`article-${id[1]}`)
  }
  return out
}

/**
 * The text lines of the demo blog articles to plan, whole articles only, in the contract's order.
 *
 * What one Apply writes is held under the contract write's ceiling: every line a visitor reads that is not an article line
 * taken here could be written too, so the articles get what that leaves, and never more than `POST_SLOTS`. An article that does not fit keeps
 * its words whole, never half of them.
 * @param {object} input
 * @param {any[]} input.slots - the contract's slots, as the site holds them
 * @param {any[]} input.pages - the contract's pages
 * @param {Set<string>} input.kit - the entities of the kit sample pages (`kitEntities`)
 * @param {(slot: any) => boolean} input.shown - whether a visitor reads the slot's edition
 * @param {(slot: any) => boolean} input.isDerived - a translated copy of another slot
 * @param {number} [input.most] - the most lines to take
 * @param {Map<string, { catid: string, alias: string }>} [input.articles] - the contract's articles (`articleRows`)
 * @returns {{ slots: any[], articles: number, left: number, stories: string[] }} `articles`: how many are planned; `left`: how
 *   many keep their words; `stories`: the planned articles that are posts of the blog (not legal texts), in order
 */
export function blogArticleSlots({
  slots,
  pages,
  kit,
  shown,
  isDerived,
  most = POST_SLOTS,
  articles = new Map()
}) {
  const opened = openedArticles(pages)
  // A category with an article no page opens is a category of the blog: an opened article of it is a post too.
  const blogCategories = new Set(
    [...articles]
      .filter(([entity, row]) => !opened.has(entity) && !kit.has(entity) && row.catid)
      .map(([, row]) => row.catid)
  )
  const ofBlog = (/** @type {string} */ entity) =>
    !opened.has(entity) || blogCategories.has(articles.get(entity)?.catid ?? '')
  // 🔒 AN ARTICLE WHOSE LINES CARRY OFFERING ROLES (ADR 0040) IS AN OFFERING PAGE, NOT A POST (spec TracyHQ/tracy#189): it
  // describes what the business sells, so it is planned with the pages from the brief. Measured on the local stand
  // (29/10/2026): a template's class articles, kept and renamed for the owner's services, sat in a blog category and so
  // kept the demo's lorem ipsum, only "translated".
  const offeringPages = new Set(
    slots
      .filter((slot) => typeof slot.role === 'string' && slot.role.startsWith('offering.'))
      .map((slot) => String(slot.entity ?? ''))
  )
  /** @type {Map<string, any[]>} */
  const byArticle = new Map()
  for (const slot of slots) {
    const entity = String(slot.entity ?? '')
    if (!/^article-\d+$/.test(entity) || !ofBlog(entity) || kit.has(entity) || offeringPages.has(entity))
      continue
    if (slot.type !== 'text' || isDerived(slot) || !shown(slot)) continue
    byArticle.set(entity, [...(byArticle.get(entity) ?? []), slot])
  }
  const all = [...byArticle.values()].reduce((sum, lines) => sum + lines.length, 0)
  // Only a line a visitor reads can be written: another edition's lines, and translated copies, never are.
  const writable = slots.filter((slot) => shown(slot) && !isDerived(slot)).length
  const room = Math.max(0, Math.min(most, WRITE_CEILING - (writable - all)))
  const taken = []
  /** @type {string[]} */
  const stories = []
  let count = 0
  for (const [entity, lines] of byArticle) {
    if (taken.length + lines.length > room) continue
    taken.push(...lines)
    count += 1
    if (!LEGAL.test(articles.get(entity)?.alias ?? '')) stories.push(entity)
  }
  return { slots: taken, articles: count, left: byArticle.size - count, stories }
}

/** An article whose alias names a legal text: written line by line, never as a story. */
const LEGAL = /privacy|terms|legal|cookie|policy|disclaimer|imprint|gdpr/i

/** Each contract's articles, read once: their category and alias (`content-map.json` `entities`). */
const rowsByDir = new Map()

/**
 * The articles of a contract: `article-N` → its category entity and alias.
 * @param {string} dir - the contract's folder
 * @returns {Map<string, { catid: string, alias: string }>}
 */
export function articleRows(dir) {
  let rows = rowsByDir.get(dir)
  if (!rows) {
    rows = new Map()
    try {
      const map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
      for (const entity of map.entities ?? [])
        if (entity?.kind === 'article')
          rows.set(String(entity.key), {
            catid: String(entity.identityReferences?.catid ?? ''),
            alias: String(entity.identity?.alias ?? '')
          })
    } catch {
      // No entities to read: every opened article stays with its page, and none is legal by its alias.
    }
    rowsByDir.set(dir, rows)
  }
  return rows
}

/**
 * Two plans of one contract made one: the pages' and the articles'. They plan different slots, so nothing is overwritten.
 * @param {any} pages
 * @param {any} posts
 */
export function joinPlans(pages, posts) {
  return {
    ...pages,
    changes: { ...pages.changes, ...posts.changes },
    evidence: { ...pages.evidence, ...posts.evidence },
    pending: [...(pages.pending ?? []), ...(posts.pending ?? [])],
    reasons: { ...pages.reasons, ...posts.reasons },
    invented: [...(pages.invented ?? []), ...(posts.invented ?? [])],
    ...(pages.tried || posts.tried ? { tried: { ...pages.tried, ...posts.tried } } : {})
  }
}
