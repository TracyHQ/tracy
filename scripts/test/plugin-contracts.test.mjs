// `check-plugin-contracts` guards cross-file wiring of dsh plugins. Each checker is a pure function
// of file TEXT, so every contract is broken here on its own in a cut-down fixture (a clean one is
// green first, so a red result is proof the break is what turned it red). The repo's real files are
// judged by the gate itself in `build:check`, not here.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BUILD_CLIENT_INJECT,
  BUILD_SPECS,
  checkAnchoredPopups,
  checkBuildPlugin,
  checkBuildSentence,
  checkDarkOverrides,
  checkNoHandoff,
  checkPalette,
  checkTooltipBubble,
  checkSeatOnlyTab,
  checkSlotRegistrations,
  checkTokenPreviews,
  checkViewingSessionDoor
} from '../check-plugin-contracts.ts'

/** Messages of a result, for `match`. */
const said = (problems) => problems.map((p) => `${p.file}: ${p.message}`).join('\n')

// ── seat-only tab ────────────────────────────────────────────────────────────────────────────

const SEAT_SOURCE = `import { seatOnlyTab } from '@tracy/core/seat'
const TAB_ID = 'tracy:add-site'
seatOnlyTab(ctx.betterSidebar, TAB_ID, () => ({ id: TAB_ID }))
`

test('seat-only tab: the wired source is green', () => {
  assert.deepEqual(checkSeatOnlyTab('f', SEAT_SOURCE, 'tracy:add-site'), [])
  // The import may carry other names of the same module (the Inbox also reads the viewer).
  const shared = SEAT_SOURCE.replace('{ seatOnlyTab }', '{ mayHoldSeatOnlyTab, readViewer, seatOnlyTab }')
  assert.deepEqual(checkSeatOnlyTab('f', shared, 'tracy:add-site'), [])
  const formatted = SEAT_SOURCE.replace(
    'seatOnlyTab(ctx.betterSidebar, TAB_ID,',
    'seatOnlyTab(\n  ctx.betterSidebar,\n  TAB_ID,'
  )
  assert.deepEqual(checkSeatOnlyTab('f', formatted, 'tracy:add-site'), [])
})

test('seat-only tab: each break is red with its own message', () => {
  const cases = [
    [
      'registerTab straight',
      `${SEAT_SOURCE}ctx.betterSidebar.registerTab({ id: TAB_ID })`,
      /registerTab straight/
    ],
    [
      'no call',
      SEAT_SOURCE.replace('seatOnlyTab(ctx.betterSidebar, TAB_ID,', 'other(ctx.betterSidebar, TAB_ID,'),
      /through seatOnlyTab/
    ],
    [
      'no import',
      SEAT_SOURCE.replace("import { seatOnlyTab } from '@tracy/core/seat'", ''),
      /does not import/
    ],
    [
      'imported from elsewhere',
      SEAT_SOURCE.replace("'@tracy/core/seat'", "'./seat-copy'"),
      /does not import/
    ],
    ['id moved', SEAT_SOURCE.replace('tracy:add-site', 'tracy:renamed'), /TAB_ID is no longer/]
  ]
  for (const [name, source, expected] of cases)
    assert.match(said(checkSeatOnlyTab('f', source, 'tracy:add-site')), expected, name)
})

test('seat-only tab: a comment mentioning registerTab does not trip it, nor satisfy the call', () => {
  const commented = `// ctx.betterSidebar.registerTab( is what NOT to do\n${SEAT_SOURCE}`
  assert.deepEqual(checkSeatOnlyTab('f', commented, 'tracy:add-site'), [])
  const onlyComment = SEAT_SOURCE.replace(
    'seatOnlyTab(ctx.betterSidebar, TAB_ID,',
    '// seatOnlyTab(ctx.betterSidebar, TAB_ID,'
  )
  assert.match(said(checkSeatOnlyTab('f', onlyComment, 'tracy:add-site')), /through seatOnlyTab/)
})

// ── viewing-session door ─────────────────────────────────────────────────────────────────────

const WEB = `app.get('/api/sites/:key/viewing-session', handler)`
const PLUGIN = "fetch(`${base}/api/sites/${key}/viewing-session`, { method: 'GET' })"

test('viewing-session door: same method is green, different method is red (the 10/09 bug)', () => {
  assert.deepEqual(checkViewingSessionDoor('p', PLUGIN, WEB), [])
  assert.match(
    said(checkViewingSessionDoor('p', PLUGIN.replace("'GET'", "'POST'"), WEB)),
    /sends POST but tracy-web registers GET/
  )
})

test('viewing-session door: either side vanishing is red, not skipped', () => {
  assert.match(said(checkViewingSessionDoor('p', PLUGIN, 'nothing')), /no longer registers/)
  assert.match(said(checkViewingSessionDoor('p', 'nothing', WEB)), /no longer calls/)
})

// ── Build plugins ────────────────────────────────────────────────────────────────────────────

const words = (spec, extra = {}) =>
  JSON.stringify({
    retry: 'Try again',
    stages: Object.fromEntries(spec.wordStages.map((name) => [name, name])),
    ...extra
  })

/** A cut-down but correct set of files for one Build plugin. */
function buildFiles(spec) {
  const stageStrings = spec.wordStages
    .flatMap((n) => [`'stage.${n}.run': 'x',`, `'stage.${n}.done': 'y',`])
    .join('\n')
  return {
    packageJson: JSON.stringify({ name: `@tracy/dsh-site-build-${spec.id}`, files: ['lib', 'words'] }),
    cordisPatch: `- insert:\n    - id: tracy-site-build-${spec.id}\n      name: '@tracy/dsh-site-build-${spec.id}'\n`,
    hostIndex: `export const name = 'tracy-site-build-${spec.id}'\n`,
    client: `export const inject = [${BUILD_CLIENT_INJECT.map((n) => `'${n}'`).join(', ')}]
tab: 'tracy:build:${spec.id}'
tool: 'tracy_site_build_${spec.id}'
stages: [${spec.clientStages.map((n) => `'${n}'`).join(', ')}],
`,
    strings: stageStrings,
    coreStrings: `'building.retry': 'Try again',`,
    words: { en: words(spec), vi: words(spec, { retry: 'Thử lại' }), zh: words(spec) },
    viCatalogue: JSON.stringify({ 'building.retry': 'Thử lại' }),
    questions: JSON.stringify({
      questions: ['name', 'logo', 'favicon', 'about', 'pages', 'languages', 'tone', 'business'].map((id) => ({
        id
      }))
    })
  }
}

for (const spec of BUILD_SPECS)
  test(`build ${spec.id}: the wired fixture is green`, () => {
    assert.deepEqual(checkBuildPlugin(spec, buildFiles(spec)), [])
  })

test('build: each contract broken on its own is red with its own message', () => {
  const joomla = BUILD_SPECS[0]
  const mutate = (change) => checkBuildPlugin(joomla, { ...buildFiles(joomla), ...change })
  const base = buildFiles(joomla)
  const cases = [
    [
      'row id',
      { cordisPatch: base.cordisPatch.replace('id: tracy-site-build-joomla', 'id: other') },
      /row is/
    ],
    ['package name', { packageJson: JSON.stringify({ name: '@tracy/other', files: ['words'] }) }, /name is/],
    ['host name', { hostIndex: "export const name = 'other'" }, /host name is/],
    [
      'words not packed',
      { packageJson: JSON.stringify({ name: '@tracy/dsh-site-build-joomla', files: ['lib'] }) },
      /"words"/
    ],
    ['inject list', { client: base.client.replace("'workspaces'", '') }, /client inject/],
    ['tab id', { client: base.client.replace('tracy:build:joomla', 'tracy:build:x') }, /tab is not/],
    ['tool name', { client: base.client.replace('tracy_site_build_joomla', 'x') }, /tool is not/],
    ['client stages', { client: base.client.replace("'seed', ", '') }, /stages are/],
    [
      'stage missing in words',
      { words: { ...base.words, zh: words({ wordStages: ['check'] }) } },
      /zh\.json.*stages\.template/
    ],
    [
      'stage missing in strings',
      { strings: base.strings.replace("'stage.seed.done'", "'stage.gone.done'") },
      /stage\.seed\.done/
    ],
    [
      'retry drifts (en)',
      { words: { ...base.words, en: words(joomla, { retry: 'Retry' }) } },
      /en\.json.*retry/
    ],
    ['retry drifts (vi)', { viCatalogue: JSON.stringify({ 'building.retry': 'Khác' }) }, /vi\.json.*retry/]
  ]
  for (const [name, change, expected] of cases) assert.match(said(mutate(change)), expected, name)
})

test('build emdash: foreign stage labels, inlined questions and extra questions are red', () => {
  const emdash = BUILD_SPECS.find((s) => s.id === 'emdash')
  const base = buildFiles(emdash)
  const stagesWith = (extra) =>
    JSON.stringify({ retry: 'Try again', stages: { check: 'c', personalize: 'p', shot: 's', ...extra } })
  assert.match(
    said(checkBuildPlugin(emdash, { ...base, words: { ...base.words, en: stagesWith({ theme: 't' }) } })),
    /does not run: theme/
  )
  assert.match(
    said(checkBuildPlugin(emdash, { ...base, client: `${base.client}\nimport q from './questions.json'` })),
    /inlines questions\.json/
  )
  assert.match(
    said(
      checkBuildPlugin(emdash, {
        ...base,
        questions: JSON.stringify({ questions: [{ id: 'name' }, { id: 'tone' }] })
      })
    ),
    /asks \[name, tone\]/
  )
})

// ── Build sentence ───────────────────────────────────────────────────────────────────────────

const STRINGS = `'msg.buildWith': 'Build "{name}" ({id}) with {platform}',`
const VI = JSON.stringify({ 'msg.buildWith': 'Dựng "{name}" ({id}) bằng {platform}' })
const HOST = "'... Build \"<name>\" (<id>) with ' +\n '${spec.platformName} on this site.'"
const HOST_OK = 'Build "<name>" (<id>) with ${spec.platformName} on this site.'

test('build sentence: green with the id in all three places, red when any loses it', () => {
  assert.deepEqual(checkBuildSentence(STRINGS, VI, HOST_OK), [])
  assert.deepEqual(checkBuildSentence(STRINGS, VI, HOST.replace(/ with ' \+\n '\$/, ' with $')), [])
  assert.match(
    said(checkBuildSentence(STRINGS.replace(' ({id})', ''), VI, HOST_OK)),
    /no longer carries the id/
  )
  assert.match(said(checkBuildSentence(STRINGS, VI.replace(' ({id})', ''), HOST_OK)), /vi|no longer carries/)
  assert.match(said(checkBuildSentence(STRINGS, VI, 'Build "<name>" with x')), /tool description/)
  assert.match(said(checkBuildSentence('', VI, HOST_OK)), /missing/)
})

// ── no handoff ───────────────────────────────────────────────────────────────────────────────

test('no handoff: a clean client is green; each way the second page returns is red', () => {
  const clean = [
    { name: 'index.tsx', text: 'export const x = 1' },
    { name: 'strings.ts', text: "'form.name': 'Name'" }
  ]
  assert.deepEqual(checkNoHandoff(clean), [])
  const broken = (name, text) => said(checkNoHandoff([...clean, { name, text }]))
  assert.match(
    broken('a.tsx', "sessionStorage.setItem('tracy-site-build:construction', x)"),
    /writes a handoff/
  )
  assert.match(broken('a.tsx', 'window.location.assign(`/${siteKey}/`)'), /another site/)
  assert.match(broken('a.tsx', "slots.register({ name: 'shell.overlay' })"), /overlay/)
  assert.match(broken('construction-handoff.tsx', ''), /handoff module is back/)
  assert.match(broken('strings.ts', "'handoff.title': 'x'"), /handoff dictionary/)
  assert.match(broken('strings.ts', "'form.notAttached': 'x'"), /handoff refusal/)
})

// ── slot registrations ───────────────────────────────────────────────────────────────────────

const CATALOG = [
  ...Array.from({ length: 21 }, (_, i) => `key: 'slot.${i}',\n kind: 'single',`),
  "key: 'list.slot',\n kind: 'list',",
  "key: 'keyed.slot',\n kind: 'keyed',",
  "key: 'chain.slot',\n kind: 'chain',"
].join('\n')

const reg = (body) => [{ file: 'p/a.ts', text: `ctx.slots.register({ ${body} })` }]

test('slot registrations: a fitting registration is green (shorthand and colon forms)', () => {
  assert.deepEqual(checkSlotRegistrations(CATALOG, reg("name: 'list.slot', id: 'a'")), [])
  assert.deepEqual(checkSlotRegistrations(CATALOG, reg("name: 'list.slot', id, order: 1")), [])
  assert.deepEqual(checkSlotRegistrations(CATALOG, reg("name: 'keyed.slot', key: 'k'")), [])
  assert.deepEqual(checkSlotRegistrations(CATALOG, reg("name: 'chain.slot', select: () => { return 1 }")), [])
  assert.deepEqual(checkSlotRegistrations(CATALOG, reg("name: 'slot.1'")), [])
})

test('slot registrations: each way to blank the client is red', () => {
  assert.match(said(checkSlotRegistrations(CATALOG, reg("name: 'list.slot'"))), /no registration carrying id/)
  assert.match(said(checkSlotRegistrations(CATALOG, reg("name: 'keyed.slot'"))), /carrying key/)
  assert.match(said(checkSlotRegistrations(CATALOG, reg("name: 'chain.slot'"))), /carrying select/)
  assert.match(
    said(checkSlotRegistrations(CATALOG, reg("name: 'nope', id: 'a'"))),
    /neither dsh nor a Tracy registration declares/
  )
  assert.match(said(checkSlotRegistrations('', reg("name: 'list.slot', id: 'a'"))), /looks empty/)
})

test('slot registrations: a child slot a Tracy registration declares is declared, with its kind', () => {
  const owner = {
    file: 'p/owner.tsx',
    text: "ctx.slots.register({ name: 'slot.1', children: { 'tracy.rows': { kind: 'list', scope: 'root' } } })"
  }
  const fits = { file: 'p/row.tsx', text: "ctx.slots.register({ name: 'tracy.rows', id: 'a' })" }
  const misses = { file: 'p/row.tsx', text: "ctx.slots.register({ name: 'tracy.rows' })" }
  assert.deepEqual(checkSlotRegistrations(CATALOG, [owner, fits]), [])
  assert.match(
    said(checkSlotRegistrations(CATALOG, [owner, misses])),
    /list slot "tracy.rows" has no registration carrying id/
  )
  // Without its owner the slot is declared by nobody.
  assert.match(said(checkSlotRegistrations(CATALOG, [fits])), /neither dsh nor a Tracy registration declares/)
})

test('slot registrations: an id named only in a comment does not count; a reused id is red', () => {
  assert.match(
    said(checkSlotRegistrations(CATALOG, reg("name: 'list.slot', /* id: 'x' */ // id: 'y'\n order: 1"))),
    /carrying id/
  )
  const two = [
    { file: 'p/a.ts', text: "slots.register({ name: 'list.slot', id: 'dup' })" },
    { file: 'p/b.ts', text: "slots.register({ name: 'list.slot', id: 'dup' })" }
  ]
  assert.match(said(checkSlotRegistrations(CATALOG, two)), /both register "list.slot#dup"/)
})

test('slot registrations: a long body does not hide the registration (balanced braces)', () => {
  const long = `name: 'list.slot', ${'/* filler */ '.repeat(80)} select: () => { if (a) { return 1 } }`
  assert.match(said(checkSlotRegistrations(CATALOG, reg(long))), /carrying id/)
})

// ── anchored popups ──────────────────────────────────────────────────────────────────────────

test('anchored popups: Dialog and Button are fine; every anchored family is red', () => {
  const from = (names) => [{ file: 'c.tsx', text: `import { ${names} } from '@tracy/ui'` }]
  assert.deepEqual(checkAnchoredPopups(from('Button, Dialog, type Foo')), [])
  for (const name of [
    'DropdownMenu',
    'Popover',
    'Tooltip',
    'HoverCard',
    'Select',
    'Combobox',
    'ContextMenu',
    'Menubar',
    'NavigationMenu'
  ])
    assert.match(said(checkAnchoredPopups(from(`Button, ${name}Item`))), new RegExp(`${name}Item`))
  assert.match(said(checkAnchoredPopups(from('type Popover as P'))), /Popover/)
})

// ── palette ──────────────────────────────────────────────────────────────────────────────────

const PALETTE = Object.fromEntries(
  Array.from({ length: 18 }, (_, i) => [`--dsw-alias-a${i}`, { light: 'oklch(1 0 0)', dark: 'oklch(0 0 0)' }])
)

test('palette: literals in both modes are green; a var(), a missing mode, a foreign name or a short list is red', () => {
  assert.deepEqual(checkPalette(PALETTE), [])
  const one = (name, modes) => ({ ...PALETTE, [name]: modes })
  assert.match(said(checkPalette(one('--dsw-alias-a0', { light: 'var(--x)', dark: 'a' }))), /light is a var/)
  assert.match(said(checkPalette(one('--dsw-alias-a0', { light: 'a' }))), /no dark value/)
  assert.match(said(checkPalette(one('--other', { light: 'a', dark: 'b' }))), /not a dsh token/)
  assert.match(said(checkPalette({})), /at least the 18/)
  assert.match(
    said(checkPalette(one('--dsw-alias-brand-primary', { light: 'a', dark: 'b' }))),
    /accent is the user's/
  )
})

test('tooltip bubble: dark in both modes, or not bridged, is green; a light bubble or a changed dsh label is red', () => {
  const label = '.tooltip { color: var(--dsw-static-neutral-bluish-00); }'
  const dark = { '--dsw-alias-tooltip-bg': { light: 'oklch(0.2 0 0)', dark: 'oklch(0.3 0 0)' } }
  assert.deepEqual(checkTooltipBubble(dark, label), [])
  assert.deepEqual(checkTooltipBubble({}, label), [])
  assert.match(
    said(
      checkTooltipBubble(
        { '--dsw-alias-tooltip-bg': { light: 'oklch(1 0 0)', dark: 'oklch(0.3 0 0)' } },
        label
      )
    ),
    /tooltip-bg\.light is oklch\(1 0 0\)/
  )
  assert.match(said(checkTooltipBubble(dark, '.tooltip { color: white; }')), /label colour/)
})

// ── dark overlay ─────────────────────────────────────────────────────────────────────────────

const DARK =
  "export const DARK_OVERRIDES =\n  ':root{color-scheme:dark;--bg:#0f1115}' +\n  'body,.page{background:var(--bg,var(--od-page-bg))}'\n\nexport function x() {}"

test('dark overlay: painting .page is green; dropping .page, color-scheme or the constant is red', () => {
  assert.deepEqual(checkDarkOverrides(DARK), [])
  assert.match(said(checkDarkOverrides(DARK.replace('body,.page{', 'body{'))), /paints \.page/)
  assert.match(said(checkDarkOverrides(DARK.replace('color-scheme:dark;', ''))), /color-scheme/)
  assert.match(said(checkDarkOverrides('nothing')), /missing/)
})

// ── token previews ───────────────────────────────────────────────────────────────────────────

const inline = (html) =>
  html.replace(/<link\b[^>]*href="\.\.\/tokens\.css"[^>]*>/, '<style data-tracy-tokens></style>')

test('token previews: an inlinable link is green; a form the inliner misses is red; no pages is red', () => {
  const page = (link) => [{ file: 'v/colors.html', html: `<head>${link}</head>` }]
  assert.deepEqual(checkTokenPreviews(page('<link rel="stylesheet" href="../tokens.css">'), inline), [])
  assert.match(
    said(checkTokenPreviews(page('<link rel="stylesheet" href="./tokens.css">'), inline)),
    /not inlined/
  )
  assert.match(said(checkTokenPreviews(page('<style>x</style>'), inline)), /not inlined/)
  assert.match(said(checkTokenPreviews([], inline)), /no token preview/)
})
