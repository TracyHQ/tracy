import { scryptSync, pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM with PBKDF2 (600,000 iterations, SHA-256) (DSHE2:),
// hardened scrypt (N=131072) (DSHE3:), or legacy scrypt (DSHE1:).
// Backward-compatible across all key derivation algorithms.
export function encryptWithPassphrase(plainText, passphrase, { algorithm = "pbkdf2" } = {}) {
  const salt = randomBytes(16)
  const isPbkdf2 = algorithm === "pbkdf2"
  const isHardenedScrypt = algorithm === "scrypt-v2" || algorithm === "scrypt-hardened"
  let key
  let prefix

  if (isPbkdf2) {
    key = pbkdf2Sync(String(passphrase), salt, 600000, 32, "sha256")
    prefix = "DSHE2:"
  } else if (isHardenedScrypt) {
    key = scryptSync(String(passphrase), salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
    prefix = "DSHE3:"
  } else {
    key = scryptSync(String(passphrase), salt, 32)
    prefix = "DSHE1:"
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // format: magic + salt + iv + tag + data
  return prefix + Buffer.concat([salt, iv, tag, encrypted]).toString("base64")
}

export function decryptWithPassphrase(payload, passphrase) {
  const raw = String(payload || "")
  let key
  let salt
  let iv
  let tag
  let data
  if (raw.startsWith("DSHE3:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = scryptSync(String(passphrase), salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
  } else if (raw.startsWith("DSHE2:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    // Try 600,000 iterations first (#414), fallback to legacy 100,000 iterations
    try {
      key = pbkdf2Sync(String(passphrase), salt, 600000, 32, "sha256")
      const decipher = createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
    } catch {
      key = pbkdf2Sync(String(passphrase), salt, 100000, 32, "sha256")
    }
  } else if (raw.startsWith("DSHE1:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = scryptSync(String(passphrase), salt, 32)
  } else {
    throw new Error("unknown export format")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
