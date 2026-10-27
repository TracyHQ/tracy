/**
 * REG-PR-1268-demo-host-jam: heavy-lock work runs at normal CPU priority (no priority inversion),
 * a queued Initial backup says it is waiting, and a demo site is lean (small Apache pool, small
 * MariaDB buffers) while a customer's site keeps the defaults.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const s1 = nodeTest([
  'packages/fleet/tracy-fleet-operation/test/webroot-heavy-lock-priority.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/webroot-heavy-lock-queue.test.mjs'
])
// The behavioural case needs taskset (Linux); elsewhere it skips and the static case covers the rule.
c.tapClean('S1', s1, { noSkip: false })
c.passes('S1', s1, 'no script that takes the heavy lock runs its work under nice')
c.passes('S1', s1, 'an Initial backup queued behind another heavy job says it is waiting')
const s2 = nodeTest(['packages/fleet/tracy-fleet-operation/test/demo-site-limits.test.mjs'])
c.tapClean('S2', s2)
c.passes('S2', s2, 'a demo gets the lean Apache pool mounted')
c.passes('S2', s2, 'a customer site keeps the defaults')
const s3 = nodeTest(['apps/tracy-host/test/provision.test.mjs'], { pattern: 'TRACY_DEMO_SITE' })
c.tapClean('S3', s3, { noSkip: false })
c.passes('S3', s3, 'demo: true reaches provision.sh as TRACY_DEMO_SITE=1')
c.done()
