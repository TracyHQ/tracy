// What the picture bench CLI shows and downloads of one run (#340): the shared bench export (lib/bench-export.js) for
// the picture step, whose round document is the manifest (pictures-v1.json is round 0's), plus the picture step's own
// files: the plan it ran on, the final site-pictures.json, the write step's picture file (mapping.json, the output of
// exportPictureMapping, which `write-step-bench.mjs run --pictures-file` reads), the per file rows (files.json) and the
// picture files themselves, which `get` copies from the bench's file store into files/ beside the manifest and the
// mapping (both name them `files/<sha256>.<ext>`). Pure, apart from `copyPictureFiles`.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { benchExport } from '../lib/bench-export.js'
import { MAX_FIX_ROUNDS } from './bench-worker.js'
import { exportPictureMapping } from './contract-mapping.js'

export { listLines, standingLines } from '../lib/bench-export.js'

const shared = benchExport({ doc: 'pictures', maxFixRounds: MAX_FIX_ROUNDS })

export const { statusLines } = shared

/** The manifest the run ended with: the one of its last round that has one, or null. */
export const finalManifestOf = (run) => run.rounds.findLast((r) => r.pictures)?.pictures ?? null

/**
 * Every text file `get` writes, as [name, text]: the shared run files (run.json, brief.json, pictures-vN.json,
 * check-vN.json, failures-vN.txt, failures-standing.txt, turns.jsonl), plan.json, files.json and, once a manifest
 * exists, site-pictures.json, mapping.json and the failures not for the picker (failures-not-for-picker.txt) when there
 * are any. mapping.json is exportPictureMapping of the final manifest (mapping, uploads, hidden, painted, siteSettings,
 * problems); its revision names the run, since the bench writes no site, and a frame whose slot the kit's content map
 * lacks is one of its problems, which the write step refuses.
 * @param {object} run readRun's run with the inputs of inputsOf
 * @param {object[]} turns
 * @param {object[]} fileRows filesOf's rows
 * @param {object | null} [kitDoc] the kit document with its content map under `contentMap` (kit-with-map.js); null
 *   checks no slot and takes the contract from the run's kit ref
 */
export function runFiles(run, turns, fileRows, kitDoc = null) {
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`
  const { plan, ...meta } = run
  const files = shared.runFiles(meta, turns)
  files.push(['plan.json', json(plan)])
  files.push(['files.json', json(fileRows)])
  const manifest = finalManifestOf(run)
  if (manifest) {
    files.push(['site-pictures.json', json(manifest)])
    const contract = typeof kitDoc?.contract === 'string' ? kitDoc.contract : run.kitRef
    files.push([
      'mapping.json',
      json(
        exportPictureMapping({
          pictures: manifest,
          plan,
          brief: run.brief,
          contract,
          revision: `site-pictures-run ${run.id}`,
          ...(kitDoc ? { kit: kitDoc } : {})
        })
      )
    ])
  }
  // The failures the picker could not fix (frames of code, or waiting for the drawer, icons or cut-outs), kept on the
  // last checked round's check result rather than in the failures still standing.
  const notForPicker = run.rounds.findLast((r) => r.checkResult)?.checkResult?.notForPicker
  if (notForPicker) files.push(['failures-not-for-picker.txt', notForPicker])
  return files
}

/**
 * Copy every picture file of the run from the file store into `<dir>/files/`, under the name the manifest gives it.
 * Returns the names of the files the store no longer holds (or holds changed), which are not copied.
 */
export async function copyPictureFiles(store, fileRows, dir) {
  const missing = []
  if (fileRows.length) await mkdir(path.join(dir, 'files'), { recursive: true })
  for (const row of fileRows) {
    const bytes = await store.readPicture(row.path)
    if (bytes) await writeFile(path.join(dir, 'files', row.path), bytes)
    else missing.push(row.path)
  }
  return missing
}
