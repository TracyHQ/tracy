// Shared set-up of the site planner bench tests (ADR 0041, #301): the site planner door assigned to a test
// provider, a run started on the invented Harbour Sport Club brief and the JA Boxing kit, and kit images that are
// ready without a download (invented bytes; the real images are not in the repo). The model is always the scripted
// fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assignDoor, saveModels, saveProvider } from '../src/lib/llm-store.js'
import { looksMissingOf } from '../src/lib/template-kit/reader.js'
import { startBenchRun } from '../src/site-planner/bench-control.js'
import { SITE_PLANNER_PROVIDER } from '../src/site-planner/door.js'
import { openKit } from '../src/site-planner/kit-source.js'
import { brief } from './_site-plan-check-inputs.mjs'

export const SECRET = 's'.repeat(32)
export const KIT_REF = 'ja-boxing/j6/1.0.10'
/** Claude Sonnet 5.5 on OpenRouter: an alternative planner model that reads pictures, used by most bench tests. */
export const MODEL = 'anthropic/claude-sonnet-5.5'
/** DeepSeek V4 Pro on DeepSeek's own API, an alternative planner model: text only. */
export const DEEPSEEK_PRO = 'deepseek-v4-pro'
export const DEEPSEEK_PROVIDER = SITE_PLANNER_PROVIDER
/** DeepSeek V4.1 Flash as OpenRouter lists it (the 17/10/2026 snapshot), for the one comparison run. */
export const DEEPSEEK_FLASH = 'deepseek/deepseek-v4.1-flash-1017'
export const API_KEY = 'sk-or-test-secret-key'
/** DeepSeek Flash as DeepSeek's own API lists it: the planner's default model (door.js SITE_PLANNER_MODEL). */
export const DEEPSEEK_NATIVE_FLASH = 'deepseek-flash'

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

/** `models`: the provider's model list (what it says each model can do), saved before the door is assigned. */
export async function assignPlannerDoor(
  pool,
  { enabled = true, model = MODEL, provider = 'openrouter', models } = {}
) {
  await saveProvider(
    pool,
    { id: provider, presetId: provider, apiKey: API_KEY, enabled },
    SECRET,
    'owner@tracy.test'
  )
  if (models) await saveModels(pool, provider, models)
  await assignDoor(pool, 'sitePlanner', { providerId: provider, model }, 'owner@tracy.test')
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

/** DeepSeek V4 Pro assigned on DeepSeek's own provider, listed as it lists it: tools, no vision. */
export const assignTextOnlyDoor = (pool) =>
  assignPlannerDoor(pool, {
    provider: DEEPSEEK_PROVIDER,
    model: DEEPSEEK_PRO,
    models: [{ id: DEEPSEEK_PRO, tools: true, vision: false }]
  })

/**
 * The kit with an invented current look on every page and block whose 1440 shot it packs (the shot id and sha256 the
 * image record holds), so looksMissingOf answers none.
 */
export function withAllLooks(doc) {
  const out = structuredClone(doc)
  const records = new Map()
  for (const image of out.images) {
    records.set(image.id, image)
    records.set(image.path, image)
  }
  const items = new Map([...out.pages, ...out.blocks].map((item) => [item.id, item]))
  for (const { id, image } of looksMissingOf(out))
    items.get(id).look = {
      image: records.get(image).id,
      sha256: records.get(image).sha256,
      text: `Invented look of ${id}.`
    }
  return out
}

/**
 * A contract index holding the bench kit (KIT_REF) with every look, in a temporary folder; `done()` removes it.
 * `edit` changes the kit before it is written.
 */
export function kitIndexWithLooks(edit = (doc) => doc) {
  const kit = openKit(KIT_REF)
  const dir = mkdtempSync(path.join(tmpdir(), 'site-planner-looks-'))
  writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify(edit(withAllLooks(kit.doc))))
  return {
    index: new Map([[`${kit.release}@${kit.version}`, { id: KIT_REF, dir, platform: 'joomla' }]]),
    done: () => rmSync(dir, { recursive: true, force: true })
  }
}
