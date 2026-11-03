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
//
// Writing turns (optional, the writer's since #330): a step with nextTurn({ row, ready, answers }) and
// mergeTurns(answers) writes round 0 in turns. Each turn is a request of its own (a fresh conversation: the hook's
// message is its only user message); after each answer the round records it (reading.writingTurns: the raw answer and
// the run's turn count once it was written, saved before the next turn goes out) and asks the hook for the next. A
// resumed round 0 starts its next turn after the last recorded one, from the saved turns past that count, so a turn
// that was answered but not yet recorded is read back, never sent again. Once the hook answers null the parsed answers
// are merged into one and read and checked as the round's only answer. A fix round continues the conversation of the
// last turn (reading.conversationFrom of round 0). A step without the hooks (the planner) plays one conversation.
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
  // What a step makes of an answer object (step.readAnswer): a whole document put together by code, or a change list.
  const valueOf = (value) =>
    step.readAnswer ? step.readAnswer(value, { round, row, ready: ctx.ready }) : value
  const applyTo = (doc, list) => rules.applyValidChanges(doc, list, { row, ready: ctx.ready })
  let carried = null
  if (askedFix) {
    const first = objectOf(reading.invalidChangesAsked.answer, step)
    carried = first.ok ? applyTo(base, valueOf(first.value)) : null
    if (!carried?.ok) askedFix = false
  }
  const notADoc = (result, fields) =>
    save('not_a_plan', { answer: result.answer, failureList: messages.notADoc, reading, ...fields })
  const ended = async (result) => {
    const [state, error] = result.ended
    await save(state, error ? { error } : {})
    return result.ended
  }
  // Where the conversation this round continues starts in the run's turns: the last writing turn's first call.
  let from = 0
  if (step.nextTurn && round > 0)
    from = (await store.roundsOf(pool, runId))[0]?.reading?.conversationFrom ?? 0
  // Round 0 in writing turns: the merged answer, read below as the round's only answer.
  let written = null
  if (step.nextTurn && round === 0) {
    const done = reading.writingTurns ?? []
    for (;;) {
      const answers = done.map((d) => objectOf(d.answer, step).value)
      const firstUser = step.nextTurn({ row, ready: ctx.ready, answers })
      if (firstUser === null) {
        const value = step.mergeTurns(answers)
        const droppedText = done
          .map((d) => d.droppedText)
          .filter(Boolean)
          .join('\n')
        written = {
          answer: done.length === 1 ? done[0].answer : JSON.stringify(value),
          turns: history,
          parsed: { ok: true, value, ...(droppedText ? { droppedText } : {}) }
        }
        break
      }
      from = done.at(-1)?.to ?? 0
      reading.conversationFrom = from
      const result = await ctx.ask({
        row,
        ready: ctx.ready,
        round,
        history,
        leaseToken,
        must,
        firstUser,
        from
      })
      if (result.ended) return ended(result)
      const parsed = objectOf(result.answer, step)
      if (!parsed.ok) {
        await notADoc(result, { error: parsed.error })
        return null
      }
      history = result.turns
      done.push({
        to: history.length,
        answer: result.answer,
        ...(parsed.droppedText ? { droppedText: parsed.droppedText } : {})
      })
      reading.writingTurns = done
      await save('planning', { reading })
    }
  }
  for (;;) {
    const result =
      written ?? (await ctx.ask({ row, ready: ctx.ready, round, history, followUp, leaseToken, must, from }))
    if (result.ended) return ended(result)
    const parsed = written ? written.parsed : objectOf(result.answer, step)
    written = null
    if (!parsed.ok) {
      await notADoc(result, { error: parsed.error })
      return null
    }
    const read = { ...parsed, value: valueOf(parsed.value) }
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
      const applied = applyTo(askedFix ? carried.doc : base, read.value)
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
