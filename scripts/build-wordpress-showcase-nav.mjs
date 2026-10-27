#!/usr/bin/env node
/**
 * Generate `showcase-nav-map.json` for the sealed WordPress quickstarts: the links to template showcase
 * pages (typography, error/offline, Home colour variants…) that leave a site's navigations, and the
 * template-part navigation blocks repointed so a drawer stops listing them. Read later by the Claude
 * Cowork plugin. Every page stays published: no operation here can name a post status.
 *
 * 🔒 NO MARKUP, NO OPERATION. An operation is pinned to the bytes of the post it edits (`before`/`after`
 * sha256), so it is computed only from the raw `wp_navigation` / template-part markup that
 * `packages/cms/tracy-wordpress-quickstart/scripts/capture-navigation-source.mjs` takes from the release's
 * own database archive into `navigation-source.json`. A contract without that file gets
 * `status: "not-covered"` with the reason and no operation, and so does one whose source leaves out a
 * part, theme file or navigation the release resolves to (`sourceProblems`). `finals` gives the sha256 each edited post
 * ends at — a header's is what the presentation lock must say once the map is applied.
 *
 * THE RULE lives in `scripts/lib/showcase-nav/wp-navigation-ast.mjs`; per-design decisions in
 * `packages/cms/tracy-wordpress-quickstart/showcase-decisions.json`.
 *
 * Run: `node scripts/build-wordpress-showcase-nav.mjs [--check] [--contract <id>]... [--report <file.md>]`
 * `TRACY_WP_CONTRACTS` / `TRACY_WP_SHOWCASE_DECISIONS` point at another tree (tests); with the first set,
 * only the contracts on that tree are in scope.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import {
  WP_OPERATIONS,
  hasSource,
  parseBlocks,
  planWordpress
} from './lib/showcase-nav/wp-navigation-ast.mjs'
import {
  SOURCE_FILE,
  SOURCE_SCHEMA,
  themePartFilesOf
} from '../packages/cms/tracy-wordpress-quickstart/scripts/capture-navigation-source.mjs'

const TOOL = 'build-wordpress-showcase-nav'
const INVENTORY_FILE = 'inventory.json'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OWN_TREE = !process.env.TRACY_WP_CONTRACTS
const CONTRACTS =
  process.env.TRACY_WP_CONTRACTS || path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
const DECISIONS =
  process.env.TRACY_WP_SHOWCASE_DECISIONS ||
  path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/showcase-decisions.json')
const SCHEMA = 'tracy-quickstart-showcase-nav/wordpress/v1'
const HEX = /^[0-9a-f]{64}$/

/**
 * The map of one contract.
 * @returns {{ map: object, problems: string[] }}
 */
export function generate(dir, id, decisions) {
  const baseFiles = baseFilesOf(dir)
  const sourceFile = path.join(dir, SOURCE_FILE)
  // The release's posts (id, status, slug, parent, language, block skeleton) and options: they tell a
  // copy of the home page, and what a hidden entry would leave with no route.
  const inventoryFile = path.join(dir, INVENTORY_FILE)
  const head = {
    schemaVersion: SCHEMA,
    profileVersion: PROFILE_VERSION,
    contract: id,
    baseHash: baseHashOf(baseFiles),
    baseFiles,
    inputs: existsSync(sourceFile)
      ? {
          [SOURCE_FILE]: sha256(readFileSync(sourceFile)),
          ...(existsSync(inventoryFile) ? { [INVENTORY_FILE]: sha256(readFileSync(inventoryFile)) } : {})
        }
      : {},
    decisionsHash: decisionsHashOf(decisions)
  }
  const empty = {
    operations: [],
    finals: [],
    kept: [],
    unresolved: [],
    counts: { links: 0, templateParts: 0, kept: 0, unresolved: 0 }
  }
  if (!existsSync(sourceFile))
    return {
      map: {
        ...head,
        status: 'not-covered',
        reason: `the contract has no ${SOURCE_FILE}, so no operation can be fingerprinted on the raw navigation markup`,
        ...empty
      },
      problems: decisions ? [`showcase-decisions.json decides for a contract with no ${SOURCE_FILE}`] : []
    }
  const source = readJson(sourceFile)
  const own = sourceProblems(dir, id, source)
  if (own.length)
    return {
      map: {
        ...head,
        status: 'not-covered',
        reason: `${SOURCE_FILE} does not hold all the markup the release resolves to: ${own.join('; ')}`,
        ...empty
      },
      problems: own
    }
  const inventory = existsSync(inventoryFile) ? readJson(inventoryFile) : null
  const plan = planWordpress(source, decisions ?? {}, {
    pages: inventory?.posts ?? [],
    options: inventory?.options ?? {}
  })
  const map = {
    ...head,
    status: 'checked',
    operations: plan.operations,
    finals: plan.finals,
    kept: plan.kept,
    unresolved: plan.unresolved,
    counts: {
      links: plan.operations.filter((o) => o.op === 'navigation.removeLink' || o.block?.path).length,
      templateParts: plan.operations.filter((o) => o.op !== 'navigation.removeLink' && !o.block?.path).length,
      kept: plan.kept.length,
      unresolved: plan.unresolved.length
    }
  }
  return { map, problems: [...plan.problems, ...validate(map)] }
}

/**
 * Whether `navigation-source.json` is the capture of this contract's own release AND holds everything
 * the plan reads: same contract, the database archive `manifest.json` names, every sha256 the one of its
 * content, and nothing the release resolves to left out —
 *   - every template part the presentation lock pins (and, when the contract has one, every template
 *     part and navigation `inventory.json` lists), at the same bytes;
 *   - every theme part file (`parts/<slug>.html` in the lock's `files`) with no database override, since
 *     WordPress renders that file in its place: carried with the pinned bytes, and holding no navigation
 *     or nested part, which no operation here can edit;
 *   - every navigation a template part points at and every template part one nests.
 * Any gap makes the map not covered: a plan over part of the markup would check nothing it left out.
 */
export function sourceProblems(dir, id, source) {
  const problems = []
  if (source.schemaVersion !== SOURCE_SCHEMA) problems.push(`${SOURCE_FILE} is not ${SOURCE_SCHEMA}`)
  if (source.contract !== id) problems.push(`${SOURCE_FILE} was captured for ${source.contract}`)
  const database = readJson(path.join(dir, 'manifest.json')).quickstart?.parts?.database
  if (!database?.sha256 || source.database?.sha256 !== database.sha256)
    problems.push(
      `${SOURCE_FILE} was captured from database ${source.database?.sha256 ?? '(none)'}, not the release's ${database?.sha256 ?? '(none)'}`
    )
  if (!hasSource(source) || !Array.isArray(source.themeParts))
    return [
      ...problems,
      `${SOURCE_FILE} has no navigations, template parts or theme parts, or one with no content`
    ]
  for (const post of [...source.navigations, ...source.templateParts])
    if (sha256(post.content) !== post.sha256)
      problems.push(
        `${SOURCE_FILE}: the content of ${post.id} (${post.slug}) is not its sha256 — recapture it`
      )

  const parts = new Map(source.templateParts.map((p) => [p.slug, p]))
  const navigations = new Set(source.navigations.map((n) => n.id))
  // Identity the planner reads: a part's id, slug, theme and area (the area is how a header is found),
  // a navigation's id, slug and language. Each must be there, and match inventory.json and the lock.
  const named = (v) => typeof v === 'string' && v !== ''
  for (const part of source.templateParts) {
    const at = `template part ${part.id ?? '(no id)'} (${part.slug ?? 'no slug'})`
    if (!Number.isInteger(part.id) || !named(part.slug) || !named(part.area) || !named(part.theme))
      problems.push(`${SOURCE_FILE}: ${at} is missing its id, slug, area or theme`)
    else if (part.theme !== source.stylesheet)
      problems.push(`${SOURCE_FILE}: ${at} belongs to theme ${part.theme}, not ${source.stylesheet}`)
  }
  for (const nav of source.navigations)
    if (!Number.isInteger(nav.id) || !named(nav.slug) || !named(nav.language))
      problems.push(
        `${SOURCE_FILE}: navigation ${nav.id ?? '(no id)'} (${nav.slug ?? 'no slug'}) is missing its id, slug or language`
      )
  if (parts.size !== source.templateParts.length)
    problems.push(`${SOURCE_FILE} has two template parts with one slug`)
  if (navigations.size !== source.navigations.length)
    problems.push(`${SOURCE_FILE} has two navigations with one id`)

  const lock = readJson(path.join(dir, 'presentation-lock.json'))
  const pinnedParts = lock.templateParts ?? {}
  for (const [slug, pinned] of Object.entries(pinnedParts)) {
    if (!parts.has(slug))
      problems.push(`${SOURCE_FILE} has no template part ${slug}, which presentation-lock.json pins`)
    else if (pinned?.sha256 !== parts.get(slug).sha256)
      problems.push(`${SOURCE_FILE}: template part ${slug} is not the bytes presentation-lock.json locks`)
  }
  for (const slug of parts.keys())
    if (!(slug in pinnedParts))
      problems.push(`${SOURCE_FILE} has template part ${slug}, which presentation-lock.json does not pin`)
  const inventoryFile = path.join(dir, INVENTORY_FILE)
  const inventory = existsSync(inventoryFile) ? readJson(inventoryFile) : null
  if (inventory) {
    if (inventory.stylesheet !== source.stylesheet)
      problems.push(`${SOURCE_FILE} has theme ${source.stylesheet}, inventory.json ${inventory.stylesheet}`)
    const listed = (inventory.templateParts ?? []).map((p) => p.id)
    for (const part of inventory.templateParts ?? []) {
      const own = source.templateParts.find((p) => p.id === part.id)
      if (!own) {
        problems.push(
          `${SOURCE_FILE} has no template part ${part.id} (${part.slug}), which inventory.json lists`
        )
        continue
      }
      for (const field of ['slug', 'area', 'sha256'])
        if (own[field] !== part[field])
          problems.push(
            `${SOURCE_FILE}: template part ${part.id} has ${field} ${own[field] ?? '(none)'}, inventory.json ${part[field] ?? '(none)'}`
          )
    }
    for (const part of source.templateParts)
      if (!listed.includes(part.id))
        problems.push(
          `${SOURCE_FILE} has template part ${part.id} (${part.slug}), which inventory.json does not list`
        )
    const listedNavs = (inventory.navigations ?? []).map((n) => n.id)
    for (const nav of inventory.navigations ?? []) {
      const own = source.navigations.find((n) => n.id === nav.id)
      if (!own) {
        problems.push(`${SOURCE_FILE} has no navigation ${nav.id} (${nav.slug}), which inventory.json lists`)
        continue
      }
      for (const field of ['slug', 'language'])
        if (own[field] !== nav[field])
          problems.push(
            `${SOURCE_FILE}: navigation ${nav.id} has ${field} ${own[field] ?? '(none)'}, inventory.json ${nav[field] ?? '(none)'}`
          )
    }
    for (const nav of source.navigations)
      if (!listedNavs.includes(nav.id))
        problems.push(
          `${SOURCE_FILE} has navigation ${nav.id} (${nav.slug}), which inventory.json does not list`
        )
  }
  // Fail closed: a release with template parts has a header, and the header checks need to find it.
  const wantsHeader =
    Object.keys(pinnedParts).length > 0 || (inventory?.templateParts ?? []).some((p) => p.area === 'header')
  if (wantsHeader && !source.templateParts.some((p) => p.area === 'header'))
    problems.push(`${SOURCE_FILE} has no template part of area header, so no header could be checked`)

  const expected = themePartFilesOf(lock, source.stylesheet).filter((f) => !parts.has(f.slug))
  const carried = new Map(source.themeParts.map((t) => [t.slug, t]))
  for (const f of expected) {
    const t = carried.get(f.slug)
    if (!t || t.file !== f.file || t.sha256 !== f.sha256)
      problems.push(
        `${SOURCE_FILE} does not carry the theme file ${f.file}, which template part ${f.slug} resolves to`
      )
    else if (typeof t.content !== 'string' || sha256(t.content) !== t.sha256)
      problems.push(
        `${SOURCE_FILE}: the theme file ${f.file} (template part ${f.slug}) has no content at the bytes presentation-lock.json pins — recapture it with the release's theme`
      )
  }
  for (const t of source.themeParts)
    if (!expected.some((f) => f.slug === t.slug))
      problems.push(
        `${SOURCE_FILE} carries the theme file ${t.file}, which the release does not resolve a template part to`
      )

  const resolvable = new Set([...parts.keys(), ...carried.keys()])
  for (const part of [
    ...source.templateParts,
    ...source.themeParts.filter((t) => typeof t.content === 'string')
  ]) {
    const at = part.id ? `template part ${part.id} (${part.slug})` : `theme file ${part.file}`
    let blocks
    try {
      blocks = parseBlocks(part.content)
    } catch (error) {
      problems.push(`${SOURCE_FILE}: ${at} does not parse: ${error.message}`)
      continue
    }
    for (const b of blocks) {
      if (b.name === 'core/navigation' && !part.id)
        problems.push(`${SOURCE_FILE}: ${at} holds a navigation, and no operation here edits a theme file`)
      if (b.name === 'core/navigation' && b.attrs.ref !== undefined && !navigations.has(Number(b.attrs.ref)))
        problems.push(
          `${SOURCE_FILE}: ${at} points at navigation ${b.attrs.ref}, which ${SOURCE_FILE} does not carry`
        )
      if (b.name === 'core/template-part') {
        if (!part.id)
          problems.push(
            `${SOURCE_FILE}: ${at} nests template part ${b.attrs.slug}, and no operation here edits a theme file`
          )
        else if (
          !resolvable.has(String(b.attrs.slug)) ||
          (b.attrs.theme && b.attrs.theme !== source.stylesheet)
        )
          problems.push(
            `${SOURCE_FILE}: ${at} nests template part ${b.attrs.slug}, which ${SOURCE_FILE} does not carry`
          )
      }
    }
  }
  return problems
}

/** What `--check` holds every map to, whatever produced it. */
export function validate(map) {
  const problems = []
  if (JSON.stringify(map).includes('post_status')) problems.push('a showcase map may not name post_status')
  const last = new Map()
  for (const o of map.operations) {
    if (!WP_OPERATIONS.includes(o.op)) problems.push(`operation ${o.op} is not one this map may carry`)
    if (!HEX.test(String(o.before)) || !HEX.test(String(o.after)))
      problems.push(`operation ${o.op} on ${o.key} has no before/after sha256`)
    if (o.before === o.after) problems.push(`operation ${o.op} on ${o.key} changes nothing`)
    if (last.has(o.key) && last.get(o.key) !== o.before)
      problems.push(`operation ${o.op} on ${o.key} does not start where the one before it ended`)
    last.set(o.key, o.after)
    if (!o.rule || !o.reason) problems.push(`operation on ${o.key} has no rule or reason`)
  }
  if (map.status === 'not-covered' && (!map.reason || map.operations.length))
    problems.push('a not-covered map must say why and carry no operation')
  for (const f of map.finals ?? [])
    if (last.get(f.key) !== f.after) problems.push(`finals of ${f.key} is not where its last operation ends`)
  return problems
}

function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const extra = contractArgs(argv, TOOL)
  const reportFile = reportArg(argv, TOOL)
  const onDisk = contractsOnDisk(CONTRACTS).filter((c) => c.major === 'wp7')
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
    platform: 'wordpress',
    major: 'wp7'
  })
  const exists = (id) => existsSync(path.join(CONTRACTS, id, 'presentation-lock.json'))
  const problems = []
  for (const id of [...pinned, ...extra])
    if (!exists(id) && (OWN_TREE || extra.includes(id)))
      problems.push(`${id}: pinned or named, but no contract on disk`)
  const withMap = onDisk.filter((c) => existsSync(path.join(CONTRACTS, c.id, MAP_FILE))).map((c) => c.id)
  const ids = [
    ...new Set([...latestOf(onDisk), ...pinned.filter(exists), ...extra.filter(exists), ...withMap])
  ].sort()

  const decided = (existsSync(DECISIONS) ? readJson(DECISIONS) : { contracts: {} }).contracts ?? {}
  for (const key of Object.keys(decided))
    if (!ids.includes(key))
      problems.push(`showcase-decisions.json names ${key}, which is not a covered contract`)

  const forReport = []
  for (const id of ids) {
    const dir = path.join(CONTRACTS, id)
    const { map, problems: own } = generate(dir, id, decided[id])
    for (const p of own) problems.push(`${id}: ${p}`)
    forReport.push(map)
    const text = `${JSON.stringify(map, null, 2)}\n`
    const file = path.join(dir, MAP_FILE)
    if (check) {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
        problems.push(`${id}/${MAP_FILE} is stale or missing — run node scripts/${TOOL}.mjs`)
    } else writeFileSync(file, text)
    const c = map.counts
    console.log(
      `${id}  ${map.status} · removes ${c.links} link(s), ${c.templateParts} template-part edit(s) · keeps ${c.kept} · unresolved ${c.unresolved}`
    )
  }
  if (reportFile) writeFileSync(reportFile, reportOf(forReport, 'WordPress showcase navigation'))
  for (const p of problems) console.error(`${TOOL}: ${p}`)
  if (problems.length) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
