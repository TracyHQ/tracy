/**
 * WordPress: the restaurant's own posts written into the demo posts its posts page shows, on a site a Website Opportunities
 * build made, without a model (`wo-content.js`, tasks/plan-wo-content-writer.md).
 *
 * 🔒 THE BLOG PAGE LISTS EVERY POST, NEWEST FIRST: the posts page (`page_for_posts`), or — as JA templates build it
 * (ja-vega, stand wobrief 19/10/2026) — the plan's page holding a post-list block (`wp:query`, `wp:latest-posts`) that
 * narrows nothing. A block limited to a category, an author or another order is noted and left to the agent, never guessed.
 * 🔒 IN THE ORDER A VISITOR SEES THEM: sticky posts first, then newest first, as WordPress's own posts page lists them.
 * 🔒 DRAFTED ONLY WHEN EVERY WRITE READ BACK RIGHT: a half-written page keeps its demo posts beside the written ones.
 */
import { applyIdOf, excerptOf, pagesToWrite, splitTargets, wpBlocks } from './wo-content.js'
import { listAll, pathOfUrl } from './wp-residue.js'

/**
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.call - the site's door, one person
 * @param {Awaited<ReturnType<typeof import('./wo-content.js').woContentOf>>} input.read - the build's items and page plan
 * @param {{recordBefore: Function, recordWrite: Function}} input.woContent - where the words before and the receipts go
 * @param {(note: string) => void} input.note
 * @returns {Promise<{written: number, hidden: number, failed: number} | null>} null when there was nothing to write
 */
export async function writeWoPosts({ call, read, woContent, note }) {
  const [page, ...more] = pagesToWrite(read, ['blog'])
  if (!read || !page) return null
  if (more.length > 0)
    note(
      `only the posts page takes the restaurant's posts; ${more.length} other blog page(s) are left to the agent`
    )
  const checked = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await call(action, params)
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
    return answer
  }
  const option = async (/** @type {string} */ key) =>
    (await call('content.get', { kind: 'option', key }).catch(() => null))?.item?.value
  const out = { written: 0, hidden: 0, failed: 0 }
  try {
    const postsPage = Number(await option('page_for_posts')) || 0
    const pages = await listAll(checked, 'page', true)
    const isPlanned = (/** @type {any} */ p) =>
      (p.url ? pathOfUrl(p.url) : `/${p.slug}`) === `/${page.pageId}` || p.slug === page.pageId
    const planned = pages.find(isPlanned)
    const list = !planned
      ? { why: 'is not a page of this site' }
      : planned.id === postsPage
        ? { categories: null }
        : postListOf(planned.content ?? '')
    // A list of some categories (ja-vega: `taxQuery.category`) is still every post of them, newest first: read their slugs.
    let inCategories = null
    if (list.categories) {
      const slugs = []
      for (const id of list.categories) {
        const term = (await call('content.get', { kind: 'term', id, key: 'category' }).catch(() => null))
          ?.item
        if (term?.slug) slugs.push(String(term.slug))
      }
      if (slugs.length === list.categories.length) inCategories = new Set(slugs)
      else list.why = 'lists a category this site does not answer for'
    }
    if (list.why) {
      note(`the blog page "${page.pageId}" ${list.why}, so the restaurant's posts are left to the agent`)
      return null
    }
    const sticky = new Set([].concat((await option('sticky_posts')) ?? []).map(Number))
    const posts = (await listAll(checked, 'post', true))
      .filter((p) => p.status === 'publish')
      .filter((p) => !inCategories || (p.categories ?? []).some((c) => inCategories.has(c)))
      .sort(
        (a, b) =>
          Number(sticky.has(b.id)) - Number(sticky.has(a.id)) ||
          String(b.date ?? '').localeCompare(String(a.date ?? '')) ||
          b.id - a.id
      )
    const { write, hide } = splitTargets(posts, page.items.length)
    if (write.length < page.items.length)
      note(
        `the posts page shows ${write.length} demo post(s) for ${page.items.length} of the restaurant's posts; the rest are left to the agent`
      )
    const { buildId } = read
    /** Keep a post's words before its first change, then change it under its own apply id. */
    const change = async (/** @type {number} */ id, /** @type {Record<string, string>} */ fields) => {
      const key = `post:${id}`
      const item = (await checked('content.get', { kind: 'post', id }))?.item ?? {}
      await woContent.recordBefore(buildId, key, {
        post_title: String(item.post_title ?? ''),
        post_excerpt: String(item.post_excerpt ?? ''),
        post_content: String(item.post_content ?? ''),
        post_status: String(item.post_status ?? '')
      })
      await checked('content.update', { kind: 'post', id, fields, apply_id: applyIdOf(buildId, key) })
      return key
    }
    for (const [i, post] of write.entries()) {
      const item = page.items[i]
      const key = `post:${post.id}`
      const done = read.writes?.[key]
      if (done?.state === 'written' && done.itemId === item.id) {
        out.written += 1
        continue
      }
      try {
        await change(post.id, {
          post_title: item.title,
          post_excerpt: excerptOf(item.body),
          post_content: wpBlocks(item.body),
          post_status: 'publish'
        })
        const back = (await checked('content.get', { kind: 'post', id: post.id }))?.item ?? {}
        if (back.post_title !== item.title || back.post_status !== 'publish')
          throw new Error(`it reads back as "${back.post_title}" (${back.post_status})`)
        await woContent.recordWrite(buildId, key, { itemId: item.id, state: 'written' })
        out.written += 1
      } catch (error) {
        out.failed += 1
        const reason = error instanceof Error ? error.message : String(error)
        await woContent
          .recordWrite(buildId, key, { itemId: item.id, state: 'failed', reason })
          .catch(() => {})
      }
    }
    if (out.failed > 0) {
      note(
        `${out.failed} of the restaurant's posts could not be written, so the template's posts stay beside them`
      )
      return out
    }
    for (const post of hide) {
      try {
        const key = await change(post.id, { post_status: 'draft' })
        await woContent.recordWrite(buildId, key, { state: 'hidden' })
        out.hidden += 1
      } catch {
        out.failed += 1
      }
    }
    if (out.failed > 0)
      note(`${out.failed} of the template's posts could not be hidden and stay beside the restaurant's`)
  } catch (error) {
    note(`the restaurant's posts could not be written: ${error instanceof Error ? error.message : error}`)
  }
  return out
}

/**
 * What a page's post list shows, read from its first `wp:query` or `wp:latest-posts` block: every post newest first
 * (`categories: null`), every post of some categories newest first (their ids), or why it is neither.
 * @param {string} content
 * @returns {{categories: number[] | null, why?: undefined} | {why: string, categories?: undefined}}
 */
export function postListOf(content) {
  const block = String(content).match(/<!--\s*wp:(query|latest-posts)\s*(\{.*?\})?\s*\/?-->/s)
  if (!block) return { why: 'shows no list of posts' }
  let attrs = {}
  try {
    attrs = block[2] ? JSON.parse(block[2]) : {}
  } catch {
    return { why: 'has a list of posts whose settings cannot be read' }
  }
  const q = block[1] === 'query' ? (attrs.query ?? {}) : attrs
  const taxonomies = Object.entries(q.taxQuery ?? {}).filter(([, v]) => Array.isArray(v) && v.length)
  const categories = [
    ...(taxonomies.find(([k]) => k === 'category')?.[1] ?? []),
    ...(Array.isArray(q.categories) ? q.categories.map((c) => c?.id ?? c) : [])
  ].map(Number)
  const narrowed =
    (q.postType && q.postType !== 'post') ||
    taxonomies.some(([k]) => k !== 'category') ||
    q.author ||
    q.search ||
    (q.order && q.order !== 'desc') ||
    (q.orderBy && q.orderBy !== 'date') ||
    q.sticky === 'only' ||
    q.inherit === true
  if (narrowed) return { why: 'lists only some posts (a tag, an author, a search or another order)' }
  return { categories: categories.length ? categories : null }
}
