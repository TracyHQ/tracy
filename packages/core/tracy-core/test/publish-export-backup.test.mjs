import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startFreshSiteExport } from '../src/site-tabs/publish/export-backup.ts'

test('a slow backup started by this click is exported without posting a second backup', async () => {
  const calls = []
  const waits = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined })
    if (url.endsWith('/backups'))
      return new Response(
        JSON.stringify({
          latest: { version: calls.filter((c) => c.url.endsWith('/backups')).length < 3 ? 3 : 4 }
        })
      )
    if (url.endsWith('/backups/4/export'))
      return new Response(JSON.stringify({ exportId: 'export-4', state: 'queued' }), { status: 202 })
    return new Response(
      JSON.stringify({ code: 'BACKUP_PENDING', jobId: 'backup-job-1', startedByRequest: true }),
      { status: 202 }
    )
  }

  const result = await startFreshSiteExport({
    siteKey: 'lantern.localhost',
    title: 'Site export',
    fetchImpl,
    sleep: async (ms) => waits.push(ms)
  })

  assert.deepEqual(result, { version: 4, exportId: 'export-4' })
  assert.equal(calls.filter((c) => c.url.endsWith('/backup')).length, 1)
  assert.equal(calls.filter((c) => c.url.endsWith('/backups')).length, 3)
  assert.equal(calls.find((c) => c.url.endsWith('/backup')).body.includeLarge, true)
  assert.equal(calls.at(-1).url, '/api/sites/lantern.localhost/backups/4/export')
  assert.equal(calls.at(-1).body.includeLarge, true)
  assert.deepEqual(waits, [3000, 3000])
})

test('a foreign pending backup is waited out, then this click creates and exports its own backup', async () => {
  const calls = []
  const waits = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined })
    if (url.endsWith('/backups/5/export'))
      return new Response(JSON.stringify({ exportId: 'export-5', state: 'queued' }), { status: 202 })
    if (url.endsWith('/backups')) return new Response(JSON.stringify({ latest: { version: 3 } }))
    if (calls.filter((c) => c.url.endsWith('/backup')).length === 1)
      return new Response(
        JSON.stringify({ code: 'BACKUP_PENDING', jobId: 'foreign-job', startedByRequest: false }),
        { status: 202 }
      )
    return new Response(JSON.stringify({ ok: true, version: 5 }), { status: 200 })
  }
  const result = await startFreshSiteExport({
    siteKey: 'lantern.localhost',
    title: 'Site export',
    fetchImpl,
    sleep: async (ms) => waits.push(ms)
  })

  assert.deepEqual(result, { version: 5, exportId: 'export-5' })
  const posts = calls.filter((c) => c.url.endsWith('/backup'))
  assert.equal(posts.length, 2)
  assert.ok(posts.every((post) => post.body.includeLarge === true))
  assert.equal(calls.at(-1).url, '/api/sites/lantern.localhost/backups/5/export')
  assert.equal(calls.at(-1).body.includeLarge, true)
  assert.deepEqual(waits, [3000])
})

test('an ambiguous legacy BACKUP_PENDING response fails closed without making another backup', async () => {
  const posts = []
  await assert.rejects(
    startFreshSiteExport({
      siteKey: 'lantern.localhost',
      title: 'Site export',
      fetchImpl: async (url, init = {}) => {
        if (url.endsWith('/backups')) return new Response(JSON.stringify({ latest: { version: 3 } }))
        posts.push(init)
        return new Response(JSON.stringify({ code: 'BACKUP_PENDING' }), { status: 202 })
      },
      sleep: async () => undefined
    }),
    { message: 'BACKUP_PENDING' }
  )
  assert.equal(posts.length, 1)
})
