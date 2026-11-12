import assert from 'node:assert/strict'
import { test } from 'node:test'
import { after, before } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
let dir
let createApi, demoCommand, placePieces, createRequestIds, runAction, en, createTranslate
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'wo-retry-dispatch-'))
  const outfile = path.join(dir, 'retry.cjs')
  await build({
    stdin: {
      contents: `
      export { createTranslate } from '@tracy/wo-views/strings'
      export { createApi } from './api.ts'
      export { demoCommand } from './demo-block-model.ts'
      export { placePieces } from './opportunity-pieces.ts'
      export { createRequestIds } from './request-ids.ts'
      export { runAction } from './row-actions.ts'
      export { en } from './strings.ts'
    `,
      resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  ;({ createApi, demoCommand, placePieces, createRequestIds, runAction, en, createTranslate } = require(
    outfile
  ))
})
after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

const failed = () => ({
  id: 'place-1',
  name: 'Harbor Cafe',
  stage: 'demo',
  job: { id: 'research-1', state: 'completed' },
  latestRevision: { id: 'brief-2', n: 2 },
  approval: { profile: 'approved', brief: 'approved' },
  demoAction: {
    id: 'failed-action-1',
    revisionId: 'brief-1',
    state: 'failed',
    step: 'plan',
    error: 'QA_NEEDS_REVIEW'
  }
})

function requestDoor(status = 202, body = { actions: [] }) {
  const calls = []
  const api = createApi(async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) })
    return Response.json(body, { status })
  })
  return { api, calls }
}

for (const surface of ['list', 'details']) {
  test(`${surface} Try again sends the failed action as retryOf without a template picker or replacing the current brief`, async () => {
    const row = failed()
    const saved = structuredClone(row)
    const { api, calls } = requestDoor()
    const command =
      surface === 'list'
        ? placePieces(row, createTranslate(en), { now: Date.now(), locale: 'en' }).next.run
        : demoCommand('primary', row, null)
    assert.ok(command)
    assert.equal(command.action, 'retry-demo')
    let picks = 0
    const outcome = await runAction(
      api,
      createRequestIds(() => 'retry-request-1'),
      command.action,
      row,
      async () => {
        picks++
        return null
      }
    )
    assert.deepEqual(outcome, { kind: 'done' })
    assert.equal(picks, 0)
    assert.deepEqual(calls, [
      {
        url: '/api/website-opportunities/place-1/demo/build',
        method: 'POST',
        body: { requestId: 'retry-request-1', retryOf: 'failed-action-1' }
      }
    ])
    assert.deepEqual(row, saved, 'approved brief2 and the frozen parent brief1 are not rebound or edited')
  })
}

test('a retry without its parent action fails without sending a fresh build', async () => {
  const row = failed()
  row.demoAction = null
  const { api, calls } = requestDoor()
  const outcome = await runAction(
    api,
    createRequestIds(() => 'retry-request-1'),
    'retry-demo',
    row
  )
  assert.deepEqual(outcome, { kind: 'failed', code: 'NOT_FOUND' })
  assert.equal(calls.length, 0)
})

test('a refused retry retains the server diagnostic and never falls back to building approved brief2', async () => {
  const row = failed()
  const saved = structuredClone(row)
  const { api, calls } = requestDoor(409, { code: 'CHAIN_RETRY_AUTHORITY_CHANGED' })
  const outcome = await runAction(
    api,
    createRequestIds(() => 'retry-request-1'),
    'retry-demo',
    row
  )
  assert.deepEqual(outcome, { kind: 'failed', code: 'CHAIN_RETRY_AUTHORITY_CHANGED' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.retryOf, 'failed-action-1')
  assert.equal('selection' in calls[0].body, false)
  assert.equal('revisionId' in calls[0].body, false)
  assert.deepEqual(row, saved)
})
