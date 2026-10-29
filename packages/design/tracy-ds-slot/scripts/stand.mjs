#!/usr/bin/env node
/**
 * A released quickstart restored as a running local site, to measure the design-system slot on it:
 *
 *   node scripts/stand.mjs up   <release tag> --port <n> [--name <stand>] [--version <x.y.z>] [--dir <work dir>]
 *                               [--from-dir <a locally built release>]
 *   node scripts/stand.mjs down --name <stand>
 *
 * Downloads the pair the release's manifest names (webroot + database) from JoomlArt-Products/joomlart-products,
 * checks each SHA-256 against the manifest, restores them the way the fleet provisioner does (Joomla:
 * configuration.php's database fields; WordPress: wp-config.php's {{DB_*}} placeholders and
 * `wp search-replace` from the dump's placeholder address to http://localhost:<port>), and serves the site on 127.0.0.1:<port> with
 * the fleet's own images. Prints one JSON line: { name, platform, site, web, db, version, dir }.
 * Every container and network carries the stand's name; `down` removes them and the work dir.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifestFromSetting } from '../src/release-manifest.mjs'
import { standAddressOf } from '../src/stand-address.mjs'
import { STAND_DB_ARGS } from '../src/stand-db.mjs'

const IMAGES = {
  wordpress: 'tracy/web-wordpress:php8.3-apache-20260923-r1',
  joomla: 'tracy/web-joomla:6-apache-20260923-r1',
  db: 'mariadb:11'
}
const REPO = 'JoomlArt-Products/joomlart-products'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const args = process.argv.slice(2)
const cmd = args.shift()
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args.splice(i, 2)[1]
}
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const quiet = (...a) => spawnSync('docker', a, { stdio: 'ignore' })
const sleep = (s) => execFileSync('sleep', [String(s)])
const wait = (fn, tries = 120) => {
  for (let i = 0; i < tries; i++) {
    try {
      if (fn()) return true
    } catch {}
    sleep(2)
  }
  return false
}
const sha256 = (file) =>
  new Promise((ok, no) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => ok(h.digest('hex')))
      .on('error', no)
  })

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/

if (cmd === 'down') {
  const name = opt('--name')
  if (!NAME_RE.test(name ?? '')) throw new Error('down needs --name')
  // -v: the database container's anonymous data volume goes with it (each stand left ~180 MB of
  // MariaDB data behind on a Docker disk that had 8 GB free, 10/10/2026); the site is a bind mount
  for (const c of [`${name}-web`, `${name}-db`]) quiet('rm', '-f', '-v', c)
  quiet('network', 'rm', name)
  const dir = join(opt('--dir') ?? join(tmpdir(), 'ds-stands'), name)
  rmSync(dir, { recursive: true, force: true })
  console.log(JSON.stringify({ name, down: true }))
  process.exit(0)
}

if (cmd !== 'up') {
  console.error(
    'usage: stand.mjs up <release tag> --port <n> [--name <stand>] [--version <x.y.z>] | down --name <stand>'
  )
  process.exit(1)
}
const tag = args.shift()
const WANT_VERSION = (() => {
  const i = args.indexOf('--version')
  return i === -1 ? null : args[i + 1]
})()
const port = Number(opt('--port'))
const name =
  opt('--name') ??
  tag
    .replace(/^quickstart\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '')
    .slice(0, 40)
if (!tag || !Number.isInteger(port) || !NAME_RE.test(name))
  throw new Error('up needs a release tag, --port and a valid --name')
const dir = join(opt('--dir') ?? join(tmpdir(), 'ds-stands'), name)
rmSync(dir, { recursive: true, force: true })
mkdirSync(join(dir, 'dl'), { recursive: true })

// three tries: a download that meets a network blip ("error connecting to api.github.com") is retried
const gh = (...a) => {
  for (let i = 1; ; i++)
    try {
      return execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      if (i >= 3 || !/connecting|timeout|EOF|reset|5\d\d/i.test(String(e.stderr ?? e.message))) throw e
      execFileSync('sleep', [String(10 * i)])
    }
}
// --from-dir: a release built locally (release-joomla.mjs) — the same files, never downloaded
const local = opt('--from-dir')
// DS_STAND_CACHE: a release's site files (webroot, database, installer: named by version) kept between
// stands, so a re-measure downloads each once (GitHub served the 14/10/2026 sweep at 3-5 MB a minute,
// most of a template's 9-15 minutes). The release's small files are always fetched; the SHA-256 check
// below judges a cached file as it judges a downloaded one
const CACHE = local ? null : (process.env.DS_STAND_CACHE ?? null)
const SMALL = new Set(['manifest.json', 'SHA256SUMS', 'tracy_setting.json'])
const cachedAt = (f) => join(CACHE, tag.replace(/[^a-zA-Z0-9.-]+/g, '_'), f)
const fromCache = new Set()
const fetch = (...files) => {
  if (CACHE) {
    const kept = files.filter((f) => !SMALL.has(f) && existsSync(cachedAt(f)))
    for (const f of kept) {
      copyFileSync(cachedAt(f), join(dir, 'dl', f))
      fromCache.add(f)
    }
    const rest = files.filter((f) => !kept.includes(f))
    if (rest.length) download(...rest)
    for (const f of rest)
      if (!SMALL.has(f) && existsSync(join(dir, 'dl', f))) {
        mkdirSync(dirname(cachedAt(f)), { recursive: true })
        copyFileSync(join(dir, 'dl', f), cachedAt(f))
      }
    return
  }
  download(...files)
}
const download = (...files) => {
  if (!local)
    return gh(
      'release',
      'download',
      tag,
      '-R',
      REPO,
      '-D',
      join(dir, 'dl'),
      // a second try after a dropped download (the one without SHA256SUMS below) finds the first file
      // already there: it is fetched again, never left half-written (JA Vega, 13/10/2026)
      '--clobber',
      ...files.flatMap((f) => ['-p', f])
    )
  for (const f of files)
    if (existsSync(join(local, f))) execFileSync('cp', [join(local, f), join(dir, 'dl', f)])
}
// A release without its own manifest.json (the older JA ones: an installer zip, or a pair cut by
// hand): the manifest its tch contract embeds — the same file the fleet reads through the catalog.
const contractManifest = () => {
  const [product, line] = tag.replace(/^quickstart\//, '').split('/')
  const pkg = line?.startsWith('wp') ? 'tracy-wordpress-quickstart' : 'tracy-joomla-quickstart'
  const base = join(ROOT, 'packages/cms', pkg, 'contracts', product, line ?? 'j6')
  const versions = existsSync(base) ? readdirSync(base).filter((v) => /^\d+\.\d+\.\d+$/.test(v)) : []
  const cmp = (a, b) =>
    a
      .split('.')
      .map(Number)
      .reduce((r, x, i) => r || x - b.split('.').map(Number)[i], 0)
  // --version names the release's own version; else the newest contract (a contract for a version
  // built here but not yet published is newer than the release)
  // else the version the release's switch names — what the release serves today
  let live = null
  if (!WANT_VERSION && !local)
    try {
      fetch('tracy_setting.json')
      live = JSON.parse(readFileSync(join(dir, 'dl/tracy_setting.json'), 'utf8')).version
    } catch {}
  const pick = WANT_VERSION ?? live
  // --version is a promise about what gets restored: a version this checkout has no contract for is
  // refused, never stood in for by the newest one. Tracy Apple 1.3.1 (built, not yet published) was
  // measured three times on 16/10/2026 as "1.3.1" from 1.3.0's files, because the iMac checkout the
  // stand ran from carried contracts up to 1.3.0 only: 1.3.0's look read as a 1.3.1 regression.
  if (WANT_VERSION && versions.length && !versions.includes(WANT_VERSION))
    throw new Error(
      `${tag}: neither the release nor this checkout's contracts (${versions.sort(cmp).join(', ')}) know ` +
        `${WANT_VERSION}; a version not yet published is restored from its local build (--from-dir)`
    )
  const latest = pick && versions.includes(pick) ? pick : versions.sort(cmp).pop()
  if (latest) return JSON.parse(readFileSync(join(base, latest, 'manifest.json'), 'utf8')).quickstart
  // no tch contract either (ja-focus, ja-titan …): the switch itself, which is what the fleet reads
  if (!existsSync(join(dir, 'dl/tracy_setting.json'))) fetch('tracy_setting.json')
  if (!existsSync(join(dir, 'dl/tracy_setting.json')))
    throw new Error(`${tag}: no manifest.json, no tracy_setting.json and no tch contract`)
  const m = manifestFromSetting(tag, JSON.parse(readFileSync(join(dir, 'dl/tracy_setting.json'), 'utf8')))
  if (WANT_VERSION && m.version !== WANT_VERSION)
    throw new Error(
      `${tag}: the release serves ${m.version}, not ${WANT_VERSION}, and has no manifest for it`
    )
  return m
}
try {
  fetch('manifest.json')
} catch {}
// a release manifest without the parts a site is built from (tracy-business/j6 still carries the
// 1.1.0 single-zip one while Tracy pins 1.2.1) is not the release's current state: the contract's is
const own = existsSync(join(dir, 'dl/manifest.json'))
  ? JSON.parse(readFileSync(join(dir, 'dl/manifest.json'), 'utf8'))
  : null
// --version naming an older release than the one the release's manifest describes (a contract's
// minVersion, measured after later releases shipped): that version's tch contract manifest
const manifest =
  own && own.platform && (own.parts || own.webroot) && (!WANT_VERSION || own.version === WANT_VERSION)
    ? own
    : contractManifest()
if (WANT_VERSION && manifest.version && manifest.version !== WANT_VERSION)
  throw new Error(`${tag}: asked for ${WANT_VERSION}, the manifest found describes ${manifest.version}`)
writeFileSync(join(dir, 'dl/manifest.json'), JSON.stringify(manifest, null, 2))
const platform = manifest.platform
const version = opt('--version') ?? manifest.version
// Two manifest shapes: Joomla's `parts.webroot/database`, WordPress's top-level `webroot`/`database`.
const installer = manifest.parts?.installer ?? null
const want = installer
  ? [installer, null]
  : manifest.parts
    ? [manifest.parts.webroot, manifest.parts.database]
    : [manifest.webroot, manifest.database]
const prefix = tag.replace(/^quickstart\//, '').replace('/', '-')
const webFile = want[0]?.file ?? `${prefix}-webroot-${version}.tar.gz`
const dbFile = want[1]?.file ?? `${prefix}-database-${version}.sql.gz`
const files = installer ? [webFile] : [webFile, dbFile]
try {
  fetch(...files, 'SHA256SUMS')
} catch {
  fetch(...files)
}
const sums = existsSync(join(dir, 'dl/SHA256SUMS')) ? readFileSync(join(dir, 'dl/SHA256SUMS'), 'utf8') : ''
for (const f of files) {
  const listed = want.find((w) => w?.file === f)?.sha256
  const matches = (sum) => (listed ? listed === sum : sums.includes(`${sum}  ${f}`))
  let sum = await sha256(join(dir, 'dl', f))
  // a cached file the release no longer lists (a release re-cut under the same name): downloaded again
  if (!matches(sum) && fromCache.has(f)) {
    rmSync(cachedAt(f), { force: true })
    fromCache.delete(f)
    fetch(f)
    sum = await sha256(join(dir, 'dl', f))
  }
  if (!matches(sum)) throw new Error(`${f}: SHA-256 does not match the release`)
}
// --fetch-only: the release's files are in the cache (DS_STAND_CACHE); no site is started
if (args.includes('--fetch-only')) {
  rmSync(dir, { recursive: true, force: true })
  console.log(JSON.stringify({ tag, version, files, cached: Boolean(CACHE), fromCache: [...fromCache] }))
  process.exit(0)
}

const site = join(dir, 'site')
mkdirSync(site, { recursive: true })
if (installer) execFileSync('unzip', ['-q', '-o', join(dir, 'dl', webFile), '-d', site])
else execFileSync('tar', ['-xzf', join(dir, 'dl', webFile), '-C', site])
const web = `${name}-web`
const db = `${name}-db`
for (const c of [web, db]) quiet('rm', '-f', c)
quiet('network', 'create', name)
docker(
  'run',
  '-d',
  '--name',
  db,
  '--network',
  name,
  '-e',
  'MARIADB_ROOT_PASSWORD=r',
  '-e',
  'MARIADB_DATABASE=site',
  '-e',
  'MARIADB_USER=site',
  '-e',
  'MARIADB_PASSWORD=site',
  IMAGES.db,
  // one random draw per page: every request of the site's user seeds RAND() alike (stand-db.mjs)
  ...STAND_DB_ARGS
)
if (!wait(() => (docker('exec', db, 'mariadb', '-usite', '-psite', '-e', 'select 1', 'site'), true)))
  throw new Error('database did not come up')
// foreign keys off while loading: a dump may create a table before the one its key points at.
// Retried: MariaDB restarts once after its first initialisation, and a load can meet that restart.
if (!installer) {
  const load = () =>
    execFileSync(
      'sh',
      [
        '-c',
        `{ echo 'SET FOREIGN_KEY_CHECKS=0;'; gunzip -c "${join(dir, 'dl', dbFile)}"; } | docker exec -i ${db} mariadb -usite -psite site`
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
  if (!wait(() => (load(), true), 10)) load()
}
// the table prefix, when the manifest does not name it (a pair cut by hand)
if (!manifest.prefix && !installer) {
  const t = docker(
    'exec',
    db,
    'mariadb',
    '-usite',
    '-psite',
    'site',
    '-N',
    '-e',
    "show tables like '%\\_modules'"
  )
    .trim()
    .split('\n')[0]
  if (t) manifest.prefix = t.replace(/modules$/, '')
  writeFileSync(join(dir, 'dl/manifest.json'), JSON.stringify(manifest, null, 2))
}
// WordPress at http://localhost:<port>, the host name the preview probes open; Joomla at 127.0.0.1
// (src/stand-address.mjs). The port is published on 127.0.0.1 either way.
const url = standAddressOf(platform, port)

if (platform === 'joomla' && installer) {
  // the fleet's `installer` shape (platform/joomla.sh): Joomla's own CLI installer against the
  // stand's database, prefix tr_ — it loads the template's demo content (installation/sql/…/custom.sql)
  // the fleet's `clone` compose flavour: Apache only — the image's own entrypoint would set up a
  // Joomla of its own over the package (render-compose.sh tracy_compose_clone)
  docker(
    'run',
    '-d',
    '--name',
    web,
    '--network',
    name,
    '-p',
    `127.0.0.1:${port}:80`,
    '-v',
    `${site}:/var/www/html`,
    '--entrypoint',
    'apache2-foreground',
    IMAGES.joomla
  )
  // up to 5 min: on the loaded shared Docker VM the container took over a minute to start (11/10/2026)
  if (!wait(() => (docker('exec', web, 'test', '-f', '/var/www/html/installation/joomla.php'), true), 150))
    throw new Error('the web container never showed installation/joomla.php')
  docker(
    'exec',
    '-w',
    '/var/www/html',
    web,
    'php',
    'installation/joomla.php',
    'install',
    '--no-interaction',
    '--site-name',
    manifest.product ?? name,
    '--admin-user',
    'Stand Admin',
    '--admin-username',
    'standadmin',
    '--admin-password',
    'stand-only-local-0001',
    '--admin-email',
    'stand@example.invalid',
    '--db-type',
    'mysqli',
    '--db-host',
    db,
    '--db-user',
    'site',
    '--db-pass',
    'site',
    '--db-name',
    'site',
    '--db-prefix',
    'tr_'
  )
  rmSync(join(site, 'installation'), { recursive: true, force: true })
  if (!existsSync(join(site, '.htaccess')) && existsSync(join(site, 'htaccess.txt')))
    copyFileSync(join(site, 'htaccess.txt'), join(site, '.htaccess'))
  manifest.prefix = 'tr_'
  writeFileSync(join(dir, 'dl/manifest.json'), JSON.stringify(manifest, null, 2))
} else if (platform === 'joomla') {
  const cfgPath = join(site, 'configuration.php')
  let cfg = readFileSync(cfgPath, 'utf8')
  for (const [k, v] of [
    ['host', db],
    ['user', 'site'],
    ['password', 'site'],
    ['db', 'site'],
    ['log_path', '/var/www/html/administrator/logs'],
    ['tmp_path', '/var/www/html/tmp']
  ])
    cfg = cfg.replace(new RegExp(`public \\$${k} = '[^']*';`), `public $${k} = '${v}';`)
  writeFileSync(cfgPath, cfg)
  mkdirSync(join(site, 'tmp'), { recursive: true })
  mkdirSync(join(site, 'administrator/logs'), { recursive: true })
  docker(
    'run',
    '-d',
    '--name',
    web,
    '--network',
    name,
    '-p',
    `127.0.0.1:${port}:80`,
    '-e',
    `JOOMLA_DB_HOST=${db}`,
    '-e',
    'JOOMLA_DB_USER=site',
    '-e',
    'JOOMLA_DB_PASSWORD=site',
    '-e',
    'JOOMLA_DB_NAME=site',
    '-v',
    `${site}:/var/www/html`,
    IMAGES.joomla
  )
} else if (platform === 'wordpress') {
  const cfgPath = join(site, 'wp-config.php')
  const cfg = readFileSync(cfgPath, 'utf8')
    .replace('{{DB_NAME}}', 'site')
    .replace('{{DB_USER}}', 'site')
    .replace('{{DB_PASSWORD}}', 'site')
    .replace('{{DB_HOST}}', db)
  writeFileSync(cfgPath, cfg)
  docker(
    'run',
    '-d',
    '--name',
    web,
    '--network',
    name,
    '-p',
    `127.0.0.1:${port}:80`,
    '-v',
    `${site}:/var/www/html`,
    IMAGES.wordpress
  )
  const wp = (...a) => docker('exec', '-u', 'www-data', web, 'wp', ...a)
  if (!wait(() => (wp('option', 'get', 'home'), true), 60)) throw new Error('WordPress did not answer wp-cli')
  // the address is the answer's last line: a theme that prints before its <?php (JA Vega 1.1.16's
  // inc/extra.php) prints into wp-cli too, and the whole answer replaced nothing (13/10/2026)
  const old = wp('option', 'get', 'home').trim().split('\n').pop().trim()
  wp('search-replace', old, url, '--all-tables', '--precise', '--quiet')
  wp('rewrite', 'flush')
} else throw new Error(`unknown platform ${platform}`)

docker('exec', web, 'sh', '-c', 'chown -R www-data:www-data /var/www/html; true')
const up = wait(() => {
  const r = spawnSync(
    'curl',
    // -L: a multilingual Joomla answers / with a 301 to its language prefix (tracy-business/j6);
    // 150 s: on the shared, loaded Docker VM a Joomla home page took 2 min (11/10/2026)
    ['-s', '-L', '--noproxy', '*', '-o', '/dev/null', '-w', '%{http_code}', '-m', '150', `${url}/`],
    { encoding: 'utf8' }
  )
  return r.stdout === '200'
}, 90)
if (!up) throw new Error(`${url}/ did not answer 200`)
console.log(JSON.stringify({ name, platform, site: url, web, db, version, dir }))
