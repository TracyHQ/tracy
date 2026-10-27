/**
 * Deliberately a duplicate of `apps/tracy-web/src/lib/hmac.js`, not an import — the two apps must
 * never import each other (RULE #1: two npm-boundary halves of one migration, not one package
 * split in two). `test/auth.test.mjs` is what proves this file and the web app's copy still agree
 * byte for byte, by signing with one and verifying with the other; that test would say nothing if
 * this file just re-exported the same module.
 */
const encoder = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}
