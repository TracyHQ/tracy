/**
 * The kit tool version check of the readiness verdict (ticket #437, piece `template-kit`): the template kit records
 * which version of the kit tool built it (`tool: "template-kit 3.1.0"`). A kit built by a tool older than the one the
 * flow needs lacks slot data the flow reads (the whole demo text of a slot, its lengths), so the site check refuses
 * it on step 0 (`site-check/kit-version.js`). This check says so before a site is built, with the fix.
 *
 * The version the flow needs is `KIT_TOOL_MIN`, the very constant the site check blocks on, so the two never differ.
 *
 *   null   the kit names a tool at or above it: nothing to flag, the piece keeps the code it already has
 *   todo   older, or naming no tool (`kit-tool-outdated`, `{ built, required, fix }`; `built` is null for none)
 *
 * Also null: a release with no readable kit (the kit step says that). A passing check says nothing so the piece code
 * a Road to live step already gave is not replaced by it.
 */
import { KIT_TOOL_MIN, kitToolVersion } from '../../site-check/kit-version.js'
import { versionAtLeast } from '../plugin-version.js'
import { kitOfRelease } from '../template-kit/road-step.js'

export const KIT_TOOL_STEP = 'kit-tool-version'

export const KIT_TOOL_CHECK = Object.freeze({
  piece: 'template-kit',
  step: KIT_TOOL_STEP,
  judge(release, world) {
    const kit = world?.templateKit ?? kitOfRelease(release, world?.contracts ?? new Map())
    if (kit?.state !== 'read') return null
    const built = kitToolVersion(kit.doc)
    const required = world?.kitToolMin ?? KIT_TOOL_MIN
    if (built !== null && versionAtLeast(built, required)) return null
    return {
      state: 'todo',
      code: 'kit-tool-outdated',
      params: {
        built,
        required,
        fix: `Rebuild the template kit with the template kit tool ${required} or later (settle it again) and commit template-kit.json beside the contract.`
      }
    }
  }
})
