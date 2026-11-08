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
 * Answers, for the first candidate that does not pass:
 *   todo cowork-pin-missing-doors   { plugin, missing, fixVersion }: the newest release read that has every missing door;
 *   todo cowork-release-needed      { plugin, missing, doors }: no release read has `doors`, so a plugin release is due;
 *   todo cowork-pin-doors-unread    { plugin, doors?, reason }: the plugin, or a door, was not read in its package;
 *   done cowork-pin-doors-ready     { plugin, doors }.
 * A release already shown on Design inspiration only warns (it is never taken off for it, as in Customize your site).
 * WordPress (no write step yet): not-judged write-doors-not-judged { platform }: not judged, and never a pass.
 * Not judged (null): any other platform the write step does not write, or a release no plugin is chosen for.
 */
import { readFileSync } from 'node:fs'
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

/**
 * One plugin version against the doors: what it lacks, what was not read, or nothing.
 * @param {string | null} version
 * @param {readonly { id: string, evidence: string }[]} doors
 * @param {PluginDoors} manifest
 */
function judgeVersion(version, doors, manifest) {
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
  const missing = doors.filter((d) => read.evidence[d.evidence] === false)
  if (missing.length === 0) return null
  const fixVersion = Object.entries(manifest.releases)
    .filter(([, r]) => missing.every((d) => r.evidence?.[d.evidence] === true))
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
    (d) => !Object.values(manifest.releases).some((r) => r.evidence?.[d.evidence] === true)
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
  for (const candidate of selection.candidates) {
    const problem = judgeVersion(candidate.version ?? null, doors, manifest)
    if (problem) return { state: shownOnInspiration(release) ? 'warn' : 'todo', ...problem }
  }
  const versions = selection.candidates.map((c) => c.version)
  return {
    state: 'done',
    code: 'cowork-pin-doors-ready',
    // One plugin for a pin; the fleet's latest and floor are both candidates, named together.
    params: { plugin: versions.join(' or '), doors: doors.map((d) => d.id) }
  }
}

/** The check as the verdict lists it (`CHECKS`). */
export const WRITE_DOORS_CHECK = Object.freeze({
  piece: 'cowork-pin',
  step: 'write-doors',
  judge: judgeWriteDoors
})
