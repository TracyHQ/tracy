// The label judge as the audit command runs it (`cli.mjs`): the deployment's vision door, the module boxes and the
// verify viewer's crops with their numbered outlines (`verify/crops.mjs`), around the pure judge (`label-judge.mjs`).
// No key, `--no-judge`, or no browser: nothing is sent to a model, verdicts cached in the previous file are kept for
// unchanged slots and every other slot is `not judged`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { JUDGE_LIMITS, judgeLabels } from './label-judge.mjs'
import { createVisionJudge } from './label-judge-vision.mjs'
import { openContext } from './render.mjs'
import { renderCrops } from './verify/crops.mjs'
import { moduleBoxes } from './verify/module-boxes.mjs'

const WEB_LIB = '../../../../../apps/tracy-web/src/lib/'

/** The vision door and its input check, or null. Loaded only with a key: they pull in the image library. */
async function visionOf(env) {
  if (!env.TRACY_VISION_API_KEY?.trim()) return null
  const { visionDoor } = await import(`${WEB_LIB}picture-vision.js`)
  const door = visionDoor(env)
  if (!door) return null
  const { createVisionChallenge, IMAGE_CODE_INSTRUCTION, imageCodeMatches } = await import(
    `${WEB_LIB}vision-challenge.js`
  )
  return createVisionJudge({
    door,
    check: { create: createVisionChallenge, instruction: IMAGE_CODE_INSTRUCTION, matches: imageCodeMatches }
  })
}

const positive = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback)

/**
 * @param {{ o: Record<string, any>, result: any, contract: any, outDir: string, chromium: any, previous: any,
 *   env?: Record<string, string | undefined> }} input
 */
export async function runLabelJudge({ o, result, contract, outDir, chromium, previous, env = process.env }) {
  const ask = o['no-judge'] ? null : await visionOf(env)
  const mods = ask && chromium ? await moduleBoxes({ chromium, openContext, findings: result }) : {}
  const crop = async (components, { margin }) => {
    const images = new Map()
    if (!chromium) return images
    const dir = join(outDir, 'label-judge')
    const pages = result.pages.map((p) => ({ n: p.n, shots: p.shots }))
    await renderCrops({ chromium, model: { pages, components }, auditDir: outDir, outDir: dir, margin })
    for (const c of components) {
      const file = c.images?.desktop ?? c.images?.phone
      if (file) images.set(c.id, `data:image/jpeg;base64,${readFileSync(join(dir, file)).toString('base64')}`)
    }
    return images
  }
  return judgeLabels({
    map: contract.map,
    findings: result,
    mods,
    previous,
    ask,
    crop,
    limits: {
      maxCalls: positive(o['judge-max-calls'], JUDGE_LIMITS.maxCalls),
      maxCents: positive(o['judge-max-cents'], JUDGE_LIMITS.maxCents)
    },
    unavailable: o['no-judge'] ? 'NOT_RUN' : 'NO_VISION_MODEL'
  })
}
