import { test } from "node:test"
import assert from "node:assert/strict"
import { encryptWithPassphrase, decryptWithPassphrase } from "../lib/crypto.js"

test("round-trip encrypt/decrypt with PBKDF2 (DSHE2 default)", () => {
  const plain = JSON.stringify({ v: 1, accounts: [{ ref: "CODEX_OAUTH_1", blob: { accessToken: "at" } }] })
  const encrypted = encryptWithPassphrase(plain, "hunter2")
  assert.match(encrypted, /^DSHE2:/)
  const decrypted = decryptWithPassphrase(encrypted, "hunter2")
  assert.equal(JSON.parse(decrypted).v, 1)
})

test("round-trip encrypt/decrypt with legacy scrypt (DSHE1)", () => {
  const plain = JSON.stringify({ v: 1, accounts: [{ ref: "CODEX_OAUTH_1", blob: { accessToken: "at" } }] })
  const encrypted = encryptWithPassphrase(plain, "hunter2", { algorithm: "scrypt" })
  assert.match(encrypted, /^DSHE1:/)
  const decrypted = decryptWithPassphrase(encrypted, "hunter2")
  assert.equal(JSON.parse(decrypted).v, 1)
})

test("round-trip encrypt/decrypt with PBKDF2 (DSHE2)", () => {
  const plain = JSON.stringify({ v: 2, pbkdf2: true })
  const encrypted = encryptWithPassphrase(plain, "hunter2", { algorithm: "pbkdf2" })
  assert.match(encrypted, /^DSHE2:/)
  const decrypted = decryptWithPassphrase(encrypted, "hunter2")
  assert.equal(JSON.parse(decrypted).pbkdf2, true)
})

test("wrong passphrase throws", () => {
  const encrypted = encryptWithPassphrase("secret", "right")
  assert.throws(() => decryptWithPassphrase(encrypted, "wrong"))
})

test("invalid format rejected", () => {
  assert.throws(() => decryptWithPassphrase("not-a-bundle", "pass"))
})
