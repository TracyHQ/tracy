/**
 * Putting a new Joomla site's contract profile into its Claude Cowork component at provision, as
 * root, between the install and the bind.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/joomla-contract-fetch.test.mjs
 *
 * ⚠ WHY THIS EXISTS. Claude Cowork for Joomla 0.24.55 stopped bundling profiles: the component
 * fetches the one a site is held to on first use into `lib/contracts/<id>`, inside its own code
 * folder. The provisioner installs the component as root, so the site (www-data, answering the bind
 * over HTTP) could not create that folder, and every new Joomla quickstart on dev died at the bind
 * with `contract_unavailable: cannot create …/lib/contracts/ja-fresco/j6`, half built. The
 * provisioner now runs the component's own `ContractFetch::ensure` as root before the bind
 * (`joomla_fetch_contract`, `joomla-contract-fetch.php`).
 *
 * The PHP half runs for real against a stand-in `ContractFetch` (the real one downloads from
 * GitHub); with no PHP at all the PHP cases fail on CI and skip on a laptop, like the bind tests.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const FETCH_PHP = `${PROVISION}joomla-contract-fetch.php`
const FETCH_SRC = readFileSync(FETCH_PHP, 'utf8')
const JOOMLA_SH = `${PROVISION}platform/joomla.sh`
const JOOMLA_SRC = readFileSync(JOOMLA_SH, 'utf8')
const SCRATCH = process.env.TRACY_TEST_ARTIFACTS_DIR || os.tmpdir()
const FRESCO = 'ja-fresco/j6/1.0.4'

// ── The shell road: `joomla_fetch_contract`, sourced from the real joomla.sh ───────────────────

/** Sources joomla.sh with a `docker` stand-in that records its argv and stdin, answering FAKE_MODE. */
const shell = (body, mode = 'ok') => {
  const dir = mkdtempSync(path.join(SCRATCH, 'joomla-fetch-'))
  try {
    const script = `
      set -euo pipefail
      tracy_web_image() { echo "$2"; }
      docker() {
        printf '%s\\n' "$*" >> "$FAKE_DIR/docker.log"
        cat > "$FAKE_DIR/stdin"
        [ "$FAKE_MODE" = ok ] || { echo '!! contract profile ja-fresco/j6/1.0.4 could not be put on disk: fetch failed: HTTP 404' >&2; return 1; }
      }
      . "$JOOMLA_SH"
      ${body}
    `
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        JOOMLA_SH,
        HERE: PROVISION.replace(/\/$/, ''),
        SITE_DIR: dir,
        FAKE_DIR: dir,
        FAKE_MODE: mode
      }
    })
    if (r.error) throw r.error
    const read = (name) =>
      existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8') : ''
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      log: read('docker.log'),
      stdin: read('stdin')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the fetch runs the component-side script as the provisioner, in the web container, with the profile id', () => {
  const out = shell(`joomla_fetch_contract ${FRESCO}; echo "rc=$?"`)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /rc=0/)
  assert.equal(out.log, `compose exec -T -e TRACY_CONTRACT_ID=${FRESCO} web php\n`)
  assert.equal(out.stdin, FETCH_SRC, 'stdin is the fetch script itself')
})

test('a fetch that fails stops with a line naming the profile, and no bind follows it', () => {
  const out = shell(`joomla_fetch_contract ${FRESCO} || { echo "stopped"; exit 7; }; echo bound`, 'fail')
  assert.equal(out.status, 7)
  assert.match(out.stdout, /stopped/)
  assert.doesNotMatch(out.stdout, /bound/)
  assert.match(out.stderr, new RegExp(`!! contract profile ${FRESCO}: not on disk`))
  assert.match(out.stderr, /fetch failed: HTTP 404/, 'the reason the container gave is kept')
})

test('no profile is no fetch; an id that is not a profile id never reaches the container', () => {
  const none = shell('joomla_fetch_contract ""; echo "rc=$?"')
  assert.equal(none.status, 0, none.stderr)
  assert.match(none.stdout, /rc=0/)
  assert.equal(none.log, '')
  const bad = shell(`joomla_fetch_contract 'ja-fresco/j6"; rm -rf /'`)
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /not a profile id/)
  assert.equal(bad.log, '')
})

test('both quickstart roads fetch after the component install and before the bind, and stop on failure', () => {
  const card = JOOMLA_SRC.indexOf('card_contract="$(joomla_card_contract)" || return 1')
  const cardInstall = JOOMLA_SRC.indexOf('elif joomla_install_cowork_release; then', card)
  const cardFetch = JOOMLA_SRC.indexOf('joomla_fetch_contract "$card_contract" || return 1', card)
  const cardBind = JOOMLA_SRC.indexOf(
    'joomla_bind_contract "$card_contract" "$pair_workflow" "$pair_optional"'
  )
  assert.ok(
    card > 0 && cardInstall > card && cardFetch > cardInstall && cardBind > cardFetch,
    'card road: install → fetch → bind'
  )
  // Only when a component was installed: a site left with none has nothing to fetch into.
  assert.match(JOOMLA_SRC.slice(cardInstall, cardFetch), /if \[ "\$cowork_installed" = 1 \]; then\s*$/)

  const road = JOOMLA_SRC.indexOf('provision resolved no content contract')
  const install = JOOMLA_SRC.indexOf('joomla_install_cowork_package "$package"', road)
  const fetch = JOOMLA_SRC.indexOf('joomla_fetch_contract "$CONTRACT_ID" || return 1', road)
  const bind = JOOMLA_SRC.indexOf('joomla_bind_contract "$CONTRACT_ID"', road)
  assert.ok(
    road > 0 && install > road && fetch > install && bind > fetch,
    'contract road: install → fetch → bind'
  )

  const calls = JOOMLA_SRC.split('\n').filter((l) => /^\s*joomla_fetch_contract /.test(l))
  assert.equal(calls.length, 2, 'two callers, both stopping the provision on failure')
  for (const line of calls) assert.match(line, /\|\| return 1$/)
})

// ── The PHP half: `tracy_contract_fetch`, against a stand-in component lib/ ─────────────────

const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ image: 'php:8.3-cli-alpine' })
})
after(() => php?.stop())

// A stand-in for the component's `lib/ContractFetch.php`, holding only what the script calls. Its
// ensure() answers as FAKE_ENSURE says and records the release folder it was handed.
const FAKE_FETCHER = String.raw`<?php
final class ContractFetch {
  public const UNKNOWN = '';
  private string $lib;
  public function __construct(string $lib, ?string $release) { $this->lib = $lib; file_put_contents($lib . '/release.seen', var_export($release, true)); }
  public static function releaseOf(?string $version): ?string { return $version === null ? null : 'R/joomla-v' . $version . '/'; }
  public function directory(string $id): string { return $this->lib . '/contracts/' . $id; }
  public function ensure(string $id): ?string {
    $mode = getenv('FAKE_ENSURE');
    if ($mode === 'unknown') return self::UNKNOWN;
    if ($mode === 'empty') return null;
    if ($mode !== 'ok') return $mode;
    if (is_file($this->directory($id) . '/manifest.json')) return null;
    @mkdir($this->directory($id), 0755, true);
    file_put_contents($this->directory($id) . '/manifest.json', '{}');
    return null;
  }
}
`

/**
 * Builds a component folder in PHP's own temp dir (with or without a fetcher, a manifest version,
 * a profile already on disk, a stale failure marker), runs `tracy_contract_fetch`, and answers what
 * it returned plus what is on disk afterwards.
 */
const fetchCase = ({
  id = FRESCO,
  fetcher = true,
  version = '0.24.55',
  present = false,
  marker = false,
  ensure = 'ok'
} = {}) => {
  const code = `
    putenv('TRACY_CONTRACT_FETCH_LIB_ONLY=1');
    eval('?>' . getenv('SRC'));
    $root = sys_get_temp_dir() . '/cc-' . bin2hex(random_bytes(6));
    $lib = $root . '/lib';
    mkdir($lib . '/contracts/ja-fresco/j6', 0755, true);
    if (getenv('FETCHER') === '1') file_put_contents($lib . '/ContractFetch.php', getenv('FAKE'));
    if (getenv('VERSION') !== '') file_put_contents($root . '/claudecowork.xml', '<?xml version="1.0"?><extension><version>' . getenv('VERSION') . '</version></extension>');
    if (getenv('PRESENT') === '1') { mkdir($lib . '/contracts/' . getenv('ID'), 0755, true); file_put_contents($lib . '/contracts/' . getenv('ID') . '/manifest.json', '{}'); }
    if (getenv('MARKER') === '1') file_put_contents($lib . '/contracts/ja-fresco/j6/1.0.4.fetch-failed', '{"at":1,"reason":"x"}');
    umask(077);
    $answer = tracy_contract_fetch($lib, getenv('ID'));
    $manifest = $lib . '/contracts/' . getenv('ID') . '/manifest.json';
    $out = [
      'answer' => $answer,
      'manifest' => is_file($manifest),
      'mode' => is_file($manifest) ? sprintf('%o', fileperms($manifest) & 0777) : null,
      'dirMode' => is_file($manifest) ? sprintf('%o', fileperms(dirname($manifest)) & 0777) : null,
      'marker' => is_file($lib . '/contracts/ja-fresco/j6/1.0.4.fetch-failed'),
      'release' => is_file($lib . '/release.seen') ? file_get_contents($lib . '/release.seen') : null,
    ];
    exec('rm -rf ' . escapeshellarg($root));
    echo json_encode($out);
  `
  const [r] = php.run([
    {
      args: ['-r', code],
      env: {
        SRC: FETCH_SRC,
        FAKE: FAKE_FETCHER,
        ID: id,
        FETCHER: fetcher ? '1' : '0',
        VERSION: version,
        PRESENT: present ? '1' : '0',
        MARKER: marker ? '1' : '0',
        FAKE_ENSURE: ensure
      }
    }
  ])
  assert.equal(r.status, 0, `php failed: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

test('a component that predates fetching bundles its profiles: nothing is done, nothing fails', {
  skip: PHP_SKIP
}, () => {
  const out = fetchCase({ fetcher: false })
  assert.deepEqual(out.answer, ['bundled', ''])
  assert.equal(out.release, null, 'no fetcher was built')
})

test('a fetching component gets the profile from its own release, readable by the web user', {
  skip: PHP_SKIP
}, () => {
  const out = fetchCase()
  assert.deepEqual(out.answer, ['fetched', '0.24.55'])
  assert.equal(out.manifest, true)
  assert.equal(
    out.release,
    "'R/joomla-v0.24.55/'",
    'the release folder comes from the installed manifest version'
  )
  assert.equal(out.mode, '644', 'root writes it, www-data reads it, whatever umask the container had')
  assert.equal(out.dirMode, '755')
})

test('a profile already on disk is left alone', { skip: PHP_SKIP }, () => {
  assert.deepEqual(fetchCase({ present: true }).answer, ['present', '0.24.55'])
})

test('a failure names its reason; a profile the index does not list is a failure too', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(fetchCase({ ensure: 'fetch failed: sha256 is not the listed one' }).answer, [
    'failed',
    'fetch failed: sha256 is not the listed one'
  ])
  const unknown = fetchCase({ ensure: 'unknown' })
  assert.equal(unknown.answer[0], 'failed')
  assert.match(unknown.answer[1], /0\.24\.55 does not list it in contracts\.json/)
  const lied = fetchCase({ ensure: 'empty' })
  assert.deepEqual(lied.answer, ['failed', 'no manifest.json on disk after the fetch'])
})

test('a failure marker from an earlier pass does not stop this one from trying', { skip: PHP_SKIP }, () => {
  const out = fetchCase({ marker: true })
  assert.equal(out.marker, false)
  assert.deepEqual(out.answer, ['fetched', '0.24.55'])
})

test('an id that is not a profile id is refused before any fetcher is built', { skip: PHP_SKIP }, () => {
  const out = fetchCase({ id: '../../etc' })
  assert.deepEqual(out.answer, ['failed', 'not a profile id'])
  assert.equal(out.release, null)
})

test('read from stdin the way provision runs it, a refusal is one `!!` line and exit 1', {
  skip: PHP_SKIP
}, () => {
  // `php < file` defines no STDERR constant: a refusal written through it died as a fatal error
  // (exit 255, no reason) the first time this ran against the real component.
  const [r] = php.run([{ args: [], input: FETCH_SRC, env: { TRACY_CONTRACT_ID: 'ja-fresco/j6' } }])
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.stderr, '!! contract profile ja-fresco/j6 could not be put on disk: not a profile id\n')
})
