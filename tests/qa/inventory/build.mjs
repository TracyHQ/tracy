#!/usr/bin/env node
// Build the QA inventory: run every extractor, merge the layers' denominators, assign each item to the
// layer that should own it, and write inventory.json + legacy-map.json (both committed, regenerable).
//
//   node tests/qa/inventory/build.mjs                 write the committed files
//   node tests/qa/inventory/build.mjs --check         exit 1 when the committed files differ from a fresh build
//   node tests/qa/inventory/build.mjs --out FILE      write the inventory to FILE (legacy map next to it as FILE.legacy-map.json)
//   node tests/qa/inventory/build.mjs --root DIR      read sources from another checkout (fixtures, scratch repos)
//
// The inventory says what EXISTS and who is expected to own it. It never says a thing was tested: an
// item with no layer claim is `unowned`, a source that could not be read in full is `incomplete`, and no
// completeness ratio is ever printed while either is true.

import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_ROOT,
  SourceError,
  formatJson,
  guardExternalParents,
  listingsStable,
  parseFlags,
  readGuardedText,
  parseJson,
  readSource,
  runExtractor
} from './extractors/common.mjs'
import { edgeTagsOf, INVENTORY_KINDS, validateCommitted, validateDenominator } from '../lib/denominator.mjs'
import { def as agentTools } from './extractors/agent-tools.mjs'
import { def as apiDoors } from './extractors/api-doors.mjs'
import { def as composeServices } from './extractors/compose-services.mjs'
import { def as e2eJourneys } from './extractors/e2e-journeys.mjs'
import { def as fence } from './extractors/fence.mjs'
import { def as gates } from './extractors/gates.mjs'
import { def as hostRoutes } from './extractors/host-routes.mjs'
import { def as languages } from './extractors/languages.mjs'
import { def as legacyFindings } from './extractors/legacy-findings.mjs'
import { def as legacyPlan } from './extractors/legacy-plan.mjs'
import { def as mailKinds } from './extractors/mail-kinds.mjs'
import { def as migrations } from './extractors/migrations.mjs'
import { def as modeMatrix } from './extractors/mode-matrix.mjs'
import { def as packages } from './extractors/packages.mjs'
import { def as pluginStrings } from './extractors/plugin-strings.mjs'
import { def as regression } from './extractors/regression.mjs'
import { def as scripts } from './extractors/scripts.mjs'
import { def as stories } from './extractors/stories.mjs'
import { def as uiSwitches } from './extractors/ui-switches.mjs'
import { def as webStrings } from './extractors/web-strings.mjs'

export const LAYERS = Object.freeze([
  'static',
  'unit',
  'api',
  'infra',
  'ui',
  'flows',
  'harness',
  'cms',
  'mail',
  'related'
])
const REL_INVENTORY = 'tests/qa/inventory/inventory.json'
const REL_LEGACY_MAP = 'tests/qa/inventory/legacy-map.json'
const REL_EDGE_TAGS = 'tests/qa/inventory/edge-tags.json'

export const EXTRACTORS = Object.freeze([
  ['gates', gates],
  ['api-doors', apiDoors],
  ['host-routes', hostRoutes],
  ['packages', packages],
  ['ui-switches', uiSwitches],
  ['languages', languages],
  ['web-strings', webStrings],
  ['plugin-strings', pluginStrings],
  ['stories', stories],
  ['agent-tools', agentTools],
  ['mode-matrix', modeMatrix],
  ['fence', fence],
  ['compose-services', composeServices],
  ['scripts', scripts],
  ['mail-kinds', mailKinds],
  ['migrations', migrations],
  ['regression', regression],
  ['e2e-journeys', e2eJourneys],
  ['legacy-plan', legacyPlan],
  ['legacy-findings', legacyFindings]
])

// The kind table lives beside the denominator contract (lib/denominator.mjs): every reader of a
// denominator needs it to judge a cross-layer claim the way this build does.
export const KIND_TABLE = INVENTORY_KINDS
export const ASSET_KINDS = Object.freeze(['regression', 'audit-item', 'audit-finding'])
/** Facts copied from an item into the inventory (the rest stays in the extractor output). */
const FACTS = Object.freeze({
  'api-door': ['audience', 'inCode', 'matchedBy', 'registeredConditionally'],
  'host-route': ['loc', 'conditional'],
  'web-string': ['language', 'present'],
  journey: ['hasFile', 'notCovered'],
  language: ['shown'],
  'ui-switch': ['defaultOn', 'locked'],
  'compose-service': ['lifecycle', 'file'],
  'story-file': ['exports'],
  'plugin-strings': ['namespace', 'keys', 'keysKnown'],
  migration: ['number', 'creates', 'alters', 'sharesNumber']
})

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/* ------------------------------ edge tags ------------------------------ */

export function loadEdgeTags(root) {
  const src = readSource(root, REL_EDGE_TAGS)
  const json = parseJson(src)
  const tagSets = {}
  tagSets.common = [...json.common]
  for (const [group, tags] of Object.entries(json.kinds))
    tagSets[group] = [...new Set([...json.common, ...tags])]
  return { hash: src.hash, tagSets, ...edgeTagsOf(json) }
}

const tagSetOf = (groups) => (groups.length === 0 ? 'common' : groups.join('+'))

/* ------------------------- denominators of layers ------------------------- */

// The contract (structure, kinds and tags per layer, N-A grammar) is tests/qa/lib/denominator.mjs, shared
// with `pnpm qa coverage` and the layer generators; this file only reads the files and merges the claims.
export { validateDenominator }

/** Directory names under tests/qa/layers that carry a denominator.json (membership is part of the build snapshot). */
export function denominatorFiles(root) {
  const dir = join(root, 'tests/qa/layers')
  const out = []
  let names = []
  try {
    names = readdirSync(dir).sort()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return out
  }
  for (const name of names) {
    const rel = `tests/qa/layers/${name}/denominator.json`
    try {
      lstatSync(join(root, rel))
      out.push({ name, rel })
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
  }
  return out
}

/** Read tests/qa/layers/<layer>/denominator.json files that exist; validate; never drop a bad one silently. */
export function loadDenominators(root, edge, errors) {
  const out = []
  for (const { name, rel } of denominatorFiles(root)) {
    if (!LAYERS.includes(name)) {
      errors.push(`${rel}: unknown layer directory "${name}"`)
      continue
    }
    let src
    try {
      src = readSource(root, rel)
      const again = readSource(root, rel)
      if (again.hash !== src.hash) throw new SourceError('denominator changed while reading')
    } catch (error) {
      errors.push(`${rel}: ${error.message}`)
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(src.text)
    } catch (error) {
      errors.push(`${rel}: invalid JSON: ${error.message}`)
      continue
    }
    // A layer may also claim an inventory item another layer is expected to own (a cross-layer claim).
    const { problems, doc } = validateCommitted(parsed, name, edge)
    if (problems.length) {
      for (const p of problems) errors.push(`${rel}: ${p}`)
      continue
    }
    out.push({
      layer: name,
      rel,
      hash: src.hash,
      source: doc.source,
      revision: doc.revision,
      items: doc.items,
      unresolved: doc.unresolved ?? []
    })
  }
  return out
}

/* ------------------------------ legacy map ------------------------------ */

const GROUP_OWNER = Object.freeze({
  SSR: 'ui',
  MAIL: 'mail',
  DSH: 'ui',
  CORE: 'unit',
  PUB: 'ui',
  REF: 'ui',
  CMS: 'cms',
  OPS: 'ui',
  CONTRACT: 'cms'
})

/** First matching rule wins; the rule name is kept as `basis` so a reviewer can contest it. */
const FINDING_RULES = Object.freeze([
  ['text:mail', (t) => /\b(mail|letter|e-?mail|smtp|otp mail|unsubscribe)\b/i.test(t.text), 'mail'],
  [
    'path:harness',
    (t) =>
      /packages\/tools\/|packages\/web\/tracy-harness|vendor\/tracy\/deepseek|\b(fence|symlink|traversal|agent tool|preset)\b/i.test(
        t.text + t.paths
      ),
    'harness'
  ],
  [
    'path:infra',
    (t) =>
      /apps\/tracy-host|deploy\/|dockerfile|packages\/fleet|compose|\b(cron|image build|container)\b/i.test(
        t.text + t.paths
      ),
    'infra'
  ],
  [
    'group:cms',
    (t) =>
      t.groups.includes('CMS') ||
      /vendor\/(wordpress|joomla|emdash)|packages\/cms|quickstart|\b(wordpress|joomla|emdash) (theme|template|site)\b/i.test(
        t.text + t.paths
      ),
    'cms'
  ],
  [
    'text:api',
    (t) =>
      /apps\/tracy-web\/src\/[a-z-]+\/route\.js|\/api\/|\bHTTP \d{3}\b|\b(GET|POST|PUT|PATCH|DELETE) \//.test(
        t.text + t.paths
      ),
    'api'
  ],
  ['text:flow', (t) => /\b(wizard|journey|dead end|loops?|signed-in|sign-in flow)\b/i.test(t.text), 'flows'],
  [
    'group:ui',
    (t) =>
      t.groups.some((g) => ['SSR', 'DSH', 'PUB', 'REF', 'OPS'].includes(g)) ||
      /packages\/(ui|site|brand|design|locale)\//.test(t.paths),
    'ui'
  ],
  ['group:core', (t) => t.groups.includes('CORE'), 'unit']
])

const REGRESSION_AREA_RULES = Object.freeze([
  ['needs:model', (c) => c.flakyModel || c.needs.includes('model'), 'harness'],
  [
    'area:cms',
    (c) => /^(wordpress-theme|emdash-theme|seeder|tracy-seeder|contracts)/.test(c.area ?? ''),
    'cms'
  ],
  ['area:infra', (c) => /^(fleet|tracy-fleet-operation)/.test(c.area ?? ''), 'infra'],
  ['area:harness', (c) => /^(site-tools|agent|dsh-passwords)/.test(c.area ?? ''), 'harness'],
  ['area:mail', (c) => (c.area ?? '').startsWith('mail'), 'mail'],
  [
    'area:api',
    (c) => /^(team|seats|identity|tracy-web|notifications|ops|web|badge|errors)/.test(c.area ?? ''),
    'api'
  ],
  [
    'area:ui',
    (c) =>
      /^(ui|sidebar|chat|inbox|site-tabs|comments|assistant|add-site|my-sites|design|i18n|vocabulary|browser|destructive-confirm)/.test(
        c.area ?? ''
      ),
    'ui'
  ],
  ['area:flows', (c) => /^(site-changes|sites|site-brief)/.test(c.area ?? ''), 'flows']
])

export function buildLegacyMap(recs) {
  const entries = []
  const itemGroup = new Map()
  for (const it of recs['legacy-plan']?.items ?? []) itemGroup.set(it.auditId, it.group)
  for (const it of recs['legacy-plan']?.items ?? [])
    entries.push({
      id: it.auditId,
      kind: 'audit-item',
      owner: GROUP_OWNER[it.group] ?? 'related',
      basis: `group:${it.group}`
    })
  for (const f of recs['legacy-findings']?.items ?? []) {
    const groups = f.items.map((i) => itemGroup.get(i) ?? i.split('-')[1]).filter(Boolean)
    const t = { text: `${f.title} ${f.evidenceNote ?? ''}`, paths: f.evidence.join(' '), groups }
    const rule = FINDING_RULES.find(([, test]) => test(t))
    entries.push({
      id: f.findingId,
      kind: 'audit-finding',
      owner: rule ? rule[2] : 'related',
      basis: rule ? rule[0] : 'fallback:no-rule-matched'
    })
  }
  for (const c of recs.regression?.items ?? []) {
    const rule = REGRESSION_AREA_RULES.find(([, test]) => test(c))
    entries.push({
      id: c.caseId,
      kind: 'regression',
      owner: rule ? rule[2] : 'unit',
      basis: rule ? rule[0] : 'fallback:unit'
    })
  }
  // Every e2e-dev journey is a flow; J2c stays listed with the reason it has no executable case.
  for (const j of recs['e2e-journeys']?.items ?? [])
    entries.push({
      id: j.journey,
      kind: 'journey',
      owner: 'flows',
      basis: 'registry:e2e-dev',
      ...(j.notCovered ? { note: `no executable case: ${j.notCovered}` } : {})
    })
  entries.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id))
  return entries
}

/* -------------------------------- build -------------------------------- */

/** Reconciliation with plan §1: planned figure, measured figure, and why they differ when they do. */
function figures(recs) {
  const count = (name, pred = () => true) => (recs[name]?.items ?? []).filter(pred).length
  const reg = recs.regression?.items ?? []
  return [
    ['static gates', 57, count('gates')],
    ['public API method-paths', 165, count('api-doors', (i) => i.audience === 'public')],
    [
      'public API paths (declared)',
      149,
      recs['api-doors']?.notes?.public?.pathsDeclared ?? null,
      'one declared path has no HTTP method (`/api/sites/{key}/apply/{action}`); 148 paths carry a method'
    ],
    ['internal API method-paths', 304, count('api-doors', (i) => i.audience === 'internal')],
    [
      'internal API paths (declared)',
      272,
      recs['api-doors']?.notes?.internal?.pathsDeclared ?? null,
      'same: one declared path has no HTTP method; 271 carry one'
    ],
    ['host routes', 17, count('host-routes')],
    ['package manifests', 47, count('packages', (i) => i.kind === 'package')],
    [
      'cordis files (25 package roots + 1 fleet profile)',
      26,
      count('packages', (i) => i.kind === 'dsh-plugin')
    ],
    ['UI switches', 58, count('ui-switches')],
    ['interface languages', 8, count('languages')],
    ['web string keys', 310, count('web-strings', (i) => i.language === 'en')],
    ['web string key x language cells', 2480, count('web-strings')],
    [
      'plugin strings.ts files',
      20,
      count('plugin-strings'),
      'file count only; namespaces that spread an imported table are unresolved, so namespace/key totals are not claimed'
    ],
    ['story files', 39, count('stories', (i) => i.kind === 'story-file')],
    [
      'story `export const` (lexical)',
      342,
      count('stories', (i) => i.kind === 'story-export'),
      'a lexical count, not a Storybook index'
    ],
    ['regression cases', 157, reg.length],
    ['regression cases with a `run`', 91, reg.filter((i) => i.hasRun).length],
    ['regression cases without a `run`', 66, reg.filter((i) => !i.hasRun).length],
    ['regression `flaky_model`', 8, reg.filter((i) => i.flakyModel).length],
    ['e2e-dev journey ids', 18, count('e2e-journeys')],
    [
      'e2e-dev journey files',
      17,
      count('e2e-journeys', (i) => i.hasFile),
      'J2c is registered with no file or executable case'
    ],
    ['agent tools', 11, count('agent-tools', (i) => i.kind === 'agent-tool')],
    ['agent surfaces', 8, count('agent-tools', (i) => i.kind === 'agent-surface')],
    ['mode presets (4 role x 3 platform)', 12, count('mode-matrix', (i) => i.kind === 'mode-preset')],
    ['mode tool rows', 27, count('mode-matrix', (i) => i.kind === 'mode-tool-row')],
    ['mode distinct tool names', 28, recs['mode-matrix']?.notes?.distinctToolNames ?? null],
    ['mode skill rows', 69, count('mode-matrix', (i) => i.kind === 'mode-skill')],
    ['fence FS_TOOL_ARGS', 10, count('fence', (i) => i.kind === 'fence-fs-tool')],
    ['fence WORKDIR_ARG', 3, count('fence', (i) => i.kind === 'fence-workdir')],
    [
      'compose permanent services in compose.yml',
      7,
      count('compose-services', (i) => i.lifecycle === 'permanent' && i.file === 'deploy/compose.yml')
    ],
    ['compose one-shot init services', 1, count('compose-services', (i) => i.lifecycle === 'one-shot-init')],
    [
      'compose services added by override files',
      1,
      count('compose-services', (i) => i.addedBy !== null),
      'macOS override adds `dns-host`; which services a host starts depends on --profile and is not resolved'
    ],
    ['scripts/ top-level files', 106, count('scripts', (i) => i.kind === 'script-file' && i.depth === 'top')],
    ['scripts/ recursive files', 227, count('scripts', (i) => i.kind === 'script-file')],
    ['root npm commands', 25, count('scripts', (i) => i.kind === 'npm-script')],
    ['fleet script files', 113, count('scripts', (i) => i.kind === 'fleet-script'), 'files, not entrypoints'],
    ['mail notification kinds', 18, count('mail-kinds', (i) => i.kind === 'mail-kind')],
    ['mail HTML templates', 4, count('mail-kinds', (i) => i.kind === 'mail-html')],
    ['audit plan items (164 main + 48 sub)', 212, count('legacy-plan')],
    [
      'audit findings',
      155,
      count('legacy-findings'),
      "the copied ledgers declare 158 unique finding ids (S1=27 S2=21 S3=22 S4=13 S5=18 S6=17 S7=16 S8=24) against the brief's 155; only ledger S1 could be compared with its original, so the difference is unreconciled, not explained. All 158 are kept"
    ]
  ].map(([label, planned, measured, note]) => ({
    label,
    planned,
    measured,
    agrees: planned === measured,
    ...(note ? { note } : {})
  }))
}

/** `extractors` is the list to run (the committed one by default; a test passes its own to prove a refusal). */
export function buildInventory(root = DEFAULT_ROOT, { extractors = EXTRACTORS } = {}) {
  const errors = []
  const edge = loadEdgeTags(root)
  const recs = {}
  const sources = []
  const unresolved = []
  for (const [name, def] of extractors) {
    const rec = runExtractor(def, root)
    recs[name] = rec
    sources.push({
      name,
      sourcePath: rec.sourcePath,
      sourceHash: rec.sourceHash,
      revision: rec.revision,
      extractionKind: rec.extractionKind,
      status: rec.status,
      ...(rec.incompleteReason ? { incompleteReason: rec.incompleteReason } : {}),
      items: rec.items.length,
      unresolved: rec.unresolved.length,
      inputs: rec.inputs.length,
      ...(rec.notes ? { notes: rec.notes } : {})
    })
    for (const u of rec.unresolved) unresolved.push({ source: name, ...u })
  }

  // Revision of the two legacy copies is the revision of the ORIGINAL external source, not of this repo.
  for (const [name, src] of [
    ['legacy-plan', 'originalSource'],
    ['legacy-findings', 'originalSource']
  ]) {
    // Unknown stays null: the repository head of the copy says nothing about the original.
    const rev = recs[name].notes?.[src]?.revision
    const known = typeof rev === 'string' && rev !== '' ? rev : null
    recs[name].revision = known
    sources.find((s) => s.name === name).revision = known
  }

  const layers = Object.fromEntries(
    LAYERS.map((l) => [l, { items: [], byKind: {}, legacyAssets: { total: 0, byKind: {} } }])
  )
  const itemIndex = new Map()
  const byKey = new Map()
  for (const [name] of extractors) {
    for (const it of recs[name].items) {
      const row = KIND_TABLE[it.kind]
      if (!row) continue
      const facts = Object.fromEntries(
        (FACTS[it.kind] ?? []).filter((k) => it[k] !== undefined).map((k) => [k, it[k]])
      )
      const item = {
        id: it.id,
        kind: it.kind,
        source: name,
        tagSet: tagSetOf(row.groups),
        ...(Object.keys(facts).length ? { facts } : {})
      }
      // An id is one item. The extractors each refuse their own duplicates; two extractors emitting one id
      // would let a claim land on whichever came last, so the build refuses the pair instead.
      if (itemIndex.has(item.id)) {
        errors.push(
          `item id "${item.id}" is emitted by two extractors (${itemIndex.get(item.id).item.source} and ${name})`
        )
        continue
      }
      layers[row.layer].items.push(item)
      itemIndex.set(item.id, { item, layer: row.layer })
      const key = it.id.slice(it.id.indexOf(':') + 1)
      byKey.set(key, [...(byKey.get(key) ?? []), item])
    }
  }

  // Merge the layers' own denominators: a claim marks an item as owned; nothing is invented.
  const denominators = {}
  for (const d of loadDenominators(root, edge, errors)) {
    let claimed = 0
    let extra = 0
    for (const di of d.items) {
      let hits = itemIndex.has(di.id)
        ? [itemIndex.get(di.id).item]
        : (byKey.get(di.id) ?? []).filter((x) => x.kind === di.kind)
      if (hits.length > 1) {
        errors.push(`${d.rel}: item "${di.id}" is ambiguous (${hits.map((h) => h.id).join(', ')})`)
        continue
      }
      if (hits.length === 0) {
        extra++
        continue
      }
      const hit = hits[0]
      if (hit.kind !== di.kind) {
        errors.push(`${d.rel}: item "${di.id}" has kind ${di.kind} but the inventory says ${hit.kind}`)
        continue
      }
      if (hit.claims?.some((c) => c.layer === d.layer)) {
        errors.push(`${d.rel}: item "${hit.id}" is claimed twice by layer ${d.layer}`)
        continue
      }
      for (const other of hit.claims ?? []) {
        // Two layers may share an item, but they must not disagree about what is required or not applicable.
        const clash = [
          ...di.requiredTags.filter((t) => t in other.na),
          ...other.requiredTags.filter((t) => t in di.na)
        ]
        if (clash.length)
          errors.push(
            `${d.rel}: item "${hit.id}": tag(s) ${[...new Set(clash)].join(', ')} are required by one layer and N-A for another (${other.layer} vs ${d.layer})`
          )
      }
      ;(hit.claims ??= []).push({
        layer: d.layer,
        requiredTags: di.requiredTags,
        na: di.na,
        ...(KIND_TABLE[hit.kind].layer !== d.layer ? { crossLayer: true } : {})
      })
      claimed++
    }
    denominators[d.layer] = {
      source: d.source,
      revision: d.revision,
      hash: d.hash,
      items: d.items.length,
      claimed,
      notInInventory: extra,
      unresolved: d.unresolved.length
    }
    for (const u of d.unresolved)
      unresolved.push({
        // Every field the layer wrote survives (`detail` names WHICH rows are unresolved); only `source`
        // is rewritten, because in the inventory it names the layer and the layer's own value moves to `origin`.
        ...u,
        source: `layer:${d.layer}`,
        kind: u.kind ?? 'layer-unresolved',
        ...(u.source !== undefined ? { origin: u.source } : {})
      })
  }

  for (const l of LAYERS) {
    const L = layers[l]
    L.items.sort((a, b) => cmp(a.id, b.id))
    for (const it of L.items) {
      L.byKind[it.kind] = (L.byKind[it.kind] ?? 0) + 1
      if (!it.claims) it.unowned = true
      else it.claims.sort((a, b) => cmp(a.layer, b.layer))
    }
    L.count = L.items.length
    L.unowned = L.items.filter((i) => i.unowned).length
  }

  const legacyMap = buildLegacyMap(recs)
  for (const e of legacyMap) {
    const L = layers[e.owner]
    L.legacyAssets.total++
    L.legacyAssets.byKind[e.kind] = (L.legacyAssets.byKind[e.kind] ?? 0) + 1
  }

  const incompleteSources = sources.filter((s) => s.status !== 'complete').map((s) => s.name)
  const reasons = []
  if (incompleteSources.length) reasons.push(`${incompleteSources.length} source(s) incomplete`)
  if (unresolved.length)
    reasons.push(`${unresolved.length} unresolved entr${unresolved.length === 1 ? 'y' : 'ies'}`)
  const unowned = Object.values(layers).reduce((n, l) => n + l.unowned, 0)
  if (unowned) reasons.push(`${unowned} item(s) unowned`)
  const inventory = {
    schema: 'tracy-qa-inventory/v1',
    generator: 'node tests/qa/inventory/build.mjs',
    note: 'Lists what exists and who is expected to own it. It proves no case ran. `revision` is the last commit that touched a source (or the original revision of a copied legacy source); --check compares hashes and every provenance field; only the git revision of repository sources is left out, because a rebase or squash moves it without changing a byte.',
    edgeTags: { file: REL_EDGE_TAGS, hash: edge.hash, tagSets: edge.tagSets },
    sources,
    unresolved,
    completeness: {
      status: incompleteSources.length
        ? 'incomplete'
        : unresolved.length
          ? 'complete-with-unresolved'
          : 'complete',
      incompleteSources,
      reasons,
      note: 'no ratio is computed: a count of items is not coverage'
    },
    denominators,
    layers,
    reconciliation: figures(recs),
    legacyMap: { file: REL_LEGACY_MAP, entries: legacyMap.length }
  }
  return { inventory, legacyMap, errors, recs }
}

/* ------------------------------ output ------------------------------ */

export const serialize = (value) => formatJson(value)

/** The file operations the writers use; a test replaces some to inject a fault at an exact step. */
export const realOps = Object.freeze({
  open: openSync,
  write: writeSync,
  fsync: fsyncSync,
  close: closeSync,
  rename: renameSync,
  unlink: unlinkSync
})

/** Write all of `text`: `write` may take fewer bytes than asked, and 0 bytes is a failure, never a success. */
function writeAll(ops, fd, text) {
  const buf = Buffer.from(text)
  let at = 0
  while (at < buf.length) {
    const n = ops.write(fd, buf, at, buf.length - at)
    if (!(n > 0)) throw new Error(`short write: ${at} of ${buf.length} bytes`)
    at += n
  }
}

/** Create `path` exclusively with `text` fully written and synced; the temp name is removed again on any failure. */
function stageFile(ops, path, text, tag) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.${tag}`
  const fd = ops.open(tmp, 'wx', 0o644)
  let closed = false
  try {
    writeAll(ops, fd, text)
    ops.fsync(fd)
    closed = true
    ops.close(fd)
  } catch (error) {
    if (!closed)
      try {
        ops.close(fd)
      } catch {
        // closing a failed descriptor
      }
    try {
      ops.unlink(tmp)
    } catch {
      // the failure may be the open itself
    }
    throw error
  }
  return tmp
}

/** Write via a temp file in the same directory, fsync, rename. A failure leaves the old file untouched. */
export function writeAtomic(path, text, ops = realOps) {
  const full = guardExternalParents(path, true)
  const tmp = stageFile(ops, full, text, 'tmp')
  try {
    ops.rename(tmp, full)
  } catch (error) {
    try {
      ops.unlink(tmp)
    } catch {
      // already gone
    }
    throw error
  }
}

/**
 * Replace several files as one unit. Pipeline: validate every target (absolute, parents are real directories,
 * existing target a regular file) and read what is there, all before any side effect; stage every new file and a
 * recovery copy of every old one on disk, fully written and synced; rename in order; when a rename fails put
 * the old files back from the recovery copies. A recovery copy that could not be used is KEPT and named in the
 * error, so a failed rollback leaves the means to repair it. What this cannot promise is atomicity against a
 * process kill between two renames or against someone swapping a parent directory while it runs.
 */
export function writePair(files, ops = realOps) {
  const targets = files.map(([path, text]) => ({ path: guardExternalParents(path, false), text }))
  const olds = targets.map(({ path }) => readGuardedText(path))
  for (const t of targets) guardExternalParents(t.path, true)
  const staged = []
  const recovery = []
  const done = []
  try {
    targets.forEach((t, i) => {
      staged.push(stageFile(ops, t.path, t.text, 'tmp'))
      recovery.push(olds[i] === null ? null : stageFile(ops, t.path, olds[i], 'recover'))
    })
    targets.forEach((t, i) => {
      ops.rename(staged[i], t.path)
      done.push(i)
    })
  } catch (error) {
    const lost = []
    for (const i of done.reverse()) {
      try {
        if (olds[i] === null) ops.unlink(targets[i].path)
        else ops.rename(recovery[i], targets[i].path)
        recovery[i] = null
      } catch (rollbackError) {
        lost.push(
          `${targets[i].path}: ${rollbackError.message}${recovery[i] ? ` (old content kept in ${recovery[i]})` : ''}`
        )
        if (recovery[i]) recovery[i] = `KEEP:${recovery[i]}`
      }
    }
    for (const t of [...staged, ...recovery]) cleanup(ops, t)
    if (lost.length)
      throw new Error(`${error.message}; ROLLBACK FAILED, artifacts may be mixed: ${lost.join('; ')}`)
    throw error
  }
  for (const t of [...staged, ...recovery]) cleanup(ops, t)
}

function cleanup(ops, tmp) {
  if (!tmp || tmp.startsWith('KEEP:')) return
  try {
    ops.unlink(tmp)
  } catch {
    // renamed away or never created
  }
}

const COPIED_REVISION_SOURCES = new Set(['legacy-plan', 'legacy-findings'])

/**
 * Comparable form of an artifact: only `sources[].revision` of repository sources (a git head that a rebase
 * or squash moves without changing a byte) is blanked. Every other field, revisions of copied sources and
 * of layer denominators included, is compared.
 */
export function normalizeForCheck(text) {
  const doc = JSON.parse(text)
  if (doc && Array.isArray(doc.sources))
    for (const s of doc.sources)
      if (s && typeof s === 'object' && !COPIED_REVISION_SOURCES.has(s.name)) s.revision = null
  return JSON.stringify(doc)
}

export function formatReport(inv) {
  const out = []
  out.push('Tracy QA inventory')
  out.push('')
  out.push('Sources (hash = sha256 of every input read; revision = last commit touching them)')
  for (const s of inv.sources) {
    out.push(
      `  ${s.name.padEnd(16)} ${s.status.padEnd(10)} items=${String(s.items).padStart(5)} unresolved=${String(s.unresolved).padStart(3)} rev=${(s.revision ?? 'unknown').slice(0, 9).padEnd(9)} hash=${(s.sourceHash ?? 'none').slice(0, 12)}${s.incompleteReason ? `  <- ${s.incompleteReason}` : ''}`
    )
  }
  out.push('')
  out.push('Layers (items = denominator expected to be owned; unowned = no layer denominator claims it)')
  for (const [name, l] of Object.entries(inv.layers)) {
    const kinds = Object.entries(l.byKind)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ')
    const assets = l.legacyAssets.total ? `  legacy assets=${l.legacyAssets.total}` : ''
    out.push(
      `  ${name.padEnd(8)} items=${String(l.count).padStart(5)} unowned=${String(l.unowned).padStart(5)}${assets}  ${kinds}`
    )
  }
  const dens = Object.entries(inv.denominators)
  out.push('')
  out.push(
    dens.length
      ? 'Merged layer denominators'
      : 'Merged layer denominators: none present (every item is unowned until the layers ship tests/qa/layers/<layer>/denominator.json)'
  )
  for (const [name, d] of dens)
    out.push(
      `  ${name.padEnd(8)} items=${d.items} claimed=${d.claimed} not-in-inventory=${d.notInInventory} source=${d.source}`
    )
  out.push('')
  out.push('Reconciliation with plan §1 (planned vs measured)')
  for (const f of inv.reconciliation)
    out.push(
      `  ${f.agrees ? 'ok     ' : 'DIFFERS'} ${f.label}: planned ${f.planned}, measured ${f.measured}${f.note ? `  -- ${f.note}` : ''}`
    )
  out.push('')
  out.push(
    `Completeness: ${inv.completeness.status.toUpperCase()} (${inv.completeness.reasons.join('; ') || 'nothing outstanding'}). ${inv.completeness.note}.`
  )
  if (inv.completeness.incompleteSources.length)
    out.push(`  incomplete sources: ${inv.completeness.incompleteSources.join(', ')}`)
  return `${out.join('\n')}\n`
}

/* --------------------------------- CLI --------------------------------- */

function usage(message, io) {
  io.err(`${message}\nusage: node tests/qa/inventory/build.mjs [--check | --out FILE] [--root DIR]\n`)
  return 2
}

/** Re-hash every input the build read; a source that changed mid-build means the output may be torn. */
export function inputsStable(root, recs) {
  return unstableInputs(root, recs).length === 0
}

function unstableInputs(root, recs) {
  const out = []
  for (const [name, rec] of Object.entries(recs)) {
    let ok = true
    for (const input of rec.inputs) {
      try {
        if (readSource(root, input.path).hash !== input.hash) ok = false
      } catch {
        ok = false
      }
    }
    if (!ok) out.push(name)
  }
  return out
}

/**
 * Everything a published snapshot rests on, checked again against the tree: the hash of every input of every
 * extractor, the member files of every directory listing, the edge-tags file and the set and content of the
 * layer denominators. Returns the reasons it no longer holds (empty: still the same).
 */
export function manifestDrift(root, result) {
  const reasons = []
  for (const name of unstableInputs(root, result.recs)) reasons.push(`inputs of ${name} changed`)
  for (const [name, rec] of Object.entries(result.recs))
    if (!listingsStable(root, rec)) reasons.push(`file listing of ${name} changed`)
  try {
    if (loadEdgeTags(root).hash !== result.inventory.edgeTags.hash) reasons.push('edge-tags.json changed')
  } catch (error) {
    reasons.push(`edge-tags.json unreadable: ${error.message}`)
  }
  const had = result.inventory.denominators
  const now = new Map()
  try {
    for (const { name, rel } of denominatorFiles(root)) {
      try {
        now.set(name, readSource(root, rel).hash)
      } catch {
        now.set(name, null)
      }
    }
  } catch (error) {
    reasons.push(`denominator listing unreadable: ${error.message}`)
  }
  for (const layer of new Set([...Object.keys(had), ...now.keys()]))
    if ((had[layer]?.hash ?? undefined) !== (now.get(layer) ?? undefined))
      reasons.push(`denominator of ${layer} changed`)
  return reasons
}

/**
 * Build until two consecutive builds agree and every extractor input still hashes as it was read. The
 * second build re-reads the edge tags, every layer denominator and every directory listing too, so a file
 * that appeared, vanished or changed between the two shows as a difference. Three attempts, then an error.
 */
export function buildStable(root, build = buildInventory) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = build(root)
    if (!inputsStable(root, result.recs)) continue
    const again = build(root)
    if (
      serialize(again.inventory) === serialize(result.inventory) &&
      serialize(again.legacyMap) === serialize(result.legacyMap) &&
      inputsStable(root, again.recs)
    )
      return result
  }
  throw new Error('sources kept changing while the inventory was built (3 attempts)')
}

/**
 * Validate -> snapshot -> render: a stable build whose whole manifest is verified again immediately before
 * it is handed to the publisher. A manifest that moved sends the whole pipeline round again (three attempts
 * in all); the caller never receives a snapshot known to be mixed. `afterSnapshot` lets a test change the
 * tree at exactly that boundary.
 */
export function prepare(root, { build = buildInventory, afterSnapshot = () => {} } = {}) {
  let last = []
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = buildStable(root, build)
    if (result.errors.length) return { result }
    afterSnapshot(attempt)
    last = manifestDrift(root, result)
    if (!last.length)
      return { result, inventoryText: serialize(result.inventory), legacyText: serialize(result.legacyMap) }
  }
  throw new Error(`the sources changed between the snapshot and publishing (3 attempts): ${last.join('; ')}`)
}

/** `io` lets a test capture the output without replacing process.stdout; `deps` lets it inject faults. */
export function main(
  argv,
  io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) },
  deps = {}
) {
  let flags
  try {
    flags = parseFlags(argv, ['--out', '--root'], ['--check'])
  } catch (error) {
    return usage(error.message, io)
  }
  const check = flags['--check'] === true
  if (check && flags['--out']) return usage('--check and --out cannot be combined (--check never writes)', io)
  const root = flags['--root'] ? resolve(flags['--root']) : DEFAULT_ROOT
  const out = flags['--out'] ? resolve(flags['--out']) : null
  let prepared
  try {
    prepared = prepare(root, deps)
  } catch (error) {
    io.err(`inventory build failed: ${error.message}\n`)
    return 1
  }
  const { result } = prepared
  if (result.errors.length) {
    io.err(`inventory validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}\n`)
    return 1
  }
  const { inventoryText, legacyText } = prepared
  let invPath
  let mapPath
  try {
    // The canonical root: every path below it is then checked component by component.
    const canonical = out ? null : realpathSync(root)
    invPath = out ?? join(canonical, REL_INVENTORY)
    mapPath = out ? `${out}.legacy-map.json` : join(canonical, REL_LEGACY_MAP)
  } catch (error) {
    io.err(`cannot resolve the output location: ${error.message}\n`)
    return 1
  }
  if (check) {
    const stale = []
    for (const [path, fresh] of [
      [invPath, inventoryText],
      [mapPath, legacyText]
    ]) {
      let committed
      try {
        committed = readGuardedText(path)
      } catch (error) {
        stale.push(`${path}: unreadable (${error.message})`)
        continue
      }
      if (committed === null) {
        stale.push(`${path}: missing`)
        continue
      }
      try {
        if (normalizeForCheck(committed) !== normalizeForCheck(fresh))
          stale.push(`${path}: differs from a fresh build`)
      } catch {
        stale.push(`${path}: not valid JSON`)
      }
    }
    if (stale.length) {
      io.err(
        `inventory drift:\n${stale.map((s) => `  - ${s}`).join('\n')}\nregenerate with: node tests/qa/inventory/build.mjs\n`
      )
      return 1
    }
    io.out('inventory is up to date\n')
    return 0
  }
  try {
    writePair(
      [
        [invPath, inventoryText],
        [mapPath, legacyText]
      ],
      deps.ops ?? realOps
    )
  } catch (error) {
    io.err(`cannot write output: ${error.message}\n`)
    return 1
  }
  io.out(formatReport(result.inventory))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
