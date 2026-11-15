// The gate's real write gets the doors the app gives the write step (ticket #586, review round 2): the door client and,
// beside it, `sheets` (the build team's own door, `templateSheetsDoor`, over the site's own origin: both themes of the
// home page and every page the site lists), from which the accent module is built. Without it the write stopped at the accent with
// `door_not_available`, whatever the template. And each process writes into a run folder of its own, so a resumed gate
// never takes another process's write record for its own (T1). An invented florist page served on this machine, the
// accent op of JA Boxing's marker build on the memory site, invented door answers.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MEMORY_TEMPLATE_ACCENT,
  memorySheetsOf
} from '../../packages/wo/website-opportunities/domain/write-order-memory-sheets.mjs'
import { templateAccentOf } from '../../apps/tracy-web/src/step-chain-draft-write-accent.js'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { joomlaSheetsDoor } from '../ai-quickstart/gate/adapters/joomla-sheets.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { siteSession } from '../ai-quickstart/gate/site-session.mjs'
import { realWrite } from '../ai-quickstart/gate/site-write.mjs'

const send = async (operation) =>
  operation === 'info'
    ? { info: { component: '1.0.0' } }
    : operation === 'content.contract'
      ? { contract: 'petal-blank/j6/1.0.0', revision: 'rev-1' }
      : { ok: true }
const input = (out, extra = {}) => ({
  send,
  base: 'http://florist.example',
  siteKey: 'a'.repeat(64),
  built: { writePlan: { ops: [] } },
  out,
  pin: '1.0.0',
  log: () => {},
  open: async () => null,
  ...extra
})
const tmp = () => mkdtempSync(path.join(tmpdir(), 'gate-sheets-'))

/** An invented florist site: each theme of the home page and one listed page link a sheet of their own. */
function floristServer() {
  const css = {
    '/media/templates/site/petal/css/template.css': ':root{--petal-accent:#3a7d44}',
    '/media/templates/site/petal/css/dark.css': ':root{--petal-dark:#1d3b22}',
    '/media/templates/site/petal/css/shop.css': '.shop{color:#3a7d44}'
  }
  const page = (...sheets) =>
    '<html><head>' +
    sheets.map((h) => '<link rel="stylesheet" href="' + h + '">').join('') +
    '<link rel="stylesheet" href="https://fonts.example.net/x.css"></head></html>'
  const asked = []
  const server = createServer((req, res) => {
    asked.push(req.url)
    const [p, q] = req.url.split('?')
    if (css[p]) return res.end(css[p])
    if (p === '/index.php' && q === 'theme=light')
      return res.end(page('/media/templates/site/petal/css/template.css'))
    if (p === '/index.php' && q === 'theme=dark')
      return res.end(
        page('/media/templates/site/petal/css/template.css', '/media/templates/site/petal/css/dark.css')
      )
    if (p === '/index.php/shop') return res.end(page('/media/templates/site/petal/css/shop.css'))
    res.statusCode = 404
    res.end('')
  })
  return { server, css, asked }
}

test('the sheets door is the build team door: both themes of the home page and every listed page, the site own only', async () => {
  const { server, css, asked } = floristServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/'
    const listed = []
    const pagesSend = async (door, body) => {
      listed.push([door, body])
      return { pages: [{ route: 'home' }, { route: 'shop' }] }
    }
    const sheets = await joomlaSheetsDoor({ base, send: pagesSend })({ variables: ['--petal-accent'] })
    assert.deepEqual(listed, [['content.contract', { operation: 'inspect' }]])
    assert.deepEqual([...sheets].sort(), Object.values(css).sort())
    assert.equal(templateAccentOf(sheets, ['--petal-accent']), '#3a7d44')
    assert.ok(asked.includes('/index.php?theme=dark') && asked.includes('/index.php/shop'))
    assert.ok(!asked.some((u) => u.includes('fonts.example.net')))
  } finally {
    server.close()
  }
})

test('a site whose pages link no sheet is the typed stop sheets_unreadable, never an empty list', async () => {
  const server = createServer((req, res) => res.end('<html><head></head><body>petal</body></html>'))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/'
    await assert.rejects(joomlaSheetsDoor({ base })({}), (e) => {
      assert.equal(e.code, 'sheets_unreadable')
      assert.equal(e.details?.reason, 'no_sheet')
      return true
    })
  } finally {
    server.close()
  }
})

test('the real write gives the write step the sheets door beside the door client', async () => {
  const out = tmp()
  let doors = null
  const sheets = async () => ['x']
  await realWrite(
    input(out, {
      sheets,
      run: async (args) => {
        doors = args.doors
        return { status: 'done' }
      }
    })
  )
  assert.equal(doors.sheets, sheets)
  for (const door of ['update', 'contract', 'media']) assert.equal(typeof doors[door], 'function', door)
  rmSync(out, { recursive: true, force: true })
})

test('on the memory site: the accent op stops door_not_available without the door, and goes past it with one', async () => {
  const dir = new URL(
    '../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
    import.meta.url
  )
  const json = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
  const kit = {
    ref: 'ja-boxing/j6@1.0.11',
    template: { slug: 'ja-boxing', version: '1.0.11' },
    blockStore: json('block-store.json'),
    pageRecipes: json('page-recipes.json'),
    mapping: json('mapping.json'),
    blankContract: json('blank-site-contract/content-map.json'),
    lock: json('blank-site-contract/presentation-lock.json')
  }
  const built = await markerBuild(kit, {
    iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
    tryWrite: memoryTryWrite(kit)
  })
  const accent = built.writePlan.ops.find((o) => o.kind === 'look.accent')
  assert.ok(accent, 'the marker build writes the accent')
  const plan = { ...built.writePlan, ops: [accent] }
  const without = tmp()
  const a = await realWrite(input(without, { built: { writePlan: plan } }))
  assert.equal(a.report.code, 'door_not_available')
  const withDoor = tmp()
  const b = await realWrite(
    input(withDoor, {
      built: { writePlan: plan },
      sheets: async ({ variables } = {}) => memorySheetsOf(variables)
    })
  )
  assert.notEqual(b.report.code, 'door_not_available', JSON.stringify(b.report).slice(0, 300))
  assert.ok(MEMORY_TEMPLATE_ACCENT)
  rmSync(without, { recursive: true, force: true })
  rmSync(withDoor, { recursive: true, force: true })
})

test('T1: each process writes into its own run folder, never into another run record', async () => {
  const out = tmp()
  const seen = []
  const session = () =>
    siteSession({
      base: 'http://florist.example/',
      token: 'example',
      out,
      pin: null,
      kit: {},
      platform: 'joomla',
      log: () => {},
      writeStep: async (args) => {
        seen.push(path.relative(out, args.out))
        return { report: { status: 'done' }, record: {}, plugin: {} }
      }
    })
  const first = session()
  await first.write({ registry: new Map() })
  await first.write({ registry: new Map() })
  const resumed = session()
  await resumed.write({ registry: new Map() })
  assert.deepEqual(seen, [
    path.join('writes', 'run-1', '1'),
    path.join('writes', 'run-1', '2'),
    path.join('writes', 'run-2', '1')
  ])
  assert.ok(existsSync(path.join(out, 'writes', 'run-2')))
  rmSync(out, { recursive: true, force: true })
})
