import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  agentContactSheet,
  agentImageRecipe,
  LOOK_SHEET,
  makeAgentImage,
  TONE,
  toneForWords
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

// Plan "10/10" §3 (council 26/10/2026): a photo that carries words is toned itself — local rounds 27–31 had no road to
// readable words over a photo that a guard check did not fail.
test('a photo that carries words is toned the least it takes for them to read, within half, or refused', async () => {
  const flat = async (rgb, width = 400, height = 200) => {
    const bytes = await sharp({
      create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } }
    })
      .jpeg()
      .toBuffer()
    return {
      bytes,
      ext: 'jpg',
      width,
      height,
      sha256: 'source',
      recipe: { version: 'sharp-source-variant/1' }
    }
  }
  // a mid-tone photo under light words: darkened a little, to where white reads at 4.5:1, same size
  const mid = await toneForWords(await flat([150, 120, 90]), 'dark')
  assert.ok(mid.recipe.tone.change > 0.9 && mid.recipe.tone.change < 1, JSON.stringify(mid.recipe.tone))
  assert.ok(mid.recipe.tone.after <= TONE.dark.target)
  assert.notEqual(mid.sha256, 'source')
  assert.deepEqual(
    await sharp(mid.bytes)
      .metadata()
      .then((m) => [m.width, m.height, m.format]),
    [400, 200, 'jpeg']
  )
  // already dark enough: unchanged bytes, the reading kept
  const dark = await flat([30, 25, 20])
  assert.equal((await toneForWords(dark, 'dark')).bytes, dark.bytes)
  // a bright cream photo would need more than half: refused, with the way out
  await assert.rejects(toneForWords(await flat([244, 239, 230]), 'dark'), (e) => {
    assert.equal(e.code, 'AGENT_DEMO_IMAGE_TONE_UNREACHABLE')
    assert.match(e.why, /calmer, darker photo/)
    return true
  })
  // under dark words: lightened toward white until black reads
  const light = await toneForWords(await flat([40, 40, 40]), 'light')
  assert.ok(light.recipe.tone.after >= TONE.light.target && light.recipe.tone.change <= TONE.light.limit)
  // a transparent cut-out (a logo) is left as cut
  const logo = { ...(await flat([200, 200, 200])), ext: 'png' }
  assert.deepEqual((await toneForWords(logo, 'dark')).recipe.tone, { mode: 'dark', skipped: 'transparent' })
  // the recipe takes tone and says what it must be
  const recipe = {
    assetId: 'a',
    crop: {
      aspect: 2,
      source: { width: 400, height: 200 },
      output: { width: 400, height: 200 },
      strategy: 'centre'
    }
  }
  assert.equal(agentImageRecipe({ ...recipe, tone: 'dark' }, ['a']).tone, 'dark')
  assert.throws(
    () => agentImageRecipe({ ...recipe, tone: 'grey' }, ['a']),
    (e) => /image\.tone is "dark"/.test(e.why)
  )
  // through makeAgentImage: the cut is toned and the refusal keeps its code
  const source = (await flat([150, 120, 90])).bytes
  const made = await makeAgentImage(source, { ...recipe, tone: 'dark' })
  assert.equal(made.recipe.tone.mode, 'dark')
  const cream = (await flat([244, 239, 230])).bytes
  await assert.rejects(makeAgentImage(cream, { ...recipe, tone: 'dark' }), {
    code: 'AGENT_DEMO_IMAGE_TONE_UNREACHABLE'
  })
})
