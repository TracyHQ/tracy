/**
 * Replace the words, never the style (spec TracyHQ/tracy#189, COO rule 29/10/2026): a Joomla brief build writes the new words
 * of a heading inside the demo's own inline tags ("THE<br/><span>WORKOUT</span>" becomes "WHAT WE<br/><span>COACH</span>").
 *
 * Why there is more than one write: the content contract takes words only (`QuickstartContract::checkValue` refuses `<` and
 * `>`), and a whole-unit HTML slot is written as one text node, its `<span>`, `<strong>` and `<br>` removed
 * (`ContentSlots::writeUnit`). So, by the door each kind of slot has:
 *   a JA ACM field   its markup is spelled `((span))…((/span))`, words to the contract: written by the contract, styled
 *   an HTML unit     the contract writes the plain words (the unit's binding, revision and evidence stay the contract's), then
 *                    a records step after it (`content.batch`, with the module and article writes of the tidy-up) puts the
 *                    demo's tags back around those words at the same path, so every node a slot binds to is still there
 * The writer marks the key words of its own sentence (`[[COACH]]`, `[[br]]`); words with no fitting marks (a fallback, neutral
 * words, a pinned line) are styled by position. A style that could not be written is said (`inlineStyleLost`), never dropped.
 * Framework-wide (T4 and T3: module parameters, ACM fields, article HTML), never per template.
 */
import {
  applyInlineStyle,
  hasStyleMarks,
  keepsInlineStyle,
  unmarked
} from 'website-opportunities/domain/inline-style.mjs'
import { isUnitPath, leafOf, unitSpan } from './inline-styles.js'
import { paramsOf, readModules } from './joomla-tidy.js'

/**
 * The writer's marks taken out of its words, kept apart: every later step (guards, honesty, translations, length checks) reads
 * plain words, and the write puts the style back (`styleChanges`). A mark on a slot with no style is just dropped.
 * @param {Record<string, string>} changes - the planned words, by slot key: changed in place
 * @returns {Record<string, string>} the marked words, by key, for the slots whose words carried marks
 */
export function takeStyleMarks(changes) {
  /** @type {Record<string, string>} */
  const marks = {}
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value !== 'string' || !hasStyleMarks(value)) continue
    marks[key] = value
    changes[key] = unmarked(value)
  }
  return marks
}

/**
 * The words about to be written, styled where the demo was: a JA ACM field takes its marker form through the contract when it
 * fits the slot; every other styled slot is written plain by the contract and returned, for the records step after it.
 * @param {object} input
 * @param {Record<string, string>} input.changes - the contract write, by key: changed in place
 * @param {Map<string, any>} input.slots - the content map's slots by key (`inlineStyle` from `withInlineStyles`)
 * @param {Record<string, string>} [input.marks] - the writer's marked words (`takeStyleMarks`)
 * @returns {Array<{ slot: any, value: string, by: string }>} the HTML units to style after the contract write
 */
export function styleChanges({ changes, slots, marks = {} }) {
  const out = []
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value !== 'string') continue
    const slot = slots.get(key)
    // A stray mark on a slot without style never reaches the site.
    if (!slot?.inlineStyle) {
      if (hasStyleMarks(value)) changes[key] = unmarked(value)
      continue
    }
    const plain = unmarked(value)
    if (plain === '') continue
    // The writer's marks count only while its words still stand: a later step that replaced them is styled by position.
    const marked = marks[key] && unmarked(marks[key]) === plain ? marks[key] : plain
    const styled = applyInlineStyle(slot.inlineStyle, marked)
    const max = Number(slot.maxCharacters)
    if (
      slot.inlineStyle.form === 'acm' &&
      !slot.xpath &&
      (!Number.isFinite(max) || [...styled.value].length <= max)
    ) {
      changes[key] = styled.value
      continue
    }
    // The contract writes the words; the style follows in the records step (an HTML unit, a JSON leaf holding HTML, or a
    // marker field whose markers would pass the slot's length).
    changes[key] = plain
    if (!slot.xpath || isUnitPath(slot.xpath)) out.push({ slot, value: styled.value, by: styled.by })
  }
  return out
}

/** A records step's or a row's column, the `params` of a module. */
const fieldOf = (/** @type {any} */ slot) =>
  String(slot.entity).startsWith('module-') && slot.column !== 'content' ? 'params' : String(slot.column)

/**
 * A column's value with one slot's leaf set to `value`: the unit's inner HTML replaced at its path, or the JSON leaf replaced.
 * Null when the slot's place is not there.
 * @param {string} column - the column as stored
 * @param {any} slot
 * @param {string} value - the styled value
 */
export function styledColumn(column, slot, value) {
  const replaceIn = (/** @type {string} */ leaf) => {
    if (!slot.xpath) return value
    const span = unitSpan(leaf, slot.xpath)
    return span ? leaf.slice(0, span.start) + value + leaf.slice(span.end) : null
  }
  if (!(Array.isArray(slot.jsonPath) && slot.jsonPath.length > 0))
    return typeof column === 'string' ? replaceIn(column) : null
  const params = paramsOf(column)
  if (!params) return null
  const container = slot.nestedJson ? paramsOf(params[slot.nestedJson]) : params
  if (!container) return null
  const path = slot.jsonPath
  let parent = container
  for (const step of path.slice(0, -1)) parent = parent?.[step]
  const last = path.at(-1)
  if (!parent || typeof parent[last] !== 'string') return null
  const next = replaceIn(parent[last])
  if (next === null) return null
  parent[last] = next
  return JSON.stringify(
    slot.nestedJson ? { ...params, [slot.nestedJson]: JSON.stringify(container) } : container
  )
}

/**
 * The records steps with the styled units laid in: a step that already writes the entity's column takes the style on top of
 * its own value, any other entity gets a step of its own from the row as it stands. Pure.
 * @param {object} input
 * @param {Array<{ slot: any, value: string }>} input.styled
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} input.steps
 * @param {Map<number, any>} input.modules - module rows by id
 * @param {Map<number, any>} [input.articles] - article rows by id
 * @returns {{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }>, placed: string[], missed: string[] }}
 */
export function inlineStyleSteps({ styled, steps, modules, articles = new Map() }) {
  const out = steps.map((step) => ({ ...step, fields: { ...step.fields } }))
  const placed = []
  const missed = []
  for (const { slot, value } of styled) {
    const [kind, idText] = String(slot.entity).split('-')
    const id = Number(idText)
    const field = fieldOf(slot)
    const row = kind === 'module' ? modules.get(id) : kind === 'article' ? articles.get(id) : null
    let step = out.find((s) => s.kind === kind && s.id === id && field in s.fields)
    const base = step ? step.fields[field] : row?.[field]
    // A module row read through the content door may hold its parameters parsed.
    const stored =
      typeof base === 'string' ? base : base && typeof base === 'object' ? JSON.stringify(base) : null
    const next = stored === null ? null : styledColumn(stored, slot, value)
    if (next === null) {
      missed.push(slot.key)
      continue
    }
    if (!step) {
      step = { kind, id, fields: {} }
      out.push(step)
    }
    step.fields[field] = next
    placed.push(slot.key)
  }
  return { steps: out, placed, missed }
}

/**
 * The styled slots whose style is not in the row as the site now holds it: what `inlineStyleLost` counts.
 * @param {Array<{ slot: any }>} styled
 * @param {(slot: any) => Record<string, any> | null | undefined} rowOf
 * @returns {string[]}
 */
export function lostInlineStyles(styled, rowOf) {
  const lost = []
  for (const { slot } of styled) {
    const leaf = leafOf(rowOf(slot) ?? {}, slot)
    const span = leaf !== null && slot.xpath ? unitSpan(leaf, slot.xpath) : null
    const stored = leaf === null ? null : span ? leaf.slice(span.start, span.end) : leaf
    if (stored === null || !keepsInlineStyle(slot.inlineStyle, stored)) lost.push(slot.key)
  }
  return lost
}

/**
 * The rows the styled slots sit in, as the site holds them now: the module rows, and the articles a styled slot names.
 * @param {(call: any) => Promise<any>} apply
 * @param {string} siteKey
 * @param {Array<{ slot: any }>} styled
 */
async function rowsNow(apply, siteKey, styled) {
  const modules = new Map((await readModules(apply, siteKey)).map((row) => [Number(row.id), row]))
  const articles = new Map()
  for (const { slot } of styled) {
    const [kind, idText] = String(slot.entity).split('-')
    const id = Number(idText)
    if (kind !== 'article' || articles.has(id)) continue
    const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id } })
    if (answer?.ok !== false && answer?.item) articles.set(id, answer.item)
  }
  return { modules, articles }
}

/**
 * The records steps of the tidy-up with the styled units laid in, read from the rows as they stand after the contract write.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{ slot: any, value: string }>} input.styled
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} input.steps
 */
export async function placeInlineStyles({ apply, siteKey, styled, steps }) {
  if (styled.length === 0) return { steps, placed: [], missed: [] }
  const { modules, articles } = await rowsNow(apply, siteKey, styled)
  return inlineStyleSteps({ styled, steps, modules, articles })
}

/**
 * The styled slots whose style the site does not hold after every write: read back, never assumed.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{ slot: any }>} input.styled
 */
export async function inlineStylesLost({ apply, siteKey, styled }) {
  if (styled.length === 0) return []
  const { modules, articles } = await rowsNow(apply, siteKey, styled)
  return lostInlineStyles(styled, (slot) => {
    const [kind, idText] = String(slot.entity).split('-')
    return (kind === 'module' ? modules : kind === 'article' ? articles : new Map()).get(Number(idText))
  })
}
