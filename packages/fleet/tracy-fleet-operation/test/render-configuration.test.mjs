/**
 * `provision/render_configuration.py` on the configuration.php files real Joomla sites carry: a
 * setting line with a comment after it, a quoted value holding a `;`, double quotes, `var`. Each
 * setting is replaced in place and declared once; PHP itself reads the result (#218: a line
 * `public $host = 'localhost'; // db host` was not matched, a second `$host` was appended, and the
 * copy answered 500 "Cannot redeclare JConfig::$host" while the wizard said ready).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/render-configuration.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const RENDER = fileURLToPath(new URL('../scripts/provision/render_configuration.py', import.meta.url))
const LOADS = fileURLToPath(new URL('../scripts/lib/joomla-config-loads.sh', import.meta.url))
const REAL_DOCKER = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim()
const DOCKER_UP = REAL_DOCKER !== '' && spawnSync(REAL_DOCKER, ['info'], { stdio: 'ignore' }).status === 0

const SOURCE = `<?php
class JConfig {
\tpublic $offline = '0';
\tpublic $host = 'localhost'; // db host
\tpublic $user = "joomla_user";   # the account
\tpublic $password = 'pa;ss\\'word'; /* do not share */
\tvar $db = 'joomla_live';
\tpublic $sitename = 'Shop; Co'; // shown in the title
\tpublic $force_ssl = 2; // always https
\tpublic $secret = 'source-secret';
}
`

function render(source) {
  const dir = mkdtempSync(join(tmpdir(), 'render-config-'))
  writeFileSync(join(dir, 'in.php'), source)
  const run = spawnSync(
    'python3',
    [
      RENDER,
      ...['--source', join(dir, 'in.php'), '--out', join(dir, 'configuration.php')],
      ...['--db-host', 'db', '--db-user', 'u', '--db-password', 'p', '--db-name', 'joomla'],
      ...['--live-site', 'https://copy.tracy.ai']
    ],
    { encoding: 'utf8' }
  )
  return { run, out: run.status === 0 ? readFileSync(join(dir, 'configuration.php'), 'utf8') : null }
}

const declared = (text, name) => text.match(new RegExp(`^\\s*(?:public|var)\\s+\\$${name}\\b`, 'gm'))?.length ?? 0

const support = phpSupport()
let php
before(() => {
  if (!support.skip) php = startPhp({ image: 'php:7.4-cli' })
})
after(() => php?.stop())

test('a setting line with a comment after it is replaced in place, declared once, and PHP reads the file (#218)', () => {
  const { run, out } = render(SOURCE)
  assert.equal(run.status, 0, run.stderr)
  for (const name of ['host', 'user', 'password', 'db', 'force_ssl', 'secret', 'live_site', 'behind_loadbalancer'])
    assert.equal(declared(out, name), 1, `${name} declared once:\n${out}`)
  assert.match(out, /^\tpublic \$host = 'db'; \/\/ db host$/m, 'the comment stays')
  assert.match(out, /^\tpublic \$user = 'u';   # the account$/m)
  assert.match(out, /^\tpublic \$password = 'p'; \/\* do not share \*\/$/m, 'a quoted ";" is part of the old value')
  assert.match(out, /^\tvar \$db = 'joomla';$/m)
  assert.match(out, /^\tpublic \$force_ssl = 2; \/\/ always https$/m)
  assert.match(out, /^\tpublic \$sitename = 'Shop; Co'; \/\/ shown in the title$/m, 'the customer’s own settings untouched')
  assert.doesNotMatch(out, /source-secret|joomla_live|\$host = 'localhost'/)
})

test('PHP loads the rendered file: no property declared twice', { skip: support.skip }, () => {
  const { out } = render(SOURCE)
  const [r] = php.run([
    {
      args: ['-r', '$f = tempnam(sys_get_temp_dir(), "c"); file_put_contents($f, stream_get_contents(STDIN)); require $f; $c = new JConfig; echo $c->host, "|", $c->password, "|", $c->sitename;'],
      input: out
    }
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.stdout, 'db|p|Shop; Co')
})

test('a setting declared in a shape the renderer cannot replace is refused, never declared a second time', () => {
  const { run } = render("<?php\nclass JConfig {\n\tpublic $host =\n\t\t'localhost';\n}\n")
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /could not set: .*host/)
})

/** `tracy_joomla_config_refusal` against a site whose web container is a php:7.4-cli run on `config`. */
function loads(config) {
  const site = mkdtempSync(join(tmpdir(), 'config-loads-'))
  const webroot = join(site, 'webroot')
  const shim = join(site, 'bin')
  mkdirSync(webroot)
  mkdirSync(shim)
  writeFileSync(join(webroot, 'configuration.php'), config)
  // `docker compose exec -T web php …` → the same php line in a container holding this webroot.
  writeFileSync(
    join(shim, 'docker'),
    `#!/usr/bin/env bash
[ "$1 $2 $3 $4" = "compose exec -T web" ] || exit 99
shift 4
exec "${REAL_DOCKER}" run --rm -i -v "${webroot}:/var/www/html:ro" php:7.4-cli "$@"
`
  )
  chmodSync(join(shim, 'docker'), 0o755)
  return spawnSync('bash', ['-c', `. "${LOADS}"; tracy_joomla_config_refusal "$1"`, 'x', site], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${shim}:${process.env.PATH}` }
  })
}

test('an import stops when the copy’s configuration.php does not load in its PHP, saying why (#218)', {
  skip: DOCKER_UP ? false : 'no docker daemon here: the check runs the site’s PHP'
}, () => {
  const twice = loads("<?php\nclass JConfig {\n\tpublic $host = 'db';\n\tpublic $host = 'db';\n}\n")
  assert.equal(twice.status, 1, twice.stderr)
  assert.match(twice.stdout, /configuration\.php does not load in its PHP: .*Cannot redeclare JConfig::\$host/)
  const good = loads(render(SOURCE).out)
  assert.equal(good.status, 0, good.stdout + good.stderr)
  assert.equal(good.stdout, '')
})
