// The image reader already rejected the observed catalogue photo correctly. Keeping a fallback
// placement must not turn its hard visual faults into acceptance or a writable image package.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { fileStore } from '../src/site-pictures/file-store.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { packageItems } from '../src/write-step/picture-package.js'
import { brief, kit, pictures, plan } from './_site-pictures-check.mjs'

const faults = ['wrong subject', 'subject cut off', 'face cut']
const seen = 'A cropped person wearing teal athletic shorts stands against a white background.'

async function judge(faults) {
  const dir = await mkdtemp(path.join(tmpdir(), 'retained-picture-'))
  try {
    // Pixels are synthetic: this test checks the handling of a correct visual refusal, not vision accuracy.
    const bytes = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#368688' } })
      .jpeg()
      .toBuffer()
    const name = await fileStore(dir).putPicture(bytes, 'jpg')
    const sent = []
    const looker = createLooker({
      door: { providerId: 'test', baseUrl: 'https://models.test', apiKey: 'test', model: 'test' },
      prompt: { text: 'Read the image.', sha256: 'a'.repeat(64) },
      storeDir: dir,
      runId: 'retained-review',
      alts: null,
      idx: {
        frames: new Map([['programme.1', { width: 80, height: 100 }]]),
        wishes: new Map([
          [
            'programme.1',
            {
              match: 'specific',
              shows: 'children warming up with rackets on a padel court',
              mustInclude: ['children', 'rackets']
            }
          ]
        ])
      },
      fetchImpl: async (_url, init) => {
        sent.push(JSON.parse(init.body))
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ verdict: 'fail', faults, seen }) } }]
          }),
          { status: 200 }
        )
      }
    })
    const entry = {
      frame: 'programme.1',
      source: 'owner-photo',
      file: name,
      sha256: name.split('.')[0],
      filledBy: { rung: 'best-rejected', faults }
    }
    const result = await looker.look({ frames: [entry], siteSettings: [], cost: {}, timing: {} })
    return { result, sent }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('a retained wrong programme photo keeps the correct visual refusal as a failed rule', async () => {
  const { result, sent } = await judge(faults)
  assert.match(sent[0].messages[1].content[0].text, /children warming up with rackets on a padel court/)
  assert.match(sent[0].messages[1].content[0].text, /"mustInclude"/)
  assert.equal(sent[0].messages[1].content[1].type, 'image_url')
  assert.equal(result.doc.frames[0].filledBy.rung, 'best-rejected', 'the fallback placement remains recorded')
  assert.deepEqual(result.doc.frames[0].looker.faults, faults)
  assert.equal(result.rule.status, 'fail')
  assert.equal(result.rule.failures[0].where, 'programme.1')
  assert.match(result.rule.failures[0].detail, /wrong subject.*face cut/)
})

test('a retained picture with only existing minor faults keeps the existing tolerance', async () => {
  const { result } = await judge(['subject cut off'])
  assert.equal(result.rule.status, 'pass')
  assert.match(result.rule.notes[0], /kept with minor faults/)
})

function exported(faults, { twin = false, setting = false } = {}) {
  const doc = pictures()
  const entry = setting ? doc.siteSettings[0] : doc.frames.find((e) => e.frame === 'block-7.1')
  entry.source = 'owner-photo'
  entry.asset = 'catalogue-photo'
  entry.filledBy = { rung: 'best-rejected', faults }
  entry.seen = seen
  if (!twin) doc.frames = doc.frames.filter((e) => e.frame !== 'block-7.2')
  return exportPictureMapping({
    pictures: doc,
    contract: 'test',
    revision: 'r1',
    kit: kit(),
    plan: plan(),
    brief: brief()
  })
}

test('the export refuses a historical hard-rejected placement and its twin before upload', () => {
  const out = exported(faults, { twin: true })
  for (const frame of ['block-7.1', 'block-7.2']) {
    assert.ok(out.problems.some((p) => p.where === frame && /wrong subject.*face cut/.test(p.detail)))
    assert.equal(out.mapping.changes[frame.replace('block-', 'module-')], undefined)
    assert.ok(packageItems(out).some((item) => item.frame === frame))
  }
  assert.ok(!out.uploads.some((u) => u.file === 'out/drawn.png'))
})

test('a hard-rejected site setting cannot bypass the image export fence', () => {
  const out = exported(['wrong subject'], { setting: true })
  assert.ok(out.problems.some((p) => p.where === 'block-6.picture-1' && /wrong subject/.test(p.detail)))
  assert.equal(out.siteSettings.length, 0)
})

test('the export still permits a fallback retained for minor faults only', () => {
  const out = exported(['subject cut off'])
  assert.equal(
    out.mapping.changes['module-7.1'],
    pictures().frames.find((e) => e.frame === 'block-7.1').sitePath
  )
  assert.ok(!out.problems.some((p) => p.where === 'block-7.1'))
})
