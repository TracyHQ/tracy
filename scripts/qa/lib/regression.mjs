/**
 * The regression suite (plan §7.4), `regression.json` on the `qa/daily-tests` branch. A stand-level
 * test enters after it was green on T twice in a row (the second run is a real P7 run). A test that
 * flakes (red, then green on the retry of the same night) twice within 7 nights is quarantined: it
 * still runs (3-minute budget) but no longer counts toward a conclusion. A removed row stays with its
 * date and reason.
 *
 * Exports:
 *   FLAKE_WINDOW_NIGHTS = 7, FLAKES_TO_QUARANTINE = 2
 *   readRegression(file): Doc            // { cases: Row[], removed: Row[] }
 *   writeRegression(file, doc): void
 *   noteGreen(doc, { caseId, pr, lane, level, fixture, libSha256, runId }): { doc, added: boolean }
 *       // a stand-level case green on T: first time -> candidate; second consecutive night -> added
 *   noteRed(doc, caseId): Doc            // a candidate's green streak resets
 *   recordResult(doc, caseId, { runId, ok, flaky? }): { doc, quarantined: boolean }
 *   remove(doc, caseId, reason): Doc
 *   activeCases(doc): Row[]              // not quarantined
 * Row = { caseId, pr, lane, fixture, libSha256, addedIn, history: { runId, ok, flaky }[], quarantined?,
 *         candidateGreens? }
 */
import { readJson, writeJsonAtomic } from './state.mjs'

export const FLAKE_WINDOW_NIGHTS = 7
export const FLAKES_TO_QUARANTINE = 2

export function readRegression(file) {
  const doc = readJson(file, null) ?? {}
  return { cases: doc.cases ?? [], removed: doc.removed ?? [], candidates: doc.candidates ?? {} }
}

export function writeRegression(file, doc) {
  writeJsonAtomic(file, doc)
}

export function noteGreen(doc, { caseId, pr, lane, level, fixture = null, libSha256 = null, runId }) {
  if (level !== 'stand') return { doc, added: false }
  if (doc.cases.some((r) => r.caseId === caseId)) return { doc, added: false }
  const c = doc.candidates[caseId] ?? { greens: 0, lastRun: null }
  if (c.lastRun === runId) return { doc, added: false }
  c.greens += 1
  c.lastRun = runId
  doc.candidates[caseId] = c
  if (c.greens < 2) return { doc, added: false }
  delete doc.candidates[caseId]
  doc.cases.push({ caseId, pr, lane, fixture, libSha256, addedIn: runId, history: [] })
  return { doc, added: true }
}

export function noteRed(doc, caseId) {
  delete doc.candidates[caseId]
  return doc
}

export function recordResult(doc, caseId, { runId, ok, flaky = false }) {
  const row = doc.cases.find((r) => r.caseId === caseId)
  if (!row) return { doc, quarantined: false }
  row.history = [...row.history, { runId, ok: Boolean(ok), flaky: Boolean(flaky) }].slice(
    -FLAKE_WINDOW_NIGHTS
  )
  const flakes = row.history.filter((h) => h.flaky).length
  if (!row.quarantined && flakes >= FLAKES_TO_QUARANTINE) {
    row.quarantined = { at: runId, reason: `flaky ${flakes} times in ${FLAKE_WINDOW_NIGHTS} nights` }
    return { doc, quarantined: true }
  }
  return { doc, quarantined: false }
}

export function remove(doc, caseId, reason) {
  const i = doc.cases.findIndex((r) => r.caseId === caseId)
  if (i === -1) return doc
  const [row] = doc.cases.splice(i, 1)
  doc.removed.push({ ...row, removedAt: new Date().toISOString(), reason })
  return doc
}

export const activeCases = (doc) => doc.cases.filter((r) => !r.quarantined)
