/**
 * REG-PR-893-joomla-identity-facts-encoded-tokens: the Joomla site identity takes the brief's
 * email, hours and profiles, and a token a link stored percent-encoded is filled like any other.
 * Runs every step of the case: S1 the identity-slot suite, S2 the identity plugin in real PHP
 * (local `php`, or the PHP image through `php-env.mjs`), S3/S4 the filtered site-tools and brief
 * suites with their exact pass counts, S5/S6 the two probes whose output must match exactly.
 */
import { phpEnv } from './php-env.mjs'
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['packages/cms/tracy-seeder/test/identity-slots.test.mjs'])
c.tapClean('S1', s1, { noSkip: false })
c.eq('S1: # pass equals # tests', s1.counts.pass, s1.counts.tests)
c.check('S1: # tests is at least 21', s1.counts.tests >= 21, s1.counts.tests)

// S2
const php = phpEnv()
process.stdout.write(`# S2 runs PHP with: ${php.how}\n`)
let s2
try {
  s2 = nodeTest(['packages/cms/tracy-joomla-quickstart/test/identity-plugin.test.mjs'], { env: php.env })
} finally {
  php.cleanup()
}
c.tapClean('S2', s2)
c.check('S2: at least 13 tests', s2.counts.tests >= 13, s2.counts.tests)
c.passes('S2', s2, 'a token whose braces a link percent-encoded is filled like any other, in any letter case')
c.passes('S2', s2, 'a layout tells a percent-encoded token with nothing behind it from one with a value')

// S3
const s3 = nodeTest(['packages/tools/tracy-site-tools/test/replace-joomla.test.mjs'], {
  pattern: 'percent-encoded'
})
c.tapClean('S3', s3, { noSkip: false })
c.eq('S3: # pass', s3.counts.pass, 2)

// S4
const s4 = nodeTest(
  ['apps/tracy-web/test/brief-joomla.test.mjs', 'apps/tracy-web/test/brief-shared.test.mjs'],
  {
    pattern: 'site identity takes|ride in the site block'
  }
)
c.tapClean('S4', s4, { noSkip: false })
c.eq('S4: # pass', s4.counts.pass, 4)

// S5: the case's probe, verbatim.
const s5 = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import { contactOf } from './packages/cms/tracy-seeder/src/chrome-slots.mjs'; console.log(JSON.stringify([contactOf({contact:'0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi'}), contactOf({contact:'Điện thoại: 0905 123 456, Địa chỉ: 12 Lê Lợi'}), contactOf({contact:'12 Hang Bac; Hanoi | Vietnam'})]))"
])
c.eq('S5: exit code', s5.status, 0)
c.eq(
  'S5: prints',
  s5.stdout.trim(),
  '[{"phone":"0912 345 678","email":"hello@goldencrust.example","address":"12 Hang Bac, Hanoi"},{"phone":"0905 123 456","email":null,"address":"12 Lê Lợi"},{"phone":null,"email":null,"address":"12 Hang Bac; Hanoi | Vietnam"}]'
)

// S6: the case's probe, verbatim.
const s6 = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import t from './packages/cms/tracy-seeder/src/chrome-slots.json' with { type: 'json' }; const p = t.profiles; console.log(JSON.stringify(['tracy-business/j6/1.2.0:module-4369','tracy-apple/j6/1.3.0:module-224','tracy-airbnb/j6/1.2.0:module-224'].map((s) => { const [c, e] = s.split(':'); return [4, 7, 9].map((i) => p[c][e + '.' + i].template) })))"
])
c.eq('S6: exit code', s6.status, 0)
c.eq(
  'S6: prints',
  s6.stdout.trim(),
  '[["{email}","{hours}","{instagram}"],["{email}","{hours}","{instagram}"],["{email}","{hours}","{instagram}"]]'
)
for (const [label, r] of [
  ['S5', s5],
  ['S6', s6]
])
  if (r.status !== 0) process.stdout.write(`${label} stderr: ${r.stderr.slice(-1000)}\n`)
c.done()
