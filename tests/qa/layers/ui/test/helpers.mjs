// Shared helpers of the ui selftests. Scratch files go to QA_UI_ARTIFACT_ROOT when set (the
// workflow's artifact directory), otherwise to the OS temp dir; nothing is written into the repo.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { Ledger, EnvError, launchBrowser } from '../browser.mjs'

export async function tempDir(label) {
  const root = process.env.QA_UI_ARTIFACT_ROOT || path.join(tmpdir(), 'qa-ui')
  await mkdir(root, { recursive: true })
  return mkdtemp(path.join(root, `${label}-`))
}

export async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true })
}

/**
 * Launch the owned browser. Returns { browser, ledger, dir } or { error } when chromium cannot run
 * here; a test then asserts that the failure is classified as ENV, which is the behaviour under test.
 */
export async function tryBrowser() {
  const dir = await tempDir('ui-browser')
  const ledger = new Ledger(path.join(dir, 'owned.json'))
  try {
    const browser = await launchBrowser({ ledger, outDir: dir })
    return { browser, ledger, dir }
  } catch (error) {
    return { error, dir }
  }
}

export function assertEnvError(assert, error) {
  assert.ok(error instanceof EnvError, `expected EnvError, got ${error}`)
  assert.ok(error.probe, 'EnvError must name its probe')
}
