import { test } from "node:test"
import assert from "node:assert/strict"
import { isAllowed, ALLOWLIST, createSubscriptionsService } from "../lib/subscriptions.js"

test("allowlist per provider", () => {
  assert.equal(isAllowed("codex", "/responses"), true)
  assert.equal(isAllowed("codex", "/models"), true)
  assert.equal(isAllowed("codex", "/images/generations"), true)
  assert.equal(isAllowed("codex", "/v1/messages"), false)
  assert.equal(isAllowed("claude", "/v1/messages"), true)
  assert.equal(isAllowed("claude", "/responses"), false)
  assert.equal(isAllowed("grok", "/v1/billing"), true)
  assert.equal(isAllowed("antigravity", "/v1/loadCodeAssist"), true)
  assert.equal(isAllowed("codex", "/evil"), false)
  assert.equal(isAllowed("codex", "https://chatgpt.com/backend-api/codex/images/generations"), true)
  assert.equal(isAllowed("unknown", "/responses"), false)
})

test("allowlist is provider table not code", () => {
  assert.ok(Array.isArray(ALLOWLIST.codex))
  assert.ok(ALLOWLIST.codex.includes("/responses"))
  // add new path to existing provider without touching logic
  const before = ALLOWLIST.codex.length
  ALLOWLIST.codex.push("/new-test-path")
  assert.equal(isAllowed("codex", "/new-test-path"), true)
  ALLOWLIST.codex.pop()
  assert.equal(ALLOWLIST.codex.length, before)
})

test("subscriptions available returns providers", async () => {
  const fakeStore = {
    async listAccounts(provider) {
      if (provider === "codex") return [{ hasToken: true }]
      return []
    }
  }
  const svc = createSubscriptionsService({
    listAccounts: (p) => fakeStore.listAccounts(p),
    loadBlob: async () => { throw new Error("no") },
    ensureFresh: async () => ({}),
    vendorConfig: () => ({}),
    cooldownMs: () => 30*60*1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    fetchImpl: fetch,
  })
  const avail = await svc.available()
  assert.deepEqual(avail, ["codex"])
  assert.equal(await svc.available("codex"), true)
  assert.equal(await svc.available("claude"), false)
})

test("subscriptions request rejects disallowed path", async () => {
  const svc = createSubscriptionsService({
    listAccounts: async () => [{ hasToken: true, ref: "CODEX_OAUTH_1", quota: null, cooldownUntil: 0 }],
    loadBlob: async () => ({ accessToken: "at", refreshToken: "rt", expiresAt: Date.now()+100000 }),
    ensureFresh: async (p,b) => b,
    vendorConfig: () => ({ baseUrl: "https://chatgpt.com/backend-api/codex" }),
    cooldownMs: () => 30*60*1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null, forEach: ()=>{} }, text: async () => "{}", clone: () => ({ text: async () => "{}" }) }),
  })
  await assert.rejects(() => svc.request({ provider: "codex", path: "/evil" }), (e) => e.code === "FORBIDDEN")
})

test("subscriptions request succeeds and captures quota", async () => {
  let captured = null
  const svc = createSubscriptionsService({
    listAccounts: async () => [{ hasToken: true, ref: "CODEX_OAUTH_1", quota: null, cooldownUntil: 0 }],
    loadBlob: async () => ({ accessToken: "at", refreshToken: "rt", expiresAt: Date.now()+100000, accountId: "acc123" }),
    ensureFresh: async (p,b) => b,
    vendorConfig: () => ({ baseUrl: "https://chatgpt.com/backend-api/codex", originator: "codex_cli_rs" }),
    cooldownMs: () => 30*60*1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: (ref, snap) => { captured = snap },
    fetchImpl: async (url, opts) => {
      assert.ok(url.includes("/responses"))
      assert.equal(opts.headers.Authorization, "Bearer at")
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => k.toLowerCase()==="x-ratelimit-remaining" ? "5" : null, forEach: ()=>{} },
        text: async () => JSON.stringify({ data: [] }),
        clone: () => ({ text: async () => JSON.stringify({}) })
      }
    }
  })
  const res = await svc.request({ provider: "codex", path: "/responses", method: "POST", body: { model: "x" } })
  assert.equal(res.ok, true)
  assert.ok(captured && captured.remaining === 5)
})

test("subscriptions request rotates on 429", async () => {
  let calls = 0
  const svc = createSubscriptionsService({
    listAccounts: async () => [
      { hasToken: true, ref: "CODEX_OAUTH_1", quota: null, cooldownUntil: 0 },
      { hasToken: true, ref: "CODEX_OAUTH_2", quota: null, cooldownUntil: 0 },
    ],
    loadBlob: async () => ({ accessToken: "at", refreshToken: "rt", expiresAt: Date.now()+100000 }),
    ensureFresh: async (p,b) => b,
    vendorConfig: () => ({ baseUrl: "https://chatgpt.com/backend-api/codex" }),
    cooldownMs: () => 30*60*1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    fetchImpl: async () => {
      calls++
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null, forEach: ()=>{} },
          clone: () => ({ text: async () => "" }),
          text: async () => "rate limit"
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null, forEach: ()=>{} },
        text: async () => "{}",
        clone: () => ({ text: async () => "{}" })
      }
    }
  })
  const res = await svc.request({ provider: "codex", path: "/responses" })
  assert.equal(res.ok, true)
  assert.equal(calls, 2)
})

test("subscriptionsImages still works via generateOnce", async () => {
  // ensure images.js still parses
  const { parseImages } = await import("../lib/images.js")
  const imgs = parseImages({ data: [{ b64_json: "abc" }] })
  assert.equal(imgs[0].b64_json, "abc")
})
test("#445: subscriptions request rejects external arbitrary URLs before dispatching Bearer tokens", async () => {
  let seen = null
  const svc = createSubscriptionsService({
    listAccounts: async () => [{ hasToken: true, ref: "CODEX_OAUTH_1", quota: null, cooldownUntil: 0 }],
    loadBlob: async () => ({ accessToken: "SECRET_TOKEN", refreshToken: "rt", expiresAt: Date.now() + 100000 }),
    ensureFresh: async (_p, b) => b,
    vendorConfig: () => ({ baseUrl: "https://chatgpt.com/backend-api/codex" }),
    cooldownMs: () => 30 * 60 * 1000,
    switchAtRemaining: () => 0,
    rememberCooldown: () => {},
    rememberQuota: () => {},
    fetchImpl: async (url, opts) => {
      seen = { url, auth: opts.headers?.Authorization }
      return { ok: true, status: 200, headers: { get: () => null, forEach: () => {} }, text: async () => "{}", clone: () => ({ text: async () => "{}" }) }
    },
  })

  await assert.rejects(
    () => svc.request({ provider: "codex", path: "https://untrusted.example/responses" }),
    (err) => err.code === "FORBIDDEN" && err.message.includes("external origin rejected")
  )
  assert.equal(seen, null, "Bearer token must not be sent to untrusted external origin")
})

test("subscriptions.request supplies AbortSignal when caller omits signal (#322)", async () => {
  let captured
  const svc = createSubscriptionsService({
    listAccounts: async () => [{ ref: "CODEX_OAUTH_1", hasToken: true }],
    loadBlob: async () => ({ accessToken: "FAKE" }),
    ensureFresh: async (_p, b) => b,
    vendorConfig: () => ({}),
    fetchImpl: async (_u, init) => {
      captured = init
      return Response.json({})
    },
  })
  await svc.request({ provider: "codex", path: "/models" })
  assert.equal(typeof captured.signal, "object")
  assert.equal(Boolean(captured.signal), true)
})
