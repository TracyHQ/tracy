/** Session tokens bind listening and speaking without mixing concurrent browser tabs. */
import { randomUUID } from 'node:crypto'
const sessions = new Map()
const TTL = 30 * 60_000
let latest = null
function prune(now) {
  for (const [id, row] of sessions) if (row.until < now) sessions.delete(id)
}
export function bindSpeechSession(email, snapshot, now = Date.now()) {
  prune(now)
  const id = randomUUID()
  sessions.set(id, { email: email.toLowerCase(), snapshot, until: now + TTL })
  latest = {
    id,
    revision: snapshot.revision,
    primaryProvider: snapshot.primaryProvider ?? snapshot.provider,
    actualProvider: snapshot.provider,
    fallbackUsed: Boolean(snapshot.fallbackUsed),
    status: 'listening',
    at: now,
    reason: null
  }
  return id
}
/** An unknown token, changed configuration, or ambiguous legacy client must restart. */
export function resolveSpeechSession(email, revision, token, now = Date.now()) {
  prune(now)
  const mine = [...sessions.values()].filter((row) => row.email === email.toLowerCase())
  if (token !== undefined) {
    const row = typeof token === 'string' ? sessions.get(token) : null
    return row?.email === email.toLowerCase() && row.snapshot.revision === revision
      ? { ok: true, snapshot: row.snapshot }
      : { ok: false }
  }
  if (!mine.length) return { ok: true, snapshot: null }
  if (
    mine.some(
      (row) => row.snapshot.revision !== revision || row.snapshot.provider !== mine[0].snapshot.provider
    )
  )
    return { ok: false }
  return { ok: true, snapshot: mine[0].snapshot }
}
export function speechSessionMatches(email, revision, now = Date.now()) {
  return resolveSpeechSession(email, revision, undefined, now).ok
}
export function activeSpeechSession(email, now = Date.now()) {
  prune(now)
  const mine = [...sessions.values()].filter((row) => row.email === email.toLowerCase())
  return mine.length === 1 ? mine[0].snapshot : null
}
/** Deployment-level provider facts; no account or session token is exposed. */
export function speechRuntimeFacts(revision) {
  if (!latest || latest.revision !== revision) return null
  const { id: _id, ...facts } = latest
  return facts
}
export function endSpeechSession(id, reason, now = Date.now()) {
  if (latest?.id === id) latest = { ...latest, status: 'ended', reason, endedAt: now }
}
