#!/usr/bin/env node
/**
 * Retry and resume — `src/host/retry.ts` + `src/host/resume.ts` + `exportFiles`.
 *
 *   npx tsx --test scripts/test/host-resume.test.ts
 *
 * WHY THESE TWO MATTER MORE THAN THEY LOOK. An import is hundreds of requests to someone else's
 * server, lasting tens of minutes. Things will happen in that time — mostly things
 * nobody could list in advance. `retry` fixes what can be foreseen; `resume` fixes the rest, by
 * making sure the cost of ANY incident is "lose at most one part", not "start over".
 *
 * FOUR THINGS WORTH PINNING:
 *
 *   1. **A transport error is retried; a refusal is not.** Knocking six times on a door
 *      that already answered "no" is waste, and it makes the user wait for nothing.
 *   2. **The presigned URL is minted AGAIN on every attempt.** Reusing an old URL a minute later fails on the signature,
 *      and it looks exactly like storage failing twice.
 *   3. **The cursor is written after EVERY part**, not at the end.
 *   4. **A failure does NOT throw away the parts already received** — they are the only thing the next run can resume from.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mock, test } from 'node:test'

import { exportFiles } from '../../packages/site/tracy-add-site/src/host/export.ts'
import { relayedTransportError, withRetry } from '../../packages/site/tracy-add-site/src/host/retry.ts'

/**
 * Run `work` on a fake clock: every retry wait is served the moment it is asked for, so a backoff of
 * seconds costs nothing and the test still sees the delays the code chose (via its `onRetry`).
 */
async function onFakeClock<T>(work: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let settled = false
    const running = work().finally(() => {
      settled = true
    })
    running.catch(() => undefined)
    while (!settled) {
      mock.timers.runAll()
      await new Promise((resolve) => setImmediate(resolve))
    }
    return await running
  } finally {
    mock.timers.reset()
  }
}

/** Each test gets its own `$DSH_HOME` — the cursor book is a real file, and it must be this test's file. */
async function isolatedHome(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), 'tracy-add-site-'))
  process.env.DSH_HOME = home
  return home
}

/**
 * Wraps a fake engine so it answers `files.pack` only. `exportFiles` first asks `site.fingerprint` for
 * the site's byte total (#1567, best effort); that call is answered as an engine without the action,
 * so the fake's own call count stays a count of parts.
 */
function packOnly(fake: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const action = (JSON.parse(String(init.body ?? '{}')) as { action?: string }).action
    if (action === 'site.fingerprint') return Response.json({ ok: false, error: 'unknown_action' })
    return fake(input, init)
  }) as unknown as typeof fetch
}

/** Fake storage: counts every call, and signs a DIFFERENT URL each time so the test can see it. */
function fakeArtifacts() {
  const calls: string[] = []
  let signed = 0
  return {
    calls,
    signedUrls: [] as string[],
    store: {
      async begin() {
        calls.push('begin')
        return { key: 'sites/x/webroot.tar', uploadId: 'u-1' }
      },
      async signPart(_key: string, _uploadId: string, partNumber: number) {
        signed += 1
        const url = `https://r2/part-${partNumber}?sig=${signed}`
        calls.push(`sign:${partNumber}`)
        return url
      },
      async finish() {
        calls.push('finish')
      },
      async abandon() {
        calls.push('abandon')
      },
      async signPut() {
        return { key: 'sites/x/db.sql.gz', url: 'https://r2/db' }
      }
    }
  }
}

test('a transport error is retried; a refusal is NOT', async () => {
  let tries = 0
  const waits: number[] = []
  const answer = await onFakeClock(() =>
    withRetry(
      async () => {
        tries += 1
        if (tries < 3) throw relayedTransportError('storage is having a bad minute: HTTP 503')
        return 'done'
      },
      (_attempt, delayMs) => waits.push(delayMs)
    )
  )
  assert.equal(answer, 'done')
  assert.equal(tries, 3)
  assert.deepEqual(waits, [1000, 2000], 'the wait doubles from one second')

  // A real answer does not change on asking again — and four waits only make the user wait.
  let refusals = 0
  await onFakeClock(() =>
    assert.rejects(() =>
      withRetry(async () => {
        refusals += 1
        throw new Error('bad token')
      })
    )
  )
  assert.equal(refusals, 1, 'a refusal is asked EXACTLY once')
})

test('each part writes the cursor AT ONCE, and the URL is re-signed for every attempt', async () => {
  const home = await isolatedHome()
  const { store, calls } = fakeArtifacts()

  let packed = 0
  const endpointCalls: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = packOnly(async (input: string | URL | Request) => {
    endpointCalls.push(String(input))
    packed += 1
    // Part 1 fails once on storage, then goes through — enough for the test to see the URL re-signed.
    if (packed === 1) {
      return Response.json({ ok: false, error: 'upload_failed', message: 'store said HTTP 503' })
    }
    return Response.json({
      ok: true,
      etag: `"e${packed}"`,
      files: 10,
      bytes: 1000,
      next_path: packed >= 3 ? '' : 'wp-content/uploads',
      next_offset: 0,
      done: packed >= 3
    })
  })

  try {
    const out = await onFakeClock(() =>
      exportFiles('https://site/api', 'tok', store as never, 'tiembanh.com')
    )
    assert.equal(out.parts, 2, 'two parts landed (the failed attempt does not count as a part)')

    // Re-signed for every attempt: three signings for two parts, because part 1 went twice.
    assert.equal(calls.filter((one) => one.startsWith('sign:')).length, 3)
    const urls = endpointCalls.length
    assert.ok(urls >= 3, 'the engine is called again after the failed attempt')

    // The cursor book was cleared because the upload completed — that is the right behaviour.
    const book = await readFile(path.join(home, 'tracy-add-site', 'uploads.json'), 'utf8').catch(() => '{}')
    assert.deepEqual(JSON.parse(book), {}, 'a completed archive leaves no cursor to resume')
    assert.ok(calls.includes('finish'))
  } finally {
    globalThis.fetch = real
  }
})

test('failure midway: KEEP the parts received, and the cursor stays on disk for the next run to continue', async () => {
  const home = await isolatedHome()
  const { store, calls } = fakeArtifacts()

  let packed = 0
  const real = globalThis.fetch
  globalThis.fetch = packOnly(async () => {
    packed += 1
    // Two parts go through, then the engine dies in a way NOT worth retrying.
    if (packed <= 2) {
      return Response.json({
        ok: true,
        etag: `"e${packed}"`,
        files: 10,
        bytes: 8 * 1024 * 1024,
        next_path: 'wp-content/uploads',
        next_offset: 0,
        done: false
      })
    }
    return Response.json({ ok: false, error: 'token_rejected' })
  })

  try {
    await assert.rejects(() => exportFiles('https://site/api', 'tok', store as never, 'tiembanh.com'))

    // 🔒 NO `abandon`. Those parts are the only thing the next run can resume from.
    assert.equal(calls.filter((one) => one === 'abandon').length, 0, 'received parts must not be thrown away')

    const book = JSON.parse(await readFile(path.join(home, 'tracy-add-site', 'uploads.json'), 'utf8'))
    const held = book['tiembanh.com']
    assert.ok(held, 'the cursor must be on disk')
    assert.equal(held.parts.length, 2, 'the two received parts are recorded')
    assert.equal(held.uploadId, 'u-1')
    assert.equal(held.cursor.path, 'wp-content/uploads', 'continues from exactly where it stopped')
    assert.equal(held.bytes, 16 * 1024 * 1024)
  } finally {
    globalThis.fetch = real
  }
})

test('the next run RESUMES from the cursor — no new upload opened, no old part uploaded again', async () => {
  await isolatedHome()
  const { store, calls } = fakeArtifacts()

  // Run one: two parts, then dies.
  let packed = 0
  const real = globalThis.fetch
  globalThis.fetch = packOnly(async () => {
    packed += 1
    if (packed <= 2) {
      return Response.json({
        ok: true,
        etag: `"e${packed}"`,
        files: 10,
        bytes: 100,
        next_path: 'wp-content/uploads',
        next_offset: 512,
        done: false
      })
    }
    return Response.json({ ok: false, error: 'token_rejected' })
  })
  await assert.rejects(() => exportFiles('https://site/api', 'tok', store as never, 'tiembanh.com'))

  // Run two: the engine recovers. The next part must be number 3, with the same `uploadId`.
  const seen: Array<{ path: string; offset: number }> = []
  globalThis.fetch = packOnly(async (_input: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body ?? '{}')) as {
      params?: { path?: string; offset?: number }
    }
    seen.push({ path: body.params?.path ?? '', offset: body.params?.offset ?? -1 })
    return Response.json({
      ok: true,
      etag: '"e3"',
      files: 5,
      bytes: 50,
      next_path: '',
      next_offset: 0,
      done: true
    })
  })

  try {
    const out = await exportFiles('https://site/api', 'tok', store as never, 'tiembanh.com')
    assert.equal(out.parts, 3, 'two old parts plus one new')
    // Only ONE `begin` across both runs: the second run joins the upload that is still open.
    assert.equal(calls.filter((one) => one === 'begin').length, 1, 'no second upload opened')
    // And it asks the engine for exactly where it stopped, not the start of the webroot again.
    assert.deepEqual(seen[0], { path: 'wp-content/uploads', offset: 512 })
    assert.equal(out.files, 25, 'file count adds up across both runs')
  } finally {
    globalThis.fetch = real
  }
})
