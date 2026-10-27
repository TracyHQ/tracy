/**
 * The content contract (`packages/cms/tracy-{joomla,wordpress}-quickstart/contracts/<id>/<cms>/<v>/`)
 * that seals one release, for the rules that hold a release to its contract (ABOUT-*, STAB-*,
 * HIDDEN-1, SHARE-1).
 *
 * Resolved by the same `contractFor` the site doors use, so a check and a build agree on which
 * profile a version gets. `exact` says whether the profile was cut for THIS version: STAB-1 does
 * not accept the nearest lower one, the other rules read whichever profile a site would get.
 *
 * A test passes its own index as `context.contracts` (a `readContracts(dir)` result); the check
 * itself reads the profiles this checkout or image ships. Files are read once per context.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { contractFor, defaultContracts } from '../../contracts.js'

/**
 * @typedef {{
 *   id: string, dir: string, exact: boolean, fallbackFrom: string | null,
 *   has: (file: string) => boolean,
 *   text: (file: string) => string | null,
 *   json: (file: string) => any
 * }} SealingContract
 */

/** @type {WeakMap<object, SealingContract | null>} */
const memo = new WeakMap()

/** A file name inside a profile: no path out of it. */
const PROFILE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * The profile a site built from this release would be sealed by, or null when there is none.
 * @param {import('../index.js').RuleContext & { contracts?: Map<string, any> }} context
 * @returns {SealingContract | null}
 */
export function contractOf(context) {
  if (memo.has(context)) return /** @type {SealingContract | null} */ (memo.get(context))
  const { tag, version } = context.release
  const found = tag ? contractFor(context.contracts ?? defaultContracts(), tag, version) : null
  const sealing = found ? profileAt(found) : null
  memo.set(context, sealing)
  return sealing
}

/** @param {{ id: string, dir: string, fallbackFrom?: string }} found */
function profileAt(found) {
  /** @type {Map<string, string | null>} */
  const texts = new Map()
  /** @type {Map<string, any>} */
  const parsed = new Map()
  const text = (/** @type {string} */ file) => {
    if (!PROFILE_FILE.test(file)) throw new Error(`"${file}" is not a contract file name`)
    if (!texts.has(file)) {
      let value = null
      try {
        value = readFileSync(path.join(found.dir, file), 'utf8')
      } catch {
        value = null
      }
      texts.set(file, value)
    }
    return /** @type {string | null} */ (texts.get(file))
  }
  return {
    id: found.id,
    dir: found.dir,
    exact: !found.fallbackFrom,
    fallbackFrom: found.fallbackFrom ?? null,
    has: (file) => text(file) !== null,
    text,
    json(file) {
      if (!parsed.has(file)) {
        const raw = text(file)
        parsed.set(file, raw === null ? null : JSON.parse(raw))
      }
      return parsed.get(file)
    }
  }
}

/** The fix line for a rule that needs a contract and finds none. */
export const NO_CONTRACT_FIX =
  'Capture a contract for this release version (packages/cms/tracy-*-quickstart/contracts/) before it is published.'

/** Who fixes a missing contract: the contract lives in the tch repository, beside the others. */
export const NO_CONTRACT_OWNER = /** @type {const} */ ('contract')

/**
 * Who fixes what a template DECLARES about its copy (text slots, `demoCompanyNames`, `keptText`),
 * by where that file lives. Joomla and WordPress: the contract version (its `content-map.json` and
 * `<version>.copy.json` under `packages/cms/tracy-*-quickstart/contracts/` in tch). EmDash: the
 * theme's own `seed/personalize.json`, in the template package.
 * @param {string} platform
 * @returns {'contract' | 'template'}
 */
export const declaredCopyOwner = (platform) => (platform === 'emdash' ? 'template' : 'contract')

/**
 * The text slots of a contract's content map, grouped by entity.
 * @param {any} contentMap
 * @returns {Map<string, any[]>}
 */
export function slotsByEntity(contentMap) {
  /** @type {Map<string, any[]>} */
  const out = new Map()
  for (const slot of contentMap?.slots ?? []) {
    const list = out.get(slot.entity) ?? []
    list.push(slot)
    out.set(slot.entity, list)
  }
  return out
}
