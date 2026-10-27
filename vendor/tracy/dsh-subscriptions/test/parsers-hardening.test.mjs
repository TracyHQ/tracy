import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { openaiChatStream } from '../lib/wire.js'
import { getVendor } from '../lib/vendors/index.js'

// #302: parser fuzz-lite. Malformed upstream streams must degrade to a
// clean (possibly empty) chunk sequence ending in finish - never an
// unhandled throw mid-stream.

const NL = String.fromCharCode(10)
const frame = (s) => 'data: ' + s + NL + NL

async function collect(body) {
  const chunks = []
  for await (const c of openaiChatStream(body)) chunks.push(c)
  return chunks
}

test('openaiChatStream survives truncated json, garbage and empty frames', async () => {
  const raw = frame('{"choices":[{"delta":{"content":"ok"')
    + frame('not json at all')
    + frame('')
    + NL + NL
    + frame('{"choices":[{"delta":{"content":"end"}}]}')
    + 'data: [DONE]' + NL + NL
  const chunks = await collect(new Response(raw, { status: 200 }).body)
  assert.equal(chunks[chunks.length - 1].type, 'finish')
  // A corrupted frame is dropped whole (the partial text inside it is gone);
  // the stream itself must survive and keep the valid tail.
  const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
  assert.equal(text, 'end')
})

test('openaiChatStream handles a giant frame without choking', async () => {
  const big = JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(1024 * 1024) } }] })
  const chunks = await collect(new Response(frame(big), { status: 200 }).body)
  const total = chunks.filter((c) => c.type === 'text-delta').reduce((a, c) => a + c.text.length, 0)
  assert.equal(total, 1024 * 1024)
  assert.equal(chunks[chunks.length - 1].type, 'finish')
})

test('openaiChatStream tolerates null choices and missing fields', async () => {
  const raw = frame('{"choices":null}')
    + frame('{}')
    + frame('{"choices":[{}]}')
    + frame('{"choices":[{"delta":null,"finish_reason":"stop"}]}')
    + 'data: [DONE]' + NL + NL
  const chunks = await collect(new Response(raw, { status: 200 }).body)
  assert.equal(chunks[chunks.length - 1].type, 'finish')
})

test('openaiChatStream ends with finish even when upstream never sends DONE', async () => {
  const chunks = await collect(new Response(frame('{"choices":[{"delta":{"content":"a"}}]}'), { status: 200 }).body)
  assert.equal(chunks[chunks.length - 1].type, 'finish')
})

const VENDOR_IDS = [
  'codex', 'claude', 'grok', 'antigravity', 'kimi', 'glm', 'cursor', 'kiro',
  'copilot', 'qwen', 'ernie', 'spark', 'jetbrains', 'perplexity', 'replit', 'cody',
]

test('every vendor forwards the caller AbortSignal to its fetch', async () => {
  const controller = new AbortController()
  for (const id of VENDOR_IDS) {
    const seen = []
    const fetchImpl = async (url, init) => {
      seen.push(init && init.signal)
      const err = new Error('aborted-by-test')
      err.name = 'AbortError'
      throw err
    }
    try {
      for await (const _ of getVendor(id).streamOnce({
        blob: { accessToken: 't', refreshToken: 'r', apiKey: 'k', secretKey: 's', token: 't' },
        options: { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
        fetchImpl,
        headers: {},
        config: {},
        signal: controller.signal,
      })) { /* consume */ }
    } catch {
      // auth/refresh errors before the fetch are acceptable only if no fetch happened
      if (seen.length === 0) continue
    }
    assert.ok(seen.length > 0, id + ' performed a fetch')
    assert.ok(seen[0] instanceof AbortSignal, id + ' must forward the AbortSignal to fetch')
  }
})

test('every error code in lib belongs to the known inventory', () => {
  const KNOWN = new Set([
    'AUTH', 'RATE_LIMIT', 'QUOTA', 'VENDOR', 'LICENSE_REQUIRED', 'VALIDATION_REQUIRED',
    'INTERNAL_ERROR', 'EXHAUSTED', 'TIMEOUT', 'ABORTED', 'METHOD', 'FORBIDDEN',
    'JSON', 'PARAMS', 'PASSPHRASE', 'DECRYPT', 'FORMAT', 'TOKEN', 'EMPTY',
    'LOGOUT', 'RESET', 'CHECK', 'PROXY', 'PROXY_FAIL', 'NOT_CONFIGURED', 'PROVIDER',
  ])
  const offenders = []
  for (const f of readdirSyncLib()) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/new LlmError\([^,]*,\s*['"]([^'"]+)['"]/g)) {
      if (!KNOWN.has(m[1])) offenders.push(f + ' -> LlmError ' + m[1])
    }
    for (const m of src.matchAll(/err\.code\s*=\s*['"]([A-Z_]+)['"]/g)) {
      if (!KNOWN.has(m[1])) offenders.push(f + ' -> code ' + m[1])
    }
  }
  assert.deepEqual(offenders, [], 'unknown error codes: ' + offenders.join(', ') + ' - extend the inventory in this test')
})

function readdirSyncLib() {
  const out = []
  for (const e of readdirSync(new URL('../lib', import.meta.url).pathname, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.js')) out.push(new URL('../lib/' + e.name, import.meta.url).pathname)
    if (e.isDirectory()) {
      for (const f of readdirSync(new URL('../lib/' + e.name, import.meta.url).pathname)) {
        if (f.endsWith('.js')) out.push(new URL('../lib/' + e.name + '/' + f, import.meta.url).pathname)
      }
    }
  }
  return out
}
