#!/usr/bin/env node
/**
 * The host half's path that pushes a webroot/database to storage — `src/host/artifacts.ts`.
 *
 *   npx tsx --test scripts/test/host-artifacts.test.mjs
 *
 * FOUR THINGS WORTH PINNING:
 *
 *   1. **Bytes go STRAIGHT to R2.** The `PUT` must point at the presigned URL, not through `cowork-web`.
 *      A Worker carrying 300 MB is an architecture bug, and it is very easy to add "for convenience" later.
 *   2. **No disk, and parts cut to the exact size** — even when the source yields chunks out of step.
 *   3. **A failure midway CLEANS UP.** An orphan part left in storage is money someone pays forever.
 *   4. **The clicking person's cookie is forwarded**, and no other secret is used.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ArtifactRefused,
  artifactsFor,
  PART_SIZE,
  uploadStream
} from '../../packages/site/tracy-add-site/src/host/artifacts.ts'

const ORIGIN = 'https://cowork.tracy.ai'
const COOKIE = 'tracy_sess=abc123'
const SIGNED = 'https://acct.r2.cloudflarestorage.com/bucket/sites/x/webroot.tar?X-Amz-Signature=deadbeef'

/** A fake `fetch` that records every call and answers by path. */
interface Recorded {
  url: string
  method: string
  cookie: string | undefined
}

function recorder({ partsFail = false } = {}): { calls: Recorded[]; fetchImpl: typeof fetch } {
  const calls: Recorded[] = []
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({ url: String(url), method: init.method ?? 'GET', cookie: headers.cookie })
    const path = String(url)
    if (path.endsWith('/artifacts/begin')) {
      return new Response(JSON.stringify({ key: 'sites/x/webroot.tar', uploadId: 'u-1' }), { status: 200 })
    }
    if (path.endsWith('/artifacts/part')) {
      return new Response(JSON.stringify({ url: SIGNED }), { status: 200 })
    }
    if (path.endsWith('/artifacts/finish'))
      return new Response(JSON.stringify({ done: true }), { status: 200 })
    if (path.endsWith('/artifacts/abort'))
      return new Response(JSON.stringify({ aborted: true }), { status: 200 })
    if (path.endsWith('/artifacts/put')) {
      return new Response(JSON.stringify({ key: 'sites/x/db.sql.gz', url: SIGNED }), { status: 200 })
    }
    // The PUT straight to R2.
    if (partsFail) return new Response('', { status: 500 })
    return new Response('', { status: 200, headers: { etag: `"etag-${calls.length}"` } })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

/** A stream that yields `count` chunks of `size` bytes each. */
function streamOf(count: number, size: number): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= count) {
        controller.close()
        return
      }
      sent += 1
      controller.enqueue(new Uint8Array(size).fill(sent % 251))
    }
  })
}

test('bytes go STRAIGHT to R2 — the PUT never points at cowork-web', async () => {
  const { calls, fetchImpl } = recorder()
  const artifacts = artifactsFor('tiembanh.com', { origin: ORIGIN, cookie: COOKIE, fetchImpl })
  // Two 5 MB chunks → one full 8 MB part + one 2 MB tail part.
  const key = await uploadStream(artifacts, 'webroot', streamOf(2, 5 * 1024 * 1024), { fetchImpl })

  assert.equal(key, 'sites/x/webroot.tar')
  const puts = calls.filter((call) => call.method === 'PUT')
  assert.equal(puts.length, 2, 'two parts')
  for (const put of puts) {
    assert.ok(put.url.startsWith('https://acct.r2.cloudflarestorage.com/'), 'the PUT must go straight to R2')
    assert.ok(!put.url.includes('cowork.tracy.ai'), 'bytes must NOT go through the Worker')
    assert.equal(put.cookie, undefined, 'the URL is already signed — no cookie on the byte upload')
  }
})

test('cuts parts to the exact size, even when the source yields chunks out of step', async () => {
  const { calls, fetchImpl } = recorder()
  const artifacts = artifactsFor('tiembanh.com', { origin: ORIGIN, cookie: COOKIE, fetchImpl })
  const seen: number[] = []
  // 20 chunks of 1 MB = 20 MB → 2 full parts (8 + 8) + one 4 MB tail part.
  await uploadStream(artifacts, 'webroot', streamOf(20, 1024 * 1024), {
    fetchImpl,
    onProgress: (bytes) => seen.push(bytes)
  })
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 3)
  assert.deepEqual(seen, [PART_SIZE, PART_SIZE * 2, 20 * 1024 * 1024])
})

test('a failed part CLEANS UP the half-done upload, leaving no orphan part in storage', async () => {
  const { calls, fetchImpl } = recorder({ partsFail: true })
  const artifacts = artifactsFor('tiembanh.com', { origin: ORIGIN, cookie: COOKIE, fetchImpl })

  await assert.rejects(
    () => uploadStream(artifacts, 'webroot', streamOf(2, 5 * 1024 * 1024), { fetchImpl }),
    (error: unknown) => error instanceof ArtifactRefused
  )
  assert.equal(calls.filter((call) => call.url.endsWith('/artifacts/abort')).length, 1)
  // And it does NOT complete an upload with only half its parts: `finish` with a short list makes a
  // truncated archive the fleet only finds broken after unpacking it.
  assert.equal(calls.filter((call) => call.url.endsWith('/artifacts/finish')).length, 0)
})

test("every control call carries the clicking person's cookie — and nothing else", async () => {
  const { calls, fetchImpl } = recorder()
  const artifacts = artifactsFor('tiembanh.com', { origin: ORIGIN, cookie: COOKIE, fetchImpl })
  await artifacts.signPut('db')

  const control = calls.filter((call) => call.url.includes('/artifacts/'))
  assert.ok(control.length > 0)
  for (const one of control) {
    assert.equal(one.cookie, COOKIE)
    assert.ok(one.url.startsWith(`${ORIGIN}/api/sites/tiembanh.com/artifacts/`))
  }
})

test('a storage refusal reports ITS exact code, not a generic error', async () => {
  // `KEY_NOT_YOURS` (stop for good) and a network error (retry) call for different actions by the caller.
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ code: 'KEY_NOT_YOURS' }), { status: 403 })) as unknown as typeof fetch
  const artifacts = artifactsFor('tiembanh.com', { origin: ORIGIN, cookie: COOKIE, fetchImpl })
  await assert.rejects(
    () => artifacts.begin('webroot'),
    (error: unknown) => error instanceof ArtifactRefused && error.code === 'KEY_NOT_YOURS'
  )
})
