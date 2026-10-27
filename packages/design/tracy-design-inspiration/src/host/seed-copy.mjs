/**
 * The two model turns of the seeder, as pure prompt builders and parsers (spec: tasks/todo-seeder.md,
 * Lee's decisions 1 and 2 of 07/09): the blog — five to seven posts written from what the customer
 * said about the site — and the words of the section library's landing, one text per slot. Neither
 * touches a model or the disk; `index.ts` carries the prompt to `ctx.llm` (or OpenRouter, when the
 * posts come with images) and the answer back through the parser. What the parser refuses is
 * refused whole — a half-seeded blog is worse than none.
 */
import { clampToSlot } from './copy.mjs'
import { slotLimits } from './gallery.mjs'

export const POSTS_MIN = 5
export const POSTS_MAX = 7
const TITLE_MAX = 80
const EXCERPT_MAX = 200
const PARAGRAPHS_MIN = 3
const PARAGRAPHS_MAX = 5
const IMAGE_PROMPT_MAX = 300

/**
 * What the customer told us, gathered by the fork stage or read from the site: the brief, the site's
 * own words, the text of the attachments. Trimmed here so one turn stays one turn.
 * @typedef {{ about?: string | null, site?: { name?: string|null, headline?: string|null, sub?: string|null, nav?: string[] } | null, extracts?: string[] | null, lang?: string | null }} Words
 */

const WORDS_MAX = 6000

/** @param {Words} words */
export function wordsBrief(words) {
  const parts = []
  if (words.site?.name) parts.push(`Site: ${words.site.name}`)
  if (words.site?.headline) parts.push(`Headline: ${words.site.headline}`)
  if (words.site?.sub) parts.push(`Lead: ${words.site.sub}`)
  if (Array.isArray(words.site?.nav) && words.site.nav.length > 0)
    parts.push(`Navigation: ${words.site.nav.join(' · ')}`)
  if (words.about) parts.push(`About, in the customer's words:\n${words.about.trim()}`)
  for (const x of words.extracts ?? []) if (typeof x === 'string' && x.trim() !== '') parts.push(x.trim())
  const text = parts.join('\n\n')
  return text.length > WORDS_MAX ? `${text.slice(0, WORDS_MAX)}…` : text
}

/** `true` when there is something to write from. @param {Words} words */
export function hasWords(words) {
  return wordsBrief(words).trim().length >= 40
}

/**
 * @param {{ words: Words, count?: number, withImages?: boolean }} o
 * @returns {{ role: 'system' | 'user', content: string }[]}
 */
export function buildPostsPrompt({ words, count = 6, withImages = false }) {
  const n = Math.min(POSTS_MAX, Math.max(POSTS_MIN, count))
  const lang = words.lang && words.lang !== 'en' ? ` Write in the language with code "${words.lang}".` : ''
  return [
    {
      role: 'system',
      content:
        'You write the first blog posts of a company website. Plain, specific, no marketing filler, no invented facts, ' +
        'numbers or names beyond what the brief says. Answer with JSON only — no prose, no code fence.'
    },
    {
      role: 'user',
      content:
        `Write ${n} blog posts for this site.${lang}\n\n${wordsBrief(words)}\n\n` +
        `Return a JSON array of ${n} objects with exactly these keys: ` +
        `"title" (≤ ${TITLE_MAX} characters), "slug" (lowercase, hyphens), "excerpt" (one sentence, ≤ ${EXCERPT_MAX} characters), ` +
        `"paragraphs" (an array of ${PARAGRAPHS_MIN} to ${PARAGRAPHS_MAX} paragraphs, each 40–90 words), ` +
        `"imagePrompt" (≤ ${IMAGE_PROMPT_MAX} characters: a photographic scene for the post's cover, no text in the image)` +
        (withImages ? '. After the JSON, generate one cover image per post, in the same order.' : '.')
    }
  ]
}

/** The first JSON value in a model answer, fences and prose around it ignored. @param {string} text */
function firstJson(text) {
  const t = text.replace(/```(?:json)?/gi, '')
  const start = Math.min(...['[', '{'].map((c) => t.indexOf(c)).filter((i) => i >= 0))
  if (!Number.isFinite(start)) return null
  for (let end = t.length; end > start; end--) {
    const c = t[end - 1]
    if (c !== ']' && c !== '}') continue
    try {
      return JSON.parse(t.slice(start, end))
    } catch {
      /* keep trimming */
    }
  }
  return null
}

/** @param {unknown} s */
export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * @typedef {{ title: string, slug: string, excerpt: string, paragraphs: string[], imagePrompt: string }} Post
 * @param {string} text - the model's answer
 * @returns {{ ok: true, posts: Post[] } | { ok: false, error: string }}
 */
export function parsePosts(text) {
  const json = firstJson(text)
  const list = Array.isArray(json) ? json : Array.isArray(json?.posts) ? json.posts : null
  if (!list) return { ok: false, error: 'no JSON array of posts in the answer' }
  const posts = []
  const seen = new Set()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const title = String(raw.title ?? '')
      .trim()
      .slice(0, TITLE_MAX)
    const paragraphs = (Array.isArray(raw.paragraphs) ? raw.paragraphs : [])
      .map((/** @type {unknown} */ p) => String(p ?? '').trim())
      .filter((/** @type {string} */ p) => p !== '')
      .slice(0, PARAGRAPHS_MAX)
    if (title === '' || paragraphs.length < PARAGRAPHS_MIN) continue
    let slug = slugify(raw.slug || title)
    if (slug === '') slug = `post-${posts.length + 1}`
    while (seen.has(slug)) slug = `${slug}-2`
    seen.add(slug)
    posts.push({
      title,
      slug,
      excerpt: String(raw.excerpt ?? paragraphs[0])
        .trim()
        .slice(0, EXCERPT_MAX),
      paragraphs,
      imagePrompt: String(raw.imagePrompt ?? '')
        .trim()
        .slice(0, IMAGE_PROMPT_MAX)
    })
  }
  if (posts.length < POSTS_MIN)
    return { ok: false, error: `${posts.length} usable posts, ${POSTS_MIN} needed` }
  return { ok: true, posts: posts.slice(0, POSTS_MAX) }
}

/**
 * @typedef {{ id: string, role: string, words: number, chars: number, text: string }} Slot
 * @param {{ words: Words, sections: Record<string, Slot[]> }} o - slot maps per section, from `fragmentSlots`
 * @returns {{ role: 'system' | 'user', content: string }[]}
 */
export function buildSectionsPrompt({ words, sections }) {
  const lang = words.lang && words.lang !== 'en' ? ` Write in the language with code "${words.lang}".` : ''
  const lines = []
  for (const [name, slots] of Object.entries(sections)) {
    lines.push(`## ${name}`)
    for (const s of slots) {
      const lim = slotLimits(s)
      lines.push(`- ${s.id} (${s.role}, ${lim.min}–${lim.max} ${lim.unit}): "${s.text}"`)
    }
  }
  return [
    {
      role: 'system',
      content:
        'You rewrite the sections of a landing page for a company, keeping every slot the same length as the sample ' +
        'it replaces. Plain and specific; no invented facts, numbers or names beyond the brief. Answer with JSON only.'
    },
    {
      role: 'user',
      content:
        `The company:${lang}\n\n${wordsBrief(words)}\n\n` +
        'Each section below lists its slots: id, role, the length to keep, and the sample text. Write a replacement for ' +
        'every slot. Keep numbers, prices and labels only where the brief supports them; otherwise write something true ' +
        'to the company.\n\n' +
        `${lines.join('\n')}\n\n` +
        'Return one JSON object: { "<section>": { "<slot id>": "<text>", … }, … }.'
    }
  ]
}

/**
 * @param {string} text - the model's answer
 * @param {Record<string, Slot[]>} sections
 * @returns {{ ok: true, copy: Record<string, Record<string, string>>, missing: string[] } | { ok: false, error: string }}
 */
export function parseSectionsCopy(text, sections) {
  const json = firstJson(text)
  if (!json || typeof json !== 'object' || Array.isArray(json))
    return { ok: false, error: 'no JSON object of sections in the answer' }
  /** @type {Record<string, Record<string, string>>} */
  const copy = {}
  const missing = []
  let filled = 0
  let total = 0
  for (const [name, slots] of Object.entries(sections)) {
    const given = json[name] && typeof json[name] === 'object' ? json[name] : {}
    copy[name] = {}
    for (const s of slots) {
      total++
      const v = given[s.id]
      if (typeof v !== 'string' || v.trim() === '') {
        missing.push(`${name}/${s.id}`)
        continue
      }
      copy[name][s.id] = clampToSlot(v, s)
      filled++
    }
  }
  if (total === 0) return { ok: false, error: 'no slots to fill' }
  if (filled < total * 0.8) return { ok: false, error: `only ${filled} of ${total} slots written` }
  return { ok: true, copy, missing }
}
