/**
 * What a visitor reads on one page of a built site, and which of it is still English, for the
 * Template Customization Question Readiness built-site check (`scripts/template-customization-question-readiness-built-site.mjs`, spec LANG-2):
 *
 *   const doc = documentOf(html)
 *   visibleRuns(doc)                       // ['Chia sẻ bài viết', 'Share article', ...]
 *   isEnglish('Share article', { lang: 'vi', allow })   // true
 *
 * A run is one text node (scripts, styles, `<code>`/`<pre>` and SVG left out) or a visible
 * attribute: `placeholder`, `title`, the `aria-label` of a control, the `value` of a submit button.
 * A run is English when its words are mostly common English words (`english-words.json`): on a
 * Vietnamese site only runs without a single Vietnamese letter are read, so a Vietnamese sentence
 * never counts, and neither does a person's name (two or three capitalised words, one of them a
 * first name of `names` or not a common English word). Allowed words (the loanwords a language really uses, like "Email" in Vietnamese,
 * the business name, words the customer wrote) are taken out first.
 */
import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'

const WORDS = JSON.parse(readFileSync(new URL('./english-words.json', import.meta.url), 'utf8'))
const LEXICON = new Set(WORDS.words)
const NAMES = new Set(WORDS.names)
/** A common English word, also in its plural or possessive form. */
const known = (/** @type {string} */ w) =>
  [w, w.replace(/['’]s$/, ''), w.replace(/s$/, ''), w.replace(/es$/, '')].some((x) => LEXICON.has(x))

/** Loanwords each language writes as English does, per its own core translations. */
export const LOANWORDS = /** @type {Record<string, string[]>} */ ({
  vi: [
    'email',
    'e-mail',
    'website',
    'web',
    'blog',
    'video',
    'videos',
    'online',
    'logo',
    'menu',
    'hotline',
    'podcast',
    'wifi',
    'internet',
    'fanpage',
    'ok',
    'pdf',
    'sms',
    'gps',
    'id',
    'url',
    'rss',
    'facebook',
    'instagram',
    'twitter',
    'youtube',
    'tiktok',
    'zalo',
    'linkedin',
    'pinterest',
    'google',
    'telegram',
    'whatsapp',
    'github',
    'x'
  ]
})

const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|CODE|PRE|KBD|SAMP|SVG)$/i
const CONTROLS = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/i

export const documentOf = (/** @type {string} */ html) => parseHTML(String(html ?? '')).document

const clean = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').trim()

/**
 * Every text a visitor reads on the page, once each element is read.
 * @param {any} doc a document from `documentOf`
 * @returns {string[]}
 */
export function visibleRuns(doc) {
  const out = []
  /** @param {any} node */
  const walk = (node) => {
    for (const c of node.childNodes ?? []) {
      if (c.nodeType === 3) {
        const t = clean(c.textContent ?? '')
        if (t) out.push(t)
      } else if (c.nodeType === 1 && !SKIP.test(c.tagName) && !c.closest?.('svg') && !hiddenInline(c)) {
        for (const a of ['placeholder', 'title']) if (c.getAttribute(a)) out.push(clean(c.getAttribute(a)))
        if (CONTROLS.test(c.tagName) && c.getAttribute('aria-label'))
          out.push(clean(c.getAttribute('aria-label')))
        if (c.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(c.getAttribute('type') ?? ''))
          out.push(clean(c.getAttribute('value') ?? ''))
        walk(c)
      }
    }
  }
  walk(doc.body ?? doc)
  return out.filter(Boolean)
}

/** An element its own `style` hides (`display: none`): a visitor never reads it (Joomla's hidden publisher name). */
const hiddenInline = (/** @type {any} */ el) =>
  /(?:^|;)\s*display\s*:\s*none\b/i.test(el.getAttribute?.('style') ?? '')

/** A class that marks a person's name: `author`, `je-meta__author`, `wp-block-post-author-name`, `author_name`. */
const AUTHOR_CLASS = /(?:^|[-_])author(?:[-_]?name)?$/i

/**
 * The people's names a page marks as such: an author's byline (a class ending in `author` or `author-name`, a link with
 * `rel="author"`) and the `name` of a schema.org Person or of an `author`. A name is kept by rule (LANG-2): the demo's
 * authors ("Alfonso Cortez", "Faith Singleton") are no English words left, even when each word is also an English word.
 * Only short runs count, so a whole English biography under an author's mark is still read.
 * @param {any} doc @returns {Set<string>}
 */
export function personNames(doc) {
  const out = new Set()
  const holders = [
    ...doc.querySelectorAll(
      '[rel~="author"], [itemprop="author"] [itemprop="name"], [itemtype*="schema.org/Person"] [itemprop="name"]'
    ),
    ...[...doc.querySelectorAll('[class]')].filter((el) =>
      String(el.getAttribute('class') ?? '')
        .split(/\s+/)
        .some((c) => AUTHOR_CLASS.test(c))
    )
  ]
  for (const el of holders) {
    const t = clean(el.textContent ?? '')
    if (t && t.split(' ').length <= 4) out.add(t)
  }
  return out
}

// Two-letter words that are English words; any other two-letter piece ("ha", "m²") is not read.
const SHORT = new Set('by of to in on at or is it me my no up us we an as be do go if so en'.split(' '))

/** The words of a run, lowercase, without the allowed ones; a piece glued to digits (`#14171A`) is no word. */
function wordsOf(/** @type {string} */ run, /** @type {Set<string>} */ allow) {
  return (run.toLowerCase().match(/(?<![\p{L}\p{N}])[a-z]+(?:['’-][a-z]+)*(?![\p{L}\p{N}])/gu) ?? []).filter(
    (w) => !allow.has(w) && (w.length > 2 || SHORT.has(w))
  )
}

/** The allowed words of a site: the language's loanwords plus `extra` (names, customer words). */
export function allowedWords(/** @type {string} */ lang, /** @type {string[]} */ extra = []) {
  const words = [
    ...(LOANWORDS[lang.slice(0, 2)] ?? []),
    ...extra.flatMap((e) => e.toLowerCase().match(/[a-z]+/g) ?? [])
  ]
  return new Set(words)
}

/**
 * True when a run reads as English on a site in `lang`.
 * @param {string} text
 * @param {{ lang: string, allow: Set<string>, names?: string[] }} opts `names`: the business names,
 *   taken out of the run first (a Vietnamese name in "… Tamarind & Co. All Rights Reserved.")
 */
export function isEnglish(text, { lang, allow, names = [] }) {
  if (lang.startsWith('en')) return false
  let run = text
  for (const n of names) if (n) run = run.split(n).join(' ')
  if (lang.startsWith('vi') && VIETNAMESE.test(run)) return false
  const words = wordsOf(run, allow)
  if (!words.length) return false
  // A person's name ("Eula Ward"): two or three capitalised words, one of them a first name or a
  // word that is not common English.
  const parts = run.trim().split(/\s+/)
  const name = (/** @type {string} */ p) => NAMES.has(p.toLowerCase()) || !known(p.toLowerCase())
  if (
    parts.length >= 2 &&
    parts.length <= 3 &&
    parts.every((p) => /^\p{Lu}[\p{Ll}'’.-]+$/u.test(p)) &&
    parts.some(name)
  )
    return false
  const english = words.filter(known).length
  return english > 0 && english / words.length >= 0.5
}

/**
 * The English runs of a page, each once.
 * @param {any} doc
 * @param {{ lang: string, allow: Set<string>, names?: string[] }} opts
 */
export function englishRuns(doc, opts) {
  const people = personNames(doc)
  return [...new Set(visibleRuns(doc).filter((r) => !people.has(r) && isEnglish(r, opts)))]
}
