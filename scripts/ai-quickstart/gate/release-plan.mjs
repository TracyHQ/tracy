// The record checked against the kit it ships in (ticket #586, review round 3, U1): the release guard's other checks
// read the record against itself and against the hashes it names, so a passing record of another kit, relabelled,
// passes them. Here the marker build is made again in memory from the kit folder (no site; a few seconds) and the
// record must hold what that build gives: the same universe of places, each with the same account, and the same
// places write safety probes. A record made on another kit, or by a build that no longer gives the same plan, is
// refused. Besides the two lists, what the record counts and holds of them is checked against the same build (the
// universe's counts, the places write safety says it probed, the places its ledger and findings name), so a record of
// another kit whose two lists alone were redone is refused too (review 4 X6). What the plan check cannot do: a record
// whose every list and count was redone with the gate's own public code (a few seconds) passes it, as an honest one does;
// only a release step that runs the gate itself (`publishVerified` with an honest `runGate`, #588) stops that. The
// pages of the structure variants and what the site printed are not rebuilt here: they need a site.
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
  const accounting = accountFor(kit, built)
  const places = accounting.places.map((p) => [p.key, p.account])
  const plain = passOptions()
  const plainBuilt = await markerBuild(kit, { iconLibrary, tryWrite: memoryTryWrite(kit), ...plain.options })
  const index = storedIndex(plainBuilt.writePlan)
  const probed = [...plain.seen.values()]
    .filter((p) => p.type && index.has(String(p.code).toUpperCase()))
    .map((p) => p.key)
  // The article each `article.create` operation makes is read at a page of its own (`sitePages`, `from: article:<item>`),
  // so the pages a record must have read are partly the kit's to give (review 6 S3).
  const ownPages = list(built.writePlan?.ops)
    .filter((o) => o.kind === 'article.create')
    .map((o) => o.key)
  return { places, probed, counts: accounting.counts, ownPages }
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
  // The universe the record counts is the one the kit's build gives.
  if (plan.counts) {
    const said = record?.universe ?? {}
    const off = Object.keys({ ...plan.counts, ...said }).filter(
      (k) => (said[k] ?? 0) !== (plan.counts[k] ?? 0)
    )
    if (off.length)
      out.push({
        code: 'plan_mismatch',
        message:
          "the record's universe counts are not the ones the kit's own marker build gives (" +
          off.map((k) => k + ' ' + (said[k] ?? 0) + ' for ' + (plan.counts[k] ?? 0)).join(', ') +
          ')'
      })
  }
  // The read pages a list's choice is worked out from (`list_item_not_shown`, review 6 S3): a record of a finished write
  // whose read pages lack the own page of an article the kit's build creates is refused. A record edited consistently
  // past this (an article page renamed and kept, the rows and the pages forged together) is the limit release-binding.mjs
  // names: a record invented field by field.
  if (Array.isArray(plan.ownPages) && record?.write?.site?.status === 'done') {
    const read = new Set(list(record?.render?.pages).map((p) => p?.from))
    const unread = plan.ownPages.filter((k) => !read.has(k))
    if (unread.length)
      out.push({
        code: 'plan_mismatch',
        message:
          unread.length +
          " page(s) of an article the kit's own build creates are not among the pages the record read (first " +
          unread[0] +
          ')'
      })
  }
  const ws = record?.measurements?.writeSafety
  if (ws) {
    // What write safety says it probed, and every place its ledger and findings name, are places of the kit's plan.
    const probedSet = new Set(plan.probed)
    const strange = [
      ...list(ws.ledger).map((r) => r?.place),
      ...list(ws.findings).map((f) => f?.place)
    ].filter((k) => k != null && !probedSet.has(k))
    if (strange.length)
      out.push({
        code: 'plan_mismatch',
        message:
          'write safety names ' +
          new Set(strange).size +
          " place(s) the kit's own plain build does not probe (first " +
          strange[0] +
          ')'
      })
    if (ws.places?.probed != null && ws.places.probed !== plan.probed.length)
      out.push({
        code: 'plan_mismatch',
        message:
          'write safety says it probed ' + ws.places.probed + ' places, the kit gives ' + plan.probed.length
      })
  }
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
