#!/usr/bin/env node
// Generates the ui layer's denominator, oracle pins and case manifests FROM THE CODE.
//
//   node tests/qa/layers/ui/generate.mjs                 write denominator.json, cases/*.json, oracles/ui/pins.json
//   node tests/qa/layers/ui/generate.mjs --check         regenerate into a scratch dir and diff against the committed files
//   node tests/qa/layers/ui/generate.mjs --check --scratch-out DIR
//
// Sources (all read through readRegular: no symlink, no FIFO, confined to the repo):
//   - story files: git ls-files over both Storybook roots, exports found with the TypeScript AST,
//     kind (real-screen / building-block / not-in-product) from .storybook/story-kind.mjs `classify`,
//   - plugin client entries: packages/*/*/src/client/index.ts(x), slot/tab registrations from the AST,
//   - UI switches: packages/core/tracy-core/src/ui-switches/catalogue.json,
//   - languages: packages/core/tracy-core/src/interface-languages/index.mjs.
// Anything the extractor cannot resolve goes to `unresolved`; the denominator is then flagged
// incomplete and no report may call it complete.

import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  LAYER_DIR,
  REPO_ROOT,
  confineOutput,
  readJson,
  readRegular,
  sha256,
  stableStringify,
  writeAtomic
} from './artifacts.mjs'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, NaTable } from '../../lib/denominator.mjs'
import { docRel } from '../../lib/doc-source.mjs'
import { casesText, deriveCases, flatView } from './cases.mjs'
import {
  CLIENT_REQUIRED_TAGS,
  CONSUMER_ROOTS,
  EXECUTABLE,
  FAMILIES,
  LEGACY_FINDINGS_PATH,
  LEGACY_MAP_PATH,
  ORACLES,
  STORY_REQUIRED_TAGS,
  SWITCH_FAMILIES,
  SWITCH_REQUIRED_TAGS,
  THEMES,
  VIEWPORTS
} from './tables.mjs'

const run = promisify(execFile)
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'))

export const COMMAND = 'node tests/qa/layers/ui/generate.mjs'
const BENCH_DIR = 'packages/dev/tracy-design'
const STORY_GLOBS = [
  'packages/dev/tracy-design/src/**/*.stories.ts',
  'packages/dev/tracy-design/src/**/*.stories.tsx',
  'packages/ui/tracy-ui/src/**/*.stories.ts',
  'packages/ui/tracy-ui/src/**/*.stories.tsx'
]
const CLIENT_GLOBS = ['packages/*/*/src/client/index.ts', 'packages/*/*/src/client/index.tsx']
const CATALOGUE = 'packages/core/tracy-core/src/ui-switches/catalogue.json'
const LANGUAGES = 'packages/core/tracy-core/src/interface-languages/index.mjs'

async function gitFiles(globs) {
  const { stdout } = await run('git', ['ls-files', '-z', '--', ...globs], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024
  })
  return stdout.split('\0').filter(Boolean).sort()
}

let tsModule
function ts() {
  tsModule ??= requireFromRepo('typescript')
  return tsModule
}

function parse(file, text) {
  const t = ts()
  return t.createSourceFile(
    file,
    text,
    t.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? t.ScriptKind.TSX : t.ScriptKind.TS
  )
}

function walk(node, visit) {
  visit(node)
  ts().forEachChild(node, (child) => walk(child, visit))
}

/** Storybook's `storyNameFromExport` (lodash startCase) then `sanitize`: the suffix of a story id. */
export function storyIdSuffix(exportName) {
  const words = exportName.match(/[A-Z]{2,}(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|[A-Z]|\d+/g) ?? [exportName]
  return words
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const DIALOG_HINT = /dialog|sheet|drawer|popover|modal|picker|menu|popup/i

const STATE_HINTS = [
  ['loading', /loading|building|pending|skeleton|sending|spinner|progress|waiting/i],
  ['empty', /[Ee]mpty|[Nn]othing|[Bb]lank|^No(?=[A-Z])/],
  ['error', /error|fail|refus|broken|invalid|denied|rejected/i],
  ['offline', /offline/i],
  ['disabled', /disabled/i],
  ['success', /success|done|complete|saved|ready/i],
  ['permission', /permission|viewer|readonly|read-only|forbidden|role/i]
]

export function stateTagsOf(exportName) {
  return STATE_HINTS.filter(([, re]) => re.test(exportName)).map(([tag]) => tag)
}

/** Story exports of one file: `export const X`, `export function X`, `export { a as X }`. */
export function extractStoryExports(file, text) {
  const t = ts()
  const sf = parse(file, text)
  const exportsFound = []
  const notes = []
  let meta = null
  sf.forEachChild((node) => {
    if (t.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === t.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (t.isIdentifier(decl.name)) exportsFound.push(decl.name.text)
        else notes.push(`destructured export in ${file}`)
      }
    } else if (
      t.isFunctionDeclaration(node) &&
      node.modifiers?.some((m) => m.kind === t.SyntaxKind.ExportKeyword) &&
      node.name
    ) {
      if (!node.modifiers.some((m) => m.kind === t.SyntaxKind.DefaultKeyword))
        exportsFound.push(node.name.text)
    } else if (
      t.isExportDeclaration(node) &&
      node.exportClause &&
      t.isNamedExports(node.exportClause) &&
      !node.moduleSpecifier
    ) {
      for (const el of node.exportClause.elements) exportsFound.push(el.name.text)
    } else if (t.isExportDeclaration(node) && node.moduleSpecifier) {
      notes.push(`re-export from ${node.moduleSpecifier.getText(sf)} in ${file}`)
    } else if (t.isExportAssignment(node)) {
      meta = node.expression
    }
  })
  // `const meta = {...}; export default meta`: follow the identifier to its object literal.
  if (meta && t.isIdentifier(meta)) {
    sf.forEachChild((node) => {
      if (t.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (t.isIdentifier(decl.name) && decl.name.text === meta.text && decl.initializer)
            meta = decl.initializer
        }
      }
    })
  }
  let title = null
  let filtered = false
  const unwrap = (n) => (n && (t.isSatisfiesExpression(n) || t.isAsExpression(n)) ? unwrap(n.expression) : n)
  const metaObject = unwrap(meta)
  if (metaObject && t.isObjectLiteralExpression(metaObject)) {
    for (const prop of metaObject.properties) {
      const name =
        prop.name && (t.isIdentifier(prop.name) || t.isStringLiteral(prop.name)) ? prop.name.text : null
      if (name === 'title' && t.isPropertyAssignment(prop) && t.isStringLiteralLike(prop.initializer))
        title = prop.initializer.text
      if (name === 'includeStories' || name === 'excludeStories') filtered = true
    }
  } else if (meta) {
    notes.push(`default export of ${file} is not an object literal; meta not read`)
  }
  const names = exportsFound.filter((n) => n !== 'default' && !n.startsWith('__'))
  return { names: [...new Set(names)], title, filtered, notes }
}

/** Slots and tabs a plugin client entry registers. First argument must be a string literal. */
export function extractClientRegistrations(file, text) {
  const t = ts()
  const sf = parse(file, text)
  const slots = []
  const tabs = []
  const unresolved = []
  walk(sf, (node) => {
    if (!t.isCallExpression(node)) return
    const callee = node.expression.getText(sf).replace(/\s+/g, '')
    if (callee === 'ctx.slots.inject') {
      const first = node.arguments[0]
      if (first && t.isStringLiteralLike(first)) slots.push(first.text)
      else
        unresolved.push(
          `${file}: ctx.slots.inject with a non-literal slot name at ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
        )
    } else if (callee === 'ctx.slots.register') {
      const first = node.arguments[0]
      if (first && t.isObjectLiteralExpression(first)) {
        const name = first.properties.find((p) => t.isPropertyAssignment(p) && p.name.getText(sf) === 'name')
        if (name && t.isStringLiteralLike(name.initializer)) slots.push(name.initializer.text)
        else
          unresolved.push(
            `${file}: ctx.slots.register without a literal name at ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
          )
      }
    } else if (callee === 'ctx.betterSidebar.registerTab') {
      const first = node.arguments[0]
      if (first && t.isObjectLiteralExpression(first)) {
        const type = first.properties.find(
          (p) => t.isPropertyAssignment(p) && ['type', 'id'].includes(p.name.getText(sf))
        )
        if (type && t.isStringLiteralLike(type.initializer)) tabs.push(type.initializer.text)
        else
          unresolved.push(
            `${file}: registerTab without a literal type/id at ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
          )
      } else {
        unresolved.push(
          `${file}: registerTab argument is not an object literal at ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
        )
      }
    }
  })
  return { slots: [...new Set(slots)].sort(), tabs: [...new Set(tabs)].sort(), unresolved }
}

/** Item key of a story: stable, built from the path and the export name, never a line number. */
export function storyKey(file, exportName) {
  const p = file
    .replace(/^packages\/dev\/tracy-design\/src\//, 'bench/')
    .replace(/^packages\/ui\/tracy-ui\/src\/components\//, 'kit/')
    .replace(/\.stories\.tsx?$/, '')
  return `${p.replace(/[^A-Za-z0-9]+/g, '-')}.${exportName}`
}

async function extractStories(unresolved, sources) {
  const files = await gitFiles(STORY_GLOBS)
  // story-kinds.json is the bench's committed table (a gate keeps it equal to `classify`); walking the
  // import graph of every story file again costs over a minute on a busy machine, so `classify` is
  // only the fallback for a file the table does not list. tests/qa/fixtures/ui/story-index.json,
  // taken from a live Storybook, is what proves the table and the denominator agree.
  const kindTable = await readJson(path.join(REPO_ROOT, BENCH_DIR, 'story-kinds.json'))
  sources.push({
    path: `${BENCH_DIR}/story-kinds.json`,
    sha256: sha256(await readRegular(path.join(REPO_ROOT, BENCH_DIR, 'story-kinds.json')))
  })
  let kindModule = null
  const items = []
  for (const file of files) {
    const text = await readRegular(path.join(REPO_ROOT, file))
    sources.push({ path: file, sha256: sha256(text) })
    let extracted
    try {
      extracted = extractStoryExports(file, text)
    } catch (error) {
      unresolved.push({ source: file, reason: `AST parse failed: ${error.message}` })
      continue
    }
    for (const note of extracted.notes) unresolved.push({ source: file, reason: note })
    if (extracted.filtered)
      unresolved.push({
        source: file,
        reason: 'meta has includeStories/excludeStories; every export counted as a story'
      })
    if (extracted.names.length === 0) {
      unresolved.push({ source: file, reason: 'no story export found' })
      continue
    }
    let kind = kindTable[file]
    if (!kind) {
      try {
        kindModule ??= await import(
          pathToFileURL(path.join(REPO_ROOT, BENCH_DIR, '.storybook/story-kind.mjs')).href
        )
        kind = kindModule.classify(path.join(REPO_ROOT, file)).kind
        unresolved.push({ source: file, reason: 'not in story-kinds.json; kind taken from classify()' })
      } catch (error) {
        unresolved.push({ source: file, reason: `classify failed: ${error.message}` })
        continue
      }
    }
    for (const name of extracted.names) {
      const key = storyKey(file, name)
      items.push({
        id: `ui-story:${key}`,
        key,
        file,
        exportName: name,
        idSuffix: storyIdSuffix(name),
        title: extracted.title,
        kind,
        stateTags: stateTagsOf(name),
        dialogHint: DIALOG_HINT.test(`${name} ${text}`),
        importPath: (() => {
          const r = path.posix.relative(BENCH_DIR, file)
          return r.startsWith('.') ? r : `./${r}`
        })()
      })
    }
  }
  return items
}

async function extractClients(unresolved, sources) {
  const files = await gitFiles(CLIENT_GLOBS)
  const clients = []
  const slotItems = []
  for (const file of files) {
    const dir = path.posix.dirname(path.posix.dirname(path.posix.dirname(file)))
    const text = await readRegular(path.join(REPO_ROOT, file))
    sources.push({ path: file, sha256: sha256(text) })
    let name
    try {
      name = (await readJson(path.join(REPO_ROOT, dir, 'package.json'))).name
    } catch (error) {
      unresolved.push({ source: file, reason: `package.json unreadable: ${error.message}` })
      continue
    }
    const reg = extractClientRegistrations(file, text)
    for (const reason of reg.unresolved) unresolved.push({ source: file, reason })
    clients.push({ id: `ui-client:${name}`, name, file, slots: reg.slots, tabs: reg.tabs })
    for (const slot of reg.slots) slotItems.push({ id: `ui-slot:${name}:${slot}`, name, slot, file })
    for (const tab of reg.tabs) slotItems.push({ id: `ui-tab:${name}:${tab}`, name, slot: tab, file })
  }
  return { clients, slotItems }
}

async function extractSwitches(sources) {
  const text = await readRegular(path.join(REPO_ROOT, CATALOGUE))
  sources.push({ path: CATALOGUE, sha256: sha256(text) })
  const catalogue = JSON.parse(text)
  return catalogue.switches.map((s) => ({
    id: `ui-switch:${s.id}`,
    switchId: s.id,
    group: s.group,
    defaultOn: s.defaultOn,
    drawnBy: s.drawnBy,
    tabs: s.tabs ?? [],
    parent: s.parent ?? null,
    locked: s.locked ?? null
  }))
}

async function extractLanguages(sources) {
  const text = await readRegular(path.join(REPO_ROOT, LANGUAGES))
  sources.push({ path: LANGUAGES, sha256: sha256(text) })
  const mod = await import(pathToFileURL(path.join(REPO_ROOT, LANGUAGES)).href)
  return mod.INTERFACE_LANGUAGES.map((l) => ({ id: l.id, label: l.label, shown: l.shown }))
}

/** Which switch ids product code mentions, as a CSS selector on data-tracy-hide, isShown/keepShown, or tab policy. */
async function scanConsumers(switchIds, tabSwitchIds) {
  // `git grep` prefilters in C: only files that mention the switch machinery are read at all.
  let stdout = ''
  try {
    ;({ stdout } = await run(
      'git',
      [
        'grep',
        '-lzE',
        'tracy-hide|ui-switches|isShown|keepShown|followTabPolicy|tabPolicy\\(',
        '--',
        ...CONSUMER_ROOTS.flatMap((r) => [
          `${r}/**/*.ts`,
          `${r}/**/*.tsx`,
          `${r}/**/*.css`,
          `${r}/**/*.mjs`,
          `${r}/**/*.js`
        ])
      ],
      { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }
    ))
  } catch (error) {
    if (error.code !== 1) throw error // exit 1 = no match
  }
  const files = stdout
    .split('\0')
    .filter(Boolean)
    .filter(
      (f) =>
        !/(^|\/)(test|tests|dist|lib|node_modules|stories?)\//.test(f) &&
        !/\.(test|stories)\./.test(f) &&
        !f.startsWith('packages/core/tracy-core/src/ui-switches/')
    )
    .sort()
  const consumers = Object.fromEntries(switchIds.map((id) => [id, []]))
  const probes = switchIds.map((id) => [
    id,
    new RegExp(
      `data-tracy-hide[~^*$|]?=["']?${id}\\b|(?:isShown|keepShown)\\([^)]*['"\`]${id}['"\`]|['"\`]${id}['"\`]`
    )
  ])
  for (const file of files) {
    let text
    try {
      text = await readRegular(path.join(REPO_ROOT, file), { maxBytes: 4 * 1024 * 1024 })
    } catch {
      continue
    }
    for (const [id, re] of probes) if (re.test(text)) consumers[id].push(file)
    // tab-* / launch-* switches reach their tabs through the tab policy, not through their own id.
    if (/followTabPolicy\(|\.tabPolicy\(/.test(text))
      for (const id of tabSwitchIds) if (!consumers[id].includes(file)) consumers[id].push(file)
  }
  return consumers
}

async function readLegacy(unresolved) {
  const mapFile = path.join(REPO_ROOT, LEGACY_MAP_PATH)
  let map
  try {
    map = await readJson(mapFile)
  } catch (error) {
    unresolved.push({
      source: LEGACY_MAP_PATH,
      reason: `legacy map unavailable (${error.code ?? error.message}); ui legacy cases cannot be derived`
    })
    return { entries: [], mapSha: null }
  }
  const text = await readRegular(mapFile)
  const raw = Array.isArray(map) ? map : (map.entries ?? map.items ?? map.map ?? null)
  let list
  if (Array.isArray(raw)) list = raw
  else if (raw && typeof raw === 'object')
    list = Object.entries(raw).map(([id, value]) =>
      typeof value === 'string' ? { id, layer: value } : { id, ...value }
    )
  else {
    unresolved.push({ source: LEGACY_MAP_PATH, reason: 'legacy map has an unrecognised shape' })
    return { entries: [], mapSha: sha256(text) }
  }
  const entries = list.filter(
    (e) =>
      e &&
      typeof e.id === 'string' &&
      (e.layer === 'ui' || (Array.isArray(e.layers) && e.layers.includes('ui')))
  )
  let findings = {}
  try {
    const f = await readJson(path.join(REPO_ROOT, LEGACY_FINDINGS_PATH))
    findings = Object.fromEntries((f.findings ?? []).map((x) => [x.id, x]))
  } catch {
    // titles are optional
  }
  return {
    entries: entries.map((e) => ({
      id: e.id,
      title: findings[e.id]?.title ?? e.title ?? null,
      fixRefs: findings[e.id]?.fixRefs ?? e.fixRefs ?? []
    })),
    mapSha: sha256(text)
  }
}

function pinOracles() {
  return Promise.all(
    Object.entries(ORACLES).map(async ([id, o]) => {
      const text = await readRegular(path.join(REPO_ROOT, docRel(REPO_ROOT, o.file)))
      return {
        id,
        file: o.file,
        sha256: sha256(text),
        anchor: o.anchor,
        anchorPresent: text.includes(o.anchor),
        owner: o.owner,
        invariant: o.invariant
      }
    })
  )
}

const timed = async (label, fn) => {
  const t0 = Date.now()
  const value = await fn()
  if (process.env.QA_UI_TIMING) console.error(`[generate] ${label}: ${Date.now() - t0}ms`)
  return value
}

export async function build() {
  const unresolved = []
  const sources = []
  const stories = await timed('stories', () => extractStories(unresolved, sources))
  const { clients, slotItems } = await timed('clients', () => extractClients(unresolved, sources))
  const switches = await timed('switches', () => extractSwitches(sources))
  const languages = await timed('languages', () => extractLanguages(sources))
  const consumers = await timed('consumers', () =>
    scanConsumers(
      switches.map((s) => s.switchId),
      switches.filter((s) => s.tabs.length > 0 && /^(tab|launch)-/.test(s.switchId)).map((s) => s.switchId)
    )
  )
  const legacy = await readLegacy(unresolved)
  const pins = await pinOracles()
  for (const p of pins)
    if (!p.anchorPresent)
      unresolved.push({ source: p.file, reason: `oracle anchor missing for ${p.id}: "${p.anchor}"` })

  const duplicateIds = new Set()
  const seen = new Set()
  for (const id of [...stories, ...clients, ...slotItems, ...switches].map((i) => i.id)) {
    if (seen.has(id)) duplicateIds.add(id)
    seen.add(id)
  }
  for (const id of duplicateIds) unresolved.push({ source: id, reason: 'duplicate item id' })

  const kindOf = {
    'real-screen': 'ui-story-screen',
    'building-block': 'ui-story-block',
    'not-in-product': 'ui-story-proposal'
  }
  const items = []
  const details = {}
  const reasons = new NaTable()
  for (const s of stories) {
    // A proposal owes nothing: every tag a story would owe is N-A, each citing the same reason.
    const requiredTags = s.kind === 'not-in-product' ? [] : [...STORY_REQUIRED_TAGS]
    const na = {}
    if (s.kind === 'not-in-product') {
      const key = reasons.add(
        'kind not-in-product: a proposal drawing with no shipped surface (classified by .storybook/story-kind.mjs)',
        'packages/dev/tracy-design/story-kinds.json'
      )
      for (const tag of STORY_REQUIRED_TAGS) na[tag] = key
    }
    items.push({ id: s.id, kind: kindOf[s.kind], requiredTags, na })
    details[s.id] = {
      key: s.key,
      file: s.file,
      exportName: s.exportName,
      importPath: s.importPath,
      idSuffix: s.idSuffix,
      title: s.title,
      storyKind: s.kind,
      stateTags: s.stateTags,
      dialogHint: s.dialogHint
    }
  }
  for (const c of clients) {
    items.push({ id: c.id, kind: 'ui-client-entry', requiredTags: [...CLIENT_REQUIRED_TAGS], na: {} })
    details[c.id] = { file: c.file, slots: c.slots, tabs: c.tabs }
  }
  for (const s of slotItems) {
    items.push({
      id: s.id,
      kind: s.id.startsWith('ui-tab:') ? 'ui-tab' : 'ui-slot',
      requiredTags: ['permission', 'language-theme-viewport', 'keyboard'],
      na: {}
    })
    details[s.id] = { file: s.file, plugin: s.name, name: s.slot }
  }
  for (const s of switches) {
    const na = {}
    if (s.locked) {
      na.permission = reasons.add(
        `locked switch, it cannot be pressed: ${s.locked}`,
        'packages/core/tracy-core/src/ui-switches/catalogue.json'
      )
    }
    // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
    items.push({
      id: s.id,
      kind: 'ui-switch',
      requiredTags: SWITCH_REQUIRED_TAGS.filter((tag) => !(tag in na)),
      na
    })
    details[s.id] = {
      switchId: s.switchId,
      group: s.group,
      defaultOn: s.defaultOn,
      tabs: s.tabs,
      parent: s.parent,
      locked: s.locked,
      consumers: consumers[s.switchId]
    }
  }
  for (const l of languages) {
    items.push({
      id: `ui-language:${l.id}`,
      kind: 'ui-language',
      requiredTags: ['language-theme-viewport'],
      na: {}
    })
    details[`ui-language:${l.id}`] = { label: l.label, shown: l.shown }
  }

  const screens = stories.filter((s) => s.kind === 'real-screen')
  const matrix = {
    axes: {
      languages: languages.map((l) => l.id),
      viewports: VIEWPORTS.map((v) => v.id),
      themes: [...THEMES]
    },
    definition:
      'screen x applicable state x 8 languages x {1440,390} x {light,dark}; each real-screen story is one screen/state',
    cellCount: screens.length * languages.length * VIEWPORTS.length * THEMES.length,
    executable: EXECUTABLE,
    note: 'cells are the cross product; coverage.json reports which cells ran. Role, switch and platform axes are added per screen by the owner of that screen and are NOT yet enumerated.'
  }

  const unresolvedSorted = unresolved.sort((a, b) =>
    `${a.source}${a.reason}`.localeCompare(`${b.source}${b.reason}`)
  )
  const sourceHash = sha256(
    sources
      .map((s) => `${s.path}:${s.sha256}`)
      .sort()
      .join('\n')
  )

  // `details` holds what only this layer reads; flatView() gives the rest of the layer the flat object it works on.
  const details_ = {
    extractionKind: 'static-ast',
    complete: unresolvedSorted.length === 0,
    sourceCount: sources.length,
    counts: {
      storyFiles: new Set(stories.map((s) => s.file)).size,
      stories: stories.length,
      realScreens: screens.length,
      buildingBlocks: stories.filter((s) => s.kind === 'building-block').length,
      proposals: stories.filter((s) => s.kind === 'not-in-product').length,
      clientEntries: clients.length,
      slotAndTabRegistrations: slotItems.length,
      switches: switches.length,
      languages: languages.length
    },
    dimensions: { languages: languages.map((l) => l.id), viewports: VIEWPORTS, themes: [...THEMES] },
    matrix,
    itemDetails: details,
    legacyMap: {
      path: LEGACY_MAP_PATH,
      sha256: legacy.mapSha,
      present: legacy.mapSha !== null,
      ui: legacy.entries.length,
      entries: legacy.entries
    }
  }
  const doc = {
    schema: DENOMINATOR_SCHEMA_ID,
    layer: 'ui',
    source:
      'git ls-files + TypeScript AST (stories, client entries) + .storybook/story-kind.mjs classify + ui-switches/catalogue.json + interface-languages',
    revision: sourceHash,
    command: COMMAND,
    naReasons: reasons.table(),
    items,
    unresolved: unresolvedSorted,
    details: details_
  }
  const cases = deriveCases(flatView(doc))
  doc.details.cases = {
    count: Object.values(cases).flat().length,
    sha256: sha256(casesText(cases)),
    byFile: Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v.length]))
  }
  // Duplicate ids are already reported in `unresolved`; the contract refuses them, so the file is not written.
  return { denominator: flatView(assertDenominator(doc, 'ui')), cases, pins, sources }
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])])
    )
  }
  return value
}

export function renderOutputs({ denominator, pins }) {
  const outputs = new Map()
  outputs.set('denominator.json', renderDenominator(denominator))
  outputs.set(
    'cases/families.json',
    stableStringify({
      note: 'The ui layer derives its case manifests from denominator.json and tables.mjs (cases.mjs deriveCases); they are not committed one by one. denominator.json records their count and sha256, and generate.mjs --check proves they regenerate identically.',
      generatedBy: COMMAND,
      count: denominator.cases.count,
      sha256: denominator.cases.sha256,
      byFile: denominator.cases.byFile,
      families: FAMILIES.map(({ key, assertionId, tags, variants, kinds, oracle }) => ({
        key,
        assertionId,
        tags,
        variants,
        kinds,
        oracle
      })),
      switchFamilies: SWITCH_FAMILIES.map(({ key, assertionId, tags, oracle }) => ({
        key,
        assertionId,
        tags,
        oracle
      }))
    })
  )
  outputs.set('oracles-pins.json', stableStringify({ generatedBy: COMMAND, pins }))
  return outputs
}

/** The committed file: the shared contract shape, one item and one item detail per line. `d` is the flat view. */
function renderDenominator(d) {
  const { schema, layer, source, revision, command, naReasons, items, unresolved } = d
  const { itemDetails, ...rest } = d.details
  const lines = (list) => `[\n${list.map((v) => `    ${JSON.stringify(sortKeys(v))}`).join(',\n')}\n  ]`
  const head = stableStringify({ schema, layer, source, revision, command, naReasons })
    .trimEnd()
    .replace(/\n}$/, '')
  const detailsHead = stableStringify(rest).trimEnd().replace(/\n}$/, '').replace(/\n/g, '\n  ')
  const detailLines = Object.keys(itemDetails)
    .sort()
    .map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(sortKeys(itemDetails[k]))}`)
    .join(',\n')
  return `${head},\n  "items": ${lines(items)},\n  "unresolved": ${lines(unresolved)},\n  "details": ${detailsHead},\n    "itemDetails": {\n${detailLines}\n    }\n  }\n}\n`
}

/** Where each rendered output lives in the repo. */
export function targetOf(name) {
  if (name === 'oracles-pins.json') return path.join(REPO_ROOT, 'tests/qa/oracles/ui/pins.json')
  return path.join(LAYER_DIR, name)
}

async function main(argv) {
  const check = argv.includes('--check')
  const i = argv.indexOf('--scratch-out')
  let scratch = i >= 0 ? argv[i + 1] : null
  if (i >= 0 && !scratch) {
    console.error('--scratch-out needs a directory')
    return 2
  }
  if (scratch) {
    try {
      scratch = confineOutput(scratch, process.cwd(), '--scratch-out')
    } catch (error) {
      console.error(`--scratch-out: ${error.message}`)
      return 2
    }
  }
  const unknown = argv.filter(
    (a, idx) => !['--check', '--scratch-out'].includes(a) && argv[idx - 1] !== '--scratch-out'
  )
  if (unknown.length) {
    console.error(`unknown arguments: ${unknown.join(' ')}`)
    return 2
  }
  const built = await build()
  const outputs = renderOutputs(built)
  if (!check) {
    for (const [name, text] of outputs) await writeAtomic(targetOf(name), text)
    console.log(
      `wrote ${outputs.size} files; ${built.denominator.items.length} items, ${Object.values(built.cases).flat().length} cases, ${built.denominator.unresolved.length} unresolved`
    )
    return 0
  }
  let stale = 0
  for (const [name, text] of outputs) {
    if (scratch) await writeAtomic(path.join(scratch, name), text)
    let committed = null
    try {
      committed = await readRegular(targetOf(name))
    } catch {
      committed = null
    }
    if (committed !== text) {
      stale += 1
      console.error(
        `STALE ${name}: committed file ${committed === null ? 'is missing' : 'differs from a fresh generation'}`
      )
    }
  }
  const known = new Set(
    [...outputs.keys()].filter((n) => n.startsWith('cases/')).map((n) => path.basename(n))
  )
  const { readdir } = await import('node:fs/promises')
  for (const f of await readdir(path.join(LAYER_DIR, 'cases')).catch(() => [])) {
    if (f.endsWith('.json') && !known.has(f)) {
      stale += 1
      console.error(`STALE cases/${f}: not produced by the generator`)
    }
  }
  console.log(
    stale === 0 ? `denominator regenerates identically (${outputs.size} files)` : `${stale} stale file(s)`
  )
  return stale === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(2)
    }
  )
}
