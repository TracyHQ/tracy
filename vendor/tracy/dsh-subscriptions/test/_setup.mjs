import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testHome = mkdtempSync(join(tmpdir(), 'dsub-test-env-'))
process.env.DSH_HOME = testHome
process.env.DSH_HISTORY_DIR = join(testHome, 'storages', 'dsh-subscriptions')
process.env.DSH_STORAGE_DIR = join(testHome, 'storages', 'dsh-subscriptions')
try {
  mkdirSync(process.env.DSH_HISTORY_DIR, { recursive: true })
} catch { /* ignore */ }
