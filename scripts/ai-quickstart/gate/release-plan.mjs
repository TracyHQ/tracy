// The record checked against the kit it ships in (ticket #586, review round 3, U1): the release guard's other checks
// read the record against itself and against the hashes it names, so a passing record of another kit, relabelled,
// passes them. Here the marker build is made again in memory from the kit folder (no site; a few seconds) and the
// record must hold what that build gives: the same universe of places, each with the same account, and the same
// places write safety probes. A record made on another kit, or by a build that no longer gives the same plan, is
// refused. The pages of the structure variants and what the site printed are not rebuilt here: they need a site.
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { accountFor } from './accounting.mjs'
import { kitOf } from './gate-inputs.mjs'
import { markerBuild } from './marker-plan.mjs'
import { memoryTryWrite } from './memory-write.mjs'
import { passOptions, storedIndex } from './write-safety-places.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const sorted = (rows) => rows.map((r) => JSON.stringify(r)).sort()

/** The plan of a kit folder as the gate makes it in memory: the universe's places and write safety's places. */
export async function planOfFolder(
  folder,
  { iconLibrary = { set: PHOSPHOR_SET, icons: phosphorCatalog() } } = {}
) {
  const kit = kitOf(folder)
  const built = await markerBuild(kit, { iconLibrary, tryWrite: memoryTryWrite(kit) })
  const places = accountFor(kit, built).places.map((p) => [p.key, p.account])
  const plain = passOptions()
  const plainBuilt = await markerBuild(kit, { iconLibrary, tryWrite: memoryTryWrite(kit), ...plain.options })
  const index = storedIndex(plainBuilt.writePlan)
  const probed = [...plain.seen.values()]
    .filter((p) => p.type && index.has(String(p.code).toUpperCase()))
    .map((p) => p.key)
  return { places, probed }
}

/**
 * Why a record is not the one the kit's own plan gives, as `[{code, message}]`.
 * @param {object} record
 * @param {{places: Array<[string, string]>, probed: string[]}} plan `planOfFolder`
 */
export function planProblems(record, plan) {
  const out = []
  const differ = (a, b) => {
    const left = new Set(sorted(a))
    const right = new Set(sorted(b))
    const only = [...left].filter((x) => !right.has(x))
    const missing = [...right].filter((x) => !left.has(x))
    return only.length || missing.length
      ? { only: only.length, missing: missing.length, first: only[0] ?? missing[0] }
      : null
  }
  const places = differ(
    list(record?.places).map((p) => [p.key, p.account]),
    plan.places
  )
  if (places)
    out.push({
      code: 'plan_mismatch',
      message:
        "the record's places are not the ones the kit's own marker build gives (" +
        places.only +
        ' not in the plan, ' +
        places.missing +
        ' missing; first ' +
        places.first +
        ')'
    })
  const ws = record?.measurements?.writeSafety
  if (ws && Array.isArray(ws.placeKeys)) {
    const probed = differ(
      ws.placeKeys.map((k) => [k]),
      plan.probed.map((k) => [k])
    )
    if (probed)
      out.push({
        code: 'plan_mismatch',
        message:
          "the places write safety probed are not the ones the kit's own plain build writes (" +
          probed.only +
          ' not in the plan, ' +
          probed.missing +
          ' missing)'
      })
  }
  return out
}
