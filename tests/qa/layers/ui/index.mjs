// Layer module of `ui` (contract: tests/qa/layers/<layer>/index.mjs).
//
//   layer              the layer name
//   listCases(opts)    case manifests, optionally for one area (screens|blocks|sheets|switches|legacy)
//   run(opts)          verdicts for the given manifests
//
// Self-contained: nothing is imported from tests/qa/lib.

import { AREAS, listCasesFor, loadLayer, runCases } from './engine.mjs'

export const layer = 'ui'
export { AREAS }

export async function listCases({ area } = {}) {
  return listCasesFor({ area })
}

export async function denominator() {
  return (await loadLayer()).denominator
}

/**
 * @param {{ cases: object[], target?: string, proveRed?: boolean, outDir: string, options?: object }} args
 * @returns {Promise<Array<{ id: string, verdict: string, reason: string, assertionIds: string[], evidence: string[], durationMs: number, redProof: object|null }>>}
 */
export async function run({ cases, target = 'local', proveRed = false, outDir, options = {} }) {
  const { results } = await runCases({ cases, target, proveRed, outDir, options })
  return results
}
