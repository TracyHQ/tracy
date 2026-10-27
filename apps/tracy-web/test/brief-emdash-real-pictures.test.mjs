/**
 * EmDash follows the WordPress and Joomla rule for a site an opportunity built (`described && !real`): the restaurant's
 * own photographs exist, so the template tool draws no picture — never invented dishes or rooms beside a real
 * restaurant's name. A site without them draws as before. The tool runner and the photographs' reader are doubles.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { createEmdashEngine } from '../src/sites/brief-engines/emdash.js'

const roots = []
after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true })
})

const textDoor = { apiKey: 'sk-secret-text', baseUrl: 'https://api.deepseek.com', words: 'deepseek-flash' }
const openrouter = {
  url: 'https://openrouter.ai/api/v1/chat/completions',
  key: 'sk-or-secret',
  imageModel: 'google/gemini-3.1-flash-lite-image'
}

function context(brief = { about: 'Pho Linden. A family pho shop on River street since 1981.' }) {
  const notes = []
  return {
    notes,
    ctx: {
      siteKey: 'pho-thin.tracy.test',
      label: 'pho-thin',
      platform: 'emdash',
      quickstart: 'tracy-business/emdash-0.x',
      contract: null,
      email: 'owner@example.com',
      brief,
      normalized: {
        name: 'Pho Linden',
        about: 'Pho Linden is a family pho shop in Hanoi.',
        languages: ['en']
      },
      signal: new AbortController().signal,
      time: () => {},
      note: (n) => notes.push(n),
      deadlineAt: Date.now() + 60_000
    }
  }
}

/** A runner that records each call: the warm-up, then the real run, which reports a clean write. */
function fakeRun() {
  const calls = []
  const run = async (call) => {
    calls.push(call)
    if (call.env.TRACY_FETCH_MODE === 'record')
      return { code: 0, stdout: '', stderr: 'fetch-cache record: hits=0 misses=0 kept=12', killed: false }
    const report = {
      written: [],
      errors: [],
      copy: { done: [], skipped: [] },
      pictures: { done: 0, skipped: [] }
    }
    return { code: 0, stdout: JSON.stringify(report), stderr: '', killed: false }
  }
  return { run, calls }
}

/** @param {{forSite: Function} | null} realPictures */
function make(realPictures) {
  const workRoot = mkdtempSync(path.join(tmpdir(), 'engine-real-'))
  roots.push(workRoot)
  const runner = fakeRun()
  const engine = createEmdashEngine({
    models: async () => ({ textDoor, image: openrouter }),
    siteAccess: async () => ({
      origin: 'http://pho-thin-web-1:4321',
      token: 'ec_pat_realtoken00000000000000000000'
    }),
    realPictures,
    run: runner.run,
    workRoot,
    fetchImpl: async () =>
      new Response('{"data":{"items":[]}}', { headers: { 'content-type': 'application/json' } }),
    log: { info() {}, warn() {} }
  })
  return { engine, runner }
}

/** A reader of the restaurant's photographs that answers `answer` and records who asked. */
function reader(answer) {
  const asked = []
  return {
    asked,
    forSite: async (who) => {
      asked.push(who)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

const drawn = (call) => !call.args.includes('--no-images') && call.env.OPENROUTER_API_KEY === openrouter.key

test('an opportunity-built EmDash site with the restaurant’s own photographs draws no picture, in the warm-up nor on the site', async () => {
  const photos = reader({ buildId: 'b1', pictures: [{ id: 'p1', sha256: 'a'.repeat(64) }] })
  const { engine, runner } = make(photos)
  const { ctx, notes } = context()
  const prepared = await engine.prepare(ctx)
  assert.deepEqual(photos.asked, [{ siteKey: 'pho-thin.tracy.test', email: 'owner@example.com' }])
  assert.equal(prepared.imageDoor, null)
  await engine.apply(ctx, prepared)
  assert.equal(runner.calls.length, 2)
  for (const call of runner.calls) {
    assert.ok(call.args.includes('--no-images'), 'the tool is told to draw nothing')
    assert.equal(call.env.OPENROUTER_API_KEY, undefined, 'and is never handed the picture model')
    assert.equal(call.env.TRACY_SEED_IMAGE_MODEL, undefined)
  }
  assert.ok(
    notes.some((n) => /photographs of its own/.test(n)),
    notes.join(' | ')
  )
  await engine.dispose(prepared)
})

test('a site with no photographs of its own — none collected, not an opportunity’s, or a reader that fails — draws as before', async () => {
  for (const realPictures of [
    reader(null),
    reader({ buildId: 'b2', pictures: [] }),
    reader(new Error('database gone')),
    null
  ]) {
    const { engine, runner } = make(realPictures)
    const { ctx, notes } = context()
    const prepared = await engine.prepare(ctx)
    assert.equal(prepared.imageDoor, openrouter)
    await engine.apply(ctx, prepared)
    assert.ok(runner.calls.every(drawn), 'the tool draws through the picture model')
    assert.ok(!notes.some((n) => /photographs of its own/.test(n)), notes.join(' | '))
    await engine.dispose(prepared)
  }
})

test('About left blank draws nothing either way, and the photographs are not read for it', async () => {
  const photos = reader({ buildId: 'b3', pictures: [{ id: 'p1', sha256: 'b'.repeat(64) }] })
  const { engine, runner } = make(photos)
  const { ctx } = context({})
  const prepared = await engine.prepare(ctx)
  assert.equal(prepared.imageDoor, null)
  assert.equal(photos.asked.length, 0)
  assert.ok(runner.calls[0].args.includes('--no-images'))
  await engine.dispose(prepared)
})
