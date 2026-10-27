/**
 * The Ed25519 signature on a channel file — the one thing that lets an update be trusted.
 *
 * Windows and Linux builds are not code-signed (decision D1, tasks/todo-desktop-windows.md), so the
 * installer electron-updater downloads carries nothing that says who made it; HTTPS and the sha512 in
 * the channel file only prove the bytes match what the feed says, and whoever can write the feed can
 * write both. So publish signs every channel file with Tracy's own key (`build/release.mjs`), and the
 * app accepts a channel file only when that signature verifies against a public key pinned in the app
 * (`src/feed-key.js`) — before electron-updater sees a version or a file (`src/signed-feed-provider.js`).
 * The channel file lists every artifact's sha512 and size, and electron-updater checks the downloaded
 * file against that sha512, so the signature covers the version AND the bytes installed. Mac does the
 * same on top of Developer ID + notarization.
 *
 * What is signed: `tracy-desktop-feed-v1\n<channel file name>\n` followed by the channel file's exact
 * bytes. The name binds the signature to one channel, one platform and one arch: the dev Mac feed,
 * correctly signed, cannot be served as the stable Windows one. The signature file `<channel file>.sig`
 * holds the 64-byte signature in base64 and a newline.
 *
 * Shared by the app (verify) and the release tooling (sign), with no Electron here, so `node --test`
 * covers it (test/feed-signature.test.mjs).
 */
const { createPublicKey, sign, verify } = require('node:crypto')

const CONTEXT = 'tracy-desktop-feed-v1'
/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32-byte raw key follows it. */
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/**
 * @param {string} channelFile - e.g. `stable.yml`, `dev-mac.yml`, `stable-linux-arm64.yml`.
 * @param {string | Buffer} text - the channel file, exactly as served.
 */
function message(channelFile, text) {
  return Buffer.concat([Buffer.from(`${CONTEXT}\n${channelFile}\n`, 'utf8'), Buffer.from(text)])
}

/**
 * @param {{ channelFile: string, text: string | Buffer, privateKey: import('node:crypto').KeyObject }} input
 * @returns {string} the content of `<channelFile>.sig`.
 */
function signFeed({ channelFile, text, privateKey }) {
  return `${sign(null, message(channelFile, text), privateKey).toString('base64')}\n`
}

/** @param {string} text - a pinned key: the raw 32-byte public key in base64. */
function publicKeyFrom(text) {
  const raw = Buffer.from(String(text), 'base64')
  if (raw.length !== 32) return null
  try {
    return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

/**
 * Does `signature` sign this channel file with one of the pinned keys? Never throws: every refusal
 * says why, for the updater log.
 * @param {{ channelFile: string, text: string | Buffer, signature: string | undefined, publicKeys: readonly string[] }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function verifyFeed({ channelFile, text, signature, publicKeys }) {
  if (!Array.isArray(publicKeys) || publicKeys.length === 0)
    return { ok: false, reason: 'no feed key is pinned in this build' }
  const sigText = typeof signature === 'string' ? signature.trim() : ''
  if (sigText === '') return { ok: false, reason: `no signature for ${channelFile}` }
  const sig = /^[A-Za-z0-9+/]+={0,2}$/.test(sigText) ? Buffer.from(sigText, 'base64') : Buffer.alloc(0)
  if (sig.length !== 64) return { ok: false, reason: `${channelFile}.sig is not an Ed25519 signature` }
  const signed = message(channelFile, text)
  for (const pinned of publicKeys) {
    const key = publicKeyFrom(pinned)
    if (key === null)
      return { ok: false, reason: `pinned key ${String(pinned).slice(0, 12)}… is not an Ed25519 public key` }
    if (verify(null, signed, key, sig)) return { ok: true }
  }
  return { ok: false, reason: `the signature of ${channelFile} does not match it under any pinned key` }
}

/**
 * The text `src/feed-key.js` pins for a public key: the raw 32 bytes in base64.
 * @param {import('node:crypto').KeyObject} publicKey
 */
function publicKeyText(publicKey) {
  return publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length).toString('base64')
}

module.exports = { signFeed, verifyFeed, publicKeyText }
