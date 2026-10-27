/**
 * The label checks of the Template Customization Question Readiness built-site check (PAGE-5, SERVICES), on links whose words Tracy rewrote:
 * - `changedLabels` + `namesTarget`: links whose words changed from the demo while the target
 *   stayed; each must still name its target: a contact page takes a contact word, any other page a
 *   word of its title or listed items, unless the label is a generic "more" phrase;
 * - `fillerItems`: in a rewritten list of offerings, the items that name no offering.
 */
import { isSocial, labelOf, linksOf, pathOf } from './links.mjs'

const CONTACT_PATH = /\/(contact|contact-us|lien-he|kontakt|quote|booking|book)(\/|$)/i
/** Words that name a contact action, per language. */
export const CONTACT_WORDS = /** @type {Record<string, RegExp>} */ ({
  vi: /liên hệ|liên lạc|gửi|đặt|gọi|nhắn|hỏi|báo giá|tư vấn|đăng ký|yêu cầu|kết nối|trò chuyện|hẹn|contact/i,
  en: /contact|call|book|order|quote|enquir|inquir|talk|message|touch|request|subscribe|write|reach/i
})
const GENERIC =
  /xem thêm|đọc thêm|xem tất cả|tất cả|chi tiết|khám phá|tìm hiểu|read more|learn more|see all|view all|details/i

// Function words that two texts share without naming the same thing.
const STOP = new Set(
  // language-allow: Vietnamese and English function words are data
  'và có là để các cho với một những của từ bạn chúng tôi này đó the and for with your our you all more about from'.split(
    ' '
  )
)

/**
 * Links whose words changed from the demo while the target stayed: Tracy wrote them.
 * @param {any} site the page on the built site
 * @param {any} demo the same page on the demo
 * @param {{ siteOrigin: string, demoOrigin: string }} opts
 * @returns {{ label: string, before: string, path: string }[]}
 */
export function changedLabels(site, demo, { siteOrigin, demoOrigin }) {
  const group = (/** @type {any} */ doc, /** @type {string} */ origin) => {
    const by = new Map()
    for (const l of linksOf(doc)) {
      const p = pathOf(l.href, origin)
      if (
        !p ||
        l.nav ||
        l.pager ||
        l.href.includes('?') ||
        isSocial(l) ||
        !l.label ||
        l.label.length > 60 ||
        /skip/i.test(l.cls)
      )
        continue
      by.set(p, [...(by.get(p) ?? []), l.label])
    }
    return by
  }
  const s = group(site, siteOrigin)
  const d = group(demo, demoOrigin)
  const out = []
  for (const [path, labels] of s) {
    const before = d.get(path)
    if (!before || before.length !== labels.length) continue
    labels.forEach((label, i) => {
      if (label !== before[i]) out.push({ label, before: before[i], path })
    })
  }
  return out
}

/**
 * True when a label names its target: a contact word for a contact page, else a word of the target
 * page's title or headings, or a generic "more" phrase.
 * @param {string} label
 * @param {string} path
 * @param {string} target the target page's title and headings
 * @param {string} lang
 */
export function namesTarget(label, path, target, lang) {
  if (CONTACT_PATH.test(path)) return (CONTACT_WORDS[lang.slice(0, 2)] ?? CONTACT_WORDS.en).test(label)
  return GENERIC.test(label) || sharesWord(label, target)
}

/**
 * SERVICES (10/10): in a list of three or more links to one page whose words Tracy all
 * rewrote (a footer list of offerings), the labels that share no word with any other label of the
 * list while the others do: filler like "Mỗi sáng", "Gia đình" beside "Bánh mì sourdough",
 * "Bánh mì Việt". A rough signal, only for lists that do have a common word.
 * @param {any} site @param {any} demo @param {{ siteOrigin: string, demoOrigin: string }} opts
 */
export function fillerItems(site, demo, { siteOrigin, demoOrigin }) {
  // Links of one parent to one page, keyed by the page and the list's order among that page's lists.
  const lists = (/** @type {any} */ doc, /** @type {string} */ origin) => {
    const byParent = new Map()
    for (const a of doc.querySelectorAll('a')) {
      const p = pathOf(a.getAttribute('href') ?? '', origin)
      if (!p || !a.parentElement) continue
      const list = byParent.get(a.parentElement) ?? new Map()
      list.set(p, [...(list.get(p) ?? []), labelOf(a)])
      byParent.set(a.parentElement, list)
    }
    const seen = new Map()
    const by = new Map()
    for (const list of byParent.values())
      for (const [p, labels] of list) {
        seen.set(p, (seen.get(p) ?? 0) + 1)
        by.set(`${p}|${seen.get(p)}`, labels)
      }
    return by
  }
  const before = lists(demo, demoOrigin)
  const out = []
  for (const [key, labels] of lists(site, siteOrigin)) {
    const old = before.get(key)
    if (labels.length < 3 || !old || old.length !== labels.length || labels.some((l, i) => l === old[i]))
      continue
    const alone = labels.filter((l, i) => !labels.some((o, j) => j !== i && sharesWord(l, o)))
    if (alone.length && alone.length < labels.length)
      out.push(
        `${alone.map((l) => `"${l}"`).join(', ')} beside ${labels
          .filter((l) => !alone.includes(l))
          .map((l) => `"${l}"`)
          .join(', ')} → ${key.split('|')[0]}`
      )
  }
  return out
}

/** True when a path is a contact page (where a label must name a contact action). */
export const isContactPath = (/** @type {string} */ path) => CONTACT_PATH.test(path)

/** True when two texts share a word of three letters or more. */
export function sharesWord(/** @type {string} */ a, /** @type {string} */ b) {
  const words = (/** @type {string} */ s) =>
    new Set((s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w)))
  const w = words(b)
  return [...words(a)].some((x) => w.has(x))
}
