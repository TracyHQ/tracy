/** Both contract CMSs keep image writes separate from prose and retain the inspected revision fence. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { writeContractPictures } from '../src/sites/brief-engines/contract-real-pictures.js'

for (const platform of ['joomla', 'wordpress']) {
  async function fixture() {
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#64554a' } })
      .jpeg()
      .toBuffer()
    const slot = {
      key: 'page-home.hero',
      entity: 'page-home',
      type: 'image',
      label: 'Home - Hero image',
      sample: 'images/demo/hero.jpg',
      current: 'images/demo/hero.jpg'
    }
    const text = { key: 'page-home.title', type: 'text', sample: 'Demo title', current: 'Demo title' }
    const map = { slots: [slot, text], pages: [{ route: 'home', entity: 'page-home' }] }
    const ctx = {
      platform,
      siteKey: 'site.test',
      email: 'owner@test.test',
      contract: { id: 'contract-1' },
      brief: {},
      note() {},
      time() {}
    }
    const calls = [],
      outcomes = []
    const real = {
      buildId: 'b1',
      plan: null,
      colours: [],
      pictures: [
        {
          id: 'photo',
          width: 1600,
          height: 900,
          vision: { subject: 'interior', textPresence: 'none', quality: 'good', oneLine: 'A dining room.' }
        }
      ],
      bytes: async () => bytes
    }
    const realPictures = {
      recordPlan: async (_id, plan) => plan,
      recordOutcome: async (_id, outcome) => outcomes.push(outcome)
    }
    let revision = 'r1'
    const inspect = async () => ({
      ok: true,
      contract: 'contract-1',
      revision,
      slots:
        platform === 'wordpress'
          ? Object.fromEntries(map.slots.map((s) => [s.key, s.current]))
          : structuredClone(map.slots)
    })
    const apply = async (call) => {
      calls.push(call)
      assert.equal(call.action, 'media.upload')
      return { ok: true, path: 'images/real.jpg', url: 'images/real.jpg' }
    }
    const write = async ({ state, changes }) => {
      assert.equal(state.revision, revision)
      assert.deepEqual(Object.keys(changes), [slot.key])
      slot.current = changes[slot.key]
      revision = 'r2'
      return new Set()
    }
    const input = {
      ctx,
      real,
      realPictures,
      apply,
      siteFile: () => async () => bytes,
      siteReader: async () => ({ bytes: async () => bytes, text: async () => '<img src="images/real.jpg">' }),
      inspect,
      write,
      contentMap: map
    }
    return { input, slot, text, calls, outcomes }
  }
  test(`${platform}: image-only phase uses shared selection/crop and writes no text`, async () => {
    const f = await fixture()
    const result = await writeContractPictures(f.input)
    assert.equal(result.report.photos, 1)
    assert.equal(result.report.verified, 1)
    assert.equal(f.text.current, 'Demo title')
    assert.equal(f.calls.length, 1)
    assert.equal(f.outcomes.length, 2)
    assert.equal(Object.values(f.outcomes[0].receipts)[0].state, 'uploaded')
  })
  test(`${platform}: a cleared gallery keeps its removal paths and routes across the image write boundary`, async () => {
    const f = await fixture()
    const bytes = await sharp({
      create: { width: 1600, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer()
    const shaped = {
      shaped: [
        {
          group: { sample: f.slot.sample, role: 'gallery', slots: [f.slot], routes: ['gallery'] },
          bytes,
          ext: 'png',
          hash: createHash('sha256').update(bytes).digest('hex'),
          hide: true,
          receipt: { kind: 'blank', origin: 'placeholder' }
        }
      ],
      map: { groups: [], never: [] },
      plan: { placements: [], unfilled: [], unused: [] }
    }
    const result = await writeContractPictures({ ...f.input, shaped })
    assert.equal(result.hiddenPictures.length, 1)
    assert.match(result.hiddenPictures[0], /tracy-content\/[a-f0-9]{64}\.png$/)
    assert.deepEqual(
      result.removedGalleryPictures.map((g) => g.routes),
      [['gallery']]
    )
    const other = await fixture()
    const cutout = structuredClone(shaped)
    cutout.shaped[0].bytes = bytes
    cutout.shaped[0].hash = createHash('sha256').update(bytes).digest('hex')
    cutout.shaped[0].group.role = 'cut-out'
    const cleared = await writeContractPictures({ ...other.input, shaped: cutout })
    assert.notEqual(
      result.hiddenPictures[0],
      cleared.hiddenPictures[0],
      'a gallery marker never aliases a same-size clear cut-out and hides its surrounding section'
    )
    assert.equal(result.report.verified, 1)
  })
  test(`${platform}: an editor change refuses image replacement before upload`, async () => {
    const f = await fixture()
    f.slot.current = 'images/editor.jpg'
    await assert.rejects(writeContractPictures(f.input), { code: 'PICTURE_EDITOR_CHANGED' })
    assert.equal(f.calls.length, 0)
  })
  test(`${platform}: changes between upload and contract write are not a new baseline`, async () => {
    const f = await fixture(),
      apply = f.input.apply
    f.input.apply = async (call) => {
      const result = await apply(call)
      f.slot.current = 'images/editor.jpg'
      return result
    }
    await assert.rejects(writeContractPictures(f.input), { code: 'PICTURE_EDITOR_CHANGED' })
    assert.equal(f.text.current, 'Demo title')
  })
}

test('contract intent survives a failed readback so the next run recognizes its own image path', async () => {
  const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#64554a' } })
    .jpeg()
    .toBuffer()
  const slot = {
    key: 'page-home.hero',
    entity: 'page-home',
    type: 'image',
    label: 'Home - Hero image',
    sample: 'images/demo/hero.jpg',
    current: 'images/demo/hero.jpg'
  }
  const real = {
    buildId: 'b1',
    plan: null,
    receipts: {},
    colours: [],
    pictures: [
      {
        id: 'photo',
        width: 1600,
        height: 900,
        vision: { subject: 'interior', textPresence: 'none', quality: 'good' }
      }
    ],
    bytes: async () => bytes
  }
  let written = false,
    failedReadback = false
  const input = {
    ctx: {
      platform: 'wordpress',
      siteKey: 'site.test',
      contract: { id: 'c1' },
      brief: {},
      note() {},
      time() {}
    },
    real,
    contentMap: { slots: [slot], pages: [{ route: 'home', entity: 'page-home' }] },
    realPictures: {
      recordPlan: async (_id, plan) => {
        real.plan ??= plan
        return real.plan
      },
      recordOutcome: async (_id, outcome) => {
        real.receipts = structuredClone(outcome.receipts)
      }
    },
    apply: async () => ({ ok: true, path: 'images/real.jpg' }),
    siteFile: () => async () => bytes,
    inspect: async () => {
      if (written && !failedReadback) {
        failedReadback = true
        throw new Error('readback unavailable')
      }
      return { ok: true, contract: 'c1', revision: written ? 'r2' : 'r1', slots: [structuredClone(slot)] }
    },
    write: async ({ changes }) => {
      slot.current = changes[slot.key]
      written = true
      return new Set()
    }
  }
  await assert.rejects(writeContractPictures(input), /readback unavailable/)
  assert.equal(Object.values(real.receipts)[0].state, 'uploaded')
  const result = await writeContractPictures(input)
  assert.equal(result.report.verified, 1)
})
