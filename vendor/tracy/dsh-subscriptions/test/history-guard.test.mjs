import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { HistoryStore, resolveHistoryDir } from '../lib/history.js'

test('#411: resolveHistoryDir respects environment variables over homedir', () => {
  const custom = '/tmp/custom-hist'
  assert.equal(resolveHistoryDir(custom), custom)

  const originalEnv = process.env.DSH_HISTORY_DIR
  try {
    process.env.DSH_HISTORY_DIR = '/tmp/env-hist'
    assert.equal(resolveHistoryDir(), '/tmp/env-hist')
  } finally {
    process.env.DSH_HISTORY_DIR = originalEnv
  }
})

test('#411: HistoryStore writes only into isolated test directory and never touches real ~/.dsh', () => {
  const realHistoryPath = join(homedir(), '.dsh', 'storages', 'dsh-subscriptions', 'history.json')
  let realMtimeBefore = null
  if (existsSync(realHistoryPath)) {
    realMtimeBefore = statSync(realHistoryPath).mtimeMs
  }

  // Creating store with default arguments must target process.env.DSH_HISTORY_DIR
  assert.ok(process.env.DSH_HISTORY_DIR, 'test environment must provide DSH_HISTORY_DIR via _setup.mjs')
  const store = new HistoryStore()
  assert.equal(store.dir, process.env.DSH_HISTORY_DIR)
  store.add({ provider: 'test', model: 'test-model', ms: 100 })
  store.flush()

  // Real production file must be untouched
  if (realMtimeBefore !== null) {
    const realMtimeAfter = statSync(realHistoryPath).mtimeMs
    assert.equal(realMtimeAfter, realMtimeBefore, 'real ~/.dsh history.json was modified by test!')
  }
})
