/**
 * The Tracy guide: one short article for each thing a customer can do in Tracy, read by BOTH of
 * the places that answer "how do I…" about Tracy itself — the site agent in the chat (the
 * `tracy_guide` tool, through `GET /api/sites/_conversation/guide`) and the `/help` answer.
 *
 * WHY ONE SET OF ARTICLES. Before this, `/help` kept its product facts as hand-typed text in
 * `assistant/prompt.js` and the site agent kept none, so a feature that shipped later (own domain,
 * 06–09/10/2026) was missed by one and wrong in the other. The articles live in the tracy-web
 * image: a wording fix is one image, and a feature's article is checked against the operator's
 * switch catalogue by `scripts/check-guide-coverage.ts`.
 *
 * 🔒 WHAT AN ARTICLE MAY SAY IS WHAT THE SCREEN SAYS. Each article is written from the screen's own
 * strings and the door's own rules, and carries `checked:` (date + commit it was compared with).
 * An article that is not known to be true is left out; the model is told to say "I don't know"
 * (`assistant/prompt.js` rule 7), never to fill a gap.
 *
 * 🔒 THE SWITCH DECIDES. An article whose `switch:` is off on this deployment (`/ops` › User
 * Interface) is not offered at all, as `designFact` does for `/help`: a guide that explains a button
 * the operator hid sends people to a screen that is not there. `switch: none:<reason>` marks a
 * feature that has no switch (always there).
 *
 * Nothing here reads a database or a site: the live state of a site is added by the caller
 * (`sites/guide.js`), from the same reader the screen uses.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ARTICLES_DIR = fileURLToPath(new URL('../guide/articles/', import.meta.url))

/** The roles an article can name, in the order the seat book ranks them. */
export const GUIDE_ROLES = Object.freeze(['viewer', 'editor', 'owner'])

/**
 * @typedef {object} GuideArticle
 * @property {string} id
 * @property {string} title
 * @property {string} switchId - the catalogue switch, or '' when the feature has none
 * @property {string | null} noSwitchReason - why there is none (`none:<reason>`)
 * @property {string} tab - the Tracy tab that holds the feature (`tracy:site-publish`), or ''
 * @property {readonly string[]} roles - who can DO it ([] = everyone); others are told who can
 * @property {readonly string[]} platforms
 * @property {readonly string[]} keywords
 * @property {string} checked
 * @property {string} body
 */

/** `a, b, c` inside brackets → ['a','b','c'] (the only list shape the articles use). */
function listOf(raw) {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  return inner
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter((item) => item !== '')
}

/**
 * One article file → an article. Throws on a file that does not follow the format, so a broken
 * article stops the server's start-up and the test, never a customer's answer.
 * @param {string} text
 * @param {string} file - for the error message
 * @returns {GuideArticle}
 */
export function parseArticle(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error(`guide article ${file}: no frontmatter`)
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':')
    if (at < 1) throw new Error(`guide article ${file}: bad frontmatter line "${line}"`)
    fields[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  for (const key of ['id', 'title', 'switch', 'tab', 'roles', 'platforms', 'keywords', 'checked'])
    if (fields[key] === undefined) throw new Error(`guide article ${file}: missing "${key}"`)
  const none = fields.switch.startsWith('none:')
  const roles = listOf(fields.roles)
  for (const role of roles)
    if (!GUIDE_ROLES.includes(role)) throw new Error(`guide article ${file}: unknown role "${role}"`)
  const body = match[2].trim()
  if (body === '') throw new Error(`guide article ${file}: empty body`)
  return {
    id: fields.id,
    title: fields.title,
    switchId: none ? '' : fields.switch,
    noSwitchReason: none ? fields.switch.slice('none:'.length) : null,
    tab: fields.tab.replace(/^['"]|['"]$/g, ''),
    roles,
    platforms: listOf(fields.platforms),
    keywords: listOf(fields.keywords),
    checked: fields.checked,
    body
  }
}

/**
 * Every article of a directory.
 * @param {string} [dir]
 * @returns {GuideArticle[]}
 */
export function loadArticles(dir = ARTICLES_DIR) {
  const articles = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => parseArticle(readFileSync(`${dir}/${name}`, 'utf8'), name))
  const seen = new Set()
  for (const article of articles) {
    if (seen.has(article.id)) throw new Error(`guide: two articles with id "${article.id}"`)
    seen.add(article.id)
  }
  return articles
}

/** @type {GuideArticle[] | null} */
let loaded = null
/** The articles, read once. */
export function articles() {
  loaded ??= loadArticles()
  return loaded
}

/** Lower-case, accents folded, so "ten mien" finds "tên miền". */
export function fold(text) {
  return text.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * The articles this person may be told about: the feature's switch is on, and the site's platform
 * is one the article covers. The ROLE does not remove an article — it changes what is said (the
 * caller adds "only an Owner can do this"), because a Viewer who asks how to publish needs to hear
 * who can, not silence.
 * @param {readonly string[]} hidden - switches off on this deployment (`readUiHidden`)
 * @param {string | null} [platform]
 * @param {GuideArticle[]} [list]
 */
export function available(hidden, platform = null, list = articles()) {
  return list.filter(
    (a) =>
      (a.switchId === '' || !hidden.includes(a.switchId)) &&
      (platform === null || a.platforms.length === 0 || a.platforms.includes(platform))
  )
}

/**
 * Articles that answer a question, best first. A keyword or title word found in the question scores;
 * no embedding, no model: the match is the same on every run, and a miss is an empty list the caller
 * answers with the topic list.
 * @param {string} query
 * @param {GuideArticle[]} list
 * @param {number} [limit]
 */
export function search(query, list, limit = 3) {
  const q = fold(query)
  if (q.trim() === '') return []
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
  const scored = list.map((article) => {
    let score = 0
    for (const keyword of article.keywords) {
      const k = fold(keyword)
      if (k.includes(' ') ? q.includes(k) : words.includes(k)) score += k.includes(' ') ? 3 : 2
    }
    for (const word of fold(article.title).split(/[^a-z0-9]+/))
      if (word.length >= 4 && words.includes(word)) score += 1
    return { article, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, limit)
    .map((s) => s.article)
}

/** One line per article, for "what can you tell me about". */
export function topics(list) {
  return list.map((a) => ({ id: a.id, title: a.title }))
}

/**
 * The link that opens the article's screen, on the same address the `/help` links use
 * (`?tab=<tab>&site=<name>` on the site's workspace URL). Null for a feature with no tab of its own.
 * @param {GuideArticle} article
 * @param {{ workspaceUrl: string, name: string } | null} site
 * @returns {{ label: string, href: string } | null}
 */
export function screenLink(article, site) {
  if (!site || article.tab === '') return null
  return {
    label: article.title,
    href: `${site.workspaceUrl}?tab=${article.tab}&site=${encodeURIComponent(site.name)}`
  }
}

/**
 * What to tell a person whose role cannot do what the article describes.
 * @param {GuideArticle} article
 * @param {string | null} role
 * @returns {string | null}
 */
export function roleNote(article, role) {
  if (article.roles.length === 0 || role === null || article.roles.includes(role)) return null
  const who = article.roles.map((r) => `an ${r === 'owner' ? 'Owner' : r === 'editor' ? 'Editor' : 'Viewer'}`)
  return `Your role on this site (${role}) cannot do this. It takes ${who.join(' or ')}: ask one of them.`
}
