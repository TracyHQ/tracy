/**
 * The restaurant's own posts written into the demo articles of a Joomla page an opportunity built (`wo-content.js` holds
 * the rules): the page's entry in the page menu, by its path, names what it lists — a category (with its subcategories when
 * the entry shows them) or the featured articles — and the first of those, in the order the page shows them, carry the posts.
 *
 * 🔒 EDITED IN PLACE, ONE AT A TIME, READ BACK. Title, intro and state are written (`fulltext` emptied, the alias kept);
 * only when every write of a page reads back right are its other demo articles unpublished (`state: 0`). Nothing is created
 * or deleted. Each record's fields before are kept once (`recordBefore`), each write's receipt beside them (`recordWrite`).
 * An article a menu entry opens on its own is that page's, never a post of the list.
 */
import { listWhole } from './joomla-articles.js'
import { DEFAULT_RULE, byRule, componentParams, paramsOf, ruleOf } from './joomla-article-order.js'
import { contentOf } from './joomla-article-routes.js'
import { readMenu } from './joomla-tidy.js'
import { tickedMenuItems } from './picked-pages.js'
import { applyIdOf, bodyHtml, pagesToWrite, splitTargets } from './wo-content.js'

/** The plan's page roles a Joomla list page can carry. */
const ROLES = ['blog', 'events', 'offers']

const said = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))

/** A category and those under it, `depth` levels down (-1: all). */
function withSubcategories(
  /** @type {string} */ id,
  /** @type {any[]} */ categories,
  /** @type {number} */ depth
) {
  const out = new Set([id])
  let level = [id]
  for (let d = 0; level.length > 0 && (depth < 0 || d < depth); d += 1) {
    level = categories
      .filter((c) => level.includes(String(c.parent_id)) && !out.has(String(c.id)))
      .map((c) => String(c.id))
    for (const c of level) out.add(c)
  }
  return out
}

/**
 * The demo articles a page lists, in the order it shows them; null with why when the page is not a list.
 * Unpublished ones count (a demo trim hides some): a written one is published again.
 */
function listedBy(entry, { articles, categories, component, opened }) {
  const to = contentOf(entry)
  if (to?.view === 'article') return { why: 'it opens one article, not a list' }
  if (to?.view !== 'category' && to?.view !== 'featured')
    return { why: 'it lists no articles Tracy can write' }
  const params = paramsOf(entry)
  const rule = ruleOf(params) ?? ruleOf(component) ?? DEFAULT_RULE
  const depth = Number(params.show_subcategory_content || component?.show_subcategory_content || 0)
  const cats = to.view === 'category' ? withSubcategories(to.id, categories, depth) : null
  const list = articles
    .filter((a) => [0, 1].includes(Number(a.state)) && !opened.has(String(a.id)))
    .filter((a) => (cats ? cats.has(String(a.catid)) : Number(a.featured) === 1))
    .sort(byRule(rule))
  return { list }
}

/**
 * Write the build's posts into the list pages of the plan. Never throws: what cannot be read or written is said.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{buildId: string, items: any[], pagePlan: any, writes: Record<string, any>} | null} input.read - `woContentOf`
 * @param {{recordBefore: Function, recordWrite: Function}} input.woContent
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {(note: string) => void} input.note
 * @param {(name: string, value: number) => void} [input.time]
 */
export async function writeWoContent({ apply, siteKey, read, woContent, visible, note, time = () => {} }) {
  const done = { written: 0, hidden: 0, failed: 0, skipped: 0 }
  const pages = pagesToWrite(read, ROLES)
  if (!read || pages.length === 0) return done
  const { buildId, writes = {} } = read
  let site
  try {
    const [rows, articles, categories, component] = await Promise.all([
      readMenu(apply, siteKey),
      listWhole(apply, siteKey, 'article'),
      listWhole(apply, siteKey, 'category'),
      componentParams(apply, siteKey)
    ])
    const opened = new Set(
      rows
        .filter((row) => Number(row.published) === 1 && contentOf(row)?.view === 'article')
        .map((row) => String(contentOf(row)?.id))
    )
    site = { rows, articles, categories, component, opened }
  } catch (error) {
    note(`the site's articles could not be read, so the restaurant's posts were not written: ${said(error)}`)
    return done
  }
  const get = async (/** @type {number} */ id) => {
    const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id } })
    if (answer?.ok === false || !answer?.item)
      throw new Error(String(answer?.message ?? answer?.error ?? 'not found'))
    return answer.item
  }
  const update = async (/** @type {number} */ id, /** @type {Record<string, unknown>} */ fields) => {
    const answer = await apply({
      siteKey,
      action: 'content.update',
      params: { kind: 'article', id, fields, apply_id: applyIdOf(buildId, `article:${id}`) }
    })
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
  }
  const fieldsOf = (/** @type {any} */ a) => ({
    title: a.title,
    introtext: a.introtext,
    fulltext: a.fulltext,
    state: a.state
  })

  // The blog first: an article another page lists too (offers as the featured view of the blog's own category) belongs to
  // the page a visitor reads it on, and a later page never touches what an earlier one wrote or hid (stand wobrief, 19/10/2026).
  const claimed = new Map()
  const ordered = [...pages].sort((a, b) => Number(b.role === 'blog') - Number(a.role === 'blog'))
  for (const page of ordered) {
    const { ids } = tickedMenuItems(site.rows, visible, { all: [{ id: page.pageId }], picked: [page.pageId] })
    const entry = site.rows.find((row) => ids.includes(Number(row.id)))
    if (!entry) {
      note(`the ${page.pageId} page has no menu entry, so its demo articles stay`)
      continue
    }
    const { list: listed, why } = listedBy(entry, site)
    if (!listed) {
      note(`the ${page.pageId} page keeps its words: ${why}`)
      continue
    }
    const list = listed.filter((a) => !claimed.has(String(a.id)))
    if (listed.length && !list.length) {
      note(
        `the ${page.pageId} page lists only articles of the ${claimed.get(String(listed[0].id))} page, so its posts were not written`
      )
      continue
    }
    const { write, hide } = splitTargets(list, page.items.length)
    for (const a of [...write, ...hide]) claimed.set(String(a.id), page.pageId)
    if (write.length < page.items.length)
      note(
        `the ${page.pageId} page lists ${write.length} demo article(s), so ${page.items.length - write.length} post(s) were not written`
      )
    let allRight = true
    for (const [i, target] of write.entries()) {
      const item = page.items[i]
      const id = Number(target.id)
      const key = `article:${id}`
      if (writes[key]?.state === 'written' && writes[key]?.itemId === item.id) {
        done.skipped += 1
        continue
      }
      try {
        await woContent.recordBefore(buildId, key, fieldsOf(await get(id)))
        await update(id, { title: item.title, introtext: bodyHtml(item.body), fulltext: '', state: 1 })
        const back = await get(id)
        if (back.title !== item.title || Number(back.state) !== 1)
          throw new Error('the article did not read back as written')
        await woContent.recordWrite(buildId, key, { itemId: item.id, state: 'written' })
        done.written += 1
      } catch (error) {
        allRight = false
        done.failed += 1
        note(`a post of the ${page.pageId} page could not be written into article ${id}: ${said(error)}`)
        await woContent
          .recordWrite(buildId, key, { itemId: item.id, state: 'failed', reason: said(error) })
          .catch(() => {})
      }
    }
    if (!allRight) {
      note(`the ${page.pageId} page keeps its other demo articles published, since a post was not written`)
      continue
    }
    for (const target of hide) {
      const id = Number(target.id)
      if (Number(target.state) !== 1) continue
      const key = `article:${id}`
      try {
        await woContent.recordBefore(buildId, key, fieldsOf(target))
        await update(id, { state: 0 })
        await woContent.recordWrite(buildId, key, { state: 'hidden' })
        done.hidden += 1
      } catch (error) {
        note(`demo article ${id} of the ${page.pageId} page could not be unpublished: ${said(error)}`)
      }
    }
  }
  time('woContentWritten', done.written)
  if (done.hidden > 0) time('woContentHidden', done.hidden)
  if (done.failed > 0) time('woContentFailed', done.failed)
  return done
}
