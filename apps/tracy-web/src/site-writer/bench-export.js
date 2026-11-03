// What the site writer bench CLI shows and downloads of one run (#329): the shared bench export
// (lib/bench-export.js) for the writer, whose round document is the copy (copy-v1.json is round 0's copy), plus the
// writer's own files: the plan it wrote from, the final copy and its Joomla contract mapping export. Pure.
import { benchExport } from '../lib/bench-export.js'
import { MAX_FIX_ROUNDS } from './bench-worker.js'
import { exportContractMapping } from './contract-mapping.js'

export { listLines, standingLines } from '../lib/bench-export.js'

const shared = benchExport({ doc: 'copy', maxFixRounds: MAX_FIX_ROUNDS })

export const { statusLines } = shared

/** The copy the run ended with: the copy of its last round that has one, or null. */
export const finalCopyOf = (run) => run.rounds.findLast((r) => r.copy)?.copy ?? null

/**
 * Every file `get` writes, as [name, text]: the shared run files (run.json, brief.json, copy-vN.json,
 * changes-vN.json, check-vN.json, failures-vN.txt, failures-standing.txt, turns.jsonl), plan.json, and once a copy
 * exists site-copy.json and mapping.json (exportContractMapping: the mapping, the alt text, page meta and pages
 * outside it, and any shape problem). The mapping's revision names the run, since the bench writes no site.
 * @param {object} run readRun's run with `plan`, `planSource` and `planSha256`
 * @param {object[]} turns
 * @param {object | null} kitDoc the kit document, for the mapping's paragraph and bullet format
 * @param {object | null} [contentMap] the content map beside the kit: the mapping then carries the main menu labels
 *   and the menu items to hide
 */
export function runFiles(run, turns, kitDoc, contentMap = null) {
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`
  const { plan, ...meta } = run
  const files = shared.runFiles(meta, turns)
  files.push(['plan.json', json(plan)])
  const copy = finalCopyOf(run)
  if (copy) {
    files.push(['site-copy.json', json(copy)])
    const contract = typeof kitDoc?.contract === 'string' ? kitDoc.contract : run.kitRef
    files.push([
      'mapping.json',
      json(
        exportContractMapping({
          copy,
          contract,
          revision: `site-writer-run ${run.id}`,
          kit: kitDoc,
          brief: run.brief,
          plan,
          contentMap
        })
      )
    ])
  }
  return files
}
