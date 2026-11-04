// The default cup shipped in public/ stays within the object rules of docs/object-template.md:
// file ≤ 3 MB, every surface image ≤ 2048 px, one mesh, Y up, compressed as the scene expects.
// Rebuild it with `node tools/build-cup.mjs`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

const FILE = new URL('../public/models/default-cup.glb', import.meta.url)

function readGlb(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'glTF')
  const jsonLength = buf.readUInt32LE(12)
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength))
  const binStart = 20 + jsonLength + 8
  return { json, bin: buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLength)) }
}

// Width and height from a WebP header (lossy VP8, lossless VP8L or extended VP8X).
function webpSize(b) {
  assert.equal(b.toString('latin1', 0, 4), 'RIFF')
  assert.equal(b.toString('latin1', 8, 12), 'WEBP')
  const kind = b.toString('latin1', 12, 16)
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
  }
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  throw new Error(`unknown WebP chunk ${kind}`)
}

test('default cup file is at most 3 MB', () => {
  assert.ok(statSync(FILE).size <= 3 * 1024 * 1024, `${statSync(FILE).size} bytes`)
})

test('every surface image is WebP and at most 2048 px', () => {
  const { json, bin } = readGlb(readFileSync(FILE))
  assert.ok(json.images.length > 0)
  for (const image of json.images) {
    assert.equal(image.mimeType, 'image/webp')
    const view = json.bufferViews[image.bufferView]
    const [w, h] = webpSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength))
    assert.ok(w <= 2048 && h <= 2048, `${w}x${h}`)
  }
})

test('one mesh, standing on Y, meshopt geometry', () => {
  const { json } = readGlb(readFileSync(FILE))
  assert.equal(json.meshes.length, 1)
  assert.equal(json.nodes.length, 1)
  assert.deepEqual(json.extensionsRequired.sort(), ['EXT_meshopt_compression', 'EXT_texture_webp'])
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of json.meshes[0].primitives) {
    const a = json.accessors[p.attributes.POSITION]
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], a.min[i])
      max[i] = Math.max(max[i], a.max[i])
    }
  }
  assert.ok(max[1] - min[1] > max[0] - min[0], 'taller along Y than wide')
  assert.ok(Math.abs(min[1]) < 1e-6, 'base sits on y = 0')
})
