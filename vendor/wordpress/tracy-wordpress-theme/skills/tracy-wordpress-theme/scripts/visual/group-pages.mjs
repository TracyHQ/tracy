#!/usr/bin/env node
// group-pages.mjs — the route plan of a page group: for each page, what its parity run reads and where it lands.
//
//   node scripts/visual/group-pages.mjs --contract <group visual.contract.json> --spec <spec dir> --kind html|url --out-dir <dir>
//   node scripts/visual/group-pages.mjs --contract <…> --spec <…>                     # JSON: the plan of every page of the group
//
// One plan from the group's canonical contract: page id, page-map path, SEEDED path (where the stand serves it — the one
// the verdict requires measured), effective `reference.kind`, and the SOURCE route (`html`: the exported file `/<file>`;
// `url`: the contract's `sourceRoute`, or the same path as the page-map's when the source is live and the page unpaired).
// `--kind K --out-dir D` writes `routes-K.json` (source routes) and `pairs-K.json` (`{ rules: [{ from, to, status? }] }`, source →
// seeded) in the formats `http-parity.mjs --routes/--pairs` take, and prints the seeded paths comma-joined for `--pages`
// (empty when the group has no page of that kind). `image`/`none` pages have no HTTP source. An ambiguous plan (two pages on
// one seeded path or one source route, a page the page-map lacks, a `url` page with no `source.site`) exits 2.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertNotProtected, emitResult, encodeField, oneLine, takeOutputFlags, writeResultFile } from '../lib/cli-output.mjs'
import { groupIdOf } from '../lib/canonical.mjs'
import { effectiveKinds, routeIndex } from '../lib/route-index.mjs'
import { declaredStatus } from '../lib/routes.mjs'

export const PARITY_KINDS = ['html', 'url']

const readJson = (file, what) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`${what} ${file}: ${e.message}`)
  }
}

/** Pure: [{ id, path (seeded), pagemapPath, kind, sourceRoute, status }] for the pages of a group contract; refuses an ambiguous plan. */
export function groupPages(contract, pageMap, reference) {
  if (!groupIdOf(contract)) throw new Error('contract: not a page group contract (contract.mjs init --group <id> --pages …)')
  const kinds = effectiveKinds(pageMap, reference)
  const entryOf = new Map()
  for (const e of pageMap.pages ?? []) {
    if (entryOf.has(e.path)) throw new Error(`page-map is ambiguous: two entries carry the path ${e.path}`)
    entryOf.set(e.path, e)
  }
  routeIndex(contract.pages)
  const bare = (x) => (String(x).length > 1 ? String(x).replace(/\/+$/, '') : String(x))
  const plan = (contract.pages ?? []).map((p) => {
    const pagemapPath = p.pagemapPath ?? p.path
    const kind = kinds.has(pagemapPath) ? kinds.get(pagemapPath) : null
    const entry = entryOf.get(pagemapPath)
    let sourceRoute = null
    if (kind === 'html') {
      if (!entry?.file) throw new Error(`page ${p.id}: kind html but the page-map entry ${pagemapPath} has no file`)
      sourceRoute = `/${entry.file}`
    } else if (kind === 'url') {
      if (!contract.source?.site) throw new Error(`page ${p.id}: kind url but the contract records no source.site — re-init with --source-site <origin>`)
      sourceRoute = p.sourceRoute ?? pagemapPath
    }
    const status = entry ? declaredStatus(entry) : null
    return { id: p.id, path: p.path, pagemapPath, kind, sourceRoute, ...(status != null ? { status } : {}) }
  })
  for (const field of ['id', 'path']) {
    const seen = new Map()
    for (const e of plan) {
      const k = field === 'path' ? bare(e.path) : e.id
      if (seen.has(k)) throw new Error(`route plan is ambiguous: pages ${seen.get(k)} and ${e.id} share the ${field === 'path' ? 'seeded path' : 'id'} ${k}`)
      seen.set(k, e.id)
    }
  }
  for (const kind of PARITY_KINDS) {
    const seen = new Map()
    for (const e of plan.filter((x) => x.kind === kind)) {
      if (seen.has(e.sourceRoute)) throw new Error(`route plan is ambiguous: pages ${seen.get(e.sourceRoute)} and ${e.id} read the same ${kind} source route ${e.sourceRoute}`)
      seen.set(e.sourceRoute, e.id)
    }
  }
  return plan
}

/** Pure: the `http-parity.mjs` inputs of one kind — source routes, source→seeded pairs, the seeded `--pages`. */
export function parityInputs(plan, kind) {
  const mine = plan.filter((p) => p.kind === kind)
  return {
    routes: mine.map((p) => p.sourceRoute),
    pairs: { rules: mine.map((p) => ({ from: p.sourceRoute, to: p.path, ...(p.status != null ? { status: p.status } : {}) })) },
    pages: mine.map((p) => p.path)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const USAGE = 'usage: group-pages.mjs --contract <visual.contract.json> --spec <spec dir> [--kind html|url --out-dir <dir>] [--json] [--out <plan.json>, without --kind]'
  try {
    const { argv, json, out } = takeOutputFlags(process.argv.slice(2))
    if (out && argv.includes('--kind')) throw new Error(USAGE)
    const seen = new Map()
    for (let i = 0; i < argv.length; i += 2) {
      if (!['--contract', '--spec', '--kind', '--out-dir'].includes(argv[i]) || argv[i + 1] === undefined || argv[i + 1].startsWith('--') || seen.has(argv[i])) throw new Error(USAGE)
      seen.set(argv[i], argv[i + 1])
    }
    if (!seen.has('--contract') || !seen.has('--spec') || (seen.has('--kind') && !PARITY_KINDS.includes(seen.get('--kind'))) || seen.has('--kind') !== seen.has('--out-dir')) throw new Error(USAGE)
    const spec = seen.get('--spec')
    const refFile = path.join(spec, 'reference.json')
    const pages = groupPages(readJson(seen.get('--contract'), '--contract'), readJson(path.join(spec, 'page-map.json'), '--spec page-map.json'), existsSync(refFile) ? readJson(refFile, '--spec reference.json') : { pages: [] })
    if (seen.has('--kind')) {
      const kind = seen.get('--kind')
      const inp = parityInputs(pages, kind)
      const dir = seen.get('--out-dir')
      const routesFile = path.join(dir, `routes-${kind}.json`)
      const pairsFile = path.join(dir, `pairs-${kind}.json`)
      const plan = path.join(dir, 'route-plan.json')
      const resultFile = path.join(dir, `group-pages-${kind}.json`)
      // every file this run writes is checked before the first one is written
      for (const f of [routesFile, pairsFile, plan, resultFile]) assertNotProtected(f, [seen.get('--contract'), spec])
      mkdirSync(dir, { recursive: true })
      writeFileSync(routesFile, JSON.stringify(inp.routes, null, 2) + '\n')
      writeFileSync(pairsFile, JSON.stringify(inp.pairs, null, 2) + '\n')
      // route-plan.json keeps the whole group's plan for its consumers; the complete result of this kind is its own file
      const result = { kind, pages: inp.pages, routes: inp.routes, pairs: inp.pairs, plan, files: { routes: routesFile, pairs: pairsFile, plan, result: resultFile } }
      writeFileSync(plan, JSON.stringify({ pages }, null, 2) + '\n')
      writeResultFile(resultFile, result, [seen.get('--contract'), spec])
      if (json) console.log(JSON.stringify(result, null, 2))
      else console.log(`group-pages ${kind}: pages=${inp.pages.length} ${oneLine(inp.pages.join(','), 100)} -> ${encodeField(resultFile)}`)
    } else {
      const contractFile = seen.get('--contract')
      emitResult({ result: { pages }, json, out, script: 'group-pages', label: 'plan', key: contractFile, protect: [contractFile, spec], summary: `pages=${pages.length}` })
    }
  } catch (e) {
    console.error(`group-pages: ${e.message}`)
    process.exit(2)
  }
}
