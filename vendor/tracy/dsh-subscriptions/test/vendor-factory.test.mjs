
import { test } from "node:test"
import assert from "node:assert/strict"
import { createVendorFromProfile, validateProfile } from "../lib/vendor-factory.js"

const PROFILE = {
  id: "myservice",
  displayName: "My Service",
  authUrl: "https://auth.myservice.com/authorize",
  tokenUrl: "https://auth.myservice.com/token",
  baseUrl: "https://api.myservice.com/v1",
  scope: "openid offline_access",
  tokenStyle: "form",
  clientId: "client123",
  redirectUri: "http://localhost:9999/callback",
  modelsPath: "/models",
  models: [{ id: "my-model", name: "My Model" }],
}

test("validateProfile accepts valid profile", () => {
  const p = validateProfile(PROFILE)
  assert.equal(p.id, "myservice")
  assert.equal(p.tokenStyle, "form")
})

test("validateProfile rejects missing required fields", () => {
  for (const key of ["id", "authUrl", "tokenUrl", "baseUrl", "clientId"]) {
    const broken = { ...PROFILE }
    delete broken[key]
    assert.throws(() => validateProfile(broken))
  }
})

test("validateProfile rejects bad id format", () => {
  assert.throws(() => validateProfile({ ...PROFILE, id: "9bad" }))
  assert.throws(() => validateProfile({ ...PROFILE, id: "has space" }))
})

test("#493: validateProfile rejects invalid or non-http(s) URLs in authUrl, tokenUrl, baseUrl", () => {
  for (const key of ["authUrl", "tokenUrl", "baseUrl"]) {
    assert.throws(() => validateProfile({ ...PROFILE, [key]: "not-a-valid-url" }), /must be a valid http\(s\) URL/)
    assert.throws(() => validateProfile({ ...PROFILE, [key]: "ftp://ftp.myservice.com/resource" }), /must be a valid http\(s\) URL/)
    assert.throws(() => validateProfile({ ...PROFILE, [key]: "javascript:alert(1)" }), /must be a valid http\(s\) URL/)
    assert.throws(() => validateProfile({ ...PROFILE, [key]: "file:///etc/passwd" }), /must be a valid http\(s\) URL/)
  }
})

test("factory builds vendor with correct identity", () => {
  const v = createVendorFromProfile(validateProfile(PROFILE))
  assert.equal(v.id, "myservice")
  assert.deepEqual(v.providerInfo(), { id: "myservice", name: "My Service" })
})

test("authorizeUrl carries PKCE and client params", async () => {
  const v = createVendorFromProfile(validateProfile(PROFILE))
  const url = v.authorizeUrl(
    { clientId: "client123", redirectUri: "http://localhost:9999/callback", scope: "openid" },
    { challenge: "chk", state: "st" },
  )
  assert.match(url, /code_challenge=chk/)
  assert.match(url, /state=st/)
  assert.match(url, /client_id=client123/)
})

test("exchangeCode posts form to token endpoint", async () => {
  const v = createVendorFromProfile(validateProfile(PROFILE))
  let captured
  const fakeFetch = async (url, opts) => {
    captured = { url, body: String(opts.body) }
    return { ok: true, text: async () => JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }) }
  }
  const blob = await v.exchangeCode(PROFILE, { verifier: "v" }, "code123", fakeFetch)
  assert.equal(blob.accessToken, "at")
  assert.match(captured.url, /token/)
  assert.match(captured.body, /grant_type=authorization_code/)
})

test("streamOnce posts to baseUrl/responses", async () => {
  const v = createVendorFromProfile(validateProfile(PROFILE))
  let hit = ""
  const fakeFetch = async (url) => {
    hit = url
    return { ok: true, status: 200, body: (async function* () {})(), headers: { get: () => null, forEach: () => {} }, text: async () => "" }
  }
  const gen = v.streamOnce({ blob: { accessToken: "at" }, options: { model: "m", messages: [] }, fetchImpl: fakeFetch, headers: {}, config: {}, signal: undefined })
  // consume first chunk (stream is empty but fetch was called)
  try { await gen.next() } catch {}
  assert.match(hit, /\/responses$/)
})

test("listModels returns actual profile id as provider instead of 'custom' (#451)", async () => {
  const v = createVendorFromProfile(validateProfile(PROFILE))
  // 1. Fallback / static catalog
  const models = await v.listModels({ accessToken: "at" }, PROFILE, async () => { throw new Error("net err") })
  assert.ok(Array.isArray(models))
  assert.equal(models.length, 1)
  assert.equal(models[0].id, "my-model")
  assert.equal(models[0].provider, "myservice")

  // 2. Live catalog fetched from modelsPath
  const fakeFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ data: [{ id: "live-model-1", display_name: "Live Model 1" }] }),
  })
  const liveModels = await v.listModels({ accessToken: "at" }, PROFILE, fakeFetch)
  assert.ok(Array.isArray(liveModels))
  assert.equal(liveModels.length, 1)
  assert.equal(liveModels[0].id, "live-model-1")
  assert.equal(liveModels[0].provider, "myservice")
})
