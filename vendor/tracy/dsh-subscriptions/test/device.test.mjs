import { test } from 'node:test'
import assert from 'node:assert/strict'
const codex = await import('../lib/vendors/codex.js')

const CFG = { clientId: 'app_test', redirectUri: 'http://localhost:1455/auth/callback' }

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

test('deviceStart maps user_code/device_auth_id/interval', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return jsonResponse(200, { user_code: 'AAAA-BBBB', device_auth_id: 'dev123', interval: '5' })
  }
  const out = await codex.deviceStart(CFG, fetchImpl)
  assert.equal(out.userCode, 'AAAA-BBBB')
  assert.equal(out.deviceAuthId, 'dev123')
  assert.equal(out.intervalMs, 5000)
  assert.ok(out.authUrl.includes('/codex/device'))
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.client_id, 'app_test')
})

test('deviceStart throws on incomplete response', async () => {
  const fetchImpl = async () => jsonResponse(200, { user_code: 'AAAA-BBBB' })
  await assert.rejects(() => codex.deviceStart(CFG, fetchImpl))
})

test('deviceStart throws on HTTP error', async () => {
  const fetchImpl = async () => jsonResponse(500, { message: 'boom' })
  await assert.rejects(() => codex.deviceStart(CFG, fetchImpl))
})

test('devicePoll returns pending on 403/404', async () => {
  for (const status of [403, 404]) {
    const fetchImpl = async () => jsonResponse(status, {})
    const out = await codex.devicePoll(CFG, { deviceAuthId: 'd', userCode: 'U' }, fetchImpl)
    assert.equal(out.status, 'pending')
  }
})

test('devicePoll authorized exchanges code via PKCE with device redirectUri', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/deviceauth/token')) {
      return jsonResponse(200, { authorization_code: 'ac123', code_verifier: 'ver456' })
    }
    // token exchange endpoint (oauth/token)
    return jsonResponse(200, {
      access_token: 'at.jwt.sig',
      refresh_token: 'rt',
      id_token: 'id.jwt.sig',
      expires_in: 3600,
    })
  }
  const out = await codex.devicePoll(CFG, { deviceAuthId: 'd', userCode: 'U' }, fetchImpl)
  assert.equal(out.status, 'authorized')
  assert.ok(out.blob.accessToken)
  assert.ok(out.blob.refreshToken)
  // token exchange used the device redirect URI
  const tokenCall = calls.find((c) => String(c.url).includes('/oauth/token'))
  assert.ok(tokenCall, 'token exchange happened')
  const body = new URLSearchParams(tokenCall.init.body)
  assert.equal(body.get('redirect_uri'), 'https://auth.openai.com/deviceauth/callback')
  assert.equal(body.get('code'), 'ac123')
  assert.equal(body.get('code_verifier'), 'ver456')
})

test('devicePoll throws on unexpected HTTP error', async () => {
  const fetchImpl = async () => jsonResponse(500, {})
  await assert.rejects(() => codex.devicePoll(CFG, { deviceAuthId: 'd', userCode: 'U' }, fetchImpl))
})

const copilot = await import("../lib/vendors/copilot.js")

test("copilot deviceStart maps user_code/device_code/interval", async () => {
  const fetchImpl = async () => jsonResponse(200, {
    user_code: "1234-5678",
    device_code: "dc_abc",
    interval: 5,
    verification_uri: "https://github.com/login/device",
  })
  const out = await copilot.deviceStart({}, fetchImpl)
  assert.equal(out.userCode, "1234-5678")
  assert.equal(out.deviceAuthId, "dc_abc")
  assert.equal(out.intervalMs, 5000)
  assert.equal(out.authUrl, "https://github.com/login/device")
})

test("copilot devicePoll returns pending on authorization_pending", async () => {
  const fetchImpl = async () => jsonResponse(200, { error: "authorization_pending" })
  const out = await copilot.devicePoll({}, { deviceAuthId: "dc_abc", userCode: "1234-5678" }, fetchImpl)
  assert.equal(out.status, "pending")
})

test("copilot devicePoll exchanges GitHub token for Copilot token", async () => {
  const fetchImpl = async (url) => {
    const s = String(url)
    if (s.includes("/login/oauth/access_token")) {
      return jsonResponse(200, { access_token: "gh_tok_123" })
    }
    if (s.includes("/copilot_internal/v2/token")) {
      return jsonResponse(200, { token: "copilot_tok_456", expires_at: 1800000000 })
    }
    if (s.includes("/user")) {
      return jsonResponse(200, { login: "octocat", email: "octo@github.com" })
    }
    return jsonResponse(404, {})
  }
  const out = await copilot.devicePoll({}, { deviceAuthId: "dc_abc", userCode: "1234-5678" }, fetchImpl)
  assert.equal(out.status, "authorized")
  assert.equal(out.blob.accessToken, "copilot_tok_456")
  assert.equal(out.blob.refreshToken, "gh_tok_123")
  assert.equal(out.blob.label, "octocat")
})
