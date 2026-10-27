// joomla-dump.mjs: the #__extensions census, the global com_content options and the public
// configuration.php fields, end to end through a fake `docker` (fixtures/issue41/fake-docker.mjs) into
// from-joomla.mjs — no side file, no override.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { loadSiteConfig } from '../ingest/from-joomla.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { SITE_CONFIG_FIELDS } from '../lib/joomla-inventory.mjs'
import { resolveRecordPath } from '../lib/record-paths.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
const JOOMLA_MIN = join(here, 'fixtures', 'joomla-min')
const FAKE_DOCKER = join(here, 'fixtures', 'issue41', 'fake-docker.mjs')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const PASSWORD = 'S3cret-dump-pw'

// Scratch goes under TRACY_TEST_SCRATCH when it is set (TMPDIR is left as it is), else the OS temp dir.
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
function tmp(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

/** The fixture's com_content options, as the params column holds them. */
const CONTENT_PARAMS = JSON.stringify({ show_category_title: '0', show_description: '1', maxLevel: '2' })
const extensionRows = () => [
  { extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', params: CONTENT_PARAMS, manifest_cache: '{"version":"6.0"}' },
  { extension_id: '120', name: 'mod_menu', type: 'module', element: 'mod_menu', folder: '', client_id: '0', enabled: '1', params: '{"api_key":"do-not-export"}', manifest_cache: '{}' },
  { extension_id: '301', name: 'plg_system_cache', type: 'plugin', element: 'cache', folder: 'system', client_id: '0', enabled: '0', params: '{"smtp_password":"do-not-export"}', manifest_cache: '{}' }
]

/**
 * Run joomla-dump.mjs against a fake database: the joomla-min tables under `jm_` with the blog menu
 * item (254) inheriting every archive option, plus #__extensions. `edit` changes the database first.
 */
function dump({ edit = (db) => db, args = [], env = {} } = {}) {
  // `args` go first: the dump reads the first of a flag given twice
  const dir = tmp('jd-')
  const inv = readJson(join(JOOMLA_MIN, 'inventory.json'))
  inv.menu.find((m) => m.id === '254').params = '{}'
  let db = Object.fromEntries(Object.entries(inv).map(([t, rows]) => [`jm_${t}`, rows]))
  db.jm_extensions = extensionRows()
  db = edit(db)
  const dbPath = join(dir, 'db.json')
  writeFileSync(dbPath, JSON.stringify(db))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_DOCKER)} "$@"\n`, { mode: 0o755 })
  const j6 = join(dir, 'j6')
  const r = spawnSync(process.execPath, [join(SKILL, 'scripts', 'ingest', 'joomla-dump.mjs'), ...args, '--out', j6, '--container', 'fake-joomla-db', '--password', PASSWORD, '--prefix', 'jm_'], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_JOOMLA_DB: dbPath, ...env }
  })
  const sql = existsSync(`${dbPath}.sql`) ? readFileSync(`${dbPath}.sql`, 'utf8') : ''
  const php = existsSync(`${dbPath}.php`) ? readFileSync(`${dbPath}.php`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  return { dir, j6, status: r.status, stdout: r.stdout, stderr: r.stderr, sql, php }
}
const refused = (d, re, label) => {
  assert.equal(d.status, 1, `${label}: exited ${d.status}\n${d.stderr}${d.stdout}`)
  assert.match(d.stderr, re, label)
  assert.doesNotMatch(`${d.stderr}${d.stdout}`, new RegExp(PASSWORD), `${label}: the password is not printed`)
  assert.equal(existsSync(d.j6) && readdirSync(d.j6).length > 0, false, `${label}: nothing is written`)
}

test('joomla-dump: a fresh dump carries the whole #__extensions census and com_content\'s params only, and from-joomla reads them with no side file', () => {
  const d = dump({ edit: (db) => { db.jm_content_frontpage = [{ content_id: '3', ordering: '7', featured_up: '2026-01-01 00:00:00' }]; return db } })
  assert.equal(d.status, 0, `${d.stderr}${d.stdout}`)
  const inv = readJson(join(d.j6, 'inventory.json'))
  assert.deepEqual(inv.content_frontpage, [{ content_id: '3', ordering: '7' }], 'featured membership carries only content_id and ordering')
  assert.deepEqual(inv.extensions.map((r) => r.extension_id), ['19', '120', '301'], 'every row: the census is complete')
  assert.deepEqual(Object.keys(inv.extensions[1]).sort(), ['client_id', 'element', 'enabled', 'extension_id', 'folder', 'name', 'type'], 'identity and status columns only')
  assert.equal(inv.extensions[0].params, CONTENT_PARAMS, 'com_content params as the column holds them (a string)')
  const text = readFileSync(join(d.j6, 'inventory.json'), 'utf8')
  assert.doesNotMatch(text, /do-not-export|manifest_cache/, 'no other extension\'s configuration leaves the database')
  assert.doesNotMatch(d.sql, /CAST\(`params` AS CHAR\)\) FROM `jm_extensions`$/m, 'params are never selected without the com_content filter')
  assert.match(d.sql, /FROM `jm_extensions` WHERE element = 'com_content'/)
  const meta = readJson(join(d.j6, 'dump.json'))
  assert.equal(meta.counts.extensions, 3)
  assert.deepEqual(meta.contentParams, { from: 'jm_extensions', extensionId: '19' })
  assert.equal(existsSync(join(d.j6, 'content-params.json')), false, 'no side file')
  assert.deepEqual(readdirSync(d.j6).sort(), ['.joomla-dump.epoch', 'dump.json', 'inventory.json', 'render-routes.json'], 'no temporary file is left')

  cpSync(join(JOOMLA_MIN, 'capture'), join(d.j6, 'capture'), { recursive: true })
  // a capture/ put beside a dump that recorded none is not that generation: the record goes, as a dump made before it
  { const dj = readJson(join(d.j6, 'dump.json')); delete dj.generation; writeFileSync(join(d.j6, 'dump.json'), JSON.stringify(dj)) }
  const out = join(tmp('jd-spec-'), 'pack')
  const result = buildSpecPack({ j6Dir: d.j6, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const blog = readJson(join(out, 'content.json')).archives.find((a) => a.path === '/resources/blog')
  assert.deepEqual([blog.display.showTitle, blog.display.showDescription, blog.display.maxLevel], [false, true, 2])
  assert.deepEqual(blog.display.from, { showTitle: 'global', showDescription: 'global', maxLevel: 'global' })
  assert.match(result.contentParamsFrom, /\(extensions, com_content extension_id 19\)$/)
  // the census reaches the coverage report: one extension entry per #__extensions row
  const coverage = readJson(join(out, 'adapter-coverage.json'))
  assert.deepEqual(coverage.items.filter((i) => i.kind === 'extension' && i.source.from === '#__extensions').map((i) => i.id).sort(), ['extension:120', 'extension:19', 'extension:301'])
})

test('joomla-dump: a missing frontpage table or ordering column keeps the dump usable without featured ordering', () => {
  const cases = [
    ['missing table', (db) => { delete db.jm_content_frontpage; return db }],
    ['missing ordering column', (db) => { db.jm_content_frontpage = [{ content_id: '3' }]; return db }]
  ]
  for (const [label, edit] of cases) {
    const result = dump({ edit })
    assert.equal(result.status, 0, `${label}: ${result.stderr}${result.stdout}`)
    assert.deepEqual(readJson(join(result.j6, 'inventory.json')).content_frontpage, [], label)
    assert.match(result.stdout, /content_frontpage: \(no table, or the featured ordering could not be read\)|content_frontpage: \(missing content_id or ordering\)/)
  }
})

test('joomla-dump: no, two or an unreadable com_content row, and params that are not a JSON object, stop the dump before anything is written', () => {
  const ext = (f) => (db) => ({ ...db, jm_extensions: f(db.jm_extensions) })
  const cases = [
    ['no com_content row', ext((rows) => rows.slice(1)), /holds 0 com_content component row/],
    ['two com_content rows', ext((rows) => [...rows, { ...rows[0], extension_id: '900' }]), /holds 2 com_content component row/],
    ['a com_content that is not a component', ext((rows) => [{ ...rows[0], type: 'module' }, ...rows.slice(1)]), /holds 0 com_content component row/],
    ['params not JSON', ext((rows) => [{ ...rows[0], params: '{"maxLevel":' }, ...rows.slice(1)]), /com_content \(extension_id 19\) params is not a JSON object/],
    ['params a list', ext((rows) => [{ ...rows[0], params: '[]' }, ...rows.slice(1)]), /params is not a JSON object/],
    ['params NULL', ext((rows) => [{ ...rows[0], params: null }, ...rows.slice(1)]), /params is not a JSON object: the column is NULL; its value is not printed/],
    ['a census row without an element', ext((rows) => [...rows, { extension_id: '5', type: 'module', element: '', params: '{}' }]), /a row without element/],
    ['an extension_id twice', ext((rows) => [...rows, { ...rows[1] }]), /extension_id 120 twice/],
    ['no extensions table', ({ jm_extensions, ...db }) => db, /jm_extensions does not exist/],
    ['no params column', (db) => ({ ...db, __columns__: { jm_extensions: ['extension_id', 'name', 'type', 'element'] } }), /jm_extensions has no column params/],
    ['a line that is not a row', (db) => ({ ...db, __lines__: { jm_extensions: ['<not a row>'] } }), /jm_extensions answered a line that is not a row/],
    ['a table that cannot be read', (db) => ({ ...db, __fail__: { jm_extensions: "ERROR 1142 (42000): SELECT command denied to user 'root' for table 'jm_extensions'" } }), /SHOW COLUMNS FROM jm_extensions failed: .*1142/]
  ]
  for (const [label, edit, re] of cases) refused(dump({ edit }), re, label)
  // A column that is refused is named by row and kind, never quoted: its value may hold a key.
  const leak = 'api-key-must-not-leak'
  for (const [label, edit, re] of [
    ['params not JSON, holding a key', ext((rows) => [{ ...rows[0], params: `{"apikey":"${leak}"` }, ...rows.slice(1)]), /extension_id 19\) params is not a JSON object: the column is not JSON; its value is not printed/],
    ['params a JSON string holding a key', ext((rows) => [{ ...rows[0], params: JSON.stringify(leak) }, ...rows.slice(1)]), /the column is JSON string; its value is not printed/],
    ['a census row without an element, with a key in its name', ext((rows) => [...rows, { extension_id: '6', name: leak, type: 'module', element: '', params: '{}' }]), /a row without element \(extension_id 6; its values are not printed\)/]
  ]) {
    const d = dump({ edit })
    refused(d, re, label)
    assert.equal(`${d.stdout}${d.stderr}`.includes(leak), false, `${label}: the value is not printed`)
  }
})

test('joomla-dump: a statement that does not answer in time stops the dump, bounded and without the password; bad identifiers are refused before any statement runs', () => {
  const stuck = dump({ edit: (db) => ({ ...db, __hang__: ['jm_extensions'] }), env: { JOOMLA_DUMP_TIMEOUT_MS: '1500' } })
  refused(stuck, /SELECT … FROM `jm_extensions`: no answer within 1500 ms/, 'a stuck database')
  const missingClient = dump({ env: { PATH: '/nonexistent' } })
  assert.equal(missingClient.status, 1, missingClient.stderr)
  assert.match(missingClient.stderr, /docker is not on PATH/)
  for (const [args, re] of [
    [['--prefix', 'jm_`; DROP TABLE x; --'], /--prefix .*letters, digits and _ only/],
    [['--db', 'joomla`x'], /--db .*letters, digits/]
  ]) {
    const d = dump({ args })
    assert.equal(d.status, 2, `${args.join(' ')}: ${d.stderr}`)
    assert.match(d.stderr, re)
    assert.equal(d.sql, '', 'no statement was sent')
  }
})

// ── configuration.php ─────────────────────────────────────────────────────────

/** A configuration.php as Joomla writes it: the public fields, and the secrets that must stay on the site. */
const SECRETS = { password: 'db-pw-must-not-leak', secret: 'secret-key-must-not-leak', user: 'dbuser-must-not-leak', db: 'dbname-must-not-leak', dbprefix: 'zz_', host: 'db-host-must-not-leak', smtppass: 'smtp-pw-must-not-leak', smtpuser: 'smtp-user-must-not-leak', log_path: '/srv/path-must-not-leak/logs', tmp_path: '/srv/path-must-not-leak/tmp' }
const PUBLIC = { sitename: 'Fixture Global Name', MetaDesc: 'A fixture site', MetaKeys: '', MetaAuthor: '1', language: 'en-GB', offline: false, sef: true, sef_rewrite: '1', sef_suffix: 0, offset: 'UTC', list_limit: 20, feed_limit: '10' }
const phpValue = (v) => (typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' ? String(v) : `'${String(v).replace(/[\\']/g, '\\$&')}'`)
function configurationPhp(dir, fields = { ...PUBLIC, ...SECRETS }) {
  const file = join(dir, 'configuration.php')
  writeFileSync(file, `<?php\nclass JConfig {\n${Object.entries(fields).map(([k, v]) => `\tpublic $${k} = ${phpValue(v)};`).join('\n')}\n}\n`)
  return file
}
const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
const WEB = ['--web-container', 'fake-joomla-web']
/** Every file the dump wrote, as one string. */
const written = (j6) => (existsSync(j6) ? readdirSync(j6).map((f) => readFileSync(join(j6, f), 'utf8')).join('\n') : '')
const noSecret = (text, label) => {
  for (const [k, v] of Object.entries(SECRETS)) if (k !== 'dbprefix') assert.equal(text.includes(v), false, `${label}: the value of ${k} is not in ${JSON.stringify(text.slice(0, 80))}…`)
}

test('joomla-dump: --web-container reads the public configuration.php fields through the site\'s php, and from-joomla takes the site name from them', { skip: !hasPhp && 'php is not installed' }, () => {
  const conf = configurationPhp(tmp('jd-web-'))
  const d = dump({ args: WEB, edit: (db) => ({ ...db, __php__: { configuration: conf } }) })
  assert.equal(d.status, 0, `${d.stderr}${d.stdout}`)
  const cfg = readJson(join(d.j6, 'site-config.json'))
  assert.deepEqual(Object.keys(cfg), SITE_CONFIG_FIELDS, 'every listed field, in list order, nothing else')
  assert.deepEqual(cfg, { sitename: 'Fixture Global Name', MetaDesc: 'A fixture site', MetaKeys: '', MetaAuthor: '1', language: 'en-GB', offline: '0', sef: '1', sef_rewrite: '1', sef_suffix: '0', offset: 'UTC', list_limit: '20', feed_limit: '10' }, 'every value a string')
  noSecret(written(d.j6), 'the dump')
  noSecret(`${d.stdout}${d.stderr}`, 'the dump output')
  // the php that ran names no field: the list travels as an argument
  assert.equal(d.php.length, 1)
  assert.deepEqual(d.php[0].target, ['exec', '-i', 'fake-joomla-web'])
  assert.equal(d.php[0].file, '/var/www/html/configuration.php')
  assert.deepEqual(JSON.parse(d.php[0].fields), SITE_CONFIG_FIELDS)
  for (const k of [...Object.keys(SECRETS), ...SITE_CONFIG_FIELDS]) assert.doesNotMatch(d.php[0].code, new RegExp(`\\b${k}\\b`), `the code does not name ${k}`)
  assert.deepEqual(readJson(join(d.j6, 'dump.json')).siteConfig, { from: 'container fake-joomla-web:/var/www/html/configuration.php', fields: SITE_CONFIG_FIELDS })

  // the template's site_name wins when it has one; blank, configuration.php's sitename is the name
  cpSync(join(JOOMLA_MIN, 'capture'), join(d.j6, 'capture'), { recursive: true })
  // a capture/ put beside a dump that recorded none is not that generation: the record goes, as a dump made before it
  { const dj = readJson(join(d.j6, 'dump.json')); delete dj.generation; writeFileSync(join(d.j6, 'dump.json'), JSON.stringify(dj)) }
  const named = buildSpecPack({ j6Dir: d.j6, out: join(tmp('jd-spec-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(readJson(join(named.out, 'content.json')).site.name, 'Fixture')
  assert.equal(readJson(join(named.out, 'provenance.json')).source.siteName, 'capture/templates/tracy/etc/site/default.json site_name')
  const siteFile = join(d.j6, 'capture', 'templates', 'tracy', 'etc', 'site', 'default.json')
  writeFileSync(siteFile, JSON.stringify({ ...readJson(siteFile), site_name: '' }))
  const out = join(tmp('jd-spec-'), 'pack')
  const result = buildSpecPack({ j6Dir: d.j6, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  assert.equal(readJson(join(out, 'content.json')).site.name, 'Fixture Global Name')
  assert.deepEqual(readJson(join(out, 'content-contract.json')).facts['site.name'], { value: 'Fixture Global Name', status: 'verified', source: 'joomla' })
  const prov = readJson(join(out, 'provenance.json')).source
  assert.equal(prov.siteName, 'site-config.json sitename')
  // recorded in the portable form: `~/…` under the home directory, the absolute path elsewhere
  const siteConfigFile = join(d.j6, 'site-config.json')
  assert.equal(prov.siteConfig, siteConfigFile.startsWith(homedir() + sep) ? `~${siteConfigFile.slice(homedir().length)}` : siteConfigFile)
  assert.equal(resolveRecordPath(prov.siteConfig), siteConfigFile)
  assert.ok(result.notes.includes('site name: "Fixture Global Name" from site-config.json sitename'))
  noSecret(readdirSync(out).filter((f) => f.endsWith('.json') || f.endsWith('.md')).map((f) => readFileSync(join(out, f), 'utf8')).join('\n'), 'the spec-pack')
})

test('joomla-dump: a php answer with a field outside the allow-list, or one that is not an object of scalars, stops the dump without writing or printing a value', () => {
  const answer = (print) => (db) => ({ ...db, __php__: { print } })
  const cases = [
    ['a php that prints every field', answer(JSON.stringify({ ...PUBLIC, ...SECRETS }) + '\n'), /outside the public allow-list \(password, secret, user, db, dbprefix, host, smtppass, smtpuser, log_path, tmp_path\)/],
    ['one secret among the fields', answer(JSON.stringify({ sitename: 'x', smtppass: SECRETS.smtppass }) + '\n'), /outside the public allow-list \(smtppass\)/],
    ['not JSON', answer('Parse error: syntax error\n'), /php did not print one JSON object of configuration fields on exactly one line \(one line that is not a JSON object\)/],
    ['a secret-bearing line before the object', answer(JSON.stringify({ password: SECRETS.password }) + '\n' + JSON.stringify(PUBLIC) + '\n'), /on exactly one line \(2 lines\)/],
    ['a warning quoting the file before the object', answer(`Warning: Undefined variable in configuration.php: public $secret = '${SECRETS.secret}';\n` + JSON.stringify(PUBLIC) + '\n'), /on exactly one line \(2 lines\)/],
    ['the object, then a second one', answer(JSON.stringify(PUBLIC) + '\n' + JSON.stringify({ smtppass: SECRETS.smtppass }) + '\n'), /on exactly one line \(2 lines\)/],
    ['a php error quoting the file', (db) => ({ ...db, __php__: { fail: `PHP Parse error: syntax error, unexpected identifier "${SECRETS.smtppass}" in /var/www/html/configuration.php on line 9`, status: 255 } }), /global configuration could not be read: php failed \(exit 255\); its message is not printed/],
    // stderr is never sorted by the words it holds: a failure that prints a runtime's or this code's
    // own words beside a secret is told by its exit status alone
    ['a php error that speaks like the daemon', (db) => ({ ...db, __php__: { fail: `Error response from daemon: OCI runtime ${SECRETS.password}`, status: 1 } }), /global configuration could not be read: php failed \(exit 1\); its message is not printed/],
    ['a php error that speaks like this code', (db) => ({ ...db, __php__: { fail: `configuration.php: not a readable file: ${SECRETS.secret}`, status: 255 } }), /global configuration could not be read: php failed \(exit 255\); its message is not printed/],
    ['a runtime refusal holding a secret', (db) => ({ ...db, __php__: { fail: `Error response from daemon: ${SECRETS.smtppass}`, status: 125 } }), /the container runtime refused the exec .*\(exit 125\); its message is not printed/],
    ['no class JConfig', (db) => ({ ...db, __php__: { fail: `no class ${SECRETS.secret}`, status: 5 } }), /configuration\.php defines no class JConfig \(exit 5\)/],
    ['a list', answer('[]\n'), /php did not print one JSON object/],
    ['nothing', answer(''), /php did not print one JSON object/],
    ['a nested value', answer(JSON.stringify({ sitename: { a: 1 } }) + '\n'), /configuration field sitename is object, not a scalar/],
    ['no configuration.php', (db) => ({ ...db, __php__: { fail: '', status: 4 } }), /global configuration could not be read: configuration\.php is not a readable file there \(exit 4\)/],
    ['no php in the container', (db) => db, /global configuration could not be read: php is not installed in the container \(exit 127\)/]
  ]
  for (const [label, edit, re] of cases) {
    const d = dump({ args: WEB, edit })
    refused(d, re, label)
    noSecret(`${d.stdout}${d.stderr}`, label)
  }
})

test('joomla-dump: without a web target no site-config.json is written and dump.json says so; a web target that cannot apply is refused before any statement', () => {
  const d = dump()
  assert.equal(d.status, 0, d.stderr)
  assert.equal(existsSync(join(d.j6, 'site-config.json')), false)
  assert.equal(readJson(join(d.j6, 'dump.json')).siteConfig, null)
  assert.match(d.stdout, /configuration\.php \(site name, public settings\) is not dumped/)
  assert.equal(d.php.length, 0)
  for (const [args, re] of [
    [['--web-service', 'joomla'], /--web-service names a service of --compose/],
    [['--web-root', 'var/www'], /--web-root "var\/www": expected an absolute path/]
  ]) {
    const r = dump({ args: [...args, ...(args[0] === '--web-root' ? WEB : [])] })
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
    assert.match(r.stderr, re)
    assert.equal(r.sql, '', 'no statement was sent')
  }
})

test('from-joomla: site-config.json holding a field outside the allow-list, a value that is not a string, or a link is refused naming the file', () => {
  const dir = tmp('jd-cfg-')
  assert.deepEqual(loadSiteConfig(dir), { config: null, from: null }, 'no file: not dumped')
  const file = join(dir, 'site-config.json')
  for (const [value, re] of [
    [{ sitename: 'x', password: SECRETS.password }, /field\(s\) outside the public allow-list: password/],
    [{ sitename: 1 }, /sitename is number, expected a string/],
    [['x'], /expected an object of configuration\.php fields/],
    [null, /expected an object of configuration\.php fields/]
  ]) {
    writeFileSync(file, JSON.stringify(value))
    assert.throws(() => loadSiteConfig(dir), (e) => re.test(e.message) && e.message.includes(file) && !e.message.includes(SECRETS.password))
  }
  rmSync(file)
  writeFileSync(join(dir, 'elsewhere.json'), JSON.stringify({ sitename: 'x' }))
  symlinkSync(join(dir, 'elsewhere.json'), file)
  assert.throws(() => loadSiteConfig(dir), /not a regular file/)
})
