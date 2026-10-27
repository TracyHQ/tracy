import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid campaign key')
}

function associatedData(context) {
  if (
    !context ||
    !UUID.test(context.campaignId) ||
    !UUID.test(context.recordId) ||
    typeof context.purpose !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(context.purpose) ||
    !Number.isSafeInteger(context.version) ||
    context.version < 1
  )
    throw new Error('Invalid encryption context')
  return Buffer.from(
    JSON.stringify([
      'invitations-real',
      1,
      context.campaignId,
      context.recordId,
      context.purpose,
      context.version
    ])
  )
}

function decode(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value))
    throw new Error('Invalid encrypted payload')
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.toString('base64url') !== value || (length !== undefined && bytes.length !== length)) {
    throw new Error('Invalid encrypted payload')
  }
  return bytes
}

export function seal({ key, context, bytes }) {
  requireKey(key)
  if (!(bytes instanceof Uint8Array)) throw new Error('Invalid encryption input')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(associatedData(context))
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    bytes: ciphertext.toString('base64url')
  }
}

export function open({ key, context, envelope }) {
  requireKey(key)
  if (!envelope || envelope.v !== 1) throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', key, decode(envelope.iv, 12))
  decipher.setAAD(associatedData(context))
  decipher.setAuthTag(decode(envelope.tag, 16))
  return Buffer.concat([decipher.update(decode(envelope.bytes)), decipher.final()])
}

/** Inputs are normalized by the identity importer, not silently rewritten here. */
export function identityKey({ indexKey, kind, value }) {
  requireKey(indexKey)
  if (
    !['email', 'member'].includes(kind) ||
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value) > 16384
  ) {
    throw new Error('Invalid identity index input')
  }
  return createHmac('sha256', indexKey)
    .update(JSON.stringify(['invitations-real-identity', 1, kind, value]))
    .digest('base64url')
}
