// Assembles the related layer's specs into manifests, registry and denominator (same scheme as the cms layer).
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMON_TAGS } from '../../cms/lib/inventory.mjs'
import { CHAIN_ITEMS, chainSpecs } from './chain.mjs'
import { SUITES, suiteSpecs } from './suites.mjs'
import { readBytesSync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const LAYER = 'related'
const SPEC_FILES = ['chain', 'suites']

export const specSourceHash = () => {
  const h = createHash('sha256')
  for (const f of SPEC_FILES) h.update(readBytesSync(path.join(HERE, `${f}.mjs`)))
  return h.digest('hex')
}

export const collectSpecs = () => [...suiteSpecs(), ...chainSpecs()]

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

export function buildManifests(repoRoot) {
  const manifests = []
  for (const spec of collectSpecs()) {
    for (const v of spec.variants) {
      const tags = [...new Set(v.tags)]
      const id =
        spec.assertion === 'sibling.suite-runs-with-provenance'
          ? `QA-RELATED-suite-${v.key}-${tags[0]}`
          : `QA-RELATED-${spec.assertion.replaceAll('.', '-')}-${tags[0]}-${v.key}`
      const suite = spec.area === 'suites'
      manifests.push({
        id,
        itemIds: [v.itemId],
        requirement: spec.requirement,
        oracle: {
          source: spec.oracle.source,
          ref: oracleRef(repoRoot, spec.oracle),
          invariant: spec.oracle.invariant
        },
        edgeTags: tags,
        dimensions: { ...v.params, variant: v.key, assertion: spec.assertion },
        area: spec.area,
        targets: ['local'],
        effects: {
          reads: spec.reads ?? [],
          writes: ['run scratch directory under --out'],
          mail: false,
          model: false,
          containers: false
        },
        prerequisites: [...(spec.prerequisites ?? []), ...(v.prerequisites ?? [])],
        assertionIds: [spec.assertion],
        fixtures: v.mutation ? [`mutation:${v.mutation}`] : [],
        redProof: null,
        legacyIds: suite ? [] : []
      })
    }
  }
  return manifests
}

export function buildRegistry() {
  const registry = {}
  const sourceHash = specSourceHash()
  for (const spec of collectSpecs()) {
    if (registry[spec.assertion]) throw new Error(`two specs share the assertion id ${spec.assertion}`)
    registry[spec.assertion] = {
      execute: spec.pending
        ? async () => ({ verdict: 'PENDING', reason: spec.pending, evidence: [] })
        : spec.execute,
      mutations: spec.mutations ?? {},
      sourceHash
    }
  }
  return registry
}

export function buildDenominator(command) {
  const items = SUITES.map((s) => ({
    id: `suite:${s.repo}/${s.dir}${s.only ? `/${s.only}` : ''}`,
    kind: 'sibling-suite',
    requiredTags: [...COMMON_TAGS],
    // no N-A: ownership of a suite by another repo is not a source proving a tag does not apply; the tags stay
    // open until a recorded inventory of that suite at its commit covers them or proves them N-A.
    na: {}
  }))
  items.push(...CHAIN_ITEMS.map((i) => ({ ...i, na: {} })))
  items.sort((a, b) => a.id.localeCompare(b.id))
  return {
    schema: 'tracy-qa-denominator/v1',
    source: 'the suite paths named by the W8 brief, plus the producer-to-consumer chains this layer builds',
    revision: `specs:${specSourceHash().slice(0, 16)}`,
    command,
    naReasons: {},
    details: {
      extraction:
        'static list from the brief; nothing is discovered in the sibling clones at generation time, so the file is identical on a machine without them'
    },
    items,
    unresolved: [
      {
        id: 'clones:contents',
        reason:
          'the test files of each suite, and the commit they run on, are read from the clones at run time and recorded per run; the clones may be older than the commits TCH pins'
      },
      {
        id: 'suites:other-tests',
        reason:
          'tracy-infra holds further tests (.test.ts/.tsx, other .test.mjs) outside the directories the brief names; they are not wrapped'
      },
      {
        id: 'chain:joomla-producer-artifact',
        reason: 'the Joomla chain has no callable producer; see its PENDING case'
      }
    ].sort((a, b) => a.id.localeCompare(b.id))
  }
}
