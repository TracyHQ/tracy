/**
 * `GET /api/build` — which build of this tracy-web server answers: the full commit it was built
 * from and when (Settings › Help & about shows the date and seven characters, labelled "Server").
 *
 * The two values are baked into the image at its last lines (`apps/tracy-web/Dockerfile`,
 * `TRACY_SOURCE_COMMIT`, `TRACY_BUILT_AT`). An image the CI reuses because its build context did not
 * change keeps the values of the build that made it — so the label is the artifact that runs, not
 * the newest merge. A value that is missing or not of its shape answers null; the page then shows
 * no label rather than a guess.
 *
 * Signed in only: a person who never entered the app has no use for the commit.
 */
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'

// The web download button opens tracy.ai/download, which offers the public stable release.
const DEFAULT_DESKTOP_RELEASE_FEED = 'https://update.tracy.ai/desktop/stable-mac.yml'

/** Read only the root version field from the bounded, generated stable channel file. */
async function downloadVersion(fetchImpl, feed) {
  try {
    const response = await fetchImpl(feed, { signal: AbortSignal.timeout(4000) })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return null
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = '',
      bytes = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 65536) return null
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const versions = [...text.matchAll(/^version:[ \t]*["']?(\d+\.\d+\.\d+)["']?[ \t]*\r?$/gm)]
    return versions.length === 1 ? versions[0][1] : null
  } catch {
    return null
  }
}

const SHA = /^[0-9a-f]{40}$/

/** @param {unknown} raw */
function commitOf(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return SHA.test(value) ? value : null
}

/** @param {unknown} raw - an ISO-8601 UTC time such as `2026-10-09T08:12:00Z`. */
function builtAtOf(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(raw.trim()))
    return null
  const at = new Date(raw.trim())
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/**
 * @param {{ config: { sessionSecret: string, desktopReleaseFeed?: string }, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} deps
 * @returns {import('hono').Hono}
 */
export function buildInfoRoutes({ config, env = process.env, fetchImpl = fetch }) {
  let cachedVersion = null,
    expires = 0,
    pending = null
  const desktopVersion = () => {
    if (Date.now() < expires) return Promise.resolve(cachedVersion)
    if (pending) return pending
    pending = downloadVersion(fetchImpl, config.desktopReleaseFeed ?? DEFAULT_DESKTOP_RELEASE_FEED)
      .then((version) => {
        cachedVersion = version
        expires = Date.now() + (version ? 60000 : 10000)
        return version
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
  const app = new Hono()
  app.get('/api/build', async (c) => {
    c.header('cache-control', 'no-store')
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    return json(c, {
      commit: commitOf(env.TRACY_SOURCE_COMMIT),
      builtAt: builtAtOf(env.TRACY_BUILT_AT),
      desktopVersion: await desktopVersion()
    })
  })
  return app
}
