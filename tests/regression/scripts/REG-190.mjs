/**
 * REG-190: the #811 P2 web and design fixes — beta sign-in copy, Build stage order, the Design
 * inspiration page's language. Runs every step of the case: S1/S2 the four suites (exit 0, 0
 * failed, 0 skipped, 0 cancelled, every named test and every test of the named families passing),
 * S3 `build-client.mjs --check` in the Joomla and EmDash Build plugins.
 */
import { join } from 'node:path'
import { ROOT, checks, nodeTest, run } from './lib.mjs'

const c = checks()

// S1 + S2
const s1 = nodeTest(
  [
    'apps/tracy-web/test/beta-login-copy.test.mjs',
    'apps/tracy-web/test/issue-811-status.test.mjs',
    'packages/site/tracy-site-build-core/test/client-stage-order.test.mjs',
    'packages/web/tracy-design-page/test/public-locale.test.mjs'
  ],
  { extra: ['--test-timeout=120000'] }
)
c.tapClean('S1', s1)
for (const name of [
  'F-S1-008: beta on and rate-limited — the code step shows and does not say a mail was sent',
  'F-S1-008: no language claims a mail on the rate-limited beta branch',
  'F-S1-008: beta answers a queued and a rate-limited request with the same page and the same JSON',
  'F-S1-008: the queue’s own cap sends nothing, and the page still makes no claim',
  'F-S1-008: with script, the step the page moves to makes no claim — first request and resend',
  'outside beta the limiter still refuses with 429 and the email step',
  'beta off: one mail leaves and the code step names the address it is for',
  'local preview keeps its own words and its code on the page',
  'a missing, empty or malformed address is refused as before, beta on or off',
  'NOT TRANSLATED: the page’s own sentences are English in every language',
  'F-S3-010 (already fixed): the row menu offers Site changes, not Releases',
  'F-S3-010 (already fixed): the switch catalogue has the changes pair and no releases pair',
  'F-S3-012 (not fixed here): the approval guard for a sandboxed seat is still in the gateway'
])
  c.passes('S1', s1, name)
// "Every 'F-S4-001' test passes for the three Build plugins": six tests per platform.
for (const cms of ['joomla', 'emdash', 'wordpress']) {
  const family = s1.passed.filter((t) => t.startsWith('F-S4-001:') && t.includes(` ${cms} `))
  c.check(`S1: the six F-S4-001 tests for ${cms} pass`, family.length >= 6, family.length)
  c.passes('S1', s1, `F-S4-001: the ${cms} client lists the host's stages, in the host's order`)
  c.passes('S1', s1, `F-S4-001: a paused ${cms} job points at the first unsettled stage, never past the end`)
}
c.eq('S1: no F-S4-001 test fails', s1.failed.filter((t) => t.startsWith('F-S4-001')).length, 0)
const s5 = s1.passed.filter((t) => t.startsWith('F-S5-004:'))
c.check('S1: every F-S5-004 test passes (6)', s5.length >= 6, s5)
c.eq('S1: no F-S5-004 test fails', s1.failed.filter((t) => t.startsWith('F-S5-004')).length, 0)

// S3
for (const pkg of ['packages/site/tracy-site-build-joomla', 'packages/site/tracy-site-build-emdash']) {
  const r = run(process.execPath, ['scripts/build-client.mjs', '--check'], { cwd: join(ROOT, pkg) })
  c.eq(`S3 ${pkg}: build-client --check exit code`, r.status, 0)
  if (r.status !== 0) process.stdout.write(`${r.stdout}\n${r.stderr}\n`.slice(-1500))
}
c.done()
