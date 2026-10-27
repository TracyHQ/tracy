/**
 * GitHub Copilot as a broker provider: GitHub's device sign-in, the GitHub token → Copilot token
 * exchange, identity, and the OpenAI-compatible chat stream. Every request goes to a fake fetch;
 * nothing here signs in to GitHub.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as copilot from '../src/seat-plan/wire/vendors/copilot.js'
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

test('device sign-in starts with GitHub and hands back the code the person types', async () => {
  const f = fakeFetch([
    json({
      device_code: 'dev-123',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      interval: 7,
      expires_in: 900
    })
  ])
  const started = await copilot.deviceStart(copilot.defaults(), f.impl)
  assert.deepEqual(started, {
    userCode: 'ABCD-1234',
    deviceAuthId: 'dev-123',
    intervalMs: 7000,
    authUrl: 'https://github.com/login/device'
  })
  assert.equal(f.calls[0].url, 'https://github.com/login/device/code')
  assert.equal(f.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    client_id: 'Iv1.b507a08c87ecfe98',
    scope: 'read:user'
  })
})

test('device poll stays pending until the person confirms on GitHub', async () => {
  for (const error of ['authorization_pending', 'slow_down']) {
    const f = fakeFetch([json({ error })])
    const polled = await copilot.devicePoll(copilot.defaults(), { deviceAuthId: 'dev-123' }, f.impl)
    assert.deepEqual(polled, { status: 'pending' })
    assert.equal(f.calls[0].url, 'https://github.com/login/oauth/access_token')
    assert.deepEqual(JSON.parse(f.calls[0].init.body), {
      client_id: 'Iv1.b507a08c87ecfe98',
      device_code: 'dev-123',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  }
})

test('a refused or expired device code is an error, not an endless wait', async () => {
  const f = fakeFetch([json({ error: 'expired_token', error_description: 'The device code has expired.' })])
  await assert.rejects(copilot.devicePoll(copilot.defaults(), { deviceAuthId: 'dev-123' }, f.impl), {
    status: 400,
    code: 'DEVICE'
  })
})

test('a confirmed device code becomes a Copilot token that expires when GitHub says, plus the GitHub person', async () => {
  const f = fakeFetch([
    json({ access_token: 'gho_github', token_type: 'bearer', scope: 'read:user' }),
    json({ token: 'tid=copilot-1', expires_at: 1_900_000_000 }),
    json({ id: 4242, login: 'octo', email: 'octo@example.com' })
  ])
  const polled = await copilot.devicePoll(copilot.defaults(), { deviceAuthId: 'dev-123' }, f.impl)
  assert.deepEqual(polled, {
    status: 'authorized',
    blob: {
      accessToken: 'tid=copilot-1',
      refreshToken: 'gho_github',
      expiresAt: 1_900_000_000_000,
      githubId: '4242',
      login: 'octo',
      email: 'octo@example.com'
    }
  })
  assert.equal(f.calls[1].url, 'https://api.github.com/copilot_internal/v2/token')
  assert.equal(f.calls[1].init.headers.Authorization, 'Bearer gho_github')
  assert.equal(f.calls[2].url, 'https://api.github.com/user')
  assert.equal(f.calls[2].init.headers.Authorization, 'Bearer gho_github')
})

test('a GitHub account without Copilot fails the exchange instead of storing a useless token', async () => {
  const f = fakeFetch([json({ access_token: 'gho_github' }), json({ message: 'Not Found' }, 404)])
  await assert.rejects(copilot.devicePoll(copilot.defaults(), { deviceAuthId: 'dev-123' }, f.impl), {
    status: 404
  })
})

test('refresh re-exchanges the GitHub token for a new Copilot token and keeps the identity', async () => {
  const f = fakeFetch([json({ token: 'tid=copilot-2', expires_at: 1_900_001_800 })])
  const blob = {
    accessToken: 'tid=copilot-1',
    refreshToken: 'gho_github',
    expiresAt: 1,
    githubId: '4242',
    login: 'octo',
    email: ''
  }
  const next = await copilot.refresh(copilot.defaults(), blob, f.impl)
  assert.deepEqual(next, { ...blob, accessToken: 'tid=copilot-2', expiresAt: 1_900_001_800_000 })
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer gho_github')
})

test('a refresh GitHub refuses is an authentication failure the broker can act on', async () => {
  const f = fakeFetch([json({ message: 'Bad credentials' }, 401)])
  await assert.rejects(copilot.refresh(copilot.defaults(), { refreshToken: 'gho_revoked' }, f.impl), {
    status: 401
  })
})

test('the broker knows Copilot by id, name and a default model from its own catalogue', async () => {
  const { providers, models, names } = await import('../src/seat-plan/providers.js')
  assert.equal(providers.copilot, copilot)
  assert.equal(names.copilot, 'GitHub Copilot')
  assert.equal(copilot.providerInfo().name, 'GitHub Copilot')
  const catalogue = await copilot.listModels(null, copilot.defaults())
  assert.ok(
    catalogue.some((m) => m.id === models.copilot),
    `${models.copilot} is in the Copilot list`
  )
  assert.equal(models.copilot, 'gpt-4.1')
})

test('the identity of a Copilot connection is the GitHub account id, labelled by login', async () => {
  const { identityOf } = await import('../src/seat-plan/providers.js')
  const blob = {
    accessToken: 't',
    refreshToken: 'gho',
    githubId: '4242',
    login: 'octo',
    email: 'o@x.example'
  }
  assert.deepEqual(await identityOf('copilot', blob, async () => assert.fail('no request needed')), {
    subject: '4242',
    label: 'octo'
  })
  // A blob without the person asks GitHub, with the GitHub token, not the Copilot one.
  const f = fakeFetch([json({ id: 77, login: 'hubber', email: null })])
  assert.deepEqual(await identityOf('copilot', { accessToken: 't', refreshToken: 'gho' }, f.impl), {
    subject: '77',
    label: 'hubber'
  })
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer gho')
})

test('check reads the GitHub person behind the connection', async () => {
  const f = fakeFetch([json({ id: 4242, login: 'octo', email: 'octo@example.com' })])
  const checked = await copilot.check({ refreshToken: 'gho' }, copilot.defaults(), f.impl)
  assert.equal(checked.ok, true)
  assert.equal(checked.raw.login, 'octo')
})

test('Copilot has no usage door here, so usage is unknown rather than invented', async () => {
  assert.equal(
    await copilot.usage({ refreshToken: 'gho' }, copilot.defaults(), async () => assert.fail()),
    null
  )
})

test('a bare 429 from Copilot is not exhaustion; a quota message is', async () => {
  const { exhausted } = await import('../src/seat-plan/providers.js')
  const { httpError } = await import('../src/seat-plan/wire/wire.js')
  assert.equal(exhausted(httpError(429, 'Too Many Requests')), false)
  assert.equal(exhausted(httpError(429, '')), false)
  assert.equal(exhausted(httpError(402, 'quota exceeded for this month')), true)
})

const sse = (events) =>
  new Response(events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' }
  })

test('a turn streams through Copilot chat completions as the broker chunk shape', async () => {
  const f = fakeFetch([
    sse([
      { choices: [{ delta: { role: 'assistant', content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      '[DONE]'
    ])
  ])
  const chunks = await Array.fromAsync(
    copilot.streamOnce({
      blob: { accessToken: 'tid=copilot-1', refreshToken: 'gho', expiresAt: Date.now() + 3600000 },
      config: copilot.defaults(),
      options: {
        model: 'gpt-4.1',
        sessionId: 'session-1',
        messages: [{ role: 'user', content: 'Say hello' }]
      },
      fetchImpl: f.impl
    })
  )
  assert.deepEqual(chunks, [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Hel' },
    { type: 'text-delta', index: 0, text: 'lo' },
    { type: 'finish', reason: { kind: 'stop' } }
  ])
  const { url, init } = f.calls[0]
  assert.equal(url, 'https://api.githubcopilot.com/chat/completions')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, 'Bearer tid=copilot-1')
  assert.equal(init.headers['Copilot-Integration-Id'], 'vscode-chat')
  const body = JSON.parse(init.body)
  assert.equal(body.model, 'gpt-4.1')
  assert.equal(body.stream, true)
  assert.deepEqual(body.messages.at(-1), { role: 'user', content: 'Say hello' })
})

test('a refused turn surfaces the HTTP status so the broker can reconnect or retry', async () => {
  for (const status of [401, 429]) {
    const f = fakeFetch([new Response('nope', { status })])
    const turn = copilot.streamOnce({
      blob: { accessToken: 'tid=copilot-1', refreshToken: 'gho' },
      config: copilot.defaults(),
      options: { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      fetchImpl: f.impl
    })
    await assert.rejects(Array.fromAsync(turn), { status })
  }
})

test('pictures: copilot carries them where its wire allows', async () => {
  assert.deepEqual(copilot.inputModalities('gpt-4.1'), ['text', 'image'])
  const options = pictureTurn('copilot', 'gpt-4.1')
  const body = await sentBody(
    copilot,
    { accessToken: 'tid=copilot-1', refreshToken: 'gho', expiresAt: Date.now() + 3600000 },
    options
  )
  const [, , tool, pictures] = body.messages.filter((m) => m.role !== 'system')
  assert.equal(
    body.messages.find((m) => m.role === 'user').content[1].image_url.url,
    `data:image/png;base64,${PNG}`
  )
  assert.equal(tool.role, 'tool')
  assert.ok(!tool.content.includes(JPG), 'chat completions carries no picture in a tool message')
  assert.match(pictures.content[0].text, /^\[image from tool result c1\]/)
  assert.equal(pictures.content.at(-1).image_url.url, `data:image/jpeg;base64,${JPG}`)
})
