import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ensureLaneSeats, fixtureEmail } from '../qa/stand/fixtures.mjs'

test('each lane gets one standing account', () => {
  assert.equal(fixtureEmail('sonnet'), 'fixture@sonnet.qa.tracy.test')
})

test('seats are granted by SQL in the QA stand database only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-fix-'))
  const log = path.join(dir, 'calls')
  const fake = path.join(dir, 'docker')
  writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${log}\n`)
  chmodSync(fake, 0o755)
  try {
    const r = ensureLaneSeats({ lanes: ['sonnet', 'sol'], sites: ['qa-fixedwp'], docker: fake })
    assert.equal(r.ok, true)
    assert.equal(r.granted.length, 2)
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    assert.equal(calls.length, 2)
    for (const c of calls) {
      assert.match(c, /^exec tracy-qa-postgres-1 psql /)
      assert.match(c, /qa-fixedwp\.qa\.tracy\.test/)
      assert.match(c, /'admin'/)
    }
    assert.match(calls[0], /fixture@sonnet\.qa\.tracy\.test/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
