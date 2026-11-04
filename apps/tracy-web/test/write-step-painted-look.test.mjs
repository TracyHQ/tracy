// A replaced icon keeps the look of the template icon it replaces (#380), through the write step's entry point: the recipe says
// no plate and a regular weight, as a picture step that could not read the template says it, and the template icon decides.
// Every colour and picture here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconLookOf, looksDiffer } from '../src/lib/picture-paint/icons/template-icon-look.js'
import { templateIcon } from './_template-icon-fixtures.mjs'
import { preparePainted } from '../src/write-step/painted-stage.js'
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

test('an icon that replaces a template icon is refused when nothing can read that icon', async () => {
  const { report, uploaded } = await runPainted({ items, contentMap, templateAccent: TEMPLATE_ACCENT })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'LOOK_GUARD')
  assert.equal(report.cause.stepName, 'pictures')
  assert.match(report.cause.reason, /no reader of the site's files/)
  assert.deepEqual(uploaded, [], 'nothing went out')
})

/** The painted stage with a drawing code that gets it wrong, to see the guard refuse what it draws. */
async function paintedWith(wrong) {
  const template = await templateFiles()
  const bytes = await templateIcon(wrong)
  return preparePainted({
    painted: [iconItem('block-3.icon')],
    brand: { colours: { accent: ACCENT } },
    brandPath: '/nowhere/brand.json',
    contentMap,
    figures: new Map(),
    templateFile: (file) => template.read({ file }),
    templateAccent: TEMPLATE_ACCENT,
    draw: async () => ({
      bytes,
      ext: 'png',
      width: 150,
      height: 150,
      sha256: 'abc',
      drawnIn: { glyph: ACCENT, plate: '#17171b', plateFollows: 'template' }
    })
  })
}

test('what is painted is held to the template file: same disc, weight and file, green', async () => {
  const { refused } = await paintedWith({ disc: '#17171b', stroke: 3 })
  assert.deepEqual(refused, [])
})

test('a drawn icon whose backing, line, colour or file size moved from the template icon is refused, naming the picture step', async () => {
  for (const [what, wrong, words] of [
    ['no backing', { stroke: 3 }, /no backing/],
    ['another weight', { disc: '#17171b', stroke: 8 }, /line is/],
    ['another backing', { disc: '#17171b', stroke: 3, opacity: 0.5 }, /opacity/],
    ['another colour', { disc: '#e8e8f0', stroke: 3 }, /should be #17171b/],
    [
      'another file size',
      { disc: '#17171b', stroke: 3, size: 300 },
      /its file is 300x300, the template's 150x150/
    ]
  ]) {
    const { refused } = await paintedWith(wrong)
    assert.ok(refused.length, what)
    assert.equal(refused[0].step, 8, what)
    assert.match(refused.map((r) => r.reason).join(' '), words, what)
  }
})
