// A marker picture has the shape of the slot it is written to (ticket #586, run 4): the plugin refuses a picture whose
// width over height is not the one the blank site contract declares for its slot (`fit`, `SLOT_IMAGE_INVALID`), and the
// whole write stops there. Since the marker build writes the logo places (G11), the footer logo slot of JA Boxing takes
// the logo marker picture, so that picture must be drawn at the slot's shape, and on a transparent ground when the slot
// asks for one (`fit.transparent`, `SLOT_IMAGE_OPAQUE`: the plugin reads a corner's alpha). Real JA Boxing kit through the marker
// build on a memory site; an invented contract for the shape rule itself.
import assert from 'node:assert/strict'
import test from 'node:test'
import { inflateSync } from 'node:zlib'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { kitOf } from '../ai-quickstart/gate/gate-inputs.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { pictureShapesOf, pngSize } from '../ai-quickstart/gate/marker-pictures.mjs'
import { memoryTryWrite, openMarkerPicture } from '../ai-quickstart/gate/memory-write.mjs'

const FOLDER = new URL(
  '../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
  import.meta.url
).pathname

const slotRatio = (fit) => (fit.source ? fit.source.width / fit.source.height : fit.aspect)

/** The colour type of a PNG (6: RGBA) and the alpha of its first pixel, read from its one image data chunk. */
function cornerOf(bytes) {
  const b = Buffer.from(bytes)
  const type = b[25]
  const at = b.indexOf('IDAT', 33, 'latin1')
  const raw = inflateSync(b.subarray(at + 4, at + 4 + b.readUInt32BE(at - 4)))
  return { type, alpha: type === 6 ? raw[1 + 3] : 255 }
}

test('the footer logo marker picture has the shape and the transparent ground its slot declares', async () => {
  const kit = kitOf(FOLDER)
  const built = await markerBuild(kit, {
    iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
    tryWrite: memoryTryWrite(kit)
  })
  const fit = kit.blankContract.slots.find((s) => s.key === 'module-170.1')?.fit
  assert.ok(fit?.aspect, 'the contract declares a fit for the footer logo slot')
  const upload = built.writePlan.ops.find((o) => o.key === 'picture:home.home-b11.logo')
  const { bytes } = await openMarkerPicture(built.registry, built.pictureShapes)(upload.stored.id)
  const { width, height } = pngSize(bytes)
  assert.ok(Math.abs(width / height - slotRatio(fit)) <= fit.tolerance, `${width}x${height}`)
  assert.ok(width >= (fit.minWidth ?? 0), `${width} wide, the slot asks ${fit.minWidth}`)
  assert.equal(fit.transparent, true)
  assert.deepEqual(cornerOf(bytes), { type: 6, alpha: 0 })
})

test('a picture with no fitting slot stays the square marker; one written to two shapes keeps the first and says so', () => {
  const contract = {
    slots: [
      { key: 'module-1.0', fit: { aspect: 2, minWidth: 100, tolerance: 0.02 } },
      { key: 'module-2.0', fit: { source: { width: 300, height: 100 }, aspect: 3, tolerance: 0.02 } }
    ]
  }
  const value = (slot, ref) => ({ loc: { slot }, value: { ref } })
  const plan = {
    ops: [
      { key: 'picture:a', kind: 'picture.upload', picture: 'a', stored: { id: 'stored-a' } },
      { key: 'picture:b', kind: 'picture.upload', picture: 'b', stored: { id: 'stored-b' } },
      { key: 'picture:c', kind: 'picture.upload', picture: 'c', stored: { id: 'stored-c' } },
      {
        key: 'contract:x',
        kind: 'contract.apply',
        values: [
          value('module-1.0', 'picture:a'),
          value('module-2.0', 'picture:b'),
          value('module-1.0', 'picture:b')
        ]
      }
    ]
  }
  const { shapes, conflicts } = pictureShapesOf(plan, contract)
  assert.deepEqual(shapes['stored-a'], { width: 100, height: 50, transparent: false })
  assert.deepEqual(shapes['stored-b'], { width: 300, height: 100, transparent: false })
  assert.equal(shapes['stored-c'], undefined)
  assert.deepEqual(conflicts, [{ picture: 'b', slots: ['module-2.0', 'module-1.0'] }])
})
