// The related layer module: `layer`, `listCases`, `run`, plus `createLayer` for selftests.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCommitted } from '../../lib/denominator.mjs'
import { buildCoverage } from '../cms/coverage.mjs'
import { ContractError, canonicalJson, loadCaseFiles, readJsonFile, runCases } from '../cms/lib/kit.mjs'
import { probes } from './lib/probes.mjs'
import { buildManifests, buildRegistry } from './specs/index.mjs'

export const layer = 'related'
export const AREAS = Object.freeze(['suites', 'chain'])
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
    const all = await loadCaseFiles(casesDir, 'RELATED')
    if (area && !AREAS.includes(area)) throw new ContractError(`unknown area ${area}`)
    return area ? all.filter((c) => c.area === area) : all
  }

  function assertFresh(cases) {
    const fresh = new Map(buildManifests(repoRoot).map((m) => [m.id, canonicalJson(m)]))
    const stale = cases.filter((c) => fresh.get(c.id) !== canonicalJson(c)).map((c) => c.id)
    if (stale.length)
      throw new ContractError(
        `cases/ is stale for ${stale.length} case(s) (first: ${stale[0]}); run node tests/qa/layers/related/generate.mjs`,
        stale.slice(0, 10)
      )
  }

  async function run({ cases, target = 'local', proveRed = false, outDir }) {
    if (!outDir) throw new ContractError('run needs outDir')
    assertFresh(cases)
    return runCases({
      layer,
      cases,
      target,
      proveRed,
      outDir,
      registry: buildRegistry(),
      probes,
      repoRoot: productRoot,
      envOf: env,
      fetchImpl,
      concurrency: 1
    })
  }

  const denominator = async () =>
    assertCommitted(await readJsonFile(path.join(HERE, 'denominator.json'), 'denominator.json'), 'related')
  const coverage = async ({ results = null } = {}) =>
    buildCoverage({ denominator: await denominator(), cases: await listCases({}), results })
  return { layer, listCases, run, coverage, denominator }
}

const defaults = createLayer()
export const listCases = defaults.listCases
export const run = defaults.run
export const coverage = defaults.coverage
export async function cleanOut(outDir) {
  await fs.rm(path.join(outDir, 'tmp'), { recursive: true, force: true })
}
