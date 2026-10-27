/**
 * AN ANSWER dsh CAN KEEP.
 *
 * dsh materialises every tool value once, as lossless JSON (`@deepseek-ai/dsh-values`
 * `snapshotJsonValue`), and a value that would not survive a JSON round trip — a property holding
 * `undefined`, NaN or ±Infinity, -0, a Date, a Map or a class instance, a sparse array, a cycle —
 * fails the WHOLE call: `tool "tracy_site" returned invalid output: value is not lossless JSON`.
 * Measured on the A1 bench (27/09/2026, WordPress C04): a template-part write the site had taken came
 * back to the model as that error, and the agent went looking for a change that was already made.
 *
 * So the value leaves as JSON always: an answer that already is one leaves as it is (the same
 * object, nothing copied); any other is copied the way `JSON.stringify` would write it — an
 * `undefined` property dropped, `undefined` in a list and a non-finite number read as `null`, -0 as
 * 0, `toJSON` honoured, a cycle cut to `null` — and the paths it had to change are handed to
 * `onRepair`, so the log names the answer that needed it and the cause can be fixed where it is made.
 * Pure: no I/O.
 */

/** How many repaired paths `onRepair` is told: enough to find the cause, never a flood. */
const PATHS_MAX = 8

/**
 * The value as lossless JSON, and the paths that were not.
 * @param {unknown} value
 * @param {(paths: string[]) => void} [onRepair]
 * @returns {unknown}
 */
export function losslessAnswer(value, onRepair) {
  /** @type {string[]} */
  const paths = []
  const out = repair(value, '$', new WeakSet(), paths)
  if (paths.length === 0) return value
  onRepair?.(paths.slice(0, PATHS_MAX))
  return out === undefined ? null : out
}

/**
 * @param {unknown} v
 * @param {string} path
 * @param {WeakSet<object>} open - the objects being walked above this one (a cycle's way back)
 * @param {string[]} paths - where the value was changed
 * @returns {unknown} the JSON value, or `undefined` for one JSON drops (a function, a symbol)
 */
function repair(v, path, open, paths) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') {
    if (Number.isFinite(v) && !Object.is(v, -0)) return v
    paths.push(`${path}=${String(v === 0 ? '-0' : v)}`)
    return Number.isFinite(v) ? 0 : null
  }
  if (typeof v === 'bigint') {
    paths.push(`${path}=bigint`)
    return String(v)
  }
  if (typeof v !== 'object') {
    paths.push(`${path}=${typeof v}`)
    return undefined
  }
  if (open.has(v)) {
    paths.push(`${path}=cycle`)
    return null
  }
  const proto = Object.getPrototypeOf(v)
  const plain = Array.isArray(v) ? proto === Array.prototype : proto === Object.prototype || proto === null
  if (!plain) {
    const json = /** @type {{ toJSON?: unknown }} */ (v).toJSON
    paths.push(`${path}=${proto?.constructor?.name ?? 'object'}`)
    if (typeof json === 'function') {
      open.add(v)
      const got = repair(json.call(v), path, open, [])
      open.delete(v)
      return got
    }
  }
  open.add(v)
  /** @type {unknown} */
  let out
  if (Array.isArray(v)) {
    // dsh reads a list as its indices and `length`, nothing else (`walkJsonValue`)
    if (Reflect.ownKeys(v).length !== v.length + 1) paths.push(`${path}=list with extra keys`)
    const list = []
    for (let i = 0; i < v.length; i += 1) {
      if (!Object.hasOwn(v, i)) paths.push(`${path}[${i}]=hole`)
      const x = repair(v[i], `${path}[${i}]`, open, paths)
      list.push(x === undefined ? null : x)
    }
    out = list
  } else {
    /** @type {Record<string, unknown>} */
    const record = {}
    // dsh refuses a symbol key or an own property JSON would not see (`enumerableStringKeys`)
    if (
      Reflect.ownKeys(v).some(
        (k) => typeof k !== 'string' || !Object.prototype.propertyIsEnumerable.call(v, k)
      )
    )
      paths.push(`${path}=hidden keys`)
    for (const key of Object.keys(v)) {
      const child = /** @type {Record<string, unknown>} */ (v)[key]
      if (child === undefined) {
        paths.push(`${path}.${key}=undefined`)
        continue
      }
      const x = repair(child, `${path}.${key}`, open, paths)
      if (x !== undefined) record[key] = x
    }
    out = record
  }
  open.delete(v)
  return out
}
