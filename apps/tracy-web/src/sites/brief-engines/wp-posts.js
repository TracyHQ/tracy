/**
 * The demo blog posts of a WordPress template on a FULL site: their words in the site's language, and their categories named for
 * the customer's trade.
 *
 * 🔒 DEMO POSTS ON FULL ARE TRANSLATED ONLY, NEVER REWRITTEN (product owner, decision 1 after the g65 builds, 12/10/2026, TCH
 * #1013; it replaces D10's rewrite of 11/10/2026). The posts are demo content the customer replaces: on a site written in another
 * language than the template's, each post's title, excerpt and lines are translated where they stand (`blog-translate.js`, each
 * distinct text once: the demo's copies share it), Latin filler kept; on a site in the template's language they stay exactly as
 * the template ships them. Pictures, links, blocks, slugs, categories and how many posts there are never change. About left
 * blank keeps the posts as they are, like every other demo word.
 *
 * 🔒 THE CATEGORIES ARE RENAMED FOR THE CUSTOMER'S TRADE when About was given (product owner, decision (3) of 12/10/2026,
 * `blog-categories.js`): only the name, never the slug nor which posts a category holds; refused twice, a category keeps today's
 * name (translated on a site in another language), said. Their descriptions and the tags are translated only. About left blank
 * keeps them as today.
 */
import { plain } from './wp-blocks.js'
import { editLines } from './wp-leaves.js'
import { listAll } from './wp-residue.js'
import { pool } from './shared.js'
import { tradeCategoryNames } from './blog-categories.js'

/** How many term ids are read at once while the categories and tags are looked for. */
const TERM_READERS = 6

/**
 * @typedef {{ id: number, slug: string, title: string, status: string, excerpt?: string, date?: string, content?: string, categories?: string[], tags?: string[] }} Post
 * @typedef {(lines: Array<{ key: string, sample: string, maxCharacters: number }>, what: string) => Promise<Record<string, string>>} Translate
 *   - lines translated into the site's language, never rewritten (`translateBlog`): line key → its words
 */

/** A post's title or excerpt as a line: what a visitor reads of it. */
const lineOf = (/** @type {unknown} */ text) => plain(String(text ?? '').replace(/<[^>]*>/g, ' '))

/** Whether a line is worth translating: words, not a mark. */
const worded = (/** @type {string} */ text) => text.length >= 3 && /\p{L}{2}/u.test(text)

/** The room a translation of a line may take: a language may need half as many characters again. */
const roomOf = (/** @type {string} */ text) => Math.max(40, Math.ceil([...text].length * 1.5))

/**
 * The published posts of the site with their bodies, or none when the site will not list them.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} read
 * @returns {Promise<Post[]>}
 */
export async function listPosts(read) {
  return (await listAll(read, 'post', true)).filter(
    (/** @type {Post} */ post) => post.status === 'publish' && post.content !== undefined
  )
}

/**
 * The demo posts' words in the site's language: read from the site, translated beside the pages, nothing written. Nothing on a
 * BLANK site or on a site in the template's language. Never rejects for one line: what could not be translated keeps the
 * template's words, said by `translate`.
 * @param {object} input
 * @param {Post[]} input.posts - the published posts (`listPosts`)
 * @param {boolean} input.rewrite - the customer described the business (FULL)
 * @param {string | null} input.language - the one language the site is written in when it is not the template's, else null
 * @param {(content: string) => Array<{ text: string }>} input.linesOf - the lines of a body a visitor reads
 * @param {Translate} input.translate
 * @returns {Promise<{ writes: Array<{ id: number, slug: string, fields: Record<string, string> }>, lines: number }>}
 */
export async function planPosts({ posts, rewrite, language, linesOf, translate }) {
  if (!rewrite || !language || posts.length === 0) return { writes: [], lines: 0 }
  /** @type {Array<{ key: string, sample: string, maxCharacters: number }>} */
  const lines = []
  const add = (/** @type {string} */ key, /** @type {string} */ text) => {
    if (worded(text)) lines.push({ key, sample: text, maxCharacters: roomOf(text) })
  }
  /** @type {Map<number, string[]>} each post's body lines, by post */
  const bodies = new Map()
  for (const post of posts) {
    add(`${post.id}#title`, lineOf(post.title))
    add(`${post.id}#excerpt`, lineOf(post.excerpt))
    const body = [...new Set(linesOf(post.content ?? '').map((line) => line.text))]
    bodies.set(post.id, body)
    body.forEach((text, i) => add(`${post.id}#${i}`, text))
  }
  const said = await translate(lines, 'the demo blog posts')
  const writes = []
  for (const post of posts) {
    /** @type {Record<string, string>} */
    const fields = {}
    const title = said[`${post.id}#title`]
    if (title) fields.post_title = title
    const excerpt = said[`${post.id}#excerpt`]
    if (excerpt) fields.post_excerpt = excerpt
    const edits = (bodies.get(post.id) ?? []).flatMap((text, i) => {
      const value = said[`${post.id}#${i}`]
      return value ? [{ text, value }] : []
    })
    const content = post.content ?? ''
    // A post has no slot: only the first block of a name is left out, like the line pass reads it (`ownLines`).
    const body = editLines(content, edits, { slotted: () => 1 })
    if (body.markup !== content) fields.post_content = body.markup
    if (Object.keys(fields).length > 0) writes.push({ id: post.id, slug: post.slug, fields })
  }
  return { writes, lines: new Set(lines.map((line) => line.sample)).size }
}

/**
 * The terms the posts are filed under, found by their slug: `content.get` reads a term by its id and taxonomy only, and the door
 * lists none, so ids are read a window at a time until every slug asked for is found (a quickstart's terms are a few dozen
 * ids from 1). A taxonomy found whole is asked nothing more; a read the site refuses is a term that is not there.
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} read
 * @param {Map<string, Set<string>>} wanted - taxonomy → the slugs the posts name
 * @param {{ most?: number, step?: number }} [options] - the highest id read, and how many ids a window holds
 * @returns {Promise<Array<{ taxonomy: string, id: number, name: string, slug: string, description: string }>>}
 */
export async function findTerms(read, wanted, { most = 200, step = 20 } = {}) {
  /** @type {Array<{ taxonomy: string, id: number, name: string, slug: string, description: string }>} */
  const found = []
  const missing = (/** @type {string} */ taxonomy) =>
    [...(wanted.get(taxonomy) ?? [])].filter(
      (slug) => !found.some((t) => t.taxonomy === taxonomy && t.slug === slug)
    )
  for (let from = 1; from <= most; from += step) {
    const open = [...wanted.keys()].filter((taxonomy) => missing(taxonomy).length > 0)
    if (open.length === 0) break
    const ids = Array.from({ length: Math.min(step, most - from + 1) }, (_, i) => from + i)
    const reads = await pool(
      open.flatMap((taxonomy) =>
        ids.map((id) => async () => {
          const answer = await read('content.get', { kind: 'term', id, key: taxonomy })
          const item = answer?.ok === false ? null : answer?.item
          return item && typeof item.name === 'string'
            ? {
                taxonomy,
                id,
                name: item.name,
                slug: String(item.slug ?? ''),
                description: String(item.description ?? '')
              }
            : null
        })
      ),
      TERM_READERS
    )
    for (const r of reads)
      if (r.ok && r.value && (wanted.get(r.value.taxonomy) ?? new Set()).has(r.value.slug))
        found.push(r.value)
  }
  return found
}

/**
 * The categories and tags of the posts: in the site's language when it has another one (names and plain descriptions,
 * translated), and the categories named for the business on a FULL site. Nothing written. Never rejects for one part: what
 * could not be planned keeps the template's words, said.
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.read - a door call that throws on a refusal
 * @param {Post[]} input.posts - the published posts (`listPosts`)
 * @param {boolean} input.rewrite - the customer described the business (FULL)
 * @param {string | null} input.language - the one language the site is written in when it is not the template's, else null
 * @param {Translate} input.translate
 * @param {(note: string) => void} input.note
 * @param {string} [input.about] - the business description
 * @param {unknown} [input.name] - the business's name, which no category is
 * @param {((call: { system: string, input: unknown }) => Promise<string>) | null} [input.generate] - the model the categories are
 *   named by; null keeps their names
 * @param {string | null} [input.titleLanguage] - the language the site is written in (the template's when `language` is null)
 * @returns {Promise<{ terms: Array<{ taxonomy: string, id: number, fields: Record<string, string> }>, renamed: Array<{ id: number, slug: string, from: string, to: string }> }>}
 *   `renamed`: the categories named for the business, their demo name and their new one
 */
export async function planTerms({
  read,
  posts,
  rewrite,
  language,
  translate,
  note,
  about = '',
  name = '',
  generate = null,
  titleLanguage = null
}) {
  /** @type {Awaited<ReturnType<typeof planTerms>>} */
  const out = { terms: [], renamed: [] }
  const renaming = rewrite && generate !== null
  if ((!language && !renaming) || posts.length === 0) return out
  const wanted = new Map([
    ['category', new Set(posts.flatMap((post) => post.categories ?? []))],
    ...(language ? [['post_tag', new Set(posts.flatMap((post) => post.tags ?? []))]] : [])
  ])
  const terms = await findTerms(read, /** @type {Map<string, Set<string>>} */ (wanted))
  /** @type {Record<string, string>} */
  const said = language
    ? await translate(
        terms.flatMap((t) => [
          { key: `${t.taxonomy}-${t.id}#name`, sample: t.name, maxCharacters: roomOf(t.name) },
          // A plain description is translated; one holding markup keeps its words.
          ...(t.description.trim() !== '' && !/<[a-z/!]/i.test(t.description)
            ? [
                {
                  key: `${t.taxonomy}-${t.id}#description`,
                  sample: t.description,
                  maxCharacters: roomOf(t.description)
                }
              ]
            : [])
        ]),
        'the blog categories and tags'
      )
    : {}
  /** @type {Map<string, string>} the demo name of a category → its name for the business */
  const trade = new Map()
  if (renaming) {
    // WordPress's own default category is no topic: it keeps today's name.
    const own = terms.filter((t) => t.taxonomy === 'category' && t.slug !== 'uncategorized')
    const categories = [...new Set(own.map((t) => t.name))].map((title, i) => ({
      key: `c${i + 1}`,
      name: title,
      posts: posts.filter((post) =>
        own.some((t) => t.name === title && (post.categories ?? []).includes(t.slug))
      ).length
    }))
    const renamed = await tradeCategoryNames({
      categories,
      about,
      name,
      language: titleLanguage,
      translations: own.map((t) => said[`category-${t.id}#name`] ?? '').filter(Boolean),
      generate
    })
    if (renamed.names) for (const c of categories) trade.set(c.name, renamed.names[c.key])
    else if (categories.length > 0)
      note(
        `${categories.length} blog category name(s) were NOT renamed for the business and keep the template’s names${language ? ', translated' : ''}: ${renamed.why}`
      )
  }
  for (const t of terms) {
    /** @type {Record<string, string>} */
    const fields = {}
    const next = (
      (t.taxonomy === 'category' ? trade.get(t.name) : undefined) ??
      said[`${t.taxonomy}-${t.id}#name`] ??
      ''
    ).trim()
    if (next !== '' && next !== t.name) fields.name = next
    const description = said[`${t.taxonomy}-${t.id}#description`]
    if (description && description !== t.description) fields.description = description
    if (Object.keys(fields).length > 0) out.terms.push({ taxonomy: t.taxonomy, id: t.id, fields })
    const to = t.taxonomy === 'category' ? trade.get(t.name) : undefined
    if (to) out.renamed.push({ id: t.id, slug: t.slug, from: t.name, to })
  }
  return out
}

/**
 * Write what `planPosts` and `planTerms` planned, one write at a time (a site takes one writer), all under `applyId`. A write the
 * site refuses costs that post or term only, and is counted in one note.
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.call
 * @param {string} input.applyId
 * @param {Array<{ id: number, fields: Record<string, string> }>} input.writes - the posts' (`planPosts`)
 * @param {Array<{ taxonomy: string, id: number, fields: Record<string, string> }>} input.terms - the terms' (`planTerms`)
 * @param {(note: string) => void} input.note
 * @returns {Promise<{ posts: number, terms: number }>}
 */
export async function writePosts({ call, applyId, writes, terms, note }) {
  const done = { posts: 0, terms: 0 }
  let refused = 0
  const write = async (/** @type {Record<string, unknown>} */ params) => {
    try {
      const answer = await call('content.update', { apply_id: applyId, ...params })
      if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
      return true
    } catch {
      refused += 1
      return false
    }
  }
  for (const w of writes) if (await write({ kind: 'post', id: w.id, fields: w.fields })) done.posts += 1
  for (const t of terms)
    if (await write({ kind: 'term', id: t.id, key: t.taxonomy, fields: t.fields })) done.terms += 1
  if (refused > 0)
    note(`${refused} demo post(s) or categories could not be changed and keep the template’s words`)
  return done
}
