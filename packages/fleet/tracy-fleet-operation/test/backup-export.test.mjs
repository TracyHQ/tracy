/**
 * A backup point packed for download (`webroot-backup.sh --op export`, plan
 * `tasks/todo-backup-export.md`): the site's configuration file with Tracy's database credentials
 * replaced (`lib/export-config.py`), and the whole package built and uploaded from a throwaway stack.
 *
 * No container anywhere: the point's dump is written by the test with the trailer a real backup
 * would carry, and the upload goes to a local HTTP server standing in for the presigned store URL.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/backup-export.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const EXPORT_CONFIG = join(scripts, 'lib', 'export-config.py')

const scratch = mkdtempSync(join(tmpdir(), 'backup-export-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** Run export-config.py on `text`; `{status, out, stdout, stderr}`. */
function rewrite(platform, text) {
  const dir = mkdtempSync(join(scratch, 'cfg-'))
  const src = join(dir, 'in.php')
  const out = join(dir, 'out.php')
  writeFileSync(src, text)
  const r = spawnSync('python3', ['-I', EXPORT_CONFIG, platform, src, out], { encoding: 'utf8' })
  let written = null
  try {
    written = readFileSync(out, 'utf8')
  } catch {}
  return { status: r.status, out: written, stdout: r.stdout, stderr: r.stderr }
}

const WP_CONFIG = `<?php
/** The name of the database for WordPress */
define( 'DB_NAME', getenv_docker('WORDPRESS_DB_NAME', 'wordpress') );
define( 'DB_USER', 'wp_user' );
define("DB_PASSWORD", 's3cret-on-the-host');
define( 'DB_HOST', 'db:3306' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'AUTH_KEY', 'keep-this-salt' );
$table_prefix = 'wp_tc_';
define( 'WP_DEBUG', false );
define('WP_HOME', 'https://site-under-test.tracy.site');
define('WP_SITEURL', 'https://site-under-test.tracy.site');
// define('WP_HOME', 'https://old.example');
/* That's all, stop editing! Happy publishing. */
require_once ABSPATH . 'wp-settings.php';
`

test('export-config: WordPress — the four database constants become placeholders, every other byte stays', () => {
  const r = rewrite('wordpress', WP_CONFIG)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), {
    ok: true,
    changed: ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
  })
  const expected = WP_CONFIG.replace("getenv_docker('WORDPRESS_DB_NAME', 'wordpress')", "'tracy-placeholder'")
    .replace("'wp_user'", "'tracy-placeholder'")
    .replace("'s3cret-on-the-host'", "'tracy-placeholder'")
    .replace("'db:3306'", "'tracy-placeholder'")
  assert.equal(r.out, expected)
  assert.doesNotMatch(r.out, /s3cret-on-the-host/)
})

test('export-config: WordPress — a CRLF file comes back CRLF', () => {
  const r = rewrite('wordpress', WP_CONFIG.replace(/\n/g, '\r\n'))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.split('\r\n').length, WP_CONFIG.split('\n').length)
})

test('export-config: WordPress — a file that does not define every database constant is refused, never half-done', () => {
  const r = rewrite('wordpress', WP_CONFIG.replace(/^define\( 'DB_HOST'.*$/m, "require 'db-settings.php';"))
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /unsupported config/)
  assert.match(r.stderr, /DB_HOST/)
  assert.equal(r.out, null, 'nothing written')
})

const JOOMLA_CONFIG = `<?php
class JConfig {
\tpublic $offline = false;
\tpublic $sitename = 'Lantern';
\tpublic $dbtype = 'mysqli';
\tpublic $host = 'db';
\tpublic $user = 'joomla';
\tpublic $password = 'hunter2-on-the-host';
\tpublic $db = 'joomla';
\tpublic $dbprefix = 'jx7_';
\tpublic $secret = 'keep-this-secret';
\tpublic $offset = 'Asia/Ho_Chi_Minh';
}
`

test('export-config: Joomla — $host/$user/$password/$db become placeholders, prefix and secret stay', () => {
  const r = rewrite('joomla', JOOMLA_CONFIG)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), {
    ok: true,
    changed: ['host', 'user', 'password', 'db']
  })
  assert.equal(
    r.out,
    JOOMLA_CONFIG.replace("$host = 'db'", "$host = 'tracy-placeholder'")
      .replace("$user = 'joomla'", "$user = 'tracy-placeholder'")
      .replace("$password = 'hunter2-on-the-host'", "$password = 'tracy-placeholder'")
      .replace("$db = 'joomla'", "$db = 'tracy-placeholder'")
  )
})

test('export-config: Joomla — a $db that is not a quoted line, and an unknown platform, are refused', () => {
  const r = rewrite('joomla', JOOMLA_CONFIG.replace("\tpublic $db = 'joomla';\n", ''))
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /unsupported config/)
  assert.equal(r.out, null)
  const e = rewrite('emdash', '<?php\n')
  assert.notEqual(e.status, 0)
  assert.match(e.stderr, /unsupported config/)
})

// ── the whole package, from a throwaway WordPress stack ─────────────────────────────────────────
import { spawn } from 'node:child_process'
import { createHash, pbkdf2Sync } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readdirSync,
  symlinkSync,
  closeSync
} from 'node:fs'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathWithFlock } from './flock-shim.mjs'

const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'site-under-test'
const SIGNATURE = 'X-Amz-Signature=0123456789abcdef'
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/**
 * An EmDash site's database and app snapshot as provision leaves them: the resident agent with its
 * two tokens (`mint-agent-admin.cjs`, `register-content-token.cjs`), the owner with a token and a
 * passkey of their own, and the relay digest file at the app's root. Writes `db.sqlite.gz` and
 * `app.tar` into `dir` and returns the gzip bytes.
 */
function emdashSite(dir) {
  const made = spawnSync(
    'python3',
    [
      '-c',
      `import gzip, io, sqlite3, sys, tarfile
db = sqlite3.connect(sys.argv[1] + "/site.db")
db.executescript("""
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, role INTEGER, disabled INTEGER DEFAULT 0);
CREATE TABLE _emdash_api_tokens (id TEXT, name TEXT, token_hash TEXT, user_id TEXT, scopes TEXT);
CREATE TABLE credentials (id TEXT, user_id TEXT);
CREATE TABLE auth_tokens (hash TEXT, user_id TEXT, email TEXT);
INSERT INTO users VALUES ('agent', 'tracy-agent@tracy.ai', 50, 0), ('owner', 'owner@example.com', 50, 0);
INSERT INTO _emdash_api_tokens VALUES
  ('t1', 'tracy-agent', 'AGENTHASH', 'agent', '["admin","mcp:tools"]'),
  ('t2', 'tracy-content-read', 'RELAYHASH', 'agent', '["content:read"]'),
  ('t3', 'owner-laptop', 'OWNERHASH', 'owner', '["content:read"]'),
  ('t4', 'tracy-agent', 'OWNERNAMEDAGENT', 'owner', '["admin"]'),
  ('t5', 'tracy-content-read', 'OWNERNAMEDRELAY', 'owner', '["content:read"]');
INSERT INTO credentials VALUES ('c1', 'owner');
INSERT INTO auth_tokens VALUES ('LINKHASH', 'agent', 'tracy-agent@tracy.ai'),
  ('PRELINKHASH', NULL, 'Tracy-Agent@tracy.ai'), ('OWNERLINK', NULL, 'owner@example.com');
""")
db.close()
with open(sys.argv[1] + "/site.db", "rb") as f, gzip.open(sys.argv[1] + "/db.sqlite.gz", "wb") as g:
    g.write(f.read())
t = tarfile.open(sys.argv[1] + "/app.tar", "w")
for name, text in (("./package.json", "{}"), ("./tracy-content-relay.sha256", "ab" * 32 + "\\n"),
                   ("./src/lib/stamps.ts", "// kept")):
    d = text.encode(); i = tarfile.TarInfo(name); i.size = len(d); t.addfile(i, io.BytesIO(d))
t.close()`,
      dir
    ],
    { encoding: 'utf8' }
  )
  assert.equal(made.status, 0, made.stderr)
  rmSync(join(dir, 'site.db'))
  return readFileSync(join(dir, 'db.sqlite.gz'))
}

/** Rows of `sql` in a gzipped SQLite database, each as an array of its values. */
function sqliteRows(gz, sql) {
  const file = join(mkdtempSync(join(scratch, 'sqlite-')), 'site.db')
  writeFileSync(file, gunzipSync(gz))
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db
      .prepare(sql)
      .all()
      .map((row) => Object.values(row))
  } finally {
    db.close()
  }
}

test('export-package: EmDash includes app, database, uploads and its Node-host README', () => {
  const dir = mkdtempSync(join(scratch, 'emdash-pack-'))
  const sqlite = emdashSite(dir)
  const app = readFileSync(join(dir, 'app.tar'))
  const uploadsPath = join(dir, 'uploads.tar.gz')
  const makeUploads = spawnSync(
    'python3',
    [
      '-c',
      'import io,sys,tarfile; t=tarfile.open(sys.argv[1],"w:gz"); d=b"portrait bytes"; i=tarfile.TarInfo("uploads/portrait.jpg"); i.size=len(d); t.addfile(i,io.BytesIO(d)); t.close()',
      uploadsPath
    ],
    { encoding: 'utf8' }
  )
  assert.equal(makeUploads.status, 0, makeUploads.stderr)
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 4,
      title: 'A point',
      at: 1,
      sha: 'a'.repeat(40),
      facts: { kind: 'sqlite' },
      database: { bytes: sqlite.length, sha256: sha256(sqlite), engine: 'sqlite' }
    })
  )
  // Each export packs from a fresh copy of the point, as `webroot-backup.sh` makes one.
  const pack = (env = {}) => {
    writeFileSync(join(dir, 'db.sqlite.gz'), sqlite)
    writeFileSync(join(dir, 'app.tar'), app)
    return spawnSync(
      'python3',
      [
        join(scripts, 'lib', 'export-package.py'),
        dir,
        'emdash',
        'lantern',
        join(dir, 'point.json'),
        String(1024 * 1024)
      ],
      { encoding: 'utf8', env: { ...process.env, TRACY_EXPORT_SITE_URL: '', ...env } }
    )
  }
  // No address from the caller: the README says where the old address comes from, never a domain.
  const unnamed = pack()
  assert.equal(unnamed.status, 0, unnamed.stderr)
  const fallback = unzip(readFileSync(join(dir, 'package.zip')))['README.md'].bytes.toString()
  assert.match(fallback, /the address Tracy gave the site: it starts with\s+`https:\/\/lantern\.`/)
  assert.match(fallback, /It is not your own domain/)
  assert.match(fallback, /old address `OLD_ADDRESS`/)
  assert.match(fallback, /set `EMDASH_SITE_URL` to the new address/)

  const result = pack({ TRACY_EXPORT_SITE_URL: 'https://lantern.tracy.site/' })
  assert.equal(result.status, 0, result.stderr)
  const answer = JSON.parse(result.stdout.trim().split('\n').at(-1))
  assert.equal(answer.ok, true)
  const members = unzip(readFileSync(join(dir, 'package.zip')))
  const readme = members['README.md'].bytes.toString()
  assert.match(readme, /set to `https:\/\/lantern\.tracy\.site`/)
  assert.match(readme, /set `EMDASH_SITE_URL` to the new address/)
  assert.match(readme, /old address `https:\/\/lantern\.tracy\.site`/)
  assert.doesNotMatch(readme, /OLD_ADDRESS/)
  assert.match(readme, /If the site stays on Tracy/)
  // EmDash packs its whole uploads folder: nothing is said to be left out.
  assert.match(readme, /This package is a copy of the site\. If the site stays on Tracy/)
  assert.doesNotMatch(readme, /Files over 50 MB|full backup/)
  assert.match(readme, /Install it into an empty folder\. The package holds the site as it is on\s+Tracy/)
  assert.doesNotMatch(readme, /empty database/)
  assert.match(
    readme,
    /changes made to another copy of the site \(for example your original site after it was\s+imported into Tracy: new orders, comments, sign-ups, posts\) are not in it\. Putting the package in\s+place of that site replaces its files and database and loses those changes\./
  )
  assert.deepEqual(Object.keys(members).sort(), [
    'README.md',
    'SHA256SUMS',
    'app.tar',
    'db.sqlite.gz',
    'manifest.json',
    'tracy_setting.json',
    'uploads.tar.gz'
  ])
  assert.equal(members['installer.php'], undefined, 'EmDash has no installer')
  assert.ok(!Object.keys(members).some((name) => name.includes('/')), 'nor a payload folder')
  assert.match(members['README.md'].bytes.toString(), /Node\.js host/)
  assert.match(members['README.md'].bytes.toString(), /Tracy makes no promise/)
  assert.match(
    members['README.md'].bytes.toString(),
    /From the app\s+directory, run `tar -xzf uploads\.tar\.gz`/
  )
  const restore = join(dir, 'restore')
  mkdirSync(restore)
  const packagedUploads = join(dir, 'packaged-uploads.tar.gz')
  writeFileSync(packagedUploads, members['uploads.tar.gz'].bytes)
  const extracted = spawnSync('tar', ['-xzf', packagedUploads, '-C', restore], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  assert.equal(readFileSync(join(restore, 'uploads', 'portrait.jpg'), 'utf8'), 'portrait bytes')
  assert.equal(
    existsSync(join(restore, 'uploads', 'uploads')),
    false,
    'README extraction does not nest uploads'
  )
  assert.equal(JSON.parse(members['manifest.json'].bytes).scope.applicationIncluded, true)

  // Tracy's access stays behind: the agent is disabled and every key it held is gone, the owner's
  // own tokens (even ones named like Tracy's), passkey and sign-in link stay, and the relay digest
  // is not in the app.
  assert.deepEqual(answer.scope, {
    applicationIncluded: true,
    databaseIncluded: true,
    uploadsIncluded: true,
    linksLeftOut: 0,
    tracyRelayFilesLeftOut: 1,
    tracyAgentDisabled: 1,
    tracyCredentialsRemoved: 4
  })
  const db = members['db.sqlite.gz'].bytes
  assert.deepEqual(sqliteRows(db, 'SELECT id, disabled FROM users ORDER BY id'), [
    ['agent', 1],
    ['owner', 0]
  ])
  assert.deepEqual(sqliteRows(db, 'SELECT name, user_id, token_hash FROM _emdash_api_tokens ORDER BY id'), [
    ['owner-laptop', 'owner', 'OWNERHASH'],
    ['tracy-agent', 'owner', 'OWNERNAMEDAGENT'],
    ['tracy-content-read', 'owner', 'OWNERNAMEDRELAY']
  ])
  assert.deepEqual(sqliteRows(db, 'SELECT user_id FROM credentials'), [['owner']])
  assert.deepEqual(sqliteRows(db, 'SELECT hash FROM auth_tokens'), [['OWNERLINK']])
  assert.doesNotMatch(gunzipSync(db).toString('latin1'), /AGENTHASH|RELAYHASH|\bLINKHASH|PRELINKHASH/)
  assert.deepEqual(Object.keys(untar(members['app.tar'].bytes)).sort(), [
    './package.json',
    './src/lib/stamps.ts'
  ])
  const setting = JSON.parse(members['tracy_setting.json'].bytes)
  assert.equal(setting.install.database.sha256, sha256(db))
  assert.equal(setting.install.application.sha256, sha256(members['app.tar'].bytes))
  assert.match(members.SHA256SUMS.bytes.toString(), new RegExp(`^${sha256(db)}  db\\.sqlite\\.gz$`, 'm'))
  assert.match(readme, /## Signing in on the new host/)
  assert.match(readme, /that\s+account is disabled and its keys are deleted/)
  assert.match(readme, /leaves out `tracy-content-relay\.sha256`/)
  assert.match(readme, /use the sign-in link sent by\s+email/)

  // A database the export cannot open is refused: no package goes out with Tracy's keys in it.
  rmSync(join(dir, 'package.zip'))
  const broken = gzipSync(Buffer.from('not a database'))
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 4,
      facts: { kind: 'sqlite' },
      database: { bytes: broken.length, sha256: sha256(broken) }
    })
  )
  writeFileSync(join(dir, 'db.sqlite.gz'), broken)
  writeFileSync(join(dir, 'app.tar'), app)
  const refused = spawnSync(
    'python3',
    [join(scripts, 'lib', 'export-package.py'), dir, 'emdash', 'lantern', join(dir, 'point.json'), '1048576'],
    { encoding: 'utf8' }
  )
  assert.equal(refused.status, 0, refused.stderr)
  assert.equal(JSON.parse(refused.stdout.trim().split('\n').at(-1)).code, 'TRACY_ACCESS_NOT_REMOVED')
  assert.equal(existsSync(join(dir, 'package.zip')), false)

  rmSync(join(dir, 'app.tar'))
  const missingApp = spawnSync(
    'python3',
    [
      join(scripts, 'lib', 'export-package.py'),
      dir,
      'emdash',
      'lantern',
      join(dir, 'point.json'),
      String(1024 * 1024)
    ],
    { encoding: 'utf8' }
  )
  assert.equal(missingApp.status, 0, missingApp.stderr)
  assert.equal(JSON.parse(missingApp.stdout.trim().split('\n').at(-1)).code, 'BACKUP_NOT_FULL')
  assert.equal(existsSync(join(dir, 'package.zip')), false, 'no ZIP is made without this point’s app')
})

test('export-package: Joomla README names the old address from $live_site', () => {
  const dir = mkdtempSync(join(scratch, 'joomla-live-site-'))
  const dump = gzipSync(Buffer.from('database dump'))
  writeFileSync(join(dir, 'db.sql.gz'), dump)
  // A block comment holding an older $live_site comes first: only the live line counts.
  const config = JOOMLA_CONFIG.replace(
    '\tpublic $offline',
    "\t/*\n\tpublic $live_site = 'https://old.example';\n\t*/\n\tpublic $live_site = 'https://lantern.tracy.site';\n\tpublic $offline"
  )
  const archive = spawnSync(
    'python3',
    [
      '-c',
      'import io,sys,tarfile; t=tarfile.open(sys.argv[1],"w"); d=sys.argv[2].encode(); i=tarfile.TarInfo("configuration.php"); i.size=len(d); t.addfile(i,io.BytesIO(d)); t.close()',
      join(dir, 'archive.tar'),
      config
    ],
    { encoding: 'utf8' }
  )
  assert.equal(archive.status, 0, archive.stderr)
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 5,
      sha: 'b'.repeat(40),
      facts: { kind: 'mysql' },
      database: { bytes: dump.length, sha256: sha256(dump) }
    })
  )
  const result = spawnSync(
    'python3',
    [join(scripts, 'lib', 'export-package.py'), dir, 'joomla', 'lantern', join(dir, 'point.json'), '1048576'],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const readme = unzip(readFileSync(join(dir, 'package.zip')))['README.md'].bytes.toString()
  assert.match(readme, /set to `https:\/\/lantern\.tracy\.site`/)
  assert.match(readme, /The installer replaces the site's old address \(below\)/)
  assert.match(readme, /old\s+address `https:\/\/lantern\.tracy\.site`/)
  assert.match(readme, /Set `\$live_site` to the new address/)
  assert.match(
    readme,
    /This package is a copy of the site\. Files over 50 MB and symbolic links are not included/
  )
  assert.match(
    readme,
    /Install it into an empty folder and an empty database\. The package holds the site as it is on\s+Tracy/
  )
  assert.match(
    readme,
    /changes made to another copy of the site \(for example your original site after it was\s+imported into Tracy: new orders, comments, sign-ups, posts\) are not in it\. Putting the package in\s+place of that site replaces its files and database and loses those changes\./
  )
  assert.doesNotMatch(readme, /OLD_ADDRESS|old\.example/)
})

/** Packs a one-file Joomla point in a fresh folder; `env` reaches export-package.py. */
function packJoomla(env = {}) {
  const dir = mkdtempSync(join(scratch, 'joomla-code-'))
  const dump = gzipSync(Buffer.from('database dump'))
  writeFileSync(join(dir, 'db.sql.gz'), dump)
  const archive = spawnSync(
    'python3',
    [
      '-c',
      'import io,sys,tarfile; t=tarfile.open(sys.argv[1],"w"); d=sys.argv[2].encode(); i=tarfile.TarInfo("configuration.php"); i.size=len(d); t.addfile(i,io.BytesIO(d)); t.close()',
      join(dir, 'archive.tar'),
      JOOMLA_CONFIG
    ],
    { encoding: 'utf8' }
  )
  assert.equal(archive.status, 0, archive.stderr)
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 5,
      title: 'A point',
      at: 1,
      sha: 'b'.repeat(40),
      facts: { kind: 'mysql' },
      database: { bytes: dump.length, sha256: sha256(dump) }
    })
  )
  const result = spawnSync(
    'python3',
    [
      join(scripts, 'lib', 'export-package.py'),
      dir,
      'joomla',
      'lantern',
      join(dir, 'point.json'),
      String(1024 * 1024)
    ],
    { encoding: 'utf8', env: { ...process.env, ...env } }
  )
  return { dir, result }
}

test('export-package: the install code travels only as a PBKDF2 hash in the payload folder', () => {
  const code = '730514'
  const { dir, result } = packJoomla({ TRACY_EXPORT_INSTALL_CODE: code })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!(result.stdout + result.stderr).includes(code), 'the code is never printed')
  const raw = unzip(readFileSync(join(dir, 'package.zip')))
  const payload = payloadOf(raw)
  const record = JSON.parse(raw[`${payload}/install-code.json`].bytes.toString())
  assert.equal(record.algorithm, 'pbkdf2-sha256')
  assert.ok(record.iterations >= 100000, `slow on purpose (${record.iterations})`)
  assert.match(record.salt, /^[0-9a-f]{32}$/)
  assert.equal(
    record.hash,
    pbkdf2Sync(code, Buffer.from(record.salt, 'hex'), record.iterations, 32, 'sha256').toString('hex')
  )
  // Not in any member a web server could hand out, nor in any other.
  for (const [name, entry] of Object.entries(raw)) {
    if (name.endsWith('.tar') || name.endsWith('.gz')) continue
    assert.ok(!entry.bytes.toString('latin1').includes(code), `${name} does not hold the code`)
  }
  const members = flat(raw)
  assert.match(
    members.SHA256SUMS.bytes.toString(),
    new RegExp(`^${sha256(raw[`${payload}/install-code.json`].bytes)}  install-code\\.json$`, 'm')
  )
  assert.equal(JSON.parse(members['manifest.json'].bytes.toString()).installer.installCode, true)
  const readme = members['README.md'].bytes.toString()
  assert.match(readme, /asks for a 6-digit install code/)
  assert.match(readme, /in the email Tracy sent when you downloaded this package, and in Tracy: My Sites/)
  // The installer on the new host reads the same record (PHP when this machine has it; CI does).
  const php = spawnSync(
    'php',
    [
      '-r',
      'define("TRACY_INSTALLER_LIBRARY", 1); define("TRACY_INSTALLER_PLATFORM", "joomla"); define("TRACY_INSTALLER_OLD_ADDRESS", ""); define("TRACY_INSTALLER_LABEL", "x"); define("TRACY_INSTALLER_BACKUP", ""); define("TRACY_INSTALLER_COMPANIONS", "{}"); define("TRACY_INSTALLER_PAYLOAD_SIZES", "{}"); require $argv[1]; $r = json_decode(file_get_contents("php://stdin"), true); echo json_encode([ti_code_matches($argv[2], $r), ti_code_matches("730515", $r)]);',
      join(scripts, 'lib', 'export-installer.php'),
      code
    ],
    { input: raw[`${payload}/install-code.json`].bytes, encoding: 'utf8' }
  )
  if (!php.error) assert.equal(php.stdout, '[true,false]', php.stderr)
})

test('export-package: no install code, no record; a malformed one is refused and not echoed', () => {
  const plain = packJoomla()
  assert.equal(plain.result.status, 0, plain.result.stderr)
  const raw = unzip(readFileSync(join(plain.dir, 'package.zip')))
  assert.ok(!Object.keys(raw).some((name) => name.endsWith('install-code.json')))
  assert.equal(JSON.parse(flat(raw)['manifest.json'].bytes.toString()).installer.installCode, false)
  const bad = packJoomla({ TRACY_EXPORT_INSTALL_CODE: '12ab56' })
  const answer = JSON.parse(bad.result.stdout.trim().split('\n').at(-1))
  assert.equal(answer.code, 'BAD_INSTALL_CODE')
  assert.ok(!(bad.result.stdout + bad.result.stderr).includes('12ab56'))
})

test('export-package: Joomla package has move instructions and the four database placeholders', () => {
  const dir = mkdtempSync(join(scratch, 'joomla-pack-'))
  const dump = gzipSync(Buffer.from('database dump'))
  writeFileSync(join(dir, 'db.sql.gz'), dump)
  const config = Buffer.from(JOOMLA_CONFIG)
  const archive = spawnSync(
    'python3',
    [
      '-c',
      'import io,sys,tarfile; t=tarfile.open(sys.argv[1],"w"); d=sys.argv[2].encode(); i=tarfile.TarInfo("configuration.php"); i.size=len(d); t.addfile(i,io.BytesIO(d)); t.close()',
      join(dir, 'archive.tar'),
      config.toString()
    ],
    { encoding: 'utf8' }
  )
  assert.equal(archive.status, 0, archive.stderr)
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 5,
      title: 'A point',
      at: 1,
      sha: 'b'.repeat(40),
      facts: { kind: 'mysql' },
      database: { bytes: dump.length, sha256: sha256(dump) }
    })
  )
  const result = spawnSync(
    'python3',
    [
      join(scripts, 'lib', 'export-package.py'),
      dir,
      'joomla',
      'lantern',
      join(dir, 'point.json'),
      String(1024 * 1024)
    ],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const members = flat(unzip(readFileSync(join(dir, 'package.zip'))))
  assert.match(members['README.md'].bytes.toString(), /Unpack `webroot\.tar` into the document root/)
  assert.match(members['README.md'].bytes.toString(), /configuration\.php/)
  assert.match(members['README.md'].bytes.toString(), /absolute URLs/)
  // This configuration states no $live_site: the README says which address is the old one.
  assert.match(members['README.md'].bytes.toString(), /it starts with\s+`https:\/\/lantern\.`/)
  assert.match(members['README.md'].bytes.toString(), /It is not your own domain/)
  assert.match(members['webroot.tar'].bytes.toString('utf8'), /tracy-placeholder/)
  // A Joomla package installs itself too; this configuration states no $live_site, so the
  // installer is told no old address and asks for one.
  const installer = members['installer.php'].bytes.toString()
  assert.match(installer, /define\('TRACY_INSTALLER_PLATFORM', 'joomla'\);/)
  assert.match(installer, /define\('TRACY_INSTALLER_OLD_ADDRESS', ''\);/)
  assert.doesNotMatch(installer, /TRACY_INSTALLER_KEY/, 'no install key')
  assert.match(
    members.SHA256SUMS.bytes.toString(),
    new RegExp(`^${sha256(members['installer.php'].bytes)}  \\.\\./installer\\.php$`, 'm')
  )
  const restoredRoot = join(dir, 'restored-webroot')
  mkdirSync(restoredRoot)
  const packagedWebroot = join(dir, 'packaged-webroot.tar')
  writeFileSync(packagedWebroot, members['webroot.tar'].bytes)
  const extracted = spawnSync('tar', ['-xf', packagedWebroot, '-C', restoredRoot], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  assert.equal(
    readFileSync(join(restoredRoot, 'configuration.php'), 'utf8').includes('tracy-placeholder'),
    true
  )
  assert.equal(existsSync(join(restoredRoot, 'webroot', 'configuration.php')), false)
})

test('export-package: Joomla leaves out the tracyaccess plugin and Claude Cowork, files and folders, and counts them', () => {
  const dir = mkdtempSync(join(scratch, 'joomla-sign-in-'))
  const dump = gzipSync(Buffer.from('database dump'))
  writeFileSync(join(dir, 'db.sql.gz'), dump)
  // The sign-in plugin and the Claude Cowork component and plugins as `pkg_claudecowork` installs
  // them, beside look-alike folders and the package manifest, which stay.
  const entries = {
    'configuration.php': JOOMLA_CONFIG,
    'plugins/system/tracyaccess/': null,
    'plugins/system/tracyaccess/services/': null,
    'plugins/system/tracyaccess/tracyaccess.xml': '<extension/>',
    'plugins/system/tracyaccess/services/provider.php': '<?php // provider',
    'plugins/system/tracyaccess/src/Extension/TracyAccess.php': '<?php // HTTP_X_TRACY_EMAIL',
    'plugins/system/tracyaccessory/keep.php': '<?php // kept',
    'plugins/system/claudecoworkapi/claudecoworkapi.xml': '<extension/>',
    'plugins/system/claudecoworkupdate/claudecoworkupdate.xml': '<extension/>',
    'components/com_claudecowork/': null,
    'components/com_claudecowork/src/Controller/ApiController.php': '<?php // Bearer token',
    'administrator/components/com_claudecowork/lib/auth.php': '<?php // token',
    'administrator/components/com_claudecoworkshop/keep.php': '<?php // kept',
    'administrator/manifests/packages/pkg_claudecowork.xml': '<extension/>'
  }
  const archive = spawnSync(
    'python3',
    [
      '-c',
      `import io, json, sys, tarfile
t = tarfile.open(sys.argv[1], "w")
for name, text in json.loads(sys.argv[2]).items():
    i = tarfile.TarInfo(name.rstrip("/"))
    if text is None:
        i.type = tarfile.DIRTYPE
        t.addfile(i)
    else:
        d = text.encode(); i.size = len(d); t.addfile(i, io.BytesIO(d))
t.close()`,
      join(dir, 'archive.tar'),
      JSON.stringify(entries)
    ],
    { encoding: 'utf8' }
  )
  assert.equal(archive.status, 0, archive.stderr)
  writeFileSync(
    join(dir, 'point.json'),
    JSON.stringify({
      version: 5,
      sha: 'b'.repeat(40),
      facts: { kind: 'mysql' },
      database: { bytes: dump.length, sha256: sha256(dump) }
    })
  )
  const result = spawnSync(
    'python3',
    [join(scripts, 'lib', 'export-package.py'), dir, 'joomla', 'lantern', join(dir, 'point.json'), '1048576'],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  const scope = JSON.parse(result.stdout.trim().split('\n').at(-1)).scope
  assert.equal(scope.tracySignInFilesLeftOut, 3)
  assert.equal(scope.claudeCoworkFilesLeftOut, 4)
  const members = flat(unzip(readFileSync(join(dir, 'package.zip'))))
  const names = Object.keys(untar(members['webroot.tar'].bytes)).sort()
  assert.deepEqual(names, [
    'administrator/components/com_claudecoworkshop/keep.php',
    'administrator/manifests/packages/pkg_claudecowork.xml',
    'configuration.php',
    'plugins/system/tracyaccessory/keep.php'
  ])
  assert.equal(JSON.parse(members['manifest.json'].bytes).scope.tracySignInFilesLeftOut, 3)
  assert.equal(JSON.parse(members['manifest.json'].bytes).scope.claudeCoworkFilesLeftOut, 4)
  // The dump is not rewritten: its row for the plugin stays, and the README says what that means.
  assert.deepEqual(members['db.sql.gz'].bytes, dump)
  const readme = members['README.md'].bytes.toString()
  assert.match(readme, /## Signing in on the new host/)
  assert.match(readme, /`plugins\/system\/tracyaccess\/`\.\nOn another host it would let anyone sign in\./)
  assert.match(readme, /`php cli\/joomla\.php user:reset-password`/)
  assert.match(readme, /`plg_system_tracyaccess` under \*\*System > Manage >\s+Extensions\*\*/)
  assert.match(readme, /## The Claude Cowork connection/)
  assert.match(
    readme,
    /`plugins\/system\/claudecoworkupdate\/`\), so nobody can use that key on the new host/
  )
})

test('export-package: the old address ignores PHP comments and look-alikes inside strings, keeps // inside strings, and the first live define wins', () => {
  const read = (platform, text) =>
    spawnSync(
      'python3',
      [
        '-I',
        '-c',
        'import importlib.util,json,sys\ns=importlib.util.spec_from_file_location("p",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps(m.old_address(sys.argv[2],sys.stdin.read())))',
        join(scripts, 'lib', 'export-package.py'),
        platform
      ],
      { input: text, encoding: 'utf8' }
    )
  const cases = [
    // a line comment after the live define
    [
      'wordpress',
      "<?php\ndefine('WP_HOME', 'https://real.tracy.site');\n// define('WP_HOME', 'https://old.example');\n",
      'https://real.tracy.site'
    ],
    // every comment shape around the WP_SITEURL fallback
    [
      'wordpress',
      "<?php\n// define('WP_HOME', 'https://a.example');\n# define('WP_HOME', 'https://b.example');\n/* define('WP_HOME', 'https://c.example'); */\ndefine('WP_SITEURL', 'https://real.tracy.site'); // trailing\n# define('WP_SITEURL', 'https://d.example');\n",
      'https://real.tracy.site'
    ],
    ['wordpress', "<?php\n/*\ndefine('WP_SITEURL', 'https://old.example');\n*/\n", null],
    // PHP keeps the first of two live defines
    [
      'wordpress',
      "<?php\ndefine('WP_HOME', 'https://first.tracy.site');\ndefine('WP_HOME', 'https://second.example');\n",
      'https://first.tracy.site'
    ],
    // a string holding comment markers is not a comment
    [
      'wordpress',
      "<?php\n$note = 'see # and /* here';\ndefine('WP_HOME', 'https://real.tracy.site');\n",
      'https://real.tracy.site'
    ],
    // text that looks like a define inside a string, on the same line or spanning lines
    [
      'wordpress',
      "<?php\n$example = \"define('WP_HOME', 'https://example.invalid');\";\ndefine('WP_HOME', 'https://real.tracy.site');\n",
      'https://real.tracy.site'
    ],
    [
      'wordpress',
      "<?php\n$example = '\ndefine(\"WP_HOME\", \"https://example.invalid\");\n';\ndefine('WP_SITEURL', 'https://real.tracy.site');\n",
      'https://real.tracy.site'
    ],
    ['wordpress', "<?php\n$x = 1; define('WP_HOME', 'https://not-a-statement-start.example');\n", null],
    [
      'joomla',
      "<?php\nclass JConfig {\n\tpublic $help = '\n\tpublic $live_site = \"https://example.invalid\";\n';\n\tpublic $live_site = 'https://real.tracy.site';\n}\n",
      'https://real.tracy.site'
    ],
    ['joomla', "<?php\nclass JConfig {\n\t/*\n\tpublic $live_site = 'https://old.example';\n\t*/\n}\n", null],
    [
      'joomla',
      "<?php\nclass JConfig {\n\t// public $live_site = 'https://old.example';\n\tpublic $live_site = 'https://real.tracy.site';\n}\n",
      'https://real.tracy.site'
    ]
  ]
  for (const [platform, text, expected] of cases) {
    const r = read(platform, text)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(JSON.parse(r.stdout), expected, text)
  }
})

// No container is ever needed: any `docker` call fails loudly instead of reaching a daemon.
const noDocker = mkdtempSync(join(scratch, 'no-docker-'))
writeFileSync(
  join(noDocker, 'docker'),
  '#!/bin/sh\necho "docker must not be called by an export" >&2\nexit 97\n'
)
chmodSync(join(noDocker, 'docker'), 0o755)

/** A local stand-in for the presigned PUT URL: keeps each body, answers `status`. */
async function store(status = 200, onPut = () => ({})) {
  const bodies = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      bodies.push({ method: req.method, url: req.url, body: Buffer.concat(chunks), ...onPut() })
      res.writeHead(status)
      res.end()
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/tracy-artifacts/backup-exports/s/e.zip?X-Amz-Expires=900&${SIGNATURE}`
  return { url, bodies, close: () => new Promise((r) => server.close(r)) }
}

const DUMP = gzipSync(Buffer.from('CREATE TABLE wp_posts (id int);\nINSERT INTO wp_posts VALUES (1);\n'))

function wordpressStack() {
  const srv = mkdtempSync(join(scratch, 'srv-'))
  const priv = join(srv, LABEL)
  const webroot = join(priv, '.webroot')
  const tmp = join(srv, 'tmp')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'uploads'), { recursive: true })
  mkdirSync(tmp)
  writeFileSync(join(webroot, 'wp-config.php'), WP_CONFIG)
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  writeFileSync(join(webroot, 'wp-content', 'uploads', 'photo.jpg'), 'jpeg bytes\n')
  symlinkSync('/etc/passwd', join(webroot, 'wp-content', 'uploads', 'link-out'))
  // Tracy's sign-in as provision copies it in, beside a must-use plugin of the customer's own.
  mkdirSync(join(webroot, 'wp-content', 'mu-plugins'))
  writeFileSync(
    join(webroot, 'wp-content', 'mu-plugins', 'tracy-access.php'),
    readFileSync(join(scripts, 'provision', 'access', 'wordpress', 'tracy-access.php'))
  )
  writeFileSync(join(webroot, 'wp-content', 'mu-plugins', 'customer-own.php'), '<?php // kept\n')
  // The Claude Cowork plugin provision installs, beside a look-alike plugin of the customer's own.
  mkdirSync(join(webroot, 'wp-content', 'plugins', 'claude-cowork', 'lib'), { recursive: true })
  writeFileSync(
    join(webroot, 'wp-content', 'plugins', 'claude-cowork', 'claude-cowork.php'),
    '<?php // token\n'
  )
  writeFileSync(
    join(webroot, 'wp-content', 'plugins', 'claude-cowork', 'lib', 'api.php'),
    '<?php // Bearer\n'
  )
  mkdirSync(join(webroot, 'wp-content', 'plugins', 'claude-cowork-notes'))
  writeFileSync(join(webroot, 'wp-content', 'plugins', 'claude-cowork-notes', 'notes.php'), '<?php // kept\n')
  writeFileSync(join(priv, '.env'), 'PLATFORM=wordpress\nDB_PASSWORD=t\n')
  const env = (extra = {}) => ({
    ...process.env,
    PATH: pathWithFlock(`${noDocker}:${process.env.PATH}`),
    TMPDIR: tmp,
    TRACY_SRV: srv,
    TRACY_SITES_ROOT: srv,
    TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...extra
  })
  const git = (...args) =>
    execFileSync('git', ['--git-dir', join(priv, 'webroot-baseline.git'), '--work-tree', webroot, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
    })
  const ensured = spawnSync('bash', [GIT, '--label', LABEL, '--op', 'ensure'], {
    env: env(),
    encoding: 'utf8'
  })
  assert.equal(ensured.status, 0, ensured.stderr)
  /** Tag v2 the way `create` does — dump file + `Tracy-Database:` trailer — without a database server. */
  const point = (version = 2, dump = DUMP) => {
    mkdirSync(join(priv, 'backups'), { recursive: true, mode: 0o700 })
    writeFileSync(join(priv, 'backups', `v${version}.mysql.gz`), dump, { mode: 0o600 })
    const message = join(srv, `msg-${version}`)
    writeFileSync(
      message,
      `Before the redesign\n\nTracy-Database: sha256:${sha256(dump)} size:${dump.length} kind:mysql tables:2\n`
    )
    git('tag', '-a', `tracy-release/v${version}`, '-F', message)
    return git('rev-parse', `tracy-release/v${version}^{commit}`).trim()
  }
  /** `--op export`, asynchronously: the store is served from this same process. */
  const exportPoint = (version, url, extra = {}) =>
    new Promise((resolve) => {
      const args = [BACKUP, '--label', LABEL, '--op', 'export', '--version', String(version)]
      if (extra.maxBytes) args.push('--max-bytes', String(extra.maxBytes))
      if (extra.includeLarge) args.push('--include-large')
      const child = spawn('bash', args, {
        env: env(url === undefined ? {} : { TRACY_EXPORT_UPLOAD_URL: url })
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => (stderr += d))
      child.on('close', (status) => {
        let answer = null
        try {
          answer = JSON.parse(stdout.trim().split('\n').at(-1))
        } catch {}
        resolve({ status, answer, stdout, stderr })
      })
    })
  return { srv, priv, webroot, tmp, git, point, exportPoint }
}

/** Work folders an export left behind, in the private dir or the temp dir. */
const leftovers = (s) => [
  ...readdirSync(s.tmp),
  ...readdirSync(s.priv).filter((name) => name.startsWith('.export'))
]

/** Whether `file` can be locked right now (flock(2), not waiting) — what another job would get. */
const lockFree = (file) =>
  spawnSync('python3', [
    '-I',
    '-c',
    'import fcntl,os,sys\nfd=os.open(sys.argv[1], os.O_RDWR|os.O_CREAT)\nfcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)',
    file
  ]).status === 0

/** The members of a zip, through Python's own reader: name → {bytes, stored}. */
function unzip(buf) {
  const dir = mkdtempSync(join(scratch, 'zip-'))
  writeFileSync(join(dir, 'p.zip'), buf)
  const listing = execFileSync(
    'python3',
    [
      '-I',
      '-c',
      `import json, sys, zipfile, base64
z = zipfile.ZipFile(sys.argv[1])
print(json.dumps({i.filename: {"stored": i.compress_type == zipfile.ZIP_STORED, "size": i.file_size,
 "b64": base64.b64encode(z.read(i)).decode() if i.file_size < 8 * 1024 * 1024 else None} for i in z.infolist()}))`,
      join(dir, 'p.zip')
    ],
    { encoding: 'utf8', maxBuffer: 64 << 20 }
  )
  return Object.fromEntries(
    Object.entries(JSON.parse(listing)).map(([k, v]) => [
      k,
      { stored: v.stored, size: v.size, bytes: v.b64 === null ? null : Buffer.from(v.b64, 'base64') }
    ])
  )
}

/** The payload folder of a WordPress or Joomla package: `tracy-package-<32 hex>`. */
function payloadOf(members) {
  const folders = [
    ...new Set(
      Object.keys(members)
        .filter((k) => k.includes('/'))
        .map((k) => k.split('/')[0])
    )
  ]
  assert.equal(folders.length, 1, `one payload folder, got ${folders}`)
  assert.match(folders[0], /^tracy-package-[0-9a-f]{32}$/)
  return folders[0]
}

/** A package's members with the payload folder's files under their own names (its index.html as
 * `payload/index.html`), so an assertion reads `members['webroot.tar']` whichever folder it is in. */
function flat(members) {
  const payload = payloadOf(members)
  const out = {}
  for (const [name, entry] of Object.entries(members)) {
    if (!name.startsWith(`${payload}/`)) out[name] = entry
  }
  for (const [name, entry] of Object.entries(members)) {
    if (!name.startsWith(`${payload}/`)) continue
    const base = name.slice(payload.length + 1)
    out[base in out ? `payload/${base}` : base] = entry
  }
  return out
}

function tarInZipEntries(zipBytes, member) {
  const dir = mkdtempSync(join(scratch, 'zip-tar-list-'))
  const path = join(dir, 'p.zip')
  writeFileSync(path, zipBytes)
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-I',
        '-c',
        'import io,json,sys,tarfile,zipfile; z=zipfile.ZipFile(sys.argv[1]); n=[i for i in z.namelist() if i==sys.argv[2] or i.endswith("/"+sys.argv[2])][0]; t=tarfile.open(fileobj=io.BytesIO(z.read(n))); print(json.dumps({m.name:m.size for m in t.getmembers()}))',
        path,
        member
      ],
      { encoding: 'utf8' }
    )
  )
}

/** The entries of a tar: name → {type, text}. */
function untar(buf) {
  const dir = mkdtempSync(join(scratch, 'tar-'))
  writeFileSync(join(dir, 'w.tar'), buf)
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-I',
        '-c',
        `import json, sys, tarfile
t = tarfile.open(sys.argv[1])
out = {}
for m in t.getmembers():
    out[m.name] = {"type": "file" if m.isfile() else "dir" if m.isdir() else "other",
                   "text": t.extractfile(m).read().decode("utf-8", "replace") if m.isfile() else None}
print(json.dumps(out))`,
        join(dir, 'w.tar')
      ],
      { encoding: 'utf8', maxBuffer: 64 << 20 }
    )
  )
}

test('export: a full WordPress point becomes one zip, uploaded once, with the config placeholders, the dump as it was, and sums that hold', async () => {
  const s = wordpressStack()
  const commit = s.point(2)
  // Decision 6: the upload runs with both locks let go, so a slow network holds up no other job.
  const put = await store(200, () => ({
    heavyFree: lockFree(join(s.srv, 'heavy.lock')),
    siteFree: lockFree(join(s.priv, 'webroot-baseline.git', 'tracy-webroot.lock'))
  }))
  try {
    const r = await s.exportPoint(2, put.url)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.answer.ok, true, r.stdout + r.stderr)
    assert.equal(put.bodies.length, 1, 'one upload')
    assert.equal(put.bodies[0].method, 'PUT')
    assert.deepEqual(
      [put.bodies[0].heavyFree, put.bodies[0].siteFree],
      [true, true],
      'no lock held while uploading'
    )
    const zip = put.bodies[0].body
    assert.deepEqual(
      { version: r.answer.version, commit: r.answer.commit, bytes: r.answer.bytes, sha256: r.answer.sha256 },
      { version: 2, commit, bytes: zip.length, sha256: sha256(zip) }
    )
    assert.deepEqual(r.answer.configChanged, ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'])
    assert.equal(r.answer.scope.largeFilesExcludedOver, 52428800)

    const raw = unzip(zip)
    const payload = payloadOf(raw)
    assert.deepEqual(
      Object.keys(raw).sort(),
      [
        'README.md',
        'index.html',
        'installer.php',
        ...[
          '.htaccess',
          'SHA256SUMS',
          'db.sql.gz',
          'index.html',
          'manifest.json',
          'tracy_setting.json',
          'webroot.tar'
        ].map((name) => `${payload}/${name}`)
      ].sort()
    )
    const members = flat(raw)
    assert.equal(members['webroot.tar'].stored, true, 'the big members are stored, not deflated again')
    assert.equal(members['db.sql.gz'].stored, true)
    assert.deepEqual(members['db.sql.gz'].bytes, DUMP, 'the dump byte for byte')

    const tar = untar(members['webroot.tar'].bytes)
    assert.equal(tar['wp-config.php'].type, 'file')
    assert.doesNotMatch(tar['wp-config.php'].text, /s3cret-on-the-host|wp_user|db:3306/)
    assert.match(tar['wp-config.php'].text, /define\( 'AUTH_KEY', 'keep-this-salt' \);/)
    assert.match(tar['wp-config.php'].text, /\$table_prefix = 'wp_tc_';/)
    assert.equal(tar['wp-content/uploads/photo.jpg'].text, 'jpeg bytes\n')
    assert.match(members['README.md'].bytes.toString(), /Unpack `webroot\.tar` into the document root/)
    assert.equal(
      tar['wp-config.php'].type,
      'file',
      'README extraction places configuration at the document root'
    )
    const restoredRoot = join(s.srv, 'restored-webroot')
    mkdirSync(restoredRoot)
    const packagedWebroot = join(s.srv, 'packaged-webroot.tar')
    writeFileSync(packagedWebroot, members['webroot.tar'].bytes)
    const extracted = spawnSync('tar', ['-xf', packagedWebroot, '-C', restoredRoot], { encoding: 'utf8' })
    assert.equal(extracted.status, 0, extracted.stderr)
    assert.equal(existsSync(join(restoredRoot, 'wp-config.php')), true)
    assert.equal(existsSync(join(restoredRoot, 'wp-content', 'uploads', 'photo.jpg')), true)
    assert.equal(existsSync(join(restoredRoot, 'webroot', 'wp-config.php')), false)
    assert.equal(
      tar['wp-content/uploads/link-out'],
      undefined,
      'files and folders only: the link is left out'
    )
    assert.ok(Object.values(tar).every((e) => e.type !== 'other'))
    // Tracy's sign-in is in the history (git keeps it) and never in the package: on another host
    // nothing strips `x-tracy-email`, so it would sign in anyone who sends it.
    assert.match(
      s.git('ls-tree', '-r', '--name-only', 'tracy-release/v2'),
      /^wp-content\/mu-plugins\/tracy-access\.php$/m
    )
    assert.equal(tar['wp-content/mu-plugins/tracy-access.php'], undefined)
    assert.ok(Object.keys(tar).every((name) => !/tracy-access/.test(name)))
    assert.equal(tar['wp-content/mu-plugins/customer-own.php'].text, '<?php // kept\n')
    // Claude Cowork's key opens the site to whoever holds it: its plugin stays behind too.
    assert.ok(Object.keys(tar).every((name) => !name.startsWith('wp-content/plugins/claude-cowork/')))
    assert.equal(tar['wp-content/plugins/claude-cowork-notes/notes.php'].text, '<?php // kept\n')

    const setting = JSON.parse(members['tracy_setting.json'].bytes.toString())
    assert.deepEqual(setting, {
      schemaVersion: 'tracy-setting/v1',
      platform: 'wordpress',
      label: LABEL,
      version: 'v2',
      install: {
        webroot: { file: 'webroot.tar', sha256: sha256(members['webroot.tar'].bytes) },
        database: { file: 'db.sql.gz', sha256: sha256(DUMP) }
      }
    })
    const manifest = JSON.parse(members['manifest.json'].bytes.toString())
    assert.equal(manifest.formatVersion, 1)
    assert.equal(manifest.backup.version, 2)
    assert.equal(manifest.backup.title, 'Before the redesign')
    assert.equal(manifest.backup.commit, commit)
    assert.equal(typeof manifest.backup.at, 'number')
    assert.equal(manifest.engine, 'mariadb')
    assert.equal(manifest.scope.largeFilesExcludedOver, 52428800)
    assert.equal(manifest.scope.linksLeftOut, 1)
    assert.equal(manifest.scope.tracySignInFilesLeftOut, 1)
    assert.equal(manifest.scope.claudeCoworkFilesLeftOut, 2)
    assert.deepEqual(manifest.configChanged, {
      file: 'wp-config.php',
      fields: ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
    })
    // The old address is the one the package itself is set to, and the constants that pin it are
    // named: a database-only search-replace leaves the moved site redirecting to Tracy.
    const readme = members['README.md'].bytes.toString()
    assert.match(readme, /set to `https:\/\/site-under-test\.tracy\.site`/)
    assert.match(
      readme,
      /`wp search-replace 'https:\/\/site-under-test\.tracy\.site' 'https:\/\/www\.example\.com' --all-tables`/
    )
    assert.match(readme, /Set `WP_HOME` and `WP_SITEURL` to the new address/)
    assert.doesNotMatch(readme, /old\.example|OLD_ADDRESS/)
    assert.match(readme, /If the site stays on Tracy, you do not need to\s+do anything/)
    assert.match(readme, /phpMyAdmin/)
    assert.match(
      readme,
      /This package is a copy of the site\. Files over 50 MB and symbolic links are not included; `manifest\.json` gives\s+the size limit and says how many links were left out\./
    )
    assert.doesNotMatch(readme, /full backup/)
    assert.match(
      readme,
      /Install it into an empty folder and an empty database\. The package holds the site as it is on\s+Tracy/
    )
    assert.match(
      readme,
      /changes made to another copy of the site \(for example your original site after it was\s+imported into Tracy: new orders, comments, sign-ups, posts\) are not in it\. Putting the package in\s+place of that site replaces its files and database and loses those changes\./
    )
    assert.match(readme, /Only if your own domain points at the site on Tracy now/)
    assert.match(members['README.md'].bytes.toString(), /personal information/)
    assert.match(readme, /## Signing in on the new host/)
    assert.match(
      readme,
      /`wp-content\/mu-plugins\/tracy-access\.php`\.\nOn another host it would let anyone sign in\./
    )
    assert.match(readme, /`wp user update you@example\.com --user_pass='a new password'`/)
    assert.match(readme, /## The Claude Cowork connection/)
    assert.match(readme, /leaves\s+out its folder `wp-content\/plugins\/claude-cowork\/`/)

    // SHA256SUMS sits in the payload folder and is checked from there: the root files as `../`.
    const sums = members.SHA256SUMS.bytes.toString().trim().split('\n').sort()
    assert.deepEqual(
      sums,
      [
        ...['README.md', 'index.html', 'installer.php'].map(
          (name) => `${sha256(raw[name].bytes)}  ../${name}`
        ),
        ...['.htaccess', 'db.sql.gz', 'index.html', 'manifest.json', 'tracy_setting.json', 'webroot.tar'].map(
          (name) => `${sha256(raw[`${payload}/${name}`].bytes)}  ${name}`
        )
      ].sort()
    )
    const unpacked = join(s.srv, 'unpacked-package')
    mkdirSync(unpacked)
    for (const [name, entry] of Object.entries(raw)) {
      mkdirSync(join(unpacked, dirname(name)), { recursive: true })
      writeFileSync(join(unpacked, name), entry.bytes)
    }
    const checked = spawnSync(
      'python3',
      [
        '-I',
        '-c',
        `import hashlib,sys,os
os.chdir(sys.argv[1])
for line in open("SHA256SUMS"):
    want, name = line.rstrip("\\n").split("  ", 1)
    assert hashlib.sha256(open(name, "rb").read()).hexdigest() == want, name
print("sums hold")`,
        join(unpacked, payload)
      ],
      { encoding: 'utf8' }
    )
    assert.equal(checked.stdout.trim(), 'sums hold', checked.stderr)

    // No install key anywhere: the installer's own age and the browser that began it guard a run.
    const installer = members['installer.php'].bytes.toString()
    assert.doesNotMatch(installer, /TRACY_INSTALLER_KEY/)
    assert.ok(!Object.keys(raw).some((name) => /KEY/i.test(name)), 'no key file')
    assert.match(installer, /define\('TRACY_INSTALLER_PLATFORM', 'wordpress'\);/)
    assert.match(
      installer,
      /define\('TRACY_INSTALLER_OLD_ADDRESS', 'https:\/\/site-under-test\.tracy\.site'\);/
    )
    assert.doesNotMatch(installer, /__TRACY_[A-Z_]+__'/, 'every value filled in')
    assert.ok(
      !members['README.md'].bytes.toString().includes(payload),
      'the README does not name the payload folder'
    )
    assert.match(members['payload/index.html'].bytes.toString(), /<!doctype html>/)
    assert.match(members['.htaccess'].bytes.toString(), /Require all denied/)
    assert.deepEqual(manifest.installer, { file: 'installer.php', installCode: false })
    // The companions installer.php may delete are named by hash: README.md and index.html.
    const companions = JSON.parse(installer.match(/define\('TRACY_INSTALLER_COMPANIONS', '([^']*)'\);/)[1])
    assert.deepEqual(companions, {
      'README.md': sha256(raw['README.md'].bytes),
      'index.html': sha256(raw['index.html'].bytes)
    })
    // The sizes the installer checks before it deletes the uploaded ZIP: those of the packed files.
    const sizes = JSON.parse(installer.match(/define\('TRACY_INSTALLER_PAYLOAD_SIZES', '([^']*)'\);/)[1])
    assert.deepEqual(sizes, {
      'db.sql.gz': members['db.sql.gz'].bytes.length,
      'webroot.tar': members['webroot.tar'].bytes.length
    })
    const lint = spawnSync('php', ['-l'], { input: installer, encoding: 'utf8' })
    if (!lint.error) assert.equal(lint.status, 0, lint.stdout + lint.stderr)

    // Installer steps first, the same move by hand below.
    assert.ok(readme.indexOf('## Install with the installer') < readme.indexOf('## Install by hand'))
    assert.match(readme, /open `installer\.php` at the site's new address/)
    assert.doesNotMatch(readme, /install key|INSTALL-KEY/i)
    assert.match(readme, /within three\s+hours\s+of\s+the\s+unpack/)
    assert.match(readme, /anyone who opens its address can use\s+it/)
    assert.match(readme, /the installer deletes\s+it from the web folder as soon as you open it/)
    assert.match(readme, /If you upload the ZIP itself, keep its\s+name as downloaded/)
    assert.match(readme, /open `installer\.php`\s+right after unpacking/)
    // The upload address is a secret for as long as it lives: never printed, never left behind.
    assert.doesNotMatch(r.stdout + r.stderr, /X-Amz-Signature|0123456789abcdef/)
    assert.deepEqual(leftovers(s), [], 'the work folder is gone')
  } finally {
    await put.close()
  }
})

test('export: a point whose dump no longer matches its tag is refused before anything is packed or sent', async () => {
  const s = wordpressStack()
  s.point(2)
  writeFileSync(join(s.priv, 'backups', 'v2.mysql.gz'), gzipSync(Buffer.from('tampered')))
  const put = await store()
  try {
    const r = await s.exportPoint(2, put.url)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual([r.answer.ok, r.answer.code], [false, 'BACKUP_NOT_FULL'])
    assert.equal(put.bodies.length, 0)
    const none = await s.exportPoint(9, put.url)
    assert.deepEqual([none.answer.ok, none.answer.code], [false, 'NO_SUCH_BACKUP'])
    assert.deepEqual(leftovers(s), [])
  } finally {
    await put.close()
  }
})

test('export with include-large: files over 50 MiB captured with the fresh backup are included and scope says so', async () => {
  const s = wordpressStack()
  s.point(2)
  const large = join(s.webroot, 'wp-content', 'uploads', 'large.bin')
  const fd = openSync(large, 'w')
  ftruncateSync(fd, 50 * 1024 * 1024 + 1)
  closeSync(fd)
  const snapshot = join(s.priv, 'backups', 'v2.large.tar.gz')
  const captured = spawnSync(
    'python3',
    [
      '-c',
      'import sys,tarfile; t=tarfile.open(sys.argv[1],"w:gz"); t.add(sys.argv[2],arcname="wp-content/uploads/large.bin",recursive=False); t.close()',
      snapshot,
      large
    ],
    { encoding: 'utf8' }
  )
  assert.equal(captured.status, 0, captured.stderr)
  const put = await store()
  try {
    const r = await s.exportPoint(2, put.url, { includeLarge: true })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.answer.ok, true, r.stdout + r.stderr)
    const members = flat(unzip(put.bodies[0].body))
    const manifest = JSON.parse(members['manifest.json'].bytes.toString())
    assert.equal(manifest.scope.largeFilesIncludedOver, 52428800)
    assert.equal(manifest.scope.largeFilesIncluded, 1)
    assert.equal(manifest.scope.largeFilesExcludedOver, null)
    const entries = tarInZipEntries(put.bodies[0].body, 'webroot.tar')
    assert.equal(entries['wp-content/uploads/large.bin'], 50 * 1024 * 1024 + 1)
    assert.match(members['README.md'].bytes.toString(), /serialization-aware/)
    // Large files are in this package: only the links are said to be left out.
    assert.match(
      members['README.md'].bytes.toString(),
      /This package is a copy of the site\. Symbolic links are not included; `manifest\.json` says how many were left out\./
    )
    assert.doesNotMatch(members['README.md'].bytes.toString(), /Files over 50 MB|full backup/)
  } finally {
    await put.close()
  }
})

test('export: a package over --max-bytes is not sent, and a store that refuses the upload is a failure', async () => {
  const s = wordpressStack()
  s.point(2)
  const put = await store()
  const refusing = await store(403)
  try {
    const big = await s.exportPoint(2, put.url, { maxBytes: 100 })
    assert.deepEqual([big.answer.ok, big.answer.code], [false, 'TOO_LARGE'])
    assert.equal(put.bodies.length, 0)
    const refused = await s.exportPoint(2, refusing.url)
    assert.deepEqual([refused.answer.ok, refused.answer.code], [false, 'UPLOAD_FAILED'])
    assert.doesNotMatch(refused.stdout + refused.stderr, /X-Amz-Signature|0123456789abcdef/)
    assert.deepEqual(leftovers(s), [])
  } finally {
    await put.close()
    await refusing.close()
  }
})

test('export: no upload address, no package — the address never rides the command line', async () => {
  const s = wordpressStack()
  s.point(2)
  const r = await s.exportPoint(2, undefined)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /TRACY_EXPORT_UPLOAD_URL/)
  assert.equal(existsSync(join(s.priv, 'backups', 'v2.mysql.gz')), true)
})
