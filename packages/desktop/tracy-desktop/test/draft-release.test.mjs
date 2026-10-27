/**
 * The workflow's side of the Windows + Linux transport (`build/draft-release.mjs`): hand the run's
 * installers over in a draft release, and sweep old drafts. The build runner has no `gh`, so this
 * talks to the REST API with `fetch`; here the API is faked and every request recorded.
 *
 *   node --test packages/desktop/tracy-desktop/test/draft-release.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { handOver, sweep } from '../build/draft-release.mjs'

const REPO = 'TracyHQ/tch'

/** A fake GitHub: `releases` is the list the API pages through (100 a page). */
function fakeApi(releases = []) {
  const calls = []
  let nextId = 900
  const request = async (method, url, { body } = {}) => {
    calls.push({ method, url, body })
    const u = new URL(url)
    if (method === 'GET' && u.pathname === `/repos/${REPO}/releases`) {
      const page = Number(u.searchParams.get('page') ?? 1)
      return { status: 200, json: releases.slice((page - 1) * 100, page * 100) }
    }
    if (method === 'DELETE') return { status: 204, json: null }
    if (method === 'POST' && u.pathname === `/repos/${REPO}/releases`) {
      const id = nextId++
      return { status: 201, json: { id, draft: body.draft, tag_name: body.tag_name } }
    }
    if (method === 'POST' && u.hostname === 'uploads.github.com') {
      const size = body.size
      return { status: 201, json: { name: u.searchParams.get('name'), size } }
    }
    throw new Error(`unexpected ${method} ${url}`)
  }
  return { request, calls }
}

function files() {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-release-'))
  const list = ['a-setup.exe', 'b.AppImage', 'build-info.json'].map((n) => {
    const f = path.join(dir, n)
    writeFileSync(f, `bytes of ${n}`)
    return f
  })
  return { list, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('hand-over creates a draft at the sha and uploads every file under its own name', async () => {
  const { request, calls } = fakeApi()
  const f = files()
  try {
    const got = await handOver({
      request,
      repo: REPO,
      tag: 'desktop-win-linux-42',
      sha: 'a'.repeat(40),
      title: 't',
      notes: 'n',
      files: f.list
    })
    const create = calls.find((c) => c.method === 'POST' && !c.url.includes('uploads'))
    assert.deepEqual(create.body, {
      tag_name: 'desktop-win-linux-42',
      target_commitish: 'a'.repeat(40),
      name: 't',
      body: 'n',
      draft: true
    })
    const uploads = calls.filter((c) => c.url.startsWith('https://uploads.github.com/'))
    assert.deepEqual(
      uploads.map((c) => new URL(c.url).searchParams.get('name')),
      ['a-setup.exe', 'b.AppImage', 'build-info.json']
    )
    assert.ok(uploads.every((c) => c.url.includes('/releases/900/assets')))
    assert.deepEqual(
      got.assets.map((a) => a.name),
      ['a-setup.exe', 'b.AppImage', 'build-info.json']
    )
  } finally {
    f.done()
  }
})

test('a re-run replaces the draft of the attempt before it, and never touches a published release', async () => {
  const f = files()
  try {
    const old = fakeApi([{ id: 7, tag_name: 'desktop-win-linux-42', draft: true, assets: [] }])
    await handOver({
      request: old.request,
      repo: REPO,
      tag: 'desktop-win-linux-42',
      sha: 'a'.repeat(40),
      title: 't',
      notes: 'n',
      files: f.list
    })
    assert.ok(old.calls.some((c) => c.method === 'DELETE' && c.url.endsWith(`/repos/${REPO}/releases/7`)))

    const live = fakeApi([{ id: 8, tag_name: 'desktop-win-linux-42', draft: false, assets: [] }])
    await assert.rejects(
      handOver({
        request: live.request,
        repo: REPO,
        tag: 'desktop-win-linux-42',
        sha: 'a'.repeat(40),
        title: 't',
        notes: 'n',
        files: f.list
      }),
      /not a draft/
    )
    assert.equal(
      live.calls.some((c) => c.method !== 'GET'),
      false
    )
  } finally {
    f.done()
  }
})

test('an upload GitHub refuses, or one that lands with another size, fails the hand-over', async () => {
  const f = files()
  try {
    const { request } = fakeApi()
    const refusing = async (method, url, o) =>
      url.startsWith('https://uploads.github.com/')
        ? { status: 422, json: { message: 'already_exists' } }
        : request(method, url, o)
    await assert.rejects(
      handOver({
        request: refusing,
        repo: REPO,
        tag: 'desktop-win-linux-1',
        sha: 'a'.repeat(40),
        title: 't',
        notes: 'n',
        files: f.list
      }),
      /a-setup\.exe.*422/
    )
    const short = async (method, url, o) =>
      url.startsWith('https://uploads.github.com/')
        ? { status: 201, json: { size: 1 } }
        : request(method, url, o)
    await assert.rejects(
      handOver({
        request: short,
        repo: REPO,
        tag: 'desktop-win-linux-2',
        sha: 'a'.repeat(40),
        title: 't',
        notes: 'n',
        files: f.list
      }),
      /size/
    )
  } finally {
    f.done()
  }
})

test('the sweep deletes only our drafts whose newest upload is older than the cutoff, across pages', async () => {
  const now = new Date('2026-10-30T00:00:00Z')
  const old = '2026-10-10T00:00:00Z'
  const fresh = '2026-10-29T00:00:00Z'
  const filler = Array.from({ length: 100 }, (_, i) => ({
    id: 1000 + i,
    tag_name: `v${i}`,
    draft: false,
    created_at: old,
    assets: []
  }))
  const releases = [
    ...filler,
    { id: 1, tag_name: 'desktop-win-linux-1', draft: true, created_at: fresh, assets: [{ created_at: old }] },
    {
      id: 2,
      tag_name: 'desktop-win-linux-2',
      draft: true,
      created_at: old,
      assets: [{ created_at: old }, { created_at: fresh }]
    },
    { id: 3, tag_name: 'desktop-win-linux-3', draft: false, created_at: old, assets: [{ created_at: old }] },
    { id: 4, tag_name: 'other-draft', draft: true, created_at: old, assets: [] },
    { id: 5, tag_name: 'desktop-win-linux-5', draft: true, created_at: old, assets: [] }
  ]
  const { request, calls } = fakeApi(releases)
  const deleted = await sweep({ request, repo: REPO, prefix: 'desktop-win-linux-', olderThanDays: 14, now })
  assert.deepEqual(deleted, ['desktop-win-linux-1', 'desktop-win-linux-5'])
  assert.deepEqual(
    calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop()),
    ['1', '5']
  )
})
