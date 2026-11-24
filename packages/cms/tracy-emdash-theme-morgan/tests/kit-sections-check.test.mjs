// ingest/kit-sections-check.mjs fails (negative fixture) when a section with a visual slot is not a kit block, and passes when it is.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ingest', 'kit-sections-check.mjs')
const part = (cls, field) => ({
  selector: `main > section.${cls}`,
  tag: 'section',
  classes: [cls],
  stamps: [{ collection: 'features_intro', slug: 'home-intro', kind: 'field', field }]
})
const run = (blocks, parts) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-sections-'))
  writeFileSync(path.join(dir, 'emdash-sections.json'), JSON.stringify({ pages: { '/': { before: [], main: parts, after: [] } } }))
  writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify({ blocks }))
  return spawnSync(process.execPath, [TOOL, dir], { encoding: 'utf8' })
}

test('a section whose picture slot no kit block owns fails', () => {
  const r = run([], [part('mg-sec-intro', 'items.0.img')])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /no kit block owns/)
})

test('a section whose picture slot is owned by a kit block passes', () => {
  const r = run([{ id: 'block-intro', slots: [], frames: [{ id: 'features_intro.home-intro.items[0].img' }] }], [part('mg-sec-intro', 'items.0.img')])
  assert.equal(r.status, 0, r.stdout)
})

test('two sections of one page with the same class set fail', () => {
  const r = run([{ id: 'b', slots: [{ id: 'features_intro.home-intro.title' }], frames: [] }], [part('mg-sec', 'title'), part('mg-sec', 'title')])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /share the class set/)
})
