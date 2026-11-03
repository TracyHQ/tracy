// Shared set-up of the site planner bench tests (ADR 0041, #301): the site planner door assigned to a test
// provider, a run started on the invented Harbour Sport Club brief and the JA Boxing kit, and kit images that are
// ready without a download (invented bytes; the real images are not in the repo). The model is always the scripted
// fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { startBenchRun } from '../src/site-planner/bench-control.js'
import { brief } from './_site-plan-check-inputs.mjs'

export const SECRET = 's'.repeat(32)
export const KIT_REF = 'ja-boxing/j6/1.0.10'
export const MODEL = 'anthropic/claude-opus-5.5'
/** DeepSeek V4.1 Flash as OpenRouter lists it (the 17/10/2026 snapshot), for the one comparison run. */
export const DEEPSEEK_FLASH = 'deepseek/deepseek-v4.1-flash-1017'
export const API_KEY = 'sk-or-test-secret-key'

/** The bytes the ready kit images give for an image id. */
export const inventedImageBytes = (id) => Buffer.from(`invented image bytes of ${id}`)

/**
 * Kit images that are ready for any kit, with invented bytes, in the shape kit-images.js answers. `calls` counts
 * ensure, open and resolve, so a test can tell an image read back from a reference from one opened by the planner.
 */
export function readyKitImages() {
  const calls = { ensure: 0, open: [], resolve: [] }
  const image = (id) => ({ mediaType: 'image/jpeg', base64: inventedImageBytes(id).toString('base64') })
  return {
    calls,
    async ensure(kit) {
      calls.ensure++
      return {
        ok: true,
        images: {
          async open(id) {
            calls.open.push(id)
            return {
              text: JSON.stringify({ id }),
              images: [{ ...image(id), ref: { kit: kit.ref, image: id, sha256: 'invented' } }]
            }
          },
          async resolve(ref) {
            calls.resolve.push(ref.image)
            return ref.kit === kit.ref ? image(ref.image) : null
          }
        }
      }
    }
  }
}

export async function assignPlannerDoor(pool, { enabled = true, model = MODEL } = {}) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled },
    SECRET,
    'owner@tracy.test'
  )
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model }, 'owner@tracy.test')
}

/** Start a run and return it; fails the test when the start is refused. */
export async function startRun(pool, over = {}) {
  const started = await startBenchRun({
    pool,
    secret: SECRET,
    brief: brief(),
    briefSource: { kind: 'file', name: 'harbour-sport-club.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    ...over
  })
  assert.equal(started.ok, true, JSON.stringify(started))
  return started.run
}
