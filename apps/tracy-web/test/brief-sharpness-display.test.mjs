/** Display size and upload density are different: phone photos stay preferred when their actual hero crop is sharp. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { writeContractPictures } from '../src/sites/brief-engines/contract-real-pictures.js'
import { slotClassOf } from '../src/lib/photo-sharpness.js'
import { throughDoor } from './_apply-door.mjs'
import { scene } from './_generated-photos.mjs'

for (const trade of ['bakery', 'dental']) {
  test(`#189 ${trade}: portrait owner photos use the hero display size, then satisfy the real plugin density check`, async () => {
    const bytes = await scene(trade, 1600, 2133)
    const demo = await sharp({ create: { width: 1200, height: 675, channels: 3, background: '#789abc' } })
      .jpeg()
      .toBuffer()
    const slot = {
      key: 'module-40.0',
      entity: 'module-40',
      column: 'content',
      type: 'image',
      role: 'business.hero_image',
      sample: 'images/demo/hero.jpg',
      maxCharacters: 4000,
      fit: {
        measured: true,
        kind: 'photo',
        replace: 'photo',
        transparent: false,
        source: { width: 1200, height: 675 },
        aspect: 1.777778,
        tolerance: 0.02,
        minWidth: 2160,
        crop: 'cover'
      }
    }
    const contentMap = {
      roleVocabularyVersion: 'place-content-roles/3',
      entities: [{ key: 'module-40', kind: 'module' }],
      slots: [slot],
      pages: [{ route: 'home', assignedModules: [{ entity: 'module-40' }] }]
    }
    const asset = {
      id: 'owner-phone',
      kind: 'image',
      width: 1600,
      height: 2133,
      quality: 'high',
      uploaderRole: 'owner',
      isOwnPhoto: true,
      isGraphic: false,
      depicts: { id: 'general', evidence: { via: 'vision' } },
      portraitOf: null,
      subjectBox: [0.2, 0.4, 0.6, 0.15],
      faceBoxes: []
    }
    const real = {
      buildId: `fictional-${trade}`,
      plan: null,
      colours: ['#315779'],
      pictures: [{ ...asset, sha256: 'fictional-photo-hash' }],
      brief: { business: { name: `Fictional ${trade}`, trade }, assets: [asset], reading: { services: [] } },
      bytes: async () => bytes
    }
    let current = slot.sample
    let outcome
    let plan
    let writes = 0
    const uploaded = new Map()
    const apply = throughDoor(async ({ action, params }) => {
      if (action === 'content.contract' && params.operation === 'inspect')
        return { ok: true, contract: 'fictional/j6/1.0.0', revision: 'rev-1', slots: [{ ...slot, current }] }
      if (action === 'media.upload') {
        uploaded.set(params.path, Buffer.from(params.content_b64, 'base64'))
        return { ok: true }
      }
      if (action === 'content.contract' && params.operation === 'apply') {
        writes += 1
        current = params.changes[slot.key]
        return { ok: true }
      }
      return { ok: true }
    })
    const inspect = () =>
      apply({ siteKey: 'fictional', action: 'content.contract', params: { operation: 'inspect' } })
    await writeContractPictures({
      ctx: {
        siteKey: 'fictional',
        platform: 'joomla',
        contract: { id: 'fictional/j6/1.0.0' },
        note() {},
        time() {}
      },
      real,
      contentMap,
      apply,
      inspect,
      siteFile: () => async () => demo,
      realPictures: {
        recordPlan: async (_id, value) => {
          plan = value
          return value
        },
        recordOutcome: async (_id, value) => {
          outcome = value
        }
      },
      write: async ({ changes }) => {
        const result = await apply({
          siteKey: 'fictional',
          action: 'content.contract',
          params: { operation: 'apply', changes }
        })
        assert.equal(result.ok, true)
        return new Set()
      }
    })
    assert.equal(writes, 1)
    const receipt = Object.values(outcome.receipts)[0]
    assert.equal(receipt.kind, 'photo', JSON.stringify(plan.sharpness))
    assert.equal(receipt.mediaId, asset.id)
    assert.equal(plan.sharpness.slots[slot.key].bar, 'background')
    assert.equal(plan.sharpness.slots[slot.key].width, 1440)
    assert.ok(plan.sharpness.slots[slot.key].score >= 1)
    assert.equal(
      (await sharp(uploaded.get(current)).metadata()).width,
      2160,
      'the plugin still receives the required asset density'
    )
  })
}

test('#189 the widest measured responsive box decides; upload minimum alone uses the declared 1.5x density', () => {
  const callback = (s) => s.fit.boxes?.desktop?.width ?? s.fit.minWidth
  assert.deepEqual(slotClassOf([{ role: 'business.gallery_image', fit: { minWidth: 672 } }], callback), {
    kind: 'medium',
    width: 448
  })
  assert.deepEqual(
    slotClassOf(
      [{ role: 'offering.image', fit: { boxes: { desktop: { width: 400 }, tablet: { width: 704 } } } }],
      callback
    ),
    { kind: 'large', width: 704 }
  )
})
