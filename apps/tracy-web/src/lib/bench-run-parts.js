// Round 0 of a bench run written in parts at the same time (2026-11-15, #633; the writer's first draft, a run setting
// that is off unless a run asks for it). The step's parts hook gives one first user message per part; each part is a
// conversation of its own, all of them in flight together, and their answers are merged by the step's mergeParts into
// the round's one answer, which is then read and checked once like any other round 0 (bench-run-round.js). The fix
// rounds continue the conversation of the last part, as after writing turns they continue the last turn.
//
// Turn numbers: part p owns the numbers from p * PART_STRIDE up to the next part's, so the parts save their calls at the
// same time without taking each other's numbers, and the last part's conversation goes on into the fix rounds after
// its own calls. Every call is saved as it happens, under the run's lease, like any other turn: the run's cost is the
// sum of every part's calls, and the round's cost the sum of its turns.
//
// Resume: a part's answer is recorded on the round (reading.parallelParts) once it is read; a part with no record is
// asked again from its saved turns, so an answer that came back but was not recorded yet is read back, never sent
// again, and a call that was dispatched and never answered is marked abandoned and sent once more, per part.
// A part whose answer is not one JSON object gets the step's notADoc message once, in its own conversation; if that
// answer is not one either, the part counts as empty (its error recorded) and the check names everything it should
// have written, for the fix rounds; when no part gives a JSON object, the round is not a document, as a whole answer
// would be. Cancel: every part watches the run's Stop flag; a part that ends the round (a cancel, a failed call) stops
// the others, and the round ends with the first failure, or as cancelled.
import { objectOf } from './bench-answer.js'

/** The turn numbers each part owns: far above the calls one conversation may make (BENCH_HARNESS.maxTurns, 150). */
export const PART_STRIDE = 1000

const sentIn = (turns, content) =>
  turns.some((t) => (t.sent ?? []).some((m) => m?.role === 'user' && m.content === content))

/**
 * Write round 0 in parts. Returns `{ ended }` with the run's verdict, `{ notADoc: { answer, error } }`, or
 * `{ written, history }`: the merged answer as the round's only answer and every saved turn of the run.
 */
export async function writeInParts(ctx, { parts, history, reading, save }) {
  const { step, deps, row, leaseToken, must } = ctx
  const { store } = step
  const { pool } = deps
  const runId = row.id
  const done = Array.isArray(reading.parallelParts) ? [...reading.parallelParts] : []
  reading.conversationFrom = (parts.length - 1) * PART_STRIDE
  const range = (p) => ({
    from: p * PART_STRIDE,
    to: p === parts.length - 1 ? Infinity : (p + 1) * PART_STRIDE
  })
  // A call of a part that was dispatched and never answered (a restart while it waited) is sent once more.
  for (const [p] of parts.entries()) {
    const { from, to } = range(p)
    const lost = history.filter((t) => t.n >= from && t.n < to).at(-1)
    if (lost?.state === 'dispatched' && lost.resendOf === undefined) {
      await must(store.abandonTurn(pool, { runId, n: lost.n, leaseToken }))
      lost.state = 'abandoned'
    }
  }
  // Records go out one at a time, each with every part recorded so far, so two parts never overwrite each other's.
  let saving = Promise.resolve()
  const record = (entry) => {
    done[entry.part] = entry
    reading.parallelParts = done
    saving = saving.then(() => save('planning', { reading }))
    return saving
  }
  const stop = new AbortController()
  const ask = (p, args) =>
    ctx.ask({
      row,
      ready: ctx.ready,
      round: 0,
      history,
      leaseToken,
      must,
      ...range(p),
      ...args,
      signal: stop.signal
    })
  async function writePart({ about, firstUser }, p) {
    if (done[p]) return done[p]
    let result = await ask(p, { firstUser })
    if (result.ended) return result
    let parsed = objectOf(result.answer, step)
    const { from, to } = range(p)
    const own = result.turns.filter((t) => t.n >= from && t.n < to)
    if (!parsed.ok && !sentIn(own, step.messages.notADoc)) {
      result = await ask(p, { history: result.turns, followUp: step.messages.notADoc })
      if (result.ended) return result
      parsed = objectOf(result.answer, step)
    }
    const entry = {
      part: p,
      about,
      from,
      answer: result.answer,
      ...(parsed.ok ? {} : { error: parsed.error }),
      ...(parsed.droppedText ? { droppedText: parsed.droppedText } : {})
    }
    await record(entry)
    return entry
  }
  const settled = await Promise.allSettled(
    parts.map((part, p) =>
      writePart(part, p).then(
        (out) => {
          if (out.ended) stop.abort()
          return out
        },
        (error) => {
          stop.abort()
          throw error
        }
      )
    )
  )
  await saving.catch(() => {})
  const thrown = settled.find((s) => s.status === 'rejected')
  if (thrown) throw thrown.reason
  const outs = settled.map((s) => s.value)
  const ends = outs.filter((o) => o.ended).map((o) => o.ended)
  if (ends.length) return { ended: ends.find(([state]) => state !== 'cancelled') ?? ends[0] }
  const values = outs.map((o) => (o.error ? null : objectOf(o.answer, step).value))
  if (values.every((v) => v === null))
    return { notADoc: { answer: outs.at(-1).answer, error: outs.find((o) => o.error).error } }
  const value = step.mergeParts(values)
  const droppedText = outs
    .map((o) => o.droppedText)
    .filter(Boolean)
    .join('\n')
  const all = await store.turnsOf(pool, runId)
  return {
    history: all,
    written: {
      answer: JSON.stringify(value),
      turns: all,
      parsed: { ok: true, value, ...(droppedText ? { droppedText } : {}) }
    }
  }
}
