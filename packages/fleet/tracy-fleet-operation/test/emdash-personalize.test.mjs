/**
 * The fleet completes a package that cannot say the customer's name.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-personalize.test.mjs
 *
 * A template cut from a kit older than 20/09/2026 ships no `tools/personalize.mjs`, so the build's
 * personalize stage could only skip — while the customer HAD answered the questionnaire, because
 * Tracy falls back to the CMS's own set when a release carries none. Measured 19/09 on the released
 * tracy-saas quickstart: zero files matching `personalize`, no `seed/questions.json`. The fix at the
 * release end (the kit refuses such a package) only helps packages released after it; this is the
 * other end, where a package already in the world is completed as it is unpacked.
 *
 * The shell is exercised, not just read: `emdash_complete_source` is sourced and run against a
 * directory, because the property that matters — a template's own files are never overwritten — is
 * one a reader can misjudge and a run cannot.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const EMDASH = fileURLToPath(new URL('../scripts/provision/emdash/', import.meta.url))
const STOCK = join(EMDASH, 'personalize')
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

/** A packed template as it arrives from a release: source, seed, tools, and nothing else. */
function packed({ id = 'tracy-saas', files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'packed-'))
  // Both present so the completion's other two branches (stock Dockerfile, artifact.json) stay out
  // of the way: this test is about the personalize trio.
  writeFileSync(join(dir, 'Dockerfile'), 'FROM node:24-slim\n')
  writeFileSync(join(dir, 'artifact.json'), '{}\n')
  writeFileSync(join(dir, 'template.config.json'), JSON.stringify({ id, version: '1.0.0' }))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { emdash: '0.37.0' } }))
  mkdirSync(join(dir, 'tools'), { recursive: true })
  writeFileSync(join(dir, 'tools', 'docker-entrypoint.sh'), '#!/bin/sh\n')
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name.split('/').slice(0, -1).join('/') || '.'), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

/** Source the restore half and run the completion against one unpacked package. */
function complete(dir) {
  const r = spawnSync(
    'bash',
    ['-c', `set -eu; . "${join(EMDASH, 'quickstart-restore.sh')}"; emdash_complete_source "${dir}"`],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 0, `completion failed: ${r.stderr}`)
  return r.stdout
}

const THEME_TOOL = fileURLToPath(
  new URL('../../../cms/tracy-emdash-theme-business/tools/personalize.mjs', import.meta.url)
)

test('the fleet keeps no copy of the tool — the image carries the authored one', () => {
  // Two copies of this 1800-line tool exist on purpose (a theme carries its own so it runs from its
  // own node_modules). A third, checked in beside the provision scripts, is a copy that drifts —
  // and a drifted personalize writes a customer's site by rules nobody reviewed. So the image
  // copies the authored file to where the script looks for it.
  assert.equal(existsSync(join(STOCK, 'personalize.mjs')), false)
  assert.ok(existsSync(THEME_TOOL), 'the authored tool is where the Dockerfile says it is')
  const dockerfile = readFileSync(
    fileURLToPath(new URL('../../../../apps/tracy-host/Dockerfile', import.meta.url)),
    'utf8'
  )
  assert.match(
    dockerfile,
    /COPY packages\/cms\/tracy-emdash-theme-business\/tools\/personalize\.mjs \/opt\/tracy-fleet\/provision\/emdash\/personalize\/personalize\.mjs/,
    'the host image must carry the tool to the path the provision script reads'
  )
})

test('a package with none of the three gets all three, and says so', () => {
  const dir = packed()
  try {
    const said = complete(dir)
    for (const f of ['tools/personalize.mjs', 'seed/personalize.json', 'seed/questions.json'])
      assert.ok(existsSync(join(dir, f)), `${f} is missing after the completion`)
    assert.match(said, /ships no personalize tool/)
    assert.equal(
      sha(join(dir, 'tools', 'personalize.mjs')),
      sha(THEME_TOOL),
      'in a checkout the completion falls back to the authored file, byte for byte'
    )
    assert.match(said, /fleet's map for tracy-saas/)
    const map = JSON.parse(readFileSync(join(dir, 'seed', 'personalize.json'), 'utf8'))
    assert.equal(map.schemaVersion, 'tracy-personalize/v1')
    assert.ok(map.facts.length > 0, 'a map with no facts rule would leave the demo claims standing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a template's own files are never overwritten — its word about its own content wins", () => {
  const mine = '// this template ships its own\n'
  const myMap = JSON.stringify({ schemaVersion: 'tracy-personalize/v1', identity: [] })
  const dir = packed({ files: { 'tools/personalize.mjs': mine, 'seed/personalize.json': myMap } })
  try {
    complete(dir)
    assert.equal(readFileSync(join(dir, 'tools', 'personalize.mjs'), 'utf8'), mine)
    assert.equal(readFileSync(join(dir, 'seed', 'personalize.json'), 'utf8'), myMap)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a template the fleet has no map for still gets the tool, and no map is invented for it', () => {
  const dir = packed({ id: 'some-other-template' })
  try {
    complete(dir)
    assert.ok(existsSync(join(dir, 'tools', 'personalize.mjs')), 'the tool is generic — it always applies')
    assert.equal(
      existsSync(join(dir, 'seed', 'personalize.json')),
      false,
      'a map written for another template would rewrite fields this one does not have'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the map for tracy-saas removes the demo claims and hides the pages that are only claims', () => {
  const map = JSON.parse(readFileSync(join(STOCK, 'tracy-saas', 'personalize.json'), 'utf8'))
  const text = JSON.stringify(map)
  assert.doesNotMatch(text, /__THE DEMO BRAND|__a field|__page__/, 'starter placeholders left in')
  assert.ok(
    map.replace.some((r) => r.find.includes('Helix')),
    'the demo brand is Helix Labs'
  )
  for (const claim of ['pricing-plans', 'about-team', 'home-testimonials', 'home-trust-logos'])
    assert.ok(
      map.facts.some((f) => f.slug === claim),
      `${claim} states things about a business Tracy cannot know`
    )
  assert.deepEqual(
    map.hide.map((h) => h.slug).sort(),
    ['changelog', 'helixql', 'pricing', 'team'],
    'pages that are nothing but the demo product'
  )
  const questions = JSON.parse(readFileSync(join(STOCK, 'tracy-saas', 'questions.json'), 'utf8'))
  assert.equal(questions.owner, 'tracy-saas/emdash')
  assert.ok(questions.questions.some((q) => q.id === 'name'))
})
