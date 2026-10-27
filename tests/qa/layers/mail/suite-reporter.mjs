// node:test reporter used by the suite adapters. It turns the structured events of the test runner
// into one versioned JSON-lines protocol (header, numbered records, one closing "end" record), so
// the parent never parses a human-oriented format. Anything the suites print themselves arrives as
// test:stdout / test:stderr events and is kept whole as "output" records, so it cannot corrupt the
// stream and is not lost. Error details and stacks are written in full, never truncated.
export const PROTOCOL = 'qa-mail-suite-events'
export const VERSION = 1

const detailOf = (error) => {
  if (!error) return ''
  const cause = error.cause && typeof error.cause === 'object' ? error.cause : null
  return [error.code, error.failureType, cause?.name, cause?.code, cause?.message ?? error.message]
    .filter((x) => typeof x === 'string' && x !== '')
    .join(' | ')
}

const stackOf = (error) => (error ? String(error.stack ?? error.message ?? error) : '')

export default async function* reporter(source) {
  let seq = 0
  const line = (record) =>
    `${JSON.stringify({ protocol: PROTOCOL, version: VERSION, seq: seq++, ...record })}\n`
  yield line({ type: 'header' })
  const tally = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 }
  let summary = null
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const d = event.data
      const failed = event.type === 'test:fail'
      const cancelled = failed && d.details?.error?.failureType === 'cancelledByParent'
      const type = d.details?.type ?? 'test'
      if (type === 'suite') continue
      tally.tests += 1
      if (cancelled) tally.cancelled += 1
      else if (failed) tally.fail += 1
      else if (d.skip) tally.skipped += 1
      else if (d.todo) tally.todo += 1
      else tally.pass += 1
      yield line({
        type: 'test',
        name: String(d.name),
        nesting: d.nesting,
        testNumber: d.testNumber,
        file: typeof d.file === 'string' ? d.file : null,
        ok: !failed,
        cancelled,
        skip: d.skip ? String(d.skip) : null,
        todo: d.todo ? String(d.todo) : null,
        detail: detailOf(d.details?.error),
        stack: stackOf(d.details?.error)
      })
    } else if (event.type === 'test:stdout' || event.type === 'test:stderr') {
      yield line({
        type: 'output',
        stream: event.type === 'test:stdout' ? 'stdout' : 'stderr',
        file: typeof event.data.file === 'string' ? event.data.file : null,
        data: String(event.data.message ?? '')
      })
    } else if (event.type === 'test:summary' && event.data.file === undefined) {
      summary = event.data.counts
    }
  }
  yield line({ type: 'end', counts: tally, runnerSummary: summary })
}
