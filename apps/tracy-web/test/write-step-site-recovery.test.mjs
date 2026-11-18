import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runWithSiteRecovery } from '../src/write-step/site-recovery.js'

const point = { version: 1, sha: 'a'.repeat(40), database: { state: 'full', sha256: 'b'.repeat(64) } }
function scenario({
  health = ['healthy', 'broken', 'broken', 'healthy'],
  backup = point,
  result,
  restore
} = {}) {
  const calls = []
  const door = {
    recoveryPoint: async () => backup,
    restorePoint: async (key, pinned, idemKey) => {
      calls.push({ key, pinned, idemKey })
      return restore ?? { ok: true, operationId: 'restore-1' }
    }
  }
  let writes = 0
  return {
    calls,
    writes: () => writes,
    run: () =>
      runWithSiteRecovery({
        door,
        siteKey: 'fitness.sites.example',
        runId: 'run-1',
        sleep: async () => {},
        probe: async () => ({ state: health.shift() ?? 'unknown' }),
        run: async () => {
          writes++
          return result ?? { report: { status: 'stopped' }, repair: null, writersSettled: true }
        }
      })
  }
}

test('a write that breaks a previously healthy site restores its pinned full backup and verifies the home', async () => {
  const s = scenario()
  const out = await s.run()
  assert.equal(s.writes(), 1)
  assert.equal(s.calls.length, 1)
  assert.deepEqual(s.calls[0].pinned, point)
  assert.equal(out.recovery.status, 'restored')
  assert.equal(out.report.status, 'stopped', 'a restored template is not a verified personalized site')
})

test('ordinary content faults and transient reads never restore the template', async () => {
  for (const health of [
    ['healthy', 'healthy'],
    ['healthy', 'unknown'],
    ['healthy', 'broken', 'healthy']
  ]) {
    const s = scenario({ health })
    await s.run()
    assert.equal(s.calls.length, 0)
  }
})

test('a missing full baseline refuses writes instead of advertising a files-only recovery point', async () => {
  const s = scenario({ backup: null })
  const out = await s.run()
  assert.equal(s.writes(), 0)
  assert.equal(out.report.cause.code, 'SITE_RECOVERY_POINT_UNAVAILABLE')
})

test('pending and failed backup reads preserve uncertainty and never allow writes', async () => {
  for (const code of ['SITE_RECOVERY_POINT_PENDING', 'NETWORK_TIMEOUT']) {
    let writes = 0
    const out = await runWithSiteRecovery({
      door: {
        recoveryPoint: async () => {
          throw Object.assign(new Error('not settled'), { code })
        }
      },
      siteKey: 'fitness.sites.example',
      runId: 'run-1',
      probe: async () => assert.fail('no health probe without a proven point'),
      run: async () => {
        writes++
      }
    })
    assert.equal(writes, 0)
    assert.equal(
      out.report.cause.code,
      code === 'SITE_RECOVERY_POINT_PENDING'
        ? 'SITE_RECOVERY_POINT_PENDING'
        : 'SITE_RECOVERY_POINT_UNVERIFIED'
    )
    assert.notEqual(out.recovery.status, 'no-full-backup')
  }
})

test('an open repair writer prevents a full restore from racing its writes', async () => {
  const s = scenario({
    result: { report: { status: 'stopped' }, repair: { turns: [{ state: 'open', leftOpen: true }] } }
  })
  const out = await s.run()
  assert.equal(s.calls.length, 0)
  assert.equal(out.recovery.status, 'writer-open')
})

test('a pending restore or failed read-back is never reported as restored', async () => {
  const pending = scenario({ restore: { ok: false, code: 'RESTORE_PENDING' } })
  assert.equal((await pending.run()).recovery.status, 'failed')
  const unreadable = scenario({ health: ['healthy', 'broken', 'broken', 'broken'] })
  assert.equal((await unreadable.run()).recovery.status, 'unverified')
})

test('home recovery probes distinguish confirmed CMS failure from network and access failures', async () => {
  const { probeSiteHome } = await import('../src/write-step/site-recovery.js')
  const probe = (status, html = '<!doctype html><html><body>Fitness</body></html>') =>
    probeSiteHome({
      site: {},
      readers: { readOrigin: () => 'http://site-web:80/' },
      fetchImpl: async () => ({ status, ok: status === 200, text: async () => html })
    })
  assert.equal((await probe(200)).state, 'healthy')
  assert.equal((await probe(503)).state, 'broken')
  assert.equal(
    (
      await probe(
        200,
        '<html><b>Fatal error</b>: Uncaught Error: Failed opening required file in /site/index.php'
      )
    ).state,
    'broken'
  )
  assert.equal(
    (await probe(200, '<html>Article: Fatal error: failed opening required file')).state,
    'healthy'
  )
  assert.equal((await probe(403)).state, 'unknown')
  assert.equal(
    (
      await probeSiteHome({
        site: {},
        readers: { readOrigin: () => 'http://site-web/' },
        fetchImpl: async () => {
          throw new Error('timeout')
        }
      })
    ).state,
    'unknown'
  )
})

test('missing settlement evidence prevents a restore even when no open turn is listed', async () => {
  const s = scenario({ result: { report: { status: 'stopped' }, repair: { turns: [] } } })
  assert.equal((await s.run()).recovery.status, 'writer-open')
  assert.equal(s.calls.length, 0)
})

test('step 9 proves native writer settlement from every prompted request record', async () => {
  const { stepNine, fakeAgent, checkOf, failure } = await import('./_write-step-nine-repair.mjs')
  const fault = failure('demo-words', '/', 'module-2.1', 'Demo Gym')
  const closed = await stepNine({ checks: [checkOf([fault]), checkOf([])], agent: fakeAgent() })
  assert.equal(closed.result.writersSettled, true)
  const missing = await stepNine({
    checks: [checkOf([fault])],
    agent: fakeAgent({ behave: () => ({ silent: true }) })
  })
  assert.equal(missing.result.writersSettled, false, 'a dropped native request can still run later')
})

test('a canceled recovery read receives the run signal and cannot start health probes or writes', async () => {
  const controller = new AbortController()
  controller.abort(new Error('run canceled'))
  let probes = 0
  let writes = 0
  const result = await runWithSiteRecovery({
    siteKey: 'fitness.sites.example',
    runId: 'canceled-run',
    signal: controller.signal,
    door: {
      recoveryPoint: async (_key, { signal }) => {
        signal.throwIfAborted()
      }
    },
    probe: async () => {
      probes++
      return { state: 'healthy' }
    },
    run: async () => {
      writes++
    },
    sleep: async () => {}
  })
  assert.equal(result.report.status, 'stopped')
  assert.equal(probes, 0)
  assert.equal(writes, 0)
})
