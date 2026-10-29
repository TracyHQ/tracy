/**
 * 🔒 NO WRITE OUTSIDE THE CONTRACT REMOVES OR RESHAPES A NODE A CONTRACT SLOT BINDS TO (spec TracyHQ/tracy#189, 29/10/2026).
 *
 * The tidy-up writes module parameters and article HTML through the records door (`content.batch`): the plan's emptied
 * facts (`joomla-plan-records.js`), contact links (`joomla-plan-contacts.js`), social links and maps
 * (`joomla-plan-identity.js`). A slot of the contract is bound to one node of that HTML by its path (`xpath`), and the
 * plugin's inspect refuses the whole site when a path finds no node or two ("HTML slot is missing or ambiguous"). Measured
 * on a local brief build: a stat sentence emptied by deleting its words left three paths without a node, and every contract
 * write after it was refused. So every such step is checked before it is written: a slot whose path finds exactly one node
 * in the row as it is must find exactly one in the row the step writes, else the step is not written and is counted.
 * Framework-wide (the content map's paths), never per template.
 */
import { parse } from 'parse5'

import { paramsOf, readModules } from './joomla-tidy.js'

/** An article's columns that hold HTML. */
const HTML_COLUMNS = ['introtext', 'fulltext']

/**
 * How many nodes an absolute content-map path finds in a field's HTML, or null for a path outside the grammar the maps use
 * (element steps `div`, `span[2]`, `text()`, `text()[n]`, `@attr`).
 * @param {string} html
 * @param {string} xpath
 * @returns {number | null}
 */
export function nodesAt(html, xpath) {
  /** @type {any[]} */
  const path = String(xpath)
  if (!path.startsWith('/') || path.includes('//')) return null
  let nodes = [parse(`<!doctype html><html><head></head><body>${html}</body></html>`)]
  for (const step of path.split('/').filter(Boolean)) {
    const parts = /^(@[\w:-]+|text\(\)|[a-z][\w-]*)(?:\[(\d+)\])?$/i.exec(step)
    if (!parts) return null
    const [, name, nth] = parts
    nodes = nodes.flatMap((node) => {
      const found = name.startsWith('@')
        ? (node.attrs ?? []).filter((/** @type {any} */ a) => a.name === name.slice(1).toLowerCase())
        : name === 'text()'
          ? (node.childNodes ?? []).filter((/** @type {any} */ c) => c.nodeName === '#text')
          : (node.childNodes ?? []).filter((/** @type {any} */ c) => c.tagName === name.toLowerCase())
      return nth ? found.slice(Number(nth) - 1, Number(nth)) : found
    })
  }
  return nodes.length
}

/** The value at `path` inside `root`, or undefined. */
function at(root, path) {
  let node = root
  for (const step of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[step]
  }
  return node
}

/**
 * The HTML a slot reads in a row's fields, or null.
 * @param {any} slot
 * @param {Record<string, unknown>} fields - the row's columns (stored strings, parameters as JSON text)
 */
function htmlOf(slot, fields) {
  if (HTML_COLUMNS.includes(slot.column))
    return typeof fields[slot.column] === 'string' ? fields[slot.column] : null
  const column = slot.column === 'params' || slot.column === 'attribs' ? slot.column : null
  if (!column || typeof fields[column] !== 'string') return null
  let container = paramsOf(fields[column])
  if (container && slot.nestedJson) container = paramsOf(container[slot.nestedJson])
  const value = container ? at(container, slot.jsonPath ?? []) : undefined
  return typeof value === 'string' ? value : null
}

/**
 * The steps that keep every bound node, and the ones that would take one away.
 * @param {object} input
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} input.steps
 * @param {any[]} input.slots - the content map's slots
 * @param {Map<number, any>} input.modules - the module rows as they stand, by id
 * @param {Map<number, any>} [input.articles] - the article rows as they stand, by id
 * @returns {{ steps: Array<{ kind: string, id: number, fields: Record<string, unknown> }>, dropped: Array<{ kind: string, id: number, keys: string[] }> }}
 */
export function keepBoundNodes({ steps, slots, modules, articles = new Map() }) {
  /** @type {Map<string, any[]>} */
  const bound = new Map()
  for (const slot of slots) {
    if (!slot?.xpath) continue
    bound.set(slot.entity, [...(bound.get(slot.entity) ?? []), slot])
  }
  const kept = []
  const dropped = []
  for (const step of steps) {
    const rows = step.kind === 'module' ? modules : step.kind === 'article' ? articles : null
    const row = rows?.get(Number(step.id))
    const mine = bound.get(`${step.kind}-${step.id}`) ?? []
    if (!row || mine.length === 0) {
      kept.push(step)
      continue
    }
    const after = { ...row, ...step.fields }
    const lost = mine.filter((slot) => {
      if (!(slot.column in step.fields)) return false
      const before = htmlOf(slot, row)
      if (before === null || nodesAt(before, slot.xpath) !== 1) return false
      const now = htmlOf(slot, after)
      return now === null || nodesAt(now, slot.xpath) !== 1
    })
    if (lost.length === 0) kept.push(step)
    else dropped.push({ kind: step.kind, id: step.id, keys: lost.map((slot) => slot.key) })
  }
  return { steps: kept, dropped }
}

/**
 * The records steps checked against the rows as the site holds them now: the module rows, and the articles whose HTML a step
 * writes. A step that would take a bound node away is not written; the keys it would have broken are returned.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} input.steps
 * @param {any[]} input.slots - the content map's slots
 */
export async function guardBoundNodes({ apply, siteKey, steps, slots }) {
  if (!steps.some((step) => step.kind === 'module' || step.kind === 'article')) return { steps, dropped: [] }
  const modules = new Map((await readModules(apply, siteKey)).map((row) => [Number(row.id), row]))
  const articles = new Map()
  for (const step of steps) {
    if (
      step.kind !== 'article' ||
      !HTML_COLUMNS.some((c) => c in step.fields) ||
      articles.has(Number(step.id))
    )
      continue
    const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id: step.id } })
    if (answer?.ok !== false && answer?.item) articles.set(Number(step.id), answer.item)
  }
  return keepBoundNodes({ steps, slots, modules, articles })
}
