// The demo-trim map of a Joomla contract belongs to its own directory: `--contract` builds and checks a
// release the design is not pinned to yet (ja-kinetic/j6/1.0.10, cut while Kinetic stayed pinned to
// 1.0.9), and `--check` turns red on any map on disk naming another contract or another baseHash —
// 1.0.10 shipped with a copy of 1.0.9's map and Claude Cowork refused it.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/build-joomla-demo-trim.mjs')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const PREVIOUS = 'ja-kinetic/j6/1.0.9'
const NEW = 'ja-kinetic/j6/1.0.10'
/** What the registries pin today, so the copied tree passes the pinned checks on its own. */
const PINNED = [PREVIOUS, 'tracy-business/j6/1.2.6']
const MAP = 'demo-trim-map.json'

const made = []
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})
function tree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'joomla-demo-trim-'))
  made.push(dir)
  for (const id of [...PINNED, NEW]) cpSync(path.join(CONTRACTS, id), path.join(dir, id), { recursive: true })
  return dir
}
const run = (dir, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, TRACY_JOOMLA_CONTRACTS: dir },
    encoding: 'utf8'
  })
const read = (dir, id) => JSON.parse(readFileSync(path.join(dir, id, MAP), 'utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** claude-cowork `DemoTrimProfile`: the hash a map must carry to belong to this contract. */
const coworkBaseHash = (dir, id) =>
  sha256(
    ['manifest.json', 'content-map.json', 'presentation-lock.json']
      .map((name) => `${name}:${sha256(readFileSync(path.join(dir, id, name)))}\n`)
      .join('')
  )

test('the committed maps pass --check, including the not-yet-pinned release', () => {
  const dir = tree()
  const out = run(dir, '--check', '--contract', NEW)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /ja-kinetic\/j6\/1\.0\.10 {2}hides/)
})

test('--check is red on a map copied from the previous release', () => {
  const dir = tree()
  writeFileSync(path.join(dir, NEW, MAP), readFileSync(path.join(dir, PREVIOUS, MAP)))
  const out = run(dir, '--check')
  assert.equal(out.status, 1)
  assert.match(
    out.stderr,
    /ja-kinetic\/j6\/1\.0\.10\/demo-trim-map\.json names contract ja-kinetic\/j6\/1\.0\.9/
  )
  assert.match(out.stderr, /baseHash \w+ is not \w+/)
})

test('--check is red on a map naming its own contract with a stale baseHash', () => {
  const dir = tree()
  const map = read(dir, NEW)
  map.baseHash = '0'.repeat(64)
  writeFileSync(path.join(dir, NEW, MAP), `${JSON.stringify(map, null, 2)}\n`)
  const out = run(dir, '--check')
  assert.equal(out.status, 1)
  assert.doesNotMatch(out.stderr, /names contract/)
  assert.match(out.stderr, /1\.0\.10\/demo-trim-map\.json baseHash 0{64} is not/)
})

test('--check is red on a map that is JSON but not an object', () => {
  for (const body of ['null\n', '[]\n', '"x"\n']) {
    const dir = tree()
    writeFileSync(path.join(dir, NEW, MAP), body)
    const out = run(dir, '--check')
    assert.equal(out.status, 1, body)
    assert.match(out.stderr, /1\.0\.10\/demo-trim-map\.json is not a demo-trim map object/)
  }
})

test('--contract builds a release the design is not pinned to, with the design keep set', () => {
  const dir = tree()
  writeFileSync(path.join(dir, NEW, MAP), readFileSync(path.join(dir, PREVIOUS, MAP)))
  const built = run(dir, '--contract', NEW)
  assert.equal(built.status, 0, built.stderr)
  const map = read(dir, NEW)
  assert.equal(map.contract, NEW)
  assert.equal(map.baseHash, coworkBaseHash(dir, NEW))
  // `pages/kineticql` is in Kinetic's demoTrimKeep: its post stays although it sits in the blog.
  assert.ok(
    map.kept.some((k) => /demoTrimKeep/.test(k.reason)),
    'the keep set of the ja-kinetic design reaches the new release'
  )
  assert.equal(run(dir, '--check', '--contract', NEW).status, 0)
})

test('--contract is red when the pinned list leaves the release stale', () => {
  const dir = tree()
  const map = read(dir, NEW)
  map.hide = map.hide.slice(1)
  writeFileSync(path.join(dir, NEW, MAP), `${JSON.stringify(map, null, 2)}\n`)
  // contract and baseHash still match, so only the byte comparison can see it.
  assert.equal(run(dir, '--check').status, 0)
  const out = run(dir, '--check', '--contract', NEW)
  assert.equal(out.status, 1)
  assert.match(out.stderr, /ja-kinetic\/j6\/1\.0\.10\/demo-trim-map\.json is stale or missing/)
})

test('--contract refuses an id with no contract', () => {
  const out = run(tree(), '--check', '--contract', 'ja-kinetic/j6/9.9.9')
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /no contract at ja-kinetic\/j6\/9\.9\.9/)
})
