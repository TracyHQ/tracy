/**
 * The hero's second button, written through its module's parameters (spec TracyHQ/tracy#189, COO rule 29/10/2026: the main
 * button calls, the second one opens WhatsApp when the template gives the first slide a second button).
 *
 * The template ships that button empty, and the content contract cannot activate an empty slot (a refusal there costs the
 * whole write), so the site plan carries it apart (`hero.second`, `hero-first-screen.mjs`) and this step sets the label and
 * the link at the slots' own JSON paths, in place: the paths keep their place, so no bound slot loses its node
 * (`joomla-bound-nodes.js`). A button that already says something (a person's words) is left alone. By slot path, never by
 * template. Pure.
 */
import { paramsOf } from './joomla-tidy.js'

/** The value at `path` inside `root`, or undefined. */
function at(/** @type {any} */ root, /** @type {Array<string | number>} */ path) {
  let node = root
  for (const step of path) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[step]
  }
  return node
}

/** `root` with the string at `path` set to `value`; false when the path holds no string. */
function setAt(
  /** @type {any} */ root,
  /** @type {Array<string | number>} */ path,
  /** @type {string} */ value
) {
  const parent = at(root, path.slice(0, -1))
  const last = path.at(-1)
  if (parent === null || typeof parent !== 'object' || last === undefined || typeof parent[last] !== 'string')
    return false
  parent[last] = value
  return true
}

/**
 * @param {object} input
 * @param {{ label: { key: string, value: string }, href: { key: string, value: string } } | null | undefined} input.second
 * @param {any[]} input.slots - the content map's slots
 * @param {any[]} input.modules - the module rows as the site holds them
 * @returns {Array<{ kind: 'module', id: number, fields: { params: string } }>}
 */
export function heroSecondButtonSteps({ second, slots, modules }) {
  if (!second?.label?.key || !second?.href?.key) return []
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const label = byKey.get(second.label.key)
  const link = byKey.get(second.href.key)
  if (
    !label ||
    !link ||
    label.entity !== link.entity ||
    label.column !== 'params' ||
    link.column !== 'params'
  )
    return []
  if (label.nestedJson !== link.nestedJson) return []
  const id = Number(/^module-(\d+)$/.exec(String(label.entity))?.[1])
  const row = modules.find((m) => Number(m.id) === id)
  const params = row ? paramsOf(row.params) : null
  if (!params) return []
  const container = label.nestedJson ? paramsOf(params[label.nestedJson]) : params
  if (!container) return []
  const now = at(container, label.jsonPath ?? [])
  if (typeof now !== 'string' || now.trim() !== '') return []
  if (!setAt(container, label.jsonPath ?? [], second.label.value)) return []
  if (!setAt(container, link.jsonPath ?? [], second.href.value)) return []
  const next = label.nestedJson ? { ...params, [label.nestedJson]: JSON.stringify(container) } : container
  return [{ kind: 'module', id, fields: { params: JSON.stringify(next) } }]
}
