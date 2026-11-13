// Shared pieces of the Contract B check (ticket #590, `build-contract.mjs`): value tests, the problem reporter and the
// field paths that address one value of a build plan (`facts[phone].value`, `pages[home].blocks[hero].data`).

export const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
export const isName = (value) => typeof value === 'string' && value.trim() !== ''
export const isWhole = (value, from = 0) => Number.isInteger(value) && value >= from
/** How a list entry is named in a place: its id when it has one, else its index. */
export const label = (value, index) => (isName(value) ? value : String(index))

/**
 * A reporter that collects problems under a prefix. `report(at, message)` records `{at, message}` with `at` joined to
 * the prefix, so a nested check reports the full place (`runs[0].events[2].steps[write].state`).
 */
export function reporterFor(problems, prefix = '') {
  const join = (at) => (prefix && at ? `${prefix}${at.startsWith('[') ? '' : '.'}${at}` : prefix || at)
  const report = (at, message) => {
    problems.push({ at: join(at), message })
  }
  report.under = (at) => reporterFor(problems, join(at))
  return report
}

/** Every value is a non-empty name and none appears twice; reports each mistake at `at[i]`. */
export function idListProblems(list, at, report, { allowEmpty = true } = {}) {
  if (!Array.isArray(list)) return report(at, 'must be a list of ids')
  if (!allowEmpty && list.length === 0) return report(at, 'must list at least one id')
  const seen = new Set()
  list.forEach((id, i) => {
    if (!isName(id)) report(`${at}[${i}]`, 'an id must be a non-empty string')
    else if (seen.has(id)) report(`${at}[${i}]`, `${JSON.stringify(id)} appears twice`)
    else seen.add(id)
  })
}

const SEGMENT = /^([A-Za-z]+)(?:\[([^\]]+)\])?$/

/**
 * Parse a field path into segments `{key, id}`: `pages[home].blocks[hero].data` gives
 * `[{key: 'pages', id: 'home'}, {key: 'blocks', id: 'hero'}, {key: 'data', id: null}]`. Null when malformed.
 */
export function parseFieldPath(path) {
  if (!isName(path)) return null
  const segments = []
  for (const part of path.split('.')) {
    const match = SEGMENT.exec(part)
    if (!match) return null
    segments.push({ key: match[1], id: match[2] ?? null })
  }
  return segments
}

/** The shape of a path without its ids: `pages[].blocks[].data`. */
export const shapeOfPath = (segments) => segments.map((s) => (s.id === null ? s.key : `${s.key}[]`)).join('.')

/**
 * Find the value a parsed path points at inside `doc`. Returns `{found: true, parent, key, value}` where
 * `parent[key]` is the value, or `{found: false, reason}`.
 */
export function resolveFieldPath(doc, segments) {
  let parent = null
  let key = null
  let current = doc
  for (const { key: name, id } of segments) {
    if (!isObject(current) || !Object.hasOwn(current, name))
      return { found: false, reason: `the plan has no ${JSON.stringify(name)} here` }
    if (id === null) {
      parent = current
      key = name
      current = current[name]
      continue
    }
    const list = current[name]
    const index = Array.isArray(list) ? list.findIndex((entry) => entry?.id === id) : -1
    if (index < 0) return { found: false, reason: `${name} has no entry with id ${JSON.stringify(id)}` }
    parent = list
    key = index
    current = list[index]
  }
  return { found: true, parent, key, value: current }
}
