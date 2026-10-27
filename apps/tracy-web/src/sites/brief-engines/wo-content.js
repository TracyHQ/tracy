/**
 * The restaurant's own posts written into the demo site a Website Opportunities build made — without a model
 * (tasks/plan-wo-content-writer.md). The pure half: which pages, which items, the body in each CMS's shape. Each engine
 * reads its own demo records and writes them (`wordpress.js`, `joomla.js`, `emdash.js`).
 *
 * 🔒 A DEMO RECORD IS EDITED IN PLACE, NEVER CREATED: its alias or slug stays (menu routes, previous/next links), and a
 * retry edits the same record again instead of adding a second. The demo records of the page beyond the items are
 * unpublished, never deleted, and only after the written ones read back right.
 * 🔒 ONLY A WEBSITE OPPORTUNITIES BUILD WITH CONTENT ITEMS. The product owner's 12/10/2026 rule — demo posts are translated,
 * never rewritten (`wp-posts.js`, `joomla-blog-articles.js`) — stands for a customer's own build; a build with the
 * restaurant's sourced posts replaces them (19/10/2026, D1 of tasks/plan-wo-site-brief-pages.md).
 * 🔒 NEVER IN THE WAY OF A SITE'S OWN BUILD. No reader, no build, nothing to write, a failed write: noted, the build goes on.
 */
import { createHash } from 'node:crypto'

/**
 * The build's items and page plan, or null when the site is not one an opportunity built (or they cannot be read).
 * @param {{forSite: Function} | null} woContent
 * @param {{siteKey: string, email: string, note: (n: string) => void}} ctx
 */
export async function woContentOf(woContent, ctx) {
  if (!woContent) return null
  try {
    return await woContent.forSite({ siteKey: ctx.siteKey, email: ctx.email })
  } catch (error) {
    ctx.note(
      `the restaurant's posts could not be read, so the template's posts stay: ${error?.message ?? error}`
    )
    return null
  }
}

/**
 * The kept pages of the given roles the plan filled from the restaurant's posts, each with its items in the plan's order.
 * @param {{items: any[], pagePlan: {pages: any[]}} | null} read
 * @param {string[]} roles
 * @returns {Array<{pageId: string, role: string, items: any[]}>}
 */
export function pagesToWrite(read, roles) {
  if (!read?.pagePlan?.pages) return []
  const byId = new Map((read.items ?? []).map((it) => [it.id, it]))
  return read.pagePlan.pages
    .filter((p) => p.keep && p.fill === 'sourced' && roles.includes(p.role) && p.items?.length)
    .map((p) => ({ pageId: p.id, role: p.role, items: p.items.map((id) => byId.get(id)).filter(Boolean) }))
    .filter((p) => p.items.length)
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const paragraphsOf = (body) =>
  String(body ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

/** HTML paragraphs, a line break kept as `<br>` (Joomla `introtext`). */
export function bodyHtml(body) {
  return paragraphsOf(body)
    .map((p) => `<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('\n')
}

/** Block-editor paragraphs (WordPress `post_content`). */
export function wpBlocks(body) {
  return paragraphsOf(body)
    .map(
      (p) =>
        `<!-- wp:paragraph -->\n<p>${p.split('\n').map(escapeHtml).join('<br>')}</p>\n<!-- /wp:paragraph -->`
    )
    .join('\n\n')
}

/** Portable Text blocks (EmDash `content`): text as it is — the editor escapes. */
export function portableText(body) {
  return paragraphsOf(body).map((p, i) => {
    const key = createHash('sha256').update(`${i}:${p}`).digest('hex').slice(0, 12)
    return {
      _type: 'block',
      _key: key,
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `${key}s`, text: p, marks: [] }]
    }
  })
}

/** The first sentences that fit, else the words that fit. */
export function excerptOf(body, max = 160) {
  const text = String(body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? []
  let out = ''
  for (const s of sentences) {
    if ((out + s).trim().length > max) break
    out = (out + s).trim() + ' '
  }
  return out.trim() || text.slice(0, max + 1).replace(/\s+\S*$/, '')
}

/**
 * The page's demo records, in the order a visitor sees them: the first one per item are written, the rest hidden.
 * @template T @param {T[]} ordered @param {number} n
 */
export function splitTargets(ordered, n) {
  if (n <= 0) return { write: [], hide: [] }
  return { write: ordered.slice(0, n), hide: ordered.slice(n) }
}

/** The apply id of one item's write: the same on a retry. */
export const applyIdOf = (buildId, key) =>
  `wo-content-${createHash('sha256').update(`${buildId}:${key}`).digest('hex').slice(0, 24)}`
