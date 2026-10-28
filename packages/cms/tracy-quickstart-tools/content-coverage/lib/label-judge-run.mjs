// The label judge as the audit command runs it (`cli.mjs`): the module boxes and the verify viewer's crops with their
// numbered outlines (`verify/crops.mjs`), around the pure half of the judge (`label-judge.mjs`). No model is called:
// the slots without a cached verdict go into <out>/label-judge/request.json for the agent that runs the release, who
// answers them with `record-judge.mjs`. `--no-judge` or no browser: no request, and those slots stay `not judged`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { prepareLabelJudge } from './label-judge.mjs'
import { openContext } from './render.mjs'
import { renderCrops } from './verify/crops.mjs'
import { moduleBoxes } from './verify/module-boxes.mjs'

/** Where the request and its crops go, under the audit's --out. */
export const JUDGE_DIR = 'label-judge'

/**
 * @param {{ o: Record<string, any>, result: any, contract: any, outDir: string, chromium: any, previous: any,
 *   coverageFiles: string[] }} input `coverageFiles`: where record-judge.mjs writes the verdicts
 * @returns {Promise<{ block: any, requestFile: string | null, asked: number }>}
 */
export async function runLabelJudge({ o, result, contract, outDir, chromium, previous, coverageFiles }) {
  const dir = join(outDir, JUDGE_DIR)
  rmSync(dir, { recursive: true, force: true })
  const judge = !o['no-judge'] && Boolean(chromium)
  const mods = judge ? await moduleBoxes({ chromium, openContext, findings: result }) : {}
  const crop = async (components, { margin }) => {
    const files = new Map()
    if (!chromium) return files
    const pages = result.pages.map((p) => ({ n: p.n, shots: p.shots }))
    await renderCrops({ chromium, model: { pages, components }, auditDir: outDir, outDir: dir, margin })
    for (const c of components) {
      const file = c.images?.desktop ?? c.images?.phone
      if (file) files.set(c.id, file)
    }
    return files
  }
  const { block, request } = await prepareLabelJudge({
    map: contract.map,
    findings: result,
    mods,
    previous,
    contract,
    crop,
    unavailable: o['no-judge'] ? 'NOT_RUN' : chromium ? null : 'NO_CROP'
  })
  if (!request) return { block, requestFile: null, asked: 0 }
  mkdirSync(dir, { recursive: true })
  const requestFile = join(dir, 'request.json')
  writeFileSync(requestFile, `${JSON.stringify({ ...request, coverageFiles }, null, 2)}\n`)
  return { block, requestFile, asked: Object.keys(request.record.slots).length }
}
