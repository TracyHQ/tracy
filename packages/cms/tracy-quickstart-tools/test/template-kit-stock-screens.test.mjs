// Template kit `site.stockScreens`: the template's stock screens every plan drops (a list of demo writers, a type sample),
// declared by a person when packaging (`cli.mjs stock-screens`). A made-up kit; every path and reason is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { stockScreensOf } from '../../../../apps/tracy-web/src/lib/stock-screens.js'
import { declareStockScreen } from '../template-kit/lib/stock-screens.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const WHY = 'the invented guide list shows demo accounts, which are no contract content'

test('declaring adds a path once with its reason, a beneath path too, and --none sets an empty list', () => {
  const kit = { site: {} }
  assert.deepEqual(declareStockScreen(kit, { path: '/guides', why: WHY }), { error: null, changed: true })
  assert.deepEqual(declareStockScreen(kit, { path: '/guides', why: WHY }), { error: null, changed: false })
  assert.deepEqual(declareStockScreen(kit, { path: '/guides/author/*', why: WHY }), {
    error: null,
    changed: true
  })
  assert.deepEqual(kit.site.stockScreens, [
    { path: '/guides', why: WHY },
    { path: '/guides/author/*', why: WHY }
  ])
  assert.match(declareStockScreen(kit, { path: '/guides' }).error, /--why/)
  for (const bad of ['/', 'guides', '/a/*/b', '/a b', '*'])
    assert.match(declareStockScreen(kit, { path: bad, why: WHY }).error, /page address/, bad)
  assert.match(declareStockScreen({}, { path: '/guides', why: WHY }).error, /site part/)
  assert.match(declareStockScreen(kit, { none: true }).error, /--why/)
  assert.deepEqual(declareStockScreen(kit, { none: true, why: WHY }), { error: null, changed: true })
  assert.deepEqual(kit.site.stockScreens, [])
  assert.deepEqual(kit.site.noneWhy, { stockScreens: WHY })
  declareStockScreen(kit, { path: '/guides', why: WHY })
  assert.equal(kit.site.noneWhy, undefined, 'an entry takes the none reason back')
})

test('what the cli declares is what the planner and the write step read', () => {
  const kit = { site: {} }
  declareStockScreen(kit, { path: '/guides/author/*', why: WHY })
  declareStockScreen(kit, { path: '/style-sample', why: WHY })
  assert.deepEqual(stockScreensOf(kit), {
    screens: [
      { path: '/guides/author/*', why: WHY },
      { path: '/style-sample', why: WHY }
    ],
    problems: []
  })
})

test('cli: stock-screens writes the kit in place with its own indent, and nothing on a bad path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-stock-screens-'))
  try {
    const file = join(dir, 'template-kit.json')
    const before = `${JSON.stringify({ kit: 'x', site: { head: {} } }, null, 2)}\n`
    writeFileSync(file, before)
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, 'stock-screens', '--kit', file, ...args], { encoding: 'utf8' })
    assert.equal(run('--path', '/', '--why', WHY).status, 1)
    assert.equal(readFileSync(file, 'utf8'), before, 'untouched')
    assert.equal(run('--why', WHY).status, 2, 'a path or --none is needed')
    const ok = run('--path', '/guides', '--why', WHY)
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /1 stock screens named/)
    const written = readFileSync(file, 'utf8')
    assert.ok(written.startsWith('{\n  "kit"'))
    assert.deepEqual(JSON.parse(written).site.stockScreens, [{ path: '/guides', why: WHY }])
    assert.equal(run('--path', '/guides', '--why', WHY).status, 0)
    assert.equal(readFileSync(file, 'utf8'), written, 'idempotent')
    assert.equal(run('--none').status, 1)
    assert.equal(readFileSync(file, 'utf8'), written, 'a none without a reason writes nothing')
    assert.equal(run('--none', '--why', WHY).status, 0)
    const site = JSON.parse(readFileSync(file, 'utf8')).site
    assert.deepEqual(site.stockScreens, [])
    assert.deepEqual(site.noneWhy, { stockScreens: WHY })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
