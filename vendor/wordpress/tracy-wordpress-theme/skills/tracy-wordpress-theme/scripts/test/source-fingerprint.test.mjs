// lib/source-fingerprint.mjs: the fingerprint of a source's served home page. Pages and servers are synthetic.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { differsFrom, fingerprintOf, homeUrlOf, normaliseHtml, readSourceFingerprint, templateOf, validateFingerprint } from '../lib/source-fingerprint.mjs'
import { testDir } from './lib/test-root.mjs'

const URL_ = 'http://source.test/'
const PAGE = (extra = '') => `<!doctype html><html><head><meta name="csrf-token" content="TOKEN-1"><script nonce="n-1">var a=1</script></head><body><form><input type="hidden" name="${'a'.repeat(32)}" value="1"></form><p>synthetic home</p>${extra}</body></html>`
const fp = (html, template = null) => fingerprintOf({ url: URL_, html, template })

test('fingerprint: the same page is the same source; line endings and the declared volatile fields do not matter', () => {
  const base = fp(PAGE())
  assert.deepEqual(validateFingerprint(base), [])
  assert.equal(fp(PAGE().replace(/\n/g, '\r\n')).id, base.id)
  assert.equal(fp(PAGE().replace('TOKEN-1', 'TOKEN-2').replace('n-1', 'n-2').replace('a'.repeat(32), 'b'.repeat(32))).id, base.id)
  assert.equal(differsFrom(base, fp(PAGE())), null)
})

test('fingerprint: a change of content is not hidden by the normalisation — text, a script, an attribute, a comment', () => {
  const base = fp(PAGE())
  for (const html of [PAGE('<p>more</p>'), PAGE().replace('var a=1', 'var a=2'), PAGE().replace('<p>', '<p class="x">'), PAGE('<!-- rebuilt -->'), PAGE().replace('synthetic home', 'synthetic Home')]) {
    assert.notEqual(fp(html).id, base.id)
    assert.match(differsFrom(base, fp(html)), /the source differs in the served home page/)
  }
  // a hidden input whose name is not a token (not 32 hex characters) is content
  assert.notEqual(fp(PAGE().replace('a'.repeat(32), 'search')).id, base.id)
  assert.equal(normaliseHtml('<a href="/x?_=1">'), '<a href="/x?_=1">')
  // `nonce=` inside a script, a comment or the text of the page is content, not the attribute
  for (const html of [PAGE('<script>var s = "nonce=\'abc\'"</script>'), PAGE('<p>nonce="abc" is a word here</p>'), PAGE('<!-- nonce="abc" -->')]) {
    assert.notEqual(fp(html).id, base.id)
    assert.notEqual(fp(html).id, fp(html.replace('abc', 'xyz')).id)
  }
  // a lookalike in the value of another attribute, or in a tag written inside a comment or a script, is content: the page is tokenized, not pattern-matched
  const looks = (value) => PAGE(`<div title="hint nonce='${value}'"></div>`)
  assert.notEqual(fp(looks('red')).id, fp(looks('blue')).id)
  const commented = (value) => PAGE(`<!-- <script nonce="${value}"> -->`)
  assert.notEqual(fp(commented('red')).id, fp(commented('blue')).id)
  const scripted = (value) => PAGE(`<script>document.write('<meta name="csrf-token" content="${value}">')</script>`)
  assert.notEqual(fp(scripted('red')).id, fp(scripted('blue')).id)
  const quoted = (value) => PAGE(`<a data-x='<input type="hidden" name="${'c'.repeat(32)}" value="${value}">'>x</a>`)
  assert.notEqual(fp(quoted('red')).id, fp(quoted('blue')).id)
  // markup-looking text a browser with scripting on does not read as markup: <noscript>, <textarea>, <title>, <plaintext> (which is never closed)
  const meta = (value) => `<meta name="csrf-token" content="${value}">`
  for (const wrap of [(m) => `<noscript>${m}</noscript>`, (m) => `<textarea>${m}</textarea>`, (m) => `<p><plaintext>${m}</plaintext>${m}`, (m) => `<style>${m}</style>`]) {
    assert.notEqual(fp(PAGE(wrap(meta('red')))).id, fp(PAGE(wrap(meta('blue')))).id, wrap('x'))
  }
  // and the same field in a real element after them is still a field
  assert.equal(fp(PAGE(`<noscript>x</noscript>${meta('red')}`)).id, fp(PAGE(`<noscript>x</noscript>${meta('blue')}`)).id)
  // the declared fields are replaced wherever they stand in a real tag: unquoted, single-quoted, upper-case, with other attributes around them
  const real = (token) => PAGE(`<SCRIPT defer NONCE=${token} src=/a.js></SCRIPT><meta property=x content=y><meta CONTENT='${token}' NAME='CSRF-token' data-k="nonce='z'">`)
  assert.equal(fp(real('r1')).id, fp(real('r2')).id)
  assert.notEqual(fp(real('r1')).id, fp(real('r1').replace('data-k="nonce=\'z\'"', 'data-k="nonce=\'y\'"')).id)
  // the meta may carry its content before its name: the token is still the only thing blanked
  const swapped = (token) => PAGE().replace('<meta name="csrf-token" content="TOKEN-1">', `<meta content="${token}" name="csrf-token">`)
  assert.equal(fp(swapped('A')).id, fp(swapped('B')).id)
})

test('fingerprint: another URL or another declared template is another source', () => {
  const base = fp(PAGE())
  assert.match(differsFrom(base, fingerprintOf({ url: 'http://other.test/', html: PAGE() })), /the home URL/)
  const tpl = fp(PAGE(), { name: 'synthetic-template', version: '1.0' })
  assert.match(differsFrom(base, tpl), /the declared template identity/)
  assert.equal(differsFrom(tpl, fp(PAGE(), { name: 'synthetic-template', version: '1.0' })), null)
  assert.match(differsFrom(tpl, fp(PAGE(), { name: 'synthetic-template', version: '2.0' })), /declared template identity/)
})

test('fingerprint: a fingerprint that is malformed or whose id does not follow is refused, never compared', () => {
  const base = fp(PAGE())
  assert.ok(validateFingerprint(null).length)
  assert.ok(validateFingerprint({ ...base, htmlSha256: 'x' }).length)
  assert.ok(validateFingerprint({ ...base, id: 'f'.repeat(64) }).length)
  assert.match(differsFrom({ ...base, id: 'f'.repeat(64) }, base), /^evidence: id does not follow/)
  assert.match(differsFrom(base, undefined), /^current:/)
})

test('fingerprint: the template identity comes from the spec-pack provenance when it has one', () => {
  const dir = testDir('fingerprint-spec')
  assert.equal(templateOf(null), null)
  assert.equal(templateOf(dir), null)
  writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify({ source: { template: { name: 'synthetic-template', version: '3.1' } } }))
  assert.deepEqual(templateOf(dir), { name: 'synthetic-template', version: '3.1' })
  writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify({ source: { template: { name: 'synthetic-template' } } }))
  assert.deepEqual(templateOf(dir), { name: 'synthetic-template', version: null })
  writeFileSync(path.join(dir, 'provenance.json'), 'not json')
  assert.equal(templateOf(dir), null)
})

test('fingerprint: the home URL is the contract\'s source site when it is on the sweep\'s origin, else the origin', () => {
  assert.equal(homeUrlOf({ source: 'http://s.test' }), 'http://s.test/')
  assert.equal(homeUrlOf({ source: 'http://s.test', contract: { source: { site: 'http://s.test/sub/' } } }), 'http://s.test/sub/')
  assert.equal(homeUrlOf({ source: 'http://s.test', contract: { source: { site: 'http://other.test/sub/' } } }), 'http://s.test/')
  assert.equal(homeUrlOf({ source: 'not a url' }), null)
})

const servers = []
after(() => servers.forEach((s) => s.close()))
const serve = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve(`http://127.0.0.1:${server.address().port}/`)
    })
  })

test('readSourceFingerprint: reads a page and fingerprints it; a status, a type, a size, an empty page or a dead server is an error', async () => {
  const ok = await serve((q, r) => {
    if (q.url === '/missing') return r.writeHead(404, { 'content-type': 'text/html' }).end('<p>x</p>')
    if (q.url === '/json') return r.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    if (q.url === '/empty') return r.writeHead(200, { 'content-type': 'text/html' }).end('  ')
    if (q.url === '/big') return r.writeHead(200, { 'content-type': 'text/html' }).end('x'.repeat(5000))
    if (q.url === '/slow') return setTimeout(() => r.writeHead(200, { 'content-type': 'text/html' }).end('late'), 2000)
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE())
  })
  const got = await readSourceFingerprint({ url: ok })
  assert.equal(got.ok, true)
  assert.equal(got.fingerprint.htmlSha256, fp(PAGE()).htmlSha256)
  assert.equal(got.fingerprint.url, ok)
  assert.match((await readSourceFingerprint({ url: `${ok}missing` })).error, /answered 404/)
  assert.match((await readSourceFingerprint({ url: `${ok}json` })).error, /application\/json, not HTML/)
  assert.match((await readSourceFingerprint({ url: `${ok}empty` })).error, /empty page/)
  assert.match((await readSourceFingerprint({ url: `${ok}big`, maxBytes: 100 })).error, /larger than 100 bytes/)
  assert.match((await readSourceFingerprint({ url: `${ok}slow`, timeoutMs: 100 })).error, /could not be read/)
  assert.match((await readSourceFingerprint({ url: 'http://127.0.0.1:1/' })).error, /could not be read/)
  assert.match((await readSourceFingerprint({ url: ok, fetchImpl: async () => { throw new Error('boom') } })).error, /boom/)
})

test('readSourceFingerprint: the same URL serving other content is another fingerprint', async () => {
  let html = PAGE()
  const url = await serve((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(html))
  const before = (await readSourceFingerprint({ url })).fingerprint
  html = PAGE('<p>rebuilt</p>')
  const after_ = (await readSourceFingerprint({ url })).fingerprint
  assert.match(differsFrom(before, after_), /served home page/)
  html = PAGE().replace('TOKEN-1', 'TOKEN-9')
  assert.equal(differsFrom(before, (await readSourceFingerprint({ url })).fingerprint), null)
})
