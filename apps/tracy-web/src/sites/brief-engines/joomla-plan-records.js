/**
 * The site plan's honesty decisions written on a Joomla site (spec TracyHQ/tracy#189, ticket #192): the cards beyond the
 * brief's offerings and people taken off, and the fact fields the brief holds nothing for emptied
 * (`website-opportunities/domain/site-plan-honesty.mjs`). The words the plan decides go in with the contract write
 * (`honestWords`); what the contract cannot do runs after it (`planRecordSteps`):
 *
 *   hide an entity  a card that is an entity of its own (an article, a menu entry) or a section none of whose cards stays
 *                   (a module) is unpublished
 *   hide an item    a card that is an item of a module's JSON list (a JA ACM list) leaves every array of that list
 *   empty a field   the contract refuses to empty an occupied slot, so a fact field (a price, a schedule, a bio) is emptied
 *                   in the module's or the article's parameters; a fact inside an HTML field loses its demo words and
 *                   its demo picture
 *
 * Framework-wide (Joomla modules and articles, JSON parameters), never per template. A site no brief build made has no plan
 * and writes nothing here; what the site cannot give is a note, never a failed build.
 */
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { paramsOf, readModules } from './joomla-tidy.js'

const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const htmlOf = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The template's `((tag))` markers as the stored HTML writes them. */
const stored = (/** @type {string} */ s) => s.replace(/\(\(/g, '<').replace(/\)\)/g, '>')
const idOf = (/** @type {string} */ entity) => Number(String(entity).split('-')[1])

/**
 * The words the site plan decides, laid over what the writer wrote, and what a writer invented taken out
 * (`honestWritten`): with no plan (a Customize build without a brief) only the invented names and figures go.
 * @param {object} input
 * @param {Record<string, string>} input.kept - the words about to be written, by slot key: changed in place
 * @param {any[]} input.slots - the slots a visitor reads
 * @param {string} input.ownText - every word the customer gave
 * @param {any} input.honesty - the site plan's `honesty`, or null
 * @param {string} input.locale
 * @param {{ phone?: string, email?: string }} input.business
 * @param {any[]} [input.pages] - the map's pages: the page a menu entry opens
 * @returns {Promise<{ evidence: Record<string, string>, counts: Record<string, number> }>}
 */
export async function honestWords({ kept, slots, ownText, honesty, locale, business, pages = [] }) {
  const { honestWritten } = await websiteOpportunitiesDomain()
  const out = honestWritten({ slots, written: kept, ownText, honesty, locale, business, pages })
  for (const key of out.drop) delete kept[key]
  Object.assign(kept, out.values)
  return { evidence: out.evidence, counts: out.counts }
}

/** The object at `path` inside `root`, or null. */
function at(root, path) {
  let node = root
  for (const step of path) {
    if (node === null || typeof node !== 'object') return null
    node = node[step]
  }
  return node && typeof node === 'object' ? node : null
}

/** A field's HTML without the demo words and the demo picture of an emptied slot. */
function withoutSample(html, blank) {
  const sample = String(blank.sample ?? '')
  if (sample.trim() === '') return html
  if (blank.type === 'image') {
    const file = sample.split('#')[0]
    return html.replace(new RegExp(`<img\\b[^>]*${escapeRe(file)}[^>]*>`, 'i'), '')
  }
  for (const form of [stored(sample), htmlOf(stored(sample)), sample])
    if (html.includes(form)) return html.replace(form, '')
  return html
}

/** Empties one slot in a parsed parameter object. @returns {boolean} whether anything changed */
function emptyIn(container, blank) {
  const path = blank.jsonPath ?? []
  if (path.length === 0) return false
  const parent = at(container, path.slice(0, -1))
  const last = path.at(-1)
  if (!parent || typeof parent[last] !== 'string') return false
  const next = blank.xpath ? withoutSample(parent[last], blank) : ''
  if (next === parent[last]) return false
  parent[last] = next
  return true
}

/** Takes items out of a JSON list: every array of the list's length loses them. @returns {boolean} */
function dropItems(container, parents, fields, indexes) {
  let changed = false
  for (const path of parents) {
    const parent = at(container, path)
    if (!parent) continue
    const length = Math.max(0, ...fields.map((f) => (Array.isArray(parent[f]) ? parent[f].length : 0)))
    if (length === 0) continue
    for (const value of Object.values(parent))
      if (Array.isArray(value) && value.length === length)
        for (const index of [...indexes].sort((a, b) => b - a))
          if (index < value.length) {
            value.splice(index, 1)
            changed = true
          }
  }
  return changed
}

/**
 * The writes of the plan's takings-off and emptied fields (`content.batch` steps). Pure.
 * @param {object} input
 * @param {any} input.honesty - the site plan's `honesty`
 * @param {Map<number, any>} input.modules - the site's module rows by id (`params` included)
 * @param {Map<number, any>} [input.articles] - the article rows the plan's fields need, by id (`attribs` included)
 * @returns {{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }>, hidden: number, trimmed: number,
 *   emptied: number, unresolved: number }}
 */
export function recordSteps({ honesty, modules, articles = new Map() }) {
  const steps = []
  let hidden = 0
  let trimmed = 0
  let emptied = 0
  let unresolved = 0
  const gone = new Set()
  for (const hide of honesty?.hide ?? []) {
    if (hide.how !== 'entity') continue
    const id = idOf(hide.entity)
    const kind = hide.kind ?? String(hide.entity).split('-')[0]
    if (!Number.isFinite(id)) continue
    gone.add(hide.entity)
    if (kind === 'module') steps.push({ kind, id, fields: { published: 0 } })
    else if (kind === 'article') steps.push({ kind, id, fields: { state: 0 } })
    else if (kind === 'menuItem') steps.push({ kind, id, fields: { published: 0 } })
    else {
      unresolved += 1
      continue
    }
    hidden += 1
  }
  unresolved += (honesty?.hide ?? []).filter((h) => h.how === 'none').length
  const hiddenGroups = new Set(
    (honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  )
  /** Every entity whose parameters change: its row's parsed parameters, read once. */
  const edits = new Map()
  const editOf = (entity, column, nestedJson) => {
    const id = idOf(entity)
    const kind = String(entity).split('-')[0]
    const row = kind === 'module' ? modules.get(id) : kind === 'article' ? articles.get(id) : null
    const field = kind === 'module' ? 'params' : column
    if (!row || (kind === 'module' && column !== 'params') || (kind === 'article' && column !== 'attribs'))
      return null
    const key = `${entity}|${field}|${nestedJson ?? ''}`
    if (!edits.has(key)) {
      const params = paramsOf(row[field])
      let container = params
      if (params && nestedJson) container = paramsOf(params[nestedJson])
      if (!container) return null
      edits.set(key, { kind, id, field, params, container, nestedJson, changed: false })
    }
    return edits.get(key)
  }
  // The fields go empty first: the items they name still stand where the plan read them.
  for (const blank of honesty?.blanks ?? []) {
    if (gone.has(blank.entity)) continue
    const edit = editOf(blank.entity, blank.column, blank.nestedJson)
    if (edit && emptyIn(edit.container, blank)) {
      edit.changed = true
      emptied += 1
    } else if (!edit) unresolved += 1
  }
  /** @type {Map<string, {edit: any, parents: any[], fields: string[], indexes: number[]}>} */
  const lists = new Map()
  for (const hide of honesty?.hide ?? []) {
    if (hide.how !== 'item' || gone.has(hide.entity) || !hiddenGroups.has(hide.group)) continue
    const edit = editOf(hide.entity, hide.column, hide.nestedJson)
    if (!edit) {
      unresolved += 1
      continue
    }
    const key = `${hide.entity}|${JSON.stringify(hide.parents)}`
    const list = lists.get(key) ?? { edit, parents: hide.parents, fields: hide.fields ?? [], indexes: [] }
    list.indexes.push(hide.index)
    lists.set(key, list)
  }
  for (const { edit, parents, fields, indexes } of lists.values())
    if (dropItems(edit.container, parents, fields, indexes)) {
      edit.changed = true
      trimmed += indexes.length
    }
  for (const edit of edits.values()) {
    if (!edit.changed) continue
    const params = edit.nestedJson
      ? { ...edit.params, [edit.nestedJson]: JSON.stringify(edit.container) }
      : edit.container
    steps.push({ kind: edit.kind, id: edit.id, fields: { [edit.field]: JSON.stringify(params) } })
  }
  return { steps, hidden, trimmed, emptied, unresolved }
}

/**
 * The site plan read once, and the writes of its honesty decisions made from what the site holds now.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ siteKey: string, email: string, note: (line: string) => void, time?: (key: string, n: number) => void }} input.ctx
 * @param {{ sitePlanFor?: Function } | null} input.woContent
 * @returns {Promise<{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }> }>}
 */
export async function planRecordSteps({ apply, siteKey, ctx, woContent }) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  const honesty = plan?.honesty
  if (!honesty) return { steps: [] }
  try {
    const modules = new Map((await readModules(apply, siteKey)).map((row) => [Number(row.id), row]))
    const articles = new Map()
    for (const id of new Set(
      (honesty.blanks ?? []).filter((b) => String(b.entity).startsWith('article-')).map((b) => idOf(b.entity))
    )) {
      const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id } })
      if (answer?.ok !== false && answer?.item) articles.set(id, answer.item)
    }
    const made = recordSteps({ honesty, modules, articles })
    ctx.time?.('recordsHidden', made.hidden + made.trimmed)
    ctx.time?.('factFieldsEmptied', made.emptied)
    if (made.hidden + made.trimmed > 0)
      ctx.note(`${made.hidden + made.trimmed} card(s) beyond your offerings and people were taken off`)
    if (made.unresolved > 0)
      ctx.note(
        `${made.unresolved} card(s) or fact line(s) of the template could not be taken off on this site`
      )
    return { steps: made.steps }
  } catch (error) {
    ctx.note(`the template's cards could not be read: ${error instanceof Error ? error.message : error}`)
    return { steps: [] }
  }
}
