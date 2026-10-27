// tools/release.mjs runs the role scan (TCH rule VARS-1) on the packed theme before cutting a release:
// design-system-roles.json lands in the release folder and in SHA256SUMS, and an unclean source stops
// the release. `release.mjs --role-scan <dir> --out <new-dir>` runs that step alone.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const ROOT = path.join(import.meta.dirname, '..')
const RELEASE = path.join(ROOT, 'tools', 'release.mjs')
const CONFIG = JSON.parse(readFileSync(path.join(ROOT, 'template.config.json'), 'utf8'))

function scan(dir) {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'release-role-scan-')), 'release')
  const r = spawnSync(process.execPath, [RELEASE, '--role-scan', dir, '--out', out], { encoding: 'utf8' })
  return { ...r, out }
}

test('the theme as committed scans clean: the report carries this version, 0 unresolved', () => {
  const r = scan(ROOT)
  assert.equal(r.status, 0, r.stderr)
  const doc = JSON.parse(readFileSync(path.join(r.out, 'design-system-roles.json'), 'utf8'))
  assert.equal(doc.platform, 'emdash')
  assert.equal(doc.template, CONFIG.id)
  assert.equal(doc.version, CONFIG.version)
  assert.equal(doc.unresolved, 0)
  // the summary is for the person building: beside the release folder, never in it
  assert.ok(readFileSync(path.join(path.dirname(r.out), 'design-system-roles.md'), 'utf8').length > 0)
})

test('a hardcoded role in the shipped source stops the release and names file:line', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-role-scan-src-'))
  cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'template.config.json'), JSON.stringify(CONFIG))
  writeFileSync(path.join(dir, 'src', 'hardcoded.css'), '.hero-title {\n  color: #14171a;\n}\n')
  const r = scan(dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /role scan: \d+ item\(s\) rule VARS-1 would hold/)
  assert.match(r.stderr, /src\/hardcoded\.css:2 \(\.hero-title, color #14171a\)/)
})

test('the release lists the report among the files Tracy validates and in SHA256SUMS', () => {
  const src = readFileSync(RELEASE, 'utf8')
  assert.match(src, /roleScanFor\(artifact, out, product, version\)/)
  assert.match(src, /const assets = \[[^\]]*ROLE_SCAN_FILE\s*\]/)
  assert.match(src, /const sums = \[[^\]]*ROLE_SCAN_FILE\s*\]/)
})
