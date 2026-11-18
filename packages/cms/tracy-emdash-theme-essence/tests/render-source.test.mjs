// render-source.mjs on a local site: a hanging third-party embed is blocked by host, and one broken page does not
// lose the run (found while porting JA Restaurant, where an embedded booking iframe never settled offline).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, it } from 'node:test'
import { promisify } from 'node:util'

const TOOL = path.join(import.meta.dirname, '..', 'tools', 'render-source.mjs')
const run = promisify(execFile)
const BODY = '<p>' + 'A paragraph of text long enough to count as rendered. '.repeat(8) + '</p>'

let site
let hang
let siteBase
let hangPort
before(async () => {
  hang = http.createServer(() => {
    // never answers: an embed whose host does not settle
  })
  await new Promise((r) => hang.listen(0, '127.0.0.1', r))
  hangPort = hang.address().port
  site = http.createServer((req, res) => {
    if (req.url === '/broken.html') return req.socket.destroy()
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><title>t</title></head><body>${BODY}<script src="http://localhost:${hangPort}/embed.js"></script></body></html>`)
  })
  await new Promise((r) => site.listen(0, '127.0.0.1', r))
  siteBase = `http://127.0.0.1:${site.address().port}`
})
after(() => {
  site?.close()
  hang?.close()
  hang?.closeAllConnections?.()
})

it('--block aborts the hanging host, and a page that cannot be rendered is recorded while the rest is kept', {
  timeout: 150000
}, async () => {
  const out = mkdtempSync(path.join(tmpdir(), 'render-source-'))
  try {
    const r = await run(
      process.execPath,
      [TOOL, siteBase, out, '--pages', 'index.html,broken.html', '--block', 'localhost'],
      { encoding: 'utf8' }
    ).catch((e) => e)
    assert.equal(r.code, 1, 'a failed page makes the exit code 1')
    const manifest = JSON.parse(readFileSync(path.join(out, 'render-manifest.json'), 'utf8'))
    assert.deepEqual(manifest.blocked, ['localhost'])
    assert.equal(manifest.pages.filter((p) => p.page === 'index.html').length, 4, 'every viewport x theme of the good page')
    assert.ok(manifest.failed.length >= 1 && manifest.failed.every((f) => f.page === 'broken.html'), JSON.stringify(manifest.failed))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
