/**
 * The site-access assertion, verifier side: both PHP verifiers (WordPress `Tracy_Access_Assertion`
 * in tracy-access.php, Joomla `TracyAccessAssertion` in lib/AccessAssertion.php) against the shared
 * vectors the Node signer is held to (access-signature.test.mjs).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/access-signature-php.test.mjs
 *
 * Runs real PHP through scripts/test-support/php.mjs (local php, else one container).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const VECTORS = JSON.parse(read('./fixtures/access-signature-vectors.json'))
const WORDPRESS = read('../scripts/provision/access/wordpress/tracy-access.php')
const JOOMLA = read('../scripts/provision/access/joomla/plg_system_tracyaccess/lib/AccessAssertion.php')
const PHP_SKIP = phpSupport().skip

/** Every verify vector through one verifier; prints the reason each one got. */
const RUN = String.raw`
$v = json_decode(getenv('TRACY_VECTORS'), true);
$base = ['kid' => $v['key']['kid'], 'site' => $v['key']['site'], 'key' => hex2bin($v['key']['hex'])];
$out = [];
foreach ($v['verify'] as $c) {
  $r = $c['request'];
  $key = array_merge($base, ['kid' => $r['kid']], ['site' => $r['site']]);
  [$claims, $why] = VERIFIER::verify($c['assert'], $c['sig'], $key, $r['host'], $r['method'], $r['target'], $r['now']);
  $out[] = $claims === null ? $why : 'accept';
}
echo json_encode($out);`

const cases = {
  wordpress: String.raw`define('ABSPATH', '/tmp/');
function add_action(...$a) {} function add_filter(...$a) {}
eval('?>' . getenv('TRACY_SRC'));
${RUN.replace('VERIFIER', 'Tracy_Access_Assertion')}`,
  joomla: String.raw`eval('?>' . getenv('TRACY_SRC'));
${RUN.replace('VERIFIER', 'TracyAccessAssertion')}`
}
const SOURCES = { wordpress: WORDPRESS, joomla: JOOMLA }

const got = {}
let php
before(() => {
  if (PHP_SKIP) return
  php = startPhp()
  const names = Object.keys(cases)
  const outs = php.run(
    names.map((name) => ({
      args: ['-r', cases[name]],
      env: { TRACY_SRC: SOURCES[name], TRACY_VECTORS: JSON.stringify(VECTORS) }
    }))
  )
  names.forEach((name, i) => {
    assert.equal(outs[i].status, 0, `php failed: ${outs[i].stderr}${outs[i].stdout}`)
    got[name] = JSON.parse(outs[i].stdout)
  })
})
after(() => php?.stop())

for (const verifier of Object.keys(cases)) {
  VECTORS.verify.forEach((vector, i) => {
    test(`${verifier} verifier: ${vector.name} → ${vector.expect}`, { skip: PHP_SKIP }, () => {
      assert.equal(got[verifier][i], vector.expect)
    })
  })
}
