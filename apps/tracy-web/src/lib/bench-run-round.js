// One round of a bench run (ADR 0041, #301, #303; shared by every bench step since #327; the loop is
// bench-run-loop.js). The agent runs (resuming from the saved turns), then its answer is saved as a document with its
// check, or as an answer that is not a document.
//
// A fix round may answer with a whole document or with a change list (bench-changes.js). In a change list the valid
// changes are applied and the invalid ones are asked for again, only those, once; corrected edits that still have
// invalid changes (or a list that cannot be read at all) ask once for the whole document. A change list whose
// replacements resend a large part of the document mostly unchanged (bench-change-size.js) is not applied once: a
// short message asks for field edits instead; a second such list is applied, and the round records it
// (reading.bigReplacementsApplied). All of it in the same round. An answer that is not one JSON object (one fenced
// block in it is read, the text around it dropped and recorded) is a round that is not a document: the step's message
// asking for the whole document as one JSON object is sent back instead, and it counts as a fix round.
import { isChangeList, objectOf } from './bench-answer.js'

/** Play one round. Returns the run's verdict when the round ends the run, else null. */
export async function playRound(ctx, { round, followUp, base, reading: prior }) {
  const { step, deps, row, leaseToken, must } = ctx
  const { pool } = deps
  const { store, changes: rules, messages } = step
  const docColumn = store.tables.docColumn
  const notApplied = `${step.codePrefix}_CHANGES_NOT_APPLIED`
  const runId = row.id
  const save = (state, fields = {}) =>
    must(store.saveRound(pool, { runId, round, state, leaseToken, ...fields }))
  let history = await store.turnsOf(pool, runId)
  const lost = history.at(-1)
  if (lost?.state === 'dispatched' && lost.resendOf === undefined) {
    await must(store.abandonTurn(pool, { runId, n: lost.n, leaseToken }))
    lost.state = 'abandoned'
  }
  let askedWhole = await store.roundSent(pool, runId, round, messages.wholeDoc)
  // The ask for small edits is recorded before it goes out; it counts once it was sent.
  const smallAsk = prior?.smallEditsAsked?.message
  let askedSmall = Boolean(smallAsk) && (await store.roundSent(pool, runId, round, smallAsk))
  const reading = { ...prior }
  // The corrected edits go onto the document the first list left behind: the valid changes of that list, applied again.
  let askedFix =
    Boolean(reading.invalidChangesAsked) &&
    (await store.roundSent(pool, runId, round, reading.invalidChangesAsked.message))
  let carried = null
  if (askedFix) {
    const first = objectOf(reading.invalidChangesAsked.answer, step)
    carried = first.ok ? rules.applyValidChanges(base, first.value) : null
    if (!carried?.ok) askedFix = false
  }
  const notADoc = (result, fields) =>
    save('not_a_plan', { answer: result.answer, failureList: messages.notADoc, reading, ...fields })
  for (;;) {
    const result = await ctx.ask({ row, ready: ctx.ready, round, history, followUp, leaseToken, must })
    if (result.ended) {
      const [state, error] = result.ended
      await save(state, error ? { error } : {})
      return result.ended
    }
    const read = objectOf(result.answer, step)
    if (!read.ok) {
      await notADoc(result, { error: read.error })
      return null
    }
    // A whole document is recorded under the step's document name ("plan"), as the round's reading always has been.
    reading.form = isChangeList(read.value) ? 'changes' : docColumn
    reading.droppedText = read.droppedText
    let doc = read.value
    let changes
    // Ask once more within the round: record why first, so a resumed round still knows, then send `message`.
    const askAgain = async (message) => {
      await save('planning', { changes: read.value.changes, reading })
      history = result.turns
      followUp = message
    }
    if (reading.form === 'changes') {
      const applied = rules.applyValidChanges(askedFix ? carried.doc : base, read.value)
      if (!applied.ok && askedWhole) {
        await notADoc(result, { error: `${notApplied}: ${applied.reason}`, changes: read.value.changes })
        return null
      }
      if (!applied.ok) {
        reading.wholePlanAsked = { reason: applied.reason, answer: result.answer }
        await askAgain(messages.wholeDoc)
        askedWhole = true
        continue
      }
      const replacements = askedFix
        ? [...carried.replacements, ...applied.replacements]
        : applied.replacements
      const oversized = rules.oversized(replacements)
      if (oversized.length && !askedSmall && !askedFix) {
        const message = rules.smallEditsMessage(oversized)
        reading.smallEditsAsked = { message, replacements: oversized, answer: result.answer }
        await askAgain(message)
        askedSmall = true
        continue
      }
      if (applied.rejected.length) {
        // Recorded before the ask goes out, so a resumed round still knows what was applied and what was sent back.
        reading.changesApplied = askedFix ? carried.applied + applied.applied : applied.applied
        reading.changesRejected = applied.rejected.map(({ index, reason }) => ({ index, reason }))
        if (!askedFix && !askedWhole) {
          const message = rules.invalidChangesMessage(applied.rejected, applied.applied)
          reading.invalidChangesAsked = { message, answer: result.answer }
          await askAgain(message)
          askedFix = true
          carried = applied
          continue
        }
        const reason = `${applied.rejected.length} changes could not be applied: ${applied.rejected[0].reason}`
        if (askedWhole) {
          await notADoc(result, { error: `${notApplied}: ${reason}`, changes: read.value.changes })
          return null
        }
        // The corrected edits are still not valid: the last resort is the whole document.
        reading.wholePlanAsked = { reason, answer: result.answer }
        await askAgain(messages.wholeDoc)
        askedWhole = true
        continue
      }
      // Correctness over speed: a second oversized list is applied, and the round says so.
      if (oversized.length) reading.bigReplacementsApplied = oversized
      if (askedFix) {
        reading.changesApplied = carried.applied + applied.applied
        reading.changesRejected = []
      }
      doc = applied.doc
      changes = askedFix ? [...carried.validChanges, ...read.value.changes] : read.value.changes
    }
    await must(store.setProgress(pool, { runId, step: 'checking', round, leaseToken }))
    const checkResult = step.checker.check({ doc, row, ready: ctx.ready })
    await save('checked', {
      answer: result.answer,
      [docColumn]: doc,
      checkResult,
      failureList: step.checker.failureListText(checkResult),
      reading,
      ...(changes ? { changes } : {})
    })
    return null
  }
}
