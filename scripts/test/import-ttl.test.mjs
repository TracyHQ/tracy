// The order of the three windows an unfinished import lives by (PR #1598 part 2):
// tracy-web's abandoned-import sweep ≥ the host's run TTL ≥ the upload cursor's idle window.
//
// Retry (#1578) and Continue (#1565) work only while the host keeps the run (`RUN_TTL_MS`), and
// Continue only while the upload cursor is fresh (`UPLOAD_IDLE_MS`). The sweep
// (`apps/tracy-web/src/cron.js` `sweepAbandonedImports`) removing an import sooner than the host
// forgets its run would leave the recovery page offering a Retry that cannot work; a cursor kept
// longer than the run would be one no Continue can reach. The two packages keep their own numbers
// (tracy-web depends on no Tracy package), so this test reads both.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ABANDONED_IMPORT_MS } from '../../apps/tracy-web/src/lib/import-pending.js'
import { RUN_TTL_MS, UPLOAD_IDLE_MS } from '../../packages/site/tracy-add-site/src/host/import-ttl.mjs'

test('the abandoned-import sweep waits at least as long as the host keeps a run', () => {
  assert.ok(ABANDONED_IMPORT_MS >= RUN_TTL_MS, `sweep ${ABANDONED_IMPORT_MS} ms < run TTL ${RUN_TTL_MS} ms`)
})

test('the host keeps a run at least as long as an upload cursor stays usable', () => {
  assert.ok(RUN_TTL_MS >= UPLOAD_IDLE_MS, `run TTL ${RUN_TTL_MS} ms < cursor idle ${UPLOAD_IDLE_MS} ms`)
})

test('the numbers decided on 22/10/2026: 6 h 30 min, 6 h, 6 h', () => {
  // test-quality: contract the three windows decided on 22/10/2026 (PR #1598); a change is a decision, not a refactor
  assert.equal(ABANDONED_IMPORT_MS, 6.5 * 60 * 60_000)
  // test-quality: contract the host's run TTL, decided with the sweep on 22/10/2026 (PR #1598)
  assert.equal(RUN_TTL_MS, 6 * 60 * 60_000)
  // test-quality: contract the upload cursor's idle window, decided with the sweep on 22/10/2026 (PR #1598)
  assert.equal(UPLOAD_IDLE_MS, 6 * 60 * 60_000)
})
