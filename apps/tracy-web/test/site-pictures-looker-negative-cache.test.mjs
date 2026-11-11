import assert from 'node:assert/strict'
import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { fileStore } from '../src/site-pictures/file-store.js'
import { NEGATIVE_LOOK_POLICY } from '../src/site-pictures/looker-negative-cache.js'
import { createLooker } from '../src/site-pictures/looker-step.js'

const door = { providerId: 'test', model: 'test/vision', baseUrl: 'https://vision.test/v1', apiKey: 'test' }
const prompt = { text: 'Check the finished picture.', sha256: 'a'.repeat(64) }
async function setup(faults, { distinct = false, delay = 0 } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'looker-negative-'))
  const store = fileStore(dir)
  const frames = []
  for (let i = 0; i < 3; i++) {
    const bytes = await sharp({
      create: {
        width: 120,
        height: 100,
        channels: 3,
        background: { r: 40 + (distinct ? i : 0), g: 70, b: 90 }
      }
    })
      .png()
      .toBuffer()
    const file = await store.putPicture(bytes, 'png')
    frames.push({ frame: `f${i}`, source: 'owner-photo', file, sha256: file.split('.')[0] })
  }
  const idx = {
    frames: new Map(frames.map((e) => [e.frame, { width: 120, height: 100 }])),
    wishes: new Map(
      frames.map((e, i) => [
        e.frame,
        { match: 'any-real', mood: ['energetic', 'intense', 'focused'][i], avoid: [] }
      ])
    )
  }
  let calls = 0
  const fetchImpl = async () => {
    calls++
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    return new Response(
      JSON.stringify({
        model: door.model,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify({
                verdict: faults.length ? 'fail' : 'pass',
                faults,
                seen: 'A business picture.',
                alt: 'An alt from this exact question'
              })
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.01 }
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
  const make = (over = {}) =>
    createLooker({
      door,
      prompt,
      storeDir: dir,
      runId: 'run',
      idx,
      alts: null,
      altAsk: { language: 'en', business: null, limit: () => 80 },
      fetchImpl,
      concurrency: 3,
      ...over
    })
  return {
    dir,
    idx,
    frames,
    make,
    calls: () => calls,
    doc: { frames, siteSettings: [], cost: {}, timing: {} },
    done: () => rm(dir, { recursive: true, force: true })
  }
}

test('identical rendered lettering failures share one paid look across moods and concurrent calls without sharing alts', async () => {
  const s = await setup(['stray lettering', 'subject cut off'], { delay: 50 })
  try {
    const result = await s.make().look(s.doc)
    assert.equal(s.calls(), 1)
    assert.equal(result.paid, 0.01)
    assert.equal(result.rule.status, 'fail')
    const paid = result.doc.looker.calls.filter((c) => !c.cached)
    const reused = result.doc.looker.calls.filter((c) => c.cacheSource)
    assert.equal(paid.length, 1)
    assert.equal(reused.length, 2)
    for (const c of reused) {
      assert.equal(c.costUsd, 0)
      assert.equal(c.ms, 0)
      assert.equal(c.cacheSource.policy, NEGATIVE_LOOK_POLICY)
      assert.match(c.cacheSource.lookKey, /^[a-f0-9]{64}$/)
      const entry = result.doc.frames.find((e) => e.frame === c.frame)
      assert.deepEqual(entry.looker.faults, ['stray lettering'])
      assert.equal(entry.alt, undefined)
    }
    assert.equal(result.doc.frames.filter((e) => e.alt).length, 1)
    // A new looker process can read the versioned proof; the original paid record remains unchanged.
    s.idx.wishes.set('f2', { match: 'any-real', mood: 'calm', avoid: [] })
    const resumed = await s.make().look({ ...s.doc, frames: [s.frames[2]] })
    assert.equal(s.calls(), 1)
    assert.equal(resumed.paid, 0)
    assert.equal(resumed.doc.frames[0].alt, undefined)
    assert.equal(resumed.doc.looker.calls[0].cacheSource.lookKey, reused[0].cacheSource.lookKey)
  } finally {
    await s.done()
  }
})

test('passes and subject-dependent failures never share verdicts across questions', async () => {
  for (const faults of [[], ['subject cut off'], ['face cut'], ['wrong subject'], ['forbidden item']]) {
    const s = await setup(faults)
    try {
      const result = await s.make().look(s.doc)
      assert.equal(s.calls(), 3, JSON.stringify(faults))
      assert.equal(
        result.doc.looker.calls.some((c) => c.cacheSource),
        false
      )
    } finally {
      await s.done()
    }
  }
})

test('changed pixels, display, surface, model and prompt require their own look', async () => {
  const s = await setup(['stray lettering'])
  try {
    await s.make().look({ ...s.doc, frames: [s.frames[0]] })
    s.idx.frames.set('f1', { width: 100, height: 100 })
    await s.make().look({ ...s.doc, frames: [s.frames[1]] })
    s.idx.frames.set('f1', { width: 120, height: 100, textOver: true })
    s.idx.wishes.set('f1', { match: 'any-real', mood: 'new', avoid: [] })
    await s.make().look({ ...s.doc, frames: [s.frames[1]] })
    await s.make({ prompt: { ...prompt, sha256: 'b'.repeat(64) } }).look({ ...s.doc, frames: [s.frames[0]] })
    await s.make({ door: { ...door, model: 'test/other' } }).look({ ...s.doc, frames: [s.frames[0]] })
    assert.equal(s.calls(), 5)
  } finally {
    await s.done()
  }
  const changed = await setup(['stray lettering'], { distinct: true })
  try {
    await changed.make().look(changed.doc)
    assert.equal(changed.calls(), 3)
  } finally {
    await changed.done()
  }
})

test('controlled provider delays report call, service and wall time separately for repeated versus distinct renders', async (t) => {
  const measurements = []
  for (const distinct of [false, true]) {
    const s = await setup(['stray lettering'], { distinct, delay: 60 })
    try {
      const started = performance.now()
      const result = await s.make({ concurrency: 1 }).look(s.doc)
      measurements.push({
        distinct,
        calls: s.calls(),
        wallMs: Math.round(performance.now() - started),
        serviceMs: result.doc.timing.looker,
        paidUsd: result.paid
      })
      assert.equal(s.calls(), distinct ? 3 : 1)
      assert.equal(result.paid, distinct ? 0.03 : 0.01)
    } finally {
      await s.done()
    }
  }
  t.diagnostic(JSON.stringify(measurements))
})

test('a missing original paid look invalidates its derived negative proof', async () => {
  const s = await setup(['stray lettering'])
  try {
    const first = await s.make().look(s.doc)
    const source = first.doc.looker.calls.find((c) => c.cacheSource).cacheSource.lookKey
    await unlink(path.join(s.dir, 'runs', 'run', 'looks', `${source}.json`))
    s.idx.wishes.set('f2', { match: 'any-real', mood: 'new question', avoid: [] })
    const next = await s.make().look({ ...s.doc, frames: [s.frames[2]] })
    assert.equal(s.calls(), 2)
    assert.equal(next.paid, 0.01)
    assert.equal(next.doc.looker.calls[0].cacheSource, undefined)
  } finally {
    await s.done()
  }
})

test('an exact historical lettering look seeds a versioned proof without rewriting its paid answer', async () => {
  const s = await setup(['stray lettering'])
  try {
    const first = await s.make().look({ ...s.doc, frames: [s.frames[0]] })
    assert.equal(first.paid, 0.01)
    await rm(path.join(s.dir, 'runs', 'run', 'negative-looks'), { recursive: true, force: true })
    const historical = await s.make().look({ ...s.doc, frames: [s.frames[0]] })
    assert.equal(historical.paid, 0)
    assert.equal(historical.doc.frames[0].alt, first.doc.frames[0].alt)
    const another = await s.make().look({ ...s.doc, frames: [s.frames[1]] })
    assert.equal(s.calls(), 1)
    assert.equal(another.paid, 0)
    assert.equal(another.doc.frames[0].alt, undefined)
    assert.equal(another.doc.looker.calls[0].cacheSource.policy, NEGATIVE_LOOK_POLICY)
  } finally {
    await s.done()
  }
})
