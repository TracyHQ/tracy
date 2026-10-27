/**
 * The name of one inventory pool, and the release identity a pool is pinned to
 * (`026-site-inventory.sql`, `tasks/todo-inventory-va-seed-theo-brief.md` §4).
 *
 * 🔒 ONE SPELLING, COMPOSED IN ONE PLACE. `inventory_pool.pool_key` is the primary key AND the
 * string a person reads on the Ops screen to say which pool is stuck. Two writers that each build
 * it their own way — one lowercasing the platform, one keeping the full generation — produce two
 * rows for one pool, and neither refill ever reaches the other's target. So every caller comes
 * through `poolKeyOf`, and the key is composite rather than a hash precisely so it stays readable.
 *
 * Lives in `lib/` rather than in `inventory/` because `ops/` draws pools too, and the module graph
 * lets a domain import only `lib/` and `db/` (`test/module-graph.test.mjs`).
 */
import { createHash } from 'node:crypto'

/**
 * The version of the machine check a `ready` instance passed. Part of the generation: tightening
 * the verifier means every instance built under the old one must be re-proven, not trusted because
 * its artifact checksums happen to match.
 */
export const VERIFIER_VERSION = 1

/** How much of the generation hash the key carries. The full value lives in its own column. */
const GENERATION_IN_KEY = 12

/**
 * A component of the key, refused rather than mangled when it cannot be spelled.
 *
 * ':' is the joiner, so a component carrying one would make the key split into more parts than it
 * has fields — a pool called `a:b` and a pool called `a` + `b` would be indistinguishable. Every
 * component but the tag therefore refuses ':'. The tag is the exception because it is a git tag
 * from another repository (`tracy-business/j6`) and this repo does not get to choose its
 * punctuation: a ':' inside a tag is escaped to '|' instead, which no tag shape uses.
 * @param {string} name
 * @param {unknown} value
 * @param {boolean} [isTag]
 */
function part(name, value, isTag = false) {
  if (typeof value !== 'string' || value === '') throw new TypeError(`poolKeyOf: ${name} is required`)
  if (value.includes(':')) {
    if (!isTag) throw new TypeError(`poolKeyOf: ${name} may not contain ':'`)
    return value.replaceAll(':', '|')
  }
  return value
}

/**
 * The pool one (environment, host, CMS, release, generation) belongs to.
 * @param {{ environment: string, host: string, platform: string, quickstartTag: string,
 *           quickstartVersion: string, generation: string }} identity
 * @returns {string} `environment:host:platform:tag:version:generation12`
 */
export function poolKeyOf({ environment, host, platform, quickstartTag, quickstartVersion, generation }) {
  return [
    part('environment', environment),
    part('host', host),
    part('platform', platform),
    part('quickstartTag', quickstartTag, true),
    part('quickstartVersion', quickstartVersion),
    part('generation', generation).slice(0, GENERATION_IN_KEY)
  ].join(':')
}

/**
 * JSON with its object keys in sorted order, so two callers that built the same facts in a
 * different order hash to the same generation. `JSON.stringify` preserves insertion order, which
 * is exactly the thing that must not decide an identity.
 * @param {unknown} value
 * @returns {string}
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * The generation an instance was prepared at: the release identity a prepare actually ran on.
 *
 * 🔒 WHAT GOES IN IS WHAT MAKES TWO INSTANCES INTERCHANGEABLE. The per-part checksums (the bytes
 * that were installed), the version, the contract that seals the site and the minimum Claude Cowork plugin version it
 * demands, and the verifier version. NOT the download URL, NOT the GitHub asset id, NOT the byte
 * count: a release re-uploaded under a new asset id with identical checksums installs the same
 * site, and splitting the pool over that would strand every warm instance for no gain.
 *
 * @param {{ install: Record<string, any>, verifierVersion?: number }} args `install` is the entry
 *   `resolveInstall()` returns (`lib/quickstart-releases.js`).
 * @returns {string} sha256 hex
 */
export function generationOf({ install, verifierVersion = VERIFIER_VERSION }) {
  if (!install || typeof install !== 'object') throw new TypeError('generationOf: install is required')
  /** @type {Record<string, string>} */
  const parts = {}
  for (const [name, value] of Object.entries(install)) {
    // An install part is the shape `{ file, sha256, … }`; `platform`/`version`/`format`/`contract`
    // are scalars and `template` carries no checksum, so none of them look like one.
    if (value && typeof value === 'object' && typeof (/** @type {any} */ (value).sha256) === 'string')
      parts[name] = /** @type {any} */ (value).sha256
  }
  if (Object.keys(parts).length === 0) throw new TypeError('generationOf: install names no checksummed part')
  const identity = {
    parts,
    version: typeof install.version === 'string' ? install.version : null,
    contract: typeof install.contract === 'string' ? install.contract : null,
    coworkMinVersion: typeof install.coworkMinVersion === 'string' ? install.coworkMinVersion : null,
    verifierVersion
  }
  return createHash('sha256').update(canonical(identity)).digest('hex')
}
