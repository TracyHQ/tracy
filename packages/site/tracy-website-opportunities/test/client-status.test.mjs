/**
 * What the screen says about a job, a source and a build. Partial and blocked are never drawn as
 * complete, a reason the screen does not know is still shown as "other", and polling runs only while
 * something is still moving.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildView, jobView, reasonKey, shouldPoll, siteLinks, sourceRow } from '../src/client/status.ts'

test('each source status keeps its own label and tone', () => {
  assert.deepEqual(
    sourceRow({ source: 'website', status: 'complete', coverage: { fetched: 12, total: 12 } }),
    {
      source: 'website',
      statusKey: 'source.status.complete',
      tone: 'ok',
      reasonKey: null,
      fetched: 12,
      total: 12,
      retryable: false
    }
  )
  const partial = sourceRow({
    source: 'youtube',
    status: 'partial',
    reason: 'quota',
    coverage: { fetched: 26 }
  })
  assert.equal(partial.statusKey, 'source.status.partial')
  assert.equal(partial.tone, 'partial')
  assert.equal(partial.reasonKey, 'reason.quota')
  assert.equal(partial.total, null)
  const blocked = sourceRow({ source: 'instagram', status: 'blocked', reason: 'credential_missing' })
  assert.equal(blocked.tone, 'blocked')
  assert.equal(blocked.reasonKey, 'reason.credential_missing')
  assert.equal(blocked.fetched, 0)
})

test('an unknown status waits, an unknown reason is "other"', () => {
  assert.equal(sourceRow({ source: 'tiktok', status: 'pending' }).statusKey, 'source.status.waiting')
  assert.equal(sourceRow({ source: 'tiktok', status: 'failed', reason: 'weird' }).reasonKey, 'reason.other')
})

test('a skipped source reads as skipped with its reason, not as waiting', () => {
  const row = sourceRow({ source: 'tripadvisor', status: 'skipped', reason: 'not_found' })
  assert.equal(row.statusKey, 'source.status.skipped')
  assert.equal(row.tone, 'skipped')
  assert.equal(row.reasonKey, 'reason.not_found')
})

test('Retry is offered on a blocked, failed or skipped source of the place, never on a collected one or the account own link', () => {
  for (const status of ['blocked', 'failed', 'skipped'])
    for (const source of [
      'website',
      'facebook',
      'instagram',
      'tiktok',
      'youtube',
      'google-places',
      'google-maps',
      'tripadvisor'
    ])
      assert.equal(sourceRow({ source, status, shared: true }).retryable, true, `${source} ${status}`)
  assert.equal(sourceRow({ source: 'facebook', status: 'complete', shared: true }).retryable, false)
  assert.equal(sourceRow({ source: 'facebook', status: 'partial', shared: true }).retryable, false)
  assert.equal(sourceRow({ source: 'facebook', status: 'pending', shared: true }).retryable, false)
  assert.equal(sourceRow({ source: 'facebook', status: 'blocked', shared: false }).retryable, false)
  assert.equal(
    sourceRow({ source: 'facebook', status: 'blocked' }).retryable,
    false,
    'per-account research has no place to retry'
  )
  assert.equal(sourceRow({ source: 'url', status: 'failed', shared: true }).retryable, false)
})

test('a job says what can be done with it', () => {
  assert.deepEqual(jobView({ state: 'running', stage: 'collection' }), {
    stateKey: 'job.state.running',
    stageKey: 'job.stage.collection',
    running: true,
    canResume: false,
    canCancel: true,
    reasonKey: null
  })
  const paused = jobView({ state: 'paused', lastError: { code: 'FEATURE_OFF' } })
  assert.equal(paused.canResume, true)
  assert.equal(paused.canCancel, true)
  assert.equal(paused.running, false)
  assert.equal(paused.reasonKey, 'reason.feature_off')
  const done = jobView({ state: 'completed' })
  assert.equal(done.canResume, false)
  assert.equal(done.canCancel, false)
  assert.equal(jobView({ state: 'cancelled' }).canResume, false)
  assert.equal(jobView({ state: 'failed', last_error: { code: 'timeout' } }).reasonKey, 'reason.timeout')
  assert.equal(jobView(null), null)
})

test('polling runs while a job or a build is queued or running, and stops otherwise', () => {
  assert.equal(shouldPoll([{ job: { state: 'queued' } }]), true)
  assert.equal(shouldPoll([{ job: { state: 'completed' } }, { job: null }]), false)
  assert.equal(shouldPoll([], [{ state: 'running' }]), true)
  assert.equal(shouldPoll([], [{ state: 'completed' }]), false)
})

test('a finished build links to the site in Tracy and to its live address', () => {
  assert.deepEqual(siteLinks({ key: 'pho-hoa', address: 'https://pho-hoa.tracy.site' }), {
    workspace: '/pho-hoa/',
    live: 'https://pho-hoa.tracy.site'
  })
  // An address that is not http(s) is never a link.
  assert.deepEqual(siteLinks({ key: 'a b', address: 'javascript:alert(1)' }), {
    workspace: '/a%20b/',
    live: null
  })
  assert.equal(siteLinks(null), null)
})

test('a build answer becomes running, done or failed', () => {
  assert.equal(buildView({ build: { state: 'running' }, site: null }).phase, 'running')
  const done = buildView({ build: { state: 'completed' }, site: { key: 'pho', address: null } })
  assert.equal(done.phase, 'done')
  assert.deepEqual(done.links, { workspace: '/pho/', live: null })
  assert.equal(
    buildView({ build: { state: 'failed', lastError: { code: 'TEMPLATE_UNSELECTED' } } }).phase,
    'failed'
  )
  assert.equal(
    buildView({ build: { state: 'failed', lastError: { code: 'TEMPLATE_UNSELECTED' } } }).reasonKey,
    'reason.template_unselected'
  )
  // A site that exists while the build still runs is linked, but the build is not called done.
  const early = buildView({ build: { state: 'running' }, site: { key: 'pho' } })
  assert.equal(early.phase, 'running')
  assert.deepEqual(early.links, { workspace: '/pho/', live: null })
})

test('a build whose demo was deleted is neither done nor linked (stand wo2: Open the site went to a 404)', () => {
  const gone = buildView({
    build: { state: 'deleted' },
    site: { key: 'pho', address: 'https://pho.example' },
    siteJob: { state: 'done' }
  })
  assert.equal(gone.phase, 'deleted')
  assert.equal(gone.links, null)
})

// The build door's real answer: `{build: {state: 'requesting'|'provisioning'|'refused', receipt}, site, siteJob}`;
// the site is ready when the create door's own row (`siteJob.state`) says `done`.
test('a build is done only when its site job is done, and failed when refused or its site job failed', () => {
  const site = { key: 'pho', address: 'https://pho.tracy.site/' }
  assert.equal(buildView({ build: { state: 'requesting' }, site: null, siteJob: null }).phase, 'running')
  const provisioning = buildView({
    build: { state: 'provisioning' },
    site,
    siteJob: { id: 'j', state: 'provisioning' }
  })
  assert.equal(provisioning.phase, 'running')
  assert.deepEqual(provisioning.links, { workspace: '/pho/', live: 'https://pho.tracy.site/' })
  assert.equal(
    buildView({ build: { state: 'provisioning' }, site, siteJob: { id: 'j', state: 'done' } }).phase,
    'done'
  )
  const failed = buildView({ build: { state: 'provisioning' }, site, siteJob: { id: 'j', state: 'failed' } })
  assert.deepEqual([failed.phase, failed.reasonKey], ['failed', 'reason.other'])
  const refused = buildView({
    build: { state: 'refused', receipt: { status: 409, body: { code: 'TEMPLATE_UNAVAILABLE' } } },
    site: null,
    siteJob: null
  })
  assert.deepEqual([refused.phase, refused.reasonKey], ['failed', 'reason.template_unavailable'])
})

test('settings and build refusals the server names have their own words', () => {
  assert.equal(reasonKey('NO_TEMPLATE_FOR_CMS'), 'reason.no_template_for_cms')
  assert.equal(reasonKey('TEMPLATES_UNREADABLE'), 'reason.templates_unreadable')
})
