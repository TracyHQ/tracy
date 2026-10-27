import { toBase64Url, fromBase64Url } from './base64url.js'
import { validEmail } from './beta-access.js'

const encoder = new TextEncoder()
const domain = 'beta-waitlist:v1:'
const key = (secret, usage) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

export async function signBetaToken(email, secret, now = Date.now()) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ email, exp: now + 7 * 86400_000 })))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret, 'sign'),
    encoder.encode(domain + payload)
  )
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifyBetaToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null
  try {
    const [payload, signature, extra] = token.split('.')
    if (
      !payload ||
      !signature ||
      extra ||
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret, 'verify'),
        fromBase64Url(signature),
        encoder.encode(domain + payload)
      ))
    )
      return null
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    return validEmail(body.email) &&
      Number.isSafeInteger(body.exp) &&
      body.exp > now &&
      body.exp <= now + 7 * 86400_000
      ? body.email
      : null
  } catch {
    return null
  }
}
