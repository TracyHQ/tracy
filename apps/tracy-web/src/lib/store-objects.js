/** The artifact/shared-media object adapter, with a deadline that includes streamed response bodies. */
import { presign } from '../sites/artifacts.js'

const REQUEST_MS = 60_000
const URL_TTL_S = 300

/**
 * @param {{ endpoint: string, bucket: string, accessKey: string, secretKey: string } | null} store
 * @param {typeof fetch} fetchImpl
 * @param {{ timeoutMs?: number }} options
 * A GET returns the original streaming Response. Its fetch signal remains live after headers, so a stalled
 * body is aborted too; no whole-object buffering or early timer cleanup is needed. Every request optionally
 * accepts a caller signal. Transport failures keep the adapter's existing false/null result convention.
 */
export function storeObjects(store, fetchImpl, { timeoutMs = REQUEST_MS } = {}) {
  if (!store) return null

  async function request(method, key, { signal, ...init } = {}) {
    const deadline = AbortSignal.timeout(timeoutMs)
    const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline
    try {
      const url = await presign(store, { method, key, expiresIn: URL_TTL_S })
      bounded.throwIfAborted()
      return await fetchImpl(url, { ...init, method, signal: bounded })
    } catch {
      return null
    }
  }

  // Calls that use headers/status only must not leave an unread response holding a connection or buffer.
  function release(response) {
    void response?.body?.cancel().catch(() => {})
  }

  return {
    async publicUrl(key) {
      return store.endpoint.startsWith('https:')
        ? presign(store, { method: 'GET', key, expiresIn: URL_TTL_S })
        : null
    },
    async put(key, bytes, type, options = {}) {
      const response = await request('PUT', key, {
        ...options,
        headers: { 'content-type': type },
        body: bytes
      })
      release(response)
      return Boolean(response?.ok)
    },
    async get(key, options = {}) {
      return request('GET', key, options)
    },
    async head(key, options = {}) {
      const response = await request('HEAD', key, options)
      release(response)
      if (!response?.ok) return null
      const length = response.headers.get('content-length')
      const size = length === null ? Number.NaN : Number(length)
      return Number.isFinite(size) && size >= 0 ? { size } : null
    },
    async delete(key, options = {}) {
      const response = await request('DELETE', key, options)
      release(response)
      return Boolean(response?.ok || response?.status === 404)
    }
  }
}
