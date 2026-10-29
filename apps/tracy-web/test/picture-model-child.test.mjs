import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { runNode } from '../src/lib/emdash-tool.js'
import { createEnginePictureClock } from '../src/sites/engine-picture-clock.js'

const cachePreload = new URL('../src/sites/brief-engines/emdash-preload.mjs', import.meta.url).href
const door = 'https://model.example/chat/completions'

async function harness(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'picture-child-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fake = path.join(dir, 'provider.mjs')
  await writeFile(
    fake,
    `globalThis.fetch = async () => {
      if (process.env.FAIL_CALL) throw new Error('provider refused');
      return new Response(new ReadableStream({ async start(controller) {
        await new Promise(resolve => setTimeout(resolve, Number(process.env.BODY_DELAY ?? 60)));
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      }}), {headers:{'content-type':'application/json'}});
    };`
  )
  return {
    dir,
    call: (body, extra = {}) =>
      runNode({
        env: { NODE_OPTIONS: `--import=${pathToFileURL(fake).href}`, ...extra.env },
        args: [
          ...(extra.preload ? ['--import', extra.preload] : []),
          '--input-type=module',
          '-e',
          `try { const r = await fetch(${JSON.stringify(door)}, {
            method: 'POST', body: ${JSON.stringify(JSON.stringify(body))}
          }); console.log(await r.text()); } catch { process.exitCode = 1; }`
        ],
        signal: extra.signal,
        timeoutMs: extra.timeoutMs ?? 4000
      })
  }
}

for (const trade of ['Cedar Bakery', 'Willow Dental']) {
  test(`${trade}: child drawing and vision consume the apply picture clock through body completion`, async (t) => {
    const h = await harness(t)
    const clock = createEnginePictureClock()
    t.after(() => clock.close())
    await clock.run(async () => {
      clock.startApply()
      const draw = await h.call({ model: 'drawing', modalities: ['image'], prompt: trade })
      const vision = await h.call({
        model: 'vision',
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] }
        ]
      })
      assert.equal(draw.code, 0)
      assert.equal(vision.code, 0)
      clock.endApply()
    })
    const report = clock.report()
    assert.equal(report.pictureCallsDuringApply, 2)
    assert.ok(report.drawingDuringApplyMs >= 40)
    assert.ok(report.visionDuringApplyMs >= 40)
    assert.equal(report.findings[0].severity, 'error')
  })
}

test('failed provider calls and killed active children are reported without provider content', async (t) => {
  const h = await harness(t)
  const clock = createEnginePictureClock()
  t.after(() => clock.close())
  await clock.run(async () => {
    clock.startApply()
    const failed = await h.call({ model: 'drawing', modalities: ['image'] }, { env: { FAIL_CALL: '1' } })
    assert.equal(failed.code, 1)
    clock.endApply()
  })
  assert.equal(clock.report().pictureCallsDuringApply, 1)

  const abort = new AbortController()
  const active = createEnginePictureClock({ onViolation: () => setTimeout(() => abort.abort(), 10) })
  t.after(() => active.close())
  await active.run(async () => {
    active.startApply()
    const killed = await h.call({ model: 'drawing', modalities: ['image'] }, { signal: abort.signal })
    active.endApply()
    assert.equal(killed.killed, true)
    assert.equal(killed.stderr, '')
  })
  assert.equal(active.report().pictureCallsDuringApply, 1)
  assert.ok(active.report().drawingDuringApplyMs > 0)
})

test('a real cache replay, text model calls and media uploads do not count as picture requests', async (t) => {
  const h = await harness(t)
  const clock = createEnginePictureClock()
  t.after(() => clock.close())
  const body = { model: 'drawing', modalities: ['image'] }
  const cache = path.join(h.dir, 'cache.jsonl')
  const key = createHash('sha256')
    .update(`${door}\n${JSON.stringify(body)}`)
    .digest('hex')
  await writeFile(cache, `${JSON.stringify({ key, status: 200, text: '{"cached":true}' })}\n`)
  await clock.run(async () => {
    clock.startApply()
    const replay = await h.call(body, {
      preload: cachePreload,
      env: { TRACY_FETCH_MODE: 'replay', TRACY_FETCH_CACHE: cache, TRACY_FETCH_SITE: 'https://site.example' }
    })
    assert.match(replay.stdout, /cached/)
    assert.match(replay.stderr, /hits=1/)
    await h.call({ model: 'words', messages: [{ role: 'user', content: 'Cedar Bakery' }] })
    await h.call({ images: ['file.png'], filename: 'picture.png' })
    clock.endApply()
  })
  assert.equal(clock.report().pictureCallsDuringApply, 0)
})

test('a child timeout preserves the active picture request in the receipt', async (t) => {
  const h = await harness(t)
  const clock = createEnginePictureClock()
  t.after(() => clock.close())
  await clock.run(async () => {
    clock.startApply()
    const result = await h.call(
      { model: 'drawing', modalities: ['image'] },
      { env: { BODY_DELAY: '10000' }, timeoutMs: 600 }
    )
    clock.endApply()
    assert.equal(result.killed, true)
    assert.equal(result.stderr, '')
  })
  assert.equal(clock.report().pictureCallsDuringApply, 1)
  assert.ok(clock.report().drawingDuringApplyMs > 0)
})

test('parallel child model calls stay in their own build scope', async (t) => {
  const h = await harness(t)
  const drawing = createEnginePictureClock()
  const vision = createEnginePictureClock()
  t.after(() => {
    drawing.close()
    vision.close()
  })
  drawing.startApply()
  vision.startApply()
  await Promise.all([
    drawing.run(() => h.call({ model: 'drawing', modalities: ['image'] })),
    vision.run(() =>
      h.call({
        model: 'vision',
        input: [{ content: [{ type: 'input_image', image_url: 'data:image/png;base64,eA==' }] }]
      })
    )
  ])
  drawing.endApply()
  vision.endApply()
  assert.equal(drawing.report().pictureCallsDuringApply, 1)
  assert.equal(vision.report().pictureCallsDuringApply, 1)
  assert.equal(drawing.report().visionDuringApplyMs, 0)
  assert.equal(vision.report().drawingDuringApplyMs, 0)
})
