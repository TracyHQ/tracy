/**
 * The pure half of the app's self-update (`src/update-plan.js`): when the next check runs, what the
 * request headers say, and whether this copy can replace itself.
 *
 *   node --test packages/desktop/tracy-desktop/test/update-plan.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const plan = require('../src/update-plan.js')

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

test('after a good check the next one is four hours away, give or take fifteen percent', () => {
  assert.equal(plan.nextCheckDelay({ failures: 0, random: 0.5 }), 4 * HOUR)
  assert.equal(plan.nextCheckDelay({ failures: 0, random: 0 }), 204 * MINUTE)
  assert.equal(plan.nextCheckDelay({ failures: 0, random: 1 }), 276 * MINUTE)
})

test('failed checks back off 5, 10, 20, 40 minutes, then stay at 60 and never give up', () => {
  const delays = [1, 2, 3, 4, 5, 6, 50].map((failures) => plan.nextCheckDelay({ failures, random: 0.5 }))
  assert.deepEqual(
    delays,
    [5, 10, 20, 40, 60, 60, 60].map((m) => m * MINUTE)
  )
})

test('a shortened interval (test runs only) keeps the jitter, and a backoff never outlasts it', () => {
  assert.equal(plan.CHECK_INTERVAL_MS, 4 * HOUR)
  assert.equal(plan.nextCheckDelay({ failures: 0, random: 0.5, intervalMs: 2 * MINUTE }), 2 * MINUTE)
  assert.equal(plan.nextCheckDelay({ failures: 0, random: 1, intervalMs: 2 * MINUTE }), 138_000)
  assert.equal(plan.nextCheckDelay({ failures: 1, random: 0.5, intervalMs: 2 * MINUTE }), 2 * MINUTE)
  // The real interval leaves the backoff as it was.
  assert.equal(plan.nextCheckDelay({ failures: 5, random: 0.5 }), 60 * MINUTE)
})

test('the request headers say which app, version, channel, arch and macOS is asking', () => {
  assert.deepEqual(
    plan.updateHeaders({ version: '0.2.0', channel: 'dev', arch: 'arm64', osVersion: '27.0.1' }),
    {
      'Cache-Control': 'no-cache',
      'App-Name': 'Tracy Cowork',
      'App-Version': '0.2.0',
      'X-Channel': 'dev',
      'X-Arch': 'arm64',
      'X-OS-Version': '27.0.1'
    }
  )
})

test('a certificate signature can take an update in place; ad-hoc or unsigned only hears about it', () => {
  const developerId = [
    'Executable=/Applications/Tracy Cowork.app/Contents/MacOS/Tracy Cowork',
    'Authority=Developer ID Application: ADHD Studio Limited (9S5F8693FB)',
    'Authority=Developer ID Certification Authority',
    'Authority=Apple Root CA',
    'TeamIdentifier=9S5F8693FB'
  ].join('\n')
  const adhoc = [
    'Executable=/x/Tracy Cowork.app/Contents/MacOS/Tracy Cowork',
    'Signature=adhoc',
    'TeamIdentifier=not set'
  ].join('\n')
  const selfSigned = [
    'Executable=/x/MacOS/Tracy Cowork Spike',
    'Authority=Tracy Spike Signer',
    'TeamIdentifier=not set'
  ].join('\n')
  assert.equal(plan.canInstallInPlace(developerId), true)
  assert.equal(plan.canInstallInPlace(selfSigned), true)
  assert.equal(plan.canInstallInPlace(adhoc), false)
  assert.equal(plan.canInstallInPlace(''), false)
})

test('which updater a packaged copy runs, and whether it can replace itself, per platform', () => {
  const developerId = 'Authority=Developer ID Application: Tracy (9S5F8693FB)\n'
  // macOS: Squirrel.Mac, in place only with a certificate signature (as before).
  assert.deepEqual(plan.selfUpdateMode({ platform: 'darwin', env: {}, codesignOutput: developerId }), {
    updater: 'MacUpdater',
    inPlace: true
  })
  assert.deepEqual(
    plan.selfUpdateMode({ platform: 'darwin', env: {}, codesignOutput: 'Signature=adhoc\n' }),
    {
      updater: 'MacUpdater',
      inPlace: false
    }
  )
  // Windows: NSIS, unsigned by decision (D1) — the signed feed is what is trusted, so it installs in place.
  assert.deepEqual(plan.selfUpdateMode({ platform: 'win32', env: {} }), {
    updater: 'NsisUpdater',
    inPlace: true
  })
  // Linux: an AppImage (the runtime sets APPIMAGE) replaces itself; anything else (.deb) only offers the link.
  assert.deepEqual(plan.selfUpdateMode({ platform: 'linux', env: { APPIMAGE: '/home/a/Tracy.AppImage' } }), {
    updater: 'AppImageUpdater',
    inPlace: true
  })
  assert.deepEqual(plan.selfUpdateMode({ platform: 'linux', env: {} }), {
    updater: 'DebUpdater',
    inPlace: false
  })
  assert.deepEqual(plan.selfUpdateMode({ platform: 'linux', env: { APPIMAGE: '' } }), {
    updater: 'DebUpdater',
    inPlace: false
  })
  assert.equal(plan.selfUpdateMode({ platform: 'freebsd', env: {} }), null)
})

// ── Minimum version policy (tasks/todo-desktop-update-policy.md C4) ──────────────────────────────

const DAY = 24 * HOUR
const NOW = Date.parse('2026-10-20T00:00:00Z')

test('no policy, or a policy without a minimum, never stops the app', () => {
  assert.deepEqual(plan.policyOf({ running: '0.5.1', policy: null, now: NOW }), {
    level: 'ok',
    minimumVersion: null,
    after: null
  })
  assert.equal(plan.policyOf({ running: '0.5.1', policy: { policyRevision: 3 }, now: NOW }).level, 'ok')
})

test('a version at or above the minimum is ok', () => {
  const policy = { minimumVersion: '0.6.0', policyRevision: 1 }
  assert.equal(plan.policyOf({ running: '0.6.0', policy, now: NOW }).level, 'ok')
  assert.equal(plan.policyOf({ running: '0.7.2', policy, now: NOW }).level, 'ok')
})

test('below the minimum with no date: blocked now', () => {
  const policy = { minimumVersion: '0.6.0', policyRevision: 1 }
  assert.deepEqual(plan.policyOf({ running: '0.5.9', policy, now: NOW }), {
    level: 'blocked',
    minimumVersion: '0.6.0',
    after: null
  })
})

test('below the minimum before its date: warn with the deadline; at the date: blocked', () => {
  const policy = { minimumVersion: '0.6.0', minimumVersionAfter: '2026-10-21T00:00:00Z', policyRevision: 2 }
  assert.deepEqual(plan.policyOf({ running: '0.5.1', policy, now: NOW }), {
    level: 'warn',
    minimumVersion: '0.6.0',
    after: NOW + DAY
  })
  assert.equal(plan.policyOf({ running: '0.5.1', policy, now: NOW + DAY }).level, 'blocked')
})

test('dev builds order by their number, and a release ranks above its dev builds', () => {
  const policy = { minimumVersion: '0.6.0-dev.12', policyRevision: 1 }
  assert.equal(plan.policyOf({ running: '0.6.0-dev.11', policy, now: NOW }).level, 'blocked')
  assert.equal(plan.policyOf({ running: '0.6.0-dev.12', policy, now: NOW }).level, 'ok')
  assert.equal(plan.policyOf({ running: '0.6.0-dev.100', policy, now: NOW }).level, 'ok')
  assert.equal(plan.compareVersions('0.6.0', '0.6.0-dev.999') > 0, true)
  assert.equal(plan.compareVersions('0.10.0', '0.9.9') > 0, true)
})

test('a running version that is not X.Y.Z[-dev.N] is never blocked (a source run, a preview)', () => {
  const policy = { minimumVersion: '0.6.0', policyRevision: 1 }
  assert.equal(plan.policyOf({ running: '0.0.0-local', policy, now: NOW }).level, 'ok')
})

test('acceptPolicy takes only a higher revision than the stored one', () => {
  const stored = { policy: { minimumVersion: '0.6.0', policyRevision: 4 }, revision: 4 }
  const raised = { minimumVersion: '0.7.0', policyRevision: 5 }
  const lowered = { minimumVersion: '0.5.0', policyRevision: 6 }
  const replay = { minimumVersion: '0.5.0', policyRevision: 3 }
  assert.equal(plan.acceptPolicy(null, raised), true)
  assert.equal(plan.acceptPolicy(stored, raised), true)
  // Lowering is a deliberate new revision, so it passes.
  assert.equal(plan.acceptPolicy(stored, lowered), true)
  // An old signed file served again (a replay) is ignored, and so is the same revision again.
  assert.equal(plan.acceptPolicy(stored, replay), false)
  assert.equal(plan.acceptPolicy(stored, { minimumVersion: '0.6.0', policyRevision: 4 }), false)
  // A feed with no policy lines is revision 0: below any stored policy.
  assert.equal(plan.acceptPolicy(stored, null), false)
  assert.equal(plan.acceptPolicy(null, null), false)
})

// ── What's new (D2) ───────────────────────────────────────────────────────────────────────────────

test('whatsNewDecision: only a higher minor or major is news; a patch or a fresh install is not', () => {
  assert.deepEqual(plan.whatsNewDecision({ lastRun: '0.5.1', running: '0.6.0' }), {
    from: '0.5.1',
    to: '0.6.0',
    page: '0.6'
  })
  assert.deepEqual(plan.whatsNewDecision({ lastRun: '0.6.3', running: '1.0.0' }), {
    from: '0.6.3',
    to: '1.0.0',
    page: '1.0'
  })
  assert.equal(plan.whatsNewDecision({ lastRun: '0.6.0', running: '0.6.1' }), null)
  assert.equal(plan.whatsNewDecision({ lastRun: '0.6.1', running: '0.6.1' }), null)
  assert.equal(plan.whatsNewDecision({ lastRun: null, running: '0.6.0' }), null)
  // A downgrade is not news.
  assert.equal(plan.whatsNewDecision({ lastRun: '0.7.0', running: '0.6.0' }), null)
})

test('whatsNewDecision: dev builds compare by the part before the dash', () => {
  assert.deepEqual(plan.whatsNewDecision({ lastRun: '0.5.1', running: '0.6.0-dev.3' }), {
    from: '0.5.1',
    to: '0.6.0-dev.3',
    page: '0.6'
  })
  assert.equal(plan.whatsNewDecision({ lastRun: '0.6.0-dev.3', running: '0.6.0-dev.4' }), null)
})

test('whatsNewDecision: an earlier run with no recorded version (an app from before this) counts as older', () => {
  assert.deepEqual(plan.whatsNewDecision({ lastRun: null, earlierRun: true, running: '0.6.0' }), {
    from: null,
    to: '0.6.0',
    page: '0.6'
  })
})

// ── Restart reminder (A3) ─────────────────────────────────────────────────────────────────────────

test('reminderDue: none before three days ready, then one a day', () => {
  const since = NOW
  assert.equal(plan.REMIND_AFTER_MS, 3 * DAY)
  assert.equal(plan.reminderDue({ readySince: null, lastRemindedAt: null, now: NOW + 9 * DAY }), false)
  assert.equal(plan.reminderDue({ readySince: since, lastRemindedAt: null, now: since + 3 * DAY - 1 }), false)
  assert.equal(plan.reminderDue({ readySince: since, lastRemindedAt: null, now: since + 3 * DAY }), true)
  const shown = since + 3 * DAY
  assert.equal(plan.reminderDue({ readySince: since, lastRemindedAt: shown, now: shown + DAY - 1 }), false)
  assert.equal(plan.reminderDue({ readySince: since, lastRemindedAt: shown, now: shown + DAY }), true)
  // A test run shortens both waits.
  assert.equal(
    plan.reminderDue({ readySince: since, lastRemindedAt: null, now: since + 60_000, afterMs: 60_000 }),
    true
  )
})
