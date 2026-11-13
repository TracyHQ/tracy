/**
 * The AI quickstart catalogue of the build chat (#609, ADR 0046): which templates the chat offers for a trade, and the
 * kit (block store, page recipes, Tracy library) the plan composer and the plan edit gate read.
 *
 * A kit is a folder `<slug>/<cms dir>/<version>/` holding the three declarations of the AI quickstart contract
 * (`docs/references/ai-quickstart-contract.md`) and `kit-manifest.json`:
 *
 *   {"schema": "tracy-ai-quickstart-kit/v1", "released": true, "template": {slug, name, version},
 *    "trades": ["fitness"], "picture": "<image URL>", "reason": "<one line for the owner>"}
 *
 * 🔒 ONE RULE DECIDES WHAT IS OFFERED. A kit is offered for a trade only when its manifest says it is released, lists
 * that trade (values of the engine's `TRADES`), carries a name, a picture and a reason, its mapping file is written
 * (a kit with `mapping.pending.json` cannot be written to a site yet) and the contract check
 * (`checkAiQuickstartContract`, the check gate `ai-quickstart-contract` runs) passes. Nothing else decides "no
 * template fits": no fitting kit is an empty list. `skipped()` says, for the team, why each kit is left out.
 *
 * `loadKit(slug)` is wider: a kit whose block store and recipes pass the check loads even while its mapping is
 * pending, since the composer and the edit gate never read the mapping.
 *
 * In the image the kits are COPYed to `src/ai-quickstarts/` (Dockerfile), as the contract profiles are copied to
 * `src/contracts/`; a checkout reads the Joomla quickstart package in place.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BLOCK_STORE_FILE,
  MAPPING_FILE,
  PAGE_RECIPES_FILE,
  TRADES,
  checkAiQuickstartContract,
  formatAiQuickstartProblem as formatProblem
} from 'website-opportunities/domain'

const IN_IMAGE = fileURLToPath(new URL('../ai-quickstarts/', import.meta.url))
const IN_CHECKOUT = fileURLToPath(
  new URL('../../../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/', import.meta.url)
)
/** Where the shipped kits are: the image's copy, else the checkout's package. */
export const AI_QUICKSTARTS_DIR = existsSync(IN_IMAGE) ? IN_IMAGE : IN_CHECKOUT
export const KIT_MANIFEST_FILE = 'kit-manifest.json'
export const KIT_MANIFEST_SCHEMA = 'tracy-ai-quickstart-kit/v1'
const MAPPING_PENDING_FILE = 'mapping.pending.json'
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The blocks of the Tracy library (WO package, ticket #596): the blocks a plan may place beside a template's own. */
export function tracyLibrary() {
  const file = createRequire(import.meta.url).resolve(
    'website-opportunities/domain/library/tracy-library.json'
  )
  return JSON.parse(readFileSync(file, 'utf8')).blocks
}

const readJson = (file) => {
  try {
    return { doc: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (error) {
    return { problem: `${path.basename(file)}: ${error instanceof Error ? error.message : error}` }
  }
}
const subdirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && SEGMENT.test(e.name))
        .map((e) => e.name)
    : []
/** Versions newest first, by their numeric parts. */
const byVersionDesc = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d) return d
  }
  return b.localeCompare(a)
}

/** The problems of a manifest, as sentences for the team. */
function manifestProblems(m, slug) {
  if (!m || typeof m !== 'object') return ['no kit manifest']
  const problems = []
  if (m.schema !== KIT_MANIFEST_SCHEMA) problems.push(`manifest schema must be "${KIT_MANIFEST_SCHEMA}"`)
  if (m.released !== true) problems.push('not released')
  const t = m.template
  if (!t || t.slug !== slug || !isText(t.name) || !isText(t.version))
    problems.push(`manifest template must be {slug: "${slug}", name, version}`)
  if (!Array.isArray(m.trades) || m.trades.length === 0) problems.push('manifest lists no trade')
  for (const trade of Array.isArray(m.trades) ? m.trades : [])
    if (!TRADES.includes(trade)) problems.push(`${JSON.stringify(trade)} is not a trade of TRADES`)
  if (!isText(m.picture)) problems.push('manifest has no picture')
  if (!isText(m.reason)) problems.push('manifest has no reason line')
  return problems
}

/** One kit folder read and checked. */
function readKit(dir, slug, library) {
  const pending = existsSync(path.join(dir, MAPPING_PENDING_FILE))
  const files = [BLOCK_STORE_FILE, PAGE_RECIPES_FILE, ...(pending ? [] : [MAPPING_FILE])]
  const read = files.map((f) => readJson(path.join(dir, f)))
  const unreadable = read.filter((r) => r.problem).map((r) => r.problem)
  const manifestFile = path.join(dir, KIT_MANIFEST_FILE)
  const manifest = existsSync(manifestFile) ? readJson(manifestFile) : { problem: 'no kit manifest' }
  if (unreadable.length) return { slug, kit: null, problems: unreadable }
  const [blockStore, pageRecipes, mapping = null] = read.map((r) => r.doc)
  const checked = checkAiQuickstartContract({ blockStore, pageRecipes, mapping, mappingPending: pending })
  if (!checked.ok) return { slug, kit: null, problems: checked.problems.map(formatProblem) }
  const m = manifest.doc ?? null
  const template = m?.template
    ? { slug, name: m.template.name, version: m.template.version }
    : { slug, name: slug, version: path.basename(dir) }
  const kit = { template, blockStore, pageRecipes, mapping, library }
  const offerProblems = [
    ...(manifest.problem ? [manifest.problem] : manifestProblems(m, slug)),
    ...(pending ? ['mapping file pending: the kit cannot be written to a site yet'] : [])
  ]
  return { slug, kit, manifest: m, problems: offerProblems }
}

/**
 * The catalogue over one folder of kits. Read once; a new image brings new kits.
 * @param {{root?: string, library?: object[]}} [options] `library`: the Tracy library blocks (default: the WO package's)
 * @returns {{templatesFor: (trade: string) => Array<{slug: string, name: string, version: string, picture: string,
 *   reason: string, quickstart: 'released', fits: true}>, loadKit: (slug: string) => ({template: object,
 *   blockStore: object, pageRecipes: object, mapping: object | null, library: object[]} | null),
 *   skipped: () => Array<{slug: string, reason: string}>}}
 */
export function aiQuickstartCatalogue({ root = AI_QUICKSTARTS_DIR, library } = {}) {
  let kits = null
  const all = () => {
    if (kits) return kits
    const blocks = library ?? tracyLibrary()
    kits = new Map()
    for (const slug of subdirs(root)) {
      // The newest version of the slug with a kit, across its CMS folders.
      const versions = subdirs(path.join(root, slug)).flatMap((cms) =>
        subdirs(path.join(root, slug, cms))
          .filter((v) => existsSync(path.join(root, slug, cms, v, BLOCK_STORE_FILE)))
          .map((v) => ({ v, dir: path.join(root, slug, cms, v) }))
      )
      versions.sort((a, b) => byVersionDesc(a.v, b.v))
      if (versions[0]) kits.set(slug, readKit(versions[0].dir, slug, blocks))
    }
    return kits
  }
  return {
    templatesFor(trade) {
      return [...all().values()]
        .filter((k) => k.kit && k.problems.length === 0 && k.manifest.trades.includes(trade))
        .map(({ kit, manifest }) => ({
          ...kit.template,
          picture: manifest.picture,
          reason: manifest.reason,
          quickstart: 'released',
          fits: true
        }))
    },
    loadKit(slug) {
      if (typeof slug !== 'string' || !SEGMENT.test(slug)) return null
      return all().get(slug)?.kit ?? null
    },
    skipped() {
      return [...all().values()]
        .filter((k) => k.problems.length > 0)
        .map((k) => ({ slug: k.slug, reason: k.problems.join('; ') }))
    }
  }
}
