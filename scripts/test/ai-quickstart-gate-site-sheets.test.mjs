// The gate's real write gets the doors the app gives the write step (ticket #586, review round 2): the door client and,
// beside it, `sheets` (the stylesheets the template serves on the home page, read as `readSiteSheets` of the app
// reads them), from which the accent module is built. Without it the write stopped at the accent with
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

test('the sheets door reads the stylesheets the template serves on the home page, the site own only', async () => {
  const css = ':root{--petal-accent:#3a7d44}'
  const server = createServer((req, res) => {
    if (req.url === '/media/templates/site/petal/css/template.css') return res.end(css)
    if (req.url === '/' || req.url === '/index.php')
      return res.end(
        '<html><head><link rel="stylesheet" href="/media/templates/site/petal/css/template.css">' +
          '<link rel="stylesheet" href="https://fonts.example.net/x.css"><style>a{color:#3a7d44}</style></head></html>'
      )
    res.statusCode = 404
    res.end('')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/'
    const sheets = await joomlaSheetsDoor({ base })({ variables: ['--petal-accent'] })
    assert.deepEqual(sheets, [css, 'a{color:#3a7d44}'])
    assert.equal(templateAccentOf(sheets, ['--petal-accent']), '#3a7d44')
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
