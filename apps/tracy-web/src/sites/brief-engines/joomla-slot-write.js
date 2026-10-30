/**
 * A content-map slot written into a copy of its record's row, outside the contract (ticket #238): a page the build adds
 * copies a template record, which the contract does not bind, so its words are set field by field the way the content map
 * locates them: a plain column, a path in a JSON column (inside a nested JSON string when the map says so), or the one node
 * an HTML path finds (`boundNodes`, the same grammar the plugin reads). The markup around the node is kept as it is.
 */
import { serialize } from 'parse5'

import { boundNodes } from './joomla-bound-nodes.js'
import { JSON_FIELDS } from './joomla-record-fields.js'
import { paramsOf } from './joomla-tidy.js'

/**
 * The HTML with the one node `xpath` finds holding `value`: a text node keeps its surrounding white space, an attribute takes
 * the value, an element holds only the value as text. Null when the path finds no node or more than one.
 * @param {string} html @param {string} xpath @param {string} value
 */
export function setBoundText(html, xpath, value) {
  const nodes = boundNodes(html, xpath)
  if (nodes?.length !== 1) return null
  const node = nodes[0]
  if (node.owner) {
    const attr = node.owner.attrs.find((/** @type {any} */ a) => a.name === node.name)
    if (attr) attr.value = value
  } else if (node.nodeName === '#text') {
    const [, lead, , trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.value) ?? ['', '', '', '']
    node.value = `${lead}${value}${trail}`
  } else node.childNodes = [{ nodeName: '#text', value, parentNode: node }]
  let root = node.owner ?? node
  while (root.parentNode && root.parentNode.tagName !== 'body') root = root.parentNode
  if (root.parentNode?.tagName !== 'body') return null
  return serialize(root)
}

/**
 * Write one slot's value into a row (changed in place).
 * @param {Record<string, any>} row - the record's fields
 * @param {{column: string, xpath?: string, jsonPath?: Array<string | number>, nestedJson?: string}} slot
 * @param {string} value
 * @returns {boolean} whether the slot's place was found and written
 */
export function setSlotValue(row, slot, value) {
  const column = String(slot.column ?? '')
  if (!(column in row)) return false
  const path = Array.isArray(slot.jsonPath) ? slot.jsonPath : null
  if (JSON_FIELDS.has(column) && path?.length) {
    const outer = paramsOf(row[column])
    if (!outer) return false
    const container = slot.nestedJson ? paramsOf(outer[slot.nestedJson]) : outer
    if (!container) return false
    let at = container
    for (const step of path.slice(0, -1)) {
      if (!at || typeof at[step] !== 'object' || at[step] === null) return false
      at = at[step]
    }
    const last = /** @type {string | number} */ (path.at(-1))
    if (!at || !(last in at)) return false
    const before = at[last]
    if (slot.xpath && typeof before === 'string') {
      const next = setBoundText(before, slot.xpath, value)
      if (next === null) return false
      at[last] = next
    } else at[last] = value
    if (slot.nestedJson) outer[slot.nestedJson] = JSON.stringify(container)
    row[column] = JSON.stringify(outer)
    return true
  }
  if (slot.xpath) {
    if (typeof row[column] !== 'string') return false
    const next = setBoundText(row[column], slot.xpath, value)
    if (next === null) return false
    row[column] = next
    return true
  }
  row[column] = value
  return true
}
