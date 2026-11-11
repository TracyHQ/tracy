import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openContentMap } from '../src/lib/content-map-source.js'
import { kitContracts } from '../src/lib/template-kit-contracts.js'
import { openKit, readableKits } from '../src/lib/template-kit-source.js'

const REF = 'tracy-restaurant/emdash-0.x/1.0.2'

test('the authored Restaurant EmDash kit and exact content map are discoverable without a profile manifest', () => {
  const found = readableKits().find((kit) => kit.ref === REF)
  assert.ok(found, 'the approved Restaurant kit must be discoverable')
  assert.equal(found.platform, 'emdash')
  assert.equal(found.approved, true)
  assert.equal(found.images, 192)
  const kit = openKit(REF)
  assert.equal(kit.doc.approval.by, 'hano-xbt')
  assert.equal(kit.release, 'tracy-restaurant/emdash-0.x')
  const map = openContentMap(REF)
  assert.equal(map.doc.template, 'tracy-restaurant')
  assert.equal(map.doc.version, '1.0.2')
})

test('an explicit empty index never discovers deployment kits', () => {
  const index = new Map()
  assert.deepEqual(readableKits({ index }), [])
  assert.equal(openKit(REF, { index }), null)
  assert.equal(openContentMap(REF, { index }), null)
})

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-kit-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cmsRoot = path.join(root, 'cms')
  const imageRoot = path.join(root, 'image')
  const dir = path.join(cmsRoot, 'tracy-emdash-theme-restaurant/contracts/1.0.2')
  mkdirSync(dir, { recursive: true })
  const source = new URL(
    '../../../packages/cms/tracy-emdash-theme-restaurant/contracts/1.0.2/',
    import.meta.url
  )
  const kit = JSON.parse(readFileSync(new URL('template-kit.json', source), 'utf8'))
  const map = JSON.parse(readFileSync(new URL('content-map.json', source), 'utf8'))
  const save = () => {
    writeFileSync(path.join(dir, 'template-kit.json'), JSON.stringify(kit))
    writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  }
  save()
  return {
    kit,
    map,
    save,
    dir,
    imageRoot,
    cmsRoot,
    read: () => kitContracts({ index: new Map(), cmsRoot, imageRoot })
  }
}

test('checkout and shipped-image discovery use authored identity without writing a manifest', (t) => {
  const f = fixture(t)
  assert.equal(readableKits({ index: f.read() })[0].ref, REF)
  assert.equal(existsSync(path.join(f.dir, 'manifest.json')), false)
  const dir = path.join(f.imageRoot, 'tracy-restaurant/emdash-0.x/1.0.2')
  mkdirSync(dir, { recursive: true })
  for (const file of ['template-kit.json', 'content-map.json']) {
    writeFileSync(path.join(dir, file), readFileSync(path.join(f.dir, file)))
  }
  rmSync(f.cmsRoot, { recursive: true })
  assert.equal(openKit(REF, { index: f.read() }).doc.approval.by, 'hano-xbt')
  assert.equal(existsSync(path.join(dir, 'manifest.json')), false)
})

test('mismatched or corrupt EmDash identity is never listed under an authored approval', (t) => {
  const f = fixture(t)
  f.kit.contract = 'tracy-other/emdash-0.x/1.0.2'
  f.save()
  assert.deepEqual(readableKits({ index: f.read() }), [])
  f.kit.contract = REF
  f.map.version = '1.0.3'
  f.save()
  assert.equal(openKit(REF, { index: f.read() }), null)
  f.map.version = '1.0.2'
  f.kit.quickstart.version = '1.0.3'
  f.save()
  assert.equal(openContentMap(REF, { index: f.read() }), null)
  writeFileSync(path.join(f.dir, 'template-kit.json'), '{')
  assert.deepEqual(readableKits({ index: f.read() }), [])
})

test('discovery preserves a missing approval instead of manufacturing acceptance', (t) => {
  const f = fixture(t)
  delete f.kit.approval
  f.save()
  assert.equal(readableKits({ index: f.read() })[0].approved, false)
  assert.equal(openKit(REF, { index: f.read() }).doc.approval, undefined)
})

test('default discovery reuses its index while explicit roots remain fresh', (t) => {
  assert.equal(kitContracts(), kitContracts())
  const f = fixture(t)
  const first = f.read()
  assert.notEqual(first, f.read())
  delete f.kit.approval
  f.save()
  assert.equal(readableKits({ index: f.read() })[0].approved, false)
})

test('empty or mismatched folder metadata never supplies a discovered identity', (t) => {
  const f = fixture(t)
  f.map.template = ''
  f.kit.template.name = ''
  f.kit.contract = '/emdash-0.x/1.0.2'
  f.save()
  assert.equal(f.read().size, 0)
  f.map.template = 'tracy-restaurant'
  f.kit.template.name = 'tracy-restaurant'
  f.map.version = ''
  f.kit.quickstart.version = ''
  f.kit.contract = 'tracy-restaurant/emdash-0.x/'
  f.save()
  assert.equal(f.read().size, 0)
  f.map.version = '1.0.3-beta.1'
  f.kit.quickstart.version = '1.0.3-beta.1'
  f.kit.contract = 'tracy-restaurant/emdash-0.x/1.0.3-beta.1'
  f.save()
  assert.equal(f.read().size, 0)
  const prereleaseDir = path.join(path.dirname(f.dir), '1.0.3-beta.1')
  mkdirSync(prereleaseDir)
  for (const file of ['content-map.json', 'template-kit.json']) {
    writeFileSync(path.join(prereleaseDir, file), readFileSync(path.join(f.dir, file)))
  }
  assert.equal(f.read().size, 1, 'matching prerelease metadata remains discoverable')
})

test('image metadata is authoritative and duplicate identities within one surface fail closed', (t) => {
  const f = fixture(t)
  const dir = path.join(f.imageRoot, 'tracy-restaurant/emdash-0.x/1.0.2')
  mkdirSync(dir, { recursive: true })
  for (const file of ['content-map.json', 'template-kit.json']) {
    writeFileSync(path.join(dir, file), readFileSync(path.join(f.dir, file)))
  }
  assert.equal(f.read().get('tracy-restaurant/emdash-0.x@1.0.2').dir, dir)
  const duplicate = path.join(f.imageRoot, 'other/emdash-0.x/1.0.2')
  mkdirSync(duplicate, { recursive: true })
  for (const file of ['content-map.json', 'template-kit.json']) {
    writeFileSync(path.join(duplicate, file), readFileSync(path.join(f.dir, file)))
  }
  assert.throws(() => f.read(), /identity is claimed more than once/)
})
