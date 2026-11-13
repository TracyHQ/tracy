/**
 * Helpers of `copy-proof.mjs` (ticket #584): the plugin's door, a module copied from the store, a page, a value set
 * at a mapping location of a record, the HTML a module draws on a page.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPTY_HTML } from '../../packages/cms/tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DOOR = 'index.php?option=com_claudecowork&task=api.exec&format=json'
/** The module columns the plugin's open write accepts on a new module record (measured on 0.24.85). */
export const MODULE_COLUMNS = Object.freeze([
  'title',
  'note',
  'content',
  'position',
  'module',
  'access',
  'showtitle',
  'params',
  'published',
  'language',
  'ordering'
])

export function doorOf(base, token) {
  let n = 0
  const call = async (action, params) => {
    const response = await fetch(`${base}/${DOOR}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, params })
    })
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return { ok: false, error: 'not_json', message: `HTTP ${response.status}: ${text.slice(0, 200)}` }
    }
  }
  const stamp = Date.now()
  /** An open write (`content.update`); throws when the door refuses it. */
  const update = async (kind, id, fields) => {
    const answer = await call('content.update', { apply_id: `copy-proof-${stamp}-${n++}`, kind, id, fields })
    if (answer.ok !== true)
      throw new Error(`content.update ${kind} ${id}: ${answer.error}: ${answer.message}`)
    return answer
  }
  const get = async (kind, id) => {
    const answer = await call('content.get', { kind, id })
    if (answer.ok !== true) throw new Error(`content.get ${kind} ${id}: ${answer.error}: ${answer.message}`)
    return answer.item
  }
  return { call, update, get }
}

/** Fetch a page of the site and return its HTML (status 200 required). */
export async function pageHtml(base, pageId) {
  const response = await fetch(`${base}/index.php?Itemid=${pageId}`)
  const html = await response.text()
  if (response.status !== 200) throw new Error(`page ${pageId} answered ${response.status}`)
  return html
}

/** The HTML a module draws on a page: from its wrapper (`id="Mod<id>"`) to the next module wrapper or section. */
export function moduleHtml(html, id) {
  const start = html.indexOf(`id="Mod${id}"`)
  if (start < 0) return null
  const rest = html.slice(start + 1)
  const ends = [rest.search(/id="Mod\d+"/), rest.search(/<div id="t4-/)].filter((i) => i >= 0)
  return rest.slice(0, ends.length ? Math.min(...ends) : undefined)
}

/** The anchors that hold no words and no picture: the empty button the blank site leaves when nothing hides it. */
export const emptyAnchorList = (html) =>
  [...String(html ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .filter(([, inner]) => inner.replace(/<!--[\s\S]*?-->/g, '').trim() === '')
    .map(([whole]) => whole)
export const emptyAnchors = (html) => emptyAnchorList(html).length

/** Set or read pieces of stored HTML values with the plugin's own functions (`html-piece.php`). */
export function pieces(lib, list) {
  const out = JSON.parse(
    execFileSync('php', [path.join(HERE, 'html-piece.php')], {
      input: JSON.stringify({ lib, markers: EMPTY_HTML, pieces: list }),
      maxBuffer: 1 << 26
    })
  )
  for (const r of out) if (r.error) throw new Error(r.error)
  return out
}

const parse = (value) => (typeof value === 'string' && value.trim() !== '' ? JSON.parse(value) : {})
// PHP's json_encode form, as Joomla stores a nested JSON value: slashes escaped.
const encode = (value) => JSON.stringify(value).replace(/\//g, '\\/')

/**
 * The fields of a module record with `value` set at a mapping location (`{column, nestedJson?, jsonPath?, xpath?}`)
 * of that record. A piece (`xpath`) is set with the plugin's functions.
 */
export function setAt(fields, loc, value, lib) {
  const column = loc.column
  const setText = (stored) =>
    loc.xpath ? pieces(lib, [{ value: stored, xpath: loc.xpath, set: value }])[0].value : value
  if (!loc.jsonPath && !loc.nestedJson) return { ...fields, [column]: setText(String(fields[column] ?? '')) }
  const outer = parse(fields[column])
  const inner = loc.nestedJson ? parse(outer[loc.nestedJson]) : outer
  const steps = loc.jsonPath ?? []
  let node = inner
  for (const step of steps.slice(0, -1)) node = node[step]
  const last = steps.at(-1)
  node[last] = setText(String(node[last] ?? ''))
  if (loc.nestedJson) outer[loc.nestedJson] = encode(inner)
  return { ...fields, [column]: JSON.stringify(outer) }
}

/** The value a module record holds at a mapping location (a piece: the text the plugin reads there). */
export function getAt(fields, loc, lib) {
  let value = fields[loc.column]
  if (loc.jsonPath || loc.nestedJson) {
    const outer = parse(value)
    let node = loc.nestedJson ? parse(outer[loc.nestedJson]) : outer
    for (const step of loc.jsonPath ?? []) node = node?.[step]
    value = node
  }
  return loc.xpath ? pieces(lib, [{ value: String(value ?? ''), xpath: loc.xpath }])[0].text : value
}

/** Cut the parallel lists of a `row` hide to the first `keep` rows, in a module record's fields. */
export function cutRows(fields, row, keep) {
  const outer = parse(fields[row.column])
  const inner = row.nestedJson ? parse(outer[row.nestedJson]) : outer
  let node = inner
  for (const step of row.parent) node = node[step]
  for (const key of row.arrays ?? []) if (Array.isArray(node[key])) node[key] = node[key].slice(0, keep)
  if (row.nestedJson) outer[row.nestedJson] = encode(inner)
  return { ...fields, [row.column]: JSON.stringify(outer) }
}

/** The fields of a copy of a store module: its accepted columns as the store holds them. */
export const copyFields = (record) =>
  Object.fromEntries(
    MODULE_COLUMNS.filter((c) => record[c] !== null && record[c] !== undefined).map((c) => [c, record[c]])
  )
