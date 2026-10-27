#!/usr/bin/env node
/**
 * A customer can select an available model for a session — measured on a REAL dsh.
 *
 * Each case boots the `native` profile (the tree `@tracy/dsh-native-bundle` composes, the one the
 * fleet image runs) from this workspace, with `llm-deepseek` pointed at a Messages server in this
 * process. Every call goes through dsh's own `/api` carrier with the browser cookie, exactly as the
 * page sends it, and the fake server records the model of every request dsh actually sends. So
 * "refused at the door" and "ran on the default" are read off the wire, not off a helper.
 *
 * The first case is the control: with `tracy-mode-picker` disabled, dsh accepts a pick of
 * `deepseek-v4-pro` and sends the conversation there. That is the hole. The same home is then
 * booted again with the policy on, so conversations picked or answered on the other model BEFORE
 * the lock (a pending pick, an old request header) are measured too.
 *
 *   node --test --test-timeout=120000 packages/ui/tracy-mode-picker/test/e2e/model-policy-runtime.test.mjs
 *
 * Needs `pnpm dsh:build` and `pnpm install` (like `check-boot-graph`). It is hermetic: the profile
 * is copied to a temp directory and linked there with `scripts/materialize-profile.mjs native`
 * (`TCH_PROFILES_DIR`), once per file, so the repository's own `tch/profiles` is never written.
 * It lives in `test/e2e/` because every case boots a real dsh; the policy decisions themselves are
 * unit-tested in `../model-policy.test.mjs`.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..', '..')
const DSH = path.join(REPO, 'node_modules/.bin/dsh')
const BOOT_TIMEOUT_MS = 90_000

const FLASH = { provider: 'deepseek-official', model: 'deepseek-flash' }
const PRO = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }

if (!existsSync(DSH))
  throw new Error(`model-policy-runtime: ${DSH} is missing — run \`pnpm dsh:build\` then \`pnpm install\``)
/** One throwaway `DSH_HOME` for the whole file; its `profiles/native` is a linked copy of the repository's. */
// macOS aliases /var to /private/var. Materialization creates relative symlinks, so use the
// physical directory before calculating their paths or they point into /private/Users instead.
const HOME = realpathSync(mkdtempSync(path.join(tmpdir(), 'tch-model-policy-')))

before(() => {
  const profile = path.join(HOME, 'profiles', 'native')
  mkdirSync(profile, { recursive: true })
  cpSync(path.join(REPO, 'tch/profiles/native'), profile, {
    recursive: true,
    filter: (source) => path.basename(source) !== 'node_modules'
  })
  // The one registry dependency only feeds the dev sidebar overlay, which this test does not load;
  // dropping it keeps materialize from running `npm install` against the network.
  const manifestPath = path.join(profile, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  delete manifest.dependencies
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const linked = spawnSync('node', [path.join(REPO, 'scripts/materialize-profile.mjs'), 'native'], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, TCH_PROFILES_DIR: path.join(HOME, 'profiles') }
  })
  if (linked.status !== 0) {
    throw new Error(`model-policy-runtime: materialize-profile failed\n${linked.stdout}\n${linked.stderr}`)
  }
})

after(() => rmSync(HOME, { recursive: true, force: true }))

/** A port the OS just handed out. */
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address !== null ? resolve(address.port) : reject(new Error('no port'))
      )
    })
  })
}

/**
 * A DeepSeek Messages endpoint that answers every request with one line naming the model it was
 * sent, and records that model. `failNext` makes the next N requests fail with a 500.
 */
async function fakeMessages() {
  /** @type {{ model: unknown, session: string | undefined }[]} */
  const seen = []
  const state = { failNext: 0 }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('{}')
        return
      }
      /** @type {any} */
      let json = {}
      try {
        json = JSON.parse(body)
      } catch {
        // recorded as an unreadable request below
      }
      const header = req.headers['x-deepseek-harness-session-id']
      seen.push({ model: json.model, session: typeof header === 'string' ? header : undefined })
      if (state.failNext > 0) {
        state.failNext -= 1
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'fake outage' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (/** @type {string} */ type, /** @type {object} */ data) =>
        res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      send('message_start', {
        message: {
          id: `m${seen.length}`,
          type: 'message',
          role: 'assistant',
          model: json.model,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 0 }
        }
      })
      send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: `answered by ${String(json.model)}` }
      })
      send('content_block_stop', { index: 0 })
      send('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })
      send('message_stop', {})
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    seen,
    state,
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined)))
  }
}

/** A per-test `DSH_HOME` (session files) whose `profiles/` is the file's linked copy. */
function makeHome() {
  const home = mkdtempSync(path.join(HOME, 'case-'))
  symlinkSync(path.join(HOME, 'profiles'), path.join(home, 'profiles'), 'dir')
  return {
    home,
    remove() {
      // The link first, so a recursive removal can never walk into the shared profile copy.
      unlinkSync(path.join(home, 'profiles'))
      rmSync(home, { recursive: true, force: true })
    }
  }
}

/**
 * Boot dsh on `home` and sign in the way a browser does.
 * @param {{ home: string, baseURL: string, policy: boolean, defaultModel?: Record<string, string> }} options
 */
async function boot(options) {
  const port = await freePort()
  const rows = [
    `- id: webserver\n  config:\n    host: 127.0.0.1\n    port: ${port}\n`,
    `- id: llm-deepseek\n  config:\n    baseURL: ${options.baseURL}\n`
  ]
  if (!options.policy) rows.push('- id: tracy-mode-picker\n  disabled: true\n')
  if (options.defaultModel !== undefined) {
    const fields = Object.entries(options.defaultModel).map(([key, value]) => `    ${key}: '${value}'\n`)
    rows.push(`- id: agent-default-model\n  config:\n${fields.join('')}`)
  }
  const patch = path.join(options.home, `boot-${port}.patch.yml`)
  writeFileSync(patch, rows.join(''))
  const env = { ...process.env, DSH_HOME: options.home, DEEPSEEK_API_KEY: 'sk-test-not-a-key' }
  delete env.OPENROUTER_API_KEY
  delete env.DEEPSEEK_BASE_URL
  const child = spawn(
    DSH,
    ['--profile', 'native', '--patch', patch, '--no-open', '--trusted-host', `127.0.0.1:${port}`],
    {
      cwd: REPO,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  let log = ''
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`dsh printed no URL in ${BOOT_TIMEOUT_MS} ms\n${log}`)),
        BOOT_TIMEOUT_MS
      )
      const read = (/** @type {Buffer} */ chunk) => {
        log += chunk.toString()
        const found = /dsh web: (\S+)/.exec(log)
        if (found !== null) {
          clearTimeout(timer)
          resolve(found[1])
        }
      }
      child.stdout.on('data', read)
      child.stderr.on('data', read)
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`dsh exited (${String(code)}) before printing its URL\n${log}`))
      })
    })
    const origin = `http://127.0.0.1:${port}`
    const token = new URL(String(url)).searchParams.get('token')
    const minted = await fetch(`${origin}/?token=${encodeURIComponent(String(token))}`, {
      redirect: 'manual'
    })
    const cookie = minted.headers
      .getSetCookie()
      .map((line) => line.split(';', 1)[0])
      .join('; ')
    assert.notEqual(cookie, '', 'dsh minted no cookie for its launch token')
    let next = 0
    /**
     * One RPC exactly as `client-connection` posts it.
     * @param {string} endpoint
     * @param {Record<string, unknown>} args
     * @param {{ path?: string, method?: string, body?: string }} [raw]
     */
    const post = async (endpoint, args, raw = {}) => {
      const response = await fetch(`${origin}${raw.path ?? `/api/${endpoint}`}`, {
        method: raw.method ?? 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        ...(raw.method === 'GET'
          ? {}
          : {
              body:
                raw.body ??
                JSON.stringify({
                  type: 'client-request',
                  rpcId: `t${next++}`,
                  method: endpoint,
                  payload: { args }
                })
            })
      })
      const text = await response.text()
      /** @type {any} */
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
      return { status: response.status, body }
    }
    return {
      post,
      log: () => log,
      async stop() {
        child.kill('SIGTERM')
        const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
        await exited
        clearTimeout(timer)
      }
    }
  } catch (error) {
    child.kill('SIGKILL')
    await exited
    throw error
  }
}

/** @typedef {Awaited<ReturnType<typeof boot>>} Host */

async function create(/** @type {Host} */ host) {
  const created = await host.post('session/create', { request: {} })
  assert.equal(created.body?.result?.ok, true, JSON.stringify(created.body))
  return String(created.body.result.value.sessionId)
}

async function select(
  /** @type {Host} */ host,
  /** @type {string} */ sessionId,
  /** @type {object} */ route
) {
  return (await host.post('session/selectModel', { request: { sessionId, ...route } })).body
}

async function projections(/** @type {Host} */ host, /** @type {string} */ sessionId) {
  const read = await host.post('session/projections', { request: { sessionId } })
  assert.equal(read.body?.result?.ok, true, JSON.stringify(read.body))
  return read.body.result.value.values
}

/** Send one prompt and wait until its turn has an answer on record. */
async function prompt(/** @type {Host} */ host, /** @type {string} */ sessionId, /** @type {string} */ text) {
  const before = (await projections(host, sessionId)).sessionStats?.turns ?? 0
  const sent = await host.post('session/prompt', {
    request: {
      sessionId,
      requestId: `${sessionId}-${Math.random().toString(36).slice(2)}`,
      mode: 'queue',
      content: [{ type: 'text', text }]
    }
  })
  assert.equal(sent.body?.result?.ok, true, JSON.stringify(sent.body))
  const deadline = Date.now() + 30_000
  for (;;) {
    const values = await projections(host, sessionId)
    const outline = values.turnOutline ?? []
    const last = outline[outline.length - 1]
    if (
      (values.sessionStats?.turns ?? 0) > before &&
      typeof last?.response === 'string' &&
      last.response !== ''
    ) {
      return /** @type {string} */ (last.response)
    }
    if (Date.now() > deadline) throw new Error(`no answer for ${sessionId}\n${host.log().slice(-3000)}`)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

/** Every model the fake server was sent since `from`. */
const modelsSince = (/** @type {{ model: unknown }[]} */ seen, /** @type {number} */ from) =>
  new Set(seen.slice(from).map((request) => request.model))

test('session model selection reaches the provider and host default initialization stays locked', async (t) => {
  const fake = await fakeMessages()
  const home = makeHome()
  t.after(async () => {
    await fake.close()
    home.remove()
  })
  const host = await boot({ home: home.home, baseURL: fake.baseURL, policy: true })
  try {
    const session = await create(host)
    const picked = await select(host, session, PRO)
    assert.equal(picked.result.ok, true, JSON.stringify(picked))
    assert.equal(picked.result.value.selected.model, PRO.model)
    const from = fake.seen.length
    assert.equal(await prompt(host, session, 'hello'), `answered by ${PRO.model}`)
    assert.deepEqual(modelsSince(fake.seen, from), new Set([PRO.model]))

    const switched = await select(host, session, FLASH)
    assert.equal(switched.result.ok, true, JSON.stringify(switched))
    const nextFrom = fake.seen.length
    assert.equal(await prompt(host, session, 'switch back'), `answered by ${FLASH.model}`)
    assert.deepEqual(modelsSince(fake.seen, nextFrom), new Set([FLASH.model]))

    const init = await host.post('session/initializeDefaultModel', {})
    assert.equal(init.body.result.ok, false)
    assert.equal(init.body.result.error.code, 'tracy/model-locked')
  } finally {
    await host.stop()
  }
})

test('the selected model remains session-local when a different host default is configured', async (t) => {
  const fake = await fakeMessages()
  const home = makeHome()
  t.after(async () => {
    await fake.close()
    home.remove()
  })
  const host = await boot({ home: home.home, baseURL: fake.baseURL, policy: true, defaultModel: PRO })
  try {
    const session = await create(host)
    assert.equal((await select(host, session, FLASH)).result.ok, true)
    const from = fake.seen.length
    assert.equal(await prompt(host, session, 'hello'), `answered by ${FLASH.model}`)
    assert.deepEqual(modelsSince(fake.seen, from), new Set([FLASH.model]))
  } finally {
    await host.stop()
  }
})

test('unavailable models are rejected by dsh and the session keeps its default route', async (t) => {
  const fake = await fakeMessages()
  const home = makeHome()
  t.after(async () => {
    await fake.close()
    home.remove()
  })
  const host = await boot({ home: home.home, baseURL: fake.baseURL, policy: true })
  try {
    const session = await create(host)
    const unavailable = await select(host, session, { provider: 'openrouter', model: 'missing/model' })
    assert.equal(unavailable.result.ok, false)
    assert.equal(unavailable.result.error.code, 'session/model-unavailable')
    const from = fake.seen.length
    assert.equal(await prompt(host, session, 'hello'), `answered by ${FLASH.model}`)
    assert.deepEqual(modelsSince(fake.seen, from), new Set([FLASH.model]))
  } finally {
    await host.stop()
  }
})
