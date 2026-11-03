// The icon step inside fillFrames (#345): an invented "Kestrel Row Bike Workshop" kit with icon frames, demo icons
// drawn by code, a fake text door. Checks the names, the light and dark files, the twin, the measured weight and
// colour, no icon twice in a block, and what the picture check says about the icons. No model is called.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { createIconFiller } from '../src/site-pictures/icons/fill-icons.js'
import { iconColourOf } from '../src/site-pictures/icons/icon-ink.js'
import { iconStyleOf } from '../src/site-pictures/icons/icon-style.js'
import { hasPhosphorIcon, phosphorNames } from '../src/site-pictures/icons/phosphor-set.js'
import { PICTURES_VERSION } from '../src/site-pictures/manifest-shape.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'

const frame = (id, extra = {}) => ({
  id,
  kind: 'icon',
  width: 64,
  height: 64,
  shape: { name: 'any', aspect: 1 },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.png`,
  role: null,
  ...extra
})
const slot = (key) => ({
  key,
  type: 'image',
  sample: `images/demo/${key}.png#joomlaImage://local-images/demo/${key}.png?width=64&height=64`,
  fit: { source: { width: 64, height: 64, format: 'png' } }
})
const kitDoc = () => ({
  kit: 'tracy-template-kit/2',
  contract: 'demo-bikes/j6/1.0.0',
  quickstart: { version: '1.0.0' },
  images: [],
  template: { name: 'demo_bikes', version: '1.0.0' },
  site: { brandColours: { primary: { value: '#2f6f8f' } } },
  blocks: [
    {
      id: 'block-2',
      role: 'features',
      frames: [
        frame('block-2.1'),
        frame('block-2.2'),
        frame('block-2.3'),
        frame('block-2.1d', { twinOf: 'block-2.1' })
      ]
    },
    { id: 'block-3', role: 'features', frames: [frame('block-3.1'), frame('block-3.2')] }
  ],
  contentMap: { slots: ['2.1', '2.2', '2.3', '2.1d', '3.1', '3.2'].map((n) => slot(`module-${n}`)) }
})
const wish = (id, shows, mustInclude = ['thin line', 'one colour']) => ({
  frame: id,
  kind: 'icon',
  match: 'specific',
  size: '64 x 64',
  shows,
  mustInclude,
  avoid: [],
  mood: 'calm',
  factIds: []
})
const keep = (block, pictures) => ({ block, seen: 'seen', decision: 'keep', why: 'fits', pictures })
const planDoc = () => ({
  version: 'site-plan/3',
  kit: 'tracy-template-kit/2 demo-bikes/j6/1.0.0',
  site: { name: 'Kestrel Row Bike Workshop' },
  sharedBlocks: [],
  pages: [
    {
      id: 'page-home',
      decision: 'keep',
      blocks: [
        keep('block-2', [
          wish('block-2.1', 'a wrench'),
          wish('block-2.2', 'a wrench for a second service'),
          wish('block-2.3', 'zzqx')
        ]),
        keep('block-3', [wish('block-3.1', 'a wrench'), wish('block-3.2', 'a bicycle')])
      ]
    }
  ]
})

// A demo icon drawn by code: a house outline of the given stroke and ink on a transparent 64 px square.
const demo = (ink, stroke) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100"><path d="M20 48 L50 20 L80 48 L80 82 L20 82 Z" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="M42 82 L42 60 L58 60 L58 82" fill="none" stroke="${ink}" stroke-width="${stroke}"/></svg>`
    )
  )
    .png()
    .toBuffer()
const DEMOS = new Map()
const readDemo = async (f) => DEMOS.get(f.id) ?? null
const BIKES = { brief: { facts: [], assets: [] }, photoBytes: new Map() }

async function run({ door, demos = [], over = {} } = {}) {
  DEMOS.clear()
  for (const [id, ink, stroke] of demos) DEMOS.set(id, await demo(ink, stroke))
  const icons = createIconFiller({ door, readDemo, ...over })
  const got = await fillFrames({ plan: planDoc(), kit: kitDoc(), ...BIKES, icons })
  return { got, icons }
}
const byFrame = (got, id) => got.frames.find((e) => e.frame === id)
const pixelsOf = async (got, entryFile) =>
  sharp(got.files.get(entryFile).bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

const ASK = (text) => async () => ({
  text: JSON.stringify(text),
  model: 'vendor/cheap-text',
  usage: { total: 1 }
})

test('every icon frame gets a real library name, light and dark files of the frame size, marked recolourable', async () => {
  const { got } = await run({
    door: ASK({ items: { 'block-2.1': ['wrench', 'made-up-icon'], 'block-2.2': ['wrench', 'gear'] } }),
    demos: [
      ['block-2.1', '#c0392b', 5],
      ['block-2.2', '#c0392b', 5],
      ['block-3.1', '#c0392b', 5]
    ]
  })
  assert.deepEqual(got.pending, [])
  assert.deepEqual(got.returns, [])
  for (const id of ['block-2.1', 'block-2.2', 'block-2.3', 'block-3.1', 'block-3.2']) {
    const e = byFrame(got, id)
    assert.equal(e.source, 'icon', id)
    assert.ok(
      hasPhosphorIcon(e.icon.light) && hasPhosphorIcon(e.icon.dark),
      `${id} ${JSON.stringify(e.icon)}`
    )
    assert.equal(e.recolourable, true)
    assert.deepEqual([e.width, e.height, e.dark.width, e.dark.height], [64, 64, 64, 64])
    assert.match(e.file, /^files\/[0-9a-f]{64}\.png$/)
    assert.match(e.dark.file, /^files\/[0-9a-f]{64}\.png$/)
    assert.ok(got.files.has(e.file) && got.files.has(e.dark.file))
  }
})

test('the model ranks, never invents; no icon twice in one block, the same icon allowed in another block', async () => {
  const { got, icons } = await run({
    door: ASK({
      items: {
        'block-2.1': ['made-up-icon', 'wrench'],
        'block-2.2': ['wrench', 'gear'],
        'block-3.1': ['wrench']
      }
    })
  })
  const names = (ids) => ids.map((id) => byFrame(got, id).icon.light)
  const block2 = names(['block-2.1', 'block-2.2', 'block-2.3'])
  assert.equal(block2[0], 'wrench')
  assert.notEqual(block2[1], 'wrench')
  assert.ok(hasPhosphorIcon(block2[1]))
  assert.equal(new Set(block2).size, 3, block2.join())
  assert.match(byFrame(got, 'block-2.3').reason, /neutral mark/)
  assert.equal(byFrame(got, 'block-3.1').icon.light, 'wrench')
  assert.equal(icons.ranking().model, 'vendor/cheap-text')
})

test('without a usable model the shortlist order decides and the run still fills every frame', async () => {
  const { got, icons } = await run({
    door: async () => {
      throw new Error('model down')
    }
  })
  assert.equal(got.frames.filter((e) => e.source === 'icon').length, 5)
  assert.match(icons.ranking().note, /model could not be read/)
  assert.equal(byFrame(got, 'block-2.1').icon.light, 'wrench')
})

test('the weight and the colour are measured from the demo icons of the block', async () => {
  const { got } = await run({
    door: null,
    demos: [
      ['block-2.1', '#2f5d8a', 8],
      ['block-2.2', '#2f5d8a', 8],
      ['block-2.3', '#2f5d8a', 8]
    ]
  })
  const e = byFrame(got, 'block-2.1')
  assert.equal((await iconStyleOf(got.files.get(e.file).bytes))?.weight, 'bold')
  const ink = await iconColourOf(got.files.get(e.file).bytes)
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(ink.slice(i, i + 2), 16))
  assert.ok(Math.abs(r - 0x2f) < 16 && Math.abs(g - 0x5d) < 16 && Math.abs(b - 0x8a) < 16, ink)
  // The block with no demo to read is drawn regular in the template accent.
  const plain = byFrame(got, 'block-3.1')
  assert.equal((await iconStyleOf(got.files.get(plain.file).bytes))?.weight, 'regular')
  assert.match(plain.reason, /no demo icon to measure/)
})

test('the dark file is a different colour of the same icon, and a kit twin holds the variant of its own demo', async () => {
  const { got } = await run({
    door: null,
    demos: [
      ['block-2.1', '#1b2a41', 5],
      ['block-2.1d', '#f2f2f2', 5]
    ]
  })
  const e = byFrame(got, 'block-2.1')
  const twin = byFrame(got, 'block-2.1d')
  assert.notEqual(e.sha256, e.dark.sha256)
  assert.equal(twin.source, 'twin')
  assert.equal(twin.twinOf, 'block-2.1')
  assert.equal(twin.sha256, e.dark.sha256)
  const lum = async (file) => {
    const { data, info } = await pixelsOf(got, file)
    let sum = 0
    let n = 0
    for (let i = 0; i < data.length; i += info.channels)
      if (data[i + 3] > 200) {
        sum += data[i]
        n += 1
      }
    return sum / n
  }
  assert.ok((await lum(e.file)) < 90 && (await lum(e.dark.file)) > 160)
})

test('with no twin demo to read, the twin takes the other variant; same ink in the twin demo keeps the own file', async () => {
  const none = await run({ door: null, demos: [['block-2.1', '#1b2a41', 5]] })
  assert.equal(byFrame(none.got, 'block-2.1d').sha256, byFrame(none.got, 'block-2.1').dark.sha256)
  const same = await run({
    door: null,
    demos: [
      ['block-2.1', '#1b2a41', 5],
      ['block-2.1d', '#1b2a41', 5]
    ]
  })
  assert.equal(byFrame(same.got, 'block-2.1d').sha256, byFrame(same.got, 'block-2.1').sha256)
})

test('the picture check finds the icons whole: names in the library, dark files, twin files', async () => {
  const { got } = await run({
    door: null,
    demos: [
      ['block-2.1', '#1b2a41', 5],
      ['block-2.1d', '#f2f2f2', 5]
    ]
  })
  const files = {}
  for (const [file, made] of got.files)
    files[file] = { sha256: made.sha256, width: made.width, height: made.height }
  const { files: _files, refused, ...parts } = got
  const hex = (c) => c.repeat(64)
  const result = checkPictures({
    pictures: {
      version: PICTURES_VERSION,
      fingerprint: {
        kit: 'demo-bikes/j6/1.0.0',
        planSha256: hex('a'),
        briefSha256: hex('b'),
        prompts: { picker: hex('c'), drawing: hex('d'), looker: hex('e') }
      },
      ...parts,
      altNotes: [],
      refusedPhotos: refused,
      cost: { code: 0 },
      timing: { code: 0 }
    },
    plan: planDoc(),
    kit: kitDoc(),
    brief: BIKES.brief,
    files,
    icons: [...phosphorNames()]
  })
  for (const id of ['P01', 'P02', 'P03', 'P10', 'P11']) {
    const rule = result.rules.find((r) => r.id === id)
    assert.equal(rule.status, 'pass', `${id}: ${JSON.stringify(rule.failures)}`)
  }
})

test('without the icon step, icon frames stay pending as before', async () => {
  const got = await fillFrames({ plan: planDoc(), kit: kitDoc(), ...BIKES })
  assert.equal(got.pending.filter((p) => p.waitsFor === 'icons').length, 5)
  assert.equal(got.frames.length, 0)
})
