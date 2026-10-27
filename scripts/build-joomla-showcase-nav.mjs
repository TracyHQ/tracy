#!/usr/bin/env node
/**
 * Generate `showcase-nav-map.json` — the template showcase entries (typography, "Joomla Pages", Home
 * colour/layout variants, sample sites…) a customer site built from a sealed Joomla quickstart takes OUT
 * OF ITS MENUS, read later by the Claude Cowork plugin. Nothing is unpublished: every showcase page keeps
 * its URL, an item only gets `menu_show` "0" (a key that was absent is recorded as `from: null`, so a
 * revert deletes it instead of writing "1").
 *
 * 🔒 A SECOND PROFILE, NOT A NEW DEMO-TRIM. `demo-trim-map.json` unpublishes demo content and the plugin
 * pins its hash on every bound site; this map has its own schema and hash so neither changes the other.
 * The three contract files are not touched; the map is pinned to their bytes by `baseHash`.
 *
 * THE RULE lives in `scripts/lib/showcase-nav/rules.mjs`; what the data cannot settle for one design is
 * decided in `packages/cms/tracy-joomla-quickstart/showcase-decisions.json` (keyed by contract id, every
 * entry with a reason), and what is still open is listed under `unresolved` — never guessed.
 *
 * Covered: the newest version of every contract line on disk, every profile the design registry serves
 * and every version a quickstart catalogue pins, plus `--contract <slug>/j6/<version>` (repeatable).
 *
 * Run: `node scripts/build-joomla-showcase-nav.mjs [--check] [--contract <id>]... [--report <file.md>]`
 * `TRACY_JOOMLA_CONTRACTS` / `TRACY_JOOMLA_SHOWCASE_DECISIONS` point at another tree (tests); with the
 * first set, only the contracts on that tree are in scope.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildJoomlaTree, subcategoryGlobal } from './lib/showcase-nav/joomla-tree.mjs'
import { classifyJoomla, contentGap } from './lib/showcase-nav/rules.mjs'
import {
  MEGA_COLUMN_OP,
  MEGA_SUB_OP,
  removeMegaColumn,
  removeMegaSub
} from './lib/showcase-nav/t3-megamenu.mjs'
import {
  MAP_FILE,
  PROFILE_VERSION,
  baseFilesOf,
  baseHashOf,
  contractArgs,
  contractsOnDisk,
  decisionsHashOf,
  latestOf,
  pinnedIds,
  readJson,
  reportArg,
  reportOf,
  sha256
} from './lib/showcase-nav/common.mjs'

const TOOL = 'build-joomla-showcase-nav'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OWN_TREE = !process.env.TRACY_JOOMLA_CONTRACTS
const CONTRACTS =
  process.env.TRACY_JOOMLA_CONTRACTS || path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const DECISIONS =
  process.env.TRACY_JOOMLA_SHOWCASE_DECISIONS ||
  path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/showcase-decisions.json')
const SCHEMA = 'tracy-quickstart-showcase-nav/joomla/v1'
/**
 * v2 = v1 plus `templateStyle.megaSubRemove` and `templateStyle.megaColumnRemove`, whose rows carry
 * fields (`style`, `menutype`, `item`, `column`, `before`, `after`) and repeat a key, both of which a v1
 * Claude Cowork plugin refuses. Only a map that carries one of them is v2; every other map stays v1, byte
 * for byte, for the plugin versions already out there.
 */
const SCHEMA_V2 = 'tracy-quickstart-showcase-nav/joomla/v2'
const HEX = /^[0-9a-f]{64}$/

/** Operations this map may carry, and the only values they may move between. */
const ALLOWED = {
  'menuItem.param': (o) => o.path === 'menu_show' && (o.from === '1' || o.from === null) && o.to === '0',
  'module.published': (o) => o.field === 'published' && o.from === '1' && o.to === '0',
  [MEGA_SUB_OP]: (o) =>
    o.key === `templateStyle-${o.style?.id}` &&
    typeof o.style?.template === 'string' &&
    Number.isInteger(o.item) &&
    o.path === `mm_config.${o.menutype}.item-${o.item}.sub` &&
    HEX.test(String(o.before)) &&
    HEX.test(String(o.after)) &&
    o.before !== o.after,
  [MEGA_COLUMN_OP]: (o) =>
    o.key === `templateStyle-${o.style?.id}` &&
    typeof o.style?.template === 'string' &&
    Number.isInteger(o.item) &&
    Number.isInteger(o.column) &&
    o.path === `mm_config.${o.menutype}.item-${o.item}.sub.rows[item=${o.column}]` &&
    HEX.test(String(o.before)) &&
    HEX.test(String(o.after)) &&
    o.before !== o.after
}
const MEGA_OPS = new Set([MEGA_SUB_OP, MEGA_COLUMN_OP])
/** The params column after one T3 mega operation, replayed from where the style stands. */
const replayMega = (raw, o) =>
  o.op === MEGA_SUB_OP
    ? removeMegaSub(raw, o.menutype, o.item)
    : removeMegaColumn(raw, o.menutype, o.item, o.column)

/**
 * The map of one contract. Pure over the files of its directory and its decisions entry.
 * @returns {{ map: object, problems: string[] }}
 */
export function generate(dir, id, decisions) {
  const baseFiles = baseFilesOf(dir)
  const contentMap = readJson(path.join(dir, 'content-map.json'))
  const lock = readJson(path.join(dir, 'presentation-lock.json'))
  const tree = buildJoomlaTree(contentMap, lock, {
    subcategoryGlobal: subcategoryGlobal(readJson(path.join(dir, 'manifest.json'))).value
  })
  const head = {
    schemaVersion: SCHEMA,
    profileVersion: PROFILE_VERSION,
    contract: id,
    baseHash: baseHashOf(baseFiles),
    baseFiles,
    inputs: {},
    decisionsHash: decisionsHashOf(decisions)
  }
  const gap = tree.items.size
    ? contentGap(tree)
    : 'the contract maps no site menu item, so there is no navigation to read'
  if (gap)
    return {
      map: {
        ...head,
        status: 'not-covered',
        reason: gap,
        operations: [],
        kept: [],
        unresolved: [],
        counts: { menuItems: 0, modules: 0, kept: 0, unresolved: 0 }
      },
      // Decisions are not read for a contract the rule cannot judge; they stay in the file for when it can.
      problems: []
    }
  const { operations, kept, unresolved, problems } = classifyJoomla(tree, decisions)
  const megaSubs = operations.filter((o) => o.op === MEGA_SUB_OP).length
  const megaColumns = operations.filter((o) => o.op === MEGA_COLUMN_OP).length
  const map = {
    ...head,
    ...(megaSubs || megaColumns ? { schemaVersion: SCHEMA_V2 } : {}),
    status: 'checked',
    operations,
    kept,
    unresolved,
    counts: {
      menuItems: operations.filter((o) => o.op === 'menuItem.param').length,
      modules: operations.filter((o) => o.op === 'module.published').length,
      ...(megaSubs ? { megaSubs } : {}),
      ...(megaColumns ? { megaColumns } : {}),
      kept: kept.length,
      unresolved: unresolved.length
    }
  }
  return { map, problems: [...problems, ...validate(map, tree)] }
}

/** What `--check` holds every map to, whatever produced it. */
export function validate(map, tree) {
  const problems = []
  const keptKeys = new Set(map.kept.map((k) => k.key))
  const seen = new Set()
  const megaPaths = new Set()
  // Where each style's params stand after the operations before this one: the lock's bytes first.
  const last = new Map()
  for (const o of map.operations) {
    if (!ALLOWED[o.op]?.(o))
      problems.push(`operation ${o.op} on ${o.key} is not one this map may carry (${JSON.stringify(o)})`)
    if (!o.rule || !o.reason) problems.push(`operation on ${o.key} has no rule or reason`)
    if (MEGA_OPS.has(o.op)) {
      if (map.schemaVersion !== SCHEMA_V2) problems.push(`${o.op} on ${o.key} needs ${SCHEMA_V2}`)
      if (megaPaths.has(`${o.key}#${o.path}`)) problems.push(`${o.key} ${o.path} appears in two operations`)
      megaPaths.add(`${o.key}#${o.path}`)
      const style = tree?.styles.get(o.key)
      if (tree && !style) problems.push(`${o.key} is not a template style of this contract`)
      if (!style) continue
      if (!style.t3) problems.push(`${o.key} is not a T3 style`)
      const raw = last.get(o.key) ?? style.rawParams
      if (typeof raw !== 'string' || sha256(raw) !== o.before) {
        problems.push(`${o.op} on ${o.key} does not start where its params stand`)
        continue
      }
      const next = replayMega(raw, o)
      if (!next.raw || sha256(next.raw) !== o.after)
        problems.push(`${o.op} on ${o.key} does not end at its after`)
      if (next.raw) last.set(o.key, next.raw)
      continue
    }
    if (!/^(menuItem|module)-\d+$/.test(String(o.key)))
      problems.push(`operation on ${o.key}: only menu items and modules`)
    if (seen.has(o.key)) problems.push(`${o.key} appears in two operations`)
    seen.add(o.key)
    if (keptKeys.has(o.key)) problems.push(`${o.key} is both kept and hidden`)
    const item = tree?.items.get(o.key)
    if (item?.home) problems.push(`${o.key} is a home page and may not leave the navigation`)
    if (tree && o.op === 'menuItem.param' && !item)
      problems.push(`${o.key} is not a site menu item of this contract`)
    if (tree && o.op === 'module.published' && !tree.modules.has(o.key))
      problems.push(`${o.key} is not a module of this contract`)
  }
  for (const u of map.unresolved)
    if (seen.has(u.key) || megaPaths.has(`${u.key}#${u.where}`))
      problems.push(`${u.key} is unresolved and hidden at once`)
  if (map.schemaVersion === SCHEMA_V2 && !map.operations.some((o) => MEGA_OPS.has(o.op)))
    problems.push(`a map without a T3 mega operation stays ${SCHEMA}`)
  if (map.status === 'not-covered' && !map.reason) problems.push('a not-covered map must say why')
  return problems
}

function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const extra = contractArgs(argv, TOOL)
  const reportFile = reportArg(argv, TOOL)
  const onDisk = contractsOnDisk(CONTRACTS).filter((c) => c.major === 'j6')
  const provision = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision')
  const pinned = pinnedIds({
    registries: [
      readJson(path.join(provision, 'design-templates.json')),
      readJson(path.join(ROOT, 'apps/tracy-web/src/design-templates.json'))
    ],
    catalogues: [
      readJson(path.join(provision, 'quickstarts.json')),
      readJson(path.join(ROOT, 'apps/tracy-web/src/quickstarts.json'))
    ],
    platform: 'joomla',
    major: 'j6'
  })
  const exists = (id) => existsSync(path.join(CONTRACTS, id, 'presentation-lock.json'))
  const problems = []
  for (const id of [...pinned, ...extra])
    if (!exists(id) && (OWN_TREE || extra.includes(id)))
      problems.push(`${id}: pinned or named, but no contract on disk`)
  // Maps already on disk stay in scope: a map nobody regenerates is a stale file in a plugin package.
  const withMap = onDisk.filter((c) => existsSync(path.join(CONTRACTS, c.id, MAP_FILE))).map((c) => c.id)
  const ids = [
    ...new Set([...latestOf(onDisk), ...pinned.filter(exists), ...extra.filter(exists), ...withMap])
  ].sort()

  const decisionsFile = existsSync(DECISIONS) ? readJson(DECISIONS) : { contracts: {} }
  const decided = decisionsFile.contracts ?? {}
  for (const key of Object.keys(decided))
    if (!ids.includes(key))
      problems.push(`showcase-decisions.json names ${key}, which is not a covered contract`)

  const maps = []
  for (const id of ids) {
    const dir = path.join(CONTRACTS, id)
    const { map, problems: own } = generate(dir, id, decided[id])
    for (const p of own) problems.push(`${id}: ${p}`)
    maps.push(map)
    const text = `${JSON.stringify(map, null, 2)}\n`
    const file = path.join(dir, MAP_FILE)
    if (check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
        problems.push(`${id}/${MAP_FILE} is stale or missing — run node scripts/${TOOL}.mjs`)
    } else writeFileSync(file, text)
    const c = map.counts
    console.log(
      `${id}  ${map.status} · hides ${c.menuItems} item(s), ${c.modules} module(s)${c.megaSubs ? `, ${c.megaSubs} T3 mega sub(s)` : ''}${c.megaColumns ? `, ${c.megaColumns} T3 mega column(s)` : ''} · keeps ${c.kept} · unresolved ${c.unresolved}`
    )
  }
  if (reportFile) writeFileSync(reportFile, reportOf(maps, 'Joomla showcase navigation'))
  for (const p of problems) console.error(`${TOOL}: ${p}`)
  if (problems.length) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
