import test from "node:test"
import assert from "node:assert/strict"
import { pbkdf2Sync, scryptSync, createCipheriv, randomBytes } from "node:crypto"
import { exportVault, importVault, VAULT_FORMAT } from "../lib/vault.js"

test("#396 & #414: exportVault supports pbkdf2 algorithm producing DSHE2 prefix with >=600000 iterations", () => {
  const passphrase = "TestPassphrase123"
  const slots = [{ provider: "antigravity", index: 1, label: "AG Pro" }]
  const blobs = { ANTIGRAVITY_OAUTH_1: { accessToken: "tok_ag", projectId: "p-123" } }

  const res = exportVault({ slots, blobs, algorithm: "pbkdf2" }, passphrase)
  assert.equal(res.ok, true)
  assert.match(res.vault, /^DSHE2:/)
  assert.equal(res.slotCount, 1)

  const imported = importVault(res.vault, passphrase)
  assert.equal(imported.ok, true)
  assert.equal(imported.slots.length, 1)
  assert.equal(imported.blobs.ANTIGRAVITY_OAUTH_1.projectId, "p-123")
})

test("#396 & #414: exportVault defaults to hardened PBKDF2 producing DSHE2 and supports scrypt DSHE1 / DSHE3", () => {
  const passphrase = "TestPassphrase123"
  const slots = [{ provider: "codex", index: 1 }]
  const blobs = { CODEX_OAUTH_1: { accessToken: "tok_codex" } }

  const res = exportVault({ slots, blobs }, passphrase)
  assert.equal(res.ok, true)
  assert.match(res.vault, /^DSHE2:/)

  const imported = importVault(res.vault, passphrase)
  assert.equal(imported.ok, true)
  assert.equal(imported.blobs.CODEX_OAUTH_1.accessToken, "tok_codex")

  const res1 = exportVault({ slots, blobs, algorithm: "scrypt" }, passphrase)
  assert.equal(res1.ok, true)
  assert.match(res1.vault, /^DSHE1:/)
  const imported1 = importVault(res1.vault, passphrase)
  assert.equal(imported1.ok, true)
  assert.equal(imported1.blobs.CODEX_OAUTH_1.accessToken, "tok_codex")

  const res3 = exportVault({ slots, blobs, algorithm: "scrypt-v2" }, passphrase)
  assert.equal(res3.ok, true)
  assert.match(res3.vault, /^DSHE3:/)
  const imported3 = importVault(res3.vault, passphrase)
  assert.equal(imported3.ok, true)
  assert.equal(imported3.blobs.CODEX_OAUTH_1.accessToken, "tok_codex")
})

test("#414: exportVault strictly enforces minimum 12 characters passphrase", () => {
  const slots = [{ provider: "claude", index: 1 }]
  const blobs = { CLAUDE_OAUTH_1: {} }

  assert.throws(() => exportVault({ slots, blobs }, "short"), /passphrase must be at least 12 characters/)
  assert.throws(() => exportVault({ slots, blobs }, "12345678901"), /passphrase must be at least 12 characters/)
  assert.throws(() => exportVault({ slots, blobs }, ""), /passphrase must be at least 12 characters/)

  // 12 characters is accepted
  const res = exportVault({ slots, blobs }, "123456789012")
  assert.equal(res.ok, true)
})

test("#414: importVault maintains backwards compatibility with legacy 100k-iteration DSHE2 and legacy DSHE1", () => {
  const passphrase = "short" // Legacy vaults allowed short passphrases
  const slots = [{ provider: "claude", index: 1 }]
  const blobs = { CLAUDE_OAUTH_1: { token: "legacy_secret" } }
  const payloadStr = JSON.stringify({
    format: VAULT_FORMAT,
    version: "0.6.18",
    exportedAt: new Date().toISOString(),
    exportedBy: "dsh-subscriptions",
    slots,
    blobs,
  })

  // 1. Manually synthesize legacy DSHE2 with 100,000 iterations
  const salt2 = randomBytes(16)
  const key2 = pbkdf2Sync(passphrase, salt2, 100000, 32, "sha256")
  const iv2 = randomBytes(12)
  const cipher2 = createCipheriv("aes-256-gcm", key2, iv2)
  const encrypted2 = Buffer.concat([cipher2.update(payloadStr, "utf8"), cipher2.final()])
  const tag2 = cipher2.getAuthTag()
  const legacyDshe2 = "DSHE2:" + Buffer.concat([salt2, iv2, tag2, encrypted2]).toString("base64")

  const imported2 = importVault(legacyDshe2, passphrase)
  assert.equal(imported2.ok, true)
  assert.equal(imported2.blobs.CLAUDE_OAUTH_1.token, "legacy_secret")

  // 2. Manually synthesize legacy DSHE1 with scrypt
  const salt1 = randomBytes(16)
  const key1 = scryptSync(passphrase, salt1, 32)
  const iv1 = randomBytes(12)
  const cipher1 = createCipheriv("aes-256-gcm", key1, iv1)
  const encrypted1 = Buffer.concat([cipher1.update(payloadStr, "utf8"), cipher1.final()])
  const tag1 = cipher1.getAuthTag()
  const legacyDshe1 = "DSHE1:" + Buffer.concat([salt1, iv1, tag1, encrypted1]).toString("base64")

  const imported1 = importVault(legacyDshe1, passphrase)
  assert.equal(imported1.ok, true)
  assert.equal(imported1.blobs.CLAUDE_OAUTH_1.token, "legacy_secret")
})

test("#396: importVault rejects wrong passphrase for both DSHE1 and DSHE2", () => {
  const p1 = exportVault({ slots: [{ provider: "claude", index: 1 }], blobs: { CLAUDE_OAUTH_1: {} }, algorithm: "scrypt" }, "validPassphrase123")
  const p2 = exportVault({ slots: [{ provider: "claude", index: 1 }], blobs: { CLAUDE_OAUTH_1: {} }, algorithm: "pbkdf2" }, "validPassphrase123")

  assert.throws(() => importVault(p1.vault, "wrongPassphrase123"), /invalid passphrase/)
  assert.throws(() => importVault(p2.vault, "wrongPassphrase123"), /invalid passphrase/)
})
