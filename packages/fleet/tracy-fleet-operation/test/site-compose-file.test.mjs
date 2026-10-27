/**
 * The Settings tab's two host scripts find the site's compose file under either name.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/site-compose-file.test.mjs
 *
 * provision (render-compose.sh) writes `docker-compose.yml`; site-settings.sh and site-address.py
 * once read only `compose.yml`, so every fleet-made site answered "Could not read the running CMS"
 * (dev acceptance 28/09). Both scripts now ask lib/roots.sh (`tracy_compose_file`,
 * `TRACY_COMPOSE_NAMES`). Each case runs the real script against a throwaway private root with a
 * `docker` stand-in on PATH that logs its argv, so what is asserted is the `-f` path docker got.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEBROOT = fileURLToPath(new URL('../scripts/webroot/', import.meta.url))
const ROOTS = fileURLToPath(new URL('../scripts/lib/roots.sh', import.meta.url))
const LABEL = 'acbw2709'

// A docker stand-in: `compose -f F ps` names one container; `compose -f F config` answers the
// EMDASH_SITE_URL literal currently in F; `exec … test -f wp-load.php` is true only when
// FAKE_PLATFORM=wordpress; `exec … php` answers one JSON line.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
if [ "$1" = compose ]; then
  file="$3"
  case "$4" in
    ps) echo cid-web ;;
    config) url="$(sed -n 's/^ *EMDASH_SITE_URL: *//p' "$file" | tr -d '"')"
            printf '{"services":{"web":{"environment":{"EMDASH_SITE_URL":"%s"}}}}\\n' "$url" ;;
    up) : ;;
  esac
  exit 0
fi
if [ "$1" = exec ]; then
  case "$*" in
    *"test -f /var/www/html/wp-load.php"*) [ "$FAKE_PLATFORM" = wordpress ]; exit ;;
    *"test -f"*) exit 1 ;;
    *php*) cat > /dev/null; echo '{"ok":true,"platform":"wordpress"}'; exit 0 ;;
  esac
fi
exit 0
`

function stand(composeName, composeText = 'services:\n  web:\n    image: wordpress\n') {
  const root = mkdtempSync(join(tmpdir(), 'tracy-compose-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), FAKE_DOCKER)
  chmodSync(join(bin, 'docker'), 0o755)
  const priv = join(root, 'private')
  mkdirSync(join(priv, LABEL), { recursive: true })
  if (composeName) writeFileSync(join(priv, LABEL, composeName), composeText)
  const log = join(root, 'docker.log')
  writeFileSync(log, '')
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRACY_PRIVATE_ROOT: priv, FAKE_LOG: log }
  delete env.TRACY_SRV
  return { root, priv, log, env, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

for (const name of ['docker-compose.yml', 'compose.yml']) {
  test(`site-settings.sh reads a site whose compose file is ${name}`, () => {
    const s = stand(name)
    try {
      const out = execFileSync(
        'bash',
        [join(WEBROOT, 'site-settings.sh'), '--label', LABEL, '--op', 'read'],
        {
          env: { ...s.env, FAKE_PLATFORM: 'wordpress' },
          encoding: 'utf8'
        }
      )
      assert.equal(out.trim(), '{"ok":true,"platform":"wordpress"}')
      const first = readFileSync(s.log, 'utf8').split('\n')[0]
      assert.equal(first, `compose -f ${join(s.priv, LABEL, name)} ps -q web`)
    } finally {
      s.dispose()
    }
  })

  test(`site-address.sh changes an EmDash address kept in ${name}`, () => {
    const compose = 'services:\n  web:\n    environment:\n      EMDASH_SITE_URL: "https://old.example"\n'
    const s = stand(name, compose)
    try {
      writeFileSync(join(s.priv, LABEL, '.env'), 'PLATFORM=emdash\n')
      const args = [
        '--label',
        LABEL,
        '--op',
        'change',
        '--operation',
        'apply',
        '--change-id',
        'a'.repeat(32),
        '--old-url',
        'https://old.example',
        '--new-url',
        'https://new.example'
      ]
      const run = spawnSync('bash', [join(WEBROOT, 'site-address.sh'), ...args], {
        env: s.env,
        encoding: 'utf8'
      })
      assert.equal(run.status, 0, run.stdout + run.stderr)
      assert.equal(JSON.parse(run.stdout.trim()).siteUrl, 'https://new.example')
      assert.match(
        readFileSync(join(s.priv, LABEL, name), 'utf8'),
        /EMDASH_SITE_URL: "https:\/\/new\.example"/
      )
      for (const line of readFileSync(s.log, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('compose'))) {
        assert.ok(line.startsWith(`compose -f ${join(s.priv, LABEL, name)} `), line)
      }
    } finally {
      s.dispose()
    }
  })
}

test('tracy_compose_file prefers what provision writes, and names it when no file exists', () => {
  const s = stand(null)
  const ask = () =>
    execFileSync('bash', ['-c', `. "${ROOTS}"; tracy_compose_file ${LABEL}`], {
      env: s.env,
      encoding: 'utf8'
    })
  try {
    assert.equal(ask(), join(s.priv, LABEL, 'docker-compose.yml'))
    writeFileSync(join(s.priv, LABEL, 'compose.yml'), '')
    assert.equal(ask(), join(s.priv, LABEL, 'compose.yml'))
    writeFileSync(join(s.priv, LABEL, 'docker-compose.yml'), '')
    assert.equal(ask(), join(s.priv, LABEL, 'docker-compose.yml'))
  } finally {
    s.dispose()
  }
})
