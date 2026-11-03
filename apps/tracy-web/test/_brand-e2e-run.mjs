// Set-up of the end-to-end brand test (brand step trial bench, #320): kit images that are real pictures, and a words-only
// run (a words-only brief, or a found logo given as `material`) on the real wiring (run folder on disk, heading font through the fake Google Fonts door, the picture door
// assigned to a fake picture model) that a worker plays to its end.
import path from 'node:path'
import sharp from 'sharp'
import { productionWiring } from '../src/brand-step/brand-wiring.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { assignDoor } from '../src/lib/llm-store.js'
import { assignBrandDoors, quiet, REVIEWER_MODEL, SECRET, startRun, TEST_PRICES } from './_brand-bench.mjs'
import { fakeFontFetch, PICTURE_MODEL, passingReviewer, pictureReply } from './_brand-bench-doors.mjs'
import { scriptedAgent } from './_brand-bench-script.mjs'
import { loadCase } from './_brand-gate-files.mjs'
import { disc, drawing } from './_brand-icon-fixtures.mjs'

/** Kit images that are real pictures (the shared fake serves invented bytes, which no tool can open). */
export async function pictureKitImages() {
  const png = await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#223344' } })
    .png()
    .toBuffer()
  return {
    async ensure(kit) {
      const image = { mediaType: 'image/png', base64: png.toString('base64') }
      return {
        ok: true,
        images: {
          open: async (id) => ({
            text: JSON.stringify({ id }),
            images: [{ ...image, ref: { kit: kit.ref, image: id } }]
          }),
          resolve: async () => image
        }
      }
    }
  }
}

/** Start a words-only run on the real wiring and let a worker run it to its end. */
export async function wordsOnlyRun(
  pool,
  dir,
  agentOptions,
  { picture = 'icon', caseId = '3-no-logo', material = null, agentFor = scriptedAgent } = {}
) {
  const kitImages = await pictureKitImages()
  const config = { readinessDir: path.join(dir, 'readiness') }
  const font = fakeFontFetch()
  const wiring = productionWiring(config, { fetchImpl: font.fetchImpl, prices: TEST_PRICES })
  const c = await loadCase(caseId)
  await assignBrandDoors(pool)
  await assignDoor(pool, 'seedImage', { providerId: 'openrouter', model: PICTURE_MODEL }, 'owner@tracy.test')
  // the picture model draws a disc in the accent on white, or fails (a refused request)
  const accent = c.kit.site.brandColours.primary.value
  const iconPicture = await drawing(disc(accent))
  const started = await startRun(pool, c, { wiring, kitImages })
  // a found logo is a brief image in the run folder, under media/<id>.png
  if (material) (await wiring()).filesFor(started.id).write(`media/${c.brief.brand.logo}.png`, material)
  const agent = agentFor(c.kit, agentOptions)
  const requests = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    requests.push(body.model)
    const headers = { 'content-type': 'application/json' }
    if (body.model === PICTURE_MODEL)
      return picture === 'icon'
        ? new Response(JSON.stringify(pictureReply(iconPicture)), { headers })
        : new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400, headers })
    const reply = body.model === REVIEWER_MODEL ? passingReviewer(body) : agent(body)
    return new Response(JSON.stringify(reply), { headers })
  }
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages,
    wiring,
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  return { id: started.id, run: await readRun(pool, started.id), config, font, requests, kitImages, wiring }
}
