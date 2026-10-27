/**
 * The `node --test` reporter of `new-test-proof.mjs`: one JSON line per event the verdict needs, and
 * a last `end` line. A file of these lines without the `end` line was cut short (the run was killed
 * or the runner died), and the tool then refuses to read a verdict out of it.
 *
 * `enqueue` and `complete` lines carry nothing but their type. The tool counts them while the run
 * is going: every case is enqueued when it is registered and completed when it ends, so "one more
 * enqueued than completed" means only the file itself is still open (`runProcess`, lingering).
 *
 * It decides nothing: classifying a failure as an assertion, an import or something else is done by
 * `classifyRun` in the tool, on these records, so the rules can be tested on hand-made lines.
 */

/** Text of any thrown value, bounded so one huge diff cannot fill the evidence directory. */
const text = (value, limit = 600) => String(value ?? '').slice(0, limit)

/** The fields of a failure that say what kind it is. */
function errorOf(error) {
  if (error === undefined || error === null) return undefined
  const cause = error.cause
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    failureType: typeof error.failureType === 'string' ? error.failureType : undefined,
    message: text(error.message),
    cause:
      cause !== undefined && cause !== null && typeof cause === 'object'
        ? {
            name: typeof cause.name === 'string' ? cause.name : undefined,
            code: typeof cause.code === 'string' ? cause.code : undefined,
            message: text(cause.message)
          }
        : cause === undefined || cause === null
          ? undefined
          : { message: text(cause) }
  }
}

export default async function* newTestProofReporter(source) {
  for await (const event of source) {
    const data = event.data ?? {}
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      yield `${JSON.stringify({
        type: event.type === 'test:pass' ? 'pass' : 'fail',
        name: text(data.name, 300),
        file: data.file,
        line: data.line,
        column: data.column,
        nesting: data.nesting,
        kind: data.details?.type,
        skip: data.skip,
        todo: data.todo,
        durationMs: data.details?.duration_ms,
        error: errorOf(data.details?.error)
      })}\n`
    } else if (event.type === 'test:enqueue' || event.type === 'test:complete') {
      // Counted only: one more enqueued than completed is the file itself, i.e. no case in flight.
      yield `${JSON.stringify({ type: event.type === 'test:enqueue' ? 'enqueue' : 'complete' })}\n`
    } else if (event.type === 'test:stderr') {
      yield `${JSON.stringify({ type: 'stderr', text: text(data.message, 2000) })}\n`
    } else if (event.type === 'test:diagnostic' && data.file !== undefined) {
      // What the runner says about a test file outside any case: an error thrown after the cases
      // ended is reported only here, never on stderr.
      yield `${JSON.stringify({ type: 'stderr', text: `${text(data.message, 2000)}\n` })}\n`
    } else if (event.type === 'test:summary' && data.file === undefined) {
      yield `${JSON.stringify({ type: 'summary', counts: data.counts, success: data.success })}\n`
    }
  }
  yield `${JSON.stringify({ type: 'end' })}\n`
}
