/**
 * The restaurant's own posts on an EmDash demo site a Website Opportunities build made, written without a model
 * (tasks/plan-wo-content-writer.md; the pure half is `wo-content.js`). Tracy Base and Tracy Business carry their blog in the
 * one collection `posts`: the posts its blog page shows first, in the site's default locale, are edited in place through the
 * tool's own sequence (GET → PUT with `_rev`, a draft → POST publish), the rest unpublished once every write read back right.
 *
 * 🔒 RUN AFTER THE PERSONALIZE TOOL, never before: the tool rewrites the demo posts with its model and would write over these.
 */
import { excerptOf, pagesToWrite, portableText, splitTargets } from './wo-content.js'

/** Characters of the breadcrumb title on Tracy Business: the seed's own short titles stop at 48. */
const SHORT_TITLE = 48

/**
 * The order a template's blog page lists its posts (`src/lib/posts.ts` `loadPosts`): newest first, same-day posts by `sort`;
 * Tracy Business leads its unfiltered list with the featured post (`views/News.astro`).
 * @param {Array<{slug: string, data: Record<string, any>}>} posts - in seed order
 * @param {string} templateId
 */
export function blogOrder(posts, templateId) {
  const sorted = posts
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        (Date.parse(b.p.data.date) || 0) - (Date.parse(a.p.data.date) || 0) ||
        (a.p.data.sort ?? 0) - (b.p.data.sort ?? 0) ||
        a.i - b.i
    )
    .map(({ p }) => p)
  if (templateId !== 'tracy-business') return sorted
  const featured = sorted.find((p) => p.data.featured)
  return featured ? [featured, ...sorted.filter((p) => p !== featured)] : sorted
}

/**
 * @param {object} input
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} input.api - `siteApi(...)`
 * @param {Awaited<ReturnType<typeof import('./wo-content.js').woContentOf>>} input.read
 * @param {{recordBefore: Function, recordWrite: Function}} input.woContent
 * @param {string[]} input.slugs - the template's posts of `locale`, from its seed
 * @param {string} input.locale - the site's default locale: the one served at the root
 * @param {string} input.templateId
 * @param {(note: string) => void} input.note
 * @returns {Promise<{written: number, hidden: number, failed: number} | null>} null when there was nothing to write
 */
export async function writeWoPosts({ api, read, woContent, slugs, locale, templateId, note }) {
  const pages = pagesToWrite(read, ['blog'])
  if (!read || pages.length === 0) return null
  const seen = new Set()
  const items = pages.flatMap((p) => p.items).filter((it) => !seen.has(it.id) && seen.add(it.id))
  const route = (/** @type {string} */ ref, suffix = '') =>
    `/_emdash/api/content/posts/${encodeURIComponent(ref)}${suffix}?locale=${encodeURIComponent(locale)}`
  const live = async (/** @type {string} */ slug) => {
    const got = await api('GET', route(slug))
    const item = got?.item ?? got
    return { item, rev: got?._rev ?? null, data: item?.liveData ?? item?.data ?? {} }
  }
  const out = { written: 0, hidden: 0, failed: 0 }

  /** @type {Array<{slug: string, item: any, rev: any, data: Record<string, any>}>} */
  const published = []
  for (const slug of slugs) {
    try {
      const got = await live(slug)
      if (got.item?.status === 'published' && got.item.id) published.push({ slug, ...got })
    } catch (error) {
      if (/** @type {any} */ (error)?.status !== 404) {
        note(
          `the restaurant's posts were not written, the site's posts could not be read: ${messageOf(error)}`
        )
        return { ...out, failed: items.length }
      }
    }
  }
  const { write, hide } = splitTargets(blogOrder(published, templateId), items.length)
  if (write.length < items.length)
    note(
      `the template has ${write.length} post(s) for ${items.length} of the restaurant's, so the rest are not on the site`
    )

  for (const [i, target] of write.entries()) {
    const it = items[i]
    const key = `post:${locale}:${target.slug}`
    // A retry leaves a post this build already wrote, as long as the site still shows it.
    if (
      read.writes?.[key]?.state === 'written' &&
      read.writes[key].itemId === it.id &&
      target.data.title === it.title
    ) {
      out.written += 1
      continue
    }
    try {
      const d = target.data
      await woContent.recordBefore(read.buildId, key, {
        title: d.title ?? null,
        excerpt: d.excerpt ?? null,
        content: d.content ?? null,
        ...('short_title' in d ? { short_title: d.short_title } : {}),
        ...('lede' in d ? { lede: d.lede } : {}),
        ...('date' in d ? { date: d.date } : {}),
        status: target.item.status
      })
      // The day the restaurant posted it, in the demo date's own shape (a day or a full timestamp).
      const posted = it.posts?.[0]?.publishedAt
      const date =
        typeof posted === 'string' && typeof d.date === 'string' ? posted.slice(0, d.date.length) : null
      const excerpt = excerptOf(it.body)
      const data = {
        ...d,
        title: it.title,
        excerpt,
        content: portableText(it.body),
        ...('short_title' in d ? { short_title: excerptOf(it.title, SHORT_TITLE) } : {}),
        ...('lede' in d ? { lede: excerpt } : {}),
        ...(date ? { date } : {})
      }
      await api('PUT', route(String(target.item.id)), { data, _rev: target.rev })
      await api('POST', route(String(target.item.id), '/publish'), {})
      const back = await live(target.slug)
      if (back.item?.status === 'published' && back.data.title === it.title) {
        await woContent.recordWrite(read.buildId, key, { itemId: it.id, state: 'written' })
        out.written += 1
      } else {
        const reason = 'the post did not read back as written'
        await woContent.recordWrite(read.buildId, key, { itemId: it.id, state: 'failed', reason })
        note(`the restaurant's post "${it.title}" may not be on the site: ${reason}`)
        out.failed += 1
      }
    } catch (error) {
      out.failed += 1
      note(`the restaurant's post "${it.title}" could not be written: ${messageOf(error)}`)
      await woContent
        .recordWrite(read.buildId, key, { itemId: it.id, state: 'failed', reason: messageOf(error) })
        .catch(() => {})
    }
  }
  if (out.failed > 0 || write.length === 0) {
    if (hide.length > 0)
      note(`the template's other ${hide.length} post(s) stay, since not every post was written`)
    return out
  }

  for (const target of hide) {
    const key = `post:${locale}:${target.slug}`
    try {
      await woContent.recordBefore(read.buildId, key, { status: target.item.status })
      await api('POST', route(String(target.item.id), '/unpublish'), {})
      await woContent.recordWrite(read.buildId, key, { state: 'hidden' })
      out.hidden += 1
    } catch (error) {
      out.failed += 1
      note(`the template's post ${target.slug} is still on the site: ${messageOf(error)}`)
    }
  }
  return out
}

const messageOf = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))
