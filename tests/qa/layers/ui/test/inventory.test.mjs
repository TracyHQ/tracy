// The denominator: extraction rules on inline sources, and the committed file against ground truth.

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { LAYER_DIR, REPO_ROOT } from '../artifacts.mjs'
import { loadLayer } from '../engine.mjs'
import {
  extractClientRegistrations,
  extractStoryExports,
  stateTagsOf,
  storyIdSuffix,
  storyKey
} from '../generate.mjs'
import { UI_TAGS, VIEWPORTS } from '../tables.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

test('story exports: const, function, named re-export, meta title, skipped and filtered cases', () => {
  const r = extractStoryExports(
    'a.stories.tsx',
    `export default { title: 'Pages/Home', component: X } satisfies Meta
export const Empty: Story = {}
export function Loaded() { return null }
const Hidden = {}
export { Hidden as WithInvitations }
export const __namedExportsOrder = []`
  )
  assert.deepEqual(r.names.sort(), ['Empty', 'Loaded', 'WithInvitations'])
  assert.equal(r.title, 'Pages/Home')
  assert.equal(r.filtered, false)
  const f = extractStoryExports(
    'b.stories.ts',
    `const meta = { includeStories: ['A'] }\nexport default meta\nexport const A = {}`
  )
  assert.equal(f.filtered, true)
  const d = extractStoryExports('c.stories.ts', `export const { a, b } = obj`)
  assert.deepEqual(d.names, [])
  assert.ok(d.notes.length > 0, 'a destructured export must be reported, not guessed')
  const reexport = extractStoryExports('d.stories.ts', `export * from './x'\nexport { y } from './z'`)
  assert.ok(reexport.notes.length > 0)
})

test('client registrations: literal slots resolve, non-literal ones are unresolved', () => {
  const r = extractClientRegistrations(
    'index.tsx',
    `ctx.slots.inject('sidebar.settings', () => ctx.slots.register({ name: 'sidebar.settings' }, X))
ctx.slots.register({ name: 'settings.close' }, Y)
ctx.slots.inject(NAME, () => null)
ctx.betterSidebar.registerTab({ type: 'tracy:brand' })
ctx.betterSidebar.registerTab({ type: TYPE })
ctx.betterSidebar.registerTab(config)`
  )
  assert.deepEqual(r.slots, ['settings.close', 'sidebar.settings'])
  assert.deepEqual(r.tabs, ['tracy:brand'])
  assert.equal(r.unresolved.length, 3)
})

test('storyIdSuffix matches the id Storybook gives an export', () => {
  assert.equal(storyIdSuffix('Empty'), 'empty')
  assert.equal(storyIdSuffix('WithInvitations'), 'with-invitations')
  assert.equal(storyIdSuffix('CssCheck'), 'css-check')
  assert.equal(storyIdSuffix('Variant2'), 'variant-2')
  assert.equal(storyIdSuffix('HTMLParser'), 'html-parser')
})

test('state tags are hints from the export name only', () => {
  assert.deepEqual(stateTagsOf('Loading'), ['loading'])
  assert.ok(stateTagsOf('EmptyDisabled').includes('empty'))
  assert.deepEqual(stateTagsOf('Default'), [])
})

test('story key is path-and-export, never a line number', () => {
  assert.equal(
    storyKey('packages/ui/tracy-ui/src/components/ui/button.stories.tsx', 'Default'),
    'kit-ui-button.Default'
  )
  assert.equal(
    storyKey('packages/dev/tracy-design/src/pages/home/NoSites.stories.tsx', 'Empty'),
    'bench-pages-home-NoSites.Empty'
  )
})

test('the committed denominator is exactly the stories a real Storybook index serves', async () => {
  const { denominator } = await loadLayer()
  const truth = JSON.parse(await readTextAsync(path.join(REPO_ROOT, 'tests/qa/fixtures/ui/story-index.json')))
  const fromIndex = new Map(
    truth.entries.map(([importPath, suffix, kind]) => [`${importPath}::${suffix}`, kind])
  )
  const fromDenominator = new Map()
  for (const item of denominator.items) {
    if (!item.kind.startsWith('ui-story-')) continue
    const d = denominator.itemDetails[item.id]
    fromDenominator.set(`${d.importPath}::${d.idSuffix}`, d.storyKind)
  }
  for (const [key, kind] of fromIndex) {
    assert.ok(fromDenominator.has(key), `story in the Storybook index but not in the denominator: ${key}`)
    assert.equal(fromDenominator.get(key), kind, `kind differs for ${key}`)
  }
  for (const key of fromDenominator.keys())
    assert.ok(fromIndex.has(key), `story in the denominator but not in the Storybook index: ${key}`)
  assert.equal(fromIndex.size, fromDenominator.size)
})

test('denominator invariants: ids, tags, matrix, counts, incompleteness', async () => {
  const { denominator } = await loadLayer()
  const ids = new Set()
  for (const item of denominator.items) {
    assert.ok(!ids.has(item.id), `duplicate item ${item.id}`)
    ids.add(item.id)
    assert.ok(item.kind && Array.isArray(item.requiredTags) && typeof item.na === 'object')
  }
  const screens = denominator.items.filter((i) => i.kind === 'ui-story-screen')
  assert.equal(screens.length, denominator.counts.realScreens)
  for (const s of screens)
    for (const tag of UI_TAGS) assert.ok(s.requiredTags.includes(tag), `${s.id} lacks required tag ${tag}`)
  for (const p of denominator.items.filter((i) => i.kind === 'ui-story-proposal')) {
    // A proposal owes nothing: every tag a story would owe is N-A for the one stated reason.
    assert.deepEqual(p.requiredTags, [])
    for (const tag of UI_TAGS)
      assert.match(denominator.naReasons[p.na[tag]], /not-in-product/, `${p.id} ${tag}`)
  }
  const catalogue = JSON.parse(
    await readTextAsync(path.join(REPO_ROOT, 'packages/core/tracy-core/src/ui-switches/catalogue.json'))
  )
  assert.equal(denominator.counts.switches, catalogue.switches.length)
  assert.equal(denominator.counts.languages, 8)
  assert.equal(denominator.matrix.cellCount, screens.length * 8 * VIEWPORTS.length * 2)
  assert.deepEqual(denominator.matrix.axes.languages, denominator.dimensions.languages)
  if (denominator.unresolved.length > 0)
    assert.equal(denominator.complete, false, 'unresolved sources must keep the denominator incomplete')
  for (const u of denominator.unresolved) assert.ok(u.source && u.reason)
  assert.ok(denominator.command.includes('generate.mjs'))
})

test('every switch in the catalogue is an item, with its locked reason as N-A for permission', async () => {
  const { denominator } = await loadLayer()
  const catalogue = JSON.parse(
    await readTextAsync(path.join(REPO_ROOT, 'packages/core/tracy-core/src/ui-switches/catalogue.json'))
  )
  for (const s of catalogue.switches) {
    const item = denominator.items.find((i) => i.id === `ui-switch:${s.id}`)
    assert.ok(item, `switch ${s.id} missing from the denominator`)
    if (s.locked) {
      assert.match(denominator.naReasons[item.na.permission], /locked/)
      assert.ok(!item.requiredTags.includes('permission'), 'a tag is N-A or owed, never both')
    }
  }
})

test('generated files exist where the generator writes them', async () => {
  for (const f of ['denominator.json', 'cases/families.json']) await readTextAsync(path.join(LAYER_DIR, f))
  await readTextAsync(path.join(REPO_ROOT, 'tests/qa/oracles/ui/pins.json'))
})

test('README lists Known limitations with file:line pointers that still resolve', async () => {
  const readme = await readTextAsync(path.join(LAYER_DIR, 'README.md'))
  const section = readme.split('## Known limitations')[1]
  assert.ok(section, 'README has a Known limitations section')
  for (const group of [
    /Proof \/ red-proof/,
    /Raw stdout/,
    /Nested CLI/,
    /Ledger and artifact/,
    /Report integrity/,
    /Product measurement gaps/
  ])
    assert.match(section, group)
  const refs = [...section.matchAll(/`((?:test\/)?[\w.-]+\.mjs):(\d+)/g)]
  assert.ok(refs.length >= 8)
  for (const [, file, line] of refs) {
    const text = await readTextAsync(path.join(LAYER_DIR, file))
    assert.ok(Number(line) <= text.split('\n').length, `${file}:${line} is inside the file`)
  }
  // A pointer must land on the line of the symbol or text it names, not merely inside the file.
  const named = [
    ['engine.mjs', /export function standOrigin\(/],
    ['engine.mjs', /export async function probeStand\(/],
    ['engine.mjs', /export async function captureProduct\(/],
    ['engine.mjs', /export async function sheetIsFresh\(/],
    ['engine.mjs', /export async function loadLayer\(/],
    ['engine.mjs', /const counts = \{ PASS: 0/],
    ['red.mjs', /export async function proveStoryMutants\(/],
    ['test/pilot-contract.test.mjs', /redProof/],
    ['browser.mjs', /const logStream = createWriteStream\(logFile\)/],
    ['browser.mjs', /tail: lastTail\.slice\(-600\)/],
    ['red.mjs', /story: \$\{target\.story\.file\}#/],
    ['run.mjs', /export function parseArgs\(/],
    ['browser.mjs', /export class Ledger/],
    ['artifacts.mjs', /export async function writeAtomic\(/],
    ['red.mjs', /Tool write paths stay out of the link farm/],
    ['test/observe-check.mjs', /mkdtemp\(path\.join\(parent/],
    ['cases.mjs', /function oracleOf\(/],
    ['tables.mjs', /requirements\.md/]
  ]
  const lines = new Map()
  for (const [, file] of refs)
    if (!lines.has(file)) lines.set(file, (await readTextAsync(path.join(LAYER_DIR, file))).split('\n'))
  for (const [file, pattern] of named) {
    const hits = refs.filter(([, f, l]) => f === file && pattern.test(lines.get(f)[Number(l) - 1] ?? ''))
    assert.ok(hits.length >= 1, `no README pointer lands on ${file} ${pattern}`)
  }
})
