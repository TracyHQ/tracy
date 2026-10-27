/**
 * The signed assertion tracy-web sends a site's own copy about who is viewing it.
 *
 * 🔒 WHY SIGNED. Every site's web container could reach every other one over a shared Docker
 * network, and the CMS plugins believed bare `x-tracy-email/tier/role` headers: code running in one
 * site could become administrator of another. The verifiers (`tracy-access.php`, Joomla
 * `TracyAccess`) now believe only this assertion, HMAC-signed with a 32-byte key that belongs to ONE
 * site. Code inside a site can read that site's key, which gains it nothing it does not already own.
 *
 * Contract (tasks/todo-tch-opensource.md "Signature contract"; vectors in
 * packages/fleet/tracy-fleet-operation/test/fixtures/access-signature-vectors.json):
 * - `x-tracy-assert` = base64url (no padding) of canonical JSON — keys sorted, no whitespace, UTF-8 —
 *   of `{v:1, kid, site, email, role, tier, host, method, target, iat, exp, nonce}`;
 * - `x-tracy-sig` = base64url HMAC-SHA256(key, "tracy-site-access.v1." + x-tracy-assert);
 * - `host` is the host the CMS sees after the proxy's rewrite (`x-forwarded-host`), `target` the path
 *   and query sent; identity only, the body is not covered;
 * - lives 30 s (verifiers allow ≤ 60 s plus 30 s skew), and every request — retries included — gets a
 *   fresh nonce, which a verifier accepts once.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const ASSERT_HEADER = 'x-tracy-assert'
export const SIG_HEADER = 'x-tracy-sig'
const CONTEXT = 'tracy-site-access.v1.'
const TTL_S = 30
const LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/

/** Canonical JSON of a flat object: keys sorted, no whitespace. */
function canonicalJson(claims) {
  return `{${Object.keys(claims)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(claims[k])}`)
    .join(',')}}`
}

/** `{assert, sig}` for these claims under `key` (a 32-byte Buffer). */
export function signAssertion(claims, key) {
  const assert = Buffer.from(canonicalJson(claims), 'utf8').toString('base64url')
  const sig = createHmac('sha256', key)
    .update(CONTEXT + assert)
    .digest('base64url')
  return { assert, sig }
}

/** The two headers vouching for one request to one site. `now` in milliseconds. */
export function siteAccessHeaders({
  site,
  kid,
  key,
  email,
  role,
  tier,
  host,
  method,
  target,
  now = Date.now()
}) {
  const iat = Math.floor(now / 1000)
  const claims = {
    v: 1,
    kid,
    site,
    email: email ?? '',
    role: role ?? '',
    tier,
    host,
    method,
    target,
    iat,
    exp: iat + TTL_S,
    nonce: randomBytes(16).toString('base64url')
  }
  const { assert, sig } = signAssertion(claims, key)
  return { [ASSERT_HEADER]: assert, [SIG_HEADER]: sig }
}

/**
 * The key of one site, `{site, kid, key}`, from `<dir>/<label>/key.json` (written on the host by
 * `tools/issue-site-access-key.sh`), or null when there is none or it is not exactly what that tool
 * writes. Null means the site is sent no assertion — never an assertion under a guessed key.
 */
export function readSiteAccessKey(dir, label) {
  if (!dir || typeof label !== 'string' || !LABEL.test(label)) return null
  try {
    const doc = JSON.parse(readFileSync(path.join(dir, label, 'key.json'), 'utf8'))
    const key = typeof doc?.key === 'string' ? Buffer.from(doc.key, 'base64url') : null
    if (doc.v !== 1 || doc.site !== label || typeof doc.kid !== 'string' || !doc.kid) return null
    if (!key || key.length !== 32) return null
    return { site: label, kid: doc.kid, key }
  } catch {
    return null
  }
}

/**
 * `readSiteAccessKey` behind a cache keyed on the file's mtime, so a request costs one stat and a
 * rotated key (restore, re-issue) is picked up on the next request.
 */
export function siteAccessKeys(dir) {
  const cache = new Map()
  return (label) => {
    if (!dir || typeof label !== 'string' || !LABEL.test(label)) return null
    let mtime
    try {
      mtime = statSync(path.join(dir, label, 'key.json')).mtimeMs
    } catch {
      cache.delete(label)
      return null
    }
    const hit = cache.get(label)
    if (hit && hit.mtime === mtime) return hit.value
    const value = readSiteAccessKey(dir, label)
    cache.set(label, { mtime, value })
    return value
  }
}
