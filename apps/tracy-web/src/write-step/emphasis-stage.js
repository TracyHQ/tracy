// The emphasis stage of the write step (ADR 0042 section 11, 2026-11-06), right after the contract call. The contract door writes a
// heading's words as one text node, so `What we((br/))((span))coach((/span))` lands in the site as those characters, and a slot
// whose demo value is real HTML (a T4 section's `main-section`, an article's extra field, a masthead title) prints the codes as
// words. Here each such slot is read back whole (`content.get`), the written words are found in its stored HTML exactly once, and
// they are replaced by the same words with real tags (`What we<br/><span>coach</span>`), then saved with `content.update`.
//
// Per slot, from the content map (lib/site-copy/emphasis-markup.js `storageOf`):
//   - html: converted as above; the line carries `stored` (what the site now holds) and `readFrom` (the raw read) for read-back;
//   - codes: an ACM module's data, which the template reads codes from itself: left as written;
//   - unknown: left as written, with a `warning` on its line, never guessed.
// The words are looked for at the content map's path first, then in every text of the whole stored value: rows removed in the same
// write shrink the array the path indexes, so the heading has moved (card N, 2026-11-06). A slot whose words cannot be found exactly
// once keeps its codes and its line blocks the write step (`blocking`), since the page would print the codes as words. Nothing
// else of the row changes: the look guard holds the update to the emphasis form alone (look-guard-emphasis.js).
import { createHash } from 'node:crypto'
import { codesToHtml, escapeText, hasEmphasisCodes, storageOf } from '../lib/site-copy/emphasis-markup.js'
import { doorCall } from './settings-door.js'

const ENTITY = /^([a-zA-Z]+)-(\d+)$/

const parsed = (value) => {
  if (typeof value !== 'string') return value && typeof value === 'object' ? structuredClone(value) : null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** The number of times `needle` stands in `text`. */
const timesIn = (text, needle) => (needle ? text.split(needle).length - 1 : 0)

/** The leaf a slot's jsonPath names in a parsed column, with a setter; null when the path does not lead to a string. */
function leafAt(root, path) {
  let holder = null
  let step = null
  let value = root
  for (const key of path) {
    if (!value || typeof value !== 'object' || !(key in value)) return null
    holder = value
    step = key
    value = value[key]
  }
  if (typeof value !== 'string' || !holder) return null
  return { value, set: (next) => void (holder[step] = next) }
}

/** Every string leaf of a parsed column, with its path and a setter. */
function leavesOf(root, path = [], out = []) {
  if (!root || typeof root !== 'object') return out
  for (const [step, value] of Object.entries(root)) {
    const key = Array.isArray(root) ? Number(step) : step
    if (typeof value === 'string')
      out.push({ value, path: [...path, key], set: (next) => void (root[key] = next) })
    else leavesOf(value, [...path, key], out)
  }
  return out
}

/**
 * The one leaf that holds `needle` once: the leaf at the slot's path when it does, else the only leaf of the whole value that
 * holds it, the value holding it once in all. `times` is how often the whole value holds it when no such leaf is found.
 */
function findWritten(held, path, needle) {
  if (!path.length) {
    if (typeof held.text !== 'string') return { times: 0 }
    const times = timesIn(held.text, needle)
    return times === 1
      ? { leaf: { value: held.text, path, set: (next) => void (held.text = next) } }
      : { times }
  }
  if (!held.json) return { times: 0 }
  const indexed = leafAt(held.json, path)
  if (indexed && timesIn(indexed.value, needle) === 1) return { leaf: { ...indexed, path } }
  const holding = leavesOf(held.json).filter((l) => l.value.includes(needle))
  const times = holding.reduce((sum, l) => sum + timesIn(l.value, needle), 0)
  return times === 1 ? { leaf: holding[0] } : { times }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, contentMap?: object | null, written: Iterable<string>,
 *   ordered: Record<string, string> }} input `written`: the content map keys the contract call wrote; `ordered`: what it sent
 * @returns {Promise<Map<string, { storage: string, stored?: string, readFrom?: object, warning?: string, blocking?: true }>>} by content map key,
 *   for every written key whose value holds emphasis codes
 */
export async function runEmphasisStage({ door, siteKey, contentMap, written, ordered }) {
  const results = new Map()
  const slots = new Map((Array.isArray(contentMap?.slots) ? contentMap.slots : []).map((s) => [s?.key, s]))
  const byEntity = new Map()
  for (const key of written) {
    const value = ordered[key]
    if (typeof value !== 'string' || !hasEmphasisCodes(value)) continue
    const slot = slots.get(key)
    const storage = storageOf(slot)
    if (storage === 'codes') results.set(key, { storage })
    else if (storage === 'unknown' || !ENTITY.test(String(slot.entity)))
      results.set(key, {
        storage: 'unknown',
        warning:
          'the content map does not say whether this slot stores HTML or content map codes, so its emphasis codes were left as written'
      })
    else {
      if (!byEntity.has(slot.entity)) byEntity.set(slot.entity, [])
      byEntity.get(slot.entity).push({ key, slot, value })
    }
  }
  if (!byEntity.size) return results
  const call = doorCall(door, siteKey)
  // An HTML slot left with its codes prints them as words: its line blocks the write step (card N).
  const keep = (key, reason) =>
    results.set(key, {
      storage: 'html',
      warning: `${reason}, so its emphasis codes were left as written`,
      blocking: true
    })
  for (const [entity, wanted] of byEntity) {
    const [, kind, idText] = ENTITY.exec(entity)
    const id = Number(idText)
    let item
    try {
      item = (await call('content.get', { kind, id }))?.item
    } catch (error) {
      for (const w of wanted) keep(w.key, `${entity} could not be read (${error.message})`)
      continue
    }
    const columns = new Map()
    const done = []
    for (const { key, slot, value } of wanted) {
      const column = slot.column
      const path = Array.isArray(slot.jsonPath) ? slot.jsonPath : []
      if (!columns.has(column))
        columns.set(column, path.length ? { json: parsed(item?.[column]) } : { text: item?.[column] })
      const held = columns.get(column)
      const needle = escapeText(value)
      const { leaf, times } = findWritten(held, path, needle)
      if (!leaf) {
        keep(
          key,
          `the stored HTML holds the written words ${times} times, not once (looked at every text of ${entity} ${column})`
        )
        continue
      }
      const stored = codesToHtml(value)
      leaf.set(leaf.value.replace(needle, () => stored))
      held.changed = true
      done.push({
        key,
        stored,
        readFrom: {
          action: 'content.get',
          params: { kind, id },
          path: ['item', column, ...leaf.path],
          type: 'contains'
        }
      })
    }
    const fields = {}
    for (const [column, held] of columns)
      if (held.changed) fields[column] = held.json ? JSON.stringify(held.json) : held.text
    if (!Object.keys(fields).length) continue
    try {
      await call('content.update', {
        apply_id: `emphasis-${createHash('sha256')
          .update(`${entity} ${JSON.stringify(fields)}`)
          .digest('hex')
          .slice(0, 32)}`,
        kind,
        id,
        fields
      })
      for (const d of done) results.set(d.key, { storage: 'html', stored: d.stored, readFrom: d.readFrom })
    } catch (error) {
      for (const d of done) keep(d.key, `the site refused the emphasis tags (${error.message})`)
    }
  }
  return results
}

/** The report lines with what the emphasis stage did to each written slot it looked at. */
export function withEmphasis(lines, results) {
  if (!results?.size) return lines
  return lines.map((line) => {
    const done = line.status === 'written' && !line.unchanged && results.get(line.key)
    if (!done) return line
    return {
      ...line,
      emphasis: done.storage,
      ...(done.stored ? { stored: done.stored, readFrom: done.readFrom } : {}),
      ...(done.warning ? { warning: done.warning } : {}),
      ...(done.blocking ? { emphasisBlocking: true } : {})
    }
  })
}
