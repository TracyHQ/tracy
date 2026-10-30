// check-joomla-contract-pins.mjs refuses a contract directory whose sidecar `baseHash` is not the hash
// of the base files beside it: the Claude Cowork receiver refuses that sidecar and skips it silently.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { stalePins } from '../check-joomla-contract-pins.mjs'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../check-joomla-contract-pins.mjs')
const sha = (text) => createHash('sha256').update(text).digest('hex')
const BASE = {
  'manifest.json': '{"id":"fictional-bakery/j6/1.0.0"}\n',
  'content-map.json': '{"entities":[]}\n',
  'presentation-lock.json': '{"modules":[]}\n'
}
/** The receiver's formula, written out here so the test does not share code with the script. */
const pinOf = (files) =>
  sha(
    Object.keys(BASE)
      .map((name) => `${name}:${sha(files[name])}\n`)
      .join('')
  )

function contract(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'contract-pins-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
  return dir
}

test('a sidecar pinned to the base files beside it holds', () => {
  const dir = contract({ ...BASE, 'showcase-nav-map.json': JSON.stringify({ baseHash: pinOf(BASE) }) })
  try {
    assert.deepEqual(stalePins(dir), [])
    assert.equal(spawnSync(process.execPath, [SCRIPT, dir]).status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a content map edited after its sidecars were generated is refused, naming the generator', () => {
  const edited = { ...BASE, 'content-map.json': '{"entities":[{"key":"hero"}]}\n' }
  const dir = contract({
    ...edited,
    'showcase-nav-map.json': JSON.stringify({ baseHash: pinOf(BASE) }),
    'multilingual-map.json': JSON.stringify({ baseHash: pinOf(edited) }),
    'content-coverage.json': JSON.stringify({ contract: { contentMapSha256: sha(BASE['content-map.json']) } })
  })
  try {
    const problems = stalePins(dir)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /showcase-nav-map\.json: baseHash .*scripts\/build-joomla-showcase-nav\.mjs/)
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /showcase-nav-map\.json/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a contract directory without its base files is refused', () => {
  const dir = contract({ 'manifest.json': BASE['manifest.json'] })
  try {
    assert.match(stalePins(dir)[0], /missing base file\(s\) content-map\.json, presentation-lock\.json/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
