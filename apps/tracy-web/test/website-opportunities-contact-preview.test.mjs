import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareDemoContact, createDemoContactPreview } from 'website-opportunities/src/contact-preview.js'

const site = { site_key: 'bistro.test', label: 'bistro', host: 'local', platform: 'joomla' }
const build = { site_key: site.site_key }
const revision = { cms: 'joomla', template: { quickstart: 'tracy-business/j6' } }

test('only the Joomla Business site of this Website Opportunities build prepares its native form', async () => {
  const calls = []
  const runJob = async (...args) => {
    calls.push(args)
    return { ok: true, output: 'installing\n{"ok":true,"preview":true}' }
  }
  assert.deepEqual(await prepareDemoContact({ site, build, revision, runJob }), { ok: true, preview: true })
  assert.deepEqual(calls, [[site, { kind: 'site-demo-contact' }]])
  for (const input of [
    { site: null },
    { site: { ...site, platform: 'wordpress' } },
    { build: { site_key: 'another.test' } },
    { revision: { ...revision, cms: 'wordpress' } },
    { revision: { ...revision, template: { quickstart: 'ja-restaurant/j6' } } }
  ])
    assert.deepEqual(await prepareDemoContact({ site, build, revision, runJob, ...input }), {
      ok: true,
      skipped: true
    })
  assert.equal(calls.length, 1)
})

test('a refused install or an unreadable receipt never claims the demo form is prepared', async () => {
  for (const result of [
    { ok: false, reason: 'HOST_JOB_FAILED' },
    { ok: true, output: 'not JSON' },
    { ok: true, output: '{"ok":false}' }
  ]) {
    const answer = await prepareDemoContact({ site, build, revision, runJob: async () => result })
    assert.equal(answer.ok, false)
    assert.ok(answer.reason)
  }
})

test('the installer is polled to completion and host failures prevent a successful hand-off', async () => {
  const calls = []
  let poll = 0
  const host = {
    hostCall: async (...args) => {
      calls.push(args)
      return { ok: true, body: { jobId: 'job' } }
    },
    hostJob: async () => ({
      ok: true,
      body: ++poll === 1 ? { state: 'running' } : { state: 'done', output: '{"ok":true,"preview":true}' }
    })
  }
  const prepare = createDemoContactPreview({ config: {}, host, delay: async () => {} })
  assert.deepEqual(await prepare({ site, build, revision }), { ok: true, preview: true })
  assert.equal(poll, 2)
  assert.deepEqual(calls[0].slice(1, 4), ['local', '/site', { kind: 'site-demo-contact', label: 'bistro' }])
  host.hostJob = async () => ({ ok: true, body: { state: 'failed' } })
  assert.deepEqual(await prepare({ site, build, revision }), { ok: false, reason: 'HOST_JOB_FAILED' })
  host.hostCall = async () => ({ ok: false })
  assert.deepEqual(await prepare({ site, build, revision }), { ok: false, reason: 'HOST_REFUSED' })
})

test('a retry resumes the recorded host job instead of installing twice', async () => {
  const recorded = []
  const prepare = createDemoContactPreview({
    config: {},
    findJob: async () => ({ id: 'held-job' }),
    recordResult: async (...args) => recorded.push(args),
    host: {
      hostCall: async () => {
        throw new Error('must resume the existing job')
      },
      hostJob: async (_config, _host, id) => {
        assert.equal(id, 'held-job')
        return { ok: true, body: { state: 'done', output: '{"ok":true,"reused":true}' } }
      }
    }
  })
  assert.deepEqual(await prepare({ site, build, revision }), { ok: true, reused: true })
  assert.equal(recorded[0][0], 'held-job')
  assert.equal(recorded[0][1].state, 'done')
})

test('a failed contact preparation saves no ready hand-off and uploads no pictures', async () => {
  const { handOff } = await import('../src/opportunities-build/handoff.js')
  const queries = []
  const result = await handOff({
    pool: {
      query: async (sql) => {
        queries.push(sql)
        return { rows: [] }
      }
    },
    request: async () => Response.json({ state: 'done' }),
    objects: {
      get: async () => {
        throw new Error('must not upload before the form is prepared')
      }
    },
    domain: { HANDOFF_FOLDER: { joomla: 'images' } },
    origin: 'http://tracy.test',
    cookie: '',
    build: { site_key: site.site_key, site_job_id: 'job' },
    revision,
    prepareContact: async () => ({ ok: false, reason: 'HOST_JOB_FAILED' })
  })
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'CONTACT_PREVIEW_FAILED')
  assert.equal(result.body.reason, 'HOST_JOB_FAILED')
  assert.deepEqual(queries, ['select state from site_brief where site_key = $1'])
})
