// The one contract every layer's `denominator.json` follows. Used by the inventory build (which merges
// the denominators), by `pnpm qa coverage` (which counts obligations) and by every layer generator
// (which refuses to write a file that does not satisfy it).
//
// Structure is contracts/denominator.schema.json. This module adds what a schema cannot say:
//   - which item kinds a layer may list, which edge-tag groups apply to each kind, and which `meta`
//     keys a kind and which `details` keys a layer may carry (LAYER_CONTRACT, a closed table);
//   - the N-A grammar: `<reason>; source: <reference>` (parseNa), the only accepted form, stored once
//     per distinct reason in `naReasons` and cited by key from the items;
//   - ids are unique, a tag is never both required and N-A, `layer` equals the directory.
// Nothing is repaired or dropped: a problem rejects the whole file.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoundedReadError, readBoundedSync } from './bounded-reader.mjs'
import { validate } from './schema.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DENOMINATOR_SCHEMA_ID = 'tracy-qa-denominator/v1'
export const DENOMINATOR_SCHEMA_FILE = path.resolve(HERE, '../contracts/denominator.schema.json')
export const EDGE_TAGS_FILE = path.resolve(HERE, '../inventory/edge-tags.json')
export const MAX_CONTRACT_BYTES = 1024 * 1024

export class DenominatorError extends Error {}

/** A small regular JSON file, never through a symlink, FIFO, directory or device, and never past the size limit. */
export function readContract(file) {
  let bytes
  try {
    bytes = readBoundedSync(file, { maxBytes: MAX_CONTRACT_BYTES })
  } catch (error) {
    if (error instanceof BoundedReadError) throw new DenominatorError(error.message)
    throw error
  }
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new DenominatorError(`${file}: invalid JSON: ${error.message}`)
  }
}

let schemaMemo = null
export function denominatorSchema() {
  schemaMemo ??= readContract(DENOMINATOR_SCHEMA_FILE)
  return schemaMemo
}

/** `{ common, groups: { name: tags }, universe }` from an edge-tags document (inventory/edge-tags.json). */
export function edgeTagsOf(json) {
  const isTags = (v) => Array.isArray(v) && v.length > 0 && v.every((t) => typeof t === 'string' && t)
  if (
    !json ||
    typeof json !== 'object' ||
    !isTags(json.common) ||
    !json.kinds ||
    typeof json.kinds !== 'object'
  )
    throw new DenominatorError('edge tags: expected { common: [tag], kinds: { group: [tag] } }')
  for (const [group, tags] of Object.entries(json.kinds))
    if (!isTags(tags)) throw new DenominatorError(`edge tags: group "${group}" is not a non-empty tag list`)
  const groups = Object.fromEntries(Object.entries(json.kinds).map(([g, tags]) => [g, [...tags]]))
  return {
    common: [...json.common],
    groups,
    universe: new Set([...json.common, ...Object.values(groups).flat()])
  }
}

let edgeMemo = null
export function loadEdgeTags() {
  edgeMemo ??= edgeTagsOf(readContract(EDGE_TAGS_FILE))
  return edgeMemo
}

/* ------------------------------ N-A grammar ------------------------------ */

// `<reason>; source: <reference>` (the `source:` prefix is optional). The reason is prose of at least
// two words and is not itself a reference. The reference is one of: a relative file path with an
// extension (`docs/x.md`, optionally `#anchor`), `ADR <number>` with an optional `§<section>`, an
// issue or PR number `#<number>`, or an http(s) URL with a host.
const REFERENCE_FORMS = [
  /^(?!\/)(?!.*\.\.)[\w.@-]+(\/[\w.@-]+)*\.[A-Za-z0-9]+(#[\w.:-]+)?$/,
  /^ADR[\s-]*\d+(\s*§\s*\d+(\.\d+)*)?$/i,
  /^#\d+$/,
  /^https?:\/\/[\w-]+(\.[\w-]+)*(:\d+)?(\/\S*)?$/i
]
export const isReference = (text) =>
  typeof text === 'string' && REFERENCE_FORMS.some((form) => form.test(text))

export function parseNa(text) {
  if (typeof text !== 'string') return null
  const cut = text.lastIndexOf(';')
  if (cut < 0) return null
  const reason = text.slice(0, cut).trim()
  const reference = text
    .slice(cut + 1)
    .trim()
    .replace(/^source\s*:\s*/i, '')
  const words = reason.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w))
  if (words.length < 2 || isReference(reason) || !isReference(reference)) return null
  return { reason, reference }
}

/** The text an item's N-A key stands for: the table entry with `{id}` replaced by the item's id. */
export const naResolve = (template, itemId) => template.split('{id}').join(itemId)

/**
 * Collects N-A reasons for a generator: every distinct reason is stored once (the item's id inside the
 * reason replaced by `{id}`), items keep the key. `table()` is the document's `naReasons`.
 */
export class NaTable {
  #keys = new Map()
  /** Key of `<reason>; source: <reference>` for this item; throws when the parts cannot make an N-A entry. */
  add(reason, reference, itemId) {
    const text = naText(reason, reference)
    const template = itemId ? text.split(itemId).join('{id}') : text
    // The template must give the very text back; a reason that already says `{id}` for something else would not.
    if (naResolve(template, itemId ?? '{id}') !== text)
      throw new DenominatorError(
        `N-A reason cannot be stored as a template for ${itemId}: ${text.slice(0, 160)}`
      )
    if (!this.#keys.has(template)) this.#keys.set(template, `r${this.#keys.size}`)
    return this.#keys.get(template)
  }
  table() {
    return Object.fromEntries([...this.#keys].map(([template, key]) => [key, template]))
  }
}

/**
 * The file a sentence cites: the last `dir/file.ext` in it (as in `… no cookie (apps/x/src/auth.js header)`).
 * For generators whose N-A reasons name their source inside the sentence; null when it names none.
 */
export function citedFile(text) {
  const hits = String(text).match(/(?<![\w./@-])(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]+(?![\w/])/g) ?? []
  const files = hits.map((h) => h.replace(/\.$/, '')).filter((h) => isReference(h))
  return files.at(-1) ?? null
}

/** Write an N-A entry in the accepted form; throws when the parts cannot make one (a generator bug). */
export function naText(reason, reference) {
  const text = `${String(reason).trim().replace(/;\s*$/, '')}; source: ${String(reference).trim()}`
  const parsed = parseNa(text)
  if (!parsed || parsed.reference !== String(reference).trim())
    throw new DenominatorError(`not an N-A entry (reason of two words + a reference): ${text.slice(0, 160)}`)
  return text
}

/* ------------------------------ per-layer contract ------------------------------ */

const kind = (groups, meta = []) =>
  Object.freeze({ groups: Object.freeze(groups), meta: Object.freeze(meta) })
const freezeLayer = (row) =>
  Object.freeze({
    details: Object.freeze(row.details ?? []),
    extraTags: Object.freeze(row.extraTags ?? []),
    kinds: Object.freeze(row.kinds)
  })

/**
 * layer -> { kinds: { kind: { groups, meta } }, details, extraTags }.
 * `groups` are the edge-tag groups (on top of the common tags) a kind may require or mark N-A.
 * `meta` are the only keys an item of that kind may carry under `meta`; `details` the only keys the
 * layer may write under `details`. `extraTags` are tags a layer adds to the master list, each with the
 * reason it exists. A new kind, key or tag is added HERE, in review, never by loosening the check.
 */
export const LAYER_CONTRACT = Object.freeze({
  static: freezeLayer({
    details: ['coverage'],
    kinds: { gate: kind(['infra-script']), 'rule-without-gate': kind([]) }
  }),
  unit: freezeLayer({
    details: ['coverage', 'counts'],
    kinds: {
      'test-area': kind(['unit-component']),
      'test-group': kind(['unit-component']),
      regression: kind([]),
      'regression-no-run': kind([], ['ownerLayer', 'ownerSource', 'flakyModel'])
    }
  }),
  api: freezeLayer({
    details: ['complete', 'counts', 'provenance', 'requiredTagGroups'],
    kinds: { 'api-door': kind(['api-host'], ['membership']) }
  }),
  infra: freezeLayer({
    details: ['extraction', 'tagPolicy', 'sources'],
    kinds: {
      'compose-service': kind(['infra-script'], ['profiles']),
      'cron-callback': kind(['infra-script'], ['timer']),
      'cron-start': kind(['infra-script']),
      'cron-timer': kind(['infra-script'], ['timer']),
      dockerfile: kind(['infra-script'], ['referencedBy']),
      'dockerfile-input': kind(['infra-script'], ['dockerfile']),
      'dockerfile-stage': kind(['infra-script'], ['dockerfile']),
      'dockerfile-stage-copy': kind(['infra-script'], ['dockerfile']),
      'host-job-kind': kind(['infra-script', 'api-host']),
      'host-route': kind(['infra-script', 'api-host']),
      'legacy-suite': kind([], ['label']),
      // One per file migrate() applies at boot (apps/tracy-web/src/db/index.js).
      migration: kind(['infra-script'], ['number']),
      'npm-script': kind(['infra-script']),
      'script-deploy': kind(['infra-script']),
      'script-helper': kind(['infra-script']),
      'script-host-entry': kind(['infra-script'])
    }
  }),
  ui: freezeLayer({
    details: [
      'cases',
      'complete',
      'counts',
      'dimensions',
      'extractionKind',
      'itemDetails',
      'legacyMap',
      'matrix',
      'sourceCount'
    ],
    kinds: {
      'ui-story-proposal': kind(['ui-ux']),
      'ui-story-screen': kind(['ui-ux']),
      'ui-story-block': kind(['ui-ux']),
      'ui-client-entry': kind(['ui-ux']),
      'ui-slot': kind(['ui-ux']),
      'ui-tab': kind(['ui-ux']),
      'ui-switch': kind(['ui-ux']),
      'ui-language': kind(['ui-ux'])
    }
  }),
  flows: freezeLayer({
    details: ['complete', 'extractionKind', 'incompleteBecause', 'sourceHashes'],
    kinds: {
      journey: kind(['flow'], ['notCovered', 'perCms', 'title']),
      flow: kind(['flow'], ['title']),
      capability: kind(['flow'], ['flows', 'title']),
      door: kind(['flow'], ['calledBy', 'method', 'path'])
    }
  }),
  harness: freezeLayer({
    details: ['sources', 'excluded', 'incomplete'],
    // `audit-seam` splits the master list's `audit-effect` in two: the seam is the record the harness
    // writes itself, the effect is the end-to-end result on the site (layers/harness/rules.mjs).
    extraTags: ['audit-seam'],
    kinds: {
      approval: kind(['harness-tool']),
      dispatcher: kind(['harness-tool']),
      'dsh-tool': kind(['harness-tool'], ['required', 'escalation', 'schemaSha256']),
      'dsh-tool-row': kind(['harness-tool'], ['row', 'disabledInNative', 'offered']),
      'fs-fence': kind(['harness-tool'], ['tool', 'arg', 'content', 'required', 'escalation']),
      'mode-matrix': kind(['harness-tool'], ['group', 'tools']),
      'native-row': kind(['harness-tool'], ['row']),
      'tool-surface': kind(
        ['harness-tool'],
        ['tool', 'surface', 'platform', 'applies', 'plugin', 'hasSurfaceTable']
      ),
      'workdir-guard': kind(['harness-tool'], ['tool', 'arg']),
      'write-path': kind(['harness-tool'], ['path', 'cms'])
    }
  }),
  cms: freezeLayer({
    details: ['extraction', 'sourceHashes'],
    kinds: {
      'cms-template': kind(['cms-release'], ['revision']),
      'cms-release': kind(['cms-release'], ['cms', 'platform', 'shape', 'template', 'version']),
      function: kind(['cms-release']),
      'live-catalogue': kind([]),
      suite: kind([])
    }
  }),
  mail: freezeLayer({
    details: ['generatedFrom', 'counts'],
    kinds: Object.fromEntries(
      [
        'notification-letter',
        'direct-letter',
        'flow',
        'token',
        'preference-group',
        'transport',
        'site-mail',
        'rule'
      ].map((name) => [name, kind(['mail'], ['planned'])])
    )
  }),
  related: freezeLayer({
    details: ['extraction'],
    kinds: { 'handoff-contract': kind(['cms-release']), 'sibling-suite': kind([]) }
  })
})

/**
 * Item kind -> the layer expected to own it and which §3 tag groups apply (on top of the common tags).
 * `asset` kinds are existing tests/findings, not product items: they get an owner in legacy-map.json
 * instead of required tags.
 */
export const INVENTORY_KINDS = Object.freeze({
  gate: { layer: 'static', groups: ['infra-script'] },
  'api-door': { layer: 'api', groups: ['api-host'] },
  'host-route': { layer: 'infra', groups: ['api-host'] },
  package: { layer: 'static', groups: ['unit-component'] },
  'dsh-plugin': { layer: 'harness', groups: ['unit-component'] },
  'ui-switch': { layer: 'ui', groups: ['ui-ux'] },
  language: { layer: 'ui', groups: ['unit-component'] },
  'web-string': { layer: 'ui', groups: [] },
  'plugin-strings': { layer: 'ui', groups: [] },
  'story-file': { layer: 'ui', groups: ['ui-ux'] },
  'story-export': { layer: 'ui', groups: ['ui-ux'] },
  'agent-tool': { layer: 'harness', groups: ['harness-tool'] },
  'agent-surface': { layer: 'harness', groups: ['harness-tool'] },
  'mode-preset': { layer: 'harness', groups: ['harness-tool'] },
  'mode-tool-row': { layer: 'harness', groups: ['harness-tool'] },
  'mode-skill': { layer: 'harness', groups: ['harness-tool'] },
  'fence-fs-tool': { layer: 'harness', groups: ['harness-tool'] },
  'fence-workdir': { layer: 'harness', groups: ['harness-tool'] },
  'compose-service': { layer: 'infra', groups: ['infra-script'] },
  'npm-script': { layer: 'infra', groups: ['infra-script'] },
  'script-file': { layer: 'infra', groups: ['infra-script'] },
  'fleet-script': { layer: 'infra', groups: ['infra-script'] },
  'mail-kind': { layer: 'mail', groups: ['mail'] },
  'mail-renderer': { layer: 'mail', groups: ['mail'] },
  'mail-html': { layer: 'mail', groups: ['mail'] },
  // Applied by tracy-web at boot (db/index.js migrate): cold/warm start, idempotence and version mismatch are its edges.
  migration: { layer: 'infra', groups: ['infra-script'] },
  journey: { layer: 'flows', groups: ['flow'] }
})

export const DENOMINATOR_LAYERS = Object.freeze(Object.keys(LAYER_CONTRACT))

/** Every tag an item of `kind` in `layer` may name, or null when the kind is not the layer's. */
export function allowedTags(layer, kindName, edge = loadEdgeTags(), foreignKinds = {}) {
  const row = LAYER_CONTRACT[layer]?.kinds[kindName] ?? foreignKinds[kindName]
  if (!row) return null
  const tags = new Set([...edge.common, ...LAYER_CONTRACT[layer].extraTags])
  for (const group of row.groups) {
    if (!edge.groups[group])
      throw new DenominatorError(`edge tags lack the group "${group}" of kind "${kindName}"`)
    for (const tag of edge.groups[group]) tags.add(tag)
  }
  return tags
}

/* ------------------------------ validation ------------------------------ */

const MAX_PROBLEMS = 200
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The rules that hold whatever the layer: structure, the directory name, unique ids, the N-A grammar,
 * no tag both required and N-A. Returns the list of problems (empty: none).
 */
export function coreProblems(doc, layer) {
  const problems = validate(denominatorSchema(), doc).map((e) => e.replace(/^#/, 'denominator'))
  if (problems.length > 0) return problems.slice(0, MAX_PROBLEMS)
  if (doc.layer !== layer) problems.push(`layer "${doc.layer}" does not match its directory "${layer}"`)
  const ids = new Set()
  const cited = new Set()
  for (const item of doc.items) {
    if (ids.has(item.id)) problems.push(`duplicate item id ${item.id}`)
    ids.add(item.id)
    const both = item.requiredTags.filter((t) => Object.hasOwn(item.na, t))
    if (both.length) problems.push(`${item.id}: tag both required and N-A: ${both.join(', ')}`)
    for (const [tag, key] of Object.entries(item.na)) {
      if (!Object.hasOwn(doc.naReasons, key)) {
        problems.push(`${item.id}: N-A for ${tag} names reason "${key}" that naReasons does not list`)
        continue
      }
      cited.add(key)
      if (parseNa(naResolve(doc.naReasons[key], item.id)) === null)
        problems.push(
          `${item.id}: N-A for ${tag} is not "<reason>; source: <reference>" (a file, ADR, #issue or URL)`
        )
    }
  }
  // A reason nothing cites is dead text that reads like a decision: it is refused, not carried.
  for (const key of Object.keys(doc.naReasons))
    if (!cited.has(key)) problems.push(`naReasons.${key} is cited by no item`)
  const manual = new Set()
  for (const { id } of doc.manual ?? []) {
    if (manual.has(id)) problems.push(`duplicate manual id ${id}`)
    manual.add(id)
  }
  return problems.slice(0, MAX_PROBLEMS)
}

/**
 * Validate one layer's denominator in full: coreProblems plus the layer's own table (kinds, tags per
 * kind, meta and details keys). Returns `{ problems, doc }`; `doc` (items normalised: tags sorted, each
 * N-A key replaced by the text it stands for) is present only when there is no problem.
 * `foreignKinds` (kind -> { groups }) are item kinds another layer is expected to own: a layer may claim
 * such an item too (the inventory build passes its kind table); the claim carries no `meta`.
 */
export function validateDenominator(doc, layer, edge = loadEdgeTags(), { foreignKinds = {} } = {}) {
  const contract = LAYER_CONTRACT[layer]
  if (!contract) return { problems: [`unknown layer "${layer}"`] }
  const problems = coreProblems(doc, layer)
  if (problems.length > 0) return { problems }
  for (const key of Object.keys(doc.details ?? {}))
    if (!contract.details.includes(key)) problems.push(`details.${key} is not a field of layer ${layer}`)
  const items = []
  for (const item of doc.items) {
    const at = (m) => problems.push(`${item.id}: ${m}`)
    const row =
      contract.kinds[item.kind] ??
      (Object.hasOwn(foreignKinds, item.kind) ? { groups: foreignKinds[item.kind].groups, meta: [] } : null)
    if (!row) {
      at(`unknown kind "${item.kind}" for layer ${layer}`)
      continue
    }
    for (const key of Object.keys(item.meta ?? {}))
      if (!row.meta.includes(key)) at(`meta.${key} is not a field of kind "${item.kind}"`)
    const allowed = allowedTags(layer, item.kind, edge, foreignKinds)
    const named = [...item.requiredTags, ...Object.keys(item.na)]
    const unknown = named.filter((t) => !edge.universe.has(t) && !contract.extraTags.includes(t))
    if (unknown.length) at(`unknown tag(s) ${unknown.join(', ')}`)
    const foreign = named.filter((t) => !unknown.includes(t) && !allowed.has(t))
    if (foreign.length) at(`tag(s) ${foreign.join(', ')} do not apply to kind "${item.kind}"`)
    items.push({
      ...item,
      requiredTags: [...item.requiredTags].sort(),
      na: Object.fromEntries(
        Object.entries(item.na)
          .sort(([x], [y]) => cmp(x, y))
          .map(([tag, key]) => [tag, naResolve(doc.naReasons[key], item.id)])
      )
    })
  }
  if (problems.length > 0) return { problems: problems.slice(0, MAX_PROBLEMS) }
  return { problems, doc: { ...doc, items } }
}

/**
 * For every reader of a committed denominator (inventory build, `pnpm qa coverage`, a layer's own
 * loader): the full contract, with the inventory's kinds admitted as cross-layer claims. One function,
 * so a file one reader rejects is never accepted by another.
 */
export const validateCommitted = (doc, layer, edge = loadEdgeTags()) =>
  validateDenominator(doc, layer, edge, { foreignKinds: INVENTORY_KINDS })

/** `doc` itself when the full contract holds; throws DenominatorError naming the first problem otherwise. */
export function assertCommitted(doc, layer, where = 'denominator.json') {
  const { problems } = validateCommitted(doc, layer)
  if (problems.length > 0) throw new DenominatorError(`${where} breaks the shared contract: ${problems[0]}`)
  return doc
}

/** For generators: throw instead of writing a denominator the contract rejects. */
export function assertDenominator(doc, layer, edge = loadEdgeTags()) {
  const { problems } = validateDenominator(doc, layer, edge)
  if (problems.length > 0)
    throw new DenominatorError(
      `denominator of layer ${layer} breaks the shared contract (${problems.length} problem(s)):\n  ${problems.slice(0, 20).join('\n  ')}`
    )
  return doc
}

/**
 * The commit a revision names: a full SHA or a hex token of 7+ characters (as in `origin/develop
 * fa4dc66a5`). A content hash (`sha256:…`, `tree:…`, 64 hex characters) or null names none: such a
 * denominator is valid, but nothing can prove it fresh, so coverage keeps the layer open.
 */
export function revisionCommitTokens(revision) {
  if (typeof revision !== 'string') return []
  if (/^[a-z0-9-]+:/i.test(revision.trim())) return []
  return (revision.match(/\b[0-9a-f]{7,40}\b/g) ?? []).filter((t) => t.length <= 40)
}
