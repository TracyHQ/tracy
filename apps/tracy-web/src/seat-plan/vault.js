/** Account-owned OAuth credentials, envelope encrypted independently of session cookies. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export function createVault(encodedKey) {
  const key = Buffer.from(encodedKey || '', 'base64')
  if (key.length !== 32) throw new Error('SEAT_PLAN_DISABLED')
  const aad = (who, kind) =>
    Buffer.from(JSON.stringify(['subscription:v1', who.account, who.id, who.provider, kind]))
  function encrypt(secret, value, context) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', secret, iv)
    cipher.setAAD(context)
    return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString('base64')
  }
  function decrypt(secret, value, context) {
    const bytes = Buffer.from(value, 'base64')
    const cipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12))
    cipher.setAAD(context)
    cipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()])
  }
  return {
    seal(who, value) {
      const dek = randomBytes(32)
      return {
        wrapped: encrypt(key, dek, aad(who, 'key')),
        sealed: encrypt(dek, Buffer.from(JSON.stringify(value)), aad(who, 'token'))
      }
    },
    open(who, value) {
      const dek = decrypt(key, value.wrapped, aad(who, 'key'))
      return JSON.parse(decrypt(dek, value.sealed, aad(who, 'token')).toString('utf8'))
    }
  }
}
