// The planner opening kit images (ADR 0041, #302), at the seam the bench run uses: the JA Boxing kit JSON with its
// image list swapped for invented bytes in a fake zip, the kit tools, and runAgent over a scripted fake model that
// opens one known image and one unknown id. Checks what reaches the model: one image per tool result, full bytes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { runAgent } from '../src/lib/agent-over-door.js'
import { createKitImages } from '../src/site-planner/kit-images.js'
import { KIT_TOOL_NAMES, kitTools, openKit } from '../src/site-planner/kit-source.js'
import { DOOR, finalReply, scriptedModel, toolCallReply } from './_agent-over-door-fake.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const bytesOf = (id) => Buffer.from(`invented image bytes of ${id} `.repeat(40))

/** The JA Boxing kit, its 110 image ids kept, each image's bytes invented (the real ones are not in the repo). */
function boxingWithInventedImages() {
  const kit = openKit('ja-boxing/j6/1.0.10')
  assert.ok(kit, 'the JA Boxing kit is not readable')
  const images = kit.doc.images.map((image) => {
    const bytes = bytesOf(image.id)
    return { ...image, sha256: sha(bytes), bytes: bytes.length }
  })
  const files = Object.fromEntries(images.map((i) => [i.path, new Uint8Array(bytesOf(i.id))]))
  return { kit: { ...kit, doc: { ...kit.doc, images } }, zip: Buffer.from(zipSync(files)) }
}

test('a fake planner opens a kit image and an unknown id: the image reaches the model inline, the error as text', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-images-agent-'))
  try {
    const { kit, zip } = boxingWithInventedImages()
    const fetched = []
    const ready = await createKitImages({
      dir,
      fetchZip: async (request) => {
        fetched.push(request)
        return { ok: true, bytes: zip }
      }
    }).ensure(kit)
    assert.equal(ready.ok, true, JSON.stringify(ready))
    assert.deepEqual(fetched, [
      { release: 'quickstart/ja-boxing/j6', name: 'template-kit-ja-boxing-1.0.10.zip' }
    ])

    const model = scriptedModel([
      toolCallReply({ calls: [[KIT_TOOL_NAMES.openImage, { id: 'header-1440' }]] }),
      toolCallReply({ calls: [[KIT_TOOL_NAMES.openImage, { id: 'no-such-image' }]] }),
      finalReply({ content: '{"plan":"stub"}' })
    ])
    const result = await runAgent({
      door: DOOR,
      system: 'system',
      firstUser: 'first',
      tools: kitTools(kit.doc, { images: ready.images }),
      fetchImpl: model.fetchImpl
    })
    assert.equal(result.answer, '{"plan":"stub"}')

    const toolMessage = (request) => request.body.messages.findLast((m) => m.role === 'tool')
    const opened = toolMessage(model.requests[1])
    assert.ok(Array.isArray(opened.content), 'the image result was sent as text only')
    const parts = opened.content.filter((p) => p.type === 'image_url')
    assert.equal(parts.length, 1, 'one image per tool result')
    const url = parts[0].image_url.url
    assert.match(url, /^data:image\/jpeg;base64,/)
    assert.deepEqual(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), bytesOf('header-1440'))
    const text = JSON.parse(opened.content.find((p) => p.type === 'text').text)
    assert.equal(text.id, 'header-1440')

    // The newest tool result may carry a cache mark, so its text can arrive as a single text part.
    const unknown = toolMessage(model.requests[2]).content
    const parts2 = typeof unknown === 'string' ? [{ type: 'text', text: unknown }] : unknown
    assert.equal(parts2.filter((p) => p.type === 'image_url').length, 0)
    assert.equal(JSON.parse(parts2.find((p) => p.type === 'text').text).error, 'UNKNOWN_IMAGE')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
