/** Bound picture dependencies that do not themselves accept an AbortSignal. */
export async function pictureDeadline(work, signal) {
  signal?.throwIfAborted()
  if (!signal) return work()
  let stop
  const aborted = new Promise((_, reject) => {
    stop = () => reject(signal.reason ?? new Error('the picture took too long'))
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted()
        return work()
      }),
      aborted
    ])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}
