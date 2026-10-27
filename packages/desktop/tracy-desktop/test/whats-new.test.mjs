/**
 * "What's new" after an update (src/whats-new.js, tasks/todo-desktop-update-policy.md D3/D4): decided
 * once per start from the last run's version, kept in preferences.json until Help & about shows it,
 * announced by at most one system notification per main process.
 *
 *   node --test packages/desktop/tracy-desktop/test/whats-new.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPreferences } = require('../src/preferences.js')
const { createWhatsNew } = require('../src/whats-new.js')

function device(saved) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'whats-new-')), 'preferences.json')
  if (saved !== undefined) writeFileSync(file, JSON.stringify(saved))
  const prefs = () => createPreferences({ file, log: () => {} })
  const run = (running, { earlierRun = false } = {}) =>
    createWhatsNew({ prefs: prefs(), running, earlierRun, log: () => {} })
  return { run, prefs }
}

const lastRun = (version, extra = {}) => ({
  autoCheck: true,
  whatsNew: { pending: null, lastRunVersion: version, notify: true, ...extra }
})

test('0.5.1 → 0.6.0: pending, and this run is recorded in the same write', async () => {
  const d = device(lastRun('0.5.1'))
  const news = d.run('0.6.0')
  await news.start()
  assert.deepEqual(news.current(), { pending: { from: '0.5.1', to: '0.6.0', page: '0.6' }, notify: true })
  assert.deepEqual(d.prefs().read().whatsNew, {
    pending: { from: '0.5.1', to: '0.6.0', page: '0.6' },
    lastRunVersion: '0.6.0',
    notify: true
  })
})

test('quitting before Help & about was seen keeps the news for the next start (S-D2)', async () => {
  const d = device(lastRun('0.5.1'))
  await d.run('0.6.0').start()
  const again = d.run('0.6.0')
  await again.start()
  assert.equal(again.current().pending?.to, '0.6.0')
})

test('seen() clears it for good: the next start does not announce it again', async () => {
  const d = device(lastRun('0.5.1'))
  const news = d.run('0.6.0')
  await news.start()
  await news.seen()
  assert.equal(news.current().pending, null)
  const next = d.run('0.6.0')
  await next.start()
  assert.equal(next.current().pending, null)
})

test('a patch (0.6.0 → 0.6.1) and a fresh install are not news', async () => {
  const patch = device(lastRun('0.6.0'))
  const a = patch.run('0.6.1')
  await a.start()
  assert.equal(a.current().pending, null)
  assert.equal(patch.prefs().read().whatsNew.lastRunVersion, '0.6.1')
  const fresh = device()
  const b = fresh.run('0.6.0')
  await b.start()
  assert.equal(b.current().pending, null)
  assert.equal(fresh.prefs().read().whatsNew.lastRunVersion, '0.6.0')
})

test('an app from before lastRunVersion (it ran here, recorded nothing) gets the news', async () => {
  const d = device({ autoCheck: true })
  const news = d.run('0.6.0', { earlierRun: true })
  await news.start()
  assert.deepEqual(news.current().pending, { from: null, to: '0.6.0', page: '0.6' })
})

test('one notification per main process, only when pending and the switch is on', async () => {
  const d = device(lastRun('0.5.1'))
  const news = d.run('0.6.0')
  await news.start()
  const shown = []
  news.notifyOnce((pending) => shown.push(pending.to))
  news.notifyOnce((pending) => shown.push(pending.to))
  assert.deepEqual(shown, ['0.6.0'])
  const off = device(lastRun('0.5.1', { notify: false })).run('0.6.0')
  await off.start()
  off.notifyOnce(() => shown.push('off'))
  assert.deepEqual(shown, ['0.6.0'])
  // The dot and the box do not depend on the switch.
  assert.equal(off.current().pending?.to, '0.6.0')
})

test('setNotify saves the switch; watchers hear every change', async () => {
  const d = device(lastRun('0.5.1'))
  const news = d.run('0.6.0')
  const heard = []
  news.onChange((state) => heard.push(state))
  await news.start()
  await news.setNotify(false)
  await news.seen()
  assert.equal(d.prefs().read().whatsNew.notify, false)
  assert.deepEqual(heard.at(-1), { pending: null, notify: false })
  assert.ok(heard.length >= 3)
  await assert.rejects(news.setNotify('no'))
})
