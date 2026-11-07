// `media.icon`: search Tracy's icon library, then draw the chosen icon into an icon slot and its twin through the icon door,
// upload both files and write both slots in one contract apply. Every slot, file and door answer here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mediaIcon, pictureOfSlotValue, planIcon } from '../src/host/icon.mjs'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

/** A door, a site folder and an Apply door that record what they were asked. */
function bed({ door: answers = {} } = {}) {
  const asked = { door: [], uploads: [], applies: [], reads: [] }
  const door = async (body) => {
    asked.door.push(body)
    if (answers[body.operation]) return answers[body.operation]
    if (body.operation === 'search') return { ok: true, icons: [{ name: 'barbell', tags: ['gym'] }] }
    if (body.operation === 'pair') return { ok: true, slots: ['article-7.4', 'article-7.5'] }
    return {
      ok: true,
      pictures: body.files.map((f, i) => ({
        slot: f.slot,
        png_b64: Buffer.from(`png-${i}`).toString('base64'),
        sha256: i === 0 ? SHA_A : SHA_B,
        width: 150,
        height: 150
      }))
    }
  }
  const slots = [
    {
      key: 'article-7.4',
      sample:
        'images/demo/icons/icon-dark-1.png#joomlaImage://local-images/demo/icons/icon-dark-1.png?width=100',
      current: `images/tracy-content/${'c'.repeat(64)}.png`
    },
    {
      key: 'article-7.5',
      sample: 'images/demo/icons/icon-light-1.png',
      current: 'images/demo/icons/icon-light-1.png'
    },
    { key: 'article-7.6', sample: '', current: '' }
  ]
  const run = (params) =>
    mediaIcon({
      params,
      platform: 'joomla',
      door,
      imageSlots: async () => slots,
      readFile: async (file) => {
        asked.reads.push(file)
        return Buffer.from(`file:${file}`)
      },
      upload: async (p) => {
        asked.uploads.push(p)
        return { ok: true }
      },
      apply: async (p) => {
        asked.applies.push(p)
        return { ok: true, apply_id: 'contract-1' }
      }
    })
  return { run, asked }
}

test('the call is a search or a slot with an icon, never neither', () => {
  assert.deepEqual(planIcon({ query: 'boxing glove' }), { ok: true, search: 'boxing glove' })
  assert.deepEqual(planIcon({ slot: 'article-7.4', icon: 'Barbell' }), {
    ok: true,
    slot: 'article-7.4',
    icon: 'barbell'
  })
  assert.equal(planIcon({}).ok, false)
  assert.equal(planIcon({ icon: 'barbell' }).ok, false)
  assert.equal(planIcon({ slot: 'article-7.4', icon: '../etc' }).ok, false)
})

test("a slot value is read as the site path it names, Joomla's tail cut off", () => {
  assert.equal(
    pictureOfSlotValue('images/a/b.png#joomlaImage://local-images/a/b.png?width=1'),
    'images/a/b.png'
  )
  assert.equal(pictureOfSlotValue('/images/a.webp'), 'images/a.webp')
  assert.equal(pictureOfSlotValue('images/../configuration.php'), null)
  assert.equal(pictureOfSlotValue(''), null)
})

test('a search answers the library names and how to put one in', async () => {
  const { run, asked } = bed()
  const found = await run({ query: 'dumbbell' })
  assert.equal(found.ok, true)
  assert.deepEqual(found.icons, [{ name: 'barbell', tags: ['gym'] }])
  assert.match(found.next, /media\.icon \{slot/)
  assert.deepEqual(asked.door, [{ operation: 'search', query: 'dumbbell' }])
  assert.equal(asked.applies.length, 0)
})

test('an icon goes into the slot AND its twin: both files drawn, uploaded, and written in one apply', async () => {
  const { run, asked } = bed()
  const done = await run({ slot: 'article-7.5', icon: 'barbell' })
  assert.equal(done.ok, true)
  assert.deepEqual(asked.door[0], { operation: 'pair', slot: 'article-7.5' })
  const draw = asked.door[1]
  assert.equal(draw.icon, 'barbell')
  assert.deepEqual(
    draw.files.map((f) => f.slot),
    ['article-7.4', 'article-7.5']
  )
  // The template's own icon and what the slot shows now, read from the site's folder.
  assert.ok(asked.reads.includes('images/demo/icons/icon-dark-1.png'))
  assert.ok(asked.reads.includes(`images/tracy-content/${'c'.repeat(64)}.png`))
  assert.deepEqual(
    asked.uploads.map((u) => u.path),
    [`images/tracy-content/${SHA_A}.png`, `images/tracy-content/${SHA_B}.png`]
  )
  assert.equal(asked.uploads[0].apply_id, `media-icon-${SHA_A.slice(0, 16)}`)
  assert.deepEqual(asked.applies, [
    {
      operation: 'apply',
      changes: {
        'article-7.4': `images/tracy-content/${SHA_A}.png`,
        'article-7.5': `images/tracy-content/${SHA_B}.png`
      }
    }
  ])
  assert.equal(done.apply_id, 'contract-1')
  assert.match(done.next, /apply\.revert/)
})

test('a slot that is not an icon is sent to media.draw, and nothing is drawn or written', async () => {
  const { run, asked } = bed({ door: { pair: { ok: false, code: 'NOT_AN_ICON_SLOT', kind: 'photo' } } })
  const refused = await run({ slot: 'article-7.9', icon: 'barbell' })
  assert.equal(refused.code, 'NOT_AN_ICON_SLOT')
  assert.match(refused.error, /media\.draw/)
  assert.equal(asked.door.length, 1)
  assert.equal(asked.uploads.length + asked.applies.length, 0)
})

test('a slot whose icon is not on the site, a failed upload, or an unknown icon writes nothing', async () => {
  const empty = bed({ door: { pair: { ok: true, slots: ['article-7.6'] } } })
  assert.equal((await empty.run({ slot: 'article-7.6', icon: 'barbell' })).code, 'ICON_NOT_ON_SITE')
  assert.equal(empty.asked.applies.length, 0)

  const unknown = bed({ door: { draw: { ok: false, code: 'ICON_UNKNOWN' } } })
  const said = await unknown.run({ slot: 'article-7.4', icon: 'flux-capacitor' })
  assert.equal(said.code, 'ICON_UNKNOWN')
  assert.match(said.error, /media\.icon \{query/)
  assert.equal(unknown.asked.uploads.length, 0)

  const { asked } = bed()
  const failing = await mediaIcon({
    params: { slot: 'article-7.4', icon: 'barbell' },
    platform: 'wordpress',
    door: async (b) =>
      b.operation === 'pair'
        ? { ok: true, slots: ['article-7.4'] }
        : { ok: true, pictures: [{ slot: 'article-7.4', png_b64: 'eA==', sha256: SHA_A }] },
    imageSlots: async () => [{ key: 'article-7.4', current: 'wp-content/uploads/icon.png' }],
    readFile: async () => Buffer.from('x'),
    upload: async () => ({ ok: false, code: 'TOOLSET_REQUIRED', error: 'no media toolset' }),
    apply: async (p) => {
      asked.applies.push(p)
      return { ok: true }
    }
  })
  assert.equal(failing.ok, false)
  assert.equal(failing.code, 'TOOLSET_REQUIRED')
  assert.equal(asked.applies.length, 0)
})
