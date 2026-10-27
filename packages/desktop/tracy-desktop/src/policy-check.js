/**
 * Read the minimum version policy straight from the feed (tasks/todo-desktop-update-policy.md C6):
 * the channel file and its `.sig`, the signature verified against the pinned keys exactly as the
 * signed provider does (src/signed-feed-provider.js), then the policy lines (src/feed-policy.js).
 *
 * Separate from electron-updater on purpose: a policy check is light metadata and runs even with
 * automatic checks off, and it must never start a download. Outcomes:
 *   ok           the file verified; `policy` is its policy, or null when it carries none;
 *   refused      it did not verify, or its policy lines are malformed — nothing taken from it;
 *   unreachable  no answer, or not a 200 (offline, the feed down).
 */
const { verifyFeed } = require('./feed-signature.js')
const { readPolicy } = require('./feed-policy.js')

/** A hung request gives up after this long; the caller's own wait (1.5 s at start) is shorter. */
const FETCH_TIMEOUT_MS = 30_000

/**
 * @param {{ fetch: (url: string, init: object) => Promise<{ ok: boolean, status: number, text: () => Promise<string> }>,
 *   feedUrl: string, channelFile: string, publicKeys: readonly string[], timeoutMs?: number }} deps
 * @returns {Promise<{ kind: 'ok', policy: object | null } | { kind: 'refused' | 'unreachable', reason: string }>}
 */
async function fetchFeedPolicy({ fetch, feedUrl, channelFile, publicKeys, timeoutMs = FETCH_TIMEOUT_MS }) {
  const base = `${String(feedUrl).replace(/\/+$/, '')}/`
  const get = async (name) => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      const answer = await fetch(new URL(name, base).href, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
        ...(controller ? { signal: controller.signal } : {})
      })
      return { status: answer.status, ok: answer.ok, text: answer.ok ? await answer.text() : '' }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  let file
  let sig
  try {
    file = await get(channelFile)
    if (!file.ok) return { kind: 'unreachable', reason: `${channelFile}: HTTP ${file.status}` }
    sig = await get(`${channelFile}.sig`)
  } catch (error) {
    return { kind: 'unreachable', reason: error?.message ?? String(error) }
  }
  if (sig.status === 404) return { kind: 'refused', reason: `${channelFile}.sig is missing` }
  if (!sig.ok) return { kind: 'unreachable', reason: `${channelFile}.sig: HTTP ${sig.status}` }
  const verdict = verifyFeed({ channelFile, text: file.text, signature: sig.text, publicKeys })
  if (!verdict.ok) return { kind: 'refused', reason: `signature: ${verdict.reason}` }
  try {
    return { kind: 'ok', policy: readPolicy(file.text) }
  } catch (error) {
    return { kind: 'refused', reason: `policy: ${error.message}` }
  }
}

module.exports = { fetchFeedPolicy }
