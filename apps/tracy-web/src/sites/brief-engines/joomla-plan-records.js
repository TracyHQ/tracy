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
 * and writes nothing here. A fallback that cannot reach its target is said with its reason and the build goes on; only a
 * records door that does not answer stops it.
 */
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { wholeFactRowsOf } from 'website-opportunities/domain/fact-rows.mjs'
import { paramsOf, readModules } from './joomla-tidy.js'
import {
  blankBoundField,
  emptyRecordValue,
  JSON_FIELDS,
  RECORD_FIELDS,
  recordFallbackError
} from './joomla-record-fields.js'

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

/**
 * The lines the writer left in the demo's words, given the site plan's fallback, the role's neutral words or the business's
 * own description, or emptied (`leftDemoText`, spec TracyHQ/tracy#189 C03/C09). The words go in `kept`, written with the
 * contract; an emptied line leaves `kept` and is returned, for the records write after the contract (`planRecordSteps`
 * `extraBlanks`), since the contract cannot empty an occupied slot.
 * @param {object} input
 * @param {Record<string, string>} input.kept - the words about to be written, by slot key: changed in place
 * @param {any[]} input.slots - the slots a visitor reads
 * @param {Iterable<string>} input.asked - the keys the site plan gives the copy writer
 * @param {Iterable<string>} input.held - the keys the writer did not answer
 * @param {string} input.ownText
 * @param {any} input.honesty
 * @param {string} input.locale
 * @param {{ phone?: string, email?: string }} input.business
 * @param {string} [input.description]
 * @param {any[]} [input.pages]
 * @param {any[]} [input.entities]
 * @returns {Promise<{ blanks: any[], hides: any[], counts: Record<string, number> }>} `hides`: the cards whose title is
 *   the demo's, taken off whole by the records write (`planRecordSteps` `extraHides`)
 */
export async function leftDemoWords({
  kept,
  slots,
  asked,
  held,
  ownText,
  honesty,
  locale,
  business,
  description = '',
  pages = [],
  entities = []
}) {
  const { leftDemoText } = await websiteOpportunitiesDomain()
  const out = leftDemoText({
    slots,
    written: kept,
    asked,
    held,
    ownText,
    honesty,
    locale,
    business,
    description,
    pages,
    entities
  })
  Object.assign(kept, out.values)
  for (const key of out.blanks) delete kept[key]
  const byKey = new Map(slots.map((slot) => [slot.key, slot]))
  return {
    blanks: out.blanks.map((key) => byKey.get(key)).filter(Boolean),
    hides: out.hides ?? [],
    counts: out.counts
  }
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

/** Empties one slot in parsed parameters. Null means the target is unreachable; false means already empty. */
function emptyIn(container, blank) {
  const path = blank.jsonPath ?? []
  if (path.length === 0) return null
  const parent = at(container, path.slice(0, -1))
  const last = path.at(-1)
  if (!parent || typeof parent[last] !== 'string') return null
  const next = blank.xpath ? blankBoundField(parent[last], blank) : ''
  if (next === null) return null
  if (next === parent[last]) return false
  parent[last] = next
  return true
}

/**
 * Empties items of a JSON list in place: every array of the list's length has its words at those places emptied.
 *
 * 🔒 A CARD TAKEN OFF A JSON LIST STAYS IN THE LIST, EMPTIED (spec TracyHQ/tracy#189). The contract binds each item field
 * by its path (`team`, `team[title]`, 3): taking an item out shifts the ones after it and the last path finds nothing, and
 * the plugin's inspect then refuses every contract write on the site ("Content slot is not text"). So the item's words and
 * pictures are emptied where they stand, and the template's layout decides what an empty card shows.
 * @returns {boolean}
 */
function dropItems(container, parents, fields, indexes) {
  let changed = false
  for (const path of parents) {
    const parent = at(container, path)
    if (!parent) continue
    const length = Math.max(0, ...fields.map((f) => (Array.isArray(parent[f]) ? parent[f].length : 0)))
    if (length === 0) continue
    for (const value of Object.values(parent))
      if (Array.isArray(value) && value.length === length)
        for (const index of indexes)
          if (index < value.length && typeof value[index] === 'string' && value[index] !== '') {
            value[index] = ''
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
 * @param {Map<number, any>} [input.contacts] - the contact rows the plan's fields need, by id
 * @returns {{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }>, hidden: number, trimmed: number,
 *   emptied: number, unresolved: number, left: string[], findings: Array<{ key: string, reason: string }> }} `findings`: each
 *   target not reached and why (`no-record-door`, `no-take-off-door`, `record-not-read`, `field-not-found`,
 *   `bound-node-not-found`)
 */
export function recordSteps({
  honesty,
  modules,
  articles = new Map(),
  contacts = new Map(),
  records = new Map()
}) {
  const steps = []
  let hidden = 0
  let trimmed = 0
  let emptied = 0
  let unresolved = 0
  /** @type {string[]} targets the records door cannot safely neutralize */
  const left = []
  /** @type {Array<{ key: string, reason: string }>} the same targets, each with why it was not reached */
  const findings = []
  const leave = (/** @type {string} */ key, /** @type {string} */ reason) => {
    unresolved += 1
    left.push(key)
    findings.push({ key, reason })
  }
  const gone = new Set()
  for (const hide of honesty?.hide ?? []) {
    if (hide.how !== 'entity') continue
    const id = idOf(hide.entity)
    const kind = hide.kind ?? String(hide.entity).split('-')[0]
    if (!Number.isSafeInteger(id) || id <= 0) {
      leave(hide.group ?? hide.entity, 'no-take-off-door')
      continue
    }
    if (kind === 'module') steps.push({ kind, id, fields: { published: 0 } })
    else if (kind === 'article') steps.push({ kind, id, fields: { state: 0 } })
    else if (kind === 'menuItem') steps.push({ kind, id, fields: { published: 0 } })
    else {
      leave(hide.group ?? hide.entity, 'no-take-off-door')
      continue
    }
    gone.add(hide.entity)
    hidden += 1
  }
  const hiddenGroups = new Set(
    (honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  )
  /** Every entity whose parameters change: its row's parsed parameters, read once. */
  const edits = new Map()
  const editOf = (entity, column, nestedJson) => {
    const id = idOf(entity)
    const kind = String(entity).split('-')[0]
    const row = rowsFor(kind).get(id)
    const field = column
    if (!row || !RECORD_FIELDS[kind]?.has(field) || !JSON_FIELDS.has(field)) return null
    const key = `${entity}|${field}`
    if (!edits.has(key)) {
      const params = paramsOf(row[field])
      if (!params) return null
      edits.set(key, { kind, id, field, params, nested: new Map(), changed: false })
    }
    const edit = edits.get(key)
    if (nestedJson && !edit.nested.has(nestedJson)) {
      const container = paramsOf(edit.params[nestedJson])
      if (!container) return null
      edit.nested.set(nestedJson, container)
    }
    return { edit, container: nestedJson ? edit.nested.get(nestedJson) : edit.params }
  }
  const rowsFor = (kind) =>
    kind === 'module'
      ? modules
      : kind === 'article'
        ? articles
        : kind === 'contact'
          ? contacts
          : (records.get(kind) ?? new Map())
  /** A record's HTML or words column (an article's body, a module's content, a contact line) losing a slot's demo words. */
  const html = new Map()
  // The fields go empty first: the items they name still stand where the plan read them.
  for (const blank of honesty?.blanks ?? []) {
    if (gone.has(blank.entity)) continue
    const kind = String(blank.entity).split('-')[0]
    const rowsOf = rowsFor(kind)
    if (RECORD_FIELDS[kind]?.has(blank.column) && !JSON_FIELDS.has(blank.column)) {
      const id = idOf(blank.entity)
      const row = rowsOf.get(id)
      const key = `${kind}|${id}|${blank.column}`
      const before =
        html.get(key)?.text ?? (typeof row?.[blank.column] === 'string' ? row[blank.column] : null)
      if (before === null) {
        leave(blank.key, 'record-not-read')
        continue
      }
      const next = blank.xpath ? blankBoundField(before, blank) : emptyRecordValue(blank.column)
      if (next === null) {
        leave(blank.key, 'bound-node-not-found')
        continue
      }
      html.set(key, {
        kind,
        id,
        column: blank.column,
        text: next,
        changed: (html.get(key)?.changed ?? false) || next !== before
      })
      if (next !== before) emptied += 1
      continue
    }
    const edit = editOf(blank.entity, blank.column, blank.nestedJson)
    const changed = edit ? emptyIn(edit.container, blank) : null
    if (changed === true) {
      edit.edit.changed = true
      emptied += 1
    } else if (changed === null)
      leave(
        blank.key,
        !RECORD_FIELDS[kind]?.has(blank.column)
          ? 'no-record-door'
          : !rowsOf.get(idOf(blank.entity))
            ? 'record-not-read'
            : 'field-not-found'
      )
  }
  /** @type {Map<string, {edit: any, parents: any[], fields: string[], indexes: number[]}>} */
  const lists = new Map()
  for (const hide of honesty?.hide ?? []) {
    if (hide.how !== 'item' || gone.has(hide.entity) || !hiddenGroups.has(hide.group)) continue
    const edit = editOf(hide.entity, hide.column, hide.nestedJson)
    if (!edit) {
      leave(hide.group ?? hide.entity, 'record-not-read')
      continue
    }
    const key = `${hide.entity}|${JSON.stringify(hide.parents)}`
    const list = lists.get(key) ?? { edit, parents: hide.parents, fields: hide.fields ?? [], indexes: [] }
    list.indexes.push(hide.index)
    lists.set(key, list)
  }
  // 🔒 A RECORD LIST SHOWS THE BRIEF'S COUNT (`brief-decides-items.mjs` `planRecordLists`, R12 group C): an articles module
  // lists as many records as the brief holds, never the template's count; the current page's own item is hidden by the
  // head block's current-item rule, so a related list shows every real sibling.
  for (const list of honesty?.lists ?? []) {
    if (list.decision !== 'keep' || gone.has(list.entity) || !Number.isInteger(list.count)) continue
    if (String(list.entity).split('-')[0] !== 'module') continue
    const edit = editOf(list.entity, 'params', null)
    if (!edit || !('count' in edit.container) || Number(edit.container.count) === list.count) continue
    edit.container.count = list.count
    edit.edit.changed = true
  }
  for (const { edit, parents, fields, indexes } of lists.values())
    if (dropItems(edit.container, parents, fields, indexes)) {
      edit.edit.changed = true
      trimmed += indexes.length
    }
  for (const edit of html.values())
    if (edit.changed) steps.push({ kind: edit.kind, id: edit.id, fields: { [edit.column]: edit.text } })
  for (const edit of edits.values()) {
    if (!edit.changed) continue
    for (const [key, container] of edit.nested) edit.params[key] = JSON.stringify(container)
    steps.push({ kind: edit.kind, id: edit.id, fields: { [edit.field]: JSON.stringify(edit.params) } })
  }
  for (const hide of honesty?.hide ?? []) if (hide.how === 'none') leave(hide.group, 'no-take-off-door')
  return { steps, hidden, trimmed, emptied, unresolved, left, findings }
}

/**
 * The site plan read once, and the writes of its honesty decisions made from what the site holds now.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ siteKey: string, email: string, note: (line: string) => void, time?: (key: string, n: number) => void }} input.ctx
 * @param {{ sitePlanFor?: Function } | null} input.woContent
 * @param {any[]} [input.extraBlanks] - content map slots to empty beside the plan's (the demo lines the writer left)
 * @param {any[]} [input.extraHides] - cards to take off beside the plan's, as its `hide` entries (a card whose title the
 *   writer left in the demo's words, `leftDemoWords`)
 * @param {Set<string>} [input.protectedKeys] - required offering summaries already decided after copy pins
 * @param {any[]} [input.slots] - the content map's slots: the other cells of a fact row one blank empties (`wholeFactRowsOf`)
 * @returns {Promise<{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }>,
 *   unresolved?: Array<{ key: string, reason: string }> }>} `unresolved`: the slots and cards no records write reaches
 */
export async function planRecordSteps({
  apply,
  siteKey,
  ctx,
  woContent,
  extraBlanks = [],
  extraHides = [],
  protectedKeys = new Set(),
  slots = []
}) {
  const plan = await woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  // With no site plan, the demo lines handed in (a demo fact under the demo company's name, #189) are still emptied.
  const planned = plan?.honesty ?? (extraBlanks.length > 0 || extraHides.length > 0 ? {} : null)
  if (!planned) return { steps: [] }
  // The demo lines the writer left, emptied beside the plan's own fact fields (`leftDemoWords`).
  const seen = new Set((planned.blanks ?? []).map((b) => b.key))
  const blanks = [...(planned.blanks ?? []), ...extraBlanks.filter((b) => !seen.has(b.key))].filter(
    (b) => !protectedKeys.has(b.key)
  )
  // A fact row is emptied whole: one cell emptied takes its label and other cells with it (`wholeFactRowsOf`, #189).
  blanks.push(
    ...wholeFactRowsOf(
      slots,
      blanks.map((b) => b.key)
    ).filter((slot) => !protectedKeys.has(slot.key))
  )
  const honesty = {
    ...planned,
    blanks,
    // A card taken off whole joins the plan's hidden cards: an item hide is made only for a group the records hide.
    hide: [...(planned.hide ?? []), ...extraHides],
    records: [
      ...(planned.records ?? []),
      ...extraHides
        .filter((h) => h.group)
        .map((h) => ({ group: h.group, decision: 'hide', reason: h.reason }))
    ]
  }
  try {
    const modules = new Map((await readModules(apply, siteKey)).map((row) => [Number(row.id), row]))
    const records = new Map([['module', modules]])
    for (const entity of new Set((honesty.blanks ?? []).map((b) => b.entity))) {
      const kind = String(entity).split('-')[0]
      if (kind === 'module' || !RECORD_FIELDS[kind]) continue
      const id = idOf(entity)
      if (!Number.isSafeInteger(id) || id <= 0) continue
      const answer = await apply({ siteKey, action: 'content.get', params: { kind, id } })
      if (answer?.ok !== false && answer?.item) {
        if (!records.has(kind)) records.set(kind, new Map())
        records.get(kind).set(id, answer.item)
      }
    }
    const made = recordSteps({
      honesty,
      modules,
      articles: records.get('article'),
      contacts: records.get('contact'),
      records
    })
    // 🔒 ONE SLOT NO DOOR REACHES IS A FINDING, NEVER THE END OF THE BUILD (#189, round 10). Measured 30/10/2026: a template
    // language string and an outline part no records write could empty stopped the fill before tidy, head blocks, the
    // contact record and the cleanup turn, and a half-demo site was served. The slot is said with its reason; the final
    // check reads the served pages and the blocker gate decides whether the build needs fixes.
    if (made.findings.length > 0) {
      ctx.time?.('recordFallbacksUnresolved', made.findings.length)
      ctx.note(
        `${made.findings.length} line(s) of the template's demo could not be emptied and are left for a person to fix: ${made.findings
          .slice(0, 12)
          .map((f) => `${f.key} (${f.reason})`)
          .join(', ')}`
      )
      console.warn(
        `[brief-joomla] ${siteKey}: record fallbacks not reached: ${made.findings.map((f) => `${f.key} (${f.reason})`).join(', ')}`
      )
    }
    ctx.time?.('recordsHidden', made.hidden + made.trimmed)
    ctx.time?.('factFieldsEmptied', made.emptied)
    if (made.hidden + made.trimmed > 0)
      ctx.note(`${made.hidden + made.trimmed} card(s) beyond your offerings and people were taken off`)
    return { steps: made.steps, unresolved: made.findings }
  } catch (error) {
    // Only a records door that does not answer at all stops the build: then no record of the site can be read or written.
    throw recordFallbackError(
      (honesty.blanks ?? []).map((blank) => blank.key),
      error
    )
  }
}
