// Assembles every spec of the cms layer and turns them into (1) case manifests, (2) the assertion registry the
// runner executes, (3) the denominator. The three come from the same specs and the same inventory, so a case can
// never refer to an item that does not exist and an item can never silently lose its cases.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DENOMINATOR_SCHEMA_ID, NaTable } from '../../../lib/denominator.mjs'
import { CMS_TAGS, COMMON_TAGS } from '../lib/inventory.mjs'
import { specs as contractSpecs } from './contracts.mjs'
import { specs as fleetSpecs } from './fleet-python.mjs'
import { legacySpecs } from './legacy.mjs'
import { liveSpecs } from './live.mjs'
import { specs as localSpecs } from './local-releases.mjs'
import { specs as questionSpecs } from './questions-sync.mjs'
import { releaseSpecs } from './release-data.mjs'
import { specs as assetSpecs } from './release-assets.mjs'
import { specs as settingSpecs } from './tracy-setting.mjs'
import { readBytesSync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const LAYER = 'cms'

/** spec.item alias -> the function item it exercises (checked against the extracted exports at generation). */
export const ITEM_ALIASES = Object.freeze({
  'release-assets.download': 'fn:release-assets.js#downloadReleaseAsset',
  'release-assets.upload': 'fn:release-assets.js#uploadReleaseAsset',
  'release-assets.delete': 'fn:release-assets.js#deleteReleaseAsset',
  'tracy-setting.validate': 'fn:tracy-setting.mjs#validateSetting',
  'local-releases.read': 'fn:local-releases.js#readLocalPacks',
  'local-releases.install-part': 'fn:local-releases.js#localInstallPart',
  'quickstart.py.download': 'fn:quickstart.py#download',
  'quickstart-jpa.entries': 'fn:quickstart_jpa.py#entries',
  'contracts.readContracts': 'fn:contracts.js#readContracts',
  'contracts.contractFor': 'fn:contracts.js#contractFor',
  'contracts.mayName': 'fn:contracts.js#mayName',
  'build-questions.resolveQuestions': 'fn:build-questions.js#resolveQuestions',
  'quickstart-releases.sync': 'fn:quickstart-releases.js#syncReleases'
})

/** The CMS/release tags that make sense for each module's functions, beside the common ones. */
const FUNCTION_TAGS = Object.freeze({
  'release-assets.js': ['missing-asset', 'bad-hash'],
  'tracy-setting.mjs': ['missing-asset', 'bad-hash', 'mixed-version', 'archive-path'],
  'local-releases.js': ['missing-asset', 'bad-hash', 'archive-path', 'secret-scrub'],
  'contracts.js': ['missing-contract', 'mixed-version', 'upgrade-compat'],
  'quickstart-releases.js': ['missing-asset', 'bad-hash', 'mixed-version'],
  'quickstart.py': ['missing-asset', 'bad-hash', 'archive-path', 'secret-scrub', 'mixed-version'],
  'quickstart_jpa.py': ['archive-path'],
  'build-questions.js': [],
  'question-sets.js': []
})

const SHORT = {
  'release.contract-resolves-to-itself': 'resolve',
  'release.pins-are-well-formed': 'pins',
  'release.lock-files-are-present': 'locks',
  'release.contract-carries-no-secret': 'secrets',
  'release.live-pins-match-github': 'live-pins',
  'catalogue.live-releases-read': 'catalogue',
  'stand.cms-operation': 'op',
  'legacy.suite-exit-status': 'suite'
}

const SPEC_FILES = [
  'contracts',
  'fleet-python',
  'legacy',
  'live',
  'local-releases',
  'questions-sync',
  'release-assets',
  'release-data',
  'tracy-setting'
]

export function specSourceHash() {
  const h = createHash('sha256')
  for (const f of SPEC_FILES) h.update(readBytesSync(path.join(HERE, `${f}.mjs`)))
  return h.digest('hex')
}

export function collectSpecs(inventory) {
  return [
    ...assetSpecs,
    ...settingSpecs,
    ...localSpecs,
    ...fleetSpecs,
    ...contractSpecs,
    ...questionSpecs,
    ...releaseSpecs(inventory),
    ...liveSpecs(inventory),
    ...legacySpecs(inventory)
  ]
}

/** sha256 prefix of every repo file named inside an oracle source string, so a changed oracle changes the manifest. */
function oracleRef(repoRoot, oracle) {
  const files = [...String(oracle.source).matchAll(/[\w./-]+\.(?:md|js|mjs|py|json)\b/g)].map((m) => m[0])
  const hashed = [...new Set(files)]
    .filter((f) => existsSync(path.join(repoRoot, f)))
    .map(
      (f) =>
        `${f}@sha256:${createHash('sha256')
          .update(readBytesSync(path.join(repoRoot, f)))
          .digest('hex')
          .slice(0, 12)}`
    )
  return `${oracle.section ?? 'whole file'}${hashed.length ? ` | ${hashed.join(' | ')}` : ''}`
}

export function itemFor(spec, variant) {
  if (variant.itemId) return variant.itemId
  const fn = ITEM_ALIASES[spec.item]
  if (!fn) throw new Error(`spec ${spec.assertion}: item ${spec.item} has no alias`)
  return fn
}

export function buildManifests(inventory, repoRoot) {
  const manifests = []
  for (const spec of collectSpecs(inventory)) {
    for (const v of spec.variants) {
      const tags = [...new Set(v.tags)]
      const itemId = itemFor(spec, v)
      const short = SHORT[spec.assertion]
      const idKey = spec.item ? spec.item : `${v.key}`
      const id = spec.item
        ? `QA-CMS-${idKey}-${tags[0]}-${v.key}`
        : spec.legacy
          ? `QA-CMS-legacy-${tags[0]}-${v.key}`
          : spec.assertion === 'stand.cms-operation'
            ? `QA-CMS-${v.params.label}-${tags[0]}-${v.params.operation}`
            : `QA-CMS-${v.key}-${tags[0]}-${short}`
      const live =
        spec.assertion === 'release.live-pins-match-github' ||
        spec.assertion === 'catalogue.live-releases-read'
      const stand = spec.assertion === 'stand.cms-operation'
      manifests.push({
        id,
        itemIds: [itemId],
        requirement: spec.requirement,
        oracle: {
          source: spec.oracle.source,
          ref: oracleRef(repoRoot, spec.oracle),
          invariant: spec.oracle.invariant
        },
        edgeTags: tags,
        dimensions: { ...v.params, variant: v.key, assertion: spec.assertion },
        area: spec.area,
        targets: stand ? ['local', 'dev'] : live ? ['local', 'dev', 'prod'] : ['local'],
        effects: {
          reads: spec.reads ?? [],
          writes: stand ? spec.writes : live ? [] : ['run scratch directory under --out'],
          mail: false,
          model: false,
          containers: Boolean(spec.containers)
        },
        prerequisites: [...(spec.prerequisites ?? []), ...(v.prerequisites ?? [])],
        assertionIds: [spec.assertion],
        fixtures: v.mutation ? [`mutation:${v.mutation}`] : [],
        redProof: null,
        legacyIds: []
      })
    }
  }
  return manifests
}

/** Registry the runner executes: assertion id -> { execute, mutations }. Also returns the manifests' groups for files. */
export function buildRegistry(inventory) {
  const registry = {}
  const sourceHash = specSourceHash()
  for (const spec of collectSpecs(inventory)) {
    const execute = spec.pending
      ? async () => ({ verdict: 'PENDING', reason: spec.pending, evidence: [] })
      : spec.execute
    if (registry[spec.assertion]) throw new Error(`two specs share the assertion id ${spec.assertion}`)
    registry[spec.assertion] = {
      execute,
      mutations: spec.mutations ?? {},
      sourceHash,
      describe: spec.requirement
    }
  }
  // The matrix spec is both gated by a probe and pending; the legacy and live specs bring their own execute.
  return registry
}

export function buildDenominator(inventory, repoRoot, command) {
  const items = []
  const reasons = new NaTable()
  // ADR 0017 §9 (Joomla-qua-design-plan): tracy-airbnb/j6 has profiles and no quickstart release.
  const designPack = reasons.add(
    'a design pack is applied over a site built from a quickstart; it is not installed on its own and no quickstart release exists for it (ADR 0017 §9, Joomla-qua-design-plan: tracy-airbnb/j6 has profiles and no quickstart release)',
    'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
  )
  let designPacks = 0
  for (const r of inventory.releases) {
    const na = {}
    if (r.designPack) {
      designPacks += 1
      for (const tag of ['fresh-install', 'restore']) na[tag] = designPack
    }
    // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
    items.push({
      id: `release:${r.key}`,
      kind: 'cms-release',
      requiredTags: [...COMMON_TAGS, ...CMS_TAGS].filter((tag) => !(tag in na)),
      na,
      meta: { platform: r.platform, shape: r.shape, cms: r.cms, template: r.template, version: r.version }
    })
  }
  for (const e of inventory.emdash)
    items.push({
      id: `emdash:${e.id}`,
      kind: 'cms-template',
      requiredTags: [...COMMON_TAGS, ...CMS_TAGS],
      na: {},
      meta: { revision: e.revision }
    })
  for (const f of inventory.functions) {
    const base = f.file.split('/').pop()
    items.push({
      id: f.id,
      kind: 'function',
      requiredTags: [...COMMON_TAGS, ...(FUNCTION_TAGS[base] ?? [])],
      na: {}
    })
  }
  for (const l of inventory.legacy) items.push({ id: l.id, kind: 'suite', requiredTags: ['happy'], na: {} })
  items.push({
    id: 'live:ja-products-releases',
    kind: 'live-catalogue',
    requiredTags: ['happy', 'boundary', 'dependency-failure'],
    na: {}
  })
  items.sort((a, b) => a.id.localeCompare(b.id))
  return {
    schema: DENOMINATOR_SCHEMA_ID,
    source:
      'git-tracked contract manifests under packages/cms/*/contracts, EmDash qa.contract.json, exports of the release code, wrapped suites',
    revision: inventory.revision,
    command,
    // A reason no item cites is refused by the contract, so the table is empty when no design pack is listed.
    naReasons: designPacks > 0 ? reasons.table() : {},
    items,
    unresolved: inventory.unresolved.sort((a, b) => a.id.localeCompare(b.id)),
    details: {
      extraction: 'regex over exports; JSON manifests parsed; nothing inferred from directory names',
      sourceHashes: inventory.sources
    }
  }
}
