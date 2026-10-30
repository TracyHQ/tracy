/**
 * A brief build's site is restored already on its rebuilding page (spec TracyHQ/tracy#189, criterion 12.1): the lock is
 * written into the restored configuration.php by the restore step itself (`platform/joomla.sh` `platform_configure`,
 * `render_configuration.py --offline-lock`), before stage 6 starts the web server, so no visitor is ever served the raw
 * demo between Joomla's first answer and the pairing of its door. A normal create is restored online.
 *
 * The real restore writer runs on a fictional site's configuration.php (a bakery and a tailor); docker and the database
 * are stubbed out, since this step writes only the file.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/brief-site-lock-at-source.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const FRONT_PAGE = fileURLToPath(new URL('../scripts/lib/front-page.sh', import.meta.url))
const KEY = 'k'.repeat(20) + '_FictionalPreviewKey-0123456789'
const MESSAGE = 'This website is being updated. Please visit again shortly.'
const temps = []
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/** A restored quickstart's own configuration.php, as a release carries it (online, the demo's name). */
const SOURCE = (site) => `<?php
class JConfig {
\tpublic $offline = false;
\tpublic $offline_message = 'This site is down for maintenance.<br>Please check back again soon.';
\tpublic $display_offline_message = 1;
\tpublic $sitename = '${site}';
\tpublic $dbprefix = 'qs_';
\tpublic $secret = 'released';
\tpublic $live_site = '';
}
`

/**
 * Run the real `platform_configure` of `platform/joomla.sh` on a fictional webroot, as provision.sh does.
 * @param {{site: string, env?: Record<string, string>, origin?: string, settle?: (webroot: string) => void}} input
 */
function restore({ site, env = {}, origin = '', settle }) {
  const dir = mkdtempSync(join(tmpdir(), 'source-lock-'))
  temps.push(dir)
  const webroot = join(dir, 'webroot')
  mkdirSync(join(dir, 'site', 'work'), { recursive: true })
  mkdirSync(webroot)
  writeFileSync(join(webroot, 'configuration.php'), SOURCE(site))
  settle?.(webroot)
  const script = `
set -euo pipefail
tracy_web_image() { printf '%s\\n' "$2"; }
tracy_webroot_dir() { printf '%s\\n' "$WEBROOT"; }
. "$HERE/platform/joomla.sh"
platform_neutralize_live_domain() { :; }
platform_check_in_all() { :; }
platform_configure
${settle ? 'platform_site_lock_settle' : ''}
`
  const run = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HERE: PROVISION,
      WEBROOT: webroot,
      LABEL: 'fictional',
      SITE_DIR: join(dir, 'site'),
      SITE_URL: 'https://fictional.tracy.test',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
      ALLOW_MAIL: '',
      QUICKSTART: 'quickstart/fictional/j6',
      TRACY_QUICKSTARTS_JSON: join(dir, 'none.json'),
      SITE_ORIGIN: origin,
      ...env
    }
  })
  assert.equal(run.status, 0, run.stderr)
  return { config: readFileSync(join(webroot, 'configuration.php'), 'utf8'), out: run.stdout }
}

const setting = (config, name) => config.match(new RegExp(`public \\$${name} = (.*);`))?.[1] ?? null
const locked = { TRACY_SITE_LOCK_PREVIEW_KEY: KEY, TRACY_SITE_LOCK_MESSAGE: MESSAGE }

test('a brief build’s site is restored offline, on the approved message, readable with the lock’s preview key', () => {
  const before = Math.floor(Date.now() / 1000)
  const { config } = restore({ site: 'Crumb and Crust Bakery', env: locked })
  assert.equal(setting(config, 'offline'), '1')
  assert.equal(setting(config, 'offline_message'), `'${MESSAGE}'`)
  assert.equal(setting(config, 'display_offline_message'), '1')
  // As the plugin stores a key (SiteIdentity::PREVIEW_HASH): its SHA-256, then when it was set.
  const [hash, at] = setting(config, 'tracy_offline_preview_key').slice(1, -1).split(':')
  assert.equal(hash, createHash('sha256').update(KEY).digest('hex'))
  assert.ok(Number(at) >= before && Number(at) <= before + 60)
  // The key itself is never written down, and the rest of the site's own settings are kept.
  assert.doesNotMatch(config, new RegExp(KEY))
  assert.equal(setting(config, 'sitename'), "'Crumb and Crust Bakery'")
})

test('a normal create (no brief build) is restored online, whatever the release was packed with', () => {
  const { config } = restore({ site: 'Needle Point Tailors' })
  assert.equal(setting(config, 'offline'), '0')
  assert.equal(setting(config, 'tracy_offline_preview_key'), null)
})

test('an imported copy is never locked by a key, and stays online', () => {
  const { config } = restore({ site: 'Needle Point Tailors', env: locked, origin: 'imported' })
  assert.equal(setting(config, 'offline'), '0')
  assert.equal(setting(config, 'tracy_offline_preview_key'), null)
})

test('a lock with a malformed key fails the restore instead of locking a site nobody can read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'source-lock-bad-'))
  temps.push(dir)
  writeFileSync(join(dir, 'c.php'), SOURCE('Crumb and Crust Bakery'))
  const run = spawnSync(
    'python3',
    [join(PROVISION, 'offline_lock.py'), '--config', join(dir, 'c.php'), 'lock'],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, TRACY_SITE_LOCK_PREVIEW_KEY: 'short', TRACY_SITE_LOCK_MESSAGE: MESSAGE }
    }
  )
  assert.equal(run.status, 1)
  assert.match(run.stderr, /preview key/)
  assert.equal(setting(readFileSync(join(dir, 'c.php'), 'utf8'), 'offline'), 'false')
})

/** The installed Cowork plugin, as far as the settle step reads it. */
const plugin =
  ({ previewKey, major = 5 }) =>
  (webroot) => {
    mkdirSync(join(webroot, 'libraries/src'), { recursive: true })
    writeFileSync(
      join(webroot, 'libraries/src/Version.php'),
      `<?php\nfinal class Version {\n    public const MAJOR_VERSION = ${major};\n}\n`
    )
    const lib = join(webroot, 'administrator/components/com_claudecowork/lib')
    const ext = join(webroot, 'plugins/system/claudecoworkapi/src/Extension')
    mkdirSync(lib, { recursive: true })
    mkdirSync(ext, { recursive: true })
    writeFileSync(
      join(lib, 'SiteOffline.php'),
      `<?php // BYPASS_ALSO = [${previewKey ? "'preview-key'" : ''}]\n`
    )
    writeFileSync(join(ext, 'ClaudeCoworkApi.php'), `<?php // ${previewKey ? 'decideOfflineBypass' : ''}\n`)
  }

test('the lock stays on where the installed plugin serves Tracy through it', () => {
  const { config, out } = restore({
    site: 'Crumb and Crust Bakery',
    env: locked,
    settle: plugin({ previewKey: true })
  })
  assert.equal(setting(config, 'offline'), '1')
  assert.match(out, /rebuilding page stays on/)
})

test('the lock is lifted before hand-over where the plugin cannot serve through it (old plugin, or Joomla 3)', () => {
  for (const settle of [plugin({ previewKey: false }), plugin({ previewKey: true, major: 3 })]) {
    const { config, out } = restore({ site: 'Needle Point Tailors', env: locked, settle })
    assert.equal(setting(config, 'offline'), '0')
    assert.equal(setting(config, 'tracy_offline_preview_key'), "''")
    assert.match(out, /rebuilding page is lifted/)
  }
})

test('provision.sh settles the lock right after the plugin is installed, before the front-page check', () => {
  const script = readFileSync(join(PROVISION, 'provision.sh'), 'utf8')
  const postUp = script.indexOf('  platform_post_up\nfi')
  const settle = script.indexOf('platform_site_lock_settle || exit 1')
  assert.ok(postUp > 0 && settle > postUp, 'settle after platform_post_up')
  assert.ok(
    settle < script.indexOf('tracy_front_page_refusal "$LABEL"'),
    'settle before the front-page check'
  )
})

test('the front-page check of a locked site asks with the preview key, never in argv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'source-lock-curl-'))
  temps.push(dir)
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const seen = join(dir, 'seen')
  writeFileSync(
    join(bin, 'curl'),
    `#!/bin/sh
for a in "$@"; do
  case "$a" in @*) cat "\${a#@}" >> "${seen}" ;; *) printf 'arg %s\\n' "$a" >> "${seen}" ;; esac
done
printf 200
`,
    { mode: 0o755 }
  )
  const run = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', '. "$1"; tracy_front_page_refusal demo 52110', '_', FRONT_PAGE],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRACY_SITE_LOCK_PREVIEW_KEY: KEY }
    }
  )
  assert.equal(run.status, 0, run.stderr)
  const lines = readFileSync(seen, 'utf8')
  assert.match(lines, new RegExp(`^X-Tracy-Preview-Key: ${KEY}$`, 'm'))
  assert.doesNotMatch(lines, new RegExp(`^arg .*${KEY}`, 'm'))
})
