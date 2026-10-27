import { test } from "node:test"
import assert from "node:assert/strict"
import * as codex from "../lib/vendors/codex.js"
import * as claude from "../lib/vendors/claude.js"
import * as grok from "../lib/vendors/grok.js"

test("codex check hits models endpoint", async () => {
  let url = ""
  // need to mock readJson to work with our fake, but codex check uses readJson which does res.text()
  // Our fake returns text that is JSON, readJson will parse
  const blob = { accessToken: "at", refreshToken: "rt" }
  const cfg = codex.defaults()
  // Mock fetch to return proper text + headers.get
  const fakeFetch2 = async (u) => {
    url = u
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => k.toLowerCase()==="x-ratelimit-remaining" ? "10" : null, forEach: (_cb)=>{} },
      text: async () => JSON.stringify({ models: [{ slug: "gpt-4", display_name: "GPT-4" }] })
    }
  }
  const res = await codex.check(blob, cfg, fakeFetch2)
  assert.equal(res.ok, true)
  assert.ok(url.includes("/models"))
})

test("claude check hits profile", async () => {
  let url = ""
  const blob = { accessToken: "at" }
  const cfg = claude.defaults()
  const fakeFetch = async (u) => {
    url = u
    return {
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: ()=>{} },
      text: async () => JSON.stringify({ email: "a@b" })
    }
  }
  const res = await claude.check(blob, cfg, fakeFetch)
  assert.equal(res.ok, true)
  assert.ok(url.includes("profile"))
})

test("check does not expose token in error", async () => {
  const blob = { accessToken: "secret123", refreshToken: "rt", email: "a@b", expiresAt: Date.now()+10000 }
  // simulate check failure with 429
  const fakeFetch = async () => ({
    ok: false,
    status: 429,
    headers: { get: (k) => k==="retry-after" ? "60" : null, forEach: ()=>{} },
    clone: () => ({ text: async () => JSON.stringify({ error: "rate" }) }),
    text: async () => JSON.stringify({ error: "rate" })
  })
  const cfg = grok.defaults()
  try {
    await grok.check(blob, cfg, fakeFetch)
    assert.fail("should throw")
  } catch (e) {
    assert.equal(e.code, "RATE_LIMIT")
    assert.ok(!String(e.message).includes("secret123"))
  }
})

test("grok check uses models", async () => {
  const blob = { accessToken: "at" }
  const cfg = grok.defaults()
  const fakeFetch = async (_u) => ({
    ok: true,
    status: 200,
    headers: { get: () => null, forEach: ()=>{} },
    text: async () => JSON.stringify({ data: [{ id: "grok-4" }] })
  })
  const res = await grok.check(blob, cfg, fakeFetch)
  assert.equal(res.ok, true)
})