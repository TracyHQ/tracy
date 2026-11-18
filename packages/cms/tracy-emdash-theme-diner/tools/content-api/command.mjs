// The canonical Content API command and the authority it may carry. Pure: no EmDash imports, so
// the alias middleware, the native route and the tests share one definition.
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const NATIVE_PATH = '/_emdash/api/content/tracy-content-v1.json'
// Internal headers the alias sets on its own GET rewrite. A caller cannot rely on them: the alias
// strips them from every request it forwards, and the route honours them only for the relay PAT.
export const PRINCIPAL_HEADER = 'x-tracy-content-principal'
export const SCOPE_HEADER = 'x-tracy-content-scope'
const KEYS = ['action', 'params', 'contentPrincipal', 'contentScope']
const SCOPES = ['published', 'editorial']

export class CommandError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}
const bad = () => {
  throw new CommandError(400, 'CONTENT_BAD_QUERY')
}

// Canonical POST body -> flat query params and the authority it names. Shape only: whether the
// caller may name that authority is `relayTrusted`'s question, answered by the route.
export function commandOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad()
  if (Object.keys(input).some((k) => !KEYS.includes(k))) bad()
  if (input.action !== 'content.read') bad()
  const { params } = input
  if (!params || typeof params !== 'object' || Array.isArray(params)) bad()
  const flat = {}
  for (const [k, v] of Object.entries(params)) {
    if (!['string', 'number'].includes(typeof v)) bad()
    flat[k] = String(v)
  }
  return { params: flat, ...authorityOf(input.contentPrincipal, input.contentScope) }
}

export function authorityOf(contentPrincipal, contentScope) {
  if (typeof contentPrincipal !== 'string' || !/^seat:[0-9a-f]{64}$/.test(contentPrincipal)) bad()
  if (!SCOPES.includes(contentScope)) bad()
  return { contentPrincipal, contentScope }
}

// True only when the Bearer credential is the relay PAT whose SHA-256 (hex) the server configured.
export function relayTrusted(authorization, expectedHex) {
  if (typeof expectedHex !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHex)) return false
  const credential = String(authorization ?? '').replace(/^Bearer /, '')
  if (!credential) return false
  const actual = createHash('sha256').update(credential).digest('hex')
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHex))
}

// Where a site keeps the relay PAT digest when its environment does not carry it: beside the
// application (cwd), written by a root exec at provision. Only a root-owned file that neither group
// nor others can write counts, so the site user and an agent shell running as it cannot swap in
// the digest of a token they hold.
export const RELAY_DIGEST_FILE = 'tracy-content-relay.sha256'
export function relayDigest(env, { dir = process.cwd(), ownerUid = 0 } = {}) {
  if (env.TRACY_CONTENT_API_RELAY_TOKEN_SHA256) return env.TRACY_CONTENT_API_RELAY_TOKEN_SHA256
  try {
    const file = path.join(dir, RELAY_DIGEST_FILE)
    const held = statSync(file)
    if (!held.isFile() || held.uid !== ownerUid || held.mode & 0o022) return null
    return readFileSync(file, 'utf8').trim()
  } catch {
    return null
  }
}

// The authority a GET on the native route runs under. No authority headers: the published
// projection with no principal. Authority headers from anyone but the relay PAT: refused, never
// silently downgraded, so a forged header is as visible as a forged body field.
export function requestAuthority(headers, env, digest = () => relayDigest(env)) {
  const principal = headers.get(PRINCIPAL_HEADER)
  const scope = headers.get(SCOPE_HEADER)
  if (principal === null && scope === null) return { contentPrincipal: null, contentScope: 'published' }
  if (!relayTrusted(headers.get('authorization'), digest())) throw new CommandError(403, 'CONTENT_FORBIDDEN')
  const authority = authorityOf(principal, scope)
  if (authority.contentScope === 'editorial' && env.TRACY_CONTENT_API_NATIVE_EDITORIAL_PROBE !== '1')
    throw new CommandError(403, 'CONTENT_FORBIDDEN')
  return authority
}

// The internal GET the alias hands to the native route for one /content.json request. POST carries
// the canonical command; GET keeps its own query. Caller-supplied authority headers never pass.
export function internalRequest(url, method, headers, body) {
  const target = new URL(url)
  target.pathname = NATIVE_PATH
  const forwarded = new Headers(headers)
  forwarded.delete(PRINCIPAL_HEADER)
  forwarded.delete(SCOPE_HEADER)
  forwarded.delete('content-type')
  forwarded.delete('content-length')
  if (method === 'POST') {
    const command = commandOf(body)
    target.search = new URLSearchParams(command.params).toString()
    forwarded.set(PRINCIPAL_HEADER, command.contentPrincipal)
    forwarded.set(SCOPE_HEADER, command.contentScope)
  } else if (method !== 'GET') throw new CommandError(405, 'CONTENT_BAD_QUERY')
  return new Request(target, { method: 'GET', headers: forwarded })
}
