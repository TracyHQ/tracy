/**
 * ChatGPT Codex as a broker provider on the web: OpenAI's device-code sign-in (the person types a
 * code on auth.openai.com, nothing has to listen on localhost:1455). Every request goes to a fake
 * fetch; nothing here signs in to OpenAI.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as codex from '../src/seat-plan/wire/vendors/codex.js'
import { PNG, JPG, pictureTurn, sentBody } from './_seat-plan-pictures.mjs'

/** A fetch that answers each call from `answers` in turn and records what was asked. */
function fakeFetch(answers) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const next = answers.shift()
    if (!next) throw new Error(`unexpected request to ${url}`)
    return typeof next === 'function' ? next(url, init) : next
  }
  return { impl, calls }
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('on the web Codex signs in with a device code, on the desktop through the browser', () => {
  assert.equal(codex.webSignIn, 'device')
  assert.ok(!('signIn' in codex), 'the desktop keeps the localhost callback it catches itself')
})

test('device sign-in starts with OpenAI and hands back the code the person types', async () => {
  const f = fakeFetch([json({ device_auth_id: 'deviceauth_1', user_code: 'WXYZ-9876', interval: '6' })])
  const started = await codex.deviceStart(codex.defaults(), f.impl)
  // The same keys GitHub Copilot's deviceStart answers with: the broker seals and polls both alike.
  assert.deepEqual(started, {
    userCode: 'WXYZ-9876',
    deviceAuthId: 'deviceauth_1',
    intervalMs: 6000,
    authUrl: 'https://auth.openai.com/codex/device'
  })
  assert.equal(f.calls[0].url, 'https://auth.openai.com/api/accounts/deviceauth/usercode')
  assert.equal(f.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { client_id: 'app_EMoamEEZ73f0CkXaXp7hrann' })
})

test('a device start OpenAI refuses or answers incompletely fails', async () => {
  await assert.rejects(codex.deviceStart(codex.defaults(), fakeFetch([json({}, 429)]).impl), {
    status: 429
  })
  await assert.rejects(codex.deviceStart(codex.defaults(), fakeFetch([json({ user_code: 'only' })]).impl), {
    status: 502
  })
})

test('device poll stays pending while OpenAI answers 403 or 404', async () => {
  for (const status of [403, 404]) {
    const f = fakeFetch([json({ error: 'pending' }, status)])
    const session = { deviceAuthId: 'deviceauth_1', userCode: 'WXYZ-9876' }
    assert.deepEqual(await codex.devicePoll(codex.defaults(), session, f.impl), { status: 'pending' })
    assert.equal(f.calls[0].url, 'https://auth.openai.com/api/accounts/deviceauth/token')
    assert.deepEqual(JSON.parse(f.calls[0].init.body), {
      device_auth_id: 'deviceauth_1',
      user_code: 'WXYZ-9876'
    })
  }
})

test('a confirmed device code is exchanged for tokens through the device callback', async () => {
  const f = fakeFetch([
    json({ authorization_code: 'auth-code-1', code_verifier: 'verifier-1' }),
    json({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 })
  ])
  const before = Date.now()
  const polled = await codex.devicePoll(
    codex.defaults(),
    { deviceAuthId: 'deviceauth_1', userCode: 'WXYZ-9876' },
    f.impl
  )
  assert.equal(polled.status, 'authorized')
  assert.equal(polled.blob.accessToken, 'at-1')
  assert.equal(polled.blob.refreshToken, 'rt-1')
  assert.ok(polled.blob.expiresAt >= before + 3600000)
  assert.equal(f.calls[1].url, 'https://auth.openai.com/oauth/token')
  const form = Object.fromEntries(new URLSearchParams(String(f.calls[1].init.body)))
  assert.deepEqual(form, {
    grant_type: 'authorization_code',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    code: 'auth-code-1',
    redirect_uri: 'https://auth.openai.com/deviceauth/callback',
    code_verifier: 'verifier-1'
  })
})

test('pictures: codex carries them where its wire allows', async () => {
  assert.deepEqual(codex.inputModalities('gpt-6.1-sol'), ['text', 'image'])
  const options = pictureTurn('codex', 'gpt-6.1-sol')
  const body = await sentBody(
    codex,
    { accessToken: 'at-1', refreshToken: 'rt-1', accountId: 'acc-1', expiresAt: Date.now() + 3600000 },
    options
  )
  const user = body.input.find((i) => i.role === 'user')
  assert.deepEqual(user.content.at(-1), { type: 'input_image', image_url: `data:image/png;base64,${PNG}` })
  const output = body.input.find((i) => i.type === 'function_call_output')
  assert.equal(output.call_id, 'c1')
  assert.deepEqual(output.output.at(-1), {
    type: 'input_image',
    image_url: `data:image/jpeg;base64,${JPG}`,
    detail: 'auto'
  })
})
