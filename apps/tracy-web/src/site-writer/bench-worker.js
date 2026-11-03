// The site writer bench worker (ADR 0042, #329): the writer as a step of the shared bench run loop
// (lib/bench-run-loop.js), which claims the queued run, plays its rounds, applies fix round corrections and stores
// every call. This file says what is the writer's own: the writer prompt, the copy check, how an answer becomes a
// site-copy/1 file, the corrected entries of a fix round, and the first user message.
//
// Round 0 is written in writing turns (#330): harness.pagesPerTurn cuts the writing order into turns, and the loop
// asks for them one after another through the step's turn hooks (nextTurn, mergeTurns; lib/bench-run-round.js). The
// writer gets no tools and no image: each turn's only user message carries the fixed part (plan, cited facts, quoted
// reviews, slim kit view, handed-over name slots), the pages of the turn and the copy notebook of the earlier turns
// (writer-turns.js); the partial answers are merged before the copy is put together and checked, once. Its answer is put together into site-copy/1 by code (copy-changes.js
// assembleCopy: version, fingerprint, the plan's label slots) and graded by checkCopy. Failing entries go back with
// the check's failure list, at most two fix rounds; the writer answers with corrected entries only, the valid ones are
// applied and the invalid ones sent back once. Failures still standing after round 2 keep the writer's text and are
// stored on the run. A run whose answered calls cost more than the harness's budgetUsd stops before its next call
// with SITE_WRITER_BUDGET.

import { isChangeList } from '../lib/bench-answer.js'
import { BENCH_QUEUE, createBenchQueue } from '../lib/bench-run-loop.js'
import { openKit } from '../lib/template-kit-source.js'
import { SITE_WRITER_STORE } from './bench-store.js'
import { openContentMap } from './content-map-source.js'
import {
  applyValidChanges,
  asChangeList,
  assembleCopy,
  CHANGES_INSTRUCTION,
  invalidChangesMessage,
  NOT_A_COPY_MESSAGE,
  WHOLE_COPY_MESSAGE
} from './copy-changes.js'
import { CHECKER_VERSION, checkCopy, failureListText } from './copy-check/check-copy.js'
import { indexInputs } from './copy-check/inputs-index.js'
import { siteWriterDoor } from './door.js'
import { writerInput } from './writer-input.js'
import { writerPrompt } from './writer-prompt.js'
import { firstUserMessage, mergeTurnAnswers, nextTurnMessage } from './writer-turns.js'

export { BENCH_QUEUE }

/** Fix rounds after round 0: round 2 is the last copy scored. */
export const MAX_FIX_ROUNDS = 2

/** The site writer as a bench step (lib/bench-run-loop.js). */
export const SITE_WRITER_STEP = Object.freeze({
  name: 'site-writer',
  codePrefix: 'SITE_WRITER',
  store: SITE_WRITER_STORE,
  maxFixRounds: MAX_FIX_ROUNDS,
  prompt: writerPrompt,
  checker: Object.freeze({
    version: CHECKER_VERSION,
    check: ({ doc, row, ready }) =>
      checkCopy({
        copy: doc,
        plan: row.plan,
        kit: ready.kit.doc,
        brief: row.brief,
        contentMap: ready.contentMap
      }),
    failureListText
  }),
  changes: Object.freeze({
    applyValidChanges,
    // Corrected entries replace only the texts they name; there is no large replacement to refuse.
    oversized: () => [],
    smallEditsMessage: () => '',
    invalidChangesMessage
  }),
  messages: Object.freeze({
    changesInstruction: CHANGES_INSTRUCTION,
    wholeDoc: WHOLE_COPY_MESSAGE,
    notADoc: NOT_A_COPY_MESSAGE
  }),
  readAnswer,
  // Writing turns: the user message of the next turn of round 0, or null once all are written; then the merge.
  nextTurn: ({ row, ready, answers }) => nextTurnMessage(ready.input, answers, row.harness?.pagesPerTurn),
  mergeTurns: mergeTurnAnswers,
  prepare,
  agentRequest
})

/**
 * @param {{ pool: import('pg').Pool, secret: string, fetchImpl?: typeof fetch, balanceFetch?: typeof fetch,
 *   index?: Map<string, object>, log?: Console, now?: () => number, retry?: object }} deps `index`: the contracts to
 *   find kits in (tests); `retry` replaces the run's retry policy (tests).
 */
export function createSiteWriterQueue({ log = console, now, ...deps }) {
  return createBenchQueue(SITE_WRITER_STEP, { ...deps, log, now })
}

/** The fingerprint a run's copy carries (ADR 0042 section 1): the kit id and the hashes of plan, brief and prompt. */
export const fingerprintOf = (row, kitDoc) => ({
  kit: kitIdOf(kitDoc, row.kit?.ref),
  planSha256: row.plan_sha256,
  briefSha256: row.brief_sha256,
  promptSha256: row.prompt_sha256
})

/** The kit id as a plan names it: "<kit format> <contract>", e.g. "tracy-template-kit/2 ja-boxing/j6/1.0.10". */
export function kitIdOf(doc, ref) {
  if (typeof doc?.kit === 'string' && typeof doc?.contract === 'string') return `${doc.kit} ${doc.contract}`
  return typeof doc?.kit === 'string' ? doc.kit : String(ref ?? '')
}

// A whole answer becomes the copy file; a fix round's corrected entries become a change list.
function readAnswer(value, { round, row, ready }) {
  if (isChangeList(value)) return value
  return (
    asChangeList(value, { round }) ??
    assembleCopy(value, { fingerprint: fingerprintOf(row, ready.kit.doc), index: ready.index })
  )
}

// The writer reads everything from its first message: no tools, no image.
function agentRequest({ ready }) {
  return { firstUser: ready.firstUser, tools: [] }
}

// Everything the run was started with must still hold (the loop checks the prompt and the checker first): a run that
// silently ran on another model, a kit the server no longer reads, or a changed content map would not measure what it
// records.
async function prepare({ pool, secret, index }, row) {
  const kit = openKit(row.kit?.ref, index ? { index } : {})
  if (!kit)
    return { ok: false, code: 'SITE_WRITER_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const map = contentMapOf(row, index)
  if (!map.ok) return map
  const door = await siteWriterDoor({ pool, secret })
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === row.door?.[k])
  const contentMap = map.doc
  const input = writerInput({
    plan: row.plan,
    brief: row.brief,
    kit: kit.doc,
    contentMap: contentMap ?? null
  })
  if (!same)
    return {
      ok: false,
      code: 'SITE_WRITER_DOOR_CHANGED',
      reason: `the door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${row.door?.providerId} ${row.door?.model}`
    }
  return {
    ok: true,
    kit,
    door: door.door,
    contentMap,
    index: indexInputs({ plan: row.plan, kit: kit.doc, brief: row.brief, contentMap }),
    input,
    firstUser: firstUserMessage(input)
  }
}

// The content map the run started on (its sha256 is frozen in row.kit): the same bytes, or a refusal. A run started
// before content maps were read (no contentMapSha256 on its kit) reads none: `doc` is undefined and the check runs as
// it did then.
function contentMapOf(row, index) {
  if (!row.kit || !('contentMapSha256' in row.kit)) return { ok: true, doc: undefined }
  const map = openContentMap(row.kit.ref, index ? { index } : {})
  const sha = map?.sha256 ?? null
  if (sha !== row.kit.contentMapSha256)
    return {
      ok: false,
      code: 'SITE_WRITER_CONTENT_MAP_CHANGED',
      reason: `the content map of ${row.kit.ref} is not the one the run started on`
    }
  return { ok: true, doc: map?.doc ?? null }
}
