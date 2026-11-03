// The looker's pure parts (#343): its answer held to the fixed fault list, the picture at display size with the real
// part of an extended photo outlined, the maker rule and the alt comparison. Code generated images, no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { altNotesFor, altsOfCopy, compareAlt } from '../src/site-pictures/alt-notes.js'
import { makerOf } from '../src/site-pictures/looker-door.js'
import { FAULTS, lookImage, lookMessage, readLook } from '../src/site-pictures/looker-call.js'

test('an answer is held to the fixed fault list, and any fault fails the picture', () => {
  assert.equal(FAULTS.length, 6)
  const said = readLook(
    'Here: {"verdict":"pass","faults":["Subject cut off","too dark"],"seen":"A rider on a gravel road."}'
  )
  assert.deepEqual(said, {
    verdict: 'fail',
    faults: ['subject cut off'],
    seen: 'A rider on a gravel road.',
    dropped: ['too dark']
  })
  assert.equal(readLook('{"verdict":"pass","faults":[],"seen":"A wheel."}').verdict, 'pass')
  assert.match(readLook('{"verdict":"maybe","faults":[],"seen":"A wheel."}').problem, /verdict/)
  assert.match(readLook('{"verdict":"pass","faults":[]}').problem, /seen/)
  assert.match(readLook('no json').problem, /JSON/)
})

const flat = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })
    .png()
    .toBuffer()

test('the picture is shown at display size, never enlarged, and an extended photo has its real part outlined', async () => {
  const big = await lookImage(await flat(1200, 600), { width: 600, height: 300 })
  assert.deepEqual([big.width, big.height], [600, 300])
  const small = await lookImage(await flat(300, 150), { width: 600, height: 300 })
  assert.deepEqual([small.width, small.height], [300, 150])

  const outlined = await lookImage(
    await flat(1200, 600),
    { width: 600, height: 300 },
    { x: 300, y: 0, width: 600, height: 600 }
  )
  const { data, info } = await sharp(Buffer.from(outlined.base64, 'base64'))
    .raw()
    .toBuffer({ resolveWithObject: true })
  const at = (x, y) => [
    ...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)
  ]
  const [r, g, b] = at(150, 150)
  assert.ok(
    r > 230 && g < 60 && b > 230,
    `the left edge of the real part is outlined in magenta: ${[r, g, b]}`
  )
  assert.deepEqual(at(50, 150), [200, 200, 200], 'outside it the picture is untouched')
  const text = lookMessage({ words: { shows: 'x' }, image: outlined, outlined: true })[0].text
  assert.match(text, /outlined in magenta is the owner's real photo/)
  assert.doesNotMatch(lookMessage({ words: {}, image: big, outlined: false })[0].text, /outlined/)
})

test('the maker of a model is its vendor prefix, else its provider', () => {
  assert.equal(makerOf('openrouter', 'openai/gpt-6-luna'), 'openai')
  assert.equal(makerOf('deepseek', 'deepseek-flash'), 'deepseek')
  assert.equal(makerOf('openrouter', 'deepseek/deepseek-v4.1-flash'), 'deepseek')
})

test('alts are compared with the seen sentence by shared content words', () => {
  assert.deepEqual(
    compareAlt('Coach feeding balls on a padel court', 'A coach feeds balls to a player on a court'),
    {
      agrees: true,
      shared: ['coach', 'feed', 'ball', 'court']
    }
  )
  assert.equal(compareAlt('A boxing ring with gloves', 'A coach feeds balls on a padel court').agrees, false)
  assert.equal(compareAlt('', 'anything').agrees, false)
  assert.deepEqual(altNotesFor(null, [{ frame: 'a', seen: 'x' }]), [])
  assert.deepEqual(
    altNotesFor(
      [{ frame: 'a', text: 'A wheel' }],
      [
        { frame: 'a', seen: null },
        { frame: 'b', seen: 'A wheel' }
      ]
    ),
    []
  )
  assert.match(altsOfCopy({ version: 'site-plan/3' }).problem, /site-copy\/1/)
  assert.deepEqual(altsOfCopy({ version: 'site-copy/1', alts: [{ frame: 'a', text: 'b' }, { frame: 1 }] }), {
    alts: [{ frame: 'a', text: 'b' }]
  })
})
