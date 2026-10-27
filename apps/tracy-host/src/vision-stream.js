/** Pull-only NDJSON: no screenshot task runs ahead of the response's bounded queue. */
export const VISION_FRAME_BYTES = 1024 * 1024
export const VISION_STREAM_BYTES = 32 * 1024 * 1024

export function visionStream(iterator, { signal, cancel, close = () => {} } = {}) {
  const encoder = new TextEncoder()
  let stopped = false
  let total = 0
  let terminal = false
  let controller
  let finishing
  const finish = () =>
    (finishing ??= (async () => {
      signal?.removeEventListener('abort', abort)
      try {
        await iterator.return?.()
      } finally {
        await close()
      }
    })())
  const abort = () => {
    if (stopped) return
    stopped = true
    cancel?.()
    void finish()
      .catch(() => {})
      .then(() => {
        try {
          controller.error(signal.reason ?? new Error('Vision capture stopped'))
        } catch {}
      })
  }
  return new ReadableStream(
    {
      start(c) {
        controller = c
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      },
      async pull(c) {
        if (stopped) return
        try {
          const next = await iterator.next()
          if (stopped) return
          if (next.done) {
            if (!terminal)
              throw Object.assign(new Error('Missing capture manifest'), { code: 'CAPTURE_INCOMPLETE' })
            stopped = true
            await finish()
            c.close()
            return
          }
          const line = encoder.encode(`${JSON.stringify(next.value)}\n`)
          if (
            terminal ||
            line.byteLength > VISION_FRAME_BYTES ||
            total + line.byteLength > VISION_STREAM_BYTES
          )
            throw Object.assign(new Error('Vision stream exceeds its byte budget'), {
              code: 'CAPTURE_BYTE_LIMIT'
            })
          total += line.byteLength
          terminal = next.value.type === 'end'
          c.enqueue(line)
        } catch (error) {
          if (stopped) return
          stopped = true
          await finish()
          c.enqueue(
            encoder.encode(
              `${JSON.stringify({ type: 'end', complete: false, reason: error?.code ?? 'CAPTURE_FAILED' })}\n`
            )
          )
          c.close()
        }
      },
      async cancel() {
        stopped = true
        cancel?.()
        await finish()
      }
    },
    { highWaterMark: VISION_FRAME_BYTES, size: (chunk) => chunk.byteLength }
  )
}

/** A finite FIFO. An expired waiter is removed, and cleanup precedes handing the next caller its slot. */
export function visionSlot(maxWaiting = 8) {
  let active = false
  const waiting = []
  const release = () => {
    const next = waiting.shift()
    if (!next) {
      active = false
      return
    }
    next.signal.removeEventListener('abort', next.abort)
    next.resolve(onceRelease())
  }
  const onceRelease = () => {
    let done = false
    return () => {
      if (done) return
      done = true
      release()
    }
  }
  return async (signal) => {
    signal.throwIfAborted()
    if (!active) {
      active = true
      return onceRelease()
    }
    if (waiting.length >= maxWaiting)
      throw Object.assign(new Error('Vision capture queue is full'), { code: 'CAPTURE_BUSY' })
    return new Promise((resolve, reject) => {
      const item = { signal, resolve, abort: null }
      item.abort = () => {
        const index = waiting.indexOf(item)
        if (index >= 0) waiting.splice(index, 1)
        reject(signal.reason)
      }
      waiting.push(item)
      signal.addEventListener('abort', item.abort, { once: true })
      if (signal.aborted) item.abort()
    })
  }
}
