/**
 * JSON Merge Patch (RFC 7386): the few keys a write names, merged into what the record holds.
 *
 * 🔒 WHY. The doors that store JSON store it WHOLE: a Joomla record's `params` column, a WordPress
 * block's attributes. To change one setting the model re-typed the whole object — measured on bench
 * v5/v6 (29/09/2026): a Joomla module's `params` re-sent for one value, its nested `jatools-config`
 * one `}` short three times (V5-chat-01, FAIL), and 8.1k output tokens re-typing a 12.4k-character
 * WordPress block to swap one element (v6 L2-02). The host holds the stored object, so the model
 * sends only what changes and the host writes the whole: a key set to a value replaces it, a key set
 * to null removes it, an object merges into the object stored under that key, and anything else — a
 * list included — replaces the stored value as given (RFC 7386 §2). Pure: no I/O.
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Set an own key, even `__proto__`: `JSON.parse` makes it an own key, and a plain assignment would
 * set the object's prototype instead of writing the key the site stores.
 * @param {Record<string, unknown>} obj @param {string} key @param {unknown} value
 */
function put(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true })
}

/**
 * @typedef {(stored: string, path: string) => Record<string, unknown> | null} OpenText
 *   A stored STRING the patch reaches with an object: the object it holds as JSON text, to merge into
 *   and write back as text — or null to replace it as RFC 7386 does. (A Joomla ACM module keeps its
 *   `jatools-config` as JSON text inside the `params` JSON; `site-call.mjs` opens it.) It may throw
 *   to refuse the whole merge.
 */

/**
 * 🔒 03/10/2026 (dev site leemood, module 93): A JSON TEXT RE-TYPED AS A STRING THAT DROPS ONE OF ITS
 * KEYS IS REFUSED, NEVER MERGED. The agent sent `{patch:{"jatools-config":"<the whole config again>"}}`
 * to change one heading and typed the key `":type"` as `"type"`. RFC 7386 replaces a value given as a
 * string, so the stored text was replaced, `mod_ja_acm` found no `:type` and printed nothing, and the
 * hero vanished. Opening the new string and merging it as an object would have kept `:type`, but it
 * would also write the stray `type` key and every other slip of the re-typing, silently. Refusing writes
 * nothing and names the road that cannot slip: the one key, as an object. A string that keeps every
 * top-level key of the stored text still replaces it, as the RFC says.
 */
export class KeysLost extends Error {
  /** @param {string} path - the key whose text was re-typed (`jatools-config`). @param {string[]} lost */
  constructor(path, lost) {
    super(`${path}: the text sent drops ${lost.join(', ')}`)
    this.path = path
    this.lost = lost
  }
}

/**
 * `patch` merged into `target` (RFC 7386), as a new value; `target` is never changed.
 * @param {unknown} target - what is stored.
 * @param {unknown} patch - what the call sent.
 * @param {{ openText?: OpenText }} [options]
 * @param {string} [path] - where in the stored value this is, for `openText` (`a.b`).
 * @returns {unknown}
 * @throws {KeysLost} with `openText`: a string sent for a stored JSON text drops one of its top-level keys.
 */
export function mergePatch(target, patch, options = {}, path = '') {
  if (!isPlainObject(patch)) return patch
  /** @type {Record<string, unknown>} */
  const out = {}
  if (isPlainObject(target)) for (const [key, value] of Object.entries(target)) put(out, key, value)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete out[key]
      continue
    }
    const at = path === '' ? key : `${path}.${key}`
    const stored = Object.hasOwn(out, key) ? out[key] : undefined
    if (options.openText && typeof stored === 'string' && isPlainObject(value)) {
      const inner = options.openText(stored, at)
      if (inner !== null) {
        put(out, key, JSON.stringify(mergePatch(inner, value, options, at)))
        continue
      }
    }
    if (options.openText && typeof stored === 'string' && typeof value === 'string') {
      const before = options.openText(stored, at)
      const after = before === null ? null : options.openText(value, at)
      // A sent text that is not JSON is left to the caller's own check (`jsonFieldProblem`).
      const lost = after === null ? [] : Object.keys(before ?? {}).filter((k) => !Object.hasOwn(after, k))
      if (lost.length > 0) throw new KeysLost(at, lost)
    }
    put(out, key, mergePatch(stored, value, options, at))
  }
  return out
}

/**
 * The keys a patch names at its top level, and how many of them remove (null).
 * @param {Record<string, unknown>} patch
 */
export function patchKeys(patch) {
  const keys = Object.keys(patch)
  return { keys, removed: keys.filter((k) => patch[k] === null).length }
}
