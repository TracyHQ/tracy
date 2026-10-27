// A WordPress contract version keeps the inventory its earlier version carried. Tracy Business wp7 1.3.4 was carried from
// 1.3.2 without `inventory.json`, `editions.json` and `demo-trim-map.json` (measured 08/10/2026 on dev, site tamq-7q-wpb):
// the Claude Cowork plugin then had no editions to retire, all 41 Polylang editions stayed live, and an unticked News page
// was still reached at /news/ -> /af/news-af/. The editions gate skipped the version silently because it only looked at
// versions that carry an inventory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/build-wordpress-editions.mjs')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')

const run = (dir, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, ...(dir ? { TRACY_WP_CONTRACTS: dir } : {}) },
    encoding: 'utf8'
  })

test('the committed contracts pass the editions gate', () => {
  const out = run(null, '--check')
  assert.equal(out.status, 0, out.stderr)
})

test('a later version without the inventory its earlier version carried turns the gate red', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-editions-'))
  const from = path.join(CONTRACTS, 'tracy-business/wp7/1.3.2')
  cpSync(from, path.join(dir, 'tracy-business/wp7/1.3.2'), { recursive: true })
  cpSync(from, path.join(dir, 'tracy-business/wp7/1.10.0'), { recursive: true })
  for (const name of ['inventory.json', 'editions.json', 'demo-trim-map.json'])
    rmSync(path.join(dir, 'tracy-business/wp7/1.10.0', name))
  const out = run(dir, '--check')
  assert.equal(out.status, 1)
  assert.match(out.stderr, /tracy-business\/wp7\/1\.10\.0: no inventory\.json, but 1\.3\.2 carries one/)
})
