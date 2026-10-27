import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  DEPENDENCIES,
  REDEPLOYED,
  digestTree,
  planRedeploy,
  presentEntries,
  scalarsFor
} from '../scripts/provision/emdash/redeploy-template.mjs'

// Three views of one site, as digest maps: the package to deploy, the site's /app now, and the
// image the site's container was created from.
const deps = { 'package.json': 'p1', 'pnpm-lock.yaml': 'l1' }
const created = {
  ...deps,
  'src/pages/index.astro': 'a1',
  'src/middleware.ts': 'm1',
  'astro.config.mjs': 'c1'
}
const pkg = {
  ...deps,
  'src/pages/index.astro': 'a2',
  'src/middleware.ts': 'm2',
  'src/lib/stamps.ts': 's1',
  'astro.config.mjs': 'c2',
  'tools/content-api/reader.mjs': 'r1',
  'seed/content-api-map.json': 'map1'
}

test('the redeployed set never names customer content, credentials or the site identity', () => {
  for (const p of ['data', 'uploads', 'template.config.json', 'artifact.json', 'package.json'])
    assert.ok(!REDEPLOYED.some((e) => e === p || p.startsWith(`${e}/`) || e.startsWith(`${p}/`)), p)
  assert.deepEqual([...DEPENDENCIES], ['package.json', 'pnpm-lock.yaml'])
})

test('an untouched site gets the package: every changed or new file, entries the package has', () => {
  const plan = planRedeploy({ pkg, site: created, created })
  assert.equal(plan.action, 'redeploy')
  assert.deepEqual(plan.entries, [
    'src',
    'astro.config.mjs',
    'tools/content-api',
    'seed/content-api-map.json'
  ])
  assert.deepEqual(plan.changed, [
    'astro.config.mjs',
    'seed/content-api-map.json',
    'src/lib/stamps.ts',
    'src/middleware.ts',
    'src/pages/index.astro',
    'tools/content-api/reader.mjs'
  ])
  assert.deepEqual(plan.edits, [])
})

test('a file the template dropped counts as a change, so it leaves the site', () => {
  const site = { ...created, 'src/lib/old-guard.ts': 'g1' }
  const plan = planRedeploy({ pkg, site, created: site })
  assert.ok(plan.changed.includes('src/lib/old-guard.ts'))
})

test('a site already on the package is current', () => {
  assert.equal(planRedeploy({ pkg, site: pkg, created }).action, 'current')
})

test('entries the package does not carry are not compared and not touched', () => {
  const site = { ...pkg, 'public/logo.svg': 'x', 'seed/site-model.json': 'y' }
  const plan = planRedeploy({ pkg, site, created: site })
  assert.equal(plan.action, 'current')
  assert.ok(!plan.entries.includes('public'))
})

test('different dependencies need a new image, not a redeploy', () => {
  const plan = planRedeploy({ pkg: { ...pkg, 'pnpm-lock.yaml': 'l2' }, site: created, created })
  assert.equal(plan.action, 'skip')
  assert.match(plan.detail, /pnpm-lock\.yaml differ/)
  assert.match(plan.detail, /new image/)
})

test('local edits are kept unless the caller says to overwrite them', () => {
  const site = { ...created, 'src/middleware.ts': 'customer' }
  const kept = planRedeploy({ pkg, site, created })
  assert.equal(kept.action, 'skip')
  assert.match(kept.detail, /local edits in 1 file\(s\) \(src\/middleware\.ts\)/)
  const forced = planRedeploy({ pkg, site, created, overwriteEdits: true })
  assert.equal(forced.action, 'redeploy')
  assert.deepEqual(forced.edits, ['src/middleware.ts'])
  assert.match(forced.detail, /overwriting 1 local edit/)
})

test('a package with none of the redeployed files is refused', () => {
  assert.equal(planRedeploy({ pkg: deps, site: created, created }).action, 'skip')
})

test('the Content API switch follows the container env first, then the image label', () => {
  assert.deepEqual(scalarsFor({}, ['PATH=/x', 'TRACY_CONTENT_API_SCALARS=1']), {
    on: true,
    why: 'container env'
  })
  assert.deepEqual(scalarsFor({ 'io.tracy.content-api.scalars': '1' }, ['PATH=/x']), {
    on: true,
    why: 'image label'
  })
  assert.equal(scalarsFor({ 'io.tracy.content-api.scalars': '0' }, ['TRACY_CONTENT_API_SCALARS=0']).on, false)
  assert.equal(scalarsFor(null, null).on, false)
})

test('digestTree hashes files, links and nested dirs, skips node_modules, and runs from its own text', () => {
  const root = mkdtempSync(join(tmpdir(), 'redeploy-'))
  try {
    mkdirSync(join(root, 'src/data'), { recursive: true })
    mkdirSync(join(root, 'src/node_modules/x'), { recursive: true })
    writeFileSync(join(root, 'src/data/a.json'), '{}')
    writeFileSync(join(root, 'src/node_modules/x/i.js'), '')
    writeFileSync(join(root, 'astro.config.mjs'), 'export default {}\n')
    symlinkSync('a.json', join(root, 'src/data/link.json'))
    const d = digestTree(root, ['src', 'astro.config.mjs', 'public'])
    assert.deepEqual(Object.keys(d).sort(), ['astro.config.mjs', 'src/data/a.json', 'src/data/link.json'])
    assert.equal(d['src/data/link.json'], 'link:a.json')
    assert.match(d['astro.config.mjs'], /^[0-9a-f]{64}$/)
    assert.deepEqual(presentEntries(d), ['src', 'astro.config.mjs'])
    const again = new Function(`return ${digestTree.toString()}`)()
    assert.deepEqual(again(root, ['src', 'astro.config.mjs', 'public']), d)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('package.json counts by its dependencies, not by its version line', () => {
  const root = mkdtempSync(join(tmpdir(), 'redeploy-'))
  try {
    const write = (/** @type {object} */ j) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify(j))
      return digestTree(root, ['package.json'])['package.json']
    }
    const a = write({ name: 't', version: '1.4.3', dependencies: { emdash: '0.38.0' } })
    const b = write({ name: 't', version: '1.4.5', dependencies: { emdash: '0.38.0' } })
    const c = write({ name: 't', version: '1.4.5', dependencies: { emdash: '0.39.0' } })
    assert.equal(a, b)
    assert.notEqual(b, c)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('when the image the site was created from is gone, local edits are unknown: a refusal unless --overwrite-edits', () => {
  const site = { ...created, 'src/lib/stamps.ts': 'old' }
  const refused = planRedeploy({ pkg, site, created: null })
  assert.equal(refused.action, 'skip')
  assert.match(refused.detail, /created from is gone/)
  const forced = planRedeploy({ pkg, site, created: null, overwriteEdits: true })
  assert.equal(forced.action, 'redeploy')
  assert.match(forced.detail, /local edits not checked/)
})
