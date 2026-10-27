import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as copilot from "../lib/vendors/copilot.js"
import { discoverLocalCliSessions, loadLocalCliBlob } from "../lib/import-auth.js"
import { displayName } from "../lib/refs.js"

test("copilot displayName returns GitHub Copilot", () => {
  assert.equal(displayName("copilot"), "GitHub Copilot")
})

test("copilot listModels returns catalog including o1 and claude-3.7-sonnet", async () => {
  const models = await copilot.listModels()
  assert.ok(Array.isArray(models))
  const ids = models.map((m) => m.id)
  assert.ok(ids.includes("claude-3.7-sonnet"))
  assert.ok(ids.includes("gpt-4o"))
  assert.ok(ids.includes("o1"))
})

test("copilot local CLI session discovery from hosts.json", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "copilot-test-"))
  try {
    const copilotDir = join(tmp, ".config", "github-copilot")
    mkdirSync(copilotDir, { recursive: true })
    writeFileSync(join(copilotDir, "hosts.json"), JSON.stringify({
      "github.com": {
        user: "octocat",
        oauth_token: "ghu_dummy_token_123"
      }
    }))

    const sessions = await discoverLocalCliSessions({ home: tmp })
    assert.ok(sessions.copilot)
    assert.equal(sessions.copilot.provider, "copilot")
    assert.equal(sessions.copilot.email, "octocat")

    const blob = await loadLocalCliBlob("copilot", { home: tmp })
    assert.equal(blob.accessToken, "ghu_dummy_token_123")
    assert.equal(blob.email, "octocat")
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
