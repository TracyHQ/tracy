/**
 * The ten-minute read of ja-products spends (almost) no GitHub quota when nothing changed: the list
 * is asked with `If-None-Match` (a 304 is free), the asset files are read once per asset id, and a
 * token running low on quota waits for its reset instead of burning the rest (19/10/2026: four
 * stands on one token emptied 5,000 requests an hour and provisioning got 403 on the quickstart).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createReleaseReadCache, refreshReleases, syncReleases } from '../src/lib/quickstart-releases.js'

const sha = (c) => c.repeat(64)
const SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  install: {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha('a') },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: sha('b') }
  }
}
const ASSETS = [
  { id: 11, name: 'tracy-business-emdash-quickstart-1.0.0.zip', updated_at: '2026-10-01T00:00:00Z' },
  { id: 12, name: 'tracy-business-emdash-state-1.0.0.tar.gz', updated_at: '2026-10-01T00:00:00Z' },
  { id: 13, name: 'tracy_setting.json', updated_at: '2026-10-01T00:00:00Z' }
].map((a) => ({ ...a, url: `https://api.github.invalid/assets/${a.id}` }))
const LIST = [{ tag_name: 'tracy-business/emdash-0.x', name: 'Tracy Business', assets: ASSETS }]
const RESET_S = 1_900_000_000

/** GitHub as far as this module sees it: an ETag on the list, quota headers on every answer. */
function github({ remaining = 4000, limit = 5000, refuse = false } = {}) {
  const calls = []
  const quota = {
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-reset': String(RESET_S)
  }
  const fetchImpl = async (url, init = {}) => {
    const headers = init.headers ?? {}
    calls.push({ url: String(url), ifNoneMatch: headers['if-none-match'] ?? null })
    if (refuse)
      return new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: { ...quota, 'x-ratelimit-remaining': '0' }
      })
    if (String(url).includes('/releases?')) {
      if (headers['if-none-match'] === '"v1"')
        return new Response(null, { status: 304, headers: { ...quota, etag: '"v1"' } })
      return new Response(JSON.stringify(LIST), { status: 200, headers: { ...quota, etag: '"v1"' } })
    }
    if (String(url).endsWith('/13'))
      return new Response(JSON.stringify(SETTING), { status: 200, headers: quota })
    return new Response('not found', { status: 404, headers: quota })
  }
  return { fetchImpl, calls }
}

function countingPool() {
  const writes = []
  return {
    writes,
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ').trim()
      if (/^(insert|update|delete)/i.test(text)) writes.push({ text, params })
      return { rows: [] }
    }
  }
}

const quietLog = () => {
  const lines = []
  const put = (...a) => lines.push(a.map(String).join(' '))
  return { lines, log: put, warn: put, error: put }
}

test('an unchanged list is asked with If-None-Match, answered 304, and rewrites no release row', async () => {
  const cache = createReleaseReadCache()
  const gh = github()
  const pool = countingPool()

  const first = await syncReleases(pool, { token: 't', fetchImpl: gh.fetchImpl, cache })
  assert.equal(first.ok, true)
  assert.equal(gh.calls[0].ifNoneMatch, null, 'the first read has no ETag to send')
  assert.equal(pool.writes.filter((w) => w.text.startsWith('insert into quickstart_releases')).length, 1)

  gh.calls.length = 0
  pool.writes.length = 0
  const second = await syncReleases(pool, { token: 't', fetchImpl: gh.fetchImpl, cache })
  assert.deepEqual(second, { ok: true, count: 1, unchanged: true })
  assert.deepEqual(
    gh.calls.map((c) => c.ifNoneMatch),
    ['"v1"'],
    'one conditional request for the list, no asset downloads'
  )
  assert.equal(
    pool.writes.filter((w) => w.text.startsWith('insert')).length,
    0,
    'nothing parsed again, no row rewritten'
  )
})

test('a list that changed re-reads only the assets it has not seen (same id, same updated_at)', async () => {
  const cache = createReleaseReadCache()
  const gh = github()
  await syncReleases(countingPool(), { token: 't', fetchImpl: gh.fetchImpl, cache })
  // Another release edit moves the ETag; the setting asset is the same asset.
  cache.pages.clear()
  gh.calls.length = 0
  await syncReleases(countingPool(), { token: 't', fetchImpl: gh.fetchImpl, cache })
  assert.deepEqual(
    gh.calls.map((c) => c.url.includes('/releases?')),
    [true],
    'the list only: tracy_setting.json comes from the asset cache'
  )
})

test('a token below 10% of its quota waits for the reset instead of reading again', async () => {
  const cache = createReleaseReadCache()
  const gh = github({ remaining: 30 })
  const config = { github: null, releasesToken: 't', localReleasesDir: null }
  const pool = countingPool()
  const out = quietLog()

  await refreshReleases(pool, config, {
    fetchImpl: gh.fetchImpl,
    log: out,
    cache,
    now: () => (RESET_S - 600) * 1000
  })
  const spent = gh.calls.length
  assert.ok(spent > 0)

  const next = await refreshReleases(pool, config, {
    fetchImpl: gh.fetchImpl,
    log: out,
    cache,
    now: () => (RESET_S - 300) * 1000
  })
  assert.equal(gh.calls.length, spent, 'no request while the quota is low')
  assert.equal(next.ok, false)
  assert.equal(next.deferredUntil, new Date(RESET_S * 1000).toISOString())
  assert.match(next.reason, /rate limit/i)

  // Past the reset the read happens again.
  await refreshReleases(pool, config, {
    fetchImpl: gh.fetchImpl,
    log: out,
    cache,
    now: () => (RESET_S + 1) * 1000
  })
  assert.ok(gh.calls.length > spent)
})

test('a 403 with x-ratelimit-remaining: 0 is logged as the rate limit, not as a failed read', async () => {
  const cache = createReleaseReadCache()
  const gh = github({ refuse: true })
  const out = quietLog()
  const result = await refreshReleases(
    countingPool(),
    { github: null, releasesToken: 't', localReleasesDir: null },
    { fetchImpl: gh.fetchImpl, log: out, cache, now: () => (RESET_S - 600) * 1000 }
  )
  assert.equal(result.ok, false)
  assert.match(result.reason, /rate limit/i)
  assert.match(result.reason, new RegExp(new Date(RESET_S * 1000).toISOString()))
  assert.ok(
    out.lines.some((l) => /\[releases\].*rate limit/i.test(l)),
    `a log line names the rate limit: ${out.lines.join(' | ')}`
  )
  assert.ok(!out.lines.some((l) => /download failed|GitHub answered 403/.test(l)))
})
