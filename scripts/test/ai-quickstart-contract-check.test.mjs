// The AI quickstart contract check gate (`ai-quickstart-contract`, ADR 0046, ticket #581) run as a command, on a
// throwaway tree holding the invented declarations of the WO domain fixtures.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { discoverAiQuickstartFolders } from '../ai-quickstart/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CHECK = path.join(ROOT, 'scripts/ai-quickstart/check.mjs')
const FIXTURES = path.join(ROOT, 'packages/wo/website-opportunities/test/fixtures/ai-quickstart')
const FOLDER = 'packages/cms/example-quickstart/ai-quickstart/example-template/1.0.0'

/** A tree with one invented AI quickstart folder, its block store edited by `edit`. */
function treeWith(t, edit = (store) => store) {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, FOLDER)
  mkdirSync(dir, { recursive: true })
  cpSync(FIXTURES, dir, { recursive: true })
  const store = JSON.parse(readFileSync(path.join(dir, 'block-store.json'), 'utf8'))
  writeFileSync(path.join(dir, 'block-store.json'), JSON.stringify(edit(store)))
  return { root, dir }
}

const run = (...args) => spawnSync(process.execPath, [CHECK, ...args], { cwd: ROOT, encoding: 'utf8' })

test('discovery finds every folder under packages/cms that holds a block store description', (t) => {
  const { root, dir } = treeWith(t)
  assert.deepEqual(discoverAiQuickstartFolders(root), [dir])
})

test('the command passes on the valid invented declarations', () => {
  const res = run(FIXTURES)
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /1 AI quickstart\(s\) checked, 0 problem\(s\)/)
})

test('the command fails and prints every problem with its file and place', (t) => {
  const { dir } = treeWith(t, (store) => {
    delete store.blocks[1].fields[0].limit
    delete store.blocks[2].items
    return store
  })
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(
    res.stderr,
    /block-store\.json blocks\[hero-home\]\.fields\[heading\]\.limit: a text field needs a limit/
  )
  assert.match(res.stderr, /block-store\.json blocks\[services-grid\]\.items: missing item counts/)
  assert.match(res.stdout, /1 AI quickstart\(s\) checked, 2 problem\(s\)/)
})

test('a folder missing one of its three files fails', (t) => {
  const { dir } = treeWith(t)
  rmSync(path.join(dir, 'mapping.json'))
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /mapping\.json: file is missing/)
})

const PENDING = { $comment: 'The mapping file is written by another ticket.', ticket: '#9999' }

test('a folder that declares its mapping file pending is checked without it, and says so', (t) => {
  const { dir } = treeWith(t)
  rmSync(path.join(dir, 'mapping.json'))
  writeFileSync(path.join(dir, 'mapping.pending.json'), JSON.stringify(PENDING))
  const res = run(dir)
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /mapping\.json pending \(#9999\)/)
  assert.match(res.stdout, /1 AI quickstart\(s\) checked, 0 problem\(s\)/)
})

test('a pending mapping file still fails on a broken block store', (t) => {
  const { dir } = treeWith(t, (store) => {
    delete store.blocks[1].fields[0].limit
    return store
  })
  rmSync(path.join(dir, 'mapping.json'))
  writeFileSync(path.join(dir, 'mapping.pending.json'), JSON.stringify(PENDING))
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /a text field needs a limit/)
})

test('a pending marker beside a mapping file fails: the mapping is either pending or written', (t) => {
  const { dir } = treeWith(t)
  writeFileSync(path.join(dir, 'mapping.pending.json'), JSON.stringify(PENDING))
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /mapping\.pending\.json: remove the marker, mapping\.json is written/)
})

test('a pending marker must name the ticket that writes the mapping file', (t) => {
  const { dir } = treeWith(t)
  rmSync(path.join(dir, 'mapping.json'))
  writeFileSync(path.join(dir, 'mapping.pending.json'), JSON.stringify({ $comment: 'later' }))
  const res = run(dir)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /mapping\.pending\.json ticket: name the ticket/)
})

test('run without folders, the command also checks the Tracy library declaration (#596)', () => {
  const res = run()
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /domain\/library\/tracy-library\.json: 1 library block\(s\), 0 problem\(s\)/)
})
