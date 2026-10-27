import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provisionDesign, PROVISION_DESIGN_READ } from '../src/provision-design.js'
import { runProvisionJob } from '../src/provision.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const body = {
  label: 'moon',
  site: 'moon',
  platform: 'emdash',
  fresh: true,
  quickstart: 'tracy-base/emdash-0.x'
}
const snapshot = { tokensCss: ':root { --color-bg: #fff; }', fontsJson: '[]', html: '<html lang="en">' }

test('a fresh EmDash provision freezes its token sources before announcing done', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'provision-design-'))
  const writes = []
  const calls = []
  try {
    await runProvisionJob({
      jobId: 'job',
      body,
      config: { scriptsDir: '/scripts', privateRoot: '/private', logDir: dir },
      jobs: { put: async (_, value) => writes.push(value) },
      run: async (call) => {
        calls.push(call)
        if (call.script === 'bash') {
          await call.onLine('TRACY_RESULT port=8080')
          return { code: 0, tail: [] }
        }
        assert.equal(
          writes.some((w) => w.state === 'done'),
          false
        )
        return { code: 0, tail: [JSON.stringify(snapshot)] }
      }
    })
    assert.deepEqual(writes.at(-1).design, snapshot)
    assert.equal(writes.at(-1).state, 'done')
    const read = calls.find((c) => c.script === 'docker')
    assert.deepEqual(read.args.slice(0, 4), ['exec', 'moon-web-1', 'node', '-e'])
    assert.ok(read.timeoutMs > 0 && read.timeoutMs <= 10_000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('imports and other CMS never read EmDash files', async () => {
  for (const override of [{ fresh: false }, { platform: 'joomla' }, { quickstart: undefined }]) {
    const out = await provisionDesign({
      body: { ...body, ...override },
      run: async () => assert.fail('unexpected exec')
    })
    assert.equal(out, null)
  }
})

test('an unreadable, incomplete, oversized or timed-out snapshot leaves the ruler unknown', async () => {
  for (const result of [
    { code: 1, tail: [JSON.stringify(snapshot)] },
    { code: 0, timedOut: true, tail: [JSON.stringify(snapshot)] },
    { code: 0, tail: ['not json'] },
    { code: 0, tail: [JSON.stringify({ ...snapshot, html: null })] },
    { code: 0, tail: [JSON.stringify({ ...snapshot, tokensCss: 'x'.repeat(65537) })] }
  ])
    assert.equal(await provisionDesign({ body, run: async () => result }), null)
  assert.equal(
    await provisionDesign({
      body,
      run: async () => {
        throw new Error('docker down')
      }
    }),
    null
  )
})

test('the container reader rejects oversized sources and never invents a root after a failed read', async () => {
  const execute = async ({
    css = snapshot.tokensCss,
    page = '<html data-theme="dark">',
    status = 200
  } = {}) => {
    const output = []
    const process = { exitCode: 0 }
    const fs = {
      openSync: (file) => file,
      readSync: (file, bytes) => {
        const value = Buffer.from(file.endsWith('tokens.css') ? css : '[]')
        const size = Math.min(value.length, bytes.length)
        value.copy(bytes, 0, 0, size)
        return size
      },
      closeSync: () => {}
    }
    await vm.runInNewContext(PROVISION_DESIGN_READ, {
      require: (name) => {
        assert.equal(name, 'node:fs')
        return fs
      },
      Buffer,
      AbortSignal,
      process,
      fetch: async () => new Response(page, { status }),
      console: { log: (line) => output.push(JSON.parse(line)) }
    })
    return { output, code: process.exitCode }
  }
  assert.equal((await execute()).output[0].html, '<html data-theme="dark">')
  for (const fixture of [{ css: 'x'.repeat(65537) }, { page: 'no document root' }, { status: 503 }]) {
    const result = await execute(fixture)
    assert.equal(result.code, 1)
    assert.deepEqual(result.output, [])
  }
})
