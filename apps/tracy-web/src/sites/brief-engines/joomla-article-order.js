/**
 * The order of a Joomla site's articles within each category, pinned as the demo serves it before Tracy writes anything.
 *
 * 🔒 A BUILT SITE WALKS ITS ARTICLES IN THE DEMO'S ORDER (TCH #1013). Joomla's Previous/Next (`plg_content_pagenavigation`) and
 * a category's list sort on the key `orderby_sec` names (the category's menu entry, else com_content's own options; Joomla's
 * default `rdate` with `order_date = published`: newest `publish_up` first). 25 Joomla releases ship articles of one category
 * with the same key (JA Essence j6 1.0.4: Health articles 13-15, 18, 21-26 all published 2023-06-09 07:22:49), and among ties
 * the database answers in its own order, which the demo serves by id (measured 10/10/2026: layout-1, article 23, between 22
 * and 24) and which a write may change: on dev g59-ess-j-full layout-1 lost its "Next", and a BLANK site listed its related
 * articles in another order than the demo. So before the first write the tied articles of each category get distinct keys that
 * reproduce the demo's order exactly (the key, then id): `publish_up` seconds apart, or `ordering` 1…n. Only the tied ones are
 * written, in one transaction under their own apply id, which `apply.revert` undoes. A key Tracy cannot write (`created`,
 * `title`, hits) is left, and said.
 */
import { listWhole } from './joomla-articles.js'
import { contentOf } from './joomla-article-routes.js'
import { writeSteps } from './joomla-tidy.js'

/** @typedef {{ key: 'ordering' | 'publish_up' | 'created' | 'modified' | 'title' | null, desc: boolean }} Rule */

/** Joomla's own default: `orderby_sec = rdate`, `order_date = published`. */
export const DEFAULT_RULE = /** @type {Rule} */ ({ key: 'publish_up', desc: true })

/** The rule `orderby_sec` and `order_date` name, or null when they name none (`''`: the next level decides). */
export function ruleOf(/** @type {any} */ params) {
  const method = String(params?.orderby_sec ?? '').trim()
  if (method === '') return null
  const date = { published: 'publish_up', created: 'created', modified: 'modified' }[
    String(params?.order_date ?? 'published')
  ]
  if (method === 'rdate' || method === 'date')
    return /** @type {Rule} */ ({ key: date ?? 'publish_up', desc: method === 'rdate' })
  if (method === 'alpha' || method === 'ralpha')
    return /** @type {Rule} */ ({ key: 'title', desc: method === 'ralpha' })
  if (method === 'order' || method === 'front') return /** @type {Rule} */ ({ key: 'ordering', desc: false })
  if (method === 'rorder') return /** @type {Rule} */ ({ key: 'ordering', desc: true })
  return /** @type {Rule} */ ({ key: null, desc: false })
}

export const paramsOf = (/** @type {any} */ row) => {
  if (row?.params && typeof row.params === 'object') return row.params
  try {
    return JSON.parse(String(row?.params ?? '{}'))
  } catch {
    return {}
  }
}

/**
 * Each category's rule: its own published menu entry's `orderby_sec` when it names one, else com_content's, else Joomla's.
 * @param {any[]} rows - menu entries @param {any} [component] - com_content's params
 * @returns {(catid: unknown) => Rule}
 */
export function rulesOf(rows = [], component = null) {
  const global = ruleOf(component) ?? DEFAULT_RULE
  /** @type {Map<string, Rule>} */
  const own = new Map()
  for (const row of rows) {
    const to = contentOf(row)
    if (to?.view !== 'category' || !to.id || Number(row.published) !== 1 || own.has(to.id)) continue
    const rule = ruleOf(paramsOf(row))
    if (rule) own.set(to.id, rule)
  }
  return (catid) => own.get(String(catid)) ?? global
}

/** A datetime as Joomla stores it (UTC, `YYYY-MM-DD HH:MM:SS`), in seconds; NaN when it is none. */
const seconds = (/** @type {unknown} */ value) =>
  Date.parse(`${String(value ?? '').replace(' ', 'T')}Z`) / 1000
const datetime = (/** @type {number} */ s) => new Date(s * 1000).toISOString().slice(0, 19).replace('T', ' ')

/** The value of a rule's key on an article, comparable. */
const keyOf = (/** @type {Rule} */ rule, /** @type {any} */ a) =>
  rule.key === 'title'
    ? String(a.title ?? '')
    : rule.key === 'ordering'
      ? Number(a.ordering ?? 0)
      : seconds(a[/** @type {string} */ (rule.key)])

/** The demo's order under a rule: its key in its direction, ties by id, the way the database serves them. */
export const byRule = (/** @type {Rule} */ rule) => (/** @type {any} */ a, /** @type {any} */ b) => {
  if (rule.key === null) return Number(a.id) - Number(b.id)
  const x = keyOf(rule, a)
  const y = keyOf(rule, b)
  const c = x < y ? -1 : x > y ? 1 : 0
  return (rule.desc ? -c : c) || Number(a.id) - Number(b.id)
}

/**
 * The writes that make the tied keys of each category distinct, in the demo's order; only tied articles are written.
 * @param {any[]} articles - `id`, `catid`, `ordering`, `publish_up`
 * @param {(catid: unknown) => Rule} [rules]
 * @returns {{ steps: Array<{ kind: 'article', id: number, fields: Record<string, unknown> }>, left: string[] }} `left`:
 *   categories with ties Tracy cannot write, and why
 */
export function orderSteps(articles, rules = () => DEFAULT_RULE) {
  /** @type {Map<string, any[]>} */
  const byCategory = new Map()
  for (const a of articles)
    byCategory.set(String(a.catid ?? ''), [...(byCategory.get(String(a.catid ?? '')) ?? []), a])
  /** @type {Array<{ kind: 'article', id: number, fields: Record<string, unknown> }>} */
  const steps = []
  /** @type {string[]} */
  const left = []
  for (const [cat, list] of byCategory) {
    const rule = rules(cat)
    const values = list.map((a) => keyOf(rule, a))
    if (rule.key !== null && new Set(values).size === values.length) continue
    const demo = [...list].sort(byRule(rule))
    if (rule.key === 'ordering') {
      demo.forEach((a, i) => {
        if (Number(a.ordering ?? 0) !== i + 1)
          steps.push({ kind: 'article', id: Number(a.id), fields: { ordering: i + 1 } })
      })
      continue
    }
    if (rule.key !== 'publish_up') {
      left.push(`category ${cat} sorts on ${rule.key ?? 'a key Tracy does not write'}`)
      continue
    }
    // Each run of tied times becomes seconds apart, the first of the demo's order the newest when newest comes first.
    /** @type {Map<number, number>} */
    const next = new Map()
    for (let at = 0; at < demo.length; ) {
      const t = seconds(demo[at].publish_up)
      let end = at
      while (end + 1 < demo.length && seconds(demo[end + 1].publish_up) === t) end += 1
      const run = demo.slice(at, end + 1)
      if (run.length > 1 && Number.isFinite(t))
        run.forEach((a, i) => next.set(Number(a.id), rule.desc ? t + (run.length - 1 - i) : t + i))
      at = end + 1
    }
    const moved = list.map((a) =>
      next.has(Number(a.id))
        ? { ...a, publish_up: datetime(/** @type {number} */ (next.get(Number(a.id)))) }
        : a
    )
    const after = [...moved].sort(byRule(rule)).map((a) => Number(a.id))
    if (after.join() !== demo.map((a) => Number(a.id)).join()) {
      left.push(`category ${cat}: spreading its tied dates would cross another article's`)
      continue
    }
    for (const a of moved)
      if (next.has(Number(a.id)) && a.publish_up !== list.find((b) => b.id === a.id)?.publish_up)
        steps.push({ kind: 'article', id: Number(a.id), fields: { publish_up: a.publish_up } })
  }
  return { steps, left }
}

/**
 * The published articles before and after `id` in its category, in the demo's order: what Joomla's Previous/Next links.
 * @param {any[]} articles @param {number} id @param {(catid: unknown) => Rule} [rules]
 * @returns {[number | null, number | null]}
 */
export function neighboursOf(articles, id, rules = () => DEFAULT_RULE) {
  const of = articles.find((a) => Number(a.id) === Number(id))
  if (!of) return [null, null]
  const order = articles
    .filter((a) => String(a.catid) === String(of.catid) && Number(a.state) === 1)
    .sort(byRule(rules(of.catid)))
    .map((a) => Number(a.id))
  const at = order.indexOf(Number(id))
  return [order[at - 1] ?? null, order[at + 1] ?? null]
}

/** com_content's own options, or null when the site does not say. */
export async function componentParams(/** @type {any} */ apply, /** @type {string} */ siteKey) {
  try {
    const answer = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'extensionParams', search: 'com_content', limit: 25, include_body: true }
    })
    const row = (Array.isArray(answer?.items) ? answer.items : []).find(
      (/** @type {any} */ r) => r?.element === 'com_content' && String(r?.type ?? 'component') === 'component'
    )
    return row ? paramsOf(row) : null
  } catch {
    return null
  }
}

/**
 * Pin the demo's article order on the site (`orderSteps`). Never throws: what cannot be read or written is said.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {(note: string) => void} input.note
 * @returns {Promise<number>} how many articles were written
 */
export async function pinArticleOrder({ apply, siteKey, note }) {
  try {
    const [articles, rows, component] = await Promise.all([
      listWhole(apply, siteKey, 'article'),
      listWhole(apply, siteKey, 'menuItem').catch(() => /** @type {any[]} */ ([])),
      componentParams(apply, siteKey)
    ])
    const { steps, left } = orderSteps(articles, rulesOf(rows, component))
    if (left.length > 0)
      note(
        `the order of some articles is left tied, so Previous/Next may differ from the demo: ${left.slice(0, 3).join('; ')}`
      )
    if (steps.length === 0) return 0
    const done = await writeSteps({ apply, siteKey, steps, applyId: `order-${Date.now().toString(36)}` })
    for (const line of done.notes.slice(0, 2)) note(line)
    if (done.written < steps.length)
      note(
        `${steps.length - done.written} article(s) keep a tied order, so Previous/Next may differ from the demo`
      )
    return done.written
  } catch (error) {
    note(
      `the articles' order could not be pinned, so Previous/Next may differ from the demo: ${error instanceof Error ? error.message : error}`
    )
    return 0
  }
}
