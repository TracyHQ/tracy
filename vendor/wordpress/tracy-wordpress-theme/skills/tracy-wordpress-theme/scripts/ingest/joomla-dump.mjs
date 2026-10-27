#!/usr/bin/env node
// joomla-dump.mjs — a RUNNING Joomla site → the files from-joomla.mjs reads.
//
//   node scripts/ingest/joomla-dump.mjs --out <j6-dir> --compose <dir> [--service db] [--web-service joomla]
//   node scripts/ingest/joomla-dump.mjs --out <j6-dir> --container <name> [--web-container <name>]
//     [--db joomla] [--prefix tr_] [--user root] [--password …] [--site-url http://127.0.0.1:8216]
//     [--web-root /var/www/html]
//
// WHY. `from-joomla.mjs` takes a quickstart BUILD — a folder with inventory.json and
// render-routes.json — because that is what the Tracy Base port happened to have. A customer's
// live site has neither, so the contract road stopped at "dump the inventory" and every run
// invented its own dump. This is that step, written down once.
//
// WHERE THE VALUES COME FROM. Six tables, read through the site's own database, every column cast
// to CHAR: the inventory contract says every value is a string, and a column that arrives as a
// number once and a string the next time is a bug that only shows up on someone else's site.
//
// HOW IT SURVIVES ARTICLE HTML. Rows come back as one JSON object per line, built by the database
// itself (JSON_OBJECT). Article bodies carry newlines, tabs and quotes; a TSV dump loses them in
// ways that look like success. JSON escaping is the database's problem, not this script's.
//
// AUTHORS. #__users and #__user_profiles are read too, and only through an allowlist: the columns
// an author's byline needs (id, name, username, block) and the profile rows of the keys in
// USER_PROFILE_KEYS (the avatar). A password hash, an email, an OTP key or a token never leaves
// the database — not even into a file nobody means to commit.
//
// TAGS. #__tags and every row of #__contentitem_tag_map, through an allowlist too: an
// article's tags (posts[].tags) come from them. A site without them (the database answers that the
// table does not exist) has no `tags` key in the inventory — "not dumped", which the adapter tells
// apart from an empty table. A tag table that cannot be read, answers no column or lacks one the
// join needs, prints a line that is not a row, or has no partner stops the dump instead; so does a
// map row without a type_alias, whose component — article or not — cannot be told.
//
// EXTENSIONS. #__extensions is read whole for the census the coverage report counts, through an
// allowlist of identity and status columns (EXTENSION_COLUMNS) — never the params of every extension,
// which hold other components' configuration and credentials. The one exception is com_content:
// a category menu item set to "Use Global" inherits its options, so the params of the single
// `type = 'component', element = 'com_content'` row go into that row, as the database holds them (a
// JSON string). No such row, two of them, or params that are not a JSON object stop the dump: the
// adapter would otherwise have to guess what the site prints.
//
// GLOBAL CONFIGURATION. The site name (and the other public settings of SITE_CONFIG_FIELDS) is not
// in the database: Joomla keeps it in configuration.php, on the web server. With --web-service
// (compose) or --web-container, the site's own PHP loads <web-root>/configuration.php and prints the
// allow-listed fields only; the dump checks the answer again against the same list — a field outside
// it stops the dump, naming the field and never its value — and writes site-config.json (every value
// a string). A password, a secret, a database or SMTP credential, a path or a key is never printed,
// so it never reaches a file. Without a web target no site-config.json is written, dump.json says so,
// and from-joomla.mjs reports the site name as not dumped.
//
// FAILURES. Every statement is bounded (JOOMLA_DUMP_TIMEOUT_MS, default 120 s; 256 MB of output). A
// failed, timed-out or overflowing statement stops the dump with a message that never carries the
// password. Nothing is written until every table has been read and checked; each file is then
// written beside its name and renamed into place.
//
// CAPTURE. With `--capture` (needs --site-url and a web target) it also builds `<out>/capture/`: the template
// directories of the site's styles, `t3-assets`, `media/t4` and T4's shipped Google font list
// (`plugins/system/t4/admin/etc/googlefonts`, read by the Phase 2 source-font check), read out of the web container as one tar stream
// (regular files and directories only, bounded), the `@import`s of the compiled sheets that the copy lacks, and
// for every route what the running site answers (status, Location, the stylesheets linked in document order —
// render-routes.json). The routes are requested twice without cookies or redirects; the first pass warms the
// pages so T3's per-page CSS exists. See joomla-capture.mjs. A capture already in --out is never overwritten.
//
// READ-ONLY. It runs SELECT and SHOW COLUMNS, and reads configuration.php through `php -r`. With --capture it
// also reads the template files (`tar -cf -`) and requests the site's pages. It never writes to the site, and it
// never touches a table outside these twelve.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generationRecord, bumpEpoch, PUBLISHING_MARKER } from './joomla-generation.mjs'
import { CAPTURE_LIMITS, crawlRoutes, followImports, readTar, writeEntries } from './joomla-capture.mjs'

/** The tables the adapter reads — the same list as scripts/lib/joomla-inventory.mjs. */
const TABLES = ['content', 'content_frontpage', 'categories', 'menu', 'modules', 'modules_menu', 'template_styles']
/**
 * The tables read through an allowlist of columns (nothing else), each left out of the inventory
 * when the site has no such table: the author tables, and the two an article's tags come from
 * (joomla-inventory.mjs articleTags), the map read whole (see WHERE).
 */
const AUTHOR_COLUMNS = {
  users: ['id', 'name', 'username', 'block'],
  user_profiles: ['user_id', 'profile_key', 'profile_value', 'ordering'],
  // com_contact: what a contact page prints (the public address, phone, e-mail_to, links in params).
  contact_details: ['id', 'name', 'alias', 'con_position', 'address', 'suburb', 'state', 'postcode', 'country', 'telephone', 'mobile', 'fax', 'email_to', 'image', 'misc', 'webpage', 'params', 'published', 'catid', 'language', 'ordering'],
  tags: ['id', 'parent_id', 'lft', 'level', 'path', 'title', 'alias', 'published'],
  contentitem_tag_map: ['type_alias', 'content_item_id', 'tag_id']
}
// #__contentitem_tag_map is read whole, with no WHERE on type_alias: a filter in SQL would drop a
// row whose type_alias is NULL or empty before anything could see it, and that row may be an
// article's tag. The adapter picks the article rows (joomla-inventory.mjs articleTags).
const WHERE = {
  user_profiles: () => ` WHERE profile_key IN (${USER_PROFILE_KEYS.map((k) => `'${k}'`).join(', ')})`
}
// The avatar, and what an author's page prints beside it: job title, about me, social links. No other profile key (a phone, an address) is read.
const USER_PROFILE_KEYS = ['profile.user_avatar', 'profile.user_jobtitle', 'profile.aboutme', 'profile.user_social']
/** The #__extensions columns of the census: identity and status, nothing an extension configures. */
const EXTENSION_COLUMNS = ['extension_id', 'name', 'type', 'element', 'folder', 'client_id', 'enabled']
/** The census columns a row cannot do without (the adapter's extension key). */
const EXTENSION_REQUIRED = ['extension_id', 'type', 'element']
/** The public configuration.php fields — the same list as scripts/lib/joomla-inventory.mjs SITE_CONFIG_FIELDS. */
const SITE_CONFIG_FIELDS = ['sitename', 'MetaDesc', 'MetaKeys', 'MetaAuthor', 'language', 'offline', 'sef', 'sef_rewrite', 'sef_suffix', 'offset', 'list_limit', 'feed_limit']
/**
 * Run inside the web container as `php -r <code> -- <configuration.php> <fields as JSON>`: load the
 * file, print one JSON object of the listed fields that JConfig has. The field list is an argument,
 * not part of the code, so the code names no field at all.
 */
const SITE_CONFIG_PHP = [
  'ini_set("display_errors", "stderr"); $f = $argv[1]; $want = json_decode($argv[2], true);',
  'if (!is_file($f) || !is_readable($f)) { exit(4); }',
  'require $f;',
  'if (!class_exists("JConfig")) { exit(5); }',
  '$c = new JConfig(); $o = new stdClass();',
  'foreach ($want as $k) { if (property_exists($c, $k)) { $o->$k = $c->$k; } }',
  'echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), "\n";'
].join(' ')
/** The exit statuses readSiteConfig tells apart: SITE_CONFIG_PHP's own, and the container runtime's. */
const SITE_CONFIG_EXIT = {
  4: 'configuration.php is not a readable file there (exit 4)',
  5: 'configuration.php defines no class JConfig (exit 5)',
  125: 'the container runtime refused the exec — no such container or service, or it is not running (exit 125)',
  126: 'php could not be invoked in the container (exit 126)',
  127: 'php is not installed in the container (exit 127)'
}
/** How long one statement may take, and how much it may print. */
const TIMEOUT_MS = Number(process.env.JOOMLA_DUMP_TIMEOUT_MS) > 0 ? Number(process.env.JOOMLA_DUMP_TIMEOUT_MS) : 120000
const MAX_BUFFER = 256 * 1024 * 1024

const args = process.argv.slice(2)
// Every argument is one of these, with its value: an unknown flag or a missing value stops the run before it reads
// or writes anything (a typo must not become a default). The capture flags may not repeat; the older ones keep the
// reading they always had — the first of a repeated flag wins — which callers rely on to override a default.
const VALUE_FLAGS = ['--out', '--compose', '--container', '--service', '--web-service', '--web-container', '--db', '--prefix', '--user', '--password', '--site-url', '--web-root', '--capture-timeout-ms']
const BOOLEAN_FLAGS = ['--capture']
{
  const seen = new Set()
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const fail = (why) => {
      console.error(`joomla-dump: ${why}`)
      process.exit(2)
    }
    if (!VALUE_FLAGS.includes(a) && !BOOLEAN_FLAGS.includes(a)) fail(`${JSON.stringify(a.length > 40 ? `${a.slice(0, 40)}…` : a)} is not an argument of this command`)
    if (seen.has(a) && ['--capture', '--capture-timeout-ms'].includes(a)) fail(`${a} is given twice`)
    seen.add(a)
    if (VALUE_FLAGS.includes(a)) {
      if (i + 1 >= args.length || [...VALUE_FLAGS, ...BOOLEAN_FLAGS].includes(args[i + 1])) fail(`${a} needs a value`)
      i++
    }
  }
}
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const capture = args.includes('--capture')
const out = flag('--out')
const compose = flag('--compose')
const container = flag('--container')
const service = flag('--service', 'db')
const database = flag('--db', 'joomla')
const prefix = flag('--prefix')
const user = flag('--user', 'root')
let password = flag('--password')
const siteUrl = flag('--site-url')
const webService = flag('--web-service')
const webContainer = flag('--web-container')
const webRoot = flag('--web-root', '/var/www/html')

const captureTimeoutMs = flag('--capture-timeout-ms') === null ? CAPTURE_LIMITS.requestTimeoutMs : Number(flag('--capture-timeout-ms'))
if (!Number.isInteger(captureTimeoutMs) || captureTimeoutMs < 100 || captureTimeoutMs > 600000) {
  console.error(`--capture-timeout-ms ${JSON.stringify(flag('--capture-timeout-ms'))}: expected a whole number of milliseconds between 100 and 600000`)
  process.exit(2)
}
if (capture) {
  let u = null
  try {
    u = new URL(siteUrl ?? '')
  } catch {}
  if (!u || !/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) {
    console.error('--capture needs --site-url http(s)://host[:port][/base] with no credentials, query or fragment: the routes are requested there')
    process.exit(2)
  }
  if (!webService && !webContainer) {
    console.error('--capture needs --web-service or --web-container: the template files are read out of the web container')
    process.exit(2)
  }
}
if (!out || (!compose && !container)) {
  console.error('usage: joomla-dump.mjs --out <j6-dir> (--compose <dir> | --container <name>) [--db joomla] [--prefix tr_] [--web-service <name> | --web-container <name>] [--web-root /var/www/html]')
  process.exit(2)
}
if (webService && !compose) {
  console.error('--web-service names a service of --compose; with --container, name the web server with --web-container')
  process.exit(2)
}
if (webService && webContainer) {
  console.error('--web-service and --web-container both name the web server; give one')
  process.exit(2)
}
if (!/^\/[^\0\n]*$/.test(webRoot ?? '')) {
  console.error(`--web-root ${JSON.stringify(webRoot)}: expected an absolute path inside the web container (the directory of configuration.php)`)
  process.exit(2)
}

// The prefix and the database name go into statements as identifiers: only the characters Joomla
// and MariaDB names use, checked before anything runs.
if (prefix !== null && !/^[A-Za-z0-9_]+$/.test(prefix)) {
  console.error(`--prefix ${JSON.stringify(prefix)}: expected letters, digits and _ only (a Joomla table prefix such as tr_)`)
  process.exit(2)
}
if (!/^[A-Za-z0-9_$-]+$/.test(database ?? '')) {
  console.error(`--db ${JSON.stringify(database)}: expected letters, digits, _, $ and - only`)
  process.exit(2)
}

// A compose project keeps its password in .env next to the file; asking the caller to retype a
// secret they already have on disk is how secrets end up in shell history.
if (!password && compose && existsSync(join(compose, '.env'))) {
  password = readFileSync(join(compose, '.env'), 'utf8').match(/^MARIADB_ROOT_PASSWORD=(.*)$/m)?.[1]?.trim() ?? null
}
if (!password) {
  console.error('no --password, and none found in the compose .env (MARIADB_ROOT_PASSWORD)')
  process.exit(2)
}

/**
 * A message with the password taken out: the client's argv (`-p<password>`) is in every exec error.
 * A bare occurrence goes too, unless the password is so short that it is part of ordinary words.
 */
const redact = (text) => {
  const out = String(text ?? '').split(`-p${password}`).join('-p***')
  return password.length >= 4 ? out.split(password).join('***') : out
}
/** Stop the dump: one line on stderr, no password, nothing written. */
function die(message) {
  console.error(redact(`joomla-dump: ${message}`))
  process.exit(1)
}
process.on('uncaughtException', (e) => die(e?.message ?? e))

/**
 * One writer per output directory: `.joomla-dump.lock` is created exclusively before anything is staged and removed when
 * the process ends. A lock left by a run that was killed is never taken over: it is named, and the directory it guarded
 * is checked by from-joomla against the generation recorded in dump.json.
 */
let lockPath = null
function acquireLock() {
  if (lockPath) return
  mkdirSync(out, { recursive: true })
  const at = join(out, '.joomla-dump.lock')
  try {
    writeFileSync(at, `${process.pid}\n`, { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') die(`cannot take the dump lock ${at}: ${e.message}`)
    let holder = ''
    try {
      holder = readFileSync(at, 'utf8').trim().slice(0, 20)
    } catch {}
    die(`another dump holds ${at}${holder ? ` (pid ${holder})` : ''}; wait for it, or if that run was killed check ${out} and remove the lock. Nothing was written`)
  }
  lockPath = at
  process.on('exit', () => rmSync(at, { force: true }))
}

/** `docker` argv that runs `command` in a compose service, or in a named container. */
const inside = (svc, name, command) => (svc ? ['compose', '--project-directory', compose, 'exec', '-T', svc, ...command] : ['exec', '-i', name, ...command])

/** Run one statement through the site's own mariadb client, inside its container. */
function sql(statement, { raw = true } = {}) {
  const client = ['mariadb', `-u${user}`, `-p${password}`, database, '--batch', '--skip-column-names']
  if (raw) client.push('--raw')
  client.push('-e', statement)
  const head = `${statement.trim().split(/\s+/)[0]} … ${/FROM `[^`]+`/.exec(statement)?.[0] ?? statement.slice(0, 60)}`
  return run(inside(compose ? service : null, container, client), head)
}

/**
 * Run `docker argv`, bounded; a failure stops the dump (see sql) or throws for the caller to tell
 * apart. `whole` returns the output as printed, with no warning line dropped (the php answer is
 * checked whole).
 */
function run(argv, head, { whole = false, binary = false } = {}) {
  const cmd = 'docker'
  let result
  try {
    result = execFileSync(cmd, argv, { encoding: binary ? 'buffer' : 'utf8', maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DOCKER_HOST: '' } })
  } catch (e) {
    if (e.code === 'ETIMEDOUT') die(`${head}: no answer within ${TIMEOUT_MS} ms`)
    if (e.code === 'ENOBUFS') die(`${head}: more than ${MAX_BUFFER} bytes of output`)
    if (e.code === 'ENOENT') die(`${cmd} is not on PATH`)
    // The caller tells a missing table (ERROR 1146) from a failure; the message goes without the password.
    const err = new Error(redact(`${e.stderr ?? ''}`.trim().split('\n').slice(-1)[0] || `${head}: ${e.message}`))
    err.stderr = redact(e.stderr)
    err.status = e.status
    throw err
  }
  if (whole || binary) return result
  // The client prints a password warning to stdout in some builds; drop anything before the data.
  return result
    .split('\n')
    .filter((line) => !/^mysql: \[Warning\]|^Warning:/.test(line))
    .join('\n')
}

/** `tr_` if the caller did not say — read from the site rather than guessed. */
function detectPrefix() {
  if (prefix) return prefix
  const tables = sql(`SHOW TABLES`, { raw: false }).split('\n').filter(Boolean)
  const content = tables.find((t) => /(^|_)content$/.test(t))
  if (!content) {
    console.error(`no *_content table in database "${database}" — is this a Joomla database?`)
    process.exit(1)
  }
  const found = content.replace(/content$/, '')
  if (!/^[A-Za-z0-9_]*$/.test(found)) die(`the prefix read from ${content} (${JSON.stringify(found)}) is not one this dump can put in a statement; pass --prefix`)
  return found
}

const pfx = detectPrefix()
console.log(`table prefix: ${pfx}`)

const inventory = {}
for (const table of TABLES) {
  const name = `${pfx}${table}`
  const discovered = table === 'content_frontpage' ? columnsOf(name) : null
  const columns = discovered
    ? [...discovered]
    : table === 'content_frontpage'
      ? []
      : sql(`SHOW COLUMNS FROM \`${name}\``, { raw: false })
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')[0])
  if (columns.length === 0) {
    console.log(`  ${table}: (no table, or the featured ordering could not be read)`)
    inventory[table] = []
    continue
  }
  if (table === 'content_frontpage' && !['content_id', 'ordering'].every((column) => columns.includes(column))) {
    console.log(`  ${table}: (missing content_id or ordering)`)
    inventory[table] = []
    continue
  }
  // CAST every column to CHAR: the inventory contract is "every value is a string", and
  // joomla-inventory.mjs compares ids as strings throughout.
  const selected = table === 'content_frontpage' ? ['content_id', 'ordering'] : columns
  const pairs = selected.map((c) => `'${c}', CAST(\`${c}\` AS CHAR)`).join(', ')
  const rows = sql(`SELECT JSON_OBJECT(${pairs}) FROM \`${name}\``)
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line))
  inventory[table] = rows
  console.log(`  ${table}: ${rows.length} row(s)`)
}

/**
 * The columns of `name`, or null when the database says the table does not exist (ERROR 1146). Any
 * other failure — the client, the container, a permission — stops the dump, naming the table: a
 * table that could not be read is not a table the site does not have.
 */
function columnsOf(name) {
  try {
    return new Set(
      sql(`SHOW COLUMNS FROM \`${name}\``, { raw: false })
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t')[0])
    )
  } catch (e) {
    const said = `${e.stderr ?? ''}${e.stdout ?? ''}${e.message ?? ''}`
    if (/\b1146\b|doesn't exist/.test(said)) return null
    console.error(`joomla-dump: SHOW COLUMNS FROM ${name} failed: ${said.trim().split('\n').slice(-1)[0]}`)
    process.exit(1)
  }
}

/** The two tag tables are read together or not at all (joomla-inventory.mjs articleTags). */
const TAG_TABLES = ['tags', 'contentitem_tag_map']
/** Tables whose every printed line must be a row (rowsOf). */
const STRICT_TABLES = [...TAG_TABLES, 'extensions']

/**
 * The rows of `SELECT JSON_OBJECT(…)`. For a tag table every line the client prints must be one
 * JSON object: a line that is not stops the dump, naming the table, since a row dropped here would
 * read as a tag the site does not have. The other tables keep the lenient read they had.
 */
function rowsOf(table, name, statement) {
  const lines = sql(statement).split('\n').filter((line) => line.trim() !== '')
  if (!STRICT_TABLES.includes(table)) return lines.filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line))
  return lines.map((line) => {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      row = undefined
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      console.error(`joomla-dump: ${name} answered a line that is not a row: ${JSON.stringify(line.slice(0, 200))}`)
      process.exit(1)
    }
    return row
  })
}

for (const [table, wanted] of Object.entries(AUTHOR_COLUMNS)) {
  const name = `${pfx}${table}`
  const found = columnsOf(name)
  const have = found ?? new Set()
  const columns = wanted.filter((c) => have.has(c))
  if (found && TAG_TABLES.includes(table)) {
    // A tag table is absent only when the database says so (columnsOf → null). One that answers
    // with no columns, or without a column the join needs, is a schema this dump does not know:
    // it stops here rather than leave the table out, which would read as "the site has no tags".
    const lacking = wanted.filter((c) => !have.has(c) && c !== 'level' && c !== 'path')
    if (lacking.length) {
      console.error(`joomla-dump: ${name} has no column ${lacking.join(', ')}${have.size ? '' : ' (SHOW COLUMNS answered no column at all)'} — not a Joomla tag table this dump can read`)
      process.exit(1)
    }
  }
  if (!columns.length) {
    // No table: the adapter notes that posts carry the user id only. Not an empty list, which
    // would say "the site has no users".
    console.log(`  ${table}: (no table)`)
    continue
  }
  const pairs = columns.map((c) => `'${c}', CAST(\`${c}\` AS CHAR)`).join(', ')
  const where = WHERE[table]?.() ?? ''
  inventory[table] = rowsOf(table, name, `SELECT JSON_OBJECT(${pairs}) FROM \`${name}\`${where}`)
  if (table === 'contentitem_tag_map') {
    const blank = inventory[table].filter((r) => typeof r.type_alias !== 'string' || !r.type_alias.trim())
    if (blank.length) {
      console.error(`joomla-dump: ${name} has ${blank.length} row(s) without a type_alias (first: ${JSON.stringify(blank[0])}) — whose tag each is cannot be told`)
      process.exit(1)
    }
  }
  console.log(`  ${table}: ${inventory[table].length} row(s) (${columns.join(', ')})`)
}

if (TAG_TABLES.filter((t) => Array.isArray(inventory[t])).length === 1) {
  console.error(`joomla-dump: ${pfx}${TAG_TABLES.find((t) => !inventory[t])} does not exist while ${pfx}${TAG_TABLES.find((t) => inventory[t])} does — the article tags cannot be read`)
  process.exit(1)
}

// ── extensions: the census, and the com_content options ─────────────────────
{
  const name = `${pfx}extensions`
  const have = columnsOf(name)
  if (!have) die(`${name} does not exist — a Joomla database has an extensions table, and the global com_content options a category menu item inherits live there`)
  const lacking = [...EXTENSION_REQUIRED, 'params'].filter((c) => !have.has(c))
  if (lacking.length) die(`${name} has no column ${lacking.join(', ')} — not a Joomla extensions table this dump can read`)
  const pairs = (cols) => cols.map((c) => `'${c}', CAST(\`${c}\` AS CHAR)`).join(', ')
  const census = rowsOf('extensions', name, `SELECT JSON_OBJECT(${pairs(EXTENSION_COLUMNS.filter((c) => have.has(c)))}) FROM \`${name}\``)
  const seen = new Set()
  for (const row of census) {
    const blank = EXTENSION_REQUIRED.filter((c) => typeof row[c] !== 'string' || !row[c].trim())
    if (blank.length) die(`${name} answered a row without ${blank.join(', ')} (extension_id ${/^\d+$/.test(String(row.extension_id ?? '')) ? row.extension_id : 'not a number'}; its values are not printed)`)
    if (seen.has(row.extension_id)) die(`${name} answered extension_id ${row.extension_id} twice`)
    seen.add(row.extension_id)
  }
  const isContent = (r) => r.type === 'component' && r.element === 'com_content'
  const found = rowsOf('extensions', name, `SELECT JSON_OBJECT(${pairs(['extension_id', 'type', 'element', 'params'])}) FROM \`${name}\` WHERE element = 'com_content'`).filter(isContent)
  const listed = census.filter(isContent)
  if (found.length !== 1 || listed.length !== 1)
    die(`${name} holds ${found.length} com_content component row(s) (census: ${listed.length}); the global com_content options come from exactly one — which one applies cannot be told`)
  const [content] = found
  if (content.extension_id !== listed[0].extension_id) die(`${name}: the com_content row changed between two reads (extension_id ${listed[0].extension_id}, then ${content.extension_id}); dump again`)
  // The column is named with what it is, never with its value: the options may hold a key or a
  // password an extension keeps there.
  let params
  let kind = null
  if (content.params === null || content.params === undefined) kind = 'NULL'
  else if (typeof content.params !== 'string') kind = `not text (${typeof content.params})`
  else {
    try {
      params = JSON.parse(content.params)
      if (!params || typeof params !== 'object') kind = `JSON ${params === null ? 'null' : typeof params}`
      else if (Array.isArray(params)) kind = 'a JSON list'
    } catch {
      kind = 'not JSON'
    }
  }
  if (kind) die(`${name}: com_content (extension_id ${content.extension_id}) params is not a JSON object: the column is ${kind}; its value is not printed`)
  listed[0].params = content.params
  inventory.extensions = census
  console.log(`  extensions: ${census.length} row(s) (${EXTENSION_COLUMNS.filter((c) => have.has(c)).join(', ')}; params: com_content #${content.extension_id} only)`)
}

// ── configuration.php: the public global settings (SITE_CONFIG_FIELDS) ──────
/**
 * `{ fields, from }` read from the web server, or null when no web target was given. Every key the
 * answer holds must be on SITE_CONFIG_FIELDS and every value a scalar; anything else stops the dump,
 * naming the key and not its value.
 */
function readSiteConfig() {
  const svc = webService ?? null
  if (!svc && !webContainer) return null
  const file = `${webRoot.replace(/\/+$/, '')}/configuration.php`
  const where = `${svc ? `service ${svc}` : `container ${webContainer}`}:${file}`
  let text
  try {
    text = run(inside(svc, webContainer, ['php', '-r', SITE_CONFIG_PHP, '--', file, JSON.stringify(SITE_CONFIG_FIELDS)]), `php … ${file}`, { whole: true })
  } catch (e) {
    // What failed is told by the exit status alone, never by what was printed: configuration.php is
    // php that runs, so any text on stderr (a parse error, a warning, its own output) may quote a
    // credential, whatever words it also holds.
    die(`${where}: the global configuration could not be read: ${SITE_CONFIG_EXIT[e.status] ?? `php failed (exit ${e.status ?? 'unknown'})`}; its message is not printed, as it may quote configuration.php`)
  }
  // Exactly one line holding one JSON object — SITE_CONFIG_PHP prints nothing else. Any other
  // output (a warning, a second object) is refused whole, never read around.
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  let answer
  if (!body.includes('\n')) {
    try {
      answer = JSON.parse(body)
    } catch {
      answer = undefined
    }
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    die(`${where}: php did not print one JSON object of configuration fields on exactly one line (${body.includes('\n') ? `${body.split('\n').length} lines` : body.trim() ? 'one line that is not a JSON object' : 'nothing'}); its output is not printed and nothing is written`)
  const outside = Object.keys(answer).filter((k) => !SITE_CONFIG_FIELDS.includes(k))
  if (outside.length) die(`${where}: the answer holds field(s) outside the public allow-list (${outside.join(', ')}); nothing is written`)
  const fields = {}
  for (const k of SITE_CONFIG_FIELDS) {
    if (!Object.hasOwn(answer, k) || answer[k] === null) continue
    const v = answer[k]
    if (typeof v === 'boolean') fields[k] = v ? '1' : '0'
    else if (typeof v === 'string' || typeof v === 'number') fields[k] = String(v)
    else die(`${where}: configuration field ${k} is ${Array.isArray(v) ? 'a list' : typeof v}, not a scalar`)
  }
  return { fields, from: where }
}
const siteConfig = readSiteConfig()
if (siteConfig) console.log(`  configuration.php: ${Object.keys(siteConfig.fields).join(', ') || '(no listed field)'}`)
else console.log('⚠ no --web-service/--web-container: configuration.php (site name, public settings) is not dumped; site-config.json is not written')

/**
 * The routes a visitor can reach: published site menu items that point at a component.
 *
 * `from-joomla.mjs` treats this list as "what counts as a page". A heading has no destination and
 * an alias points at another item, so neither is a route of its own — including them would invent
 * pages the site does not serve.
 */
const routes = []
for (const item of inventory.menu) {
  if (String(item.client_id) !== '0') continue
  if (String(item.published) !== '1') continue
  if (item.type !== 'component') continue
  const path = `/${String(item.path ?? '').replace(/^\/+/, '')}`
  routes.push({ id: String(item.id), path: path === '/home' ? '/' : path })
}

// ── capture/: the template files and what the running site answers ──────────
/**
 * The capture, built in a temporary directory inside --out and returned as `{ dir, summary }`; a failure removes
 * the directory and stops the dump before any file is published. Order: the routes are requested first (T3 compiles
 * its per-page CSS on the first hit), then the files are read out of the container, then the `@import`s the copy
 * lacks are fetched from the site.
 */
async function buildCapture() {
  const base = new URL(siteUrl)
  const tmpDir = join(out, `.capture-${process.pid}.tmp`)
  let made = false // only a directory this run created is removed: what already sits at the name is not ours
  const cleanup = () => made && rmSync(tmpDir, { recursive: true, force: true })
  try {
    const answered = await crawlRoutes(routes, base, { timeoutMs: captureTimeoutMs })
    routes.splice(0, routes.length, ...answered)
    const templates = [...new Set(inventory.template_styles.filter((s) => String(s.client_id) === '0').map((s) => String(s.template ?? '')))]
    const bad = templates.find((t) => !/^[A-Za-z0-9_.-]+$/.test(t) || /^\.+$/.test(t))
    if (bad !== undefined) die(`a template style names the template ${JSON.stringify(bad)}, which is not a plain directory name; refusing to copy it`)
    const roots = [...templates.map((t) => `templates/${t}`), 't3-assets', 'media/t4', 'plugins/system/t4/admin/etc/googlefonts']
    const svc = webService ?? null
    const web = webRoot.replace(/\/+$/, '')
    // Only directories that are there and are not links (a link may point out of the web root).
    const present = run(inside(svc, webContainer, ['sh', '-c', 'cd "$1" || exit 4; shift; for d in "$@"; do if [ -d "$d" ] && [ ! -L "$d" ]; then echo "$d"; fi; done', 'sh', web, ...roots]), 'ls … web root')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    const unknown = present.filter((x) => !roots.includes(x))
    if (unknown.length) die(`the web container listed a directory that was not asked for: ${JSON.stringify(unknown[0])}`)
    if (!present.some((x) => x.startsWith('templates/'))) die(`no templates/<name> directory of the styles' templates (${templates.join(', ') || 'none'}) is in ${web} of the web container`)
    const tar = run(inside(svc, webContainer, ['tar', '-C', web, '-cf', '-', ...present]), 'tar … web root', { binary: true })
    const entries = readTar(tar)
    const outside = entries.find((e) => !present.some((r) => e.path === r || e.path.startsWith(`${r}/`)))
    if (outside) die(`the tar stream holds ${JSON.stringify(outside.path.slice(0, 120))}, outside what was asked for`)
    // The staging root is created here, exclusively: a link or a directory already at the name (it is predictable) is refused, never written through.
    acquireLock()
    mkdirSync(tmpDir)
    made = true
    writeEntries(entries, tmpDir)
    // The @imports of the compiled sheets that the copy does not hold.
    const readCaptured = (rel) => {
      const f = join(tmpDir, ...rel.split('/'))
      try {
        return lstatSync(f).isFile() ? readFileSync(f, 'utf8') : null
      } catch {
        return null
      }
    }
    const compiled = entries.filter((e) => !e.dir && /^(?:t3-assets\/css|media\/t4\/css)\/[^/]+\.css$/i.test(e.path)).map((e) => ({ rel: e.path, text: e.data.toString('utf8') }))
    const imports = await followImports(compiled, base, {
      has: readCaptured,
      store: (rel, text) => writeEntries([{ path: rel, dir: false, data: Buffer.from(text) }], tmpDir),
      timeoutMs: captureTimeoutMs
    })
    return {
      dir: tmpDir,
      summary: {
        siteUrl: base.href,
        passes: 2,
        routes: routes.length,
        withStylesheets: routes.filter((r) => Array.isArray(r.stylesheets)).length,
        answersOtherThan200: routes.filter((r) => r.status).length,
        directories: present,
        files: entries.filter((e) => !e.dir).length,
        bytes: entries.reduce((n, e) => n + (e.data?.length ?? 0), 0),
        importsFetched: imports.fetched,
        gaps: imports.gaps
      }
    }
  } catch (e) {
    cleanup()
    die(`capture failed: ${e.message}`)
  }
}

const captured = capture ? await buildCapture() : null

/** Files staged beside their names: `[{ file, tmp }]`. Nothing is put in place until every one is written. */
const staged = []
function stage(file, text) {
  const tmp = `${file}.${process.pid}.tmp`
  try {
    // Something that is not a plain file at the name (a directory, a link) cannot be replaced by a rename: refuse now, not half way.
    const at = lstatSync(file, { throwIfNoEntry: false })
    if (at && !at.isFile()) throw new Error('it exists and is not a regular file')
    writeFileSync(tmp, text, { flag: 'wx' })
    staged.push({ file, tmp })
  } catch (e) {
    for (const s of staged) if (s.tmp) rmSync(s.tmp, { force: true })
    rmSync(tmp, { force: true })
    if (captured) rmSync(captured.dir, { recursive: true, force: true })
    die(`cannot write ${file}: ${e.message}; nothing of this dump was put in place`)
  }
}

acquireLock()
const texts = {
  'inventory.json': `${JSON.stringify(inventory, null, 2)}\n`,
  'render-routes.json': `${JSON.stringify(routes, null, 2)}\n`
}
if (siteConfig) texts['site-config.json'] = `${JSON.stringify(siteConfig.fields, null, 2)}\n`
for (const [name, text] of Object.entries(texts)) stage(join(out, name), text)
// A site-config.json of an earlier dump is not part of this generation: it is moved aside with the rest and removed once all are in place.
if (!siteConfig && lstatSync(join(out, 'site-config.json'), { throwIfNoEntry: false })) staged.push({ file: join(out, 'site-config.json'), tmp: null })
// dump.json goes last: it is the record that the dump is complete, and names the generation (the hash of each file and of capture/)
// that from-joomla checks the directory against.
let generation
try {
  generation = generationRecord(texts, randomUUID(), { captureDir: captured?.dir ?? null })
} catch (e) {
  for (const s of staged) if (s.tmp) rmSync(s.tmp, { force: true })
  if (captured) rmSync(captured.dir, { recursive: true, force: true })
  die(`cannot record the generation: ${e.message}; nothing of this dump was put in place`)
}
stage(
  join(out, 'dump.json'),
  `${JSON.stringify(
    {
      dumpedAt: new Date().toISOString(),
      generation,
      database,
      prefix: pfx,
      source: compose ? { compose, service } : { container },
      siteUrl: siteUrl ?? null,
      counts: Object.fromEntries(Object.entries(inventory).map(([t, rows]) => [t, rows.length])),
      contentParams: { from: `${pfx}extensions`, extensionId: inventory.extensions.find((r) => r.params !== undefined).extension_id },
      siteConfig: siteConfig ? { from: siteConfig.from, fields: Object.keys(siteConfig.fields) } : null,
      capture: captured?.summary ?? null,
      routes: routes.length
    },
    null,
    2
  )}\n`
)

// Every file is written; now put them in place: the JSON files in order, then capture/, dump.json last (it names the
// generation, so until it is in place the directory is not a complete new dump). capture/ always follows the run: a
// capture/ of an earlier dump is moved aside with the files and removed once all are in place, whether or not this run
// captures — after it, capture/ is there exactly when dump.json's generation says so. A failure before the first rename
// leaves the directory as it was.
const dropStaged = () => staged.forEach((x) => x.tmp && rmSync(x.tmp, { force: true }))
const captureAt = join(out, 'capture')
let capturePlaced = false
let captureHandled = false
// Each target is moved aside before its new file takes its name; a failure at any step puts every file back
// the way it was (and removes capture/), so the directory is either the whole new dump or the whole old one.
const undo = [] // { file, bak } — bak: the earlier file or directory moved aside, or null when there was none
const marker = join(out, PUBLISHING_MARKER)
// A marker already there is a writer that died half way: it is never removed before the replacement is written, and a failed run leaves it — the directory is still that interrupted dump.
const markerWasThere = Boolean(lstatSync(marker, { throwIfNoEntry: false }))
const rollback = () => {
  const stuck = []
  for (const { file, bak } of undo.reverse()) {
    try {
      rmSync(file, { recursive: true, force: true })
      if (bak) renameSync(bak, file)
    } catch (e) {
      stuck.push(`${file}: ${e.message}`)
    }
  }
  dropStaged()
  // A capture/ this run placed is removed, and the earlier one put back, by its undo entry above.
  if (!capturePlaced && captured) rmSync(captured.dir, { recursive: true, force: true })
  // The marker stays when something could not be put back: the directory is then not a dump anyone may read.
  if (!stuck.length && !markerWasThere) rmSync(marker, { force: true })
  return stuck
}
// A marker of a writer that died is stale (this run holds the lock): the directory is rewritten whole below. While a marker
// exists from-joomla refuses the directory: dump.json is moved aside during the swap and would otherwise read as an old dump.
// The epoch changes before the first file moves, so a reader that overlapped the attempt — even one that rolls back — refuses its own read.
try {
  if (markerWasThere && !lstatSync(marker).isFile()) throw new Error('not a regular file')
  writeFileSync(marker, `${process.pid}\n`, { flag: markerWasThere ? 'w' : 'wx' })
  bumpEpoch(out)
} catch (e) {
  const stuck = rollback()
  die(`cannot write ${marker} or the epoch: ${e.message}; nothing of this dump was put in place${stuck.length ? ' (unexpected: ' + stuck.join('; ') + ')' : ''}`)
}
// JOOMLA_DUMP_FAIL_RENAME_AFTER=N makes the rename after N successful ones fail (a test seam for the rollback).
const failAfter = /^\d+$/.test(process.env.JOOMLA_DUMP_FAIL_RENAME_AFTER ?? '') ? Number(process.env.JOOMLA_DUMP_FAIL_RENAME_AFTER) : null
const killAfter = /^\d+$/.test(process.env.JOOMLA_DUMP_KILL_AFTER ?? '') ? Number(process.env.JOOMLA_DUMP_KILL_AFTER) : null
const failed = (what, e) => {
  const stuck = rollback()
  die(`${what}: ${e.message}; ${stuck.length ? `the earlier files could not all be restored (${stuck.join('; ')}) — the dump directory is incomplete, run it again` : 'the earlier dump is as it was and nothing of this dump was put in place'}`)
}
for (const { file, tmp } of staged) {
  if (!captureHandled && file === join(out, 'dump.json')) {
    captureHandled = true
    try {
      const had = lstatSync(captureAt, { throwIfNoEntry: false })
      const bak = `${captureAt}.${process.pid}.bak`
      if (had) {
        if (!captured) console.log(`⚠ an earlier capture/ belongs to the earlier dump, not to this one: it is removed (run with --capture to make a new one)`)
        renameSync(captureAt, bak)
      }
      undo.push({ file: captureAt, bak: had ? bak : null })
      if (captured) {
        renameSync(captured.dir, captureAt)
        capturePlaced = true
      }
    } catch (e) {
      if (captured) rmSync(captured.dir, { recursive: true, force: true })
      failed('cannot put capture/ in place', e)
    }
  }
  const bak = `${file}.${process.pid}.bak`
  try {
    // JOOMLA_DUMP_KILL_AFTER=N ends the process (SIGKILL: no rollback, no lock release) after N renames — a test seam for an interrupted publication.
    if (killAfter !== null && undo.length >= killAfter) process.kill(process.pid, 'SIGKILL')
    if (failAfter !== null && undo.length >= failAfter) throw new Error('rename refused (JOOMLA_DUMP_FAIL_RENAME_AFTER)')
    const had = lstatSync(file, { throwIfNoEntry: false })
    if (had) renameSync(file, bak)
    undo.push({ file, bak: had ? bak : null })
    if (tmp) renameSync(tmp, file)
  } catch (e) {
    failed(`cannot write ${file}`, e)
  }
}
for (const { bak } of undo) if (bak) rmSync(bak, { recursive: true, force: true })
rmSync(marker, { force: true })

console.log(`\njoomla-dump: ${routes.length} route → ${out}`)
if (captured) console.log(`capture/: ${captured.summary.files} file(s) from ${captured.summary.directories.join(', ')}; ${captured.summary.withStylesheets}/${routes.length} route(s) with their stylesheets${captured.summary.gaps.length ? `; ${captured.summary.gaps.length} import(s) not fetched (dump.json capture.gaps)` : ''}`)
else {
  console.log('⚠ `capture/` is missing: without it, from-joomla uses heuristics for the ACM schema,')
  console.log('  and the palette/layout taken from the template CSS is skipped. Run again with --capture --site-url <url> (see references/inputs/from-joomla.md).')
}
console.log(`next    : node scripts/ingest/from-joomla.mjs ${out} --out <spec-dir>${siteUrl ? ` --site-url ${siteUrl}` : ''}`)
