/**
 * Encrypting a credential this deployment holds on somebody else's behalf — AES-256-GCM, with the
 * key derived from `SESSION_SECRET`.
 *
 * WHY THIS EXISTS. Until now every credential this app reads arrived in the environment and stayed
 * there; nothing was ever written down. The Model & AI screen changes that: an administrator types
 * a provider's API key into a browser and it lands in Postgres. A key at rest in a shared database
 * that `/ops` can read is a different risk from a key in `/etc/tracy/tracy-web.env` on one machine,
 * and it deserves more than a base64 wrapper that looks like protection.
 *
 * 🔒 GCM, NOT CBC OR A BARE STREAM — because the threat here is not only reading. A row can be
 * EDITED by anything that reaches the database, and an unauthenticated cipher decrypts an edited
 * row into a different string with no error at all; that string would then be sent to a provider
 * as if it were the key somebody typed. GCM's tag turns that into a refusal (`openSecret` → null).
 *
 * 🔒 A FRESH IV EVERY SEAL, so the same key sealed twice gives two different ciphertexts. A
 * deterministic box would let anybody holding the table learn that two providers share one key, or
 * that a key did NOT change between revisions, without opening anything.
 *
 * ⚠ THE COST, STATED PLAINLY: rotating `SESSION_SECRET` makes every sealed key unopenable, and the
 * screen will show those providers as having no key. That is recoverable (type them again) and it
 * is the honest failure — the alternative is a second long-lived secret to manage, and a
 * deployment that has one more thing to lose.
 *
 * ⚠ AND IT IS NOT A SECRET FROM THE SERVER. This process can open every row it sealed; the box
 * protects a database dump, a backup, and a replica — not an attacker who already runs this code.
 * Restricting who may read a key through the DOOR (`owner`/`admin` only) is the other half, and
 * it lives in the route, not here.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/** `v1` names the scheme, not the key: a later scheme can be added beside this one and old rows
 * keep opening, because every row says which reader it needs. */
const SCHEME = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * A key for THIS purpose, derived rather than used directly.
 *
 * `SESSION_SECRET` already signs session cookies; handing the same bytes to a cipher would make
 * one secret do two unrelated jobs, and a weakness found in either use would apply to both. HKDF
 * with a purpose string keeps them independent — the derived key is useless for forging a session
 * and the session key is useless for opening a box.
 */
function keyFor(secret) {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'tracy:secret-box:v1', 32)
  )
}

const b64 = (buf) => Buffer.from(buf).toString('base64url')

/**
 * @param {string} value - the credential. Empty is REFUSED, not stored: "no key" must be the
 *   absence of a value, never a sealed empty string that makes `configured` read true for a
 *   provider which cannot authenticate anything.
 * @param {string} secret - this deployment's `SESSION_SECRET`.
 * @returns {Promise<string>} `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */
export async function sealSecret(value, secret) {
  if (typeof value !== 'string' || value === '')
    throw new Error('sealSecret: refusing to seal an empty value')
  if (typeof secret !== 'string' || secret === '') throw new Error('sealSecret: no secret')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [SCHEME, b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.')
}

/**
 * @returns {Promise<string|null>} the value, or `null` for anything this reader cannot open —
 *   a row from a scheme it does not know, a row sealed under a different secret, a tampered row,
 *   or a malformed one. NEVER a throw: every caller is drawing a screen or building a request, and
 *   a credential that cannot be read is a feature that is off, not a crash.
 */
export async function openSecret(sealed, secret) {
  if (typeof sealed !== 'string' || typeof secret !== 'string' || secret === '') return null
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== SCHEME) return null
  try {
    const [, ivB64, tagB64, bodyB64] = parts
    const iv = Buffer.from(ivB64, 'base64url')
    const tag = Buffer.from(tagB64, 'base64url')
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64url')), decipher.final()]).toString(
      'utf8'
    )
  } catch {
    // `decipher.final()` throws when the tag does not match — that is the check working, not an
    // error to report. Same answer as a row from an unknown scheme: this reader cannot open it.
    return null
  }
}

/**
 * What a screen may show about a key it must never print: enough to recognise which credential is
 * in place across a rotation, never enough to use it. Same shape the Settings screen already uses
 * for `MODEL_API_KEY`.
 */
export function hintFor(value) {
  if (typeof value !== 'string' || value === '') return null
  // Three characters name the vendor's prefix (`sk-`); more would hand a short key's entropy to a screenshot.
  return `${value.slice(0, 3)}… (${value.length} chars)`
}
