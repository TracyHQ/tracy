/**
 * Time bounds of the build chat's research of the owner's words (#609): the business reading's model call stops at
 * one deadline, and a call still going when its time passes ends as `timeout`.
 */

/** A fetch whose every call also stops at `signal`. */
export function boundedFetch(fetchImpl, signal) {
  return (input, init = {}) =>
    fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal })
}

/** The answer of `run()`, or `{timedOut: true}` once `ms` has passed. */
export async function withinTime(run, ms) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, ms))
  })
  try {
    return await Promise.race([run(), late])
  } finally {
    clearTimeout(timer)
  }
}
