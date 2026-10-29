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

/** The columns of a record that hold HTML: an article's body, a custom module's content, a contact's note. */
const HTML_COLUMNS = ['introtext', 'fulltext', 'content', 'misc']

/**
 * The nodes an absolute content-map path finds in a field's HTML, exactly as the plugin resolves it, or null for a path
 * outside the grammar the maps use (element steps `div`, `span[2]`, `text()`, `text()[n]`, `@attr`).
 *
 * The plugin parses a field as `<html><body><div id="contract-root">HTML</div></body></html>` and runs the path on that
 * document (`ContentSlots::html`), so a module with no outer element of its own is read at `/html/body/div/a[2]`. Parsing
 * without that root finds nothing for every real path, and a guard that finds nothing judges nothing. An attribute comes
 * back with the element that holds it (`owner`).
 * @param {string} html
 * @param {string} xpath
 * @returns {any[] | null}
 */
export function boundNodes(html, xpath) {
  const path = String(xpath ?? '')
  if (!path.startsWith('/') || path.includes('//')) return null
  /** @type {any[]} */
  let nodes = [parse(`<!doctype html><html><head></head><body><div>${html}</div></body></html>`)]
  for (const step of path.split('/').filter(Boolean)) {
    const parts = /^(@[\w:-]+|text\(\)|[a-z][\w-]*)(?:\[(\d+)\])?$/i.exec(step)
    if (!parts) return null
    const [, name, nth] = parts
    nodes = nodes.flatMap((node) => {
      const found = name.startsWith('@')
        ? (node.attrs ?? [])
            .filter((/** @type {any} */ a) => a.name === name.slice(1).toLowerCase())
            .map((/** @type {any} */ a) => ({ ...a, owner: node }))
        : name === 'text()'
          ? (node.childNodes ?? []).filter((/** @type {any} */ c) => c.nodeName === '#text')
          : (node.childNodes ?? []).filter((/** @type {any} */ c) => c.tagName === name.toLowerCase())
      return nth ? found.slice(Number(nth) - 1, Number(nth)) : found
    })
  }
  return nodes
}

/**
 * How many nodes an absolute content-map path finds in a field's HTML (`boundNodes`), or null outside the grammar.
 * @param {string} html
 * @param {string} xpath
 * @returns {number | null}
 */
export function nodesAt(html, xpath) {
  return boundNodes(html, xpath)?.length ?? null
}

/** What a link leads to, by kind: an empty link (`#`) leads nowhere yet, so a write may give it any target. */
function linkKind(/** @type {string | undefined} */ href) {
  const h = String(href ?? '').trim()
  if (h === '' || h === '#') return ''
  const scheme = /^([a-z][\w+.-]*):/i.exec(h)?.[1]?.toLowerCase()
  return /wa\.me\/|api\.whatsapp\.com/i.test(h) ? 'whatsapp' : (scheme ?? 'page')
}

/** An element's classes, sorted. */
function classesOf(/** @type {any} */ el) {
  const value = el.attrs?.find((/** @type {any} */ a) => a.name === 'class')?.value
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

/** The kinds of the links in an element and under it, in order (`linkKind`). */
function linksIn(/** @type {any} */ el) {
  /** @type {string[]} */
  const out = []
  const walk = (/** @type {any} */ node) => {
    if (!node?.tagName) return
    if (node.tagName === 'a')
      out.push(linkKind(node.attrs?.find((/** @type {any} */ x) => x.name === 'href')?.value))
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(el)
  return out
}

/**
 * Two elements of the same kind: same tag, same classes, and the same links in the same order, each of the same kind (an
 * empty link matches any). Words and inline tags inside (a strong word, a break) aside: a write may restyle a unit.
 */
function sameShape(/** @type {any} */ a, /** @type {any} */ b) {
  if (!a?.tagName || !b?.tagName) return a === b
  if (a.tagName !== b.tagName || classesOf(a) !== classesOf(b)) return false
  const la = linksIn(a)
  const lb = linksIn(b)
  return la.length === lb.length && la.every((k, i) => !k || !lb[i] || k === lb[i])
}

/**
 * Whether the nodes a path found before and after a write are the same node of the block: an element of the same shape
 * (`sameShape`; an attribute or a text is judged by the element that holds it). A write that changes the words or points a
 * link at the business keeps it; a sibling put in front of it, which hands its path to another node, does not.
 */
export function sameBoundNode(/** @type {any} */ before, /** @type {any} */ after) {
  const elementOf = (/** @type {any} */ n) => n?.owner ?? (n?.nodeName === '#text' ? n.parentNode : n)
  return sameShape(elementOf(before), elementOf(after))
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
export function keepBoundNodes({ steps, slots, modules, articles = new Map(), contacts = new Map() }) {
  /** @type {Map<string, any[]>} */
  const bound = new Map()
  for (const slot of slots) {
    // A path into HTML, or a path into JSON parameters: both are what the plugin's inspect resolves.
    if (!slot?.xpath && !(Array.isArray(slot?.jsonPath) && slot.jsonPath.length > 0)) continue
    bound.set(slot.entity, [...(bound.get(slot.entity) ?? []), slot])
  }
  const kept = []
  const dropped = []
  for (const step of steps) {
    const rows =
      step.kind === 'module'
        ? modules
        : step.kind === 'article'
          ? articles
          : step.kind === 'contact'
            ? contacts
            : null
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
      const now = htmlOf(slot, after)
      // A JSON path holds words before and after, or it is taken away ("Content slot is not text").
      if (!slot.xpath) return before !== null && now === null
      const was = before === null ? null : boundNodes(before, slot.xpath)
      if (!was || was.length !== 1) return false
      const is = now === null ? null : boundNodes(now, slot.xpath)
      return !is || is.length !== 1 || !sameBoundNode(was[0], is[0])
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
  if (!steps.some((step) => ['module', 'article', 'contact'].includes(step.kind)))
    return { steps, dropped: [] }
  const modules = new Map((await readModules(apply, siteKey)).map((row) => [Number(row.id), row]))
  const articles = new Map()
  for (const step of steps) {
    const writes = [...HTML_COLUMNS, 'attribs'].some((c) => c in step.fields)
    if (step.kind !== 'article' || !writes || articles.has(Number(step.id))) continue
    const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id: step.id } })
    if (answer?.ok !== false && answer?.item) articles.set(Number(step.id), answer.item)
  }
  const contacts = new Map()
  for (const step of steps) {
    if (step.kind !== 'contact' || !('misc' in step.fields) || contacts.has(Number(step.id))) continue
    const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'contact', id: step.id } })
    if (answer?.ok !== false && answer?.item) contacts.set(Number(step.id), answer.item)
  }
  return keepBoundNodes({ steps, slots, modules, articles, contacts })
}
