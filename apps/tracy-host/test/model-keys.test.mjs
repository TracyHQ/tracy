// `POST /_host/model-keys` — putting the keys the provider book holds where dsh reads them.
//
// The container's own environment WINS over the credentials file (measured: `credentials-local`
// treats an inherited non-empty value as authoritative and read-only), so this door is only half
// the answer — the other half is `MODEL_API_KEY` being empty in the deployment's env. What this
// door must get right on its own: never write a world-readable credential file, never accept a
// name that is not an environment-variable name, and replace the `refs:` block without touching
// the `records:` block beside it, which holds dsh's own browser-session secret.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'

const config = {
  hostName: 'local',
  hostSecret: 'host-secret',
  sitesRoot: process.cwd(),
  dshContainer: 'tracy-dsh'
}

/** A run() that records what it was asked to do and answers success. */
function recorder(result = { code: 0, tail: [] }) {
  const calls = []
  return {
    calls,
    run: async (args) => {
      calls.push(args)
      return typeof result === 'function' ? result(args) : result
    }
  }
}

async function post(app, path, body) {
  const text = JSON.stringify(body)
  const headers = await signHostCall({ secret: config.hostSecret, path, body: text })
  return app.fetch(
    new Request(`http://tracy-host.test${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: text
    })
  )
}

test('an unsigned call never reaches the handler', async () => {
  const { run } = recorder()
  const app = buildApp({ config, run })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/model-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"keys":{}}'
    })
  )
  assert.equal(res.status, 403)
})

test('a signed call writes the refs block into the container, and chmods it 600', async () => {
  const { calls, run } = recorder()
  const app = buildApp({ config, run })
  const res = await post(app, '/_host/model-keys', {
    keys: { DEEPSEEK_API_KEY: 'sk-new', OPENROUTER_API_KEY: 'sk-or-new' }
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, wrote: ['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'] })

  const argv = calls[0].args.join(' ')
  assert.match(argv, /exec .*tracy-dsh/)
  // 🔒 The file is refused by dsh's credential provider unless it is 0600 — a write that forgot
  // the mode would take the agent down rather than change its key.
  assert.match(argv, /chmod 600/)
  // The keys must never appear in argv — a process list is readable by anything on that host.
  assert.ok(!argv.includes('sk-new'), 'a key was passed on the command line')
  assert.ok(!argv.includes('sk-or-new'), 'a key was passed on the command line')
  assert.match(calls[0].stdin ?? '', /sk-new/)
})

test('a key name that is not an environment variable name is refused', async () => {
  const { calls, run } = recorder()
  const app = buildApp({ config, run })
  for (const bad of ['deepseek key', 'A;rm -rf /', 'lowercase', '']) {
    const res = await post(app, '/_host/model-keys', { keys: { [bad]: 'x' } })
    assert.equal(res.status, 400, bad)
  }
  assert.equal(calls.length, 0, 'a refused name still ran something')
})

test('an empty value is refused rather than written — dsh rejects empty refs', async () => {
  const { run } = recorder()
  const app = buildApp({ config, run })
  const res = await post(app, '/_host/model-keys', { keys: { DEEPSEEK_API_KEY: '' } })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'EMPTY_VALUE')
})

test('no keys at all is refused — this door never clears the whole file by accident', async () => {
  const { run } = recorder()
  const app = buildApp({ config, run })
  const res = await post(app, '/_host/model-keys', { keys: {} })
  assert.equal(res.status, 400)
})

test('a failing container write is reported, not swallowed', async () => {
  const { run } = recorder({ code: 1, tail: ['Error: No such container: tracy-dsh'] })
  const app = buildApp({ config, run })
  const res = await post(app, '/_host/model-keys', { keys: { DEEPSEEK_API_KEY: 'sk-new' } })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.code, 'WRITE_FAILED')
  assert.match(body.detail, /No such container/)
})

test('an explicit clear empties the refs block; an empty object without it is still refused', async () => {
  const { run, calls } = recorder()
  const app = buildApp({ config, run })
  const refused = await post(app, '/_host/model-keys', { keys: {} })
  assert.equal(refused.status, 400)
  const cleared = await post(app, '/_host/model-keys', { keys: {}, clear: true })
  assert.equal(cleared.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].stdin, '')
  assert.match(calls[0].args.at(-1), /refs: \{\}/)
  assert.ok(
    calls[0].args.at(-1).includes('/^refs:/'),
    'a previous `refs: {}` line is replaced, not duplicated'
  )
})
