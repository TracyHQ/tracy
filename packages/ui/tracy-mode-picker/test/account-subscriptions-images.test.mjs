/**
 * Pictures on a Model Subscription route: the host reads each image reference through dsh's
 * attachment service and sends the bytes inline, within one request budget, to tracy-web.
 *
 * Plan: tasks/todo-subscription-images.md, steps B1-B4.
 *
 *   node --test packages/ui/tracy-mode-picker/test/account-subscriptions-images.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAccountSubscriptions } from '../src/host/account-subscriptions.mjs'

const MiB = 1024 * 1024

/** A durable image reference as dsh keeps it in history (synthetic, never a real picture). */
const ref = (/** @type {string} */ seed, name = `${seed}.png`) => ({
  attachmentId: `sha256:${seed.padEnd(64, '0')}`,
  name,
  mediaType: 'image/png',
  bytes: 4096,
  width: 3000,
  height: 2000
})
const image = (/** @type {any} */ attachment, offloaded = false) => ({
  type: 'image',
  attachment,
  ...(offloaded ? { offloaded: true } : {})
})

/**
 * A fake attachment store. `sizeOf(ref, edge)` decides how many bytes the request version at that
 * long edge has; every read is recorded.
 * @param {(ref: any, edge: number) => number} sizeOf
 */
function attachmentStore(sizeOf = () => 3) {
  /** @type {{ id: string, target: any }[]} */
  const reads = []
  return {
    reads,
    async readImageRequest(/** @type {any} */ r, /** @type {any} */ target, /** @type {any} */ signal) {
      signal?.throwIfAborted()
      reads.push({ id: r.attachmentId, target })
      const bytes = sizeOf(r, target.width)
      return {
        variantId: `${r.attachmentId}:${target.width}`,
        attachment: r,
        data: new Uint8Array(bytes).fill(7),
        mediaType: 'image/jpeg',
        bytes,
        width: target.width,
        height: Math.round((target.width * 2) / 3),
        depth: 'uchar',
        space: 'srgb',
        hasAlpha: false
      }
    }
  }
}

/** One finished turn from tracy-web. */
const finished = () =>
  new Response(JSON.stringify({ chunk: { type: 'finish', reason: { kind: 'stop' } } }) + '\n')

/**
 * The adapter over a fake host: one session `s1` on site `demo`, `attachments` as given, and
 * tracy-web's doors answered by `broker`.
 * @param {any} t
 * @param {{ attachments?: any, broker?: (call: any) => Response | Promise<Response>, llm?: any }} [options]
 */
function harness(t, { attachments, broker = () => finished(), llm } = {}) {
  /** @type {any} */
  let adapter
  /** @type {any[]} */
  const calls = []
  const session = {
    id: 's1',
    header: { cwd: '/site/demo' },
    snapshotEvents: () => [
      { type: 'user/message', data: { source: { kind: 'user', prompter: { email: 'a@test' } } } }
    ]
  }
  const runtime = {
    registerAdapter: (/** @type {any} */ _routes, /** @type {any} */ value) => {
      adapter = value
      const handle = () => {}
      handle.replace = () => {}
      return handle
    },
    ...llm
  }
  /** @type {any} */
  const ctx = {
    get: (/** @type {string} */ name) =>
      name === 'sessions'
        ? { get: () => session }
        : name === 'tracyAssertion'
          ? { mint: (/** @type {string} */ e) => e }
          : name === 'attachments'
            ? attachments
            : name === 'llm'
              ? runtime
              : undefined,
    on: () => {},
    inject: (/** @type {any} */ _names, /** @type {any} */ fn) => fn(ctx),
    effect: (/** @type {any} */ fn) => fn()
  }
  const priorFetch = globalThis.fetch
  const priorOrigin = process.env.MCP_TRACY_ORIGIN
  process.env.MCP_TRACY_ORIGIN = 'http://broker.test'
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorOrigin === undefined) delete process.env.MCP_TRACY_ORIGIN
    else process.env.MCP_TRACY_ORIGIN = priorOrigin
  })
  globalThis.fetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
    const call = { path: new URL(String(url)).pathname, body: JSON.parse(init.body) }
    calls.push(call)
    return broker(call)
  }
  const policy = createAccountSubscriptions(ctx, () => ({
    provider: 'tracy-default',
    model: 'deployment-model'
  }))
  return { adapter, policy, calls, session }
}

const turn = (/** @type {any[]} */ messages) => ({
  sessionId: 's1',
  provider: 'seat-plan-claude',
  model: 'claude-sonnet-5',
  messages
})

/** Every block of the request sent to tracy-web's `run` door. */
const sentBlocks = (/** @type {any} */ call) =>
  call.body.request.messages.flatMap((/** @type {any} */ m) => (Array.isArray(m.content) ? m.content : []))

test('a pasted picture reaches tracy-web as base64 bytes, never as a store reference', async (t) => {
  const store = attachmentStore(() => 5)
  const { adapter, calls } = harness(t, { attachments: store })
  const pasted = ref('aa')
  const options = turn([
    { role: 'user', content: [{ type: 'text', text: 'what is in this?' }, image(pasted)] }
  ])
  await Array.fromAsync(adapter.stream(options))
  const run = calls.find((c) => c.path === '/internal/seat-plan/run')
  const blocks = sentBlocks(run)
  assert.equal(JSON.stringify(run.body).includes('"attachment"'), false, 'no store reference is sent')
  assert.deepEqual(blocks[0], { type: 'text', text: 'what is in this?' })
  assert.equal(blocks[1].type, 'text')
  assert.match(blocks[1].text, /^Image "aa\.png" \(sha256:aa0+\); request preview 2048x1365px\./)
  assert.deepEqual(blocks[2], {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: Buffer.from([7, 7, 7, 7, 7]).toString('base64')
    }
  })
  assert.deepEqual(store.reads, [
    { id: pasted.attachmentId, target: { width: 2048, height: 2048, maxBytes: MiB } }
  ])
  // The caller's request is left as it came: the inline copy lives only in this send.
  assert.deepEqual(options.messages[0].content[1], image(pasted))
})

test('a tool result picture (page.look) is sent inline too, in its place', async (t) => {
  const { adapter, calls } = harness(t, { attachments: attachmentStore() })
  const shot = ref('bb', 'page.jpg')
  await Array.fromAsync(
    adapter.stream(
      turn([
        { role: 'user', content: [{ type: 'text', text: 'look at the page' }] },
        { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'page.look', input: {} }] },
        { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'shot:' }, image(shot)] }
      ])
    )
  )
  const tool = calls.at(-1).body.request.messages[2]
  assert.equal(tool.role, 'tool')
  assert.equal(tool.toolCallId, 'c1')
  assert.deepEqual(
    tool.content.map((/** @type {any} */ b) => b.type),
    ['text', 'text', 'image']
  )
  assert.equal(tool.content[2].source.type, 'base64')
})

test('25 pictures over 8 MiB of base64 ask dsh to offload the oldest; the retry sends the rest without reading the offloaded', async (t) => {
  // 384 KiB each is exactly 512 KiB of base64: 8 MiB holds 16, so 9 of 25 must go.
  const store = attachmentStore(() => 384 * 1024)
  const { adapter, calls } = harness(t, { attachments: store })
  const refs = Array.from({ length: 25 }, (_, i) => ref(`c${String(i).padStart(2, '0')}`))
  const history = refs.map((r) => ({ role: 'user', content: [image(r)] }))
  await assert.rejects(Array.fromAsync(adapter.stream(turn(history))), (/** @type {any} */ error) => {
    assert.equal(error.code, 'IMAGE_OFFLOAD_REQUIRED')
    assert.equal(error.failure.offloadImages, 9)
    return true
  })
  assert.equal(calls.length, 0, 'nothing is sent over budget')
  // dsh's compaction-image-offload marks the oldest nine and runs the step again.
  store.reads.length = 0
  const retried = history.map((m, i) => (i < 9 ? { ...m, content: [image(refs[i], true)] } : m))
  await Array.fromAsync(adapter.stream(turn(retried)))
  const read = new Set(store.reads.map((r) => r.id))
  assert.equal(read.size, 16)
  for (const r of refs.slice(0, 9))
    assert.equal(read.has(r.attachmentId), false, 'an offloaded picture is never read')
  const blocks = sentBlocks(calls[0])
  assert.equal(blocks.filter((b) => b.type === 'image').length, 16)
  const notes = blocks.filter(
    (b) => b.type === 'text' && b.text.startsWith('[image omitted to fit request image limits;')
  )
  assert.equal(notes.length, 9, 'one placeholder per offloaded picture')
})

test('the same picture twice is read once and counted twice', async (t) => {
  const store = attachmentStore(() => 10)
  const { adapter, calls } = harness(t, { attachments: store })
  const same = ref('dd')
  const twice = turn([
    { role: 'user', content: [image(same)] },
    { role: 'user', content: [image(same)] }
  ])
  await Array.fromAsync(adapter.stream(twice))
  assert.equal(store.reads.length, 1)
  assert.equal(sentBlocks(calls[0]).filter((b) => b.type === 'image').length, 2)
  // 21 occurrences of one picture are 21 pictures to the vendor: one over the count budget.
  const many = turn(Array.from({ length: 21 }, () => ({ role: 'user', content: [image(same)] })))
  await assert.rejects(Array.fromAsync(adapter.stream(many)), (/** @type {any} */ error) => {
    assert.equal(error.code, 'IMAGE_OFFLOAD_REQUIRED')
    assert.equal(error.failure.offloadImages, 1)
    return true
  })
})

test('a picture still above 1 MiB after compression is asked again smaller: 1536, then 1024', async (t) => {
  const sizes = /** @type {Record<number, number>} */ ({ 2048: 2 * MiB, 1536: MiB + 1, 1024: 900 * 1024 })
  const store = attachmentStore((_r, edge) => sizes[edge])
  const { adapter, calls } = harness(t, { attachments: store })
  await Array.fromAsync(adapter.stream(turn([{ role: 'user', content: [image(ref('ee'))] }])))
  assert.deepEqual(
    store.reads.map((r) => r.target),
    [2048, 1536, 1024].map((edge) => ({ width: edge, height: edge, maxBytes: MiB }))
  )
  const blocks = sentBlocks(calls[0])
  assert.match(blocks[0].text, /request preview 1024x683px/)
  assert.equal(Buffer.from(blocks[1].source.data, 'base64').length, 900 * 1024)

  // One that fits at 1536 stops there; one too big even at 1024 is kept at 1024, and no smaller.
  const fits = attachmentStore((_r, edge) => (edge === 2048 ? 2 * MiB : 10))
  const second = harness(t, { attachments: fits })
  await Array.fromAsync(second.adapter.stream(turn([{ role: 'user', content: [image(ref('ef'))] }])))
  assert.deepEqual(
    fits.reads.map((r) => r.target.width),
    [2048, 1536]
  )
  const huge = attachmentStore(() => 3 * MiB)
  const third = harness(t, { attachments: huge })
  await Array.fromAsync(third.adapter.stream(turn([{ role: 'user', content: [image(ref('eg'))] }])))
  assert.deepEqual(
    huge.reads.map((r) => r.target.width),
    [2048, 1536, 1024]
  )
})

test('a fallback to the deployment default re-sends the original store references, not the inline copy', async (t) => {
  /** @type {any[]} */
  const streamed = []
  const { adapter, calls } = harness(t, {
    attachments: attachmentStore(),
    broker: () =>
      new Response(
        JSON.stringify({ fallback: true, route: { provider: 'seat-plan-tracy', switchedFrom: null } }) + '\n'
      ),
    llm: {
      async *stream(/** @type {any} */ options) {
        streamed.push(options)
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
  })
  const pasted = ref('ff')
  const options = turn([{ role: 'user', content: [{ type: 'text', text: 'hi' }, image(pasted)] }])
  await Array.fromAsync(adapter.stream(options))
  assert.equal(sentBlocks(calls[0])[2].source.type, 'base64', 'tracy-web got the bytes')
  assert.equal(streamed.length, 1)
  assert.equal(streamed[0].provider, 'tracy-default')
  assert.deepEqual(streamed[0].messages.slice(0, -1), options.messages)
  assert.match(streamed[0].messages.at(-1).content[0].text, /Trusted runtime model context/)
  assert.deepEqual(streamed[0].messages[0].content[1], image(pasted))
})

test('a lost picture of this turn fails as ATTACHMENT_MISSING; one lost earlier becomes a note', async (t) => {
  const gone = ref('99')
  const store = {
    reads: /** @type {string[]} */ ([]),
    async readImageRequest(/** @type {any} */ r, /** @type {any} */ target) {
      if (r.attachmentId === gone.attachmentId) {
        throw Object.assign(new Error('not found'), { code: 'ATTACHMENT_NOT_FOUND' })
      }
      return attachmentStore().readImageRequest(r, target, undefined)
    }
  }
  const { adapter, calls } = harness(t, { attachments: store })
  await assert.rejects(Array.fromAsync(adapter.stream(turn([{ role: 'user', content: [image(gone)] }]))), {
    code: 'ATTACHMENT_MISSING'
  })
  await Array.fromAsync(
    adapter.stream(
      turn([
        { role: 'user', content: [image(gone)] },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
        { role: 'user', content: [{ type: 'text', text: 'and now?' }, image(ref('98'))] }
      ])
    )
  )
  const blocks = sentBlocks(calls[0])
  assert.match(blocks[0].text, /^\[image unavailable;/)
  assert.equal(blocks.filter((b) => b.type === 'image').length, 1)
})

test('the same history builds the same request twice: no placeholder piles up across retries', async (t) => {
  const { adapter, calls } = harness(t, { attachments: attachmentStore() })
  const history = turn([
    { role: 'user', content: [image(ref('a1'), true)] },
    { role: 'user', content: [image(ref('a2'))] }
  ])
  await Array.fromAsync(adapter.stream(history))
  await Array.fromAsync(adapter.stream(history))
  assert.deepEqual(calls[0].body, calls[1].body)
  assert.equal(history.messages[0].content.length, 1, 'history is not written to')
})

test('a request without pictures goes as it came', async (t) => {
  const { adapter, calls } = harness(t, { attachments: undefined })
  const options = turn([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])
  await Array.fromAsync(adapter.stream(options))
  assert.deepEqual(calls[0].body.request.messages, options.messages)
})
