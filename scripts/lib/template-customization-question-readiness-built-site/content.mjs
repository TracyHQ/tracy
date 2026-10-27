/**
 * The content checks of the Template Customization Question Readiness built-site check, comparing a built page with the same page of the demo:
 * - `articleOf`: the title of an article page (WordPress single post, Joomla article view, an
 *   EmDash `/news|blog|posts/<slug>` page) and which article it is (id, canonical address or body words), for
 *   POSTS (ABOUT-2, D10);
 * - `repeatedTitles`: titles used by more than one article, and pairs that differ by a word or two
 *   ("Bánh nướng mỗi sáng" / "Bánh mì nướng mỗi sáng"), apart from repeats the demo has at the same paths;
 * - `blockChanges`: the blocks of a BLANK page whose words differ from the demo's once the company
 *   names are taken out (BLANK = demo except the name);
 * - `stretchedLabels`: a short label of the demo that became a long sentence (`Details` → `Banner được lưu thành công.`),
 *   the mark of a translation taken from another string (LANG-2);
 * - `unchangedLines`: lines of a kit page still identical to the demo's English (K3, LANG-2).
 */

const text = (/** @type {any} */ el) =>
  String(el?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** The article a page shows, or null. */
export function articleOf(/** @type {any} */ doc, /** @type {string} */ path) {
  const body = String(doc.body?.getAttribute('class') ?? '')
  const isArticle =
    /\bsingle-post\b|\bview-article\b/.test(body) || /^\/(news|blog|posts?)\/[^/]+\/?$/.test(path)
  if (!isArticle) return null
  const title = text(doc.querySelector('[itemprop=headline], .page-header h1, .page-header h2, main h1, h1'))
  if (!title) return null
  return { title, key: identityOf(doc, body, path) ?? path }
}

/**
 * Which article a page shows, whatever route reached it. Measured 11/10/2026 on dev g61 (Joomla, FULL): one article shown by a
 * category-blog route and a category-style-3 route, with no canonical link, was keyed by path and counted as an exact "×2"
 * pair. The id comes first (WordPress `postid-N`, the Joomla edit link `a_id=N`), then the canonical link, then the words of
 * the article body; null when the page says none of them.
 */
function identityOf(/** @type {any} */ doc, /** @type {string} */ body, /** @type {string} */ path) {
  const post = /\bpostid-(\d+)\b/.exec(body)
  if (post) return `id:${post[1]}`
  for (const a of doc.querySelectorAll('a[href*="a_id="]')) {
    const id = /[?&]a_id=(\d+)/.exec(String(a.getAttribute('href') ?? ''))
    if (id) return `id:${id[1]}`
  }
  // 🔒 A JOOMLA ARTICLE IS ITS ALIAS AND ITS PUBLISH TIME (g62, 11/10/2026). On g62-ess-j-full the category-style-3 route of an
  // article hides its first intro paragraph, so its body differs from the category-blog route's, and a visitor's page
  // prints neither an id nor a canonical link: one article counted as a "×2" pair. The last segment of the article's own
  // route is its alias (an `<id>-` in front dropped), and `datePublished` carries the second it was published.
  const published = doc.querySelector('[itemprop=datePublished][datetime]')?.getAttribute('datetime')
  const alias = String(path ?? '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .split('/')
    .pop()
    ?.replace(/^\d+-/, '')
  if (/\bview-article\b/.test(body) && published && alias) return `joomla:${alias}@${published}`
  const canonical = doc.querySelector('link[rel=canonical]')?.getAttribute('href')
  if (canonical) return canonical
  const words = text(doc.querySelector('[itemprop=articleBody], .com-content-article__body, .entry-content'))
  return words ? `body:${words.slice(0, 400)}` : null
}

const tokens = (/** @type {string} */ s) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])

/** True when two titles differ by a word or two ("Bánh nướng mỗi sáng" / "Bánh mì nướng mỗi sáng"). */
function nearTitles(/** @type {string} */ x, /** @type {string} */ y) {
  const a = tokens(x)
  const b = tokens(y)
  if (a.size < 3 || b.size < 3) return false
  const shared = [...a].filter((t) => b.has(t)).length
  return shared / (a.size + b.size - shared) >= 0.6
}

/**
 * Titles used by more than one article (`same`) and near-identical pairs (`near`). With `demoTitle`
 * (the demo's title of the article at the same path), a repeat the demo already has (its articles
 * at those paths share one title, or are a near pair themselves) goes to `mirrored` instead: FULL
 * translates demo posts and never rewrites them (12/10/2026), so the demo's own repeats stay.
 * @param {{ title: string, key: string, path?: string }[]} articles one per published article
 * @param {{ demoTitle?: (a: { title: string, key: string, path?: string }) => string | null }} [opts]
 * @returns {{ same: string[], near: string[], mirrored: string[] }}
 */
export function repeatedTitles(articles, { demoTitle = () => null } = {}) {
  const by = new Map()
  // One article reached by two routes is one post (`articleOf` keys it by what it is, not where it was read).
  for (const a of new Map(articles.map((x) => [x.key, x])).values())
    by.set(a.title.toLowerCase(), [...(by.get(a.title.toLowerCase()) ?? []), a])
  const asDemo = (/** @type {Array<{ title: string, key: string, path?: string }>} */ group) => {
    const before = group.map((a) => demoTitle(a)?.toLowerCase() ?? null)
    if (before.some((t) => t === null)) return false
    const [first, ...rest] = /** @type {string[]} */ (before)
    return rest.every((t) => t === first || nearTitles(t, first))
  }
  const same = []
  const near = []
  const mirrored = []
  for (const g of by.values())
    if (g.length > 1) (asDemo(g) ? mirrored : same).push(`"${g[0].title}" ×${g.length}`)
  const groups = [...by.values()]
  for (let i = 0; i < groups.length; i += 1)
    for (let j = i + 1; j < groups.length; j += 1)
      if (nearTitles(groups[i][0].title, groups[j][0].title))
        (asDemo([groups[i][0], groups[j][0]]) ? mirrored : near).push(
          `"${groups[i][0].title}" ~ "${groups[j][0].title}"`
        )
  return { same, near, mirrored }
}

const BLOCKS = [
  'header',
  'footer',
  'main > *',
  'main section',
  'form',
  '.t4-section',
  '#t4-main-body .t4-module'
]

/** The blocks of a page, keyed by tag, id or first class, and order. */
function blocksOf(/** @type {any} */ doc) {
  const seen = new Set()
  const count = new Map()
  const out = new Map()
  for (const sel of BLOCKS)
    for (const el of doc.querySelectorAll(sel)) {
      if (seen.has(el)) continue
      seen.add(el)
      const sig = `${el.tagName.toLowerCase()}${el.id && !/\d{2,}/.test(el.id) ? `#${el.id}` : ''}.${String(el.getAttribute('class') ?? '').split(/\s+/)[0]}`
      count.set(sig, (count.get(sig) ?? 0) + 1)
      out.set(`${sig}@${count.get(sig)}`, el)
    }
  return out
}

// A handle or an address printed inside a link ("@northgate_ind", "t.me/northgate_ind",
// "/company/northgate"): when the link's own address holds it, it is the link itself, emptied with
// it under K6.
const HANDLE = /^(@[\w.-]+|(?:[\w-]+\.)+[a-z]{2,}(\/\S*)?|\/[\w./@-]+)$/i
const isHandleOf = (/** @type {string} */ t, /** @type {string} */ href) =>
  HANDLE.test(t) && href.toLowerCase().includes(t.replace(/^[@/]+/, '').toLowerCase())

/** Text without the given names (every spelling, any case, whole words). */
function withoutNames(/** @type {string} */ text, /** @type {string[]} */ names) {
  let t = text
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const quoted = n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (quoted) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${quoted}(?![\\p{L}\\p{N}])`, 'giu'), ' ')
  }
  return t
}

const key = (/** @type {string} */ s, /** @type {string[]} */ names) =>
  withoutNames(s, names).replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The text of an element outside scripts and styles. Left out:
 * - a list item showing one of the site's own articles by its title (`titles`, names taken out on
 *   both sides): a list ordered by hits, at random or on tied dates shows other articles on every
 *   build, with their own dates and categories — a selection, not a rewrite. The article pages
 *   themselves are still compared;
 * - the handle lines of a link (K6).
 * @param {any} el @param {Set<string>} titles @param {string[]} names
 */
function visibleText(el, titles, names) {
  const listed = (/** @type {any} */ a) =>
    titles.size > 0 && titles.has(key(String(a.textContent ?? ''), names))
  const items = [...(el.querySelectorAll?.('a') ?? [])].filter(listed)
  /** @type {Set<any>} */
  const skip = new Set()
  for (const a of items) {
    // The whole item (its category, date, picture) when it shows this one article and no other.
    const item = a.closest('li, article, [class*=item]')
    const shown = item && new Set(items.filter((x) => item.contains(x)).map((x) => x.getAttribute('href')))
    skip.add(item && item !== el && el.contains(item) && shown?.size === 1 ? item : a)
  }
  let out = ''
  /** A handle line of a link that says more than it (a card); a link whose label is the address stays. */
  const handleLine = (/** @type {string} */ t, /** @type {any} */ a) =>
    a && isHandleOf(t, a.getAttribute('href') ?? '') && String(a.textContent ?? '').trim() !== t
  /** @param {any} n @param {any} a the link the node is in */
  const walk = (n, a) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeType === 3) {
        if (!handleLine(String(c.textContent).trim(), a)) out += ` ${c.textContent}`
      } else if (c.nodeType === 1 && !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/i.test(c.tagName) && !skip.has(c))
        walk(c, c.tagName === 'A' ? c : a)
    }
  }
  walk(el, null)
  return out.replace(/\s+/g, ' ')
}

/** The words of an element, without the given names, as a count per word. */
function wordCounts(/** @type {any} */ el, /** @type {string[]} */ names, /** @type {Set<string>} */ titles) {
  const t = withoutNames(visibleText(el, titles, names), names)
  const counts = new Map()
  for (const w of String(t)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [])
    if (!/^\d+$/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  return counts
}

/**
 * Blocks of a BLANK page whose words differ from the demo's beyond the name swap.
 * @param {any} site @param {any} demo @param {string[]} names both companies' names, every spelling
 * @param {{ titles?: Map<string, string> }} [opts] `titles`: the site's article titles (by path)
 */
export function blockChanges(site, demo, names, min = 3, { titles } = {}) {
  const listed = new Set([...(titles?.values() ?? [])].map((t) => key(t, names)).filter(Boolean))
  const s = blocksOf(site)
  const out = []
  for (const [key, el] of blocksOf(demo)) {
    const other = s.get(key)
    if (!other) {
      if (text(el).length > 20) out.push(`${key}: missing on the site ("${text(el).slice(0, 60)}")`)
      continue
    }
    const a = wordCounts(el, names, listed)
    const b = wordCounts(other, names, listed)
    const removed = [...a].filter(([w, n]) => (b.get(w) ?? 0) < n).map(([w]) => w)
    const added = [...b].filter(([w, n]) => (a.get(w) ?? 0) < n).map(([w]) => w)
    if (removed.length + added.length >= min)
      out.push(`${key}: -[${removed.slice(0, 8).join(' ')}] +[${added.slice(0, 8).join(' ')}]`)
  }
  return out
}

const LABELS = 'dt, label, legend, th, button, .article-info-term, .module-title, .module-header, h3.title'

/** Short demo labels that became long sentences on the site, paired by tag and order. */
export function stretchedLabels(/** @type {any} */ site, /** @type {any} */ demo) {
  // Paired by tag and class, in order: the n-th `dt.article-info-term` of the demo and of the site.
  const pairs = (/** @type {any} */ doc) => {
    const by = new Map()
    for (const el of doc.querySelectorAll(LABELS)) {
      const key = `${el.tagName}.${el.getAttribute('class') ?? ''}`
      by.set(key, [...(by.get(key) ?? []), text(el)])
    }
    return by
  }
  const s = pairs(site)
  const out = new Set()
  for (const [key, labels] of pairs(demo))
    labels.forEach((before, i) => {
      const after = s.get(key)?.[i] ?? ''
      if (!before || before.length > 24) return
      if (after.length >= Math.max(before.length * 2.5, before.length + 12) && /[.!?]$/.test(after))
        out.add(`"${before}" → "${after}"`)
    })
  return [...out]
}

const LINES =
  'main p, main h1, main h2, main h3, main h4, main h5, main h6, main li, main td, main th, main blockquote, main label, main button, main .alert, .item-page p, .item-page h1, .item-page h2, .item-page h3, .item-page li'

/** Lines of a kit page that are still the demo's own words and read as English. */
export function unchangedLines(
  /** @type {any} */ site,
  /** @type {any} */ demo,
  /** @type {(s: string) => boolean} */ english
) {
  const demoLines = new Set([...demo.querySelectorAll(LINES)].map(text))
  return [...new Set([...site.querySelectorAll(LINES)].map(text))].filter(
    (l) => l && demoLines.has(l) && english(l)
  )
}
