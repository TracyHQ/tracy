/** WO identity chooses deterministic setup before model configuration, even without sourced posts. */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createEmdashEngine } from '../src/sites/brief-engines/emdash.js'

const roots = []
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

function fixture({
  opportunity = true,
  lookupError,
  sourceError,
  copyError,
  copyData = null,
  refusePosts = false,
  result = {},
  content = null
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'wo-mode-'))
  roots.push(root)
  const calls = []
  const notes = []
  const locales = []
  let modelReads = 0
  const engine = createEmdashEngine({
    workRoot: root,
    models: async () => {
      modelReads++
      assert.equal(opportunity, false, 'WO must not even load model credentials')
      return {
        textDoor: { baseUrl: 'http://model.invalid/v1', apiKey: 'test-key', words: 'test-model' },
        image: { url: 'https://openrouter.ai/api/v1', key: 'test-image-key', imageModel: 'test-image' }
      }
    },
    woContent: {
      async isOpportunity(who) {
        assert.deepEqual(who, { siteKey: 'pho.tracy.test', email: 'owner@example.test' })
        if (lookupError) throw lookupError
        return opportunity
      },
      async forSite() {
        if (sourceError) throw sourceError
        return content
      },
      async copyFor() {
        if (copyError) throw copyError
        return copyData
      },
      async recordBefore() {
        return {}
      },
      async recordWrite() {}
    },
    siteAccess: async () => ({ origin: 'http://pho-web-1:4321', token: 'ec_pat_test00000000000000000000' }),
    displayLocale: async (...args) => locales.push(args),
    run: async (call) => {
      calls.push(call)
      return {
        code: 0,
        killed: false,
        stderr: '',
        stdout: JSON.stringify({
          written: [{ entry: 'site/site/en' }],
          errors: [],
          copy: { done: [], skipped: [] },
          displayLocale: { en: 'vi-VN' }
        }),
        ...result
      }
    },
    fetchImpl: async () => new Response(JSON.stringify({ items: [] }), { status: refusePosts ? 500 : 200 }),
    log: { info() {}, warn() {} }
  })
  const ctx = {
    siteKey: 'pho.tracy.test',
    email: 'owner@example.test',
    label: 'pho',
    quickstart: 'tracy-base/emdash-0.x',
    brief: { about: 'A restaurant in Hoi An.', goal: null, style: null },
    normalized: { name: 'Pho House', email: 'contact@example.test', languages: ['vi'] },
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 60_000,
    note: (note) => notes.push(note),
    time() {}
  }
  return { engine, ctx, root, calls, notes, locales, modelReads: () => modelReads }
}

for (const content of [null, { buildId: 'build-1', items: [{ id: 'post-1' }], pagePlan: { pages: [] } }]) {
  test(`WO ${content ? 'with posts' : 'without posts'} skips warm-up and all generic model configuration`, async () => {
    const f = fixture({ content })
    const prepared = await f.engine.prepare(f.ctx)
    try {
      assert.equal(f.modelReads(), 0)
      assert.equal(f.calls.length, 0)
      assert.equal(prepared.isOpportunity, true)
      await f.engine.apply(f.ctx, prepared)
      assert.equal(f.calls.length, 1)
      assert.ok(f.calls[0].args.includes('--no-model'))
      assert.ok(f.calls[0].args.includes('--no-images'))
      assert.equal(f.calls[0].env.TRACY_MODEL_KEY, undefined)
      assert.equal(f.calls[0].env.OPENROUTER_API_KEY, undefined)
      assert.equal(f.calls[0].env.TRACY_FETCH_MODE, undefined)
      assert.deepEqual(f.locales, [['pho.tracy.test', { en: 'vi-VN' }]])
      assert.ok(f.notes.some((note) => note.includes('sourced content')))
      assert.ok(!f.notes.some((note) => note.includes('no text model is set')))
    } finally {
      await f.engine.dispose(prepared)
    }
  })
}

test('an ordinary site retains model warm-up, replay and image configuration', async () => {
  const f = fixture({ opportunity: false })
  const prepared = await f.engine.prepare(f.ctx)
  try {
    await f.engine.apply(f.ctx, prepared)
    assert.equal(f.modelReads(), 1)
    assert.equal(f.calls.length, 2)
    assert.equal(f.calls[0].env.TRACY_FETCH_MODE, 'record')
    assert.equal(f.calls[1].env.TRACY_FETCH_MODE, 'replay')
    assert.ok(!f.calls[1].args.includes('--no-model'))
    assert.ok(!f.calls[1].args.includes('--no-images'))
    assert.equal(f.calls[1].env.TRACY_MODEL_KEY, 'test-key')
  } finally {
    await f.engine.dispose(prepared)
  }
})

test('an unreadable WO identity fails before models, tools or temporary credential files', async () => {
  const f = fixture({ lookupError: new Error('identity database unavailable') })
  await assert.rejects(f.engine.prepare(f.ctx), /identity database unavailable/)
  assert.equal(f.modelReads(), 0)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(readdirSync(f.root), [])
})

for (const kind of ['sourceError', 'copyError']) {
  test(`WO ${kind} cannot be mistaken for missing source content`, async () => {
    const f = fixture({ [kind]: new Error('source database unavailable') })
    await assert.rejects(f.engine.prepare(f.ctx), /source database unavailable/)
    assert.equal(f.modelReads(), 0)
    assert.equal(f.calls.length, 0)
    assert.deepEqual(readdirSync(f.root), [])
  })
}

test('WO copy skipped without a write error can continue to the agent', async () => {
  const f = fixture({ result: { code: 3 } })
  const prepared = await f.engine.prepare(f.ctx)
  try {
    await f.engine.apply(f.ctx, prepared)
    assert.equal(f.calls.length, 1)
  } finally {
    await f.engine.dispose(prepared)
  }
})

test('WO sourced posts refused by the site fail the fill instead of continuing to handoff', async () => {
  const f = fixture({
    refusePosts: true,
    content: {
      buildId: 'build-1',
      items: [{ id: 'post-1', title: 'Pho', body: 'Our broth.' }],
      pagePlan: { pages: [{ id: 'blog', role: 'blog', keep: true, fill: 'sourced', items: ['post-1'] }] }
    }
  })
  const prepared = await f.engine.prepare(f.ctx)
  try {
    await assert.rejects(f.engine.apply(f.ctx, prepared), /sourced posts could not be written/)
  } finally {
    await f.engine.dispose(prepared)
  }
})

test('WO sourced slot writes refused by the site fail the fill instead of continuing to handoff', async () => {
  const f = fixture({
    refusePosts: true,
    copyData: {
      buildId: 'build-1',
      pinned: { 'hero.title': { value: 'Pho House', source: 'business.name' } },
      before: {},
      writes: {}
    }
  })
  const prepared = await f.engine.prepare(f.ctx)
  try {
    await assert.rejects(f.engine.apply(f.ctx, prepared), /sourced words could not be written/)
  } finally {
    await f.engine.dispose(prepared)
  }
})

for (const result of [
  { killed: true },
  { stdout: 'not a report' },
  { code: 4, stdout: JSON.stringify({ written: [], errors: [{ why: 'write refused' }] }) },
  { code: 1, stdout: JSON.stringify({ written: [], errors: [] }) }
]) {
  test(`WO setup refuses incomplete tool work: ${JSON.stringify(result)}`, async () => {
    const f = fixture({ result })
    const prepared = await f.engine.prepare(f.ctx)
    try {
      await assert.rejects(f.engine.apply(f.ctx, prepared))
    } finally {
      await f.engine.dispose(prepared)
    }
  })
}
