import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  agentContactSheet,
  agentImageRecipe,
  LOOK_SHEET,
  makeAgentImage
} from '../src/opportunities-build/agent-demo-image.js'

const crop = {
  aspect: 4 / 3,
  source: { width: 400, height: 300 },
  output: { width: 200, height: 150 },
  strategy: 'centre'
}
const photo = () =>
  sharp({ create: { width: 400, height: 300, channels: 3, background: '#bf5b3d' } })
    .jpeg()
    .toBuffer()

test('bounded crop uses real pixels, no upscale, and preserves source recipe provenance', async () => {
  const original = await photo()
  const image = agentImageRecipe({ assetId: 'frozen', crop }, ['frozen'])
  const result = await makeAgentImage(original, image)
  assert.equal(result.width, 200)
  assert.equal(result.height, 150)
  assert.equal(result.sha256, createHash('sha256').update(result.bytes).digest('hex'))
  assert.equal(result.recipe.effects, 'preserve-source')
  assert.equal((await sharp(result.bytes).metadata()).width, 200)
  await assert.rejects(
    makeAgentImage(original, { crop: { ...crop, output: { width: 800, height: 600 } } }),
    /RECIPE_UNAVAILABLE/
  )
})

test('source canvas makes bounded bytes only from its parent photograph, with generatedScene false', async () => {
  const original = await photo()
  const image = agentImageRecipe(
    {
      assetId: 'frozen',
      crop,
      canvas: {
        version: 1,
        output: { width: 400, height: 150 },
        foreground: { width: 200, height: 150, left: 100, top: 0 },
        minimumSourceWidth: 100
      }
    },
    ['frozen']
  )
  const result = await makeAgentImage(original, image)
  assert.equal(result.width, 400)
  assert.equal(result.height, 150)
  assert.equal(result.recipe.generatedScene, false)
  assert.equal(result.recipe.sourceHash, createHash('sha256').update(original).digest('hex'))
  assert.equal(result.recipe.background.effect, 'blurred-source')
  assert.equal((await sharp(result.bytes).metadata()).width, 400)
})

test('image recipes reject arbitrary assets, stretching and malformed canvas before upload, each with why', () => {
  for (const image of [
    { assetId: 'foreign', crop },
    { assetId: 'frozen', crop: { ...crop, aspect: 2 } },
    { assetId: 'frozen', crop: { ...crop, aspect: 'wide' } },
    { assetId: 'frozen', crop, canvas: { version: 1, output: { width: 10000, height: 150 } } }
  ])
    assert.throws(
      () => agentImageRecipe(image, ['frozen']),
      (error) => error.code === 'AGENT_DEMO_IMAGE_RECIPE_INVALID' && typeof error.why === 'string'
    )
})

// Pilot 24/10/2026: every crop of a WordPress build was refused with a bare code.
test('image recipes read the slot shape as written, crop the largest box of it, and never enlarge', () => {
  const read = (c) => agentImageRecipe({ assetId: 'frozen', crop: c }, ['frozen']).crop
  // the agent's own row: "w/h", the whole picture as source, an output larger than the crop
  assert.deepEqual(
    read({
      aspect: '500/399',
      source: { width: 1000, height: 667 },
      output: { width: 1000, height: 798 },
      strategy: 'attention'
    }),
    {
      aspect: 500 / 399,
      source: { width: 836, height: 667 },
      output: { width: 836, height: 667 },
      strategy: 'attention'
    }
  )
  assert.deepEqual(read({ ...crop, aspect: '4:3' }), crop)
  assert.deepEqual(read({ ...crop, output: { width: 10000, height: 7500 } }).output, {
    width: 400,
    height: 300
  })
})

// Levain local round 18, 25/10/2026: a band row brought down to the photo rounded to 2.4987 and was refused.
test('a crop brought down to whole pixels keeps its shape; what is still wrong is refused with its own why', () => {
  const read = (c) => agentImageRecipe({ assetId: 'frozen', crop: c }, ['frozen']).crop
  const band = {
    aspect: '2000/800',
    source: { width: 942, height: 881 },
    output: { width: 2000, height: 800 }
  }
  assert.deepEqual(read({ ...band, strategy: 'attention' }).output, { width: 942, height: 377 })
  assert.deepEqual(
    read({
      aspect: '1800/900',
      source: { width: 775, height: 590 },
      output: { width: 1800, height: 900 },
      strategy: 'attention'
    }).output,
    { width: 775, height: 388 }
  )
  assert.deepEqual(
    read({
      ...crop,
      aspect: 2 / 3,
      source: { width: 1800, height: 2700 },
      output: { width: 1066, height: 1600 }
    }).output,
    {
      width: 1066,
      height: 1600
    }
  )
  const why = (c) => {
    try {
      read(c)
    } catch (error) {
      return error.why
    }
  }
  assert.match(why({ ...band, strategy: 'smart' }), /strategy is attention/)
  assert.match(why({ ...crop, output: { width: 200, height: 100 } }), /not of crop.aspect/)
  assert.match(
    why({ ...crop, source: { width: 8000, height: 6000 }, output: { width: 8000, height: 6000 } }),
    /over 4096 px/
  )
})

// Local round 21, 25/10/2026: no research photo carries a caption, so the agent placed them blind.
test('the contact sheet shows each photo as a numbered tile, a broken one as grey, at the sheet size', async () => {
  const one = await photo()
  const sheet = await agentContactSheet([
    { n: 1, bytes: one },
    { n: 2, bytes: Buffer.from('not a picture') },
    { n: 3, bytes: null },
    { n: 4, bytes: one },
    { n: 5, bytes: one }
  ])
  const meta = await sharp(sheet).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.width, LOOK_SHEET.columns * LOOK_SHEET.tile.width)
  assert.equal(meta.height, 2 * (LOOK_SHEET.tile.height + LOOK_SHEET.label))
})
