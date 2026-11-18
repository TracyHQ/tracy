// inventory.mjs — what it resolves on a mirrored CMS site, and what it refuses as an output name.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const TOOL = path.join(import.meta.dirname, '..', 'tools', 'inventory.mjs')
const put = (root, rel, body) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  writeFileSync(path.join(root, rel), body)
}
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' })

// found while porting JA Restaurant: a mirror of a CMS site writes /templates/… paths, which resolved to nothing
test('root-relative, own-origin and stylesheet references of a mirrored site are resolved', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'inventory-'))
  try {
    put(root, 'crawl.json', JSON.stringify({ start: 'http://127.0.0.1:8080/' }))
    put(
      root,
      'index.html',
      `<html lang="en"><head><link rel="stylesheet" href="/templates/t/css/a.css"><script src="https://cdn.example/x.js"></script></head>
       <body><img src="http://127.0.0.1:8080/images/a.png"><div style="background-image:url(&quot;/images/b.jpg&quot;)"></div>
       <a href="/about">About</a></body></html>`
    )
    put(root, 'templates/t/css/a.css', '@font-face{src:url(../fonts/f.woff2)} .x{background:url("/images/c.png")}')
    put(root, 'templates/t/fonts/f.woff2', 'f')
    for (const f of ['a.png', 'b.jpg', 'c.png', 'unused.png']) put(root, `images/${f}`, f)
    const out = path.join(root, 'out')
    const r = run(root, out)
    assert.equal(r.status, 0, r.stderr)
    const assets = JSON.parse(readFileSync(path.join(out, 'assets.json'), 'utf8'))
    assert.deepEqual(assets.refs.map((x) => x.resolved).sort(), [
      'images/a.png',
      'images/b.jpg',
      'images/c.png',
      'templates/t/css/a.css',
      'templates/t/fonts/f.woff2'
    ])
    assert.ok(assets.unreferenced.includes('images/unused.png'))
    assert.deepEqual(assets.unresolved, [], 'another origin and page links are not this folder’s references')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a root-relative reference to a file the mirror does not hold is unresolved, not skipped', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'inventory-'))
  try {
    put(root, 'index.html', '<html><body><img src="/images/missing.png"></body></html>')
    const r = run(root, path.join(root, 'out'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /unresolved/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('<out-dir> given as a .json file name is refused with the reason', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'inventory-'))
  try {
    put(root, 'index.html', '<html></html>')
    const r = run(root, path.join(root, 'inventory.json'))
    assert.equal(r.status, 2)
    assert.match(r.stderr, /directory/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
