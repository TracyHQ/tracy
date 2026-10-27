// The cms layer module: `layer`, `listCases`, `run` (contract fixed by the QA brief), plus `createLayer` so a selftest
// can point the same code at a mutated product tree or inject a fake GitHub and environment.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCommitted } from '../../lib/denominator.mjs'
import { buildCoverage } from './coverage.mjs'
import { ContractError, canonicalJson, loadCaseFiles, readJsonFile, runCases } from './lib/kit.mjs'
import { extract } from './lib/inventory.mjs'
import { probes } from './lib/probes.mjs'
import { buildManifests, buildRegistry } from './specs/index.mjs'

export const layer = 'cms'
export const AREAS = Object.freeze(['machine', 'contract', 'live', 'matrix', 'legacy'])
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')

export function createLayer({
  repoRoot = REPO,
  productRoot = repoRoot,
  env = process.env,
  fetchImpl = undefined,
  casesDir = path.join(HERE, 'cases')
} = {}) {
  async function listCases({ area } = {}) {
    const all = await loadCaseFiles(casesDir, 'CMS')
    if (area && !AREAS.includes(area)) throw new ContractError(`unknown area ${area}`)
    return area ? all.filter((c) => c.area === area) : all
  }

  /** Cases on disk must be exactly what the tree generates now; a stale manifest could name a variant the code no longer has. */
  function assertFresh(cases, inventory) {
    const fresh = new Map(buildManifests(inventory, repoRoot).map((m) => [m.id, canonicalJson(m)]))
    const stale = cases.filter((c) => fresh.get(c.id) !== canonicalJson(c)).map((c) => c.id)
    if (stale.length)
      throw new ContractError(
        `cases/ is stale for ${stale.length} case(s) (first: ${stale[0]}); run node tests/qa/layers/cms/generate.mjs`,
        stale.slice(0, 10)
      )
  }

  async function run({ cases, target = 'local', proveRed = false, outDir }) {
    if (!outDir) throw new ContractError('run needs outDir')
    const inventory = extract(repoRoot)
    assertFresh(cases, inventory)
    return runCases({
      layer,
      cases,
      target,
      proveRed,
      outDir,
      registry: buildRegistry(inventory),
      probes,
      repoRoot: productRoot,
      envOf: env,
      fetchImpl
    })
  }

  async function denominator() {
    return assertCommitted(await readJsonFile(path.join(HERE, 'denominator.json'), 'denominator.json'), 'cms')
  }

  async function coverage({ results = null } = {}) {
    return buildCoverage({ denominator: await denominator(), cases: await listCases({}), results })
  }

  return { layer, listCases, run, coverage, denominator }
}

const defaults = createLayer()
export const listCases = defaults.listCases
export const run = defaults.run
export const coverage = defaults.coverage
export async function cleanOut(outDir) {
  await fs.rm(path.join(outDir, 'tmp'), { recursive: true, force: true })
}
