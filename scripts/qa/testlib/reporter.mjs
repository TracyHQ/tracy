/**
 * `node --test` reporter used by `rerun`: one JSON line per finished test (and one per diagnostic),
 * so the run's result is read as data, not scraped from text.
 *   { t: 'test', name, file, nesting, ok, skip, todo, ms, error?: { code, codes, message, failureType } }
 *   { t: 'stderr', file, message }   { t: 'diagnostic', message }
 * Exports: default async function* reporter(source)
 */
const MAX = 4000

/** The test's own error (node wraps it as ERR_TEST_FAILURE) and the codes down its cause chain. */
function errorOf(details) {
  const err = details?.error
  if (!err) return undefined
  const own = err.failureType === 'testCodeFailure' && err.cause ? err.cause : err
  const codes = []
  for (let e = own, i = 0; e && typeof e === 'object' && i < 5; e = e.cause, i++)
    if (e.code) codes.push(e.code)
  return {
    failureType: err.failureType ?? null,
    code: codes[0] ?? err.code ?? null,
    codes,
    message: String(own?.message ?? err.message ?? err).slice(0, MAX)
  }
}

export default async function* reporter(source) {
  for await (const event of source) {
    const { type, data } = event
    if (type === 'test:pass' || type === 'test:fail') {
      if (data.details?.type === 'suite') continue
      yield `${JSON.stringify({
        t: 'test',
        name: data.name,
        file: data.file ?? null,
        nesting: data.nesting,
        ok: type === 'test:pass',
        skip: Boolean(data.skip),
        todo: Boolean(data.todo),
        ms: data.details?.duration_ms ?? null,
        ...(type === 'test:fail' ? { error: errorOf(data.details) } : {})
      })}\n`
    } else if (type === 'test:stderr') {
      // A file that fails to load (ERR_MODULE_NOT_FOUND...) says why only on its stderr.
      yield `${JSON.stringify({ t: 'stderr', file: data.file ?? null, message: String(data.message).slice(0, MAX) })}\n`
    } else if (type === 'test:diagnostic') {
      yield `${JSON.stringify({ t: 'diagnostic', message: String(data.message).slice(0, MAX) })}\n`
    }
  }
}
