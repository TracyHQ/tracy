// A replaced icon keeps the look of the template icon it replaces (#380), through the write step's entry point: the recipe says
// no plate and a regular weight, as a picture step that could not read the template says it, and the template icon decides.
// Every colour and picture here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconLookOf, looksDiffer } from '../src/site-pictures/icons/template-icon-look.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { templateIcon } from './_template-icon-fixtures.mjs'
import { CONTRACT } from './_write-step-run.mjs'
import { ACCENT, coloursIn, iconItem, runPainted } from './_write-step-painted.mjs'

const TEMPLATE_ACCENT = '#d83a3a'
const DARK_FILE = 'images/demo/icons/card-dark.png'
const LIGHT_FILE = 'images/demo/icons/card-light.png'
const contentMap = {
  slots: [
    { key: 'module-3.icon', type: 'image', sample: `${DARK_FILE}#joomlaImage://x?width=100&height=100` },
    { key: 'module-3.twin', type: 'image', sample: LIGHT_FILE }
  ]
}
const items = () => [iconItem('block-3.icon'), iconItem('block-3.twin')]

async function templateFiles() {
  const files = new Map([
    [DARK_FILE, await templateIcon({ disc: '#17171b', stroke: 3 })],
    [LIGHT_FILE, await templateIcon({ disc: TEMPLATE_ACCENT, opacity: 0.1, stroke: 3 })]
  ])
  const asked = []
  return { files, asked, read: async ({ file }) => (asked.push(file), files.get(file) ?? null) }
}

const run = async (over = {}) => {
  const template = await templateFiles()
  const got = await runPainted({
    items,
    contentMap,
    templateFiles: template.read,
    templateAccent: TEMPLATE_ACCENT,
    ...over
  })
  return { ...got, template }
}

test('a replaced icon has the size, weight and backing of the one it replaces, though its recipe says none', async () => {
  const { sent, bytesAt, template, report } = await run()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  for (const [key, file] of [
    ['module-3.icon', DARK_FILE],
    ['module-3.twin', LIGHT_FILE]
  ]) {
    const was = await iconLookOf(template.files.get(file))
    const now = await iconLookOf(bytesAt(sent[key]))
    assert.deepEqual([now.width, now.height], [150, 150])
    assert.ok(now.plate, 'it has its backing')
    assert.deepEqual(looksDiffer(was, now), [])
  }
})

test('the drawing is the accent of the brand, on the template disc; a tint of the template accent becomes the brand accent', async () => {
  const { sent, bytesAt, line } = await run()
  const dark = await coloursIn(bytesAt(sent['module-3.icon']))
  assert.ok(dark.has(ACCENT), 'the glyph is in the brand accent')
  assert.ok(dark.has('#17171b'), 'the neutral disc stays the template one')
  assert.equal(line('block-3.icon').painted.drawnIn.plateFollows, 'template')
  const twin = line('block-3.twin').painted.drawnIn
  assert.equal(twin.plateFollows, 'accent')
  assert.equal(twin.plate, ACCENT)
  const light = await iconLookOf(bytesAt(sent['module-3.twin']))
  assert.ok(Math.abs(light.plate.opacity - 0.1) < 0.02)
  assert.ok((await coloursIn(bytesAt(sent['module-3.twin']))).has(ACCENT))
})

test('each template file is read once, and the same inputs draw the same files', async () => {
  const first = await run()
  assert.deepEqual(first.template.asked.sort(), [DARK_FILE, LIGHT_FILE])
  const second = await run()
  assert.deepEqual(second.sent, first.sent)
})

test('a second run with the same inputs uploads nothing and sends no icon again', async () => {
  const first = await run()
  const second = await run({ last: first.report })
  for (const key of ['module-3.icon', 'module-3.twin']) {
    assert.ok(first.uploaded.includes(first.sent[key]), 'the first run uploaded it')
    assert.ok(!second.uploaded.includes(first.sent[key]), 'the second does not')
  }
  assert.equal(second.sent['module-3.icon'], undefined)
  assert.equal(second.sent['module-3.twin'], undefined)
})

test('the line says which template icon it follows and what it read', async () => {
  const { line } = await run()
  const { template } = line('block-3.icon').painted
  assert.equal(template.file, DARK_FILE)
  assert.equal(template.look.weight, 'thin')
})

test('a template icon that cannot be read stops that icon, in words, and never draws the recipe instead', async () => {
  const { line, sent } = await run({
    templateFiles: async ({ file }) => (file === DARK_FILE ? null : Buffer.alloc(0))
  })
  assert.equal(line('block-3.icon').status, 'failed')
  assert.match(line('block-3.icon').reason, /could not be read/)
  assert.equal(sent['module-3.icon'], undefined)
})

test('a slot with no template icon draws its recipe, and its line says there was none', async () => {
  const { line } = await run({ contentMap: { slots: [{ key: 'module-3.icon', type: 'image', sample: '' }] } })
  assert.equal(line('block-3.icon').status, 'written')
  assert.equal(line('block-3.icon').painted.template, null)
})

/** The guard through the site check's entry point, over a run's report and the files the fake site holds. */
async function guard(got, { frames = [], boxes = [], reportOf = (r) => r, file = null } = {}) {
  const held = got.template?.files ?? new Map()
  const report = reportOf(got.report)
  const pictureBoxes = boxes
  const host = async () => ({
    checks: [],
    visited: [],
    pageMeasures: [{ path: '/', width: 1440, pictureBoxes }]
  })
  const door = {
    apply: async (call) =>
      call.action === 'content.contract'
        ? {
            ok: true,
            contract: CONTRACT,
            revision: 'r',
            pages: [{ route: 'home', entity: 'menuItem-1' }],
            slots: []
          }
        : { ok: false }
  }
  const siteFile = async (path) => file?.(path) ?? held.get(path) ?? got.bytesAt(path)
  const { iconLookGroup } = await import('../src/site-check/icon-look.js')
  const check = await runSiteCheck({
    door,
    report,
    host,
    siteFile,
    baseline: { iconFrames: frames },
    groups: [iconLookGroup]
  })
  return check.groups[0]
}

test('the site check passes a replaced icon that keeps the look', async () => {
  const got = await run()
  const painted = got.report.slots.find((s) => s.slot === 'block-3.icon').ordered
  const group = await guard(got, {
    frames: [{ page: '/', file: DARK_FILE, width: 100, height: 100 }],
    boxes: [{ src: `http://site.test/${painted}`, width: 100, height: 100 }]
  })
  assert.equal(group.status, 'green', JSON.stringify(group))
  assert.equal(group.checked, 2)
})

test('the site check blocks a replaced icon drawn bare, and names the picture step', async () => {
  const bare = await runPainted({ items, contentMap, templateAccent: TEMPLATE_ACCENT })
  const group = await guard(bare, { frames: [] })
  assert.equal(group.status, 'red')
  assert.equal(group.failures[0].causingStep, 8)
  assert.match(group.failures[0].reason, /picture step/)
})

test('the site check blocks a file whose backing, size or weight moved from the template icon', async () => {
  const got = await run()
  const path = got.report.slots.find((s) => s.slot === 'block-3.icon').ordered
  for (const [what, wrong, words] of [
    ['no backing', { stroke: 3 }, /no backing/],
    ['another weight', { disc: '#17171b', stroke: 8 }, /line is/],
    ['another backing', { disc: '#17171b', stroke: 3, opacity: 0.5 }, /opacity/],
    ['another colour', { disc: '#e8e8f0', stroke: 3 }, /should be #17171b/]
  ]) {
    const bytes = await templateIcon(wrong)
    const twin = got.report.slots.find((s) => s.slot === 'block-3.twin').ordered
    const group = await guard(got, {
      file: (p) => (p === path || (what === 'another weight' && p === twin) ? bytes : null)
    })
    assert.equal(group.status, 'red', what)
    const failure = group.failures.find((f) => f.slot === 'block-3.icon')
    assert.match(failure.measured, words, what)
    assert.equal(failure.causingStep, 8)
  }
})

test('the site check blocks an icon drawn at another size on the page', async () => {
  const got = await run()
  const painted = got.report.slots.find((s) => s.slot === 'block-3.icon').ordered
  const group = await guard(got, {
    frames: [{ page: '/', file: DARK_FILE, width: 100, height: 100 }],
    boxes: [{ src: `/${painted}`, width: 180, height: 180 }]
  })
  assert.equal(group.status, 'red')
  assert.match(group.failures[0].measured, /180x180, the template's 100x100/)
})

test('a baseline without icon boxes is not green: the sizes were not measured', async () => {
  const got = await run()
  const { iconLookGroup } = await import('../src/site-check/icon-look.js')
  const check = await runSiteCheck({
    door: { apply: async () => ({ ok: true, contract: CONTRACT, revision: 'r', pages: [], slots: [] }) },
    report: got.report,
    host: async () => ({ checks: [], visited: [], pageMeasures: [] }),
    siteFile: async (path) => got.template.files.get(path) ?? got.bytesAt(path),
    baseline: {},
    groups: [iconLookGroup]
  })
  assert.equal(check.groups[0].status, 'unmeasured')
})
