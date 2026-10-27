/**
 * @param {any} body
 * @param {{ idleTimeoutMs?: number, signal?: AbortSignal }} [options]
 * @returns {AsyncGenerator<string, void, unknown>}
 */
export async function* iterateSse(body, { idleTimeoutMs = 60000, signal } = {}) {
  const reader = body && typeof body.getReader === 'function' ? body.getReader() : null
  const decoder = new TextDecoder()
  let buffer = ''
  let terminated = false

  async function* fromText(chunk) {
    if (terminated) return
    buffer += chunk
    let sep
    while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
      const dataLines = []
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith(':')) continue // SSE comments / keep-alive pings
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (!dataLines.length) continue
      const data = dataLines.join('\n')
      if (data === '[DONE]') {
        terminated = true
        yield '[DONE]'
        return
      }
      yield data
    }
  }

  async function readWithTimeout(r) {
    if (signal && signal.aborted) {
      if (typeof r.cancel === 'function') await r.cancel().catch(() => {})
      const err = new Error('stream aborted by client')
      err.name = 'AbortError'
      throw err
    }
    let timer
    const timeoutPromise = new Promise((_, reject) => {
      if (!idleTimeoutMs || idleTimeoutMs <= 0) return
      timer = setTimeout(() => {
        const err = /** @type {Error & { code?: string }} */ (new Error(`stream idle timeout: no data received for ${Math.round(idleTimeoutMs / 1000)}s`))
        err.code = 'TIMEOUT'
        reject(err)
      }, idleTimeoutMs)
    })

    let abortPromise
    let abortHandler
    if (signal) {
      abortPromise = new Promise((_, reject) => {
        abortHandler = () => {
          if (typeof r.cancel === 'function') r.cancel().catch(() => {})
          const err = new Error('stream aborted by client')
          err.name = 'AbortError'
          reject(err)
        }
        signal.addEventListener('abort', abortHandler, { once: true })
      })
    }

    try {
      const races = [r.read()]
      if (timeoutPromise) races.push(timeoutPromise)
      if (abortPromise) races.push(abortPromise)
      return await Promise.race(races)
    } finally {
      if (timer) clearTimeout(timer)
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
    }
  }

  if (reader) {
    try {
      while (!terminated) {
        const { done, value } = await readWithTimeout(reader)
        if (done) break
        yield* fromText(decoder.decode(value, { stream: true }))
        if (terminated) break
      }
      if (!terminated) {
        yield* fromText(decoder.decode())
      }
    } finally {
      if (typeof reader.cancel === 'function') await reader.cancel().catch(() => {})
    }
    return
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) {
      if (signal && signal.aborted) {
        const err = new Error('stream aborted by client')
        err.name = 'AbortError'
        throw err
      }
      if (terminated) break
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      yield* fromText(text)
      if (terminated) break
    }
    if (!terminated) {
      yield* fromText(decoder.decode())
    }
    return
  }
  const text = typeof body === 'string' ? body : await new Response(body).text()
  yield* fromText(text)
}

export function jsonSse(data) {
  try { return JSON.parse(data) } catch { return null }
}
