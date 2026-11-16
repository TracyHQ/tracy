/**
 * The write doors check of the readiness verdict (ticket #434, piece `cowork-pin`): the Claude Cowork plugin a new site
 * of this release gets offers every door the write step needs.
 *
 *   the doors needed   the write step's own list (`src/write-step/plugin-doors.js`), the one its stages ask the site;
 *   the plugin         the one a new site gets, chosen exactly as the host is told (`pluginSelectionOf`, so a pin,
 *                      the release's own plugin, or the fleet's latest and floor, each candidate judged);
 *   the doors offered  what each released package holds, read from its bytes into `cowork-plugin-doors.json` by
 *                      `scripts/cowork-plugin-doors.mjs` (no package is downloaded here).
 *
 * Two things the doors alone did not see (JA Diner 1.0.8, dev 16/11/2026: eighteen hides refused on a site whose pin carried
 * the review):
 *   the hide review     a door per contract: the plugin's `lib/hideable-slots.json` entry for the release's contract, read
 *                       against the very content map the contract seals (`reviews` in the manifest). Without it a site
 *                       empties nothing a plan hides (`hide-review` among the missing doors);
 *   the self-update     a site runs the plugin it got for about fifteen minutes only: the plugin's own updater then installs
 *                       the newest stable release (`plg_system_claudecoworkupdate`), so a pin older than that release, a
 *                       prerelease above all, is judged with it too (`selfUpdate` names the pin it leaves).
 *
 * Answers, for the first candidate that does not pass:
 *   todo cowork-pin-missing-doors   { plugin, missing, fixVersion }: the newest release read that has every missing door;
 *   todo cowork-release-needed      { plugin, missing, doors }: no release read has `doors`, so a plugin release is due;
 *   todo cowork-pin-doors-unread    { plugin, doors?, reason }: the plugin, or a door, was not read in its package;
 *   done cowork-pin-doors-ready     { plugin, doors }.
 * A release already shown on Design inspiration only warns (it is never taken off for it, as in Customize your site).
 * WordPress (no write step yet): not-judged write-doors-not-judged { platform }: not judged, and never a pass.
 * Not judged (null): any other platform the write step does not write, or a release no plugin is chosen for.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WRITE_STEP_DOORS } from '../../write-step/plugin-doors.js'
import { coworkNewer } from '../cowork-install.js'
import { shownOnInspiration } from '../quickstart-releases.js'
import { pluginSelectionOf } from '../readiness-inputs.js'

const MANIFEST_FILE = fileURLToPath(new URL('./cowork-plugin-doors.json', import.meta.url))

/** @typedef {{ platform: string, releases: Record<string, { evidence: Record<string, boolean> }> }} PluginDoors */

/** @type {PluginDoors | null} */
let manifestMemo = null
/** The committed manifest of what each released Joomla package offers. @returns {PluginDoors} */
export function readPluginDoors() {
  manifestMemo ??= JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))
  return /** @type {PluginDoors} */ (manifestMemo)
}

/** The per contract door: the plugin's hide review of the release's contract (plugin-doors-of-package.js `reviews`). */
export const HIDE_REVIEW_DOOR = Object.freeze({
  id: 'hide-review',
  what: "the plugin's review of this contract, which says what a hide may empty"
})

/** The sha256 of a sealed contract's content map on disk, or null when it cannot be read. */
function contentMapShaOf(contract) {
  if (typeof contract?.dir !== 'string') return null
  try {
    return createHash('sha256')
      .update(readFileSync(join(contract.dir, 'content-map.json')))
      .digest('hex')
  } catch {
    return null
  }
}

/** Whether a release read into the manifest carries the hide review of this contract, or null when it was not read for it. */
function reviews(read, review) {
  if (!review) return true
  if (!read?.reviews || typeof read.reviews !== 'object') return null
  return read.reviews[review.id] === review.sha256
}

/** A stable plugin version: no prerelease part. */
const STABLE = /^\d+\.\d+\.\d+$/

/** The newest stable release the manifest has read: what a site's own updater installs. */
function newestStableOf(manifest) {
  return Object.keys(manifest.releases ?? {})
    .filter((v) => STABLE.test(v))
    .reduce(
      (best, v) => (best === null || coworkNewer(v, best) ? v : best),
      /** @type {string | null} */ (null)
    )
}

/**
 * One plugin version against the doors: what it lacks, what was not read, or nothing.
 * @param {string | null} version
 * @param {readonly { id: string, evidence: string }[]} doors
 * @param {PluginDoors} manifest
 * @param {{ id: string, sha256: string } | null} [review] the contract whose hide review the plugin must carry
 * @param {string | null} [floor] the oldest version a fix may name (a site updates itself past any older one)
 */
function judgeVersion(version, doors, manifest, review = null, floor = null) {
  if (version === null)
    return {
      code: 'cowork-pin-doors-unread',
      params: { plugin: null, reason: 'the plugin a new site gets has no version to read' }
    }
  const read = manifest.releases?.[version]
  if (!read)
    return {
      code: 'cowork-pin-doors-unread',
      params: { plugin: version, reason: `Claude Cowork for Joomla ${version} is not in the doors manifest` }
    }
  const unread = doors.filter((d) => typeof read.evidence?.[d.evidence] !== 'boolean')
  if (unread.length > 0)
    return {
      code: 'cowork-pin-doors-unread',
      params: {
        plugin: version,
        doors: unread.map((d) => d.id),
        reason: 'the doors manifest was read before the write step declared these doors'
      }
    }
  const reviewed = reviews(read, review)
  if (reviewed === null)
    return {
      code: 'cowork-pin-doors-unread',
      params: {
        plugin: version,
        doors: [HIDE_REVIEW_DOOR.id],
        reason: 'the doors manifest was read before the hide reviews were kept'
      }
    }
  const missing = [
    ...doors.filter((d) => read.evidence[d.evidence] === false),
    ...(reviewed ? [] : [{ ...HIDE_REVIEW_DOOR, evidence: null }])
  ]
  if (missing.length === 0) return null
  const has = (r, d) =>
    d.id === HIDE_REVIEW_DOOR.id ? reviews(r, review) === true : r.evidence?.[d.evidence] === true
  const fixVersion = Object.entries(manifest.releases)
    .filter(([v, r]) => missing.every((d) => has(r, d)) && (floor === null || !coworkNewer(floor, v)))
    .map(([v]) => v)
    .reduce(
      (best, v) => (best === null || coworkNewer(v, best) ? v : best),
      /** @type {string | null} */ (null)
    )
  if (fixVersion !== null)
    return {
      code: 'cowork-pin-missing-doors',
      params: { plugin: version, missing: missing.map((d) => d.id), fixVersion }
    }
  const nowhere = missing.filter(
    (d) =>
      !Object.entries(manifest.releases).some(
        ([v, r]) => has(r, d) && (floor === null || !coworkNewer(floor, v))
      )
  )
  return {
    code: 'cowork-release-needed',
    params: {
      plugin: version,
      missing: missing.map((d) => d.id),
      // Doors some release has, beside doors none has, are not one release away: the release needed names the latter.
      doors: (nowhere.length > 0 ? nowhere : missing).map((d) => d.id)
    }
  }
}

/**
 * @param {any} release a row of `readReleases`, or one built from the quickstart list pin
 * @param {{ contracts?: any, pins?: Record<string, any>, coworkLatest?: any, pluginDoors?: PluginDoors, writeDoors?: readonly { id: string, evidence: string }[] }} world
 * @returns {{ state: string, code: string, params: Record<string, unknown> } | null}
 */
export function judgeWriteDoors(release, world) {
  const platform = release.setting?.platform ?? release.platform
  // WordPress has no write step yet, so no door list to hold a plugin to: say so, never leave a silence that reads as a
  // pass. `not-judged` is neither a pass nor a hold (`passed` in verdict.js): nothing to fix, never green.
  if (platform === 'wordpress')
    return { state: 'not-judged', code: 'write-doors-not-judged', params: { platform: 'wordpress' } }
  if (platform !== 'joomla') return null
  const { contract, selection } = pluginSelectionOf(release, {
    contracts: world.contracts,
    pins: world.pins,
    latest: world.coworkLatest
  })
  if (!contract || selection.source === 'none') return null
  const doors = world.writeDoors ?? WRITE_STEP_DOORS
  const manifest = world.pluginDoors ?? readPluginDoors()
  const sha256 = contentMapShaOf(contract)
  const review = sha256 ? { id: contract.id, sha256 } : null
  const held = (problem) => ({ state: shownOnInspiration(release) ? 'warn' : 'todo', ...problem })
  // The plugin's updater moves a site to the newest stable release within minutes: a fix never names an older one, and a
  // candidate older than it is judged with it too.
  const floor = newestStableOf(manifest)
  for (const candidate of selection.candidates) {
    const version = candidate.version ?? null
    const problem = judgeVersion(version, doors, manifest, review, floor)
    if (problem) return held(problem)
    const next = floor !== null && typeof version === 'string' && coworkNewer(floor, version) ? floor : null
    const later = next ? judgeVersion(next, doors, manifest, review, floor) : null
    if (later) return held({ ...later, params: { ...later.params, selfUpdate: version } })
  }
  const versions = selection.candidates.map((c) => c.version)
  return {
    state: 'done',
    code: 'cowork-pin-doors-ready',
    // One plugin for a pin; the fleet's latest and floor are both candidates, named together.
    params: {
      plugin: versions.join(' or '),
      doors: [...doors.map((d) => d.id), ...(review ? [HIDE_REVIEW_DOOR.id] : [])]
    }
  }
}

/** The check as the verdict lists it (`CHECKS`). */
export const WRITE_DOORS_CHECK = Object.freeze({
  piece: 'cowork-pin',
  step: 'write-doors',
  judge: judgeWriteDoors
})
