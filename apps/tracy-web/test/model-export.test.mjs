import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { publicModelExport } from '../src/workspace/model-export.js'
import { modelWire } from '../src/lib/model-wire.js'

test('streamed exports replace log route IDs and preserve attachment bytes', async () => {
  const wire = modelWire('export-fixture-secret')
  const config = { provider: 'deepseek-official', model: 'deepseek-flash' }
  const log = JSON.stringify({ type: 'request/header', data: { header: { config } } }) + '\n'
  const files = {
    'session.v3.jsonl': strToU8(log),
    'subagents/child/session.v3.jsonl': strToU8(log),
    'files/ab/hash/session.jsonl': strToU8(log),
    'media/image.png': new Uint8Array([0, 255, 1, 88])
  }
  const compressed = zipSync(files)
  const source = new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < compressed.length; offset += 7)
        controller.enqueue(compressed.slice(offset, offset + 7))
      controller.close()
    }
  })
  const response = publicModelExport(
    new Response(source, { headers: { 'content-type': 'application/zip' } }),
    wire
  )
  const unpacked = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const publicConfig = JSON.parse(strFromU8(unpacked['session.v3.jsonl']).trim()).data.header.config
  assert.equal(publicConfig.provider, wire.providerId(config.provider))
  assert.equal(publicConfig.model, wire.modelId(config.provider, config.model))
  assert.equal(strFromU8(unpacked['subagents/child/session.v3.jsonl']).includes('deepseek-flash'), false)
  assert.deepEqual(unpacked['files/ab/hash/session.jsonl'], files['files/ab/hash/session.jsonl'])
  assert.deepEqual(unpacked['media/image.png'], files['media/image.png'])
})
