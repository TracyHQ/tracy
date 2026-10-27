/**
 * REG-PR-1068: the design-system slot on WordPress and Joomla, judged on running sites. Builds both sites itself in Docker — WordPress 7.1 (the fleet's
 * `tracy/web-wordpress` image) with this tree's `tracy-base` theme, and Joomla from the released
 * `tracy-base/j6` quickstart — then:
 *   S1 the library's tests (WordPress variation, Joomla module sheet, profile rules);
 *   S2 the library audit — every invariant, both CMS outputs, over all Refero + OpenDesign systems;
 *   S3 WordPress: default → four systems (one refused by the gate) → clear, measured by role;
 *   S4 Joomla: the same flow through the slot module.
 * No model reads anything. Needs Docker, the two fleet images and read access to the quickstart.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const THEMES = join(ROOT, 'packages/cms/tracy-wordpress-theme/src')
const WP_IMAGE = 'tracy/web-wordpress:php8.3-apache-20260923-r1'
const JO_IMAGE = 'tracy/web-joomla:6-apache-20260923-r1'
const NET = 'reg-dsslot'
const WP_PORT = 52191
const JO_PORT = 52192
const IDS = [
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', // Moxie — dark, serif display at 300
  'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567', // MotherDuck — a mono brand face, light accent
  'refero:2f94c1f0-cd23-4bf1-95f3-0e531174c4f4', // arte* — refused by the gate
  'od:elevenlabs'
]

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('version', '--format', '{{.Server.Version}}')
} catch {
  cannotRun('Docker is not running')
}
for (const image of [WP_IMAGE, JO_IMAGE, 'mariadb:11'])
  try {
    docker('image', 'inspect', image)
  } catch {
    cannotRun(`image ${image} is not on this machine`)
  }
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)

const work = mkdtempSync(join(tmpdir(), 'reg-dsslot-'))
const containers = ['reg-dsslot-wp', 'reg-dsslot-wdb', 'reg-dsslot-jo', 'reg-dsslot-jdb']
const cleanup = () => {
  for (const c of containers)
    try {
      docker('rm', '-f', c)
    } catch {}
  try {
    docker('network', 'rm', NET)
  } catch {}
  rmSync(work, { recursive: true, force: true })
}
process.on('exit', cleanup)
cleanup()
docker('network', 'create', NET)
const wait = (fn, tries = 90) => {
  for (let i = 0; i < tries; i++) {
    try {
      if (fn()) return true
    } catch {}
    execFileSync('sleep', ['2'])
  }
  return false
}

const c = checks()

// S1 + S2 — the rules, then the whole library
c.tapClean(
  'S1 @tracy/ds-slot tests',
  nodeTest(['test/slot.test.mjs', 'test/cms.test.mjs'], { cwd: 'packages/design/tracy-ds-slot' })
)
const audit = run(process.execPath, [join(LIB, 'scripts/audit.mjs')])
c.check(
  'S2 audit: every invariant holds over all systems, WordPress and Joomla outputs included',
  audit.status === 0 && /invariants: all hold/.test(audit.stdout),
  audit.stdout.trim().split('\n').slice(-3).join(' | ')
)

const judge = (label, out) => {
  const f = existsSync(join(out, 'flow.json'))
    ? JSON.parse(readFileSync(join(out, 'flow.json'), 'utf8'))
    : { verdicts: [], refused: [] }
  const sys = f.verdicts.filter((v) => v.kind === 'system')
  const ctl = f.verdicts.filter((v) => v.kind === 'control')
  c.eq(`${label} systems worn and judged (3 × desktop + phone)`, sys.length, 6)
  c.check(
    `${label} each worn system matches its profile on every measurement`,
    sys.every((v) => v.match === 1),
    sys.filter((v) => v.match !== 1).map((v) => `${v.label}/${v.vw} ${v.misses.join('; ')}`)
  )
  c.check(
    `${label} each worn page matches its own system ≥ 0.25 better than any other`,
    sys.every((v) => v.margin >= 0.25),
    sys.map((v) => v.margin)
  )
  c.check(
    `${label} every measured text kind reads at 4.5:1 or better`,
    sys.every((v) => v.contrast.length > 0 && v.contrast.every((x) => x.ratio >= 4.5)),
    sys.flatMap((v) => v.contrast.filter((x) => x.ratio < 4.5))
  )
  c.check(
    `${label} the first page requested after the call already wears it`,
    f.verdicts.every((v) => v.requests === 1),
    f.verdicts.map((v) => v.requests)
  )
  c.check(
    `${label} with no system, before and after clearing, the page computes exactly the same values`,
    ctl.length === 4 && ctl.every((v) => v.differences === 0),
    ctl.map((v) => `${v.vw} ${v.differences} ${v.sample.join('; ')}`)
  )
  c.check(
    `${label} arte* is refused by the gate, never applied`,
    f.refused.length === 1 && /contrast-fg-bg/.test(f.refused[0].reasons.join()),
    f.refused
  )
}
const flow = (...a) => run(process.execPath, [join(LIB, 'scripts/flow.mjs'), ...a], { timeoutS: 1800 })

// S3 — WordPress 7.1 + this tree's tracy-base theme, a landing front page from the theme's own pattern
docker(
  'run',
  '-d',
  '--name',
  'reg-dsslot-wdb',
  '--network',
  NET,
  '-e',
  'MARIADB_ROOT_PASSWORD=r',
  '-e',
  'MARIADB_DATABASE=wp',
  '-e',
  'MARIADB_USER=wp',
  '-e',
  'MARIADB_PASSWORD=wp',
  'mariadb:11'
)
docker(
  'run',
  '-d',
  '--name',
  'reg-dsslot-wp',
  '--network',
  NET,
  '-p',
  `127.0.0.1:${WP_PORT}:80`,
  '-e',
  'WORDPRESS_DB_HOST=reg-dsslot-wdb',
  '-e',
  'WORDPRESS_DB_USER=wp',
  '-e',
  'WORDPRESS_DB_PASSWORD=wp',
  '-e',
  'WORDPRESS_DB_NAME=wp',
  '-v',
  `${THEMES}/tracy-base:/var/www/html/wp-content/themes/tracy-base:ro`,
  WP_IMAGE
)
const wp = (...a) => docker('exec', '-u', 'www-data', 'reg-dsslot-wp', 'wp', ...a)
// (`wp db check` needs mysqlcheck, which the image does not carry: ask MariaDB, then wait for wp-config.php)
if (!wait(() => (docker('exec', 'reg-dsslot-wdb', 'mariadb', '-uwp', '-pwp', '-e', 'select 1', 'wp'), true)))
  cannotRun('WordPress database did not come up')
if (!wait(() => (docker('exec', 'reg-dsslot-wp', 'test', '-f', '/var/www/html/wp-config.php'), true)))
  cannotRun('WordPress did not write wp-config.php')
wp(
  'core',
  'install',
  `--url=http://127.0.0.1:${WP_PORT}`,
  '--title=DS Slot',
  '--admin_user=a',
  '--admin_password=a',
  '--admin_email=a@example.test',
  '--skip-email'
)
wp('theme', 'activate', 'tracy-base')
const home = wp(
  'post',
  'create',
  '--post_type=page',
  '--post_status=publish',
  '--post_title=Home',
  '--post_content=<!-- wp:pattern {"slug":"tracy/landing"} /-->',
  '--porcelain'
).trim()
wp('option', 'update', 'show_on_front', 'page')
wp('option', 'update', 'page_on_front', home)
const wpOut = join(work, 'wp')
flow('--cms', 'wordpress', '--site', `http://127.0.0.1:${WP_PORT}`, '--out', join(wpOut, 'base'), '--snap')
const wpRun = flow(
  '--cms',
  'wordpress',
  '--wp-container',
  'reg-dsslot-wp',
  '--site',
  `http://127.0.0.1:${WP_PORT}`,
  '--out',
  wpOut,
  '--baseline',
  join(wpOut, 'base/default.json'),
  ...IDS
)
c.eq('S3 WordPress flow exits 0', wpRun.status, 0)
judge('S3 WordPress', wpOut)

// S4 — Joomla 6 from the released tracy-base/j6 quickstart, the slot as one module
const dl = join(work, 'jq')
const got = run(
  'gh',
  [
    'release',
    'download',
    'tracy-base/j6',
    '-R',
    'JoomlArt-Products/ja-products',
    '-D',
    dl,
    '-p',
    'tracy-base-j6-webroot-1.0.2.tar.gz',
    '-p',
    'tracy-base-j6-database-1.0.2.sql.gz',
    '-p',
    'SHA256SUMS'
  ],
  { timeoutS: 900 }
)
if (got.status !== 0)
  cannotRun(`cannot download the tracy-base/j6 quickstart: ${(got.stderr || got.stdout).slice(-200)}`)
const sums = readFileSync(join(dl, 'SHA256SUMS'), 'utf8')
for (const f of ['tracy-base-j6-webroot-1.0.2.tar.gz', 'tracy-base-j6-database-1.0.2.sql.gz']) {
  const sum = run('shasum', ['-a', '256', join(dl, f)]).stdout.split(' ')[0]
  if (!sums.includes(`${sum}  ${f}`)) cannotRun(`${f} does not match SHA256SUMS`)
}
const site = join(work, 'jsite')
run('mkdir', ['-p', site])
run('tar', ['-xzf', join(dl, 'tracy-base-j6-webroot-1.0.2.tar.gz'), '-C', site])
const cfgPath = join(site, 'configuration.php')
const cfg = readFileSync(cfgPath, 'utf8')
  .replace("public $host = '';", "public $host = 'reg-dsslot-jdb';")
  .replace("public $user = '';", "public $user = 'jo';")
  .replace("public $password = '';", "public $password = 'jo';")
  .replace("public $db = '';", "public $db = 'jo';")
  .replace("public $log_path = '';", "public $log_path = '/var/www/html/administrator/logs';")
  .replace("public $tmp_path = '';", "public $tmp_path = '/var/www/html/tmp';")
writeFileSync(cfgPath, cfg)
run('mkdir', ['-p', join(site, 'tmp'), join(site, 'administrator/logs')])
docker(
  'run',
  '-d',
  '--name',
  'reg-dsslot-jdb',
  '--network',
  NET,
  '-e',
  'MARIADB_ROOT_PASSWORD=r',
  '-e',
  'MARIADB_DATABASE=jo',
  '-e',
  'MARIADB_USER=jo',
  '-e',
  'MARIADB_PASSWORD=jo',
  'mariadb:11'
)
if (!wait(() => (docker('exec', 'reg-dsslot-jdb', 'mariadb', '-ujo', '-pjo', '-e', 'select 1', 'jo'), true)))
  cannotRun('Joomla database did not come up')
execFileSync('sh', [
  '-c',
  `gunzip -c "${join(dl, 'tracy-base-j6-database-1.0.2.sql.gz')}" | docker exec -i reg-dsslot-jdb mariadb -ujo -pjo jo`
])
docker(
  'run',
  '-d',
  '--name',
  'reg-dsslot-jo',
  '--network',
  NET,
  '-p',
  `127.0.0.1:${JO_PORT}:80`,
  '-e',
  'JOOMLA_DB_HOST=reg-dsslot-jdb',
  '-e',
  'JOOMLA_DB_USER=jo',
  '-e',
  'JOOMLA_DB_PASSWORD=jo',
  '-e',
  'JOOMLA_DB_NAME=jo',
  '-v',
  `${site}:/var/www/html`,
  JO_IMAGE
)
if (
  !wait(
    () =>
      run('curl', [
        '-s',
        '--noproxy',
        '*',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `http://127.0.0.1:${JO_PORT}/`
      ]).stdout === '200'
  )
)
  cannotRun('Joomla did not answer')
docker(
  'exec',
  'reg-dsslot-jo',
  'sh',
  '-c',
  'chown -R www-data:www-data /var/www/html/tmp /var/www/html/administrator/logs /var/www/html/images /var/www/html/media; true'
)
const joOut = join(work, 'jo')
flow('--cms', 'joomla', '--site', `http://127.0.0.1:${JO_PORT}`, '--out', join(joOut, 'base'), '--snap')
const joRun = flow(
  '--cms',
  'joomla',
  '--joomla-db',
  'reg-dsslot-jdb',
  '--site',
  `http://127.0.0.1:${JO_PORT}`,
  '--out',
  joOut,
  '--baseline',
  join(joOut, 'base/default.json'),
  ...IDS
)
c.eq('S4 Joomla flow exits 0', joRun.status, 0)
judge('S4 Joomla', joOut)

c.done()
