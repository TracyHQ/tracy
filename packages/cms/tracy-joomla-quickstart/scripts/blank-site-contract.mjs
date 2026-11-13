/**
 * The contract the Claude Cowork plugin is bound to on the blank site of an AI quickstart (ticket #584).
 *
 * WHY a contract of its own: the released contract of the template (`contracts/<slug>/j6/<version>/`) names every demo
 * record, and the blank site step deletes the pages, articles, categories, tags, contacts and accounts among them. The
 * plugin's bind finds every entity of the contract by its identity and refuses a site where one is missing
 * ("Missing or ambiguous entity"). A contract the plugin derives from the blank rows instead has no slot for an
 * emptied place. So the blank site is bound to the released contract restricted to the records the blank site keeps,
 * and each slot the blank site empties says so: its sample is what the blank site holds there and it carries the
 * plugin's own `opensEmpty`, so a build may fill it (`blank-site-contract-samples.mjs`). Every other slot of a kept
 * record stays exactly as released.
 *
 * A released contract is sealed and never edited; this is a new artifact beside the AI quickstart's declarations
 * (`ai-quickstarts/<slug>/j6/<version>/blank-site-contract/`), with an id of its own (`<slug>-blank/<cms>/<version>`).
 *
 * Which records the blank site removes is read from the demo data before and after the blank site step: a record of a
 * table whose row the step removed, and a record whose identity names a removed record (a profile line of a deleted
 * account). The same rule gives the module assignments the step removed. Pure: same input, same bytes out.
 */

import { blankSlot, emptiedSamples } from './blank-site-contract-samples.mjs'
import { parseDump, records, sqlQuote } from './joomla-sql-dump.mjs'

/** The folder of the blank site contract inside an AI quickstart folder. */
export const BLANK_CONTRACT_DIR = 'blank-site-contract'
export const BLANK_CONTRACT_FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']

/** The table of each content map entity kind stored as a row; the other kinds live in files the blank site keeps. */
export const ENTITY_TABLES = {
  module: 'modules',
  category: 'categories',
  article: 'content',
  menuItem: 'menu',
  templateStyle: 'template_styles',
  contact: 'contact_details',
  tag: 'tags',
  field: 'fields',
  user: 'users',
  userProfile: 'user_profiles'
}

/** The asset table name the plugin keys an entity's access rules by (`ContractAccess`: `<table>.<id>`). */
const RULE_TABLES = { module: 'modules', article: 'content', category: 'categories' }

/** `ja-boxing/j6/1.0.11` -> `ja-boxing-blank/j6/1.0.11`. */
export function blankSiteContractId(releasedId) {
  const [slug, cms, version] = String(releasedId).split('/')
  const id = `${slug}-blank/${cms}/${version}`
  // The plugin's own rule for a profile id (EngineFactory, ContractFetch::ID).
  if (!/^[a-z][a-z0-9-]{1,40}\/[a-z][a-z0-9]{0,9}\/[0-9]+\.[0-9]+\.[0-9]+$/.test(id))
    throw new Error(`${releasedId} gives no valid blank site contract id`)
  return id
}

/**
 * The demo rows of a released contract as demo data: one INSERT per stored entity (its lock row with its id) and the
 * module assignments of the lock. Lets the blank site step run on what the contract holds, without the installer.
 */
export function lockDump({ contentMap, lock }) {
  const lines = []
  for (const e of contentMap.entities) {
    const table = ENTITY_TABLES[e.kind]
    const row = lock.entities[e.key]
    if (!table || !row) continue
    const full = { id: String(e.sourceId), ...row }
    const cols = Object.keys(full)
    const values = cols.map((c) => (full[c] === null ? 'NULL' : sqlQuote(String(full[c]))))
    lines.push(
      `INSERT INTO \`#__${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${values.join(',')});`
    )
  }
  if (lock.assignments.length)
    lines.push(
      `INSERT INTO \`#__modules_menu\` (\`moduleid\`, \`menuid\`) VALUES ${lock.assignments
        .map((a) => `(${sqlQuote(String(a.moduleid))},${sqlQuote(String(a.menuid))})`)
        .join(',')};`
    )
  return `${lines.join('\n')}\n`
}

const rowKey = (table, id) => `${table}:${id}`
const rowsOf = (dump) => {
  const out = new Set()
  for (const table of Object.values(ENTITY_TABLES))
    for (const r of records(dump, table)) out.add(rowKey(table, r.id))
  return out
}
const pairsOf = (dump) => new Set(records(dump, 'modules_menu').map((r) => `${r.moduleid}:${r.menuid}`))

/**
 * The content map entities the blank site removes, sorted: `before` and `after` are the demo data (text or parsed)
 * before and after the blank site step.
 */
export function removedEntities({ contentMap, before, after }) {
  const beforeDump = typeof before === 'string' ? parseDump(before) : before
  const afterDump = typeof after === 'string' ? parseDump(after) : after
  const was = rowsOf(beforeDump)
  const is = rowsOf(afterDump)
  // A table the step empties takes every record of its kind, also one whose id is not a row id (a profile line).
  const emptied = new Set(
    Object.values(ENTITY_TABLES).filter((t) => records(beforeDump, t).length && !records(afterDump, t).length)
  )
  const removed = new Set()
  for (const e of contentMap.entities) {
    const table = ENTITY_TABLES[e.kind]
    const key = rowKey(table, String(e.sourceId))
    if (table && (emptied.has(table) || (was.has(key) && !is.has(key)))) removed.add(e.key)
  }
  // A record found through another record (a profile line through its account) goes with it.
  for (let grew = true; grew; ) {
    grew = false
    for (const e of contentMap.entities)
      if (!removed.has(e.key) && Object.values(e.identityReferences ?? {}).some((ref) => removed.has(ref))) {
        removed.add(e.key)
        grew = true
      }
  }
  return [...removed].sort()
}

/** The five fields that find a module, as the capture tool writes them (`capture-contract.py`, `identity_fields`). */
const MODULE_KEY = ['title', 'module', 'position', 'language', 'client_id']
const moduleKey = (r) => JSON.stringify(MODULE_KEY.map((k) => r[k] ?? ''))

/**
 * A kept entity as the plugin finds it on the blank site. The blank site step empties declared content, and a module's
 * title is both a content field and part of its identity, so each identity field is read from the blank site's row.
 * Modules that then agree on all five fields carry their id too, the rule the capture tool applies to a release
 * (`capture-contract.py`: two modules with one identity make the plugin refuse the whole contract).
 */
function blankIdentity(entity, afterDump) {
  const table = ENTITY_TABLES[entity.kind]
  const row = table && records(afterDump, table).find((r) => r.id === String(entity.sourceId))
  if (!row) return entity
  const identity = {}
  for (const [k, v] of Object.entries(entity.identity)) identity[k] = k === 'id' ? v : (row[k] ?? v)
  if (entity.kind === 'module' && !('id' in identity)) {
    const twins = records(afterDump, 'modules').filter((r) => moduleKey(r) === moduleKey(row)).length
    if (twins > 1) identity.id = row.id
  }
  return JSON.stringify(identity) === JSON.stringify(entity.identity) ? entity : { ...entity, identity }
}

/** Whether `value` names one of `keys` anywhere: a key, an entity value, a key prefix (`article-14.video`). */
function names(value, keys) {
  if (typeof value === 'string') return keys.has(value) || keys.has(value.split('.')[0])
  if (Array.isArray(value)) return value.some((v) => names(v, keys))
  if (value && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => names(k, keys) || names(v, keys))
  return false
}

/** An object map without the entries that name a removed record, in its own key order. */
const withoutRemoved = (map, gone) =>
  Object.fromEntries(Object.entries(map ?? {}).filter(([k, v]) => !names(k, gone) && !names(v, gone)))

/**
 * The blank site contract: `{id, removed, files: {name: text}}`. `before`/`after` as for `removedEntities`;
 * `released` names the sha256 of each released contract file it is made from; `addedFiles` maps each file the blank
 * site adds to the installer (`produceBlankSite(...).files`) to its sha256; `mapping` is the AI quickstart's mapping
 * file, whose places the blank site empties (`emptyHtml` as for `emptiedSamples`).
 */
export function blankSiteContract({
  manifest,
  contentMap,
  lock,
  mapping,
  before,
  after,
  released,
  addedFiles = {},
  emptyHtml
}) {
  const beforeDump = typeof before === 'string' ? parseDump(before) : before
  const afterDump = typeof after === 'string' ? parseDump(after) : after
  const removed = removedEntities({ contentMap, before: beforeDump, after: afterDump })
  const gone = new Set(removed)
  const kept = contentMap.entities.filter((e) => !gone.has(e.key)).map((e) => blankIdentity(e, afterDump))
  const id = blankSiteContractId(manifest.id)
  const beforePairs = pairsOf(beforeDump)
  const afterPairs = pairsOf(afterDump)

  const keptSlots = contentMap.slots.filter((s) => !gone.has(s.entity))
  const emptied = emptiedSamples({ mapping, slots: keptSlots, ...(emptyHtml ? { emptyHtml } : {}) })
  const map = {}
  for (const [k, v] of Object.entries(contentMap)) {
    if (k === 'entities') map[k] = kept
    else if (k === 'slots') map[k] = keptSlots.map((s) => blankSlot(s, emptied))
    else if (k === 'pages') map[k] = v.filter((p) => !names(p, gone))
    else if (v && typeof v === 'object' && !Array.isArray(v)) map[k] = withoutRemoved(v, gone)
    else map[k] = v
  }

  const removedCounts = {}
  for (const e of contentMap.entities)
    if (gone.has(e.key)) removedCounts[e.kind] = (removedCounts[e.kind] ?? 0) + 1
  // The plugin counts the rows of a kind only through the entities of that kind it resolves, and reads a count of 0
  // as "no such kind": a kind the blank site keeps no entity of is 0, whatever furniture rows remain (a menu root).
  const keptKinds = new Set(kept.map((e) => e.kind))
  const ruleGone = new Set(
    contentMap.entities
      .filter((e) => gone.has(e.key) && RULE_TABLES[e.kind])
      .map((e) => `${RULE_TABLES[e.kind]}.${e.sourceId}`)
  )
  const lockOut = {}
  for (const [k, v] of Object.entries(lock)) {
    if (k === 'entities') lockOut[k] = Object.fromEntries(Object.entries(v).filter(([key]) => !gone.has(key)))
    else if (k === 'assignments')
      lockOut[k] = v.filter((a) => {
        const pair = `${a.moduleid}:${a.menuid}`
        return !(beforePairs.has(pair) && !afterPairs.has(pair))
      })
    else if (k === 'inventoryCounts')
      lockOut[k] = Object.fromEntries(
        Object.entries(v).map(([kind, n]) => [kind, keptKinds.has(kind) ? n - (removedCounts[kind] ?? 0) : 0])
      )
    else if (k === 'files') {
      // A file the blank site adds under a locked folder (T4's local global settings) is part of its design.
      const roots = lock.fileRoots ?? []
      const added = Object.entries(addedFiles)
        .filter(([name]) => roots.some((r) => name.startsWith(`${r}/`)))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      lockOut[k] = { ...v, ...Object.fromEntries(added) }
    } else if (k === 'access')
      lockOut[k] = {
        ...v,
        ...(v.entityRules
          ? {
              entityRules: Object.fromEntries(
                Object.entries(v.entityRules).filter(([key]) => !ruleGone.has(key))
              )
            }
          : {})
      }
    else lockOut[k] = v
  }

  const manifestOut = {
    ...manifest,
    id,
    blankSiteOf: {
      contract: manifest.id,
      files: released,
      removed: removed.length,
      opened: emptied.size,
      why: 'The released contract restricted to the records the blank site keeps; each slot the blank site empties has the blank value as its sample and may be filled (opensEmpty).'
    }
  }
  const text = (v) => `${JSON.stringify(v, null, 2)}\n`
  return {
    id,
    removed,
    opened: emptied.size,
    files: {
      'manifest.json': text(manifestOut),
      'content-map.json': text(map),
      'presentation-lock.json': text(lockOut)
    }
  }
}
