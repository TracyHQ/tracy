/**
 * The picture stage's acceptance check (spec TracyHQ/tracy#189, criteria 3.1, 3.4, 3.6, 9.2), its engine half, with doubles
 * for the picture model and the photo labeller: a drawing is read back told what its frame shows, a drawing with a seam is
 * drawn once more with the fault named in its prompt, a drawing of another sport is refused twice and the refusal reaches
 * the receipt, the labeller asks for the faults in the same call, and a 4000 px photo for a 600 px frame is uploaded at
 * most 1200 px wide and within its byte budget. Fixtures are fictional: a pottery studio and a climbing gym.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { drawPlanned } from '../src/sites/brief-engines/drawn-pictures.js'
import { meetSlotFit } from '../src/sites/brief-engines/picture-slot-fit.js'
import { labelWithVision } from '../src/lib/picture-vision.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { pictureByteBudget } from 'website-opportunities/domain/pictures/picture-acceptance.mjs'

const jpeg = (width, height, background = '#557799') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()
/** A detailed photo (noise), heavy at a high quality: what a phone camera gives. */
const noisy = (width, height) =>
  sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
    .blur(2)
    .jpeg({ quality: 95 })
    .toBuffer()

const DOOR = { url: 'https://images.example/v1', key: 'test-key', imageModel: 'stub-image' }

/** One planned drawing for one offering card of a pottery studio, with a labeller that answers `answers` in turn. */
async function drawOne(answers) {
  const prompts = []
  const asked = []
  const chat = async (_door, body) => {
    prompts.push(body.messages[0].content[0].text)
    return {
      images: [{ bytes: await jpeg(1800, 1200, '#6a8f5c') }],
      usage: { cost: 0.03 },
      model: 'stub-image'
    }
  }
  let call = 0
  const real = {
    pictures: [{ id: 'ref-1', sha256: 'sha-ref-1' }],
    bytes: async () => jpeg(900, 600),
    drawing: null,
    brief: { business: { trade: 'arts', subTrade: 'pottery studio' } },
    checkDrawing: async (_bytes, expect) => {
      asked.push(expect)
      return answers[Math.min(call++, answers.length - 1)]
    }
  }
  const plan = {
    unfilled: [{ action: 'draw', drawing: 'draw-1', groupId: 'g-1' }],
    drawings: [
      {
        id: 'draw-1',
        mode: 'scene',
        aspect: 1.5,
        referenceIds: ['ref-1'],
        subject: { kind: 'offering', label: 'Wheel Throwing', record: true }
      }
    ]
  }
  const byGroup = new Map([
    [
      'g-1',
      {
        id: 'g-1',
        file: 'images/demo/a.jpg',
        role: 'section',
        demo: { width: 900, height: 600 },
        occurrences: []
      }
    ]
  ])
  const notes = []
  const got = await drawPlanned({
    plan,
    byGroup,
    real,
    drawDoor: DOOR,
    chat,
    domain: await websiteOpportunitiesDomain(),
    note: (n) => notes.push(n),
    drawMs: 30_000
  })
  return { ...got, prompts, asked, notes }
}
const CLEAN = { textPresence: 'absent', faceBoxes: [[0.4, 0.2, 0.1, 0.1]], defects: [] }

test('3.6 a drawing with a visible seam is drawn once more, the seam named in the prompt, and then accepted', async () => {
  const out = await drawOne([{ ...CLEAN, defects: ['visible-seam'] }, CLEAN])
  assert.equal(out.prompts.length, 2)
  assert.doesNotMatch(out.prompts[0], /was refused/)
  assert.match(out.prompts[1], /refused because it showed a visible join/)
  assert.equal(out.drawn.get('g-1')?.receipt.kind, 'drawn')
  // The labeller is told what the frame shows and the trade, so it can name another topic or trade.
  assert.equal(out.asked[0].shows, 'Wheel Throwing')
  assert.equal(out.asked[0].trade, 'pottery studio')
})

test('3.1 a drawing of another topic is refused twice and the refusal reaches the receipt with its reason', async () => {
  const out = await drawOne([{ ...CLEAN, defects: ['off-topic'] }])
  assert.equal(out.drawn.size, 0)
  assert.deepEqual(out.stats.refused, [
    { drawing: 'draw-1', reasons: ['off-topic', 'off-topic'], reasonClass: 'refused by the labeller' }
  ])
  assert.ok(out.notes.some((n) => /refused \(off-topic, off-topic\)/.test(n)))
})

test('3.4 a drawing with clear faces drawn right is accepted at once (decision faces = B)', async () => {
  const out = await drawOne([CLEAN])
  assert.equal(out.prompts.length, 1)
  assert.equal(out.drawn.size, 1)
})

test('the labeller is asked for the faults in the same call, and keeps only known fault codes', async () => {
  let prompt = ''
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    prompt = body.messages[0].content[0].text
    const pictures = [
      { id: 'drawn', subject: 'room', textPresence: 'absent', defects: ['distorted-body', 'odd'] }
    ]
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pictures, imageCode: 'ABC12345' }) } }]
      }),
      { status: 200 }
    )
  }
  const answer = await labelWithVision({
    door: { url: 'https://vision.example', key: 'k', model: 'm' },
    pictures: [{ id: 'drawn', bytes: await jpeg(300, 200) }],
    inspect: { trade: 'climbing gym', shows: 'Bouldering' },
    fetchImpl,
    challengeFor: async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
  })
  assert.match(prompt, /"defects"/)
  assert.match(prompt, /"Bouldering"/)
  assert.deepEqual(answer.labels.get('drawn').defects, ['distorted-body'])
})

test('9.2 a 4000 px photo for a 600 px frame is uploaded at most 1200 px wide and within its byte budget', async () => {
  const slot = {
    key: 'module-1.0',
    type: 'image',
    fit: {
      measured: true,
      aspect: 1.5,
      tolerance: 0.02,
      crop: 'cover',
      minWidth: 900,
      boxes: { desktop: { width: 600, height: 400 } }
    }
  }
  const bytes = await noisy(4000, 2667)
  const [out] = await meetSlotFit(
    [{ group: { slots: [{ key: 'module-1.0' }] }, bytes, ext: 'jpg', hash: 'h', receipt: { kind: 'real' } }],
    { slots: [slot] }
  )
  const meta = await sharp(out.bytes).metadata()
  assert.ok(meta.width <= 1200 && meta.width >= 900, `written ${meta.width} px wide`)
  assert.ok(out.bytes.length <= pictureByteBudget(meta.width, meta.height), `${out.bytes.length} bytes`)
  assert.ok(out.receipt.fittedFrom.changed.includes('weight'))
  // A light photo already within its box and budget is untouched, byte for byte.
  const light = await jpeg(900, 600)
  const [kept] = await meetSlotFit(
    [{ group: { slots: [{ key: 'module-1.0' }] }, bytes: light, ext: 'jpg', hash: 'h2' }],
    { slots: [slot] }
  )
  assert.equal(kept.bytes, light)
})
