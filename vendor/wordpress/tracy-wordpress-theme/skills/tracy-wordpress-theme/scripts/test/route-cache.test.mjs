import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RouteCache, cacheKey, themeFingerprint, sha256 } from '../lib/route-cache.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'route-cache-'))
test.after(() => rmSync(scratch, { recursive: true, force: true }))

test('cacheKey changes with every input it is made of, and with nothing else', () => {
  const base = { sourceHtml: '<p>a</p>', targetHtml: '<p>b</p>', toolVersion: 1, theme: 'fp', extra: 'cfg' }
  const k = cacheKey(base)
  assert.match(k, /^[a-f0-9]{64}$/)
  assert.equal(cacheKey({ ...base }), k)
  for (const change of [
    { sourceHtml: '<p>A</p>' },
    { targetHtml: '<p>B</p>' },
    { toolVersion: 2 },
    { theme: 'other' },
    { extra: 'cfg2' }
  ])
    assert.notEqual(cacheKey({ ...base, ...change }), k, JSON.stringify(change))
  assert.equal(cacheKey({ targetHtml: 'x', toolVersion: 1 }), cacheKey({ targetHtml: 'x', toolVersion: 1, sourceHtml: null }))
})

test('themeFingerprint reads style.css, theme.json and assets/css/* — and nothing else', () => {
  const theme = join(scratch, 'theme')
  mkdirSync(join(theme, 'assets', 'css'), { recursive: true })
  mkdirSync(join(theme, 'templates'), { recursive: true })
  writeFileSync(join(theme, 'style.css'), 'body{}')
  writeFileSync(join(theme, 'theme.json'), '{}')
  writeFileSync(join(theme, 'assets', 'css', 'dark.css'), 'html[data-theme=dark]{}')
  writeFileSync(join(theme, 'templates', 'index.html'), '<!-- wp:x -->')
  const a = themeFingerprint(theme)
  writeFileSync(join(theme, 'templates', 'index.html'), '<!-- wp:y -->')
  assert.equal(themeFingerprint(theme), a, 'templates do not change the rendered CSS')
  writeFileSync(join(theme, 'assets', 'css', 'dark.css'), 'html[data-theme=dark]{color:red}')
  assert.notEqual(themeFingerprint(theme), a)
  assert.equal(themeFingerprint(null), '')
  assert.equal(themeFingerprint(join(scratch, 'nope')), '')
})

test('RouteCache: miss, put, hit under <dir>/<tool>/<key>.json; disabled cache never hits', () => {
  const dir = join(scratch, 'cache')
  const c = new RouteCache(dir)
  const key = cacheKey({ targetHtml: 'x', toolVersion: 1 })
  assert.equal(c.get('leak-scan', key), null)
  c.put('leak-scan', key, { status: 'pass', findings: [] })
  assert.deepEqual(c.get('leak-scan', key), { status: 'pass', findings: [] })
  assert.deepEqual(readdirSync(join(dir, 'leak-scan')), [`${key}.json`])
  const off = new RouteCache(dir, { enabled: false })
  assert.equal(off.get('leak-scan', key), null)
  off.put('leak-scan', key, { status: 'x' })
  assert.deepEqual(c.get('leak-scan', key), { status: 'pass', findings: [] }, 'disabled put writes nothing')
  assert.equal(new RouteCache(null).get('leak-scan', key), null)
})

test('sha256 of text is stable', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
