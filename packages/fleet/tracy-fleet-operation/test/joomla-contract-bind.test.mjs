/**
 * Binding a sealed Joomla quickstart to its contract profile, on a site nobody has opened yet.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/joomla-contract-bind.test.mjs
 *
 * ⚠ WHY THIS EXISTS. A T4 template compiles its own stylesheets the first time a page is rendered:
 * `media/t4/css/33.css` … `37.css` on JA Kinetic do not exist in the released quickstart at all,
 * they appear as Joomla serves the pages that use them. The presentation lock hashes them — every
 * Joomla profile in this repo carries between 5 and 13 of these — so a bind that runs straight
 * after the install compares a lock against a webroot that has not finished being written, and
 * refuses with `Presentation asset changed: media/t4/css/33.css`. Measured 20/09 on `site-n38jbp`
 * (`ja-kinetic/j6/1.0.0`, job `k475b0250eab9c0996d08`): the provision died there with the site
 * itself healthy; one GET of the home page produced `33.css` with the hash the lock expected, TO
 * THE BYTE, and after 17 pages the same bind answered `{"ok":true,"bound":true}`.
 *
 * So the bootstrap warms the site before it binds, and keeps ONE retry road open for the case the
 * warm-up missed a page. The distinction the retry rests on is the whole point:
 *
 *   - the named asset is NOT on disk  → it has not been generated yet; warm again and re-bind;
 *   - the named asset IS on disk      → its bytes differ from the lock. That is the drift the lock
 *                                       exists to catch, and retrying would only hide it.
 *
 * ⚠ THIS RUNS THE REAL PHP, AND SAYS SO WHEN IT CANNOT. The bootstrap is PHP, so asserting on its
 * behaviour means executing it: the pure half loads alone under `TRACY_BOOTSTRAP_LIB_ONLY=1`, with
 * no Joomla under it. The CI runners carry docker and python3 but NOT php (measured 20/09 on
 * `tracy-ci-01`), so php out of a container is the fallback — and when neither exists the test
 * FAILS rather than skipping. A test that quietly stands down reports the same green as one that
 * ran, which is the shape this repo refuses everywhere else.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const BOOTSTRAP = `${PROVISION}joomla-bootstrap.php`
const SOURCE = readFileSync(BOOTSTRAP, 'utf8')
const PHP_IMAGE = 'php:8.3-cli-alpine'

// One PHP session for the file (local php, else ONE php container): see scripts/test-support/php.mjs.
// No PHP at all fails on CI (a shard on a runner without php or a docker socket must be red, not
// green), and skips with a stated reason on a laptop.
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ image: PHP_IMAGE })
})
after(() => php?.stop())

/**
 * Runs one PHP snippet with the bootstrap's pure half already loaded, and returns its JSON answer.
 * The source travels in the environment: nothing here needs a directory shared with PHP, since the
 * snippets build what they need themselves.
 */
const run = (snippet) => {
  const code = `putenv('TRACY_BOOTSTRAP_LIB_ONLY=1'); eval('?>' . getenv('TRACY_BOOTSTRAP_SRC')); ${snippet}`
  const [out] = php.run([{ args: ['-r', code], env: { TRACY_BOOTSTRAP_SRC: SOURCE } }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}`)
  return JSON.parse(out.stdout)
}

/** A JSON value as a PHP expression — an object literal is not something PHP can read. */
const asPhp = (value) => `json_decode(${JSON.stringify(JSON.stringify(value))}, true)`

/**
 * Asks `tracy_contract_retry_path` about one answer, against a webroot holding exactly `files`.
 * The webroot is built inside the PHP process, so this needs no directory shared with it.
 */
const retryPath = (answer, files) =>
  run(`
    $root = sys_get_temp_dir() . '/tracy-webroot-' . bin2hex(random_bytes(6));
    foreach (${asPhp(files)} as $f) { @mkdir(dirname("$root/$f"), 0777, true); file_put_contents("$root/$f", 'x'); }
    echo json_encode(tracy_contract_retry_path(${asPhp(answer)}, $root));
  `)

const refusal = (message) => ({ ok: false, error: 'contract_failed', message })

test('an asset the lock names but the webroot has not generated yet is a retry', { skip: PHP_SKIP }, () => {
  const answer = refusal('Presentation asset changed: media/t4/css/33.css')
  assert.equal(retryPath(answer, ['index.php']), 'media/t4/css/33.css')
})

test('an asset that IS on disk is drift, and drift must never be retried away', { skip: PHP_SKIP }, () => {
  const answer = refusal('Presentation asset changed: media/t4/css/33.css')
  assert.equal(retryPath(answer, ['media/t4/css/33.css']), null)
})

test('a successful bind is never a retry', { skip: PHP_SKIP }, () => {
  const ok = { ok: true, bound: true, contract: 'ja-kinetic/j6/1.0.0' }
  assert.equal(retryPath(ok, ['index.php']), null)
})

test('every refusal that is not a missing presentation asset fails on the spot', { skip: PHP_SKIP }, () => {
  for (const answer of [
    { ok: false, error: 'unauthorized' },
    { ok: false, error: 'contract_failed', message: 'Entity 42 differs' },
    refusal('Presentation asset changed: '),
    {}
  ])
    assert.equal(retryPath(answer, ['index.php']), null, `retried on ${JSON.stringify(answer)}`)
})

// The message comes back over HTTP from a component on the site. It names a path, and that path is
// about to be handed to `is_file` — so it is read as a path INSIDE the webroot or not at all.
test('a path that climbs out of the webroot is not a path this reads', { skip: PHP_SKIP }, () => {
  for (const path of ['../configuration.php', '/etc/passwd', 'media/../../etc/passwd', ''])
    assert.equal(
      retryPath(refusal(`Presentation asset changed: ${path}`), ['index.php']),
      null,
      `accepted ${path}`
    )
})

// Warming means rendering, and rendering is what writes the stylesheets. `Itemid` is used rather
// than the SEF paths the menu implies: a quickstart whose rewrite is off serves those as 404s, and
// a warm-up that quietly renders nothing is exactly the silent failure this whole file is about.
test('the warm-up walks the home page first, then one URL per published menu item', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(run('echo json_encode(tracy_warm_urls([101, 137, 4]));'), [
    'http://127.0.0.1/',
    'http://127.0.0.1/index.php?Itemid=101',
    'http://127.0.0.1/index.php?Itemid=137',
    'http://127.0.0.1/index.php?Itemid=4'
  ])
})

test('a site with no menu at all is still warmed', { skip: PHP_SKIP }, () => {
  assert.deepEqual(run('echo json_encode(tracy_warm_urls([]));'), ['http://127.0.0.1/'])
})

// A quickstart with hundreds of menu items must not turn the provision into a crawl; the cap is
// deliberate and the stylesheets belong to template styles, not to individual pages.
test('the warm-up is bounded', { skip: PHP_SKIP }, () => {
  const ids = Array.from({ length: 200 }, (_, i) => i + 1)
  assert.equal(run(`echo json_encode(count(tracy_warm_urls(${asPhp(ids)})));`), 61)
})

// Measured 20/09 on `site-n38jbp`: `media/t4/css/NN.css` is named after the TEMPLATE STYLE whose
// pages use it — 33..37 are five ja_kinetic styles — and `index.php?templateStyle=NN` renders that
// style directly. So a retry can aim at the file the refusal named instead of walking the same
// menu again, which is the one thing a plain retry could never fix: if the warm-up missed a page,
// repeating it misses the same page.
//
// ⚠ AND ONLY AT A FILE THE LOCK ALREADY NAMES. Rendering an arbitrary style would WRITE a
// stylesheet the lock does not carry — style 32 exists on JA Kinetic and has no entry, because no
// menu item uses it — so this URL is built from the refusal's own path, never from the styles a
// site happens to have.
test('a retry aims at the stylesheet the refusal named, by template style', { skip: PHP_SKIP }, () => {
  assert.deepEqual(run(`echo json_encode(tracy_warm_urls_for_missing('media/t4/css/37.css'));`), [
    'http://127.0.0.1/index.php?templateStyle=37'
  ])
})

test('an asset that is not a template stylesheet has no aimed URL', { skip: PHP_SKIP }, () => {
  for (const path of [
    'templates/ja_kinetic/acm/bento/css/style.css',
    'media/t4/author/default.jpg',
    'media/t4/css/x.css'
  ])
    assert.deepEqual(
      run(`echo json_encode(tracy_warm_urls_for_missing(${JSON.stringify(path)}));`),
      [],
      `aimed at ${path}`
    )
})

test('the bootstrap warms before it binds, and bounds its retries', () => {
  assert.ok(
    SOURCE.indexOf('$warm(tracy_warm_urls($menu));') < SOURCE.indexOf("'operation' => 'bind'"),
    'the warm-up runs before the first bind'
  )
  assert.match(SOURCE, /TRACY_BIND_ATTEMPTS|\$attempts\s*=\s*[0-9]/, 'the retry count is a named bound')
  assert.match(SOURCE, /tracy_contract_retry_path\(/, 'the retry decision is the tested one')
  assert.match(SOURCE, /tracy_warm_urls_for_missing\(\$missing\)/, 'a retry aims at what the refusal named')
})

test('a bind that is not retried says what the Claude Cowork plugin answered, and nothing it was sent', {
  skip: PHP_SKIP
}, () => {
  // Measured 23/09/2026 on `j-8zjzs6`: the provision stopped at the bind with a bare "binding failed",
  // and the Claude Cowork plugin's refusal — the one thing that could say why — was never written anywhere.
  const answer = {
    ok: false,
    error: 'contract_failed',
    message: 'Presentation asset changed: media/t4/css/33.css',
    token: 'never-print-this'
  }
  const said = run(`echo json_encode(tracy_bind_failure(${asPhp(answer)}, ''));`)
  assert.match(said, /^Quickstart contract binding failed: /)
  assert.match(said, /"error":"contract_failed"/)
  assert.match(said, /Presentation asset changed: media\/t4\/css\/33\.css/)
  assert.doesNotMatch(said, /never-print-this/)

  const silent = run(
    `echo json_encode(tracy_bind_failure([], 'Operation timed out after 600001 milliseconds'));`
  )
  assert.equal(
    silent,
    'Quickstart contract binding failed: no answer (Operation timed out after 600001 milliseconds)'
  )
  assert.equal(
    run(`echo json_encode(tracy_bind_failure(null));`),
    'Quickstart contract binding failed: no answer'
  )
  assert.match(
    SOURCE,
    /throw new RuntimeException\(tracy_bind_failure\(\$bound, \$transport, \$status\)\)/,
    'the loop throws the tested message'
  )
})

// ── The whole first boot, against a site that answers like one (#722) ─────────────────────────
//
// `tracy_bootstrap()` is the bootstrap itself, handed its database and its door instead of opening
// them. The fakes below answer the four statements it sends (`query`/`prepare` the way mysqli does)
// and the component's door from a script, and every write and every door call lands in ONE ordered
// log — so "the contract was stored before the bind" is a fact read off that log, not a reading of
// the source.
//
// ⚠ THE REGRESSION. Until 02/10/2026 a re-run (`TRACY_CONTRACT_VERIFY_ONLY=1`: a token already on the
// host) wrote nothing at all. A site paired while its component held no `contract` stayed that way:
// the bind read an empty param, `EngineFactory::buildContract` fell back to `tracy-apple/j6/1.1.0`,
// and the reader then failed every read against Apple's lock (TCH #722).

const FAKE_SITE = String.raw`
final class TracyFakeResult {
  private $rows;
  function __construct(array $rows) { $this->rows = $rows; }
  function fetch_assoc() { return array_shift($this->rows); }
  function fetch_row() { $r = array_shift($this->rows); return $r === null ? null : array_values($r); }
}
final class TracyFakeStmt {
  private $db; private $sql; private $vars = [];
  function __construct($db, $sql) { $this->db = $db; $this->sql = $sql; }
  function bind_param($types, &...$vars) { $this->vars = $vars; return true; }
  function execute() { return $this->db->run($this->sql, array_map(static fn($v) => $v, $this->vars)); }
}
final class TracyFakeDb {
  public $row; public $menu = []; public $failWrite = false; public $dropWrite = false; public $failRead = false; public $seq;
  function __construct(array &$seq) { $this->seq = &$seq; }
  function query($sql) {
    if (strpos($sql, 'SELECT extension_id') === 0) {
      if ($this->failRead) return false;
      return new TracyFakeResult($this->row ? [$this->row] : []);
    }
    if (strpos($sql, 'SELECT id FROM') === 0) return new TracyFakeResult(array_map(static fn($i) => ['id' => $i], $this->menu));
    $this->seq[] = 'sql:' . strtok($sql, '(');
    return true;
  }
  function prepare($sql) { return new TracyFakeStmt($this, $sql); }
  function run($sql, array $vars) {
    $this->seq[] = 'sql:' . strtok($sql, '=') . '=';
    if (strpos($sql, 'UPDATE ') === 0 && strpos($sql, 'extensions') !== false) {
      if ($this->failWrite) return false;
      if (!$this->dropWrite && $this->row && (int) $this->row['extension_id'] === $vars[1]) $this->row['params'] = $vars[0];
    }
    return true;
  }
}
function tracy_scenario(array $s): void {
  $seq = [];
  $db = new TracyFakeDb($seq);
  $db->row = $s['row'] ?? null;
  $db->menu = $s['menu'] ?? [];
  $db->failWrite = !empty($s['failWrite']);
  $db->dropWrite = !empty($s['dropWrite']);
  $db->failRead = !empty($s['failRead']);
  $answers = $s['answers'] ?? [];
  $statuses = $s['status'] ?? [];
  $tokens = [];
  $requests = [];
  $said = [];
  $door = static function (array $body, int $timeout) use (&$answers, &$seq, &$tokens, &$requests, $statuses): array {
    $key = $body['action'] . (is_array($body['params']) && isset($body['params']['operation']) ? ':' . $body['params']['operation'] : '');
    $seq[] = 'door:' . $key . ($key === 'content.contract:bind' && array_key_exists('contract', $body['params']) ? '+contract' : '');
    $tokens[] = $body['token'];
    if (is_array($body['params']) && array_key_exists('request_id', $body['params']))
      $requests[] = $body['params']['request_id'] . '|' . ($body['params']['apply_id'] ?? '');
    $queue = $answers[$key] ?? [];
    $answer = count($queue) > 1 ? array_shift($answers[$key]) : ($queue[0] ?? null);
    return $answer === null ? [[], 'Connection refused', 0] : [$answer, '', (int) ($statuses[$key] ?? 200)];
  };
  $warm = static function (array $urls) use (&$seq): void { $seq[] = 'warm:' . count($urls); };
  $out = [];
  try {
    $printed = tracy_bootstrap([
      'db' => $db, 'prefix' => $s['prefix'] ?? 'tr_', 'door' => $door, 'warm' => $warm,
      'webroot' => $s['webroot'] ?? sys_get_temp_dir() . '/tracy-no-webroot',
      'token' => $s['token'] ?? '',
      'verify_only' => !empty($s['verifyOnly']), 'workflow' => $s['workflow'] ?? 'contract',
      'contract' => $s['contract'] ?? '', 'optional' => !empty($s['optional']),
      'showcase' => $s['showcase'] ?? '', 'showcase_resumed' => !empty($s['showcaseResumed']),
      'say' => static function (string $line) use (&$said): void { $said[] = $line; },
    ]);
    $out['printed'] = $printed;
  } catch (Throwable $e) {
    $out['error'] = $e->getMessage();
  }
  $out['params'] = $db->row ? json_decode($db->row['params'], true) : null;
  $out['raw'] = $db->row ? $db->row['params'] : null;
  $out['seq'] = $seq;
  $out['tokens'] = array_values(array_unique($tokens));
  $out['requests'] = $requests;
  $out['said'] = $said;
  echo json_encode($out);
}
`

/** Runs one scenario through the real `tracy_bootstrap` and answers what it did. */
const scenario = (s) => run(`${FAKE_SITE} tracy_scenario(${asPhp(s)});`)

const KINETIC = 'ja-kinetic/j6/1.0.0'
const TOKEN = 'a'.repeat(64)
const row = (params) => ({
  extension_id: 7,
  params: typeof params === 'string' ? params : JSON.stringify(params)
})
const manifest = { ok: true, manifest: { platform: 'joomla' } }
const bound = (contract = KINETIC) => ({ ok: true, bound: true, contract, revision: 'r1' })
// The two answers are NOT the same shape. A bind says `bound: true`; the inspect of a bound site is
// the contract state itself (`contract`, `revision`, …) and carries NO `bound` key — the component
// answers `bound: false` beside `construction: true` only for a site still under construction
// (claude-cowork `joomla/cowork/lib/Engine.php`, `content.contract`). Until #824 one fixture stood in
// for both, so the read-back was only ever tested against an answer the component never gives.
const inspected = (contract = KINETIC) => ({ ok: true, contract, revision: 'r1' })
const sealedDoor = (contract = KINETIC) => ({
  'core.manifest': [manifest],
  'content.contract:bind': [bound(contract)],
  'content.contract:inspect': [inspected(contract)]
})
const writes = (seq) => seq.filter((step) => step.startsWith('sql:UPDATE tr_extensions'))
const resets = (seq) => seq.filter((step) => /^sql:(DELETE FROM|UPDATE tr_users)/.test(step))

test('REGRESSION #722: a re-run on a site whose component holds a token but no contract stores the contract, then binds', {
  skip: PHP_SKIP
}, () => {
  const out = scenario({
    row: row({ token: TOKEN, contract: '', webroot: '', keep: 'customer setting' }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(out.error, undefined, out.error)
  assert.equal(out.params.contract, KINETIC, 'the contract param is stored')
  assert.equal(out.params.token, TOKEN, 'the token the host already holds is kept')
  assert.equal(out.params.keep, 'customer setting', 'params this file does not own are kept')
  const write = out.seq.indexOf('sql:UPDATE tr_extensions SET params=')
  assert.ok(write >= 0, 'one params write')
  assert.ok(write < out.seq.indexOf('door:content.contract:bind'), 'stored BEFORE the bind reads it')
  assert.ok(
    out.seq.indexOf('door:content.contract:bind') < out.seq.indexOf('door:content.contract:inspect'),
    'and read back with inspect after the bind'
  )
  assert.deepEqual(resets(out.seq), [], 'a re-run never clears sessions or resets the admin')
  assert.equal(out.printed, '', 'a re-run prints no token')
  assert.deepEqual(out.tokens, [TOKEN])
})

test('a first pairing writes token and contract, resets the site once, binds and inspects', {
  skip: PHP_SKIP
}, () => {
  const out = scenario({
    row: row({ keep: 'x' }),
    contract: KINETIC,
    menu: [101, 102],
    answers: sealedDoor()
  })
  assert.equal(out.error, undefined, out.error)
  assert.match(out.printed, /^[a-f0-9]{64}$/)
  assert.equal(out.params.token, out.printed, 'the printed token is the stored one')
  assert.equal(out.params.contract, KINETIC)
  assert.equal(out.params.keep, 'x')
  assert.equal(writes(out.seq).length, 1)
  assert.equal(resets(out.seq).length, 4, 'three tables cleared and the admin password replaced')
  assert.deepEqual(
    out.seq.filter((s) => s.startsWith('door:') || s.startsWith('warm:')),
    ['door:core.manifest', 'warm:3', 'door:content.contract:bind', 'door:content.contract:inspect'],
    'probe, warm, bind, inspect — and the bind never carries a contract of its own'
  )
})

test('a first pairing handed the host token stores THAT token, resets once before storing it, prints nothing', {
  skip: PHP_SKIP
}, () => {
  // Never paired: no token, or a value that is not a token at all.
  for (const held of [
    {},
    { token: '', contract: '', keep: 'x' },
    { token: 'c'.repeat(40), contract: '', keep: 'x' },
    { token: 7, contract: '', keep: 'x' }
  ]) {
    const out = scenario({ row: row(held), token: TOKEN, contract: KINETIC, answers: sealedDoor() })
    assert.equal(out.error, undefined, out.error)
    assert.equal(out.printed, '', 'the host already has the token: nothing is printed')
    assert.equal(out.params.token, TOKEN, 'the host token, not one minted here')
    assert.equal(out.params.contract, KINETIC)
    assert.equal(resets(out.seq).length, 4)
    const lastReset = out.seq.lastIndexOf(resets(out.seq).at(-1))
    assert.ok(
      lastReset < out.seq.indexOf('sql:UPDATE tr_extensions SET params='),
      'reset BEFORE the token lands'
    )
    assert.deepEqual(out.tokens, [TOKEN])
  }
})

test('a component paired to ANOTHER token is refused on a first pass: no reset, no new admin password, no overwrite', {
  skip: PHP_SKIP
}, () => {
  const other = 'c'.repeat(64)
  const held = { token: other, contract: 'tracy-apple/j6/1.1.0', webroot: '', keep: 'x' }
  for (const workflow of ['contract', 'template', 'template-build'])
    for (const token of [TOKEN, '']) {
      const how = JSON.stringify({ workflow, hostToken: token !== '' })
      const out = scenario({ row: row(held), token, workflow, contract: KINETIC, answers: sealedDoor() })
      assert.equal(
        out.error,
        'the Cowork component is paired to a different token; refusing to reset a site held by another pairing',
        how
      )
      assert.deepEqual(out.seq, [], `${how}: nothing reset, written or called`)
      assert.deepEqual(out.params, held, `${how}: token and contract of the other pairing are kept`)
      assert.ok(!out.error.includes(other) && !out.error.includes(TOKEN), `${how}: no token in the message`)
    }
})

test('a first pass resumed after the component stored the host token neither re-mints nor resets', {
  skip: PHP_SKIP
}, () => {
  // The pass before stored the token and died at the bind; the host kept it as pending.
  const out = scenario({
    row: row({ token: TOKEN, contract: KINETIC, webroot: '' }),
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(out.error, undefined, out.error)
  assert.deepEqual(resets(out.seq), [], 'sessions and the admin are not reset a second time')
  assert.deepEqual(writes(out.seq), [], 'nothing to write: token and contract are already there')
  assert.equal(out.params.token, TOKEN)
  assert.equal(out.printed, '')
  assert.ok(out.seq.includes('door:content.contract:inspect'))
  // Resumed before the contract was named: the empty contract is filled, and nothing else.
  const unnamed = scenario({
    row: row({ token: TOKEN, contract: '', webroot: '', keep: 'x' }),
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(unnamed.error, undefined, unnamed.error)
  assert.deepEqual(resets(unnamed.seq), [])
  assert.equal(writes(unnamed.seq).length, 1)
  assert.deepEqual(unnamed.params, { token: TOKEN, contract: KINETIC, webroot: '', keep: 'x' })
})

test('a host token the component does not hold, or no host token, is never a re-run', {
  skip: PHP_SKIP
}, () => {
  const mismatch = scenario({
    row: row({ token: 'c'.repeat(64), contract: '' }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(mismatch.error, 'the host token does not match the Cowork component token')
  assert.deepEqual(mismatch.seq, [], 'nothing written, reset or called')
  assert.ok(!mismatch.error.includes(TOKEN))
  const none = scenario({
    row: row({ token: TOKEN, contract: '' }),
    verifyOnly: true,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(none.error, 'a re-run must be handed the token the host holds')
  assert.deepEqual(none.seq, [])
  for (const bad of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(40), `${TOKEN}\n`, `${TOKEN} `])
    for (const verifyOnly of [false, true]) {
      const out = scenario({
        row: row({ token: TOKEN, contract: '' }),
        verifyOnly,
        token: bad,
        contract: KINETIC,
        answers: sealedDoor()
      })
      assert.equal(out.error, 'the host pairing token is not a token', JSON.stringify({ bad, verifyOnly }))
      assert.deepEqual(out.seq, [])
    }
})

test('a reset that fails stops before the token is stored', { skip: PHP_SKIP }, () => {
  const out = run(`${FAKE_SITE}
    final class TracyNoSessionDb {
      public $inner;
      function __construct($inner) { $this->inner = $inner; }
      function query($sql) { return strpos($sql, 'DELETE FROM tr_session') === 0 ? false : $this->inner->query($sql); }
      function prepare($sql) { return $this->inner->prepare($sql); }
    }
    $seq = [];
    $db = new TracyFakeDb($seq);
    $db->row = ['extension_id' => 7, 'params' => '{}'];
    try {
      tracy_bootstrap(['db' => new TracyNoSessionDb($db), 'prefix' => 'tr_', 'door' => static fn() => [[], '', 0],
        'warm' => static function () {}, 'webroot' => '/nowhere', 'token' => str_repeat('a', 64),
        'verify_only' => false, 'workflow' => 'contract', 'contract' => 'ja-kinetic/j6/1.0.0', 'optional' => false]);
      echo json_encode(['error' => null]);
    } catch (Throwable $e) {
      echo json_encode(['error' => $e->getMessage(), 'params' => $db->row['params']]);
    }
  `)
  assert.equal(out.error, 'could not reset the site sessions')
  assert.equal(out.params, '{}', 'the token was not stored')
})

test('a re-run on a site already holding this contract writes nothing and still proves the binding', {
  skip: PHP_SKIP
}, () => {
  const out = scenario({
    row: row({ token: TOKEN, contract: KINETIC }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(out.error, undefined, out.error)
  assert.deepEqual(writes(out.seq), [])
  assert.deepEqual(resets(out.seq), [])
  assert.ok(out.seq.includes('door:content.contract:inspect'))
})

test('a re-run on a site held to ANOTHER contract is refused before anything is written or called', {
  skip: PHP_SKIP
}, () => {
  const out = scenario({
    row: row({ token: TOKEN, contract: 'tracy-apple/j6/1.1.0' }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.match(out.error, /held to another content contract/)
  assert.equal(out.params.contract, 'tracy-apple/j6/1.1.0')
  assert.deepEqual(out.seq, [])
})

test('a profile-less card is paired, never given a contract, never bound — first pass and re-run', {
  skip: PHP_SKIP
}, () => {
  const first = scenario({ row: row({}), workflow: 'template', contract: '', answers: sealedDoor() })
  assert.equal(first.error, undefined, first.error)
  assert.equal(first.params.contract, '', 'no contract is invented')
  assert.deepEqual(
    first.seq.filter((s) => s.startsWith('door:')),
    ['door:core.manifest']
  )
  const again = scenario({
    row: row({ token: TOKEN, contract: '' }),
    verifyOnly: true,
    token: TOKEN,
    workflow: 'template',
    contract: '',
    answers: sealedDoor()
  })
  assert.equal(again.error, undefined, again.error)
  assert.equal(again.params.contract, '')
  assert.deepEqual(again.seq, ['door:core.manifest'], 'a re-run writes nothing on a profile-less card')
})

test('template-build keeps its baseline beside an EMPTY contract, and a resumed build is never bound', {
  skip: PHP_SKIP
}, () => {
  const first = scenario({
    row: row({}),
    workflow: 'template-build',
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(first.error, undefined, first.error)
  assert.equal(first.params.contract, '')
  assert.equal(first.params.tracy_build_baseline, KINETIC)
  assert.deepEqual(
    first.seq.filter((s) => s.startsWith('door:')),
    ['door:core.manifest']
  )
  const again = scenario({
    row: row({ token: TOKEN, contract: '', tracy_build_baseline: KINETIC }),
    verifyOnly: true,
    token: TOKEN,
    workflow: 'template-build',
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(again.error, undefined, again.error)
  assert.equal(again.params.contract, '', 'a resumed construction is not bound by a re-run')
  assert.deepEqual(again.seq, ['door:core.manifest'])
})

test('a contract that is not a profile id is refused before any write, first pass or re-run', {
  skip: PHP_SKIP
}, () => {
  for (const contract of [
    '',
    'ja-kinetic',
    'ja-kinetic/j6/1.0.0"',
    'ja-kinetic/j6/1.0.0\n',
    "ja-kinetic/j6/1.0.0'",
    '../ja-kinetic/j6/1.0.0',
    'ja-kinetic/../1.0.0',
    'Ja-kinetic/j6/1.0.0',
    'ja-kinetic/j6/1.0'
  ])
    for (const verifyOnly of [false, true]) {
      const out = scenario({
        row: row(verifyOnly ? { token: TOKEN, contract: '' } : {}),
        verifyOnly,
        token: verifyOnly ? TOKEN : '',
        contract,
        answers: sealedDoor()
      })
      assert.equal(out.error, 'provision named no content contract', JSON.stringify({ contract, verifyOnly }))
      assert.deepEqual(out.seq, [], `wrote or called for ${JSON.stringify(contract)}`)
    }
})

test('a missing component is exit 3 only when the caller allowed it', { skip: PHP_SKIP }, () => {
  assert.equal(scenario({ row: null, optional: true, contract: KINETIC }).printed, 3)
  assert.equal(scenario({ row: null, contract: KINETIC }).error, 'Cowork is missing from the quickstart')
  assert.equal(
    scenario({ failRead: true, contract: KINETIC }).error,
    'could not read the Cowork component row'
  )
})

test('params that are not a JSON object, a bad prefix, or a missing token are refused untouched', {
  skip: PHP_SKIP
}, () => {
  for (const params of ['not json', '[1,2]', '[]', '"text"', '7', 'null', 'true']) {
    const out = scenario({ row: row(params), contract: KINETIC, answers: sealedDoor() })
    assert.equal(out.error, 'Cowork params are not a JSON object', params)
    assert.deepEqual(out.seq, [])
  }
  for (const params of ['', '{}']) {
    const empty = scenario({ row: row(params), contract: KINETIC, answers: sealedDoor() })
    assert.equal(empty.error, undefined, `${JSON.stringify(params)} is an empty object`)
  }
  // Settings this file does not own keep their shape: an empty object stays `{}`, never `[]`.
  const nested = scenario({
    row: row('{"theme":{},"list":[],"keep":"x"}'),
    contract: KINETIC,
    answers: sealedDoor()
  })
  assert.equal(nested.error, undefined, nested.error)
  assert.match(nested.raw, /"theme":\{\}/)
  assert.match(nested.raw, /"list":\[\]/)
  assert.equal(
    scenario({ row: row({}), prefix: 'tr_; DROP', contract: KINETIC }).error,
    'invalid table prefix'
  )
  for (const token of [undefined, '', 'A'.repeat(64), 'a'.repeat(63), 42]) {
    const out = scenario({
      row: row(token === undefined ? { contract: '' } : { token, contract: '' }),
      verifyOnly: true,
      token: TOKEN,
      contract: KINETIC,
      answers: sealedDoor()
    })
    assert.equal(out.error, 'Cowork pairing is missing', JSON.stringify(token))
    assert.deepEqual(out.seq, [])
  }
})

test('a params write that fails, or that the row does not keep, stops before the door', {
  skip: PHP_SKIP
}, () => {
  for (const verifyOnly of [false, true]) {
    const params = verifyOnly ? { token: TOKEN, contract: '' } : {}
    const failed = scenario({
      row: row(params),
      verifyOnly,
      token: verifyOnly ? TOKEN : '',
      failWrite: true,
      contract: KINETIC,
      answers: sealedDoor()
    })
    assert.equal(failed.error, 'could not write the Cowork params')
    assert.ok(!failed.seq.some((s) => s.startsWith('door:')))
    const dropped = scenario({
      row: row(params),
      verifyOnly,
      token: verifyOnly ? TOKEN : '',
      dropWrite: true,
      contract: KINETIC,
      answers: sealedDoor()
    })
    assert.equal(dropped.error, 'the Cowork params did not keep what was written')
    assert.ok(!dropped.seq.some((s) => s.startsWith('door:')))
  }
})

test('a bind or an inspect that does not confirm THIS contract fails, and never echoes the token', {
  skip: PHP_SKIP
}, () => {
  const rerun = {
    row: row({ token: TOKEN, contract: '' }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC
  }
  const cases = [
    [{ 'core.manifest': [null] }, /Cowork token probe failed/],
    [{ 'core.manifest': [{ ok: true, manifest: { platform: 'wordpress' } }] }, /Cowork token probe failed/],
    [{ 'core.manifest': [{ ok: false, error: 'unauthorized' }] }, /Cowork token probe failed/],
    [
      { 'core.manifest': [manifest], 'content.contract:bind': [{ ok: false, error: 'unauthorized' }] },
      /binding failed: .*unauthorized/
    ],
    [
      { 'core.manifest': [manifest], 'content.contract:bind': [null] },
      /binding failed: no answer \(Connection refused\)/
    ],
    [
      { 'core.manifest': [manifest], 'content.contract:bind': [bound('tracy-apple/j6/1.1.0')] },
      /binding failed: .*tracy-apple/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [{ ok: true, bound: false, contract: KINETIC }]
      },
      /binding failed/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [
          { ok: false, error: 'conflict', message: `Contract already bound to ${KINETIC}.1` }
        ]
      },
      /binding failed/
    ],
    [
      { 'core.manifest': [manifest], 'content.contract:bind': [bound()], 'content.contract:inspect': [null] },
      /inspect after bind did not confirm it: no answer/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [bound()],
        'content.contract:inspect': [inspected('tracy-apple/j6/1.1.0')]
      },
      /inspect after bind .*tracy-apple/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [bound()],
        'content.contract:inspect': [{ ok: true, bound: false, contract: KINETIC }]
      },
      /inspect after bind/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [bound()],
        'content.contract:inspect': [{ ok: true }]
      },
      /inspect after bind/
    ],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [bound()],
        'content.contract:inspect': [{ ok: false, error: 'SITE_BUSY' }]
      },
      /inspect after bind .*SITE_BUSY/
    ],
    // Exactly `true`, not truthy, and a contract that is exactly the string asked for. A bind with no
    // `bound` at all is refused; the inspect answers have their own list below, since an inspect
    // without `bound` is what a bound site really says (#824).
    ...[
      { ok: 1, bound: true, contract: KINETIC },
      { ok: 'true', bound: true, contract: KINETIC },
      { ok: true, bound: 1, contract: KINETIC },
      { ok: true, bound: 'yes', contract: KINETIC },
      { ok: true, bound: null, contract: KINETIC },
      { ok: true, contract: KINETIC },
      { ok: true, contract: KINETIC, revision: 'r1' },
      { ok: true, bound: true },
      { ok: true, bound: true, contract: [KINETIC] }
    ].map((wrong) => [{ 'core.manifest': [manifest], 'content.contract:bind': [wrong] }, /binding failed/]),
    [{ 'core.manifest': [{ ok: 1, manifest: { platform: 'joomla' } }] }, /Cowork token probe failed/],
    [
      {
        'core.manifest': [manifest],
        'content.contract:bind': [
          { ok: 'false', error: 'conflict', message: `Contract already bound to ${KINETIC}` }
        ]
      },
      /binding failed/
    ]
  ]
  for (const [answers, expected] of cases) {
    const out = scenario({ ...rerun, answers })
    assert.match(out.error ?? 'no error', expected, JSON.stringify(answers))
    assert.ok(!out.error.includes(TOKEN), 'the token never reaches a message')
  }
})

// ── The read-back, against what the component really answers (#824) ───────────────────────────
//
// Measured 03/10/2026 on dev, reinstalling `quickstart/ja-essence/j6`: the bind succeeded and the
// provision then died on `inspect after bind did not confirm it: {"ok":true,"contract":"ja-essence/j6/1.0.0"}`
// — an answer that names exactly the contract asked for. The read-back demanded `bound: true`, which
// the inspect of a bound site never carries.

const ESSENCE = 'ja-essence/j6/1.0.0'

/** The inspect answers of a bound site: as measured (the fields the report prints), and with the state beside it. */
const REAL_INSPECTS = (contract) => [
  { ok: true, contract },
  { ok: true, contract, revision: 'r1' },
  { ok: true, contract, revision: 'r1', locales: ['en-GB'], entities: 197 }
]

test('REGRESSION #824: a first pairing is confirmed by the inspect a bound site really answers, which carries no `bound`', {
  skip: PHP_SKIP
}, () => {
  for (const inspect of REAL_INSPECTS(ESSENCE)) {
    const out = scenario({
      row: row({ keep: 'x' }),
      contract: ESSENCE,
      menu: [101],
      answers: {
        'core.manifest': [manifest],
        'content.contract:bind': [bound(ESSENCE)],
        'content.contract:inspect': [inspect]
      }
    })
    assert.equal(out.error, undefined, `${JSON.stringify(inspect)}: ${out.error}`)
    assert.match(out.printed, /^[a-f0-9]{64}$/, 'the pairing ends, and the minted token is handed back')
    assert.equal(out.params.contract, ESSENCE)
    assert.equal(out.seq.at(-1), 'door:content.contract:inspect', 'the read-back is the last step')
  }
})

test('REGRESSION #824: a re-run is confirmed by the same answer, after a bind or after "already bound"', {
  skip: PHP_SKIP
}, () => {
  const already = { ok: false, error: 'conflict', message: `This site is already bound to ${ESSENCE}` }
  for (const bind of [bound(ESSENCE), already])
    for (const inspect of REAL_INSPECTS(ESSENCE)) {
      const out = scenario({
        row: row({ token: TOKEN, contract: ESSENCE }),
        verifyOnly: true,
        token: TOKEN,
        contract: ESSENCE,
        answers: {
          'core.manifest': [manifest],
          'content.contract:bind': [bind],
          'content.contract:inspect': [inspect]
        }
      })
      assert.equal(out.error, undefined, `${JSON.stringify({ bind, inspect })}: ${out.error}`)
      assert.equal(out.printed, '')
      assert.deepEqual(writes(out.seq), [])
      assert.equal(out.seq.at(-1), 'door:content.contract:inspect')
    }
})

/** Asks `tracy_inspect_confirms` about one decoded door answer, of any JSON type. */
const inspectConfirms = (answer, contract = KINETIC, status = 200) =>
  run(`echo json_encode(tracy_inspect_confirms(${asPhp(answer)}, ${JSON.stringify(contract)}, ${status}));`)

// Every inspect answer that must NOT end a pairing. `bound` and `construction` may be absent; when
// either is there it has to be the boolean that agrees with a bound site, and nothing else.
const INSPECT_REFUSED = [
  // Not an answer at all.
  null,
  true,
  7,
  'ok',
  [],
  [true, KINETIC],
  {},
  // `ok` exactly `true`.
  { contract: KINETIC },
  { ok: false, contract: KINETIC },
  { ok: null, contract: KINETIC },
  { ok: 1, contract: KINETIC },
  { ok: 'true', contract: KINETIC },
  { ok: 1, bound: true, contract: KINETIC },
  { ok: false, error: 'SITE_BUSY' },
  // Exactly the contract asked for.
  { ok: true },
  { ok: true, bound: true },
  { ok: true, contract: '' },
  { ok: true, contract: null },
  { ok: true, contract: 'tracy-apple/j6/1.1.0' },
  { ok: true, contract: 'tracy-apple/j6/1.1.0', revision: 'r1' },
  { ok: true, contract: `${KINETIC}.1` },
  { ok: true, contract: `${KINETIC}\n` },
  { ok: true, contract: KINETIC.toUpperCase() },
  { ok: true, contract: [KINETIC] },
  { ok: true, bound: true, contract: [KINETIC] },
  // A site the component says is not bound, or is still under construction.
  { ok: true, bound: false, contract: KINETIC },
  { ok: true, construction: true, contract: KINETIC },
  { ok: true, bound: false, contract: '', baseline: KINETIC, construction: true },
  { ok: true, bound: false, contract: KINETIC, baseline: KINETIC, construction: true },
  // Flags that contradict each other: either refusal wins.
  { ok: true, bound: true, construction: true, contract: KINETIC },
  { ok: true, bound: false, construction: false, contract: KINETIC },
  // A flag that is there is a boolean, not something truthy, falsy or null.
  { ok: true, bound: 1, contract: KINETIC },
  { ok: true, bound: 0, contract: KINETIC },
  { ok: true, bound: 'yes', contract: KINETIC },
  { ok: true, bound: 'true', contract: KINETIC },
  { ok: true, bound: null, contract: KINETIC },
  { ok: true, bound: [], contract: KINETIC },
  { ok: true, construction: 1, contract: KINETIC },
  { ok: true, construction: 0, contract: KINETIC },
  { ok: true, construction: 'false', contract: KINETIC },
  { ok: true, construction: '', contract: KINETIC },
  { ok: true, construction: null, contract: KINETIC },
  { ok: true, construction: [], contract: KINETIC }
]

const INSPECT_CONFIRMED = [
  ...REAL_INSPECTS(KINETIC),
  // An answer that does say `bound`, or `construction`, is taken at its word when it agrees.
  { ok: true, bound: true, contract: KINETIC },
  { ok: true, construction: false, contract: KINETIC },
  { ok: true, bound: true, construction: false, contract: KINETIC, revision: 'r1' }
]

test('the read-back takes `ok`, the exact contract, and no flag that says otherwise', {
  skip: PHP_SKIP
}, () => {
  for (const answer of INSPECT_CONFIRMED)
    assert.equal(inspectConfirms(answer), true, `refused ${JSON.stringify(answer)}`)
  for (const answer of INSPECT_REFUSED)
    assert.equal(inspectConfirms(answer), false, `confirmed ${JSON.stringify(answer)}`)
  // Only over a 2xx, whatever the body says; 0 is a transport that never answered.
  for (const answer of INSPECT_CONFIRMED) {
    for (const status of [200, 201, 204, 299])
      assert.equal(inspectConfirms(answer, KINETIC, status), true, `refused over ${status}`)
    for (const status of [0, 100, 199, 300, 302, 401, 404, 409, 500, 503])
      assert.equal(inspectConfirms(answer, KINETIC, status), false, `confirmed over ${status}`)
  }
  // The contract compared is the one THIS provision named, not whichever the site reports.
  assert.equal(inspectConfirms({ ok: true, contract: KINETIC }, ESSENCE), false)
  assert.equal(inspectConfirms({ ok: true, contract: '' }, ''), false, 'an empty contract confirms nothing')
})

test('an inspect that does not confirm stops the pairing after the bind, first pass and re-run', {
  skip: PHP_SKIP
}, () => {
  // `null` is how the fake door spells a transport that never answered.
  for (const inspect of INSPECT_REFUSED)
    for (const verifyOnly of [false, true]) {
      const how = JSON.stringify({ inspect, verifyOnly })
      const out = scenario({
        row: row(verifyOnly ? { token: TOKEN, contract: KINETIC } : {}),
        verifyOnly,
        token: verifyOnly ? TOKEN : '',
        contract: KINETIC,
        answers: {
          'core.manifest': [manifest],
          'content.contract:bind': [bound()],
          'content.contract:inspect': [inspect]
        }
      })
      assert.match(
        out.error ?? 'no error',
        /^Quickstart contract inspect after bind did not confirm it: /,
        how
      )
      assert.equal(out.printed, undefined, `${how}: no token is handed back`)
      assert.equal(
        out.seq.filter((step) => step === 'door:content.contract:inspect').length,
        1,
        `${how}: a read-back that disagrees is not asked again`
      )
      for (const token of out.tokens) assert.ok(!out.error.includes(token), `${how}: no token in the message`)
    }
})

test('a refused read-back still says what the component answered, and only the fields a binding carries', {
  skip: PHP_SKIP
}, () => {
  const said = (answer, transport = '', status = 200) =>
    run(`echo json_encode(tracy_inspect_failure(${asPhp(answer)}, ${JSON.stringify(transport)}, ${status}));`)
  const head = 'Quickstart contract inspect after bind did not confirm it: '
  assert.equal(
    said({
      ok: true,
      bound: false,
      contract: '',
      baseline: KINETIC,
      construction: true,
      token: 'never-print-this'
    }),
    `${head}{"ok":true,"contract":"","bound":false}`
  )
  assert.equal(
    said({ ok: true, contract: 'tracy-apple/j6/1.1.0', revision: 'r1', rows: [1, 2] }),
    `${head}{"ok":true,"contract":"tracy-apple/j6/1.1.0"}`
  )
  assert.equal(said(null, 'Connection refused', 0), `${head}no answer (Connection refused)`)
  assert.equal(
    said({ ok: true, contract: KINETIC }, '', 503),
    `${head}HTTP 503 {"ok":true,"contract":"${KINETIC}"}`
  )
  assert.ok(said({ ok: false, error: 'x', message: 'm'.repeat(2000) }).length <= head.length + 500)
})

test('a door answer counts only over a 2xx, whatever its body says', { skip: PHP_SKIP }, () => {
  const rerun = {
    row: row({ token: TOKEN, contract: '' }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC
  }
  for (const code of [500, 404, 302, 0]) {
    const probe = scenario({ ...rerun, answers: sealedDoor(), status: { 'core.manifest': code } })
    assert.match(probe.error ?? 'no error', /Cowork token probe failed/, `manifest over ${code}`)
    const bind = scenario({ ...rerun, answers: sealedDoor(), status: { 'content.contract:bind': code } })
    assert.match(bind.error ?? 'no error', /binding failed: /, `bind over ${code}`)
    if (code !== 0) assert.match(bind.error, new RegExp(`HTTP ${code} `), 'the status is named')
    assert.ok(!bind.seq.includes('door:content.contract:inspect'), 'no inspect after a refused bind')
    const inspect = scenario({
      ...rerun,
      answers: sealedDoor(),
      status: { 'content.contract:inspect': code }
    })
    assert.match(inspect.error ?? 'no error', /inspect after bind/, `inspect over ${code}`)
  }
  const ok = scenario({ ...rerun, answers: sealedDoor(), status: { 'content.contract:bind': 201 } })
  assert.equal(ok.error, undefined, 'any 2xx is a success')
})

test('a refusal is read only over a 2xx too: "already bound" or a missing asset over an error status fails', {
  skip: PHP_SKIP
}, () => {
  const already = { ok: false, error: 'conflict', message: `This site is already bound to ${KINETIC}` }
  const missing = {
    ok: false,
    error: 'contract_failed',
    message: 'Presentation asset changed: media/t4/css/37.css'
  }
  for (const code of [500, 409, 404, 302, 0]) {
    const out = scenario({
      row: row({ token: TOKEN, contract: KINETIC }),
      verifyOnly: true,
      token: TOKEN,
      contract: KINETIC,
      answers: {
        'core.manifest': [manifest],
        'content.contract:bind': [already],
        'content.contract:inspect': [inspected()]
      },
      status: { 'content.contract:bind': code }
    })
    assert.match(out.error ?? 'no error', /binding failed: /, `"already bound" over ${code}`)
    assert.ok(!out.seq.includes('door:content.contract:inspect'), `no inspect after ${code}`)
    const stuck = scenario({
      row: row({}),
      contract: KINETIC,
      answers: {
        'core.manifest': [manifest],
        'content.contract:bind': [missing, bound()],
        'content.contract:inspect': [inspected()]
      },
      status: { 'content.contract:bind': code }
    })
    assert.match(stuck.error ?? 'no error', /binding failed: /, `missing asset over ${code}`)
    assert.equal(
      stuck.seq.filter((step) => step === 'door:content.contract:bind').length,
      1,
      `a refusal over ${code} buys no retry`
    )
  }
  const over200 = scenario({
    row: row({ token: TOKEN, contract: KINETIC }),
    verifyOnly: true,
    token: TOKEN,
    contract: KINETIC,
    answers: {
      'core.manifest': [manifest],
      'content.contract:bind': [already],
      'content.contract:inspect': [inspected()]
    }
  })
  assert.equal(over200.error, undefined, 'the same refusal over 200 is read, and inspect decides')
})

test('a re-run told the site is ALREADY bound to this contract is accepted only once inspect agrees', {
  skip: PHP_SKIP
}, () => {
  const rerun = (refusal, inspect = inspected()) =>
    scenario({
      row: row({ token: TOKEN, contract: KINETIC }),
      verifyOnly: true,
      token: TOKEN,
      contract: KINETIC,
      answers: {
        'core.manifest': [manifest],
        'content.contract:bind': [refusal],
        'content.contract:inspect': [inspect]
      }
    })
  const exact = { ok: false, error: 'conflict', message: `This site is already bound to ${KINETIC}` }
  const out = rerun(exact)
  assert.equal(out.error, undefined, out.error)
  assert.ok(out.seq.includes('door:content.contract:inspect'))
  const disagrees = rerun(exact, inspected('tracy-apple/j6/1.1.0'))
  assert.match(disagrees.error ?? 'no error', /inspect after bind .*tracy-apple/)
})

test('"already bound" is read only as the whole supported answer, never a fragment of another one', {
  skip: PHP_SKIP
}, () => {
  const whole = `This site is already bound to ${KINETIC}`
  const wrong = [
    // Another refusal that merely carries the sentence: prefix, suffix, or both.
    { ok: false, error: 'conflict', message: `Contract already bound to ${KINETIC}` },
    { ok: false, error: 'conflict', message: `Writer failed: ${whole}` },
    { ok: false, error: 'conflict', message: `${whole}; the snapshot drifted` },
    { ok: false, error: 'conflict', message: `${whole}\n` },
    { ok: false, error: 'conflict', message: ` ${whole}` },
    { ok: false, error: 'conflict', message: `${whole}.1` },
    { ok: false, error: 'conflict', message: whole.toUpperCase() },
    // The whole sentence under any other error code, or none.
    { ok: false, error: 'contract_failed', message: whole },
    { ok: false, error: 'unauthorized', message: whole },
    { ok: false, error: 'CONFLICT', message: whole },
    { ok: false, message: whole },
    { ok: false, error: 'conflict', message: [whole] },
    { ok: false, error: 'conflict' },
    { ok: null, error: 'conflict', message: whole },
    { error: 'conflict', message: whole }
  ]
  for (const refusal of wrong) {
    const out = scenario({
      row: row({ token: TOKEN, contract: KINETIC }),
      verifyOnly: true,
      token: TOKEN,
      contract: KINETIC,
      answers: {
        'core.manifest': [manifest],
        'content.contract:bind': [refusal],
        'content.contract:inspect': [inspected()]
      }
    })
    assert.match(out.error ?? 'no error', /binding failed: /, JSON.stringify(refusal))
    assert.ok(
      !out.seq.includes('door:content.contract:inspect'),
      'a refusal is never inspected into a success'
    )
  }
})

test('a missing generated asset is warmed and re-bound, at most three binds in all', {
  skip: PHP_SKIP
}, () => {
  const missing = {
    ok: false,
    error: 'contract_failed',
    message: 'Presentation asset changed: media/t4/css/37.css'
  }
  const healed = scenario({
    row: row({}),
    contract: KINETIC,
    answers: {
      'core.manifest': [manifest],
      'content.contract:bind': [missing, bound()],
      'content.contract:inspect': [inspected()]
    }
  })
  assert.equal(healed.error, undefined, healed.error)
  assert.deepEqual(
    healed.seq.filter((s) => s.startsWith('door:content') || s.startsWith('warm:')),
    [
      'warm:1',
      'door:content.contract:bind',
      'warm:2',
      'door:content.contract:bind',
      'door:content.contract:inspect'
    ]
  )
  const stuck = scenario({
    row: row({}),
    contract: KINETIC,
    answers: { 'core.manifest': [manifest], 'content.contract:bind': [missing] }
  })
  assert.match(stuck.error, /binding failed: .*37\.css/)
  assert.equal(stuck.seq.filter((s) => s === 'door:content.contract:bind').length, 3)
})

// ── The showcase-navigation phase: after bind and inspect, before the token is committed ──

const REQUEST = 'provision-ja-kinetic-20261023101500'
const running = (moved, remaining) => ({
  ok: true,
  status: 'running',
  moved,
  remaining,
  applyId: `snav-${REQUEST}`
})
const completed = (moved = 0) => ({
  ok: true,
  status: 'completed',
  moved,
  remaining: 0,
  applyId: `snav-${REQUEST}`
})
const navStatus = { ok: true, status: 'complete', remaining: 0, skipped: [], profileChanged: false }
const showcaseDoor = (apply, status = [navStatus]) => ({
  ...sealedDoor(),
  'content.contract:showcaseNav.apply': apply,
  'content.contract:showcaseNav.status': status
})
const doorSteps = (seq) => seq.filter((s) => s.startsWith('door:content'))

test('a new site is bound, inspected, has its showcase taken out of the menus in batches, then is read back', {
  skip: PHP_SKIP
}, () => {
  const out = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: showcaseDoor([running(100, 40), running(40, 0 + 1), completed(1)])
  })
  assert.equal(out.error, undefined, out.error)
  assert.deepEqual(doorSteps(out.seq), [
    'door:content.contract:bind',
    'door:content.contract:inspect',
    'door:content.contract:showcaseNav.apply',
    'door:content.contract:showcaseNav.apply',
    'door:content.contract:showcaseNav.apply',
    'door:content.contract:showcaseNav.status',
    'door:content.contract:inspect'
  ])
  assert.deepEqual(
    [...new Set(out.requests)],
    [`${REQUEST}|snav-${REQUEST}`],
    'one request id for the whole phase'
  )
  assert.ok(out.said.includes('    showcase navigation: 100 moved, 40 left'), out.said.join('\n'))
  assert.equal(out.said.at(-1), '    showcase navigation: applied')
  assert.ok(!JSON.stringify(out.said).includes(TOKEN), 'the token is never said')
})

test('no showcase request — a site this provision did not lay down — makes no showcase call', {
  skip: PHP_SKIP
}, () => {
  for (const verifyOnly of [false, true]) {
    const out = scenario({
      row: row(verifyOnly ? { token: TOKEN, contract: KINETIC } : {}),
      contract: KINETIC,
      token: TOKEN,
      verifyOnly,
      answers: showcaseDoor([completed()])
    })
    assert.equal(out.error, undefined, out.error)
    assert.deepEqual(
      doorSteps(out.seq).filter((s) => s.includes('showcaseNav')),
      []
    )
  }
})

test('a contract with no showcase map, or a component older than the phase, is skipped and the bootstrap succeeds', {
  skip: PHP_SKIP
}, () => {
  for (const [answer, said] of [
    [
      { ok: false, error: 'unsupported', message: 'no showcase-nav map for this design' },
      /skipped — unsupported: no showcase-nav map/
    ],
    [
      { ok: false, error: 'contract_failed', message: 'Unknown contract operation' },
      /skipped — unsupported: the installed Cowork component predates/
    ]
  ]) {
    const out = scenario({
      row: row({}),
      contract: KINETIC,
      token: TOKEN,
      showcase: REQUEST,
      answers: showcaseDoor([answer])
    })
    assert.equal(out.error, undefined, out.error)
    assert.match(out.said.at(-1), said)
    assert.deepEqual(
      doorSteps(out.seq).slice(2),
      ['door:content.contract:showcaseNav.apply'],
      'no status, no second inspect'
    )
  }
})

// 🔒 The phase is cosmetic: a phase that fails is said with `!!`, what it applied is reverted once, the
// contract is inspected again, and the pairing goes on. Only that inspect not confirming throws.
const reverted = { ok: true, status: 'reverted', moved: 1, remaining: 0 }
const failedPhase = (out, said) => {
  assert.equal(out.error, undefined, out.error)
  // 🔒 One failure is said in exactly ONE `!! showcase navigation:` line.
  const warned = out.said.filter((l) => l.startsWith('!! showcase navigation: '))
  assert.equal(warned.length, 1, out.said.join('\n'))
  assert.match(warned[0], said)
  assert.match(out.said.at(-1), /^ {4}showcase navigation: failed — /)
  assert.ok(
    doorSteps(out.seq).includes('door:content.contract:showcaseNav.revert'),
    'what it applied is reverted'
  )
  assert.equal(doorSteps(out.seq).at(-1), 'door:content.contract:inspect', 'the contract is inspected again')
  assert.ok(!out.said.join('\n').includes(TOKEN), 'the token is never said')
}

// The component answers `skipped` as an object keyed by owner (`showcaseNavSkipped()`: owner → why),
// beside `owners`. An owner left as it was is a conflict and named; one already as the map leaves it is
// not; every owner left as it was means nothing was hidden — failed, never "applied".
test('owners the status leaves as they were are named; all of them left is a failed phase, not applied', {
  skip: PHP_SKIP
}, () => {
  const status = (owners, skipped) => [{ ...navStatus, owners, skipped, conflicts: [] }]
  const answers = (s) => ({
    ...showcaseDoor([completed(1)], s),
    'content.contract:showcaseNav.revert': [reverted]
  })
  const partly = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers(
      status(4, { 'menuItem-101': 'menu_show is 0, not shown', 'menuItem-102': 'already out of the menu' })
    )
  })
  assert.equal(partly.error, undefined, partly.error)
  assert.equal(
    partly.said.at(-1),
    '    showcase navigation: applied, 1 of 4 owners left as they were (conflict: menuItem-101: menu_show is 0, not shown); 1 already as the map leaves them'
  )
  assert.deepEqual(
    partly.said.filter((l) => l.startsWith('!!')),
    []
  )
  const none = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers(
      status(2, { 'menuItem-101': 'the row is gone from this site', 'menuItem-102': 'published is 0, not 1' })
    )
  })
  failedPhase(
    none,
    /^!! showcase navigation: nothing was hidden — all 2 owners the map changes were left as they were \(conflict: menuItem-101: the row is gone from this site; menuItem-102: published is 0, not 1\); what it applied was reverted$/
  )

  // A T3 mega-menu sub or column the component kept on purpose (`kept the mega-menu …`: outcome
  // `skipped`, or `written` with part of its steps kept, as JA Rent's templateStyle-9) is its own
  // bucket: never a conflict, so beside an owner written (absent from `skipped`) it is never reverted away.
  const keptSub = 'kept the mega-menu sub of menuItem-201: a child of it is still in the menu'
  const keptColumn = 'kept the mega-menu column 2 of menuItem-202: a child of it is still in the menu'
  const mixed = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers(
      status(4, {
        'menuItem-101': 'menu_show is 0, not shown',
        'templateStyle-9': keptColumn,
        'templateStyle-10': keptSub
      })
    )
  })
  assert.equal(mixed.error, undefined, mixed.error)
  assert.equal(
    mixed.said.at(-1),
    `    showcase navigation: applied, 1 of 4 owners left as they were (conflict: menuItem-101: menu_show is 0, not shown); 2 kept on purpose (templateStyle-9: ${keptColumn}; templateStyle-10: ${keptSub})`
  )
  assert.deepEqual(
    mixed.said.filter((l) => l.startsWith('!!')),
    []
  )
  assert.ok(!doorSteps(mixed.seq).includes('door:content.contract:showcaseNav.revert'), 'nothing reverted')
  // JA SmallBiz (T3 mega) after the owner deleted every showcase item: each item a conflict, each
  // style kept because its children stayed. No owner written, none already, so no mega step was
  // taken: nothing was hidden, failed exactly as a non-mega map is.
  const smallbiz = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers(
      status(3, {
        'menuItem-101': 'the row is gone from this site',
        'templateStyle-9': keptColumn,
        'templateStyle-10': keptSub
      })
    )
  })
  failedPhase(
    smallbiz,
    /^!! showcase navigation: nothing was hidden — all 3 owners the map changes were left as they were \(conflict: menuItem-101: the row is gone from this site\); 2 mega-menu styles kept with them \(templateStyle-9: kept .*\); what it applied was reverted$/
  )
  const allKept = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers(status(2, { 'templateStyle-9': keptColumn, 'templateStyle-10': keptSub }))
  })
  assert.equal(allKept.error, undefined, allKept.error)
  assert.match(
    allKept.said.at(-1),
    /^ {4}showcase navigation: applied, 2 kept on purpose \(templateStyle-9: kept /
  )
  assert.deepEqual(
    allKept.said.filter((l) => l.startsWith('!!')),
    []
  )
  assert.ok(
    !doorSteps(allKept.seq).includes('door:content.contract:showcaseNav.revert'),
    'deliberate keeps never revert the hides beside them'
  )
})

test('a refusal, an ok that is not true over HTTP 200, or a stall is said, reverted, and the pairing goes on', {
  skip: PHP_SKIP
}, () => {
  // A refusal after a `running` answer or a lost one comes after a call that may have written: it is
  // reverted like any other failure (a refusal on the first call is its own test, below).
  for (const [apply, said] of [
    [
      [running(2, 3), { ok: false, error: 'conflict', message: 'the menu changed under the job' }],
      /refused: .*conflict/
    ],
    [
      [null, { ok: false, error: 'conflict', message: 'the menu changed under the job' }],
      /refused: .*conflict/
    ],
    [[{ status: 'completed', remaining: 0 }], /refused/],
    [[{ ok: 1, status: 'completed', remaining: 0 }], /refused/],
    [[running(10, 5), running(0, 5)], /made no progress/],
    [[{ ok: true, status: 'reverted', remaining: 0 }], /made no progress/]
  ]) {
    const out = scenario({
      row: row({}),
      contract: KINETIC,
      token: TOKEN,
      showcase: REQUEST,
      answers: { ...showcaseDoor(apply), 'content.contract:showcaseNav.revert': [reverted] }
    })
    failedPhase(out, said)
    assert.match(out.said.at(-1), /; what it applied was reverted$/)
    assert.equal(out.tokens.length, 1, 'the revert goes through the same door with the same token')
  }
  const unconfirmed = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: {
      ...showcaseDoor([completed()], [{ ok: true, status: 'partial', remaining: 3 }]),
      'content.contract:showcaseNav.revert': [running(1, 1), reverted]
    }
  })
  failedPhase(unconfirmed, /status after apply did not confirm it/)
  assert.ok(
    unconfirmed.said.includes('    showcase navigation: 1 put back, 1 left'),
    unconfirmed.said.join('\n')
  )
  assert.ok(
    unconfirmed.requests.includes(`${REQUEST}.rv|snav-revert-${REQUEST}`),
    'the revert is its own request'
  )
})

test('an apply refused on its first call wrote nothing: no revert, the inspect runs, and the line says so', {
  skip: PHP_SKIP
}, () => {
  const languages =
    'This site already has a second language; taking its showcase entries out of the menus would leave the translated menus showing them. Nothing has been written.'
  const refusal = { ok: false, error: 'contract_failed', message: languages }
  const untouched = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: { ...showcaseDoor([refusal]), 'content.contract:showcaseNav.revert': [refusal] }
  })
  assert.equal(untouched.error, undefined, untouched.error)
  assert.deepEqual(
    untouched.said.filter((l) => l.startsWith('!!')),
    [
      `!! showcase navigation: refused: {"ok":false,"error":"contract_failed","message":"${languages}"}; nothing was written, the template showcase stays in the menus`
    ]
  )
  assert.equal(
    untouched.said.at(-1),
    `    showcase navigation: failed — refused: {"ok":false,"error":"contract_failed","message":"${languages}"}; nothing was written, the template showcase stays in the menus`
  )
  assert.ok(!/partly hidden|revert did not/.test(untouched.said.join('\n')), untouched.said.join('\n'))
  assert.ok(
    !doorSteps(untouched.seq).includes('door:content.contract:showcaseNav.revert'),
    'nothing to revert'
  )
  assert.deepEqual(doorSteps(untouched.seq).slice(-2), [
    'door:content.contract:showcaseNav.apply',
    'door:content.contract:inspect'
  ])

  // The same refusal after a `running` answer may follow a written batch: the old recovery and words.
  const afterRunning = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: { ...showcaseDoor([running(2, 3), refusal]), 'content.contract:showcaseNav.revert': [refusal] }
  })
  failedPhase(
    afterRunning,
    /^!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; refused: .*contract_failed.*; revert: revert refused: .*contract_failed/
  )
  assert.match(afterRunning.said.at(-1), /; the revert did not finish \(/)
})

test('a half-applied site: the inspect after the phase does not confirm, the revert runs, the inspect is re-run', {
  skip: PHP_SKIP
}, () => {
  const answers = (inspect, revert) => ({
    ...showcaseDoor([running(2, 1), completed(1)]),
    'content.contract:inspect': inspect,
    'content.contract:showcaseNav.revert': revert
  })
  const drifted = { ok: true, contract: KINETIC, bound: false }
  // The inspect confirms again once the revert took back what was applied: the pairing goes on.
  const recovered = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers([inspected(), drifted, inspected()], [reverted])
  })
  failedPhase(recovered, /the contract inspect after it did not confirm it/)
  assert.deepEqual(doorSteps(recovered.seq).slice(-3), [
    'door:content.contract:inspect',
    'door:content.contract:showcaseNav.revert',
    'door:content.contract:inspect'
  ])
  assert.ok(!recovered.said.includes('    showcase navigation: applied'), 'never said applied')

  // A revert that fails is said; the pairing still goes on, because the contract inspects as bound.
  const unreverted = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: answers([inspected(), drifted, inspected()], [{ ok: false, error: 'conflict', message: 'busy' }])
  })
  failedPhase(unreverted, /the contract inspect after it did not confirm it/)
  assert.ok(
    unreverted.said.some((l) =>
      /^!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; the contract inspect after it did not confirm it: .*; revert: revert refused: .*conflict/.test(
        l
      )
    ),
    unreverted.said.join('\n')
  )
  assert.match(unreverted.said.at(-1), /; the revert did not finish \(/)

  // Apply dies mid-run (one batch moved, then its answers are lost) and the revert fails too — refused
  // or its answers lost — while the contract still inspects as bound: the pairing goes on, and the
  // `!!` line says plainly the menus may be partly hidden.
  for (const [revert, why] of [
    [[null], /; revert: revert lost its answer 3 times in a row/],
    [[{ ok: false, error: 'conflict', message: 'busy' }], /; revert: revert refused: .*conflict/]
  ]) {
    const partway = scenario({
      row: row({}),
      contract: KINETIC,
      token: TOKEN,
      showcase: REQUEST,
      answers: { ...showcaseDoor([running(2, 3), null]), 'content.contract:showcaseNav.revert': revert }
    })
    failedPhase(partway, /lost its answer 3 times in a row/)
    const line = partway.said.find((l) =>
      l.startsWith(
        '!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; lost its answer 3 times in a row'
      )
    )
    assert.ok(line, partway.said.join('\n'))
    assert.match(line, why)
    assert.ok(partway.said.includes('    showcase navigation: 2 moved, 3 left'))
    assert.match(
      partway.said.at(-1),
      /^ {4}showcase navigation: failed — lost its answer.*; the revert did not finish \(/
    )
  }

  // The contract no longer inspects as bound after the failed phase and its revert: a broken binding,
  // fatal exactly as an inspect after the bind is.
  for (const revert of [[reverted], [{ ok: false, error: 'conflict', message: 'busy' }]]) {
    const broken = scenario({
      row: row({}),
      contract: KINETIC,
      token: TOKEN,
      showcase: REQUEST,
      answers: answers([inspected(), drifted], revert)
    })
    assert.match(
      broken.error ?? '',
      /inspect after the failed showcase navigation and its revert did not confirm it/
    )
    assert.ok(!broken.error.includes(TOKEN))
    assert.ok(doorSteps(broken.seq).includes('door:content.contract:showcaseNav.revert'))
    assert.equal(doorSteps(broken.seq).at(-1), 'door:content.contract:inspect')
  }
})

// 🔒 A phase an earlier pass started and did not finish (`joomla.sh` read its mark) is not applied
// again — that pass may have died anywhere in it. With the door and the token there, it is reverted
// once and the contract inspected, then settled as failed; without a token, one `!!` line says the
// revert could not be attempted. Never skipped, never fatal unless that inspect does not confirm.
test('a phase an earlier pass started is taken back, not applied again, and settled as failed', {
  skip: PHP_SKIP
}, () => {
  const drifted = { ok: true, contract: KINETIC, bound: false }
  const resumed = (answers, extra = {}) =>
    scenario({
      row: row({}),
      contract: KINETIC,
      token: TOKEN,
      showcase: REQUEST,
      showcaseResumed: true,
      answers: { ...sealedDoor(), 'content.contract:showcaseNav.apply': [completed()], ...answers },
      ...extra
    })
  const recovered = resumed({ 'content.contract:showcaseNav.revert': [reverted] })
  failedPhase(
    recovered,
    /^!! showcase navigation: started on an earlier pass and not finished; what it applied was reverted$/
  )
  assert.ok(
    !doorSteps(recovered.seq).includes('door:content.contract:showcaseNav.apply'),
    'never applied again'
  )
  assert.deepEqual(doorSteps(recovered.seq).slice(-2), [
    'door:content.contract:showcaseNav.revert',
    'door:content.contract:inspect'
  ])
  assert.deepEqual([...new Set(recovered.requests)], [`${REQUEST}.rv|snav-revert-${REQUEST}`])
  assert.equal(
    recovered.said.at(-1),
    '    showcase navigation: failed — started on an earlier pass and not finished; what it applied was reverted'
  )

  for (const revert of [[null], [{ ok: false, error: 'conflict', message: 'busy' }]]) {
    const stuck = resumed({ 'content.contract:showcaseNav.revert': revert })
    failedPhase(
      stuck,
      /^!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; started on an earlier pass and not finished; revert: revert /
    )
    assert.match(stuck.said.at(-1), /; the revert did not finish \(/)
  }

  const broken = resumed({
    'content.contract:showcaseNav.revert': [reverted],
    'content.contract:inspect': [inspected(), drifted]
  })
  assert.match(
    broken.error ?? '',
    /inspect after the failed showcase navigation and its revert did not confirm it/
  )

  // No host token: no door to revert it through. One `!!` line, settled as failed, nothing called.
  const stranded = resumed({}, { token: undefined })
  assert.equal(stranded.error, undefined, stranded.error)
  assert.deepEqual(
    stranded.said.filter((l) => l.startsWith('!! showcase navigation: ')),
    [
      '!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted (it is applied only by a provision that holds the site token)'
    ]
  )
  assert.match(stranded.said.at(-1), /^ {4}showcase navigation: failed — started on an earlier pass/)
  assert.deepEqual(stranded.requests, [])
})

test('a lost answer is asked again with the SAME request id; three lost in a row fail the phase, never the pairing', {
  skip: PHP_SKIP
}, () => {
  const applies = (out) => out.requests.filter((r) => r === `${REQUEST}|snav-${REQUEST}`)
  const resumed = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: showcaseDoor([null, running(100, 1), null, completed(1)])
  })
  assert.equal(resumed.error, undefined, resumed.error)
  assert.equal(resumed.requests.length, 4)
  assert.deepEqual([...new Set(resumed.requests)], [`${REQUEST}|snav-${REQUEST}`])
  assert.equal(resumed.said.filter((l) => /no answer .*same request/.test(l)).length, 2)
  assert.equal(resumed.said.at(-1), '    showcase navigation: applied')
  const gone = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: showcaseDoor([null])
  })
  failedPhase(gone, /lost its answer 3 times in a row/)
  assert.equal(applies(gone).length, 3)
  const http = scenario({
    row: row({}),
    contract: KINETIC,
    token: TOKEN,
    showcase: REQUEST,
    answers: { ...showcaseDoor([completed()]), 'content.contract:showcaseNav.revert': [reverted] },
    status: { 'content.contract:showcaseNav.apply': 502 }
  })
  failedPhase(http, /HTTP 502/)
})

test('the showcase phase is skipped, never fatal, without the host token; never run for a card or a construction site', {
  skip: PHP_SKIP
}, () => {
  const tokenless = scenario({
    row: row({}),
    contract: KINETIC,
    showcase: REQUEST,
    answers: showcaseDoor([completed()])
  })
  assert.equal(tokenless.error, undefined, tokenless.error)
  assert.ok(
    tokenless.said.includes(
      '!! showcase navigation: it is applied only by a provision that holds the site token, so the phase cannot run'
    ),
    tokenless.said.join('\n')
  )
  assert.match(
    tokenless.said.at(-1),
    /showcase navigation: skipped — it is applied only by a provision that holds the site token/
  )
  assert.deepEqual(tokenless.requests, [])
  assert.ok(tokenless.printed, 'the minted token is still printed: the pairing finished')
  const card = scenario({
    row: row({}),
    workflow: 'template',
    token: TOKEN,
    showcase: REQUEST,
    answers: showcaseDoor([completed()])
  })
  assert.equal(card.error, undefined, card.error)
  assert.deepEqual(card.requests, [])
})

// ── The shell road: `joomla_bind_contract` and the card lookup, sourced from the real joomla.sh ──

const JOOMLA_SH = `${PROVISION}platform/joomla.sh`
const JOOMLA_SRC = readFileSync(JOOMLA_SH, 'utf8')
const SCRATCH = process.env.TRACY_TEST_ARTIFACTS_DIR || os.tmpdir()

/**
 * Sources joomla.sh with a `docker` stand-in, then runs `body`. The stand-in records its argv, takes
 * the first line of its stdin as the token it was handed (the rest must be the bootstrap itself),
 * records the mode of the host file holding that token AT THE MOMENT it was handed in, and answers
 * as FAKE_MODE says: `ok` succeeds, `exit3`/`exit1` fail the way the bootstrap does. Every scratch
 * file stays under SCRATCH: a bare `mktemp` is pointed there explicitly, TMPDIR is left alone.
 */
const shell = (body, { mode = 'ok', catalogue, files = {} } = {}) => {
  const dir = mkdtempSync(path.join(SCRATCH, 'joomla-bind-'))
  try {
    const site = path.join(dir, 'site')
    mkdirSync(site)
    for (const [name, make] of Object.entries(files)) make(path.join(site, name))
    const catalogueFile = path.join(dir, 'quickstarts.json')
    writeFileSync(catalogueFile, catalogue ?? '{}')
    const script = `
      set -euo pipefail
      tracy_web_image() { echo "$2"; }
      mktemp() { if [ "$#" = 0 ]; then command mktemp "$FAKE_SCRATCH/tmp.XXXXXX"; else command mktemp "$@"; fi; }
      docker() {
        local first rest f
        IFS= read -r first
        rest="$(cat)"
        printf '%s\\n' "$*" >> "$FAKE_LOG"
        printf '%s\\n' "$first" >> "$FAKE_SEEN"
        for f in "$SITE_DIR/tracy-agent.token" "$SITE_DIR/tracy-agent.token.pending"; do
          if [ -f "$f" ] && [ "$(head -n 1 "$f" 2>/dev/null)" = "$first" ]; then
            printf '%s %s\\n' "\${f##*/}" "$(command stat -c '%a' "$f" 2>/dev/null || command stat -f '%Lp' "$f")" >> "$FAKE_MODES"
          fi
        done
        case "$rest" in '<?php'*) ;; *) echo 'stdin after the token is not the bootstrap' >&2; return 9 ;; esac
        case "$FAKE_MODE" in
          ok) return 0 ;;
          exit3) return 3 ;;
          *) return 1 ;;
        esac
      }
      . "$JOOMLA_SH"
      ${body}
    `
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PYTHONDONTWRITEBYTECODE: '1',
        FAKE_SCRATCH: dir,
        FAKE_MODES: path.join(dir, 'modes.log'),
        JOOMLA_SH,
        HERE: PROVISION.replace(/\/$/, ''),
        SITE_DIR: site,
        FAKE_LOG: path.join(dir, 'docker.log'),
        FAKE_SEEN: path.join(dir, 'seen.log'),
        FAKE_MODE: mode,
        TRACY_QUICKSTARTS_JSON: catalogueFile
      }
    })
    if (r.error) throw r.error
    const read = (name) =>
      existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : ''
    const plain = (name) => {
      const p = path.join(site, name)
      return existsSync(p) && lstatSync(p).isFile() ? readFileSync(p, 'utf8') : null
    }
    const mode600 = (name) =>
      existsSync(path.join(site, name)) ? lstatSync(path.join(site, name)).mode & 0o777 : null
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      log: read('docker.log'),
      seen: read('seen.log').split('\n').filter(Boolean),
      handedModes: read('modes.log').split('\n').filter(Boolean),
      token: plain('tracy-agent.token'),
      tokenMode: mode600('tracy-agent.token'),
      pending: plain('tracy-agent.token.pending'),
      pendingMode: mode600('tracy-agent.token.pending'),
      strays: readdirSync(site).filter((n) => n.startsWith('.tracy-agent.token')),
      receipt: plain('showcase-nav.request'),
      started: existsSync(path.join(site, 'showcase-nav.started'))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const HEX64 = /^[a-f0-9]{64}$/

test('joomla.sh stays valid bash', () => {
  const r = spawnSync('bash', ['-n', JOOMLA_SH], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('a first pairing mints the token on the host, hands it on stdin, and commits it only on success', () => {
  const out = shell(`joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /rc=0/)
  assert.match(
    out.log,
    new RegExp(
      `-e TRACY_CONTRACT_ID=${KINETIC} -e TRACY_BUILD_WORKFLOW=contract -e TRACY_SHOWCASE_RESUMED=0 web sh -c`
    )
  )
  assert.doesNotMatch(out.log, /TRACY_CONTRACT_VERIFY_ONLY/)
  assert.equal(out.seen.length, 1)
  assert.match(out.seen[0], HEX64)
  assert.ok(!out.log.includes(out.seen[0]), 'the token is never in argv')
  assert.equal(out.token, `${out.seen[0]}\n`, 'the committed token is the one handed in')
  assert.equal(out.tokenMode, 0o600)
  assert.equal(out.pending, null, 'nothing pending once committed')
  assert.deepEqual(out.strays, [])
})

test('a re-run goes to the bootstrap as verify-only WITH the committed token and the contract', () => {
  const kept = `${'b'.repeat(64)}\n`
  const out = shell(`joomla_bind_contract ${KINETIC} contract 0`, {
    files: { 'tracy-agent.token': (p) => writeFileSync(p, kept) }
  })
  assert.equal(out.status, 0, out.stderr)
  assert.match(
    out.log,
    new RegExp(
      `-e TRACY_CONTRACT_VERIFY_ONLY=1 -e TRACY_CONTRACT_ID=${KINETIC} -e TRACY_BUILD_WORKFLOW=contract -e TRACY_SHOWCASE_RESUMED=0 web sh -c`
    )
  )
  assert.deepEqual(out.seen, ['b'.repeat(64)], 'the host token is what the bootstrap checks against')
  assert.equal(out.token, kept, 'the token the host holds is not replaced')
})

test('a committed token file that does not hold a token is refused before the container is called', () => {
  for (const bad of [
    '',
    '\n',
    `${'b'.repeat(40)}\n`,
    `${'B'.repeat(64)}\n`,
    `${'b'.repeat(64)}\n\n`,
    `${'b'.repeat(64)} \n`,
    'b'.repeat(65)
  ]) {
    const out = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, {
      files: { 'tracy-agent.token': (p) => writeFileSync(p, bad) }
    })
    assert.match(out.stdout, /rc=1/, JSON.stringify(bad))
    assert.match(out.stderr, /does not hold a pairing token/)
    assert.equal(out.log, '', `docker ran for ${JSON.stringify(bad)}`)
    assert.equal(out.token, bad, 'and it is left as it was')
  }
})

test('a pass that fails keeps the token pending, and the next pass resumes with the SAME token', () => {
  const out = shell(`
    FAKE_MODE=exit1
    joomla_bind_contract ${KINETIC} contract 0 || echo "first=$?"
    [ ! -e "$SITE_DIR/tracy-agent.token" ] && echo 'no committed token after a failure'
    FAKE_MODE=ok
    joomla_bind_contract ${KINETIC} contract 0 && echo "second=0"
  `)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /first=1/)
  assert.match(out.stdout, /no committed token after a failure/)
  assert.match(out.stdout, /second=0/)
  assert.equal(out.seen.length, 2)
  assert.equal(out.seen[0], out.seen[1], 'the resumed pass hands in the token the component may hold')
  assert.doesNotMatch(out.log.split('\n')[1], /VERIFY_ONLY/, 'a resume is not a verify-only re-run')
  assert.equal(out.token, `${out.seen[0]}\n`)
  assert.equal(out.pending, null)
  assert.match(out.stderr, /tracy-agent\.token\.pending is kept/)
  assert.ok(!out.stderr.includes(out.seen[0]), 'the token is never logged')
})

test('a failed pass leaves its pending token 0600, and no committed token', () => {
  const out = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, { mode: 'exit1' })
  assert.match(out.stdout, /rc=1/)
  assert.equal(out.token, null)
  assert.match(out.pending ?? '', /^[a-f0-9]{64}\n$/)
  assert.equal(out.pendingMode, 0o600)
  assert.deepEqual(out.strays, [])
})

test('a pending file that is not a token is refused and kept, never replaced by a fresh token', () => {
  for (const bad of [
    '',
    'garbage\n',
    `${'c'.repeat(63)}\n`,
    `${'c'.repeat(64)}\n\n`,
    `${'C'.repeat(64)}\n`
  ]) {
    const out = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, {
      files: { 'tracy-agent.token.pending': (p) => writeFileSync(p, bad) }
    })
    assert.match(out.stdout, /rc=1/, JSON.stringify(bad))
    assert.match(out.stderr, /tracy-agent\.token\.pending does not hold a pairing token/)
    assert.equal(
      out.log,
      '',
      `docker ran for ${JSON.stringify(bad)}: a fresh token would reset the site again`
    )
    assert.equal(out.pending, bad, 'the damaged file is left for a person to look at')
    assert.equal(out.token, null)
    assert.deepEqual(out.strays, [])
  }
})

test('a pairing the component confirmed is not done until the host token is committed at 0600', () => {
  // mv fails: the pending token stays, nothing is committed, and the next pass resumes with it.
  const moved = shell(`
    mv() { if [ "\${@: -1}" = "$SITE_DIR/tracy-agent.token" ]; then return 1; fi; command mv "$@"; }
    joomla_bind_contract ${KINETIC} contract 0 || echo "first=$?"
    unset -f mv
    joomla_bind_contract ${KINETIC} contract 0 && echo "second=0"
  `)
  assert.equal(moved.status, 0, moved.stderr)
  assert.match(moved.stdout, /first=1/)
  assert.match(moved.stderr, /tracy-agent\.token could not be written/)
  assert.match(moved.stdout, /second=0/)
  assert.equal(moved.seen.length, 2)
  assert.equal(moved.seen[0], moved.seen[1], 'the resumed pass hands in the SAME token')
  assert.doesNotMatch(moved.log.split('\n')[1], /VERIFY_ONLY/)
  assert.equal(moved.token, `${moved.seen[0]}\n`)
  assert.equal(moved.tokenMode, 0o600)
  // The commit leaves the token at a wider mode and chmod cannot fix it: not reported done, and
  // the next pass (chmod working again) makes it 0600 and proves it before it says so.
  const widened = shell(`
    mv() { command mv "$@" || return; [ "\${@: -1}" != "$SITE_DIR/tracy-agent.token" ] || command chmod 644 "\${@: -1}"; }
    chmod() { return 1; }
    joomla_bind_contract ${KINETIC} contract 0 || echo "first=$?"
    unset -f mv chmod
    joomla_bind_contract ${KINETIC} contract 0 && echo "second=0"
  `)
  assert.equal(widened.status, 0, widened.stderr)
  assert.match(widened.stdout, /first=1/)
  assert.match(widened.stderr, /could not be made private/)
  assert.match(widened.stdout, /second=0/)
  assert.equal(widened.seen.length, 2)
  assert.equal(widened.seen[0], widened.seen[1])
  assert.match(widened.log.split('\n')[1], /VERIFY_ONLY/, 'the second pass verifies the committed token')
  assert.equal(widened.token, `${widened.seen[0]}\n`)
  assert.equal(widened.tokenMode, 0o600)
  // A verify-only re-run that cannot clear a stale pending file is not reported done either.
  const stale = shell(
    `
    rm() { return 1; }
    joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"
  `,
    {
      files: {
        'tracy-agent.token': (p) => writeFileSync(p, `${'b'.repeat(64)}\n`),
        'tracy-agent.token.pending': (p) => writeFileSync(p, `${'c'.repeat(64)}\n`)
      }
    }
  )
  assert.match(stale.stdout, /rc=1/)
  assert.match(stale.stderr, /stale tracy-agent\.token\.pending could not be removed/)
  assert.equal(stale.token, `${'b'.repeat(64)}\n`, 'the committed token is kept')
  // Minting that cannot keep its token pending never reaches the container.
  const mint = shell(`
    mv() { return 1; }
    joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"
  `)
  assert.match(mint.stdout, /rc=1/)
  assert.match(mint.stderr, /could not keep the minted token pending/)
  assert.equal(mint.log, '', 'no token is handed in that the host does not hold')
  assert.deepEqual(mint.strays, [])
})

// 🔒 One invariant for every token file: the container is handed a token only from a file at 0600,
// and a pass says done only once `tracy-agent.token` holds that token at 0600, READ BACK. A wrong
// mode is fixed and proven; a chmod that fails, or that answers 0 and changes nothing, stops the
// pass before Docker with the token kept for the next one.
const TOKEN_STATES = {
  pending: { 'tracy-agent.token.pending': 'c' },
  committed: { 'tracy-agent.token': 'b' },
  both: { 'tracy-agent.token': 'b', 'tracy-agent.token.pending': 'c' }
}
const CHMODS = {
  real: '',
  fail: 'chmod() { return 1; }',
  noop: 'chmod() { return 0; }'
}
const placed = (state, mode) =>
  Object.fromEntries(
    Object.entries(TOKEN_STATES[state]).map(([name, ch]) => [
      name,
      (p) => {
        writeFileSync(p, `${ch.repeat(64)}\n`)
        chmodSync(p, mode)
      }
    ])
  )

test('every token state × mode × chmod: Docker sees only 0600, success only with the token committed at 0600', () => {
  for (const state of Object.keys(TOKEN_STATES))
    for (const mode of [0o600, 0o644, 0o666])
      for (const [how, stub] of Object.entries(CHMODS)) {
        const why = `${state} ${mode.toString(8)} chmod=${how}`
        const inUse = state === 'pending' ? 'c'.repeat(64) : 'b'.repeat(64)
        const out = shell(
          `${stub}\n joomla_bind_contract ${KINETIC} contract 0 && echo rc=0 || echo "rc=$?"`,
          {
            files: placed(state, mode)
          }
        )
        for (const line of out.handedModes) assert.match(line, / 600$/, `${why}: handed in ${line}`)
        if (mode === 0o600 || how === 'real') {
          assert.match(out.stdout, /rc=0/, `${why}: ${out.stderr}`)
          assert.deepEqual(out.seen, [inUse], why)
          assert.equal(out.handedModes.length, 1, why)
          assert.equal(out.token, `${inUse}\n`, why)
          assert.equal(out.tokenMode, 0o600, why)
          assert.equal(out.pending, null, why)
          assert.equal(/VERIFY_ONLY/.test(out.log), state !== 'pending', why)
        } else {
          assert.match(out.stdout, /rc=1/, why)
          assert.match(out.stderr, /could not be made private \(0600\)/, why)
          assert.equal(out.log, '', `${why}: docker ran with a token at a wider mode`)
          for (const [name, ch] of Object.entries(TOKEN_STATES[state])) {
            const kept = name === 'tracy-agent.token' ? out.token : out.pending
            assert.equal(kept, `${ch.repeat(64)}\n`, `${why}: ${name} is kept for the next pass`)
          }
        }
      }
})

test('a pass stopped by a chmod that failed or did nothing resumes with the SAME token, and resets once', () => {
  for (const [state, how] of [
    ['pending', 'fail'],
    ['pending', 'noop'],
    ['committed', 'fail'],
    ['committed', 'noop']
  ]) {
    const why = `${state} chmod=${how}`
    const inUse = state === 'pending' ? 'c'.repeat(64) : 'b'.repeat(64)
    const out = shell(
      `
      ${CHMODS[how]}
      joomla_bind_contract ${KINETIC} contract 0 || echo "first=$?"
      unset -f chmod
      joomla_bind_contract ${KINETIC} contract 0 && echo "second=0"
    `,
      { files: placed(state, 0o644) }
    )
    assert.equal(out.status, 0, `${why}: ${out.stderr}`)
    assert.match(out.stdout, /first=1/, why)
    assert.match(out.stdout, /second=0/, why)
    assert.deepEqual(out.seen, [inUse], `${why}: one pairing call, with the token the host held`)
    assert.deepEqual(
      out.handedModes,
      [`${state === 'pending' ? 'tracy-agent.token.pending' : 'tracy-agent.token'} 600`],
      why
    )
    // A pending resume is a first-pass call (the bootstrap's own "component already holds it" road
    // keeps it from resetting twice); a committed token is only ever verified.
    assert.equal(/VERIFY_ONLY/.test(out.log), state === 'committed', why)
    assert.equal(out.token, `${inUse}\n`, why)
    assert.equal(out.tokenMode, 0o600, why)
  }
})

test('a minted token that cannot be proven 0600 never reaches the container, and the next pass resumes it', () => {
  const out = shell(`
    mv() { command mv "$@" && command chmod 644 "\${@: -1}"; }
    chmod() { return 0; }
    joomla_bind_contract ${KINETIC} contract 0 || echo "first=$?"
    unset -f mv chmod
    joomla_bind_contract ${KINETIC} contract 0 && echo "second=0"
  `)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /first=1/)
  assert.match(out.stderr, /tracy-agent\.token\.pending could not be made private/)
  assert.match(out.stdout, /second=0/)
  assert.equal(out.seen.length, 1, 'the first pass never called Docker')
  assert.deepEqual(out.handedModes, ['tracy-agent.token.pending 600'])
  assert.equal(out.token, `${out.seen[0]}\n`)
  assert.equal(out.tokenMode, 0o600)
  assert.deepEqual(out.strays, [])
})

test('a token file this host cannot read is refused before it is read, changed or handed in', {
  skip: process.getuid?.() === 0 && 'root reads a 0000 file, so no unreadable file can be made'
}, () => {
  for (const name of ['tracy-agent.token', 'tracy-agent.token.pending']) {
    // Bash 3.2 applies errexit to `command stat` even before ||, so let BSD stat reach its fallback.
    const out = shell(
      `joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"; stat -c '%a' "$SITE_DIR/${name}" 2>/dev/null || stat -f '%Lp' "$SITE_DIR/${name}"; command chmod 600 "$SITE_DIR/${name}"`,
      {
        files: {
          [name]: (p) => {
            writeFileSync(p, `${'b'.repeat(64)}\n`)
            chmodSync(p, 0)
          }
        }
      }
    )
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /rc=1/, name)
    assert.match(out.stderr, /does not hold a pairing token/, name)
    assert.equal(out.log, '', `docker ran with an unreadable ${name}`)
    assert.match(out.stdout, /^0$/m, `${name} was chmod-ed rather than left for a person`)
  }
})

test('the shell refuses a contract that is not a profile id before the container is ever called', () => {
  for (const bad of ["''", `'${KINETIC}"'`, `$'${KINETIC}\\n'`, "'../x/j6/1.0.0'", "'Ja/j6/1.0.0'"]) {
    const out = shell(`joomla_bind_contract ${bad} contract 0 || echo "rc=$?"`)
    assert.match(out.stdout, /rc=1/, bad)
    assert.equal(out.log, '', `docker ran for ${bad}`)
    assert.equal(out.token, null)
    assert.equal(out.pending, null, 'no token is minted for a refused contract')
  }
  // A template card names no contract at all, and that is not a refusal.
  const template = shell(`joomla_bind_contract '' template 1`)
  assert.equal(template.status, 0, template.stderr)
  assert.match(
    template.log,
    /-e TRACY_CONTRACT_ID= -e TRACY_BUILD_WORKFLOW=template -e TRACY_SHOWCASE_RESUMED=0 web sh -c/
  )
})

test('exit 3 means "no component" only for an optional pairing, and keeps no token for a component that is not there', () => {
  const optional = shell(`joomla_bind_contract '' template 1 || echo "rc=$?"`, { mode: 'exit3' })
  assert.match(optional.stdout, /rc=3/)
  assert.equal(optional.token, null)
  assert.equal(optional.pending, null)
  const required = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, { mode: 'exit3' })
  assert.match(required.stdout, /rc=1/)
  assert.equal(required.pending, null)
  const rerunFailed = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, {
    mode: 'exit1',
    files: { 'tracy-agent.token': (p) => writeFileSync(p, `${'b'.repeat(64)}\n`) }
  })
  assert.match(rerunFailed.stdout, /rc=1/)
  assert.equal(rerunFailed.token, `${'b'.repeat(64)}\n`, 'a failed re-run keeps the committed token')
  // "No component" is a finished pass only once the minted pending token is really gone: an rm that
  // fails, or that answers 0 and removes nothing, turns exit 3 into a failure that says so.
  for (const [how, stub] of [
    ['fail', 'rm() { return 1; }'],
    ['noop', 'rm() { return 0; }']
  ])
    for (const [args, optionalPairing] of [
      [`'' template 1`, true],
      [`${KINETIC} contract 0`, false]
    ]) {
      const why = `rm=${how} ${args}`
      const out = shell(`${stub}\n joomla_bind_contract ${args} && echo rc=0 || echo "rc=$?"`, {
        mode: 'exit3'
      })
      assert.match(out.stdout, /rc=1/, `${why}: exit 3 with a token left on disk`)
      assert.doesNotMatch(out.stdout, /rc=3/, why)
      assert.match(out.stderr, /tracy-agent\.token\.pending could not be removed/, why)
      assert.match(out.pending ?? '', /^[a-f0-9]{64}\n$/, `${why}: the file is still there, as said`)
      assert.equal(out.token, null, why)
      assert.ok(optionalPairing || out.seen.length === 1, why)
    }
})

test('a minted token whose temporary file cannot be written or moved leaves no silent stray', () => {
  // The write or the rename fails and the clean-up works: nothing stays behind, nothing is handed in.
  for (const [what, stub] of [
    ['write', 'printf() { return 1; }'],
    ['rename', 'mv() { return 1; }']
  ]) {
    const out = shell(`${stub}\n joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`)
    assert.match(out.stdout, /rc=1/, what)
    assert.match(out.stderr, /could not keep the minted token pending/, what)
    assert.equal(out.log, '', `${what}: docker ran`)
    assert.deepEqual(out.strays, [], `${what}: the temporary file is removed`)
    assert.equal(out.pending, null, what)
    assert.equal(out.token, null, what)
    assert.doesNotMatch(out.stderr, /could not be removed/, what)
  }
  // The clean-up fails too, or answers 0 and removes nothing: the stray is NAMED, never left silent.
  for (const [how, stub] of [
    ['fail', 'rm() { return 1; }'],
    ['noop', 'rm() { return 0; }']
  ]) {
    const out = shell(
      `mv() { return 1; }\n ${stub}\n joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`
    )
    assert.match(out.stdout, /rc=1/, how)
    assert.equal(out.log, '', `rm=${how}: docker ran`)
    assert.equal(out.strays.length, 1, `rm=${how}: the stray really is there`)
    assert.ok(
      out.stderr.includes(`${out.strays[0]} could not be removed: delete it by hand`),
      `rm=${how}: the stray is named: ${out.stderr}`
    )
    assert.equal(out.pending, null, how)
  }
})

test('a token or pending path that is a link, a pipe or a folder is refused, and never written through', () => {
  const target = path.join(SCRATCH, `joomla-bind-target-${process.pid}`)
  writeFileSync(target, 'untouched')
  try {
    for (const name of ['tracy-agent.token', 'tracy-agent.token.pending'])
      for (const [kind, make] of [
        ['link', (p) => symlinkSync(target, p)],
        ['folder', (p) => mkdirSync(p)],
        ['pipe', (p) => spawnSync('mkfifo', [p])]
      ]) {
        const out = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, {
          files: { [name]: make }
        })
        assert.match(out.stdout, /rc=1/, `${name} ${kind}`)
        assert.match(out.stderr, /not a plain file/, `${name} ${kind}`)
        assert.equal(out.log, '', `docker ran with a ${kind} at ${name}`)
      }
    assert.equal(readFileSync(target, 'utf8'), 'untouched', 'nothing was written through a link')
  } finally {
    rmSync(target, { force: true })
  }
})

test('the card lookup tells "this card has no profile" apart from a lookup that failed', () => {
  const lookup = 'QUICKSTART=quickstart/ja-test/j6; joomla_card_contract; echo "rc=$?"'
  const card = (entry) => JSON.stringify({ 'quickstart/ja-test/j6': { platform: 'joomla', ...entry } })
  assert.equal(shell(lookup, { catalogue: card({ contract: KINETIC }) }).stdout, `${KINETIC}\nrc=0\n`)
  // ja-essence, ja-impact: no profile in this repo. Unsealed, NOT given one.
  assert.equal(shell(lookup, { catalogue: card({}) }).stdout, 'rc=0\n')
  for (const [why, catalogue] of [
    ['unknown id', JSON.stringify({ other: { platform: 'joomla' } })],
    ['malformed catalogue', '{not json'],
    ['empty contract', card({ contract: '' })],
    ['numeric contract', card({ contract: 7 })],
    ['null contract', card({ contract: null })],
    ['list contract', card({ contract: [KINETIC] })],
    ['contract with a quote', card({ contract: `${KINETIC}"` })],
    ['contract climbing out', card({ contract: '../../etc/j6/1.0.0' })],
    // A truthy entry of the wrong type does not "lack" a contract: it is a broken entry.
    ['entry is a string', JSON.stringify({ 'quickstart/ja-test/j6': 'joomla' })],
    ['entry is a list', JSON.stringify({ 'quickstart/ja-test/j6': [{ contract: KINETIC }] })],
    ['entry is a number', JSON.stringify({ 'quickstart/ja-test/j6': 7 })],
    ['catalogue is a list', JSON.stringify([{ contract: KINETIC }])]
  ]) {
    const out = shell('QUICKSTART=quickstart/ja-test/j6; joomla_card_contract || echo "rc=$?"', { catalogue })
    assert.match(out.stdout, /^rc=1$/m, why)
    assert.doesNotMatch(out.stdout, /ja-kinetic/, why)
    assert.match(out.stderr, /could not read this card's content contract|not a profile id/, why)
  }
})

test('quickstart.py --field exits 4 only for a key a well-formed object lacks', () => {
  const field = (catalogue, name) => {
    const dir = mkdtempSync(path.join(SCRATCH, 'quickstart-field-'))
    try {
      const file = path.join(dir, 'quickstarts.json')
      writeFileSync(file, catalogue)
      return spawnSync('python3', [`${PROVISION}quickstart.py`, '--id', 'q', '--field', name], {
        encoding: 'utf8',
        timeout: 30000,
        env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1', TRACY_QUICKSTARTS_JSON: file }
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const q = (entry) => JSON.stringify({ q: entry })
  assert.equal(field(q({ platform: 'joomla' }), 'contract').status, 4)
  assert.equal(field(q({ template: {} }), 'template.id').status, 4)
  const found = field(q({ template: { id: 'x' } }), 'template.id')
  assert.deepEqual([found.status, found.stdout], [0, 'x\n'])
  for (const [why, catalogue, name] of [
    ['entry is a string', q('joomla'), 'contract'],
    ['entry is a list', q([{ contract: KINETIC }]), 'contract'],
    ['entry is a number', q(7), 'contract'],
    ['parent is a non-empty string', q({ template: 'ja-kinetic' }), 'template.id'],
    ['parent is a list', q({ template: [{ id: 'x' }] }), 'template.id'],
    ['parent is a number', q({ template: 3 }), 'template.id'],
    ['leaf is a list', q({ contract: [KINETIC] }), 'contract'],
    ['leaf is a number', q({ contract: 7 }), 'contract'],
    ['leaf is an object', q({ template: { id: { v: 1 } } }), 'template.id'],
    ['leaf is empty', q({ contract: '' }), 'contract'],
    ['catalogue is a list', JSON.stringify([{ contract: KINETIC }]), 'contract']
  ]) {
    const r = field(catalogue, name)
    assert.equal(r.status, 1, `${why}: ${r.stderr}`)
    assert.doesNotMatch(r.stderr, /Traceback/, why)
  }
})

test('both quickstart roads pair through joomla_bind_contract, after their marker; import still derives', () => {
  const bootstrapRuns = JOOMLA_SRC.split('\n').filter((l) => l.includes('cat "$HERE/joomla-bootstrap.php"'))
  assert.equal(bootstrapRuns.length, 2, 'the bootstrap runs from one function only (first pass + re-run)')
  const fn = JOOMLA_SRC.indexOf('joomla_bind_contract() {')
  const fnEnd = JOOMLA_SRC.indexOf('\n}\n', fn)
  for (const line of bootstrapRuns) {
    const at = JOOMLA_SRC.indexOf(line)
    assert.ok(at > fn && at < fnEnd, 'inside joomla_bind_contract')
  }
  const templateRoad = JOOMLA_SRC.indexOf('= template ]; then')
  const cardMarker = JOOMLA_SRC.indexOf('.content-contracts/$LABEL.json"', templateRoad)
  assert.ok(
    cardMarker < JOOMLA_SRC.indexOf('joomla_bind_contract "$card_contract" "$pair_workflow" "$pair_optional"')
  )
  assert.ok(JOOMLA_SRC.includes('card_contract="$(joomla_card_contract)" || return 1'))
  const contractRoad = JOOMLA_SRC.indexOf('provision resolved no content contract')
  const marker = JOOMLA_SRC.indexOf('.content-contracts/$LABEL.json"', contractRoad)
  const bind = JOOMLA_SRC.indexOf(
    'joomla_bind_contract "$CONTRACT_ID" "${BUILD_WORKFLOW:-contract}" 0 || return 1'
  )
  assert.ok(contractRoad < marker && marker < bind, 'marker before bind on the contract road')
  assert.ok(
    bind < JOOMLA_SRC.indexOf('joomla_enable_content_reader || return 1', bind),
    'bind before the reader'
  )
  const importRoad = JOOMLA_SRC.slice(
    JOOMLA_SRC.indexOf('if [ "${FRESH:-0}" != 1 ] && [ -z "${QUICKSTART:-}" ]; then')
  )
  assert.match(importRoad, /joomla_derive_contract/)
  assert.doesNotMatch(importRoad, /joomla_bind_contract/)
})

// ── The shell side of the showcase phase: the receipt, and the coverage state every road says ──

const RECEIPT = (id) => (p) => writeFileSync(p, `${id}\n`)

test('a site with a receipt hands its request id to a binding bootstrap and drops the receipt only on success', () => {
  const ok = shell(`joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`, {
    files: { 'showcase-nav.request': RECEIPT(REQUEST) }
  })
  assert.match(ok.stdout, /rc=0/, ok.stderr)
  assert.match(
    ok.log,
    new RegExp(
      `exec -T -e TRACY_SHOWCASE_REQUEST=${REQUEST} -e TRACY_PAIR_OPTIONAL=0 -e TRACY_CONTRACT_ID=${KINETIC} -e TRACY_BUILD_WORKFLOW=contract -e TRACY_SHOWCASE_RESUMED=0 web`
    )
  )
  assert.equal(ok.receipt, null, 'settled once the bootstrap confirmed it')
  assert.equal(ok.started, false)
  const failed = shell(`joomla_bind_contract ${KINETIC} contract 0 || echo "rc=$?"`, {
    mode: 'exit1',
    files: { 'showcase-nav.request': RECEIPT(REQUEST) }
  })
  assert.match(failed.stdout, /rc=1/)
  assert.equal(failed.receipt, `${REQUEST}\n`, 'kept, so the next pass resumes the same job')
  assert.equal(
    failed.started,
    true,
    'the phase may have begun: a later road settles it as failed, never skipped'
  )
})

// 🔒 A phase an earlier pass began and did not finish may have left the menus half-edited. No road that
// would skip it settles it as skipped: each says so with `!!`, settles it as failed and goes on — the
// phase is cosmetic, so it never stops a site being created.
test('a site whose showcase phase began on an earlier pass is settled as failed, never skipped, and handed over', () => {
  const begun = {
    'showcase-nav.request': RECEIPT(REQUEST),
    'showcase-nav.started': (p) => writeFileSync(p, '')
  }
  for (const [body, mode, rc] of [
    [`joomla_bind_contract ${KINETIC} contract 1`, 'exit3', 3],
    ['joomla_bind_contract "" template 1', 'ok', 0],
    [`joomla_bind_contract ${KINETIC} template-build 0`, 'ok', 0]
  ]) {
    const out = shell(`rc=0; ${body} || rc=$?; echo "rc=$rc"`, { mode, files: begun })
    assert.match(out.stdout, new RegExp(`rc=${rc}`), `${body}: ${out.stderr}`)
    // No contract or no component on this road: the revert cannot be attempted. One `!!` line.
    assert.deepEqual(
      out.stderr.split('\n').filter((l) => l.startsWith('!! showcase navigation:')),
      [
        out.stderr.match(
          /^!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted \(.+\)$/m
        )?.[0]
      ],
      out.stderr
    )
    assert.match(out.stdout, /showcase navigation: failed — started on an earlier pass/)
    assert.doesNotMatch(out.stdout, /showcase navigation: skipped/)
    assert.equal(out.receipt, null, 'settled')
    assert.equal(out.started, false)
  }
  // A binding pass tells the bootstrap the phase was started (it takes it back, never applies it
  // again: `tracy_showcase_phase`), and settles both once the bootstrap confirmed it.
  const resumed = shell(`joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`, { files: begun })
  assert.match(resumed.stdout, /rc=0/, resumed.stderr)
  assert.match(
    resumed.log,
    new RegExp(`-e TRACY_SHOWCASE_REQUEST=${REQUEST} .*-e TRACY_SHOWCASE_RESUMED=1 web`)
  )
  assert.equal(resumed.receipt, null)
  assert.equal(resumed.started, false)
})

// The phase is cosmetic: a mark that cannot be written never stops the pairing. The phase then does
// not run (no request handed in), and is settled as skipped once the pairing holds.
test('a phase that cannot be marked as started is skipped, and the pairing goes on', () => {
  const out = shell(
    `tracy_showcase_start() { echo '!! showcase navigation: could not mark the phase as started, so it does not start' >&2; return 1; }
    joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`,
    { files: { 'showcase-nav.request': RECEIPT(REQUEST) } }
  )
  assert.match(out.stdout, /rc=0/, out.stderr)
  assert.match(out.log, /-e TRACY_SHOWCASE_REQUEST= -e TRACY_PAIR_OPTIONAL=0/)
  assert.match(out.stdout, /showcase navigation: skipped — the phase could not be marked as started/)
  assert.equal(out.stderr.split('\n').filter((l) => l.startsWith('!! showcase navigation:')).length, 1)
  assert.equal(out.receipt, null)
  assert.equal(out.started, false)
})

// 🔒 The mark decides, not the receipt: a started phase whose receipt is missing or holds no request id
// has no job to revert. Every road settles it as failed with one `!!` line saying the revert could not
// be attempted — never "not applied" or "skipped" — and goes on; such a receipt is kept for a person.
test('a started phase whose receipt is missing or holds no request id is settled as failed, never not applied', () => {
  const mark = { 'showcase-nav.started': (p) => writeFileSync(p, '') }
  for (const [files, left, why] of [
    [
      { ...mark, 'showcase-nav.request': RECEIPT('not a request id!') },
      'not a request id!\n',
      /\(showcase-nav\.request does not hold a request id to revert it with; the file is kept for a person to look at\)$/
    ],
    [mark, null, /\(there is no showcase-nav\.request to revert it with\)$/]
  ]) {
    for (const [body, mode, rc] of [
      [`joomla_bind_contract ${KINETIC} contract 0`, 'ok', 0],
      [`joomla_bind_contract ${KINETIC} contract 1`, 'exit3', 3],
      ['joomla_bind_contract "" template 1', 'ok', 0]
    ]) {
      const out = shell(`rc=0; ${body} || rc=$?; echo "rc=$rc"`, { mode, files })
      assert.match(out.stdout, new RegExp(`rc=${rc}`), `${body}: ${out.stderr}`)
      const warned = out.stderr.split('\n').filter((l) => l.startsWith('!! showcase navigation:'))
      assert.equal(warned.length, 1, `${body}: ${out.stderr}`)
      assert.match(
        warned[0],
        /^!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted /
      )
      assert.match(warned[0], why)
      assert.match(out.stdout, /showcase navigation: failed — started on an earlier pass and not finished/)
      assert.doesNotMatch(out.stdout, /not applied|skipped/)
      assert.match(out.log, /-e TRACY_SHOWCASE_REQUEST= -e/, 'no request to hand the bootstrap')
      assert.match(out.log, /-e TRACY_SHOWCASE_RESUMED=0 web/)
      assert.equal(out.receipt, left)
      assert.equal(out.started, false, 'settled: the mark goes')
    }
  }
})

test('a re-run on an existing site (no receipt) passes no request and says the phase is not applied', () => {
  const out = shell(`joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`, {
    files: { 'tracy-agent.token': (p) => writeFileSync(p, `${TOKEN}\n`, { mode: 0o600 }) }
  })
  assert.match(out.stdout, /rc=0/, out.stderr)
  assert.match(
    out.log,
    /exec -T -e TRACY_SHOWCASE_REQUEST= -e TRACY_PAIR_OPTIONAL=0 -e TRACY_CONTRACT_VERIFY_ONLY=1/
  )
  assert.match(out.stdout, /showcase navigation: not applied — this provision did not lay this site down/)
})

// The phase is cosmetic: a receipt that holds no request id is said and kept for a person, and the
// pairing goes on without the phase.
test('a receipt that holds no request id is said and kept, and the pairing goes on without the phase', () => {
  const out = shell(`joomla_bind_contract ${KINETIC} contract 0; echo "rc=$?"`, {
    files: { 'showcase-nav.request': RECEIPT('not a request id!') }
  })
  assert.match(out.stdout, /rc=0/, out.stderr)
  assert.match(
    out.log,
    /-e TRACY_SHOWCASE_REQUEST= -e TRACY_PAIR_OPTIONAL=0/,
    'the bootstrap runs, with no phase'
  )
  assert.match(
    out.stderr,
    /!! showcase navigation: showcase-nav.request does not hold a request id — kept for a person/
  )
  assert.doesNotMatch(out.stdout, /showcase navigation: not applied/)
  assert.equal(out.receipt, 'not a request id!\n')
  assert.equal(out.started, false)
})

test('a profile-less card, a construction site and a site with no component say skipped and drop the receipt', () => {
  for (const [body, mode, said, handed] of [
    ['joomla_bind_contract "" template 1', 'ok', /skipped — this card carries no content contract/, ''],
    [`joomla_bind_contract ${KINETIC} template-build 0`, 'ok', /skipped — a site under construction/, ''],
    [
      `joomla_bind_contract ${KINETIC} contract 1`,
      'exit3',
      /skipped — no Cowork component on this site/,
      REQUEST
    ]
  ]) {
    const out = shell(`${body}; echo "rc=$?"`, { mode, files: { 'showcase-nav.request': RECEIPT(REQUEST) } })
    assert.match(out.stdout, said, out.stderr)
    assert.ok(
      out.log.includes(`TRACY_SHOWCASE_REQUEST=${handed} `),
      'only a binding workflow is handed the request'
    )
    assert.equal(out.receipt, null)
    assert.equal(out.started, false, 'a phase that never reached the site leaves no mark')
  }
})

test('the receipt is written once, when a quickstart is laid down, and never replaced', () => {
  const dir = mkdtempSync(path.join(SCRATCH, 'showcase-receipt-'))
  try {
    const lib = fileURLToPath(new URL('../scripts/lib/showcase-nav.sh', import.meta.url))
    const r = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail; . "$LIB"; tracy_showcase_begin; first="$(tracy_showcase_request)"; LABEL=other tracy_showcase_begin; [ "$(tracy_showcase_request)" = "$first" ]; echo "$first"; tracy_showcase_settle; tracy_showcase_request || echo "gone=$?"`
      ],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, LIB: lib, SITE_DIR: dir, LABEL: 'ja-kinetic site' }
      }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^provision-ja-kinetic-site-\d{14}\n/)
    assert.match(r.stdout, /gone=1/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── An /ops demo: the template road (`BUILD_WORKFLOW=template`), the same `platform_post_up` a card ──
// A demo is provisioned by tracy-host as a template card (`workflow: 'template'`, `demo: true`), and a
// redeploy is a teardown and then a fresh provision of the same label. The showcase phase therefore
// rides on the card's bind: a sealed card hands the receipt's request to the bootstrap, an unsealed
// one says skipped, a second pass on a site already handed over applies nothing, and a reinstall
// (the private folder gone with the teardown, a new receipt laid down) applies again.
const DEMO_CATALOGUE = JSON.stringify({
  'quickstart/ja-kinetic/j6': { platform: 'joomla', contract: KINETIC },
  'quickstart/ja-open/j6': { platform: 'joomla' }
})
const demoRoad = (quickstart, then) => `
  QUICKSTART='${quickstart}' BUILD_WORKFLOW=template COWORK_FLOOR=0.24.1 LABEL=demo
  . "$JOOMLA_SH"
  TRACY_SITES_ROOT="$FAKE_SCRATCH/sites"
  mkdir -p "$TRACY_SITES_ROOT/demo"
  : > "$TRACY_SITES_ROOT/demo/configuration.php"
  tracy_webroot_dir() { printf '%s/%s\\n' "$TRACY_SITES_ROOT" "$1"; }
  joomla_install_cowork_release() { return 0; }
  joomla_fetch_contract() { :; }
  joomla_enable_content_reader() { :; }
  ${then}
`

test('an /ops demo of a sealed card takes its showcase out of the menus on the bind, before it is handed over', () => {
  const out = shell(
    demoRoad(
      'quickstart/ja-kinetic/j6',
      `
      platform_post_up; echo "first=$?"
      platform_post_up; echo "again=$?"
      # A reinstall: teardown.sh removes the private folder, provision.sh lays the site down again.
      rm -f "$SITE_DIR"/tracy-agent.token "$SITE_DIR"/showcase-nav.*
      tracy_showcase_begin
      platform_post_up; echo "reinstall=$?"
    `
    ),
    { catalogue: DEMO_CATALOGUE, files: { 'showcase-nav.request': RECEIPT(REQUEST) } }
  )
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /first=0\n[\s\S]*again=0\n[\s\S]*reinstall=0\n/, out.stderr)
  const binds = out.log.split('\n').filter(Boolean)
  assert.equal(binds.length, 3, out.log)
  assert.match(
    binds[0],
    new RegExp(
      `-e TRACY_SHOWCASE_REQUEST=${REQUEST} -e TRACY_PAIR_OPTIONAL=0 -e TRACY_CONTRACT_ID=${KINETIC} -e TRACY_BUILD_WORKFLOW=contract -e TRACY_SHOWCASE_RESUMED=0 web`
    ),
    'the sealed card binds, and the bootstrap runs the phase with the receipt the provision wrote'
  )
  assert.match(
    binds[1],
    /-e TRACY_SHOWCASE_REQUEST= -e TRACY_PAIR_OPTIONAL=0 -e TRACY_CONTRACT_VERIFY_ONLY=1/,
    'a second pass on a site already handed over asks nothing of the phase'
  )
  assert.match(out.stdout, /showcase navigation: not applied — this provision did not lay this site down/)
  const fresh = /TRACY_SHOWCASE_REQUEST=(\S*) /.exec(binds[2])?.[1]
  assert.match(fresh ?? '', /^provision-demo-\d{14}$/, 'the reinstalled site is owed the phase again')
  assert.doesNotMatch(binds[2], /VERIFY_ONLY/, 'a fresh site is a first pairing')
  assert.equal(out.receipt, null, 'settled once the bootstrap confirmed it')
  assert.equal(out.started, false)
})

// The bootstrap exits 1 only for what stays fatal: its bind, the inspect of that bind, or a contract that
// no longer inspects as bound after a failed showcase phase and its revert (`tracy_showcase_phase`).
test('an /ops demo whose bootstrap fails is not handed over, and keeps its receipt for the retry', () => {
  const out = shell(demoRoad('quickstart/ja-kinetic/j6', 'platform_post_up || echo "rc=$?"'), {
    mode: 'exit1',
    catalogue: DEMO_CATALOGUE,
    files: { 'showcase-nav.request': RECEIPT(REQUEST) }
  })
  assert.match(out.stdout, /rc=1/, out.stderr)
  assert.match(out.log, new RegExp(`TRACY_SHOWCASE_REQUEST=${REQUEST} `))
  assert.equal(out.receipt, `${REQUEST}\n`, 'kept, so the next pass resumes the same job')
  assert.equal(out.started, true)
})

test('an /ops demo of an unsealed card has no showcase map: skipped, said, and handed over', () => {
  const out = shell(demoRoad('quickstart/ja-open/j6', 'platform_post_up; echo "rc=$?"'), {
    catalogue: DEMO_CATALOGUE,
    files: { 'showcase-nav.request': RECEIPT(REQUEST) }
  })
  assert.match(out.stdout, /rc=0/, out.stderr)
  assert.match(
    out.log,
    /-e TRACY_SHOWCASE_REQUEST= -e TRACY_PAIR_OPTIONAL=0 -e TRACY_CONTRACT_ID= -e TRACY_BUILD_WORKFLOW=template -e TRACY_SHOWCASE_RESUMED=0 web/
  )
  assert.match(out.stdout, /showcase navigation: skipped — this card carries no content contract/)
  assert.equal(out.receipt, null)
})

// ── The `installer` shape: a quickstart Joomla's CLI installer builds on this host ─────────────────
// It never reaches provision.sh's webroot extract (`PLATFORM_NEEDS_WEBROOT=0`), where every other
// quickstart writes its receipt, so `joomla_installer_install` writes it as the CLI is about to build
// the site. Measured on dev (JA Fresco j6 through the UI, before this): no receipt, "not applied — this
// provision did not lay this site down", and the template showcase left in the menus.
const INSTALLER_CATALOGUE = JSON.stringify({
  'quickstart/ja-fresco/j6': {
    platform: 'joomla',
    contract: KINETIC,
    installer: { file: 'ja-fresco-j6-quickstart-1.0.4.zip' }
  }
})
const installerRoad = (then) => `
  QUICKSTART=quickstart/ja-fresco/j6 BUILD_WORKFLOW=template COWORK_FLOOR=0.24.1 LABEL=demo
  DB_USER=u DB_PASSWORD=p DB_NAME=d FLEET_ZONE=tracy.test
  . "$JOOMLA_SH"
  [ -n "$QUICKSTART_INSTALLER" ] || { echo 'not on the installer shape' >&2; exit 7; }
  TRACY_SITES_ROOT="$FAKE_SCRATCH/sites"
  mkdir -p "$TRACY_SITES_ROOT/demo"
  tracy_webroot_dir() { printf '%s/%s\\n' "$TRACY_SITES_ROOT" "$1"; }
  tracy_ensure_webroot_htaccess() { :; }
  joomla_install_cowork_release() { return 0; }
  joomla_fetch_contract() { :; }
  joomla_enable_content_reader() { :; }
  # The CLI installer writes configuration.php; the chown after it has nothing to do here. Every
  # other call is the bootstrap, answered by the stand-in above.
  eval "bootstrap_$(declare -f docker)"
  docker() {
    case "$*" in
      *installation/joomla.php*) echo 'cli-install' >> "$FAKE_SCRATCH/installs.log"; : > "$TRACY_SITES_ROOT/demo/configuration.php" ;;
      *'chown -R'*) ;;
      *) bootstrap_docker "$@" ;;
    esac
  }
  unpacked() { mkdir -p "$TRACY_SITES_ROOT/demo/installation"; : > "$TRACY_SITES_ROOT/demo/installation/joomla.php"; }
  ${then}
`

test('an installer-shaped quickstart this run builds is owed its showcase phase, and the bind runs it', () => {
  const out = shell(installerRoad('unpacked; platform_post_up; echo "rc=$?"'), {
    catalogue: INSTALLER_CATALOGUE
  })
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /building the quickstart with Joomla's own CLI installer[\s\S]*rc=0\n/, out.stderr)
  const binds = out.log.split('\n').filter(Boolean)
  assert.equal(binds.length, 1, out.log)
  const request = /TRACY_SHOWCASE_REQUEST=(\S*) /.exec(binds[0])?.[1]
  assert.match(request ?? '', /^provision-demo-\d{14}$/, 'the receipt written as the site was built')
  assert.match(binds[0], new RegExp(`-e TRACY_CONTRACT_ID=${KINETIC} -e TRACY_BUILD_WORKFLOW=contract`))
  assert.doesNotMatch(out.stdout, /not applied/)
  assert.equal(out.receipt, null, 'settled once the bootstrap confirmed it')
})

test('an installer-shaped quickstart resumed before its build finished keeps the request id it was given', () => {
  const out = shell(installerRoad('unpacked; platform_post_up; echo "rc=$?"'), {
    catalogue: INSTALLER_CATALOGUE,
    files: { 'showcase-nav.request': RECEIPT(REQUEST) }
  })
  assert.match(out.stdout, /rc=0\n/, out.stderr)
  assert.match(out.log, new RegExp(`-e TRACY_SHOWCASE_REQUEST=${REQUEST} `))
})

test('a re-run on an installer-shaped site already built is not owed the phase, and says so', () => {
  const out = shell(
    installerRoad(': > "$TRACY_SITES_ROOT/demo/configuration.php"; platform_post_up; echo "rc=$?"'),
    { catalogue: INSTALLER_CATALOGUE }
  )
  assert.match(out.stdout, /the quickstart is already installed — leaving it alone[\s\S]*rc=0\n/, out.stderr)
  assert.doesNotMatch(out.stdout, /building the quickstart/)
  assert.match(out.log, /-e TRACY_SHOWCASE_REQUEST= /)
  assert.match(out.stdout, /showcase navigation: not applied — this provision did not lay this site down/)
  assert.equal(out.receipt, null)
})
