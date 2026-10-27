import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { contentApi } from '../tools/content-api/integration.mjs'
test('opt-in rejects explicit source and static collisions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-route-'))
  try {
    fs.mkdirSync(path.join(dir, 'seed'))
    for (const file of ['seed/content-api-map.json', 'seed/site-model.json', 'template.config.json'])
      fs.writeFileSync(path.join(dir, file), '{}')
    for (const file of [
      'public/content.json',
      'src/pages/content.json.ts',
      'src/pages/content.json.js',
      'src/pages/content.json.astro'
    ]) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), '')
      assert.throws(() => contentApi({ root: pathToFileURL(dir + '/') }), /route collision/)
      fs.unlinkSync(path.join(dir, file))
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
