/**
 * Which content contract a site built from a quickstart is sealed by.
 *
 * WHY THIS IS READ AND NOT DECLARED. A contract binds one published quickstart to the text slots an
 * agent may write and the presentation it may not touch; a site with NO contract is the state in
 * which structural writes are allowed. Until now the binding was a `contract` string copied by hand
 * into `provision/quickstarts.json` — the same shape of hand-copied fact that ADR 0017 removed for
 * everything else, and the one whose failure mode is a site provisioned unsealed while every gate
 * stays green.
 *
 * It does not need declaring, because every profile already says it: `manifest.json` carries
 * `quickstart.release` and `quickstart.version` (measured 15/09 across all six profiles — all
 * present, none disagreeing with its own id). So the binding is an index built from the profiles
 * themselves, and the catalog stops being asked.
 *
 * 🔒 THE PROFILE'S OWN WORD WINS OVER ITS DIRECTORY. `tracy-airbnb/j6/*` sits in a directory named
 * after a DESIGN that has no published quickstart at all — Airbnb is the Apple base with another
 * template installed over it (see the contracts README, "One base archive, more than one design").
 * A reader that inferred the release from the path would invent a quickstart nobody publishes.
 *
 * 🔒 AND THIS IS NOT THE JOOMLA-BY-DESIGN ROAD. A Joomla site created from a design inspiration is
 * held to the profile `design-templates.json` names for that design (`contractProfile`, with its
 * per-file sha256 and `coworkMinVersion`), resolved on the fleet by `design-plan.py`. This index answers
 * the OTHER road: a caller naming a quickstart directly, which is what `provision.sh` asks
 * `quickstart.py --field contract` for.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pinOf } from './cowork-install.js'
import { publishedTagOf } from './local-releases.js'

/** Where the image puts the profiles (Dockerfile COPY); a checkout reads the packages instead. */
const IN_IMAGE = fileURLToPath(new URL('../contracts', import.meta.url))
// The image copies `provision/quickstarts.json` beside the profiles; a checkout carries the same copy.
const PINS_FILE = fileURLToPath(new URL('../quickstarts.json', import.meta.url))
const IN_CHECKOUT = [
  fileURLToPath(new URL('../../../../packages/cms/tracy-joomla-quickstart/contracts', import.meta.url)),
  fileURLToPath(new URL('../../../../packages/cms/tracy-wordpress-quickstart/contracts', import.meta.url))
]

/**
 * @typedef {{ id: string, source: 'catalog' } | { id: string, source: 'quickstart', name: string, tokensFrom: string, tokens: Record<string, string> }} ContractDesign
 * @typedef {{ id: string, dir: string, platform: string, coworkMinVersion: string | null, mode: string | null, design: ContractDesign | null }} Contract
 * @typedef {Map<string, Contract>} ContractIndex
 */

/** A design-system id as the catalogue spells them (`vendor/tracy/od-design-system/catalog.json`). */
const DESIGN_ID = /^[a-z0-9][a-z0-9-]{0,60}$/

/**
 * The design system a profile says its quickstart wears, or null.
 *
 * IT LIVES IN `<version>.design.json` BESIDE THE PROFILE DIRECTORY, NOT INSIDE IT. A profile
 * directory is a sealed package: the pinned Claude Cowork plugin carries `manifest.json` byte for
 * byte (`check-contracts.ts` compares the hashes) and every `.json` inside a served profile must be
 * pinned in `design-templates.json` (`check-design-templates.ts`) — measured 29/09/2026, both gates
 * went red the moment a repository-only fact was written in there. A file next to the directory
 * (`contracts/tracy-apple/j6/1.3.0.design.json`) is Tracy's to write and ships in no package.
 *
 * READ, NEVER INVENTED. A missing file, a `null`, and a value of any other shape — a bare string,
 * an object missing `source`, an id the catalogue could not spell — all answer null here: the
 * reader hands a site a binding only when the profile wrote one in full, and the gate is where a
 * half-written or missing one goes red, at the PR, not on a customer's site.
 *
 * TWO SOURCES (29/09/2026). `catalog` names one of the OpenDesign systems, whose tokens a host
 * reads from its own copy of the catalogue. `quickstart` is a quickstart wearing its OWN look
 * (Tracy Business): no catalogue holds it, and neither image carries the CMS theme's token file,
 * so the profile file carries the resolved tokens beside the name (`scripts/build-quickstart-design.mjs`
 * writes them, the `contracts` gate compares them with the theme). A quickstart design without its
 * tokens is half a design and answers null, like any other half.
 * @param {string} dir the profile's directory
 * @returns {ContractDesign | null}
 */
function designOf(dir) {
  let file
  try {
    file = JSON.parse(readFileSync(`${dir}.design.json`, 'utf8'))
  } catch {
    return null
  }
  const raw = file?.design
  if (!raw || typeof raw !== 'object') return null
  const { id, source, name, tokensFrom } = /** @type {Record<string, unknown>} */ (raw)
  if (typeof id !== 'string' || !DESIGN_ID.test(id)) return null
  if (source === 'catalog') return { id, source }
  if (source !== 'quickstart' || typeof name !== 'string' || name.trim() === '') return null
  if (typeof tokensFrom !== 'string') return null
  const tokens = tokensOf(file.tokens)
  return tokens === null ? null : { id, source, name, tokensFrom, tokens }
}

/**
 * A token map as a profile file writes it — custom-property names to string values — or null.
 * @param {unknown} raw
 * @returns {Record<string, string> | null}
 */
function tokensOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entries = Object.entries(raw)
  if (entries.length === 0) return null
  for (const [k, v] of entries) if (!k.startsWith('--') || typeof v !== 'string') return null
  return Object.fromEntries(entries)
}

const keyOf = (release, version) => `${release}@${version}`

/** Every `manifest.json` under `dir`, at any depth. */
function manifestsIn(dir) {
  /** @type {string[]} */
  const found = []
  /** @param {string} at */
  const walk = (at) => {
    for (const entry of readdirSync(at)) {
      const full = path.join(at, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'manifest.json') found.push(full)
    }
  }
  try {
    walk(dir)
  } catch {
    return []
  }
  return found
}

/**
 * Read the contract profiles into an index keyed by the quickstart each one names.
 *
 * Throws rather than skipping when a profile is unusable: a profile that cannot say what it seals,
 * or two profiles claiming one quickstart, would otherwise resolve to "no contract" — and that is
 * the permissive state, so failing closed here is the whole point.
 *
 * @param {string | string[]} [dirs] where the profiles live; defaults to the image, then the checkout
 * @returns {ContractIndex}
 */
export function readContracts(dirs = undefined) {
  const roots = dirs === undefined ? [IN_IMAGE, ...IN_CHECKOUT] : Array.isArray(dirs) ? dirs : [dirs]
  /** @type {ContractIndex} */
  const index = new Map()
  for (const root of roots) {
    for (const file of manifestsIn(root)) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      const named = manifest?.quickstart
      if (typeof named?.release !== 'string' || typeof named?.version !== 'string')
        throw new Error(`contract profile ${file} names no quickstart it seals`)
      const key = keyOf(named.release, named.version)
      const seen = index.get(key)
      if (seen !== undefined && seen.id !== manifest.id)
        throw new Error(`quickstart ${key} is claimed twice: ${seen.id} and ${manifest.id}`)
      index.set(key, {
        id: typeof manifest.id === 'string' ? manifest.id : key,
        // Where the profile's files sit, for readers that need more than the manifest (the
        // capabilities reader opens `content-map.json` beside it). The manifest already settled
        // which profile seals which quickstart; this only says where that profile is.
        dir: path.dirname(file),
        platform: typeof manifest.platform === 'string' ? manifest.platform : '',
        // 🔒 TWO NAMES FOR ONE FIELD, AND READING ONLY THE FIRST MADE THIS NULL EVERYWHERE THAT
        // MATTERED. The WordPress profile writes `coworkMinVersion`; all eight Joomla profiles write
        // `coworkContractVersion`. This read named only the first, so every Joomla contract answered
        // `null` — and because nothing downstream asked for it, nothing went red. What went wrong
        // instead was two steps away and looked unrelated: with no floor to pass, a sealed card was
        // provisioned with a Claude Cowork plugin too old to bind and died at `content.contract`.
        // Published profiles (before 27/09/2026) still carry the pre-rename keys `receiverVersion` /
        // `receiverFloor`; they are sealed artifacts and are not rewritten, so all four names are read.
        coworkMinVersion:
          [
            manifest.coworkContractVersion,
            manifest.receiverVersion,
            manifest.coworkMinVersion,
            manifest.receiverFloor
          ].find((v) => typeof v === 'string') ?? null,
        mode: typeof manifest.mode === 'string' ? manifest.mode : null,
        // The design system the quickstart wears (decided 29/09/2026): the profile is the
        // ONE place that names it. A release card carries no design id; `templateCards` joins
        // this field into the card at read time, so nothing on a release can drift from it.
        design: designOf(path.dirname(file))
      })
    }
  }
  return index
}

/** @type {ContractIndex | null} */
let defaultIndex = null

/**
 * The profiles this deployment ships, read once and shared by every door that asks.
 *
 * One index, not one per module: the site doors (`sites/route.js`) and the card door
 * (`ops/quickstarts.js`, which joins each card's design system from the same profiles) must answer
 * from the same reading, or a card could promise a design the site door does not know.
 * @returns {ContractIndex}
 */
export function defaultContracts() {
  defaultIndex ??= readContracts()
  return defaultIndex
}

/**
 * The contract sealing this quickstart at this version, or `null` when there is none.
 *
 * `null` is an answer, not a failure: a template quickstart is installed as released and sealed by
 * nothing (15/09 — `provision.sh` prints "no content contract" for exactly this). The caller
 * decides what that means; this function does not guess.
 *
 * @param {ContractIndex} index
 * @param {unknown} release
 * @param {unknown} version
 * @returns {Contract | null}
 */
/**
 * The Claude Cowork plugin a sealed quickstart PINS, from this repository's `quickstarts.json` (copied into the
 * image beside the profiles): `{file, sha256, bytes, githubAssetId?, url}` when the entry for that
 * release names a `cowork` at that version, else null.
 *
 * WHY HERE AND NOT ON THE RELEASE: `tracy_setting.json` is read by every deployment at its next
 * refresh, and a part a deployment's validator does not know makes the whole release invalid there
 * (measured 25/09/2026: `install.cowork` on `tracy-business/wp7` was refused by the WordPress
 * shape and the quickstart vanished from the catalogue). Which Claude Cowork plugin seals a release is a fact
 * this repository owns, like the profile itself, so it travels with the code that can honour it.
 *
 * @param {string} release the release tag, e.g. `tracy-business/wp7`
 * @param {string} version the quickstart version the row carries
 * `overridesRelease: true` on a pin says it wins over the release's own `install.cowork` — see
 * `resolveInstall`. Without it the release's Claude Cowork plugin stands, as before.
 *
 * @returns {{ file: string, sha256: string, bytes: number, githubAssetId?: number, url: string, version?: string, overridesRelease?: true } | null}
 */
export function coworkPinFor(release, version, file = PINS_FILE) {
  let catalogue
  try {
    catalogue = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  // The rules (which pin applies, and when one is half-written) live in `cowork-install.js`, so the
  // Customize your site check reads the same answer the host is given.
  return pinOf(catalogue, release, version)
}

export function contractFor(index, release, version) {
  if (typeof release !== 'string' || typeof version !== 'string') return null
  // A local pack (`local/<slug>/<cms>`) is sealed as the release it stands for would be at that
  // version: trying it on a stand must try the site a customer would get (`local-releases.js`).
  const tag = publishedTagOf(release)
  const exact = index.get(keyOf(tag, version))
  if (exact !== undefined) return exact
  // NEAREST LOWER PATCH/MINOR (03/10/2026). A UI patch release (1.0.3) must not leave its
  // sites without a contract just because no profile was cut for it. Rule: the profile of the
  // HIGHEST version below the requested one, same release tag and same MAJOR; never a higher
  // version, another major or another release; a non-semver version answers null. Safe because a
  // contract recommends and locks nothing (ADR 0022) and a UI patch keeps the same content map; the
  // component's bind/inspect still verifies the entities. The profile keeps its own `id`, which is
  // what the component holds; `fallbackFrom` says which version was asked for.
  const wanted = semverOf(version)
  if (wanted === null) return null
  /** @type {Contract | null} */
  let best = null
  let bestVersion = null
  for (const [key, contract] of index) {
    if (!key.startsWith(`${tag}@`)) continue
    const have = semverOf(key.slice(tag.length + 1))
    if (have === null || have[0] !== wanted[0] || compareSemver(have, wanted) >= 0) continue
    if (bestVersion === null || compareSemver(have, bestVersion) > 0) {
      best = contract
      bestVersion = have
    }
  }
  return best === null ? null : { ...best, fallbackFrom: version }
}

/** `x.y.z` as three numbers, or null for anything else (pre-release and build tags included). */
function semverOf(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** @param {number[]} a @param {number[]} b */
function compareSemver(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * The design system a released quickstart wears, or null: the `design` of the profile sealing the
 * version this deployment read for that tag.
 *
 * Read at the two doors that answer for a TEMPLATE press (`resolveBuildRequest`, `GET
 * /api/sites/design-plan`): a template is installed as released, so what it wears is whatever its
 * sealing profile says — and a release with no profile, or a profile naming none, wears none.
 * @param {ContractIndex} index
 * @param {{ tag?: unknown, setting?: { version?: unknown } | null }[]} readable rows from `readReleases`
 * @param {unknown} tag the release tag a template resolved to
 * @returns {ContractDesign | null}
 */
export function designOfRelease(index, readable, tag) {
  if (typeof tag !== 'string') return null
  const row = readable.find((r) => r.tag === tag)
  return contractFor(index, tag, row?.setting?.version)?.design ?? null
}

/**
 * May a caller name this quickstart on `POST /api/sites`?
 *
 * Two grounds, and no third. Either a contract seals it — the Claude Cowork plugin will refuse structural
 * writes on the site that comes out — or the release is a TEMPLATE card, a finished site the
 * customer saw on the gallery and pressed, installed as released and sealed by nothing on purpose
 * (15/09; `provision.sh` prints "no content contract" for exactly this).
 *
 * The one that used to be missing is the middle case: a quickstart Tracy can read and install, that
 * nothing seals. It looks perfectly healthy on every screen, and provisioning it hands the customer
 * a site an agent may rewrite structurally. It is refused here, and the refusal is the point.
 *
 * @param {{ choosable?: boolean, setting?: any } | null | undefined} release the row `readReleases` gave
 * @param {Contract | null} contract what `contractFor` answered for that release's version
 */
export function mayName(release, contract) {
  if (!release?.choosable) return false
  if (contract !== null) return true
  return Boolean(release.setting?.card)
}
