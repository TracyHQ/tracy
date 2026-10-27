import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import {
  writeJson, writeHtml, readBody, isTrustedSettingsRequest, queryOf,
  fetchWithTimeout, safeJsonHandler, escapeHtml,
} from '../lib/http.js'
import { codexBody, grokBody, SIZES, CODEX_MODEL, GROK_MODEL } from '../lib/images.js'

function res() {
  const state = { code: 0, headers: null, body: '' }
  return {
    state,
    writeHead(code, headers) { state.code = code; state.headers = headers },
    end(s) { state.body = s || '' },
    setHeader() {},
  }
}

test('writeJson sets status, json content type and no-store', () => {
  const r = res()
  writeJson(r, 201, { ok: true, n: 1 })
  assert.equal(r.state.code, 201)
  assert.equal(r.state.headers['Content-Type'], 'application/json')
  assert.equal(r.state.headers['Cache-Control'], 'no-store')
  assert.deepEqual(JSON.parse(r.state.body), { ok: true, n: 1 })
})

test('writeJson survives a closed socket', () => {
  const broken = { writeHead() { throw new Error('closed') }, end() { throw new Error('closed') } }
  assert.doesNotThrow(() => writeJson(broken, 200, {}))
})

test('writeHtml sets html content type with charset', () => {
  const r = res()
  writeHtml(r, 400, '<p>x</p>')
  assert.equal(r.state.code, 400)
  assert.equal(r.state.headers['Content-Type'], 'text/html; charset=utf-8')
  assert.equal(r.state.body, '<p>x</p>')
})

test('readBody concatenates chunks within the limit', async () => {
  const req = Readable.from([Buffer.from('ab'), Buffer.from('cd')])
  const buf = await readBody(req, 1024)
  assert.equal(buf.toString('utf8'), 'abcd')
})

test('readBody rejects oversized bodies and destroys the request', async () => {
  let destroyed = false
  const req = Readable.from([Buffer.alloc(2048, 1)])
  const origDestroy = req.destroy.bind(req)
  req.destroy = (err) => { destroyed = true; return origDestroy(err) }
  await assert.rejects(() => readBody(req, 1024), /body too large/)
  assert.equal(destroyed, true)
})

test('readBody propagates stream errors', async () => {
  const req = new Readable({ read() { this.destroy(new Error('boom')) } })
  await assert.rejects(() => readBody(req, 1024), /boom/)
})

test('#341: isTrustedSettingsRequest fails closed without origin headers, allows loopback/same-origin', () => {
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'cross-site' } }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-origin' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { 'sec-fetch-site': 'same-site' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: {} }), false)
  assert.equal(isTrustedSettingsRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true)
  // Cross-origin checks when sec-fetch-site is absent
  assert.equal(isTrustedSettingsRequest({ headers: { origin: 'http://evil.com', host: 'dsh.local:5140' } }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { origin: 'http://dsh.local:5140', host: 'dsh.local:5140' } }), true)
  assert.equal(isTrustedSettingsRequest({ headers: { referer: 'http://evil.com/csrf', host: 'dsh.local:5140' } }), false)
  assert.equal(isTrustedSettingsRequest({ headers: { referer: 'http://dsh.local:5140/panel', host: 'dsh.local:5140' } }), true)
})

test('queryOf parses the query string and tolerates bad urls', () => {
  assert.equal(queryOf({ url: '/x?a=1&b=two' }).get('a'), '1')
  assert.equal(queryOf({ url: '/x?a=1&b=two' }).get('b'), 'two')
  assert.equal(queryOf({}).get('a'), null)
})

test('fetchWithTimeout passes through when timeout is disabled', async () => {
  let called = 0
  const impl = async () => { called++; return { ok: true } }
  const r = await fetchWithTimeout(impl, 'http://x', {}, { timeoutMs: 0 })
  assert.equal(called, 1)
  assert.equal(r.ok, true)
})

test('fetchWithTimeout aborts a hanging fetch', async () => {
  const impl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  })
  await assert.rejects(() => fetchWithTimeout(impl, 'http://x', {}, { timeoutMs: 20 }))
})

test('fetchWithTimeout merges the caller signal', async () => {
  const seen = {}
  const impl = async (url, init) => { seen.hasSignal = Boolean(init.signal); return {} }
  const ctrl = new AbortController()
  await fetchWithTimeout(impl, 'http://x', { signal: ctrl.signal }, { timeoutMs: 50 })
  assert.equal(seen.hasSignal, true)
})

test('safeJsonHandler returns the payload on success', async () => {
  const r = res()
  const h = safeJsonHandler(async (req, response) => writeJson(response, 200, { ok: true }))
  await h({ method: 'GET', headers: {} }, r)
  assert.equal(r.state.code, 200)
  assert.equal(JSON.parse(r.state.body).ok, true)
})

test('safeJsonHandler maps thrown errors to json with status and code', async () => {
  const r = res()
  const err = new Error('nope'); err.status = 403; err.code = 'forbidden'
  const h = safeJsonHandler(async () => { throw err })
  await h({ method: 'GET', headers: {} }, r)
  assert.equal(r.state.code, 403)
  const body = JSON.parse(r.state.body)
  assert.equal(body.ok, false)
  assert.equal(body.error.code, 'forbidden')
  assert.equal(body.error.message, 'nope')
})

test('safeJsonHandler falls back to 500 for invalid status', async () => {
  const r = res()
  const err = new Error('weird'); err.status = 0
  const h = safeJsonHandler(async () => { throw err })
  await h({ method: 'GET', headers: {} }, r)
  assert.equal(r.state.code, 500)
  assert.equal(JSON.parse(r.state.body).error.code, 'INTERNAL_ERROR')
})

test('escapeHtml neutralizes angle brackets and ampersands', () => {
  assert.equal(escapeHtml('<a & b>'), '&lt;a &amp; b&gt;')
  assert.equal(escapeHtml(null), 'null')
})

test('codexBody trims the prompt and omits empty optionals', () => {
  const body = codexBody({ prompt: '  a cat  ' })
  assert.equal(body.prompt, 'a cat')
  assert.equal(body.model, CODEX_MODEL)
  assert.equal('size' in body, false)
  assert.equal('quality' in body, false)
})

test('codexBody keeps size and quality when provided', () => {
  const body = codexBody({ prompt: 'x', size: '1024x1024', quality: 'high' })
  assert.equal(body.size, '1024x1024')
  assert.equal(body.quality, 'high')
})

test('codexBody rejects an empty prompt', () => {
  assert.throws(() => codexBody({ prompt: '   ' }), /prompt must be a non-empty string/)
  assert.throws(() => codexBody({}), /prompt must be a non-empty string/)
})

test('grokBody maps the four size presets to aspect ratios', () => {
  for (const size of SIZES) {
    const body = grokBody({ prompt: 'x', size })
    assert.ok(body.aspect_ratio, size + ' must map to an aspect ratio')
  }
  assert.equal(grokBody({ prompt: 'x', size: '1024x1536' }).aspect_ratio, '2:3')
  assert.equal(grokBody({ prompt: 'x', size: '1536x1024' }).aspect_ratio, '3:2')
})

test('grokBody drops unknown sizes but keeps the request', () => {
  const body = grokBody({ prompt: 'x', size: '999x999' })
  assert.equal('aspect_ratio' in body, false)
  assert.equal(body.model, GROK_MODEL)
  assert.equal(body.response_format, 'b64_json')
})

test('grokBody collapses quality tiers to the vendor two-level scale', () => {
  assert.equal(grokBody({ prompt: 'x', quality: 'low' }).quality, 'low')
  assert.equal(grokBody({ prompt: 'x', quality: 'medium' }).quality, 'medium')
  assert.equal(grokBody({ prompt: 'x', quality: 'high' }).quality, 'medium')
  assert.equal('quality' in grokBody({ prompt: 'x', quality: 'ultra' }), false)
  assert.equal('quality' in grokBody({ prompt: 'x' }), false)
})
