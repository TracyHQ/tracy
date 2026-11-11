// Exercise the real picture preparation entry point with read-only fake SQL answers, no DB or model calls.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { SITE_PICTURES_STEP } from '../src/site-pictures/bench-worker.js'

const REF = 'surface-test/j6/1.0.0'

for (const failed of [false, true])
  test(`a five-minute cold surface ${failed ? 'failure' : 'fetch'} is included in picture preparation code time`, async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'surface-timing-'))
    t.after(() => rm(dir, { recursive: true, force: true }))
    const bytes = Buffer.from(zipSync({ 'templates/surface_test/css/template.css': strToU8('body{}') }))
    const hash = createHash('sha256').update(bytes).digest('hex')
    const doc = {
      kit: 'tracy-template-kit/2',
      contract: REF,
      quickstart: { version: '1.0.0' },
      template: { name: 'surface_test' },
      blocks: [],
      pages: [],
      images: [{ id: 'unused', path: 'images/unused.jpg', sha256: 'a'.repeat(64) }]
    }
    await writeFile(path.join(dir, 'template-kit.json'), JSON.stringify(doc))
    await writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ quickstart: { parts: { installer: { file: 'surface.zip', sha256: hash } } } })
    )
    const pool = {
      async query(sql, params) {
        if (sql.includes('from llm_assignment')) {
          if (params[0] === 'pictureIconRanker') return { rows: [] }
          assert.equal(params[0], 'pictureLooker')
          return {
            rows: [
              {
                id: 'surface-test-provider',
                enabled: true,
                base_url: 'http://localhost:1234/v1',
                preset_id: null,
                api_key_cipher: null,
                door_model: 'surface-test-looker',
                revision: 1,
                assignment_revision: 1,
                assignment_updated_at: new Date(0),
                models: [{ id: 'surface-test-looker', vision: true }]
              }
            ]
          }
        }
        assert.match(sql, /from site_picture_round/)
        return { rows: [] }
      }
    }
    let now = 1_000
    t.mock.method(Date, 'now', () => now)
    let fetches = 0
    const ready = await SITE_PICTURES_STEP.prepare(
      {
        pool,
        secret: 'surface-test-secret',
        storeDir: path.join(dir, 'pictures'),
        index: new Map([['quickstart/surface-test/j6@1.0.0', { id: REF, dir, platform: 'joomla' }]]),
        fetchImpl() {
          assert.fail('no model or external fetch is expected')
        },
        async quickstart() {
          fetches++
          now += 300_000
          if (failed) throw new Error('simulated download timeout')
          return { ok: true, bytes }
        }
      },
      {
        id: 'surface-timing-run',
        kit: { ref: REF },
        door: {
          looker: {
            providerId: 'surface-test-provider',
            model: 'surface-test-looker',
            endpointHost: 'localhost'
          }
        },
        brief: { facts: [], assets: [] },
        plan: { site: {}, pages: [], sharedBlocks: [] },
        plan_sha256: 'b'.repeat(64),
        brief_sha256: 'c'.repeat(64),
        prompts: {}
      }
    )
    assert.equal(ready.ok, true, ready.reason)
    assert.equal(fetches, 1)
    assert.equal(ready.manifest.timing.code, 300_000)
    assert.equal(ready.manifest.timing.iconRanking, 0)
    if (failed) {
      assert.match(ready.manifest.frameSurface.note, /simulated download timeout/)
      assert.equal(ready.manifest.frameSurface.quickstart, null)
    } else {
      assert.equal(ready.manifest.frameSurface.note, null)
      assert.equal(ready.manifest.frameSurface.quickstart.sha256, hash)
    }
  })
