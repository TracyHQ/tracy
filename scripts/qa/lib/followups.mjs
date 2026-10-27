/**
 * Cases under watch (plan §7.4), `state/followups.json`. A case enters when it is `differs` (with an
 * issue, or not opened because of the cap, a brake or a failed push), unclassified, or
 * `rerun-deferred`. Every night P7 reruns it. It ends when it is green two nights in a row (one
 * "passes at <sha>" comment when it has an issue), when its issue is closed, or after 14 nights.
 * A case that could not get an issue and is still red is eligible again at P8.
 *
 * Exports:
 *   MAX_NIGHTS = 14, GREEN_NIGHTS = 2
 *   readFollowups(qaHome): Doc                         // { cases: { [caseId]: Entry }, ended: Entry[] }
 *   writeFollowups(qaHome, doc): void
 *   addFollowup(doc, { caseId, pr, lane, reason, issue?, runId }): Doc      // keeps an existing entry
 *   tickFollowup(doc, caseId, { ok, runId, sha, issueClosed? }):
 *       { doc, action: 'passes-comment' | null, ended: string | null }
 *   openFollowups(doc): Entry[]
 *   eligibleAgain(doc): Entry[]                        // still red, no issue yet
 * Entry = { caseId, pr, lane, reason, issue, since, nights, greens, lastOk, lastSha, endedReason? }
 */
import { join } from 'node:path'
import { readJson, stateDir, writeJsonAtomic } from './state.mjs'

export const MAX_NIGHTS = 14
export const GREEN_NIGHTS = 2

const file = (qaHome) => join(stateDir(qaHome), 'followups.json')

export function readFollowups(qaHome) {
  const doc = readJson(file(qaHome), null) ?? {}
  return { cases: doc.cases ?? {}, ended: doc.ended ?? [] }
}

export function writeFollowups(qaHome, doc) {
  writeJsonAtomic(file(qaHome), doc)
}

export function addFollowup(doc, { caseId, pr, lane, reason, issue = null, runId }) {
  const cur = doc.cases[caseId]
  if (cur) {
    if (issue && !cur.issue) cur.issue = issue
    return doc
  }
  doc.cases[caseId] = {
    caseId,
    pr,
    lane,
    reason,
    issue,
    since: runId,
    nights: 0,
    greens: 0,
    lastOk: null,
    lastSha: null
  }
  return doc
}

function end(doc, caseId, why) {
  const e = { ...doc.cases[caseId], endedReason: why }
  delete doc.cases[caseId]
  doc.ended.push(e)
  return e
}

export function tickFollowup(doc, caseId, { ok, runId, sha, issueClosed = false }) {
  const e = doc.cases[caseId]
  if (!e) return { doc, action: null, ended: null }
  if (issueClosed) {
    end(doc, caseId, 'issue closed')
    return { doc, action: null, ended: 'issue closed' }
  }
  e.nights += 1
  e.lastOk = Boolean(ok)
  e.lastSha = sha ?? null
  e.lastRun = runId
  e.greens = ok ? e.greens + 1 : 0
  if (e.greens >= GREEN_NIGHTS) {
    const action = e.issue ? 'passes-comment' : null
    end(doc, caseId, 'green two nights')
    return { doc, action, ended: 'green two nights' }
  }
  if (e.nights >= MAX_NIGHTS) {
    end(doc, caseId, `${MAX_NIGHTS} nights`)
    return { doc, action: null, ended: `${MAX_NIGHTS} nights` }
  }
  return { doc, action: null, ended: null }
}

export const openFollowups = (doc) => Object.values(doc.cases)

export const eligibleAgain = (doc) =>
  Object.values(doc.cases).filter((e) => !e.issue && e.lastOk === false && e.reason === 'differs')
