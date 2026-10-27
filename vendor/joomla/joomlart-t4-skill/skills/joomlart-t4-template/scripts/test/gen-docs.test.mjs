// gen-docs.php runs inside a Joomla runtime, which a unit test does not have; what CAN be pinned
// here is everything that decides before Joomla boots — argument validation, the refusal to run
// without a template or against a directory that is not a Joomla root — plus PHP syntax, and the
// shell wrapper's own argument contract. A syntax error or a broken flag would otherwise surface
// only at Phase 10, inside a customer's container, after the last content edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const php = new URL('../quickstart/gen-docs.php', import.meta.url).pathname;
const sh = new URL('../quickstart/gen-docs.sh', import.meta.url).pathname;
const hasPhp = spawnSync('php', ['-v']).status === 0;
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

test('gen-docs.php: syntax is valid PHP', { skip: hasPhp ? false : 'php not on PATH' }, () => {
  const r = run('php', ['-l', php]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('gen-docs.php: --help exits 0 before touching Joomla', { skip: hasPhp ? false : 'php not on PATH' }, () => {
  const r = run('php', [php, '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--template=<tpl>/);
});

test('gen-docs.php: refuses to run without --template, and rejects an unsafe name', { skip: hasPhp ? false : 'php not on PATH' }, () => {
  let r = run('php', [php]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--template=<folder name> is required/);
  r = run('php', [php, '--template=../etc']);
  assert.equal(r.status, 2);
});

test('gen-docs.php: refuses a root that is not a Joomla site', { skip: hasPhp ? false : 'php not on PATH' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-docs-'));
  try {
    const r = run('php', [php, '--template=tb', `--root=${dir}`]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no Joomla at/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gen-docs.php: an unknown flag is an error, not silently ignored', { skip: hasPhp ? false : 'php not on PATH' }, () => {
  const r = run('php', [php, '--template=tb', '--blocks-prefix=tb-']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown argument --blocks-prefix/);
});

test('gen-docs.sh: --help exits 0; missing --template, missing runtime, and both runtimes are refused', () => {
  let r = run('bash', [sh, '--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--container <name>/);
  r = run('bash', [sh, '--container', 'x']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--template <tpl> is required/);
  r = run('bash', [sh, '--template', 'tb']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /need --container <name> or --ddev/);
  r = run('bash', [sh, '--template', 'tb', '--container', 'x', '--ddev']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not both/);
  r = run('bash', [sh, '--template', 'tb', '--container', 'x', '--bogus']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown argument --bogus/);
});
