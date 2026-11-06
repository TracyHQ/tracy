// Run folder, agent image and template font of the brand tools. Invented data only.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'
import { toAgentImage } from '../src/brand-step/agent-image.js'
import { diskRunFiles, memoryRunFiles } from '../src/brand-step/run-files.js'
import { brandTools, toolByName } from '../src/brand-step/tools/index.js'

const dirs = []
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'brand-run-'))
  dirs.push(d)
  return d
}

for (const [label, make] of [
  ['memory', () => memoryRunFiles()],
  ['disk', () => diskRunFiles(tempDir())]
]) {
  test(`${label} run folder: write never overwrites and returns the new path`, () => {
    const files = make()
    assert.equal(files.write('logo/logo.png', Buffer.from('a')), 'logo/logo.png')
    assert.equal(files.write('logo/logo.png', Buffer.from('b')), 'logo/logo.v2.png')
    assert.equal(files.write('logo/logo.png', Buffer.from('c')), 'logo/logo.v3.png')
    assert.equal(files.read('logo/logo.png').toString(), 'a')
    assert.equal(files.read('logo/logo.v3.png').toString(), 'c')
    assert.equal(files.has('logo/logo.v2.png'), true)
    assert.equal(files.has('logo/none.png'), false)
    assert.deepEqual(files.list('logo/'), ['logo/logo.png', 'logo/logo.v2.png', 'logo/logo.v3.png'])
    assert.throws(() => files.read('logo/none.png'))
  })

  test(`${label} run folder: paths stay inside the folder`, () => {
    const files = make()
    for (const bad of ['../x.png', '/etc/x', 'a/../../x', ''])
      assert.throws(() => files.write(bad, Buffer.from('x')), /not a path/)
    assert.equal(files.has('../x.png'), false)
  })
}

test('toAgentImage: long edge 512, never enlarged, alpha kept', async () => {
  const big = await sharp({
    create: { width: 2000, height: 1000, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } }
  })
    .png()
    .toBuffer()
  const small = await sharp({
    create: { width: 100, height: 40, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } }
  })
    .png()
    .toBuffer()
  const a = await sharp(await toAgentImage(big)).metadata()
  assert.deepEqual([a.width, a.height, a.hasAlpha], [512, 256, true])
  const b = await sharp(await toAgentImage(small)).metadata()
  assert.deepEqual([b.width, b.height], [100, 40])
})

test('the tool list: names match the approved prompt, each with a schema and a run', () => {
  assert.deepEqual(
    brandTools.map((t) => t.name),
    [
      'open_image',
      'measure_logo',
      'set_name',
      'cut_mark',
      'compose_logo',
      'fit_logo',
      'recolour_mark',
      'make_icon',
      'make_lettermark',
      'make_favicon',
      'name_slots',
      'build_design_system',
      'look_logo'
    ]
  )
  for (const t of brandTools) {
    assert.equal(typeof t.description, 'string')
    assert.equal(t.inputSchema.type, 'object')
    assert.equal(typeof t.run, 'function')
    assert.equal(toolByName(t.name), t)
  }
  for (const name of ['cut_mark', 'recolour_mark']) assert.equal(toolByName(name).name, name)
})
