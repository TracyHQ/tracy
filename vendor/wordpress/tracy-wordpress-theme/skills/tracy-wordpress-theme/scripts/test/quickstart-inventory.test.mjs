import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs, { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateRawSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import {
  analyseQuickstart,
  buildBaseline,
  md,
  parseCli,
  ownerRecord,
  publish,
  readReports,
  renderMarkdown,
  replayTables,
  runInventory,
  verifyBaseline,
  baselineGaps,
  assetPathOk,
  discoverLocal
} from '../ingest/quickstart-inventory.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '..', 'ingest', 'quickstart-inventory.mjs')
const HELPER = path.join(HERE, '..', 'ingest', 'quickstart-inventory-archive.py')
const SCRATCH = process.env.P1_ARTIFACT_ROOT ? path.join(process.env.P1_ARTIFACT_ROOT, 'p1-fixtures') : tmpdir()
mkdirSync(SCRATCH, { recursive: true })
const made = []
const scratch = () => {
  const d = mkdtempSync(path.join(SCRATCH, 'qsi-'))
  made.push(d)
  return d
}
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

// ---------------------------------------------------------------- synthetic archives
/** A ZIP written by hand, so hostile entries (links, traversal, duplicates, encryption) can be made. */
function zip(entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name)
    const data = e.dir ? Buffer.alloc(0) : Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '')
    const method = e.method ?? (e.store || e.dir ? 0 : 8)
    const body = method === 8 ? deflateRawSync(data) : data
    const crc = crc32(data)
    const mode = e.mode ?? (e.dir ? 0o40755 : 0o100644)
    const flags = e.encrypted ? 1 : 0
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(flags, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt32LE(crc >>> 0, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(name.length, 26)
    locals.push(lh, name, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE((3 << 8) | 20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(flags, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt32LE(crc >>> 0, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE((mode << 16) >>> 0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

/** A ustar archive; `type` '0' file, '5' directory, '2' symlink, '6' FIFO, 'x' PAX header, 'L' GNU long name, 'S' GNU sparse. */
function tar(entries) {
  const blocks = []
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '')
    const type = e.type ?? (e.dir ? '5' : '0')
    const hasData = ['0', 'x', 'L', 'S'].includes(type)
    const h = Buffer.alloc(512)
    h.write(e.name, 0, 100)
    h.write((type === '5' ? '0000755' : '0000644') + '\0', 100)
    h.write('0000000\0', 108)
    h.write('0000000\0', 116)
    h.write((hasData ? data.length : (e.size ?? 0)).toString(8).padStart(11, '0') + '\0', 124)
    h.write('00000000000\0', 136)
    h.write('        ', 148)
    h.write(type, 156)
    if (e.link) h.write(e.link, 157, 100)
    h.write('ustar\0', 257)
    h.write('00', 263)
    let sum = 0
    for (const b of h) sum += b
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    blocks.push(h)
    if (hasData) {
      blocks.push(data)
      if (data.length % 512) blocks.push(Buffer.alloc(512 - (data.length % 512)))
    }
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

const manifest = (type, name, version, { author = 'Vendor', attrs = '', body = '' } = {}) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<extension type="${type}" ${attrs}>\n<name>${name}</name>\n${version === null ? '' : `<version>${version}</version>\n`}<author>${author}</author>\n${body}</extension>\n`

const STYLE_COLS = '(`id`, `template`, `client_id`, `home`, `title`, `inheritable`, `parent`, `params`)'
const CREATE_STYLES = 'CREATE TABLE IF NOT EXISTS `#__template_styles` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `template` varchar(50) NOT NULL DEFAULT \'\',\n  `client_id` tinyint NOT NULL DEFAULT 0,\n  `home` char(7) NOT NULL DEFAULT \'0\',\n  `title` varchar(255) NOT NULL DEFAULT \'\',\n  `inheritable` tinyint NOT NULL DEFAULT 0,\n  `parent` varchar(50) DEFAULT \'\',\n  `params` text NOT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB;\n'
const CREATE_LANG = 'CREATE TABLE IF NOT EXISTS `#__languages` (\n  `lang_id` int NOT NULL,\n  `asset_id` int NOT NULL,\n  `lang_code` char(7) NOT NULL,\n  `title` varchar(50) NOT NULL,\n  `title_native` varchar(50) NOT NULL,\n  `sef` varchar(50) NOT NULL,\n  `published` int NOT NULL DEFAULT 0\n);\n'
const CREATE_EXT = 'CREATE TABLE IF NOT EXISTS `#__extensions` (\n  `extension_id` int NOT NULL,\n  `name` varchar(100) NOT NULL,\n  `type` varchar(20) NOT NULL,\n  `element` varchar(100) NOT NULL,\n  `folder` varchar(100) NOT NULL,\n  `client_id` tinyint NOT NULL,\n  `enabled` tinyint NOT NULL,\n  `manifest_cache` mediumtext NOT NULL,\n  `params` text NOT NULL\n);\n'
const extRow = (id, name, type, element, folder, client, enabled, version) =>
  `(${id},'${name}','${type}','${element}','${folder}',${client},${enabled},'{\\"name\\":\\"${name}\\",\\"version\\":\\"${version}\\"}','{\\"secret\\":\\"hunter2\\"}')`

/** The files of a Joomla root; `templates` are [{dir, xml, files: {rel: text}}]. */
function site({ templates = [], plugins = [], installer = true, customSql = null, baseSql = null, joomla = '6.1.1', php = '8.3.0', extraFiles = {} } = {}) {
  const f = {
    'administrator/manifests/files/joomla.xml': manifest('file', 'files_joomla', joomla, { author: 'Joomla! Project', attrs: 'method="upgrade"' }),
    'libraries/src/Version.php': `<?php\nfinal class Version {\n    public const MAJOR_VERSION = ${joomla.split('.')[0]};\n    public const MINOR_VERSION = ${joomla.split('.')[1]};\n    public const PATCH_VERSION = ${joomla.split('.')[2]};\n    public const EXTRA_VERSION = '';\n}\n`,
    'index.php': `<?php\ndefine('JOOMLA_MINIMUM_PHP', '${php}');\n`,
    'administrator/index.php': `<?php\ndefine('JOOMLA_MINIMUM_PHP', '${php}');\n`,
    'templates/cassiopeia/templateDetails.xml': manifest('template', 'cassiopeia', '1.0', { author: 'Joomla! Project', attrs: 'client="site"' }),
    'templates/cassiopeia/index.php': '<?php\n',
    'administrator/templates/atum/templateDetails.xml': manifest('template', 'atum', '1.0', { author: 'Joomla! Project', attrs: 'client="administrator"' }),
    'administrator/components/com_demo/demo.xml': manifest('component', 'com_demo', '1.2.3'),
    'administrator/components/com_demo/config.xml': '<?xml version="1.0"?><config><fieldset name="x"/></config>',
    'modules/mod_demo/mod_demo.xml': manifest('module', 'mod_demo', '2.0.0', { attrs: 'client="site"' }),
    'language/en-GB/langmetadata.xml': '<?xml version="1.0"?><metafile client="site"><name>English (en-GB)</name><version>6.1.1</version><author>Joomla! Project</author></metafile>',
    'administrator/language/en-GB/langmetadata.xml': '<?xml version="1.0"?><metafile client="administrator"><name>English (en-GB)</name><version>6.1.1</version><author>Joomla! Project</author></metafile>',
    ...extraFiles
  }
  for (const p of plugins) f[`plugins/system/${p.el}/${p.el}.xml`] = manifest('plugin', `plg_system_${p.el}`, p.version, { attrs: 'group="system"' })
  for (const t of templates) {
    if (t.xml !== undefined) f[`templates/${t.dir}/templateDetails.xml`] = t.xml
    f[`templates/${t.dir}/index.php`] = '<?php\n'
    for (const [rel, text] of Object.entries(t.files ?? {})) f[`templates/${t.dir}/${rel}`] = text
  }
  if (installer) {
    f['installation/index.php'] = `<?php\ndefine('JOOMLA_MINIMUM_PHP', '${php}');\n`
    f['installation/sql/mysql/base.sql'] =
      baseSql ??
      CREATE_STYLES +
        `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES\n(10,'atum',1,'1','Atum - Default',1,'',''),\n(11,'cassiopeia',0,'1','Cassiopeia - Default',1,'','');\n` +
        CREATE_LANG +
        "INSERT INTO `#__languages` (`lang_id`, `asset_id`, `lang_code`, `title`, `title_native`, `sef`, `published`) VALUES (1,0,'en-GB','English (en-GB)','English (United Kingdom)','en',1);\n"
    f['installation/sql/mysql/extensions.sql'] = '-- nothing modelled here\n'
    if (customSql !== null) f['installation/sql/mysql/custom.sql'] = customSql
  }
  return f
}

const customFor = (template, { styleTitle = 'Default', extra = '' } = {}) =>
  'DROP TABLE IF EXISTS `#__template_styles`;\n' +
  CREATE_STYLES +
  `/*!40000 ALTER TABLE \`#__template_styles\` DISABLE KEYS */;\nINSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES \n(10,'atum',1,'1','Atum - Default',1,'','{\\"a\\":1}')\n,(11,'cassiopeia',0,'0','Cassiopeia - Default',1,'','{}')\n,(12,'${template}',0,'1','${template} - ${styleTitle}',0,'','{\\"password\\":\\"s3cret-in-params\\"}');\n` +
  'DROP TABLE IF EXISTS `#__extensions`;\n' +
  CREATE_EXT +
  `INSERT INTO \`#__extensions\` VALUES ${extRow(1, 'com_demo', 'component', 'com_demo', '', 1, 1, '1.2.3')},${extRow(2, 'mod_demo', 'module', 'mod_demo', '', 0, 0, '2.0.0')},${extRow(3, 'plg_system_t4', 'plugin', 't4', 'system', 0, 1, '2.6.1')},${extRow(4, 'plg_system_t3', 'plugin', 't3', 'system', 0, 1, '3.3.2')},${extRow(5, 'com_ghost', 'component', 'com_ghost', '', 1, 1, '9.9.9')};\n` +
  'DROP TABLE IF EXISTS `#__users`;\nINSERT INTO `#__users` (`id`,`username`,`password`) VALUES (1,\'admin\',\'$2y$10$abcdefghijklmnopqrstuv\');\n' +
  extra

const T4_XML = manifest('template', 'tpl_t4', '1.2.1', { attrs: 'client="site"', body: '<t4><basetheme>base</basetheme></t4>\n' })
const T3_XML = manifest('template', 'tpl_t3', '2.3.4', { attrs: 'client="site"', body: '<t3><base>base-bs3</base></t3>\n<config><fields name="params" addfieldpath="/plugins/system/t3/includes/depend"/></config>\n' })

const fixtures = {
  t4: () => site({ templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/default.json': '{}', 'etc/site/default.json': '{}' } }], plugins: [{ el: 't4', version: '2.6.1' }], customSql: customFor('tpl_t4') }),
  // T3 templates also carry etc/layout — as .ini files
  t3: () => site({ templates: [{ dir: 'tpl_t3', xml: T3_XML, files: { 'etc/layout/default.ini': '[x]', 'tpls/default.php': '<?php\n' } }], plugins: [{ el: 't3', version: '3.3.2' }], customSql: customFor('tpl_t3') }),
  gavick: () => site({ templates: [{ dir: 'gk_news', xml: manifest('template', 'gk_news', '3.0', { attrs: 'client="site"' }), files: { 'lib/gavern/framework.php': '<?php\n' } }], customSql: customFor('gk_news') }),
  helix: () => site({ templates: [{ dir: 'shaper_x', xml: manifest('template', 'shaper_x', '2.0', { attrs: 'client="site"', body: '<config><fields name="params" addfieldpath="/plugins/system/helixultimate/fields"/></config>\n' }) }], plugins: [{ el: 'helixultimate', version: '2.1' }], customSql: customFor('shaper_x') }),
  other: () => site({ templates: [{ dir: 'plain', xml: manifest('template', 'plain', '1.0', { attrs: 'client="site"' }) }], plugins: [{ el: 't4', version: '2.6.1' }], customSql: customFor('plain') })
}
const entriesOf = (files, prefix = '') => Object.entries(files).map(([name, data]) => ({ name: prefix + name, data }))

function writeInput(dir, files) {
  mkdirSync(dir, { recursive: true })
  for (const [name, buf] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), buf)
  }
  return dir
}
const cli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 })
const readInv = (out) => JSON.parse(readFileSync(path.join(out, 'inventory.json'), 'utf8'))
// the helper reads below a resolved root: the file's real directory, then its name
const helperScan = (file, extra = []) => spawnSync('python3', [HELPER, 'scan', fs.realpathSync(path.dirname(file)), path.basename(file), ...extra], { encoding: 'utf8' })
const helper = (...args) => spawnSync('python3', [HELPER, ...args], { encoding: 'utf8' })

// ---------------------------------------------------------------- frameworks
test('inventory: one installer ZIP per framework — T4, T3 (with etc/layout), Gavick, Helix, other — classified from files, with evidence', () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), Object.fromEntries(Object.entries(fixtures).map(([k, f]) => [`${k}-qs.zip`, zip(entriesOf(f()))])))
  const out = path.join(d, 'out')
  const r = cli(['--input', input, '--out', out])
  assert.equal(r.status, 0, r.stderr)
  const inv = readInv(out)
  const by = Object.fromEntries(inv.quickstarts.map((q) => [q.id, q]))
  assert.deepEqual(
    Object.fromEntries(Object.entries(by).map(([k, q]) => [k, q.framework])),
    { 'gavick-qs': 'Gavick', 'helix-qs': 'Helix', 'other-qs': 'other', 't3-qs': 'T3', 't4-qs': 'T4' }
  )
  const t4 = by['t4-qs'].sites[0]
  const tpl = t4.templates.find((t) => t.dir === 'tpl_t4')
  assert.deepEqual(tpl.evidence.map((e) => e.path).sort(), ['templates/tpl_t4/etc/layout/default.json', 'templates/tpl_t4/templateDetails.xml'])
  assert.equal(tpl.plugin.version, '2.6.1')
  // Cassiopeia does not inherit the site's T4 plugin
  const cas = t4.templates.find((t) => t.dir === 'cassiopeia')
  assert.equal(cas.framework, 'other')
  assert.match(cas.notes.join(' '), /plugins\/system\/t4.*no framework marker/)
  const t3 = by['t3-qs'].sites[0].templates.find((t) => t.dir === 'tpl_t3')
  assert.equal(t3.framework, 'T3')
  assert.ok(t3.evidence.some((e) => e.path === 'templates/tpl_t3/etc/layout/default.ini'))
  assert.ok(!t3.evidence.some((e) => e.framework === 'T4'), 'etc/layout alone is not T4')
  assert.ok(by['gavick-qs'].sites[0].templates.find((t) => t.dir === 'gk_news').evidence.some((e) => e.path === 'templates/gk_news/lib/gavern/'))
  // 'other' has no framework marker even though its site ships the T4 plugin
  assert.equal(by['other-qs'].sites[0].siteFramework.template, 'plain')
  for (const q of inv.quickstarts) {
    assert.equal(q.format, 'installer')
    assert.equal(q.joomla, '6.1.1')
    assert.equal(q.phpMinimum, '8.3.0')
  }
  const md = readFileSync(path.join(out, 'inventory.md'), 'utf8')
  for (const q of inv.quickstarts) assert.ok(md.includes(`## ${q.id}`))
})

test('inventory: custom.sql replaces the base.sql tables; styles, content languages and enabled state come from the replayed rows; no secret leaves', () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const s = readInv(out).quickstarts[0].sites[0]
  assert.deepEqual(
    s.templateStyles.map((x) => [x.id, x.template, x.client, x.home]),
    [
      ['10', 'atum', 'administrator', '1'],
      ['11', 'cassiopeia', 'site', '0'],
      ['12', 'tpl_t4', 'site', '1']
    ]
  )
  assert.equal(s.siteFramework.framework, 'T4')
  assert.match(s.siteFramework.basis, /#12/)
  // base.sql's languages stand: custom.sql did not replace that table
  assert.deepEqual(s.languages.content.map((l) => l.langCode), ['en-GB'])
  assert.deepEqual(s.languages.installed.map((l) => `${l.client}:${l.tag}`), ['administrator:en-GB', 'site:en-GB'])
  const ext = Object.fromEntries(s.extensions.present.map((e) => [`${e.type}:${e.element}`, e]))
  assert.equal(ext['component:com_demo'].enabled, true)
  assert.equal(ext['module:mod_demo'].enabled, false)
  assert.equal(ext['component:com_demo'].version, '1.2.3')
  assert.ok(!ext['component:config'], 'config.xml is not a manifest')
  assert.deepEqual(s.extensions.registeredWithoutManifest.map((e) => e.element), ['com_ghost', 't3'])
  const inv = readInv(out)
  assert.ok(inv.quickstarts[0].unknowns.some((u) => /com_ghost: registered \(enabled\) with no manifest/.test(u)))
  const text = readFileSync(path.join(out, 'inventory.json'), 'utf8') + readFileSync(path.join(out, 'inventory.md'), 'utf8')
  for (const secret of ['hunter2', 's3cret-in-params', '$2y$10$', 'admin'.repeat(0) + 'username']) assert.ok(!text.includes(secret), `leaked ${secret}`)
})

test('inventory: several templates, the default style decides; a template with markers of two frameworks is a conflict; a missing plugin is noted', () => {
  const d = scratch()
  const both = manifest('template', 'mixed', '1.0', { attrs: 'client="site"', body: '<t4/>\n' })
  const files = site({
    templates: [
      { dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/default.json': '{}' } },
      { dir: 'tpl_t3', xml: T3_XML, files: { 'tpls/x.php': '' } },
      { dir: 'mixed', xml: both, files: { 'tpls/x.php': '' } },
      { dir: 'broken', xml: '<extension type="template"><name>broken</name' }
    ],
    plugins: [{ el: 't3', version: '3.3.2' }],
    customSql: customFor('tpl_t3')
  })
  const input = writeInput(path.join(d, 'in'), { 'multi.zip': zip(entriesOf(files)) })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const q = readInv(out).quickstarts[0]
  const t = Object.fromEntries(q.sites[0].templates.filter((x) => x.client === 'site').map((x) => [x.dir, x]))
  assert.equal(t.tpl_t4.framework, 'T4')
  assert.match(t.tpl_t4.notes.join(' '), /no plugins\/system\/t4/)
  assert.equal(t.tpl_t3.framework, 'T3')
  assert.equal(t.mixed.framework, 'conflict')
  assert.equal(t.broken.framework, 'unknown')
  assert.equal(q.framework, 'T3')
  assert.equal(q.frameworkTemplate, 'tpl_t3')
  const u = q.unknowns.join('\n')
  assert.match(u, /template broken: templates\/broken\/templateDetails\.xml unreadable \(malformed XML/)
  assert.match(u, /template broken: framework unknown/)
  assert.match(u, /template mixed: framework markers of T3 and T4 — framework not decided/)
})

test('inventory: the default template in conflict, without its framework plugin, or absent from the files is an unknown, not a note', () => {
  const d = scratch()
  const both = manifest('template', 'mixed', '1.0', { attrs: 'client="site"', body: '<t4/>\n' })
  const input = writeInput(path.join(d, 'in'), {
    'conflict.zip': zip(entriesOf(site({ templates: [{ dir: 'mixed', xml: both, files: { 'tpls/x.php': '' } }], customSql: customFor('mixed') }))),
    'noplugin.zip': zip(entriesOf(site({ templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/a.json': '{}' } }], customSql: customFor('tpl_t4') }))),
    'absent.zip': zip(entriesOf(site({ templates: [{ dir: 'tpl_t4', xml: T4_XML }], plugins: [{ el: 't4', version: '2.6.1' }], customSql: customFor('gone') }))),
    'badlang.zip': zip(entriesOf(site({
      templates: [{ dir: 'tpl_t4', xml: T4_XML }],
      plugins: [{ el: 't4', version: '2.6.1' }],
      customSql: customFor('tpl_t4'),
      extraFiles: { 'language/fr-FR/langmetadata.xml': '<metafile><name>French</name', 'language/de-DE/langmetadata.xml': '<?xml version="1.0"?><metafile client="site"><name>German</name></metafile>' }
    })))
  })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const by = Object.fromEntries(readInv(out).quickstarts.map((q) => [q.id, q]))
  assert.equal(by.conflict.framework, 'conflict')
  assert.match(by.conflict.unknowns.join('\n'), /site framework: default site style #12 .* — conflict/)
  assert.equal(by.noplugin.framework, 'T4')
  assert.match(by.noplugin.unknowns.join('\n'), /framework plugin: templates\/tpl_t4 is T4, but no plugins\/system\/t4 is shipped — plugin version unknown/)
  assert.equal(by.absent.framework, 'unknown')
  assert.match(by.absent.unknowns.join('\n'), /site framework: default site style #12 names template gone, which is not in the files/)
  const lang = by.badlang.unknowns.join('\n')
  assert.match(lang, /language site fr-FR: language\/fr-FR\/langmetadata\.xml unreadable \(malformed XML/)
  assert.match(lang, /language site de-DE: language\/de-DE\/langmetadata\.xml has no <version>/)
  assert.deepEqual(by.badlang.sites[0].languages.installed.filter((l) => l.client === 'site').map((l) => [l.tag, l.version]), [['de-DE', null], ['en-GB', '6.1.1'], ['fr-FR', null]])
})

test('inventory: PHP and Joomla declarations are read from code only — not from comments, strings, heredocs or inline HTML', () => {
  const d = scratch()
  const decoys = (real) =>
    `<p>define('JOOMLA_MINIMUM_PHP', '1.0')</p><?php\n// define('JOOMLA_MINIMUM_PHP', '5.0');\n/* define('JOOMLA_MINIMUM_PHP', '5.1'); */\n# define('JOOMLA_MINIMUM_PHP', '5.2');\n$a = "define('JOOMLA_MINIMUM_PHP', '5.3')";\n$b = 'it\\'s define("JOOMLA_MINIMUM_PHP", "5.4")';\n$c = <<<EOT\ndefine('JOOMLA_MINIMUM_PHP', '5.5');\nEOT;\n$o->define('JOOMLA_MINIMUM_PHP', '5.6');\n${real}`
  const version = "<?php\nfinal class Version {\n    // public const MAJOR_VERSION = 9;\n    public const MAJOR_VERSION = 6;\n    public const MINOR_VERSION = 1;\n    /* public const PATCH_VERSION = 9; */\n    public const PATCH_VERSION = 1;\n    public const EXTRA_VERSION = '';\n    private $s = 'const MINOR_VERSION = 7;';\n}\n"
  // assigned after site(): it writes installation/index.php itself
  const files = (real) =>
    Object.assign(site({ templates: [{ dir: 'tpl_t4', xml: T4_XML }], plugins: [{ el: 't4', version: '2.6.1' }], customSql: customFor('tpl_t4') }), {
      'index.php': decoys(real),
      'administrator/index.php': decoys(real),
      'installation/index.php': decoys(real),
      'libraries/src/Version.php': version
    })
  const input = writeInput(path.join(d, 'in'), {
    'real.zip': zip(entriesOf(files("\\define('JOOMLA_MINIMUM_PHP', '8.3.0');\n"))),
    'decoys.zip': zip(entriesOf(files('')))
  })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const by = Object.fromEntries(readInv(out).quickstarts.map((q) => [q.id, q]))
  assert.equal(by.real.phpMinimum, '8.3.0')
  assert.deepEqual([...new Set(by.real.sites[0].php.sources.map((x) => x.value))], ['8.3.0'])
  assert.equal(by.real.joomla, '6.1.1')
  assert.deepEqual(by.real.sites[0].joomla.sources.map((x) => x.value), ['6.1.1', '6.1.1'])
  assert.ok(!by.real.unknowns.some((u) => /Joomla version|PHP/.test(u)), by.real.unknowns.join('\n'))
  assert.equal(by.decoys.phpMinimum, null)
  assert.match(by.decoys.unknowns.join('\n'), /PHP: no JOOMLA_MINIMUM_PHP declaration/)
})

// ---------------------------------------------------------------- formats
test('inventory: runtime webroot tar.gz + database.sql.gz in one sub-directory; dump without column lists mapped through CREATE TABLE, reordered columns, escapes', () => {
  const d = scratch()
  const web = site({ installer: false, templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/home.json': '{}' } }], plugins: [{ el: 't4', version: '2.6.1' }] })
  const dump =
    '-- MySQL dump\n/*!40101 SET NAMES utf8mb4 */;\nDROP TABLE IF EXISTS `jos_template_styles`;\n' +
    CREATE_STYLES.replace('#__', 'jos_') +
    "LOCK TABLES `jos_template_styles` WRITE;\nINSERT INTO `jos_template_styles` VALUES (7,'tpl_t4',0,'1','It\\'s \"quoted\"; with ; semicolons',0,'','{\\\"k\\\":\\\"v;\\\"}'),\n(8,'cassiopeia',0,'0','Plain',1,'','');\nUNLOCK TABLES;\n" +
    CREATE_LANG.replace('#__', 'jos_') +
    "INSERT INTO `jos_languages` (`sef`, `lang_code`, `lang_id`, `asset_id`, `title`, `title_native`, `published`) VALUES ('fr','fr-FR',2,0,'French','Français',1),('en','en-GB',1,0,'English','English',1);\n"
  const input = writeInput(path.join(d, 'in'), {
    'site-a/webroot.tar.gz': gzipSync(tar(entriesOf(web, 'webroot/'))),
    'site-a/database.sql.gz': gzipSync(Buffer.from(dump))
  })
  const out = path.join(d, 'out')
  const r = cli(['--input', input, '--out', out])
  assert.equal(r.status, 0, r.stderr)
  const q = readInv(out).quickstarts[0]
  assert.equal(q.id, 'site-a')
  assert.equal(q.format, 'runtime-webroot-db')
  assert.deepEqual(q.assets.map((a) => [a.path, a.role, a.container]), [
    ['site-a/database.sql.gz', 'database', 'sql.gz'],
    ['site-a/webroot.tar.gz', 'webroot', 'tar.gz']
  ])
  const s = q.sites[0]
  assert.equal(s.root, 'webroot/')
  assert.deepEqual(s.templateStyles.map((x) => [x.id, x.title]), [
    ['7', 'It\'s "quoted"; with ; semicolons'],
    ['8', 'Plain']
  ])
  assert.deepEqual(s.languages.content.map((l) => [l.langCode, l.sef]), [
    ['en-GB', 'en'],
    ['fr-FR', 'fr']
  ])
  assert.equal(q.framework, 'T4')
  assert.ok(q.unknowns.some((u) => /extension state: extensions: not created/.test(u)), 'a dump without #__extensions leaves enabled state unknown')
})

test('inventory: a bundle ZIP holding the installer ZIP is a bundle; an extension ZIP inside a site is embedded, not a site', () => {
  const d = scratch()
  const inner = zip(entriesOf({ ...fixtures.t3(), 'administrator/components/com_demo/packages/pkg.zip': zip(entriesOf({ 'administrator/manifests/files/joomla.xml': manifest('file', 'files_joomla', '1.0.0'), 'templates/evil/templateDetails.xml': T4_XML })) }))
  const outer = zip([
    { name: 'README.txt', data: 'bundle' },
    { name: 'quickstart/ja-x-quickstart.zip', data: inner, store: true }
  ])
  const input = writeInput(path.join(d, 'in'), { 'bundle.zip': outer })
  const out = path.join(d, 'out')
  const r = cli(['--input', input, '--out', out])
  assert.equal(r.status, 0, r.stderr)
  const q = readInv(out).quickstarts[0]
  assert.equal(q.format, 'bundle')
  assert.equal(q.innerFormat, 'installer')
  assert.equal(q.framework, 'T3')
  assert.equal(q.sites.length, 1)
  assert.equal(q.sites[0].nested, 'quickstart/ja-x-quickstart.zip')
  assert.deepEqual(q.sites[0].embeddedArchives.map((e) => e.path), ['quickstart/ja-x-quickstart.zip!administrator/components/com_demo/packages/pkg.zip'])
  assert.ok(!q.sites[0].templates.some((t) => t.dir === 'evil'))

  // a site directory with a quickstart ZIP beside it, not below its root: two sites, not one — and a
  // ZIP below that root stays embedded in it, by the path it has in the archive
  const pkg = zip(entriesOf({ 'administrator/manifests/files/joomla.xml': manifest('file', 'files_joomla', '1.0.0') }))
  const beside = zip([
    ...entriesOf({ ...fixtures.t4(), 'tmp/pkg.zip': pkg }, 'siteA/'),
    { name: 'siteA-old/x-quickstart.zip', data: inner, store: true }
  ])
  const d2 = scratch()
  const out2 = path.join(d2, 'out')
  const r2 = cli(['--input', writeInput(path.join(d2, 'in'), { 'beside.zip': beside }), '--out', out2])
  assert.equal(r2.status, 0, r2.stderr)
  const b = readInv(out2).quickstarts[0]
  assert.equal(b.format, 'ambiguous')
  assert.equal(b.framework, 'unknown')
  assert.deepEqual(b.sites.map((s) => [s.nested, s.root]), [[null, 'siteA/'], ['siteA-old/x-quickstart.zip', '.']])
  assert.deepEqual(b.sites[0].embeddedArchives.map((e) => e.path), ['siteA/tmp/pkg.zip'])
  assert.deepEqual(b.sites[1].embeddedArchives.map((e) => e.path), ['siteA-old/x-quickstart.zip!administrator/components/com_demo/packages/pkg.zip'])
  assert.match(b.unknowns.join(' '), /2 Joomla roots \(beside\.zip:siteA\/, beside\.zip!siteA-old\/x-quickstart\.zip:\.\)/)
})

test('inventory: no Joomla root → format unknown with the reason listed; a Joomla site whose SQL is not modelled → styles unknown, not invented', () => {
  const d = scratch()
  const unsupported = site({
    templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/default.json': '{}' } }],
    plugins: [{ el: 't4', version: '2.6.1' }],
    customSql: customFor('tpl_t4', { extra: "UPDATE `#__template_styles` SET `home`='0' WHERE `id`=12;\nINSERT INTO `#__languages` SELECT * FROM `other`;\n" })
  })
  const input = writeInput(path.join(d, 'in'), {
    'nothing.zip': zip([{ name: 'readme.txt', data: 'not a site' }]),
    'odd.zip': zip(entriesOf(unsupported))
  })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const by = Object.fromEntries(readInv(out).quickstarts.map((q) => [q.id, q]))
  assert.equal(by.nothing.format, 'unknown')
  assert.equal(by.nothing.framework, 'unknown')
  assert.match(by.nothing.unknowns.join(' '), /no Joomla root/)
  const s = by.odd.sites[0]
  assert.equal(s.templateStyles, null)
  assert.equal(s.languages.content, null)
  assert.ok(by.odd.unknowns.some((u) => /template styles: .*UPDATE statement changes rows/.test(u)))
  assert.ok(by.odd.unknowns.some((u) => /content languages: .*without a VALUES list/.test(u)))
  // without the default style, the only framework template still names the framework — and says so
  assert.equal(by.odd.framework, 'T4')
  assert.match(s.siteFramework.basis, /template styles unknown/)
})

test('inventory: two database dumps beside a webroot are ambiguous — none is chosen', () => {
  const d = scratch()
  const web = site({ installer: false, templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/home.json': '{}' } }] })
  const one = CREATE_STYLES + `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES (1,'tpl_t4',0,'1','A',0,'','');\n`
  const input = writeInput(path.join(d, 'in'), { 'pair/webroot.tar': tar(entriesOf(web)), 'pair/a.sql': one, 'pair/b.sql': one })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const q = readInv(out).quickstarts[0]
  assert.equal(q.sites[0].templateStyles, null)
  assert.match(q.unknowns.join(' '), /several candidates \(pair\/a\.sql!a\.sql, pair\/b\.sql!b\.sql\)/)
})

/** The helper's SQL effects for one dump, and the tables replayed from them. */
function sqlTables(d, name, text) {
  const f = path.join(d, name)
  writeFileSync(f, text)
  const r = helperScan(f)
  assert.equal(r.status, 0, r.stderr)
  const scan = JSON.parse(r.stdout)
  const parsed = scan.containers[0].files[name]
  return { ops: parsed.ops, tables: replayTables([{ label: name, parsed }]) }
}

test('SQL: every statement naming a modelled table must be a modelled form for it — anything else makes that table unknown', () => {
  const d = scratch()
  const base =
    CREATE_STYLES +
    `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES (12,'tpl_t4',0,'1','Default',0,'','');\n` +
    CREATE_LANG +
    "INSERT INTO `#__languages` (`lang_id`, `asset_id`, `lang_code`, `title`, `title_native`, `sef`, `published`) VALUES (1,0,'en-GB','English','English','en',1);\n" +
    CREATE_EXT +
    `INSERT INTO \`#__extensions\` VALUES ${extRow(1, 'com_demo', 'component', 'com_demo', '', 1, 1, '1.2.3')};\n` +
    'CREATE TABLE `#__users` (`id` int, `username` varchar(10));\n'
  // the base alone: all three known
  let t = sqlTables(d, 'base.sql', base).tables
  assert.deepEqual([t.template_styles.known, t.languages.known, t.extensions.known], [true, true, true])
  const cases = [
    ['multi-drop.sql', 'DROP TABLE IF EXISTS `#__users`, `#__template_styles`;\n', 'template_styles', /template_styles: not created by the database source/],
    ['multi-update.sql', "UPDATE `#__users` u, `#__template_styles` s SET s.home = '0';\n", 'template_styles', /UPDATE statement naming #__template_styles is not a modelled form/],
    ['rename.sql', 'RENAME TABLE `#__users` TO `#__languages`;\n', 'languages', /RENAME statement naming #__languages is not a modelled form/],
    ['delete-limit.sql', 'DELETE FROM `#__extensions` LIMIT 1;\n', 'extensions', /DELETE statement changes rows the scan does not model/],
    ['insert-select.sql', 'INSERT INTO `#__users` SELECT * FROM `#__extensions`;\n', 'extensions', /INSERT statement naming #__extensions is not a modelled form/],
    ['delete-join.sql', 'DELETE s FROM `#__template_styles` s JOIN `#__users` u ON 1;\n', 'template_styles', /DELETE statement naming #__template_styles is not a modelled form/],
    ['alter.sql', 'ALTER TABLE `#__languages` ADD COLUMN `x` int;\n', 'languages', /ALTER statement changes rows the scan does not model/],
    ['temporary.sql', 'CREATE TEMPORARY TABLE `#__template_styles` (`id` int);\n', 'template_styles', /CREATE statement naming #__template_styles is not a modelled form/],
    ['create-select.sql', 'CREATE TABLE IF NOT EXISTS `#__languages` (`lang_id` int) SELECT * FROM `#__users`;\n', 'languages', /CREATE TABLE \.\.\. LIKE\/SELECT/]
  ]
  for (const [name, extra, table, re] of cases) {
    t = sqlTables(d, name, base + extra).tables
    assert.equal(t[table].known, false, name)
    assert.match(t[table].gaps.join('\n'), re, name)
  }
  // forms that change no row, a column that looks like a table, and table names inside strings change nothing
  const quiet =
    base +
    'LOCK TABLES `#__template_styles` WRITE, `#__languages` READ;\nUNLOCK TABLES;\nALTER TABLE `#__extensions` DISABLE KEYS;\n' +
    'CREATE TABLE `#__ja_things` (`id` int, `display_languages` varchar(255), `jos_extensions` int);\n' +
    "INSERT INTO `#__users` (`id`, `username`) VALUES (2, 'DELETE FROM `#__template_styles`');\n" +
    "UPDATE `#__users` SET `username` = 'UPDATE #__languages SET x=1' WHERE `id` = 2;\n"
  t = sqlTables(d, 'quiet.sql', quiet).tables
  assert.deepEqual([t.template_styles.known, t.languages.known, t.extensions.known], [true, true, true], JSON.stringify(t))
  assert.deepEqual(t.template_styles.rows.map((r) => r.id), ['12'])
  // DELETE and TRUNCATE without anything after the table empty it
  t = sqlTables(d, 'empty.sql', base + 'DELETE FROM `#__template_styles`;\nTRUNCATE `#__languages`;\n').tables
  assert.deepEqual([t.template_styles.rows, t.languages.rows], [[], []])
})

test('SQL: version-conditional comments, statement modifiers, prefixes with underscores and unknown statement kinds are never skipped', () => {
  const d = scratch()
  const create = (pre) =>
    `CREATE TABLE \`${pre}template_styles\` (\`id\` int, \`template\` varchar(50), \`client_id\` int, \`home\` char(1), \`title\` varchar(50));\n` +
    `INSERT INTO \`${pre}template_styles\` VALUES (1,'tpl_t4',0,'1','Default');\n`
  // each was left out of the effects before: the table stayed known with stale rows, or no op at all
  const cases = [
    ['exec-delete.sql', create('jos_') + '/*!40000 DELETE FROM `jos_template_styles` */;\n', /DELETE statement naming jos_template_styles inside a version-conditional comment/],
    ['exec-mariadb.sql', create('jos_') + "/*M!100100 UPDATE `jos_template_styles` SET `home` = '0' */;\n", /UPDATE statement naming jos_template_styles inside a version-conditional comment/],
    ['low-priority-only.sql', "UPDATE LOW_PRIORITY IGNORE `jos_template_styles` SET `home` = '0';\n", /UPDATE statement changes rows the scan does not model/],
    ['low-priority.sql', create('jos_') + "UPDATE LOW_PRIORITY `jos_template_styles` SET `home` = '0';\n", /UPDATE statement changes rows the scan does not model/],
    ['underscore-prefix.sql', create('my_site_') + "UPDATE my_site_template_styles SET home = '0';\n", /UPDATE statement changes rows the scan does not model/],
    ['delete-quick.sql', create('ab$1_') + 'DELETE LOW_PRIORITY QUICK IGNORE FROM `ab$1_template_styles` WHERE `id` = 1;\n', /DELETE statement changes rows the scan does not model/],
    ['call.sql', create('jos_') + 'CALL `reset_styles`();\n', /a CALL statement the scan does not model/],
    ['prepared.sql', create('jos_') + "SET @q = 'x';\nPREPARE s FROM @q;\nEXECUTE s;\n", /a PREPARE statement the scan does not model/],
    ['delimiter.sql', create('jos_') + 'DELIMITER ;;\n', /a DELIMITER statement the scan does not model/]
  ]
  for (const [name, text, re] of cases) {
    const { ops, tables } = sqlTables(d, name, text)
    assert.equal(tables.template_styles.known, false, `${name}: ${JSON.stringify(ops)}`)
    assert.match(tables.template_styles.gaps.join('\n'), re, name)
  }
  // an unknown statement kind may have changed any table: all three become unknown, under no prefix
  const call = sqlTables(d, 'call2.sql', create('jos_') + 'CALL p();\n')
  assert.deepEqual([call.tables.languages.known, call.tables.extensions.known], [false, false])
  assert.ok(!/several table prefixes/.test(call.tables.template_styles.gaps.join('\n')))

  // counted and reported, with reasons that carry no value of the dump
  const secret = "INSERT INTO `jos_template_styles` VALUES (2,'x',0,'0','B') ON DUPLICATE KEY UPDATE `title` = 'SECRET-TITLE';\n"
  const r = helperScan((writeFileSync(path.join(d, 'count.sql'), create('jos_') + '/*!40101 SET NAMES utf8mb4 */;\n' + secret + 'CALL p(\'SECRET-ARG\');\n'), path.join(d, 'count.sql')))
  assert.equal(r.status, 0, r.stderr)
  const st = JSON.parse(r.stdout).containers[0].files['count.sql'].statements
  assert.deepEqual([st.statements, st.modelled, st.noEffect, st.unsupported, st.unrecognised], [5, 2, 1, 1, 1])
  assert.deepEqual(st.reasons.map((x) => [x.kind, x.verb, x.count]), [['unsupported', 'INSERT', 1], ['unrecognised', 'CALL', 1]])
  assert.ok(!/SECRET/.test(r.stdout), 'a value of the dump left the scan')
  assert.match(st.reasons[0].why, /trailing clause after VALUES \(ON DUPLICATE KEY\)/)

  // what stays harmless: mysqldump's conditional SET and key toggles, and a column named like a table
  const quiet =
    create('jos_') +
    'CREATE TABLE `jos_languages` (`lang_id` int, `lang_code` char(7));\nINSERT INTO `jos_languages` VALUES (1,\'en-GB\');\n' +
    'CREATE TABLE `jos_extensions` (`extension_id` int, `name` varchar(9));\n' +
    '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!40000 ALTER TABLE `jos_extensions` DISABLE KEYS */;\n' +
    'CREATE TABLE `jos_ja_things` (`id` int, `display_languages` int);\nINSERT INTO `jos_ja_things` VALUES (1, 2);\n' +
    "UPDATE `jos_ja_things` SET `display_languages` = 3;\n"
  const q = sqlTables(d, 'quiet.sql', quiet)
  assert.deepEqual([q.tables.template_styles.known, q.tables.languages.known, q.tables.extensions.known], [true, true, true], JSON.stringify(q.tables))
  assert.deepEqual(q.tables.languages.rows.map((x) => x.lang_code), ['en-GB'])
  // a table that ends like a modelled one under a longer prefix may be a second site's: not decided
  const nested = sqlTables(d, 'nested.sql', quiet + 'CREATE TABLE `jos_ja_languages` (`id` int);\n')
  assert.equal(nested.tables.languages.known, false)
  assert.match(nested.tables.languages.gaps.join('\n'), /several table prefixes \(jos_, jos_ja_\)/)
})

/** The helper's SQL effects for several files of one archive, replayed in the order given. */
function sqlSetTables(d, name, files) {
  const f = path.join(d, name)
  writeFileSync(f, zip(entriesOf(files)))
  const r = helperScan(f)
  assert.equal(r.status, 0, r.stderr)
  const parsed = JSON.parse(r.stdout).containers[0].files
  return replayTables(Object.keys(files).map((k) => ({ label: k, parsed: parsed[k] })))
}

test('SQL: the prefixes of all the SQL files of an archive are pooled; an alias, a double-quoted name or a stored routine never hides a change', () => {
  const d = scratch()
  const base =
    'CREATE TABLE `my_site_template_styles` (`id` int, `template` varchar(50), `client_id` int, `home` char(1), `title` varchar(50));\n' +
    "INSERT INTO `my_site_template_styles` VALUES (1,'tpl_t4',0,'1','Default');\n" +
    'CREATE TABLE `my_site_content` (`id` int);\n'
  // each custom file alone names the table in a form whose prefix it does not show in a table position
  const cases = [
    ['alias', "UPDATE aux AS a, my_site_template_styles AS s SET s.home = '0' WHERE a.id = s.id;\n", /UPDATE statement naming my_site_template_styles is not a modelled form/],
    ['bare-alias', "UPDATE aux a JOIN my_site_template_styles s ON a.id = s.id SET s.home = '0';\n", /UPDATE statement naming my_site_template_styles is not a modelled form/],
    ['ansi-quotes', 'UPDATE "my_site_template_styles" SET "home" = \'0\';\n', /UPDATE statement naming my_site_template_styles is not a modelled form/],
    ['subquery', "DELETE FROM aux WHERE id IN (SELECT id FROM my_site_template_styles);\nDELETE s FROM aux AS a, my_site_template_styles AS s;\n", /DELETE statement naming my_site_template_styles is not a modelled form/],
    ['procedure', "CREATE PROCEDURE p() BEGIN SET @x = 1; END;\n", /a CREATE statement the scan does not model/],
    ['trigger', "/*!50003 CREATE*/ /*!50017 DEFINER=`u`@`%`*/ /*!50003 TRIGGER t BEFORE INSERT ON aux FOR EACH ROW SET @x = 1 */;\n", /a CREATE statement the scan does not model/],
    ['compound', "BEGIN NOT ATOMIC SET @x = 1; END;\n", /a BEGIN statement the scan does not model/]
  ]
  for (const [name, custom, re] of cases) {
    const t = sqlSetTables(d, `${name}.zip`, { 'base.sql': base, 'custom.sql': custom })
    assert.equal(t.template_styles.known, false, `${name}: ${JSON.stringify(t.template_styles)}`)
    assert.match(t.template_styles.gaps.join('\n'), re, name)
  }
  // a name inside a single-quoted value, a column named like a table, and a transaction stay harmless
  const t = sqlSetTables(d, 'quiet.zip', {
    'base.sql': base,
    'custom.sql': "UPDATE aux AS a SET a.note = 'my_site_template_styles', a.display_template_styles = 1;\nBEGIN;\nCOMMIT;\n"
  })
  assert.equal(t.template_styles.known, true, JSON.stringify(t.template_styles))
  assert.deepEqual(t.template_styles.rows.map((r) => r.id), ['1'])
})

test('SQL: a foreign key makes its table unknown; a trigger or view outlives a DROP and CREATE, a change to the rows does not; a prefix seen only double-quoted is a site\'s', () => {
  const d = scratch()
  const styles = (fk = '') =>
    `CREATE TABLE \`jos_template_styles\` (\`id\` int, \`template\` varchar(50), \`client_id\` int, \`home\` char(1), \`title\` varchar(50)${fk});\n` +
    "INSERT INTO `jos_template_styles` (`id`, `template`, `client_id`, `home`, `title`) VALUES (1,'tpl_t4',0,'1','Default');\n"
  const aux = 'CREATE TABLE `jos_aux` (`name` varchar(50));\nINSERT INTO `jos_aux` VALUES (\'tpl_t4\');\n'
  const again = 'DROP TABLE `jos_template_styles`;\n' + styles()
  // each ends with a statement that names no modelled table, yet may change template_styles through what came before
  const cases = [
    ['fk-cascade', aux + styles(', CONSTRAINT `fk` FOREIGN KEY (`template`) REFERENCES `jos_aux` (`name`) ON DELETE CASCADE') + 'DELETE FROM `jos_aux`;\n', /CREATE TABLE with a foreign key/],
    ['fk-inline', aux + styles(', `x` varchar(50) REFERENCES `jos_aux` (`name`) ON UPDATE SET NULL') + "UPDATE `jos_aux` SET `name` = 'y';\n", /CREATE TABLE with a foreign key/],
    ['trigger-then-recreate', aux + styles() + "/*!50003 CREATE*/ /*!50003 TRIGGER t AFTER DELETE ON jos_aux FOR EACH ROW DELETE FROM jos_template_styles */;\n" + again + 'DELETE FROM `jos_aux`;\n', /a CREATE statement the scan does not model/],
    ['view-then-recreate', aux + styles() + 'CREATE VIEW `v` AS SELECT * FROM `jos_template_styles`;\n' + again + 'DELETE FROM `v`;\n', /CREATE statement naming jos_template_styles is not a modelled form/],
    ['merge-then-recreate', aux + styles() + 'CREATE TABLE `jos_all` (`id` int) ENGINE=MERGE UNION=(`jos_template_styles`);\n' + again + 'DELETE FROM `jos_all`;\n', /CREATE statement naming jos_template_styles is not a modelled form/],
    ['exec-view-then-recreate', aux + styles() + '/*!50001 CREATE ALGORITHM=UNDEFINED */ /*!50001 VIEW `v` AS select `id` from `jos_template_styles` */;\n' + again, /inside a version-conditional comment/]
  ]
  for (const [name, text, re] of cases) {
    const { ops, tables } = sqlTables(d, `${name}.sql`, text)
    assert.equal(tables.template_styles.known, false, `${name}: ${JSON.stringify(ops)}`)
    assert.match(tables.template_styles.gaps.join('\n'), re, name)
  }
  // an unmodelled change to the rows alone ends with the table: a later DROP and CREATE make it known again
  for (const [name, change] of [
    ['update', "UPDATE `jos_template_styles` SET `home` = '0';\n"],
    ['insert-select', 'INSERT INTO `jos_template_styles` SELECT * FROM `jos_aux`;\n'],
    ['foreign-key', 'DROP TABLE `jos_template_styles`;\n' + styles(', FOREIGN KEY (`template`) REFERENCES `jos_aux` (`name`) ON DELETE CASCADE')],
    ['index', 'CREATE INDEX `i` ON `jos_template_styles` (`home`);\n']
  ]) {
    const { tables } = sqlTables(d, `ended-${name}.sql`, aux + styles() + change + again + 'DELETE FROM `jos_aux`;\n')
    assert.equal(tables.template_styles.known, true, `${name}: ${JSON.stringify(tables.template_styles)}`)
    assert.deepEqual(tables.template_styles.rows.map((r) => r.id), ['1'], name)
  }
  // a foreign key on a table the scan does not model, and a quoted word REFERENCES, change no modelled row
  const quiet = sqlTables(
    d,
    'fk-elsewhere.sql',
    aux + styles(", `note` varchar(50) DEFAULT 'REFERENCES', `references` int") + 'CREATE TABLE `jos_child` (`n` varchar(50), FOREIGN KEY (`n`) REFERENCES `jos_aux` (`name`) ON DELETE CASCADE);\nDELETE FROM `jos_aux`;\n'
  ).tables
  assert.equal(quiet.template_styles.known, true, JSON.stringify(quiet.template_styles))
  assert.deepEqual(quiet.template_styles.rows.map((r) => r.id), ['1'])

  // under ANSI_QUOTES a second site's tables may be double-quoted only: their prefix is found, the table is not decided
  const base =
    'CREATE TABLE `#__template_styles` (`id` int, `template` varchar(50), `client_id` int, `home` char(1), `title` varchar(50));\n' +
    "INSERT INTO `#__template_styles` VALUES (1,'tpl_t4',0,'1','Default');\n"
  const t = sqlSetTables(d, 'ansi-prefix.zip', {
    'base.sql': base,
    'custom.sql': 'CREATE TABLE "my_site_content" ("id" int);\nUPDATE "my_site_template_styles" SET "home" = \'0\';\nDELETE FROM a USING a, "my_site_template_styles";\n'
  })
  assert.equal(t.template_styles.known, false, JSON.stringify(t.template_styles))
  assert.match(t.template_styles.gaps.join('\n'), /UPDATE statement naming my_site_template_styles is not a modelled form/)
  assert.match(t.template_styles.gaps.join('\n'), /several table prefixes \(#__, my_site_\)/)
  // the prefix is found from a double-quoted core table alone, in a USING list or behind a parenthesis too
  for (const [name, custom] of [
    ['using', 'DELETE FROM a USING a, "zz_template_styles";\n'],
    ['paren', 'DELETE a FROM a JOIN ("zz_template_styles" s) ON 1;\n']
  ]) {
    const u = sqlSetTables(d, `ansi-${name}.zip`, { 'base.sql': base, 'custom.sql': custom })
    assert.equal(u.template_styles.known, false, `${name}: ${JSON.stringify(u.template_styles)}`)
    assert.match(u.template_styles.gaps.join('\n'), /DELETE statement naming zz_template_styles is not a modelled form/, name)
  }
})

test('SQL: a key inserted twice makes the table unknown and leaves no value of the dump in the report', () => {
  const d = scratch()
  const t = sqlTables(
    d,
    'dup.sql',
    CREATE_STYLES + `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES ('SECRET-KEY-77','tpl_t4',0,'1','A',0,'','');\n` + `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES ('SECRET-KEY-77','tpl_t4',0,'0','B',0,'',''),('SECRET-KEY-78','tpl_t4',0,'0','C',0,'','');\n`
  ).tables
  assert.equal(t.template_styles.known, false)
  const gaps = t.template_styles.gaps.join('\n')
  assert.match(gaps, /INSERT of 1 row\(s\) whose id is already present/)
  assert.ok(!/SECRET/.test(gaps), gaps)
})

test('inventory: missing versions, malformed and entity-declaring manifests are listed, not guessed', () => {
  const d = scratch()
  const files = site({
    templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/default.json': '{}' } }],
    customSql: customFor('tpl_t4'),
    extraFiles: {
      'modules/mod_nover/mod_nover.xml': manifest('module', 'mod_nover', null),
      'modules/mod_bad/mod_bad.xml': '<extension type="module"><name>mod_bad</name>',
      'plugins/system/xxe/xxe.xml': '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><extension type="plugin"><name>&e;</name></extension>'
    }
  })
  const input = writeInput(path.join(d, 'in'), { 'm.zip': zip(entriesOf(files)) })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const q = readInv(out).quickstarts[0]
  const u = q.unknowns.join('\n')
  assert.match(u, /mod_nover: manifest has no <version>/)
  assert.match(u, /modules\/mod_bad\/mod_bad\.xml unreadable \(malformed XML/)
  assert.match(u, /plugins\/system\/xxe\/xxe\.xml unreadable \(entity declarations refused\)/)
  assert.ok(!readFileSync(path.join(out, 'inventory.json'), 'utf8').includes('root:'), 'no file content was pulled in')
})

// ---------------------------------------------------------------- hostile and broken input
test('inventory: hostile or broken archives fail naming the asset and member; earlier reports stay', () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const good = writeInput(path.join(d, 'good'), { 'ok.zip': zip(entriesOf(fixtures.t4())) })
  assert.equal(cli(['--input', good, '--out', out]).status, 0)
  const before = readFileSync(path.join(out, 'inventory.json'), 'utf8')
  const base = entriesOf(fixtures.t4())
  const cases = {
    'symlink.zip': [zip([...base, { name: 'link', data: '/etc/passwd', mode: 0o120777 }]), /member link: member is a symlink/],
    'fifo.zip': [zip([...base, { name: 'pipe', data: '', mode: 0o010644 }]), /member is a FIFO/],
    'traversal.zip': [zip([...base, { name: '../../evil.php', data: 'x' }]), /escapes the archive/],
    'absolute.zip': [zip([...base, { name: '/etc/cron.d/x', data: 'x' }]), /absolute member path/],
    'dupe.zip': [zip([...base, { name: 'index.php', data: 'x' }, { name: './index.php', data: 'y' }]), /duplicate member/],
    'dupe-implied.zip': [zip([{ name: 'a/b', data: 'x' }, { name: 'a/', dir: true }, { name: 'a/', dir: true }]), /member a\/: duplicate member/],
    'collide.zip': [zip([{ name: 'a', data: 'file' }, { name: 'a/b', data: 'under a file' }]), /under a, which is a file/],
    'encrypted.zip': [zip([...base, { name: 'secret.txt', data: 'x', encrypted: true }]), /encrypted member/],
    'backslash.zip': [zip([{ name: '..\\..\\x', data: 'x' }]), /backslash/],
    'tarlink.tar': [tar([{ name: 'a', data: 'x' }, { name: 'l', type: '2', link: '/etc/passwd' }]), /member is a link \(symlink -> \/etc\/passwd\)/],
    'tarfifo.tar': [tar([{ name: 'p', type: '6' }]), /not a file or directory/],
    'tardevice.tar': [tar([{ name: 'dev/null', type: '3' }]), /member dev\/null: member is not a file or directory/],
    'tarhardlink.tar': [tar([{ name: 'a', data: 'x' }, { name: 'b', type: '1', link: 'a' }]), /hard link -> a/],
    'socket.zip': [zip([{ name: 's', data: '', mode: 0o140755 }]), /member is a socket/],
    'deflate64.zip': [zip([{ name: 'x.bin', data: 'abc', method: 9 }]), /unsupported compression/],
    'truncated.zip': [zip(base).subarray(0, 400), /corrupt or truncated ZIP/],
    'corrupt.zip': [(() => {
      const z = zip([{ name: 'x.txt', data: 'a'.repeat(5000) }])
      z[40] ^= 0xff
      return z
    })(), /corrupt/],
    'empty.zip': [Buffer.alloc(0), /empty file/],
    'text.zip': [Buffer.from('this is not an archive at all'), /not a ZIP, tar or SQL/],
    // directories: an explicit one twice is a duplicate; a directory entry is read and must be empty
    'dupdir.zip': [zip([...base, { name: 'extra/', dir: true }, { name: 'extra/', dir: true }]), /member extra\/: duplicate member/],
    'dirdata.zip': [zip([...base, { name: 'extra/', data: 'hidden bytes' }]), /member extra\/: directory entry carries data/],
    'tardirdata.tar': [tar([{ name: 'd/', type: '5', size: 512 }]), /directory entry carries data/],
    'tardupdir.tar': [tar([{ name: 'd/', dir: true }, { name: 'd/', dir: true }]), /duplicate member/],
    'sparse.tar': [tar([{ name: 'sparse.bin', type: 'S', data: 'x' }]), /GNU sparse member/]
  }
  for (const [name, [buf, re]] of Object.entries(cases)) {
    const input = writeInput(path.join(d, 'bad-' + name), { [name]: buf })
    const r = cli(['--input', input, '--out', out])
    assert.equal(r.status, 1, `${name}: ${r.stderr}`)
    assert.match(r.stderr, new RegExp(`asset ${name.replace('.', '\\.')}`), name)
    assert.match(r.stderr, re, name)
    assert.equal(readFileSync(path.join(out, 'inventory.json'), 'utf8'), before, `${name} replaced the earlier report`)
  }
})

test('inventory: resource limits — members, expansion ratio, expanded bytes, nesting depth — stop the run without output', () => {
  const d = scratch()
  const bomb = zip([{ name: 'zeros.bin', data: Buffer.alloc(8 << 20) }])
  const many = zip(Array.from({ length: 50 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' })))
  const deep = zip([{ name: 'l1.zip', store: true, data: zip([{ name: 'l2.zip', store: true, data: zip([{ name: 'l3.zip', store: true, data: zip([{ name: 'x', data: 'x' }]) }]) }]) }])
  // PAX records: "<len> key=value\n", the length counting itself
  const pax = (key, value) => {
    const body = ` ${key}=${value}\n`
    let n = body.length + 1
    while (String(n).length + body.length !== n) n++
    return `${n}${body}`
  }
  const paxBig = tar([{ name: 'PaxHeader', type: 'x', data: pax('comment', 'c'.repeat(2048 - 14)) }, { name: 'x', data: 'x' }])
  const paxChain = tar([...Array.from({ length: 5 }, () => ({ name: 'PaxHeader', type: 'x', data: pax('comment', 'c') })), { name: 'x', data: 'x' }])
  const longName = tar([{ name: '././@LongLink', type: 'L', data: 'n'.repeat(1499) + '\0' }, { name: 'x', data: 'x' }])
  const cases = [
    ['bomb.zip', bomb, [], /compression ratio above 200/],
    ['many.zip', many, ['--limit', 'maxMembers=10'], /the central directory declares 50 members; more than 10 in all/],
    ['cdir.zip', many, ['--limit', 'maxDirectoryBytes=100'], /central directory of \d+ bytes, more than 100 \(maxDirectoryBytes\)/],
    ['pax.tar', paxBig, ['--limit', 'maxDirectoryBytes=1000'], /tar metadata header of 2048 bytes, more than 1000 \(maxDirectoryBytes\)/],
    ['paxchain.tar', paxChain, ['--limit', 'maxMembers=3'], /more than 3 members/],
    ['longname.tar', longName, ['--limit', 'maxDirectoryBytes=1000'], /tar metadata header of 1500 bytes/],
    ['big.zip', bomb, ['--limit', 'maxExpandedBytes=1000000', '--limit', 'maxRatio=100000'], /more than 1000000 expanded bytes/],
    ['deep.zip', deep, [], /deeper than 2 levels/],
    ['meta.zip', zip(entriesOf(fixtures.t4())), ['--limit', 'maxMetadataBytes=100'], /larger than 100 bytes, the parse limit/],
    ['nested.zip', deep, ['--limit', 'maxNestedBytes=100'], /nested archive larger than 100 bytes/],
    ['rows.zip', zip(entriesOf(fixtures.t4())), ['--limit', 'maxSqlRows=3'], /more than 3 rows in the modelled tables/]
  ]
  assert.equal(Buffer.byteLength(pax('comment', 'c'.repeat(2048 - 14))), 2048)
  // a PAX header under the limits is read as usual
  const okPax = writeInput(path.join(d, 'okpax'), { 'okpax.tar': tar([{ name: 'PaxHeader', type: 'x', data: pax('comment', 'fine') }, { name: 'x', data: 'x' }]) })
  const okPaxScan = helperScan(path.join(okPax, 'okpax.tar'))
  assert.equal(okPaxScan.status, 0, okPaxScan.stderr)
  assert.deepEqual(JSON.parse(okPaxScan.stdout).containers[0].members, [['x', 'f', 1]])
  for (const [name, buf, extra, re] of cases) {
    const input = writeInput(path.join(d, name), { [name]: buf })
    const out = path.join(d, 'out-' + name)
    const r = cli(['--input', input, '--out', out, ...extra])
    assert.equal(r.status, 1, name)
    assert.match(r.stderr, re, name)
    assert.ok(!existsSync(out), `${name}: output directory created`)
  }
  // the helper honours its deadline
  const f = path.join(d, 'many.zip', 'many.zip')
  const r = helperScan(f, ['--deadline', '1'])
  assert.equal(r.status, 3)
  assert.match(r.stderr, /deadline passed/)
})

// ---------------------------------------------------------------- arguments
test('arguments: unknown, repeated, empty, contradictory and dangling options are usage errors; nothing is created', () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'a.zip': zip(entriesOf(fixtures.t4())), 'b.zip': zip(entriesOf(fixtures.t3())) })
  const out = path.join(d, 'out')
  const cases = [
    [['--input', input, '--out', out, '--bogus'], /unknown option --bogus/],
    [['--input', input, '--out', out, '--out', out], /--out given twice/],
    [['--input', input, '--out'], /--out needs a value/],
    [['--input', '', '--out', out], /--input needs a value/],
    [['--input', input, '--release', 'x', '--out', out], /exclusive/],
    [['--out', out], /give --input/],
    [['--input', input], /--out is required/],
    [['--input', input, '--out', out, 'extra'], /unexpected argument/],
    [['--input', input, '--out', out, '--tag', 'a'], /expected <id>=<tag>/],
    [['--input', input, '--out', out, '--tag', 'a=t1', '--tag', 'a=t2'], /names a twice/],
    [['--input', input, '--out', out, '--tag', 'a=t1', '--tag', 'b=t1'], /binds t1 to two/],
    [['--input', input, '--out', out, '--tag', 'zz=t1'], /no quickstart zz/],
    [['--input', input, '--out', out, '--verify-tags'], /needs at least one --tag/],
    [['--input', input, '--out', out, '--baseline', 'a'], /two different quickstart ids/],
    [['--input', input, '--out', out, '--baseline', 'a,a'], /two different quickstart ids/],
    [['--input', input, '--out', out, '--baseline', 'a,zz'], /no quickstart zz/],
    [['--input', input, '--out', out, '--image', 'x:1'], /give --baseline/],
    [['--input', input, '--out', out, '--timeout', '0'], /--timeout must be a positive/],
    [['--input', input, '--out', out, '--limit', 'maxBogus=1'], /--limit/],
    [['--input', input, '--out', out, '--repo', 'nope'], /owner\/name/],
    [['--verify-baseline', 'b.json', '--input', input, '--out', out], /takes only --input/],
    [['--input', input, '--out', out, '--verify-tags', '--verify-tags', '--tag', 'a=t'], /given twice/]
  ]
  for (const [args, re] of cases) {
    const r = cli(args)
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
    assert.match(r.stderr, re, args.join(' '))
    assert.ok(!existsSync(out), `${args.join(' ')} created the output`)
  }
})

test('input directory: missing, empty, symlinked, ambiguous grouping and empty sub-directories are refused before any output', () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const empty = writeInput(path.join(d, 'empty'), { 'notes.txt': 'x' })
  const twice = writeInput(path.join(d, 'twice'), { 'qs.zip': zip([{ name: 'x', data: 'x' }]), 'qs.tar.gz': gzipSync(tar([{ name: 'x', data: 'x' }])) })
  const dirAndFile = writeInput(path.join(d, 'dirfile'), { 'qs.zip': zip([{ name: 'x', data: 'x' }]), 'qs/db.sql': 'SELECT 1;' })
  const hollow = path.join(d, 'hollow')
  mkdirSync(path.join(hollow, 'sub'), { recursive: true })
  writeFileSync(path.join(hollow, 'sub', 'readme.md'), 'x')
  const linked = writeInput(path.join(d, 'linked'), {})
  symlinkSync(path.join(twice, 'qs.zip'), path.join(linked, 'qs.zip'))
  const fifo = writeInput(path.join(d, 'fifo'), {})
  assert.equal(spawnSync('mkfifo', [path.join(fifo, 'qs.zip')]).status, 0)
  const unreadable = writeInput(path.join(d, 'unreadable'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  chmodSync(path.join(unreadable, 'qs.zip'), 0o000)
  const cases = [
    [path.join(d, 'absent'), /does not exist/],
    [empty, /no quickstart archive/],
    [twice, /two sources for quickstart qs/],
    [dirAndFile, /two sources for quickstart qs/],
    [hollow, /sub-directory sub holds no archive/],
    [linked, /qs\.zip is a symlink — refused/],
    [fifo, /qs\.zip is not a file or directory — refused/],
    ...(process.getuid?.() === 0 ? [] : [[unreadable, /asset qs\.zip: cannot be read \(EACCES\)/]])
  ]
  for (const [input, re] of cases) {
    const r = cli(['--input', input, '--out', out])
    assert.equal(r.status, 1, `${input}: ${r.stderr}`)
    assert.match(r.stderr, re)
    assert.ok(!existsSync(out))
  }
})

// ---------------------------------------------------------------- output
/** The published set as a pinned reader sees it, checked for being one set: the Markdown is that of the JSON. */
function pinnedSet(out) {
  const set = readReports(out)
  const inv = JSON.parse(set.files['inventory.json'])
  assert.equal(set.files['inventory.md'], renderMarkdown(inv), `generation ${set.generation}: inventory.md is not that of inventory.json`)
  if (set.files['baseline.json'] !== null) assert.equal(JSON.parse(set.files['baseline.json']).inventorySha256, sha(set.files['inventory.json']))
  return { ...set, inv }
}
const generations = (out) => readdirSync(path.join(out, '.generations')).filter((n) => !n.startsWith('.holds')).sort()
const LOCK_DIR = '.quickstart-inventory.lock'
/** A lock as a writer leaves it: a directory with one owner file. */
function plantLock(out, owner) {
  const dir = path.join(out, LOCK_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `owner-${owner.pid}-test`), JSON.stringify(owner))
}
const failWith = (code) => () => {
  throw Object.assign(new Error('disk full'), { code })
}

test('output: a live lock refuses a second writer; an unwritable directory or a failure before the commit leaves the earlier set and no temporary file', async () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const before = pinnedSet(out)
  plantLock(out, ownerRecord())
  let r = cli(['--input', input, '--out', out])
  assert.equal(r.status, 1)
  assert.match(r.stderr, new RegExp(`another inventory \\(pid ${process.pid}\\) is writing here`))
  // an owner file that is not a record proves no one dead: refused too
  rmSync(path.join(out, LOCK_DIR), { recursive: true })
  mkdirSync(path.join(out, LOCK_DIR))
  writeFileSync(path.join(out, LOCK_DIR, 'owner-x'), 'not json')
  assert.match(cli(['--input', input, '--out', out]).stderr, /another inventory \(pid unknown\) is writing here/)
  // a lock left as a plain file is not a lock directory: refused, left alone
  rmSync(path.join(out, LOCK_DIR), { recursive: true })
  writeFileSync(path.join(out, LOCK_DIR), `${process.pid}\n`)
  assert.match(cli(['--input', input, '--out', out]).stderr, /\.quickstart-inventory\.lock exists and is not a lock directory — refused/)
  rmSync(path.join(out, LOCK_DIR))
  // a stale lock — a dead pid, or a live pid that now runs with another start time (reused) — is taken over
  for (const owner of [{ pid: 999999, started: null }, { pid: process.pid, started: 'Thu Jan  1 00:00:00 1970' }]) {
    plantLock(out, owner)
    assert.equal(cli(['--input', input, '--out', out]).status, 0, JSON.stringify(owner))
    assert.ok(!existsSync(path.join(out, LOCK_DIR)), JSON.stringify(owner))
  }
  const second = pinnedSet(out)
  assert.notEqual(second.generation, before.generation)
  const kept = generations(out)
  assert.equal(kept.length, 2)
  if (process.getuid?.() !== 0) {
    chmodSync(out, 0o555)
    r = cli(['--input', input, '--out', out])
    chmodSync(out, 0o755)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /reports not written|cannot write/)
    assert.equal(pinnedSet(out).generation, second.generation)
  }
  const o = parseCli(['--input', writeInput(path.join(d, 'in2'), { 'qs.zip': zip(entriesOf(fixtures.t3())) }), '--out', out])
  // a failure while the generation is written, and one after it is complete but before the switch
  for (const hooks of [{ afterWrite: failWith('ENOSPC') }, { beforeCommit: failWith('ENOSPC') }]) {
    await assert.rejects(runInventory(o, { hooks }), /reports not written \(ENOSPC\); earlier reports left as they were/)
    const now = pinnedSet(out)
    assert.equal(now.generation, second.generation)
    assert.equal(now.inv.quickstarts[0].framework, 'T4')
    assert.equal(readInv(out).quickstarts[0].framework, 'T4')
    assert.deepEqual(readdirSync(out).sort(), ['.generations', 'baseline.json', 'current', 'inventory.json', 'inventory.md'], 'no temporary or lock file left')
    assert.deepEqual(generations(out), kept, 'the unpublished generation is removed')
  }
})

test('output: one generation per run, switched by one rename — a stale baseline.json does not outlive a set without one; reports of an earlier tool version migrate with their bytes', async () => {
  const d = scratch()
  const out = path.join(d, 'out')
  mkdirSync(out)
  // reports as an earlier version of the tool left them: regular files, no pointer
  const legacy = { 'inventory.json': '{"schema":"an earlier inventory"}\n', 'inventory.md': '# an earlier inventory\n', 'baseline.json': '{"schema":"an earlier baseline"}\n' }
  for (const [n, t] of Object.entries(legacy)) writeFileSync(path.join(out, n), t)
  writeFileSync(path.join(out, 'notes.txt'), 'not a report\n')
  const conventional = () => Object.fromEntries(Object.keys(legacy).map((n) => [n, existsSync(path.join(out, n)) ? readFileSync(path.join(out, n), 'utf8') : null]))
  const o = parseCli(['--input', writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(fixtures.t3())) }), '--out', out])
  // up to the switch the earlier bytes are what every name shows, even after the migration to links
  let seen = null
  await assert.rejects(runInventory(o, { hooks: { beforeCommit: () => { seen = conventional(); failWith('EIO')() } } }), /reports not written \(EIO\)/)
  assert.deepEqual(seen, legacy)
  assert.deepEqual(conventional(), legacy)
  const kept = readReports(out)
  assert.match(kept.generation, /-legacy$/)
  assert.deepEqual(kept.files, legacy)
  // success: the three names move together; this run writes no baseline, so none is shown
  let atCommit = null
  await runInventory(o, { hooks: { afterCommit: () => (atCommit = conventional()) } })
  assert.equal(atCommit['baseline.json'], null, 'the earlier baseline.json is not shown beside the new set')
  assert.equal(JSON.parse(atCommit['inventory.json']).quickstarts[0].framework, 'T3')
  const now = pinnedSet(out)
  assert.equal(now.files['baseline.json'], null)
  assert.equal(readFileSync(path.join(out, 'notes.txt'), 'utf8'), 'not a report\n', 'a file that is not a report is left alone')
  assert.deepEqual(generations(out), [kept.generation, now.generation].sort(), 'the new generation and the one it replaced')
  // a later run keeps two generations only
  await runInventory(o)
  const third = pinnedSet(out)
  assert.deepEqual(generations(out), [now.generation, third.generation].sort())
  // what the pointer and the report names must be: anything else is refused, not replaced
  const odd = path.join(d, 'odd')
  mkdirSync(path.join(odd, 'inventory.json'), { recursive: true })
  await assert.rejects(runInventory({ ...o, out: odd }), /inventory\.json exists and is not a report — refused/)
  const odd2 = path.join(d, 'odd2')
  mkdirSync(odd2)
  writeFileSync(path.join(odd2, 'current'), 'x')
  await assert.rejects(runInventory({ ...o, out: odd2 }), /current exists and is not the report pointer — refused/)
  assert.equal(readFileSync(path.join(odd2, 'current'), 'utf8'), 'x')
})

test('output: a writer killed at any point leaves one complete readable set; the next run takes over its lock and removes what it left', async () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const t4 = writeInput(path.join(d, 'in4'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  const t3 = writeInput(path.join(d, 'in3'), { 'qs.zip': zip(entriesOf(fixtures.t3())) })
  assert.equal(cli(['--input', t4, '--out', out]).status, 0)
  const child = path.join(d, 'kill-at.mjs')
  writeFileSync(
    child,
    `import { parseCli, runInventory } from ${JSON.stringify(pathToFileURL(CLI).href)}\n` +
      `const [at, input, out] = process.argv.slice(2)\n` +
      `const die = () => process.kill(process.pid, 'SIGKILL')\n` +
      `const hooks = { afterWrite: at === 'afterWrite' ? die : undefined, beforeCommit: at === 'beforeCommit' ? die : undefined, afterCommit: at === 'afterCommit' ? die : undefined }\n` +
      `await runInventory(parseCli(['--input', input, '--out', out]), { hooks })\n`
  )
  for (const [at, framework] of [['afterWrite', 'T4'], ['beforeCommit', 'T4'], ['afterCommit', 'T3']]) {
    const before = pinnedSet(out)
    const r = spawnSync(process.execPath, [child, at, t3, out], { encoding: 'utf8' })
    assert.equal(r.signal, 'SIGKILL', `${at}: ${r.stderr}`)
    const now = pinnedSet(out)
    assert.equal(now.inv.quickstarts[0].framework, framework, at)
    assert.equal(readInv(out).quickstarts[0].framework, framework, at)
    if (at !== 'afterCommit') assert.equal(now.generation, before.generation, at)
    assert.ok(existsSync(path.join(out, '.quickstart-inventory.lock')), `${at}: the killed writer's lock is left`)
    // the next run: the dead writer's lock is taken over, its unfinished generation removed
    assert.equal(cli(['--input', t4, '--out', out]).status, 0, at)
    assert.equal(pinnedSet(out).inv.quickstarts[0].framework, 'T4')
    assert.ok(!generations(out).some((n) => n.startsWith('.tmp-')), `${at}: an unfinished generation is left`)
    assert.ok(!existsSync(path.join(out, '.quickstart-inventory.lock')))
    assert.ok(generations(out).length <= 2)
  }
  // a migration of earlier-version reports killed part-way: those reports stay readable, byte for byte
  for (const at of ['afterWrite', 'beforeCommit']) {
    const old = path.join(d, `legacy-${at}`)
    mkdirSync(old)
    writeFileSync(path.join(old, 'inventory.json'), '{"schema":"earlier"}\n')
    writeFileSync(path.join(old, 'inventory.md'), '# earlier\n')
    const r = spawnSync(process.execPath, [child, at, t3, old], { encoding: 'utf8' })
    assert.equal(r.signal, 'SIGKILL', `${at}: ${r.stderr}`)
    assert.equal(readFileSync(path.join(old, 'inventory.json'), 'utf8'), '{"schema":"earlier"}\n', at)
    assert.equal(readFileSync(path.join(old, 'inventory.md'), 'utf8'), '# earlier\n', at)
    assert.equal(cli(['--input', t3, '--out', old]).status, 0, at)
    assert.equal(pinnedSet(old).inv.quickstarts[0].framework, 'T3')
    assert.ok(!generations(old).some((n) => n.startsWith('.tmp-')), at)
    assert.ok(generations(old).length <= 2, `${at}: ${generations(old)}`)
  }
})

test('output: readers that pin a generation always see one set while writers publish; writers never interleave', async () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const inputs = [writeInput(path.join(d, 'in4'), { 'qs.zip': zip(entriesOf(fixtures.t4())) }), writeInput(path.join(d, 'in3'), { 'qs.zip': zip(entriesOf(fixtures.t3())) })]
  assert.equal(cli(['--input', inputs[0], '--out', out]).status, 0)
  // a reader in another process: resolves the generation once per read and checks the set is one
  const reader = path.join(d, 'reader.mjs')
  writeFileSync(
    reader,
    `import { existsSync } from 'node:fs'\nimport { readReports, renderMarkdown } from ${JSON.stringify(pathToFileURL(CLI).href)}\n` +
      `const [out, stop] = process.argv.slice(2); let reads = 0, mixed = 0, gone = 0; const seen = new Set(); const failures = []\n` +
      `while (!existsSync(stop)) { let set; try { set = readReports(out) } catch (e) { gone++; failures.push({ case: 'readReports threw', message: e.message }); continue } if (set.files['inventory.json'] === null) { gone++; failures.push({ case: 'inventory.json is null', generation: set.generation }); continue }\n` +
      `  reads++; seen.add(set.generation); if (renderMarkdown(JSON.parse(set.files['inventory.json'])) !== set.files['inventory.md']) mixed++ }\n` +
      `console.log(JSON.stringify({ reads, mixed, gone, generations: seen.size, failures }))\n`
  )
  const run = (cmd, args) =>
    new Promise((resolve) => {
      const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      p.stdout.on('data', (b) => (stdout += b))
      p.stderr.on('data', (b) => (stderr += b))
      p.on('close', (status) => resolve({ status, stdout, stderr }))
    })
  // the reader reads for as long as the writers publish (an event, not a fixed window)
  const stopFile = path.join(d, 'reader.stop')
  const readerDone = run(process.execPath, [reader, out, stopFile])
  const results = []
  for (let i = 0; i < 6; i++) {
    // two writers at once: each either publishes or is refused by the lock
    results.push(...(await Promise.all([0, 1].map((k) => run(process.execPath, [CLI, '--input', inputs[(i + k) % 2], '--out', out])))))
  }
  writeFileSync(stopFile, '')
  const rd = JSON.parse((await readerDone).stdout)
  assert.equal(rd.mixed, 0, JSON.stringify(rd))
  assert.equal(rd.gone, 0, JSON.stringify(rd))
  assert.ok(rd.reads > 0 && rd.generations > 1, JSON.stringify(rd))
  for (const r of results) assert.ok(r.status === 0 || /another inventory \(pid \d+\) is writing here/.test(r.stderr), r.stderr)
  assert.ok(results.some((r) => r.status === 0))
  pinnedSet(out)
  // a writer that starts while another holds the lock is refused, and changes nothing
  const o = parseCli(['--input', inputs[1], '--out', out])
  let refused = null
  await runInventory(o, { hooks: { beforeCommit: () => (refused = spawnSync(process.execPath, [CLI, '--input', inputs[0], '--out', out], { encoding: 'utf8' })) } })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /another inventory \(pid \d+\) is writing here/)
  assert.equal(pinnedSet(out).inv.quickstarts[0].framework, 'T3')
})

test('output: writers that find the same stale lock break it once — only one publishes at a time', async () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const input = writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const log = path.join(d, 'inside.log')
  const child = path.join(d, 'breaker.mjs')
  // every writer waits after it judged the lock stale, so all of them judge the same dead owner
  writeFileSync(
    child,
    `import { appendFileSync } from 'node:fs'\nimport { parseCli, runInventory } from ${JSON.stringify(pathToFileURL(CLI).href)}\n` +
      `const [input, out, log] = process.argv.slice(2)\nconst sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)\n` +
      `const hooks = { beforeBreak: () => sleep(400), beforeCommit: () => { appendFileSync(log, process.pid + ' in ' + Date.now() + '\\n'); sleep(300); appendFileSync(log, process.pid + ' out ' + Date.now() + '\\n') } }\n` +
      `try { await runInventory(parseCli(['--input', input, '--out', out]), { hooks }) } catch (e) { console.error(e.message); process.exit(1) }\n`
  )
  const run = () =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [child, input, out, log], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      p.stderr.on('data', (b) => (stderr += b))
      p.on('close', (status) => resolve({ status, stderr }))
    })
  for (let round = 0; round < 3; round++) {
    plantLock(out, { pid: 999999, started: null })
    writeFileSync(log, '')
    const results = await Promise.all([run(), run(), run()])
    for (const r of results) assert.ok(r.status === 0 || /another inventory \(pid \d+\) is writing here/.test(r.stderr), r.stderr)
    assert.ok(results.some((r) => r.status === 0), JSON.stringify(results))
    // the time each writer spent between its lock and its commit: never two at once
    const spans = {}
    for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
      const [pid, what, at] = line.split(' ')
      ;(spans[pid] ??= {})[what] = Number(at)
    }
    const sorted = Object.values(spans).sort((a, b) => a.in - b.in)
    assert.equal(sorted.length, results.filter((r) => r.status === 0).length)
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].in >= sorted[i - 1].out, `round ${round}: two writers inside the lock ${JSON.stringify(sorted)}`)
    assert.ok(!existsSync(path.join(out, LOCK_DIR)))
    pinnedSet(out)
  }
})

test('output: a generation a reader holds outlives later publications; a hold of a reader that is gone does not', () => {
  const d = scratch()
  const out = path.join(d, 'out')
  const inputs = [writeInput(path.join(d, 'in4'), { 'qs.zip': zip(entriesOf(fixtures.t4())) }), writeInput(path.join(d, 'in3'), { 'qs.zip': zip(entriesOf(fixtures.t3())) })]
  assert.equal(cli(['--input', inputs[0], '--out', out]).status, 0)
  const g1 = pinnedSet(out)
  const holds = path.join(out, '.generations', '.holds')
  mkdirSync(holds, { recursive: true })
  const hold = path.join(holds, `${g1.generation}~test`)
  writeFileSync(hold, JSON.stringify(ownerRecord())) // this process: alive
  for (const i of [1, 0, 1]) assert.equal(cli(['--input', inputs[i], '--out', out]).status, 0)
  assert.ok(generations(out).includes(g1.generation), 'the held generation was removed')
  assert.equal(readFileSync(path.join(g1.dir, 'inventory.json'), 'utf8'), g1.files['inventory.json'])
  assert.equal(readFileSync(path.join(g1.dir, 'inventory.md'), 'utf8'), g1.files['inventory.md'])
  // a writer killed while it retired the held generation: put back by the next run
  renameSync(g1.dir, path.join(out, '.generations', `.gone-${g1.generation}`))
  assert.equal(cli(['--input', inputs[0], '--out', out]).status, 0)
  assert.ok(generations(out).includes(g1.generation))
  assert.ok(!generations(out).some((n) => n.startsWith('.gone-')))
  // the reader is gone: its hold no longer keeps the generation
  writeFileSync(hold, JSON.stringify({ pid: 999999, started: null }))
  assert.equal(cli(['--input', inputs[1], '--out', out]).status, 0)
  assert.ok(!generations(out).includes(g1.generation))
  assert.ok(!existsSync(hold), 'the dead reader hold is removed')
  assert.equal(generations(out).length, 2)
})

test('output: short writes are completed; a write that makes no progress or a failed directory flush publishes nothing', (t) => {
  const d = scratch()
  const out = path.join(d, 'out')
  const big = JSON.stringify({ rows: Array.from({ length: 4000 }, (_, i) => `row ${i} ✓`) })
  const files = { 'inventory.json': big, 'inventory.md': '# set one\n' }
  const realWrite = fs.writeSync
  const realFsync = fs.fsyncSync
  const patch = (name, fn) => {
    t.mock.method(fs, name, fn)
    syncBuiltinESMExports()
  }
  const restore = () => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
  // the file system takes at most 7 bytes per call: every byte still lands
  patch('writeSync', (fd, buf, off, len) => realWrite(fd, buf, off, Math.min(len, 7)))
  try {
    publish(out, files)
  } finally {
    restore()
  }
  assert.deepEqual(readReports(out).files, { ...files, 'baseline.json': null })
  const first = readReports(out).generation
  // a write of a report that makes no progress: refused, the earlier set stays
  patch('writeSync', (fd, buf, off, len) => (Buffer.isBuffer(buf) && buf.includes('# two') ? 0 : realWrite(fd, buf, off, len)))
  try {
    assert.throws(() => publish(out, { 'inventory.json': '{}', 'inventory.md': '# two\n' }), /reports not written \(EIO\); earlier reports left as they were/)
  } finally {
    restore()
  }
  assert.equal(readReports(out).generation, first)
  // a directory flush that fails is a failure; one the file system does not support is not
  const dirFsync = (code) => (fd) => {
    if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error(code), { code })
    return realFsync(fd)
  }
  patch('fsyncSync', dirFsync('EIO'))
  try {
    assert.throws(() => publish(out, { 'inventory.json': '{}', 'inventory.md': '# three\n' }), /reports not written \(EIO\)/)
  } finally {
    restore()
  }
  assert.equal(readReports(out).generation, first)
  assert.ok(!generations(out).some((n) => n.startsWith('.tmp-')))
  patch('fsyncSync', dirFsync('EINVAL'))
  try {
    publish(out, { 'inventory.json': '{}', 'inventory.md': '# four\n' })
  } finally {
    restore()
  }
  assert.equal(readReports(out).files['inventory.md'], '# four\n')
})

test('output: an asset that changes after it was read is not reported', async () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(fixtures.t4())) })
  const out = path.join(d, 'out')
  const o = parseCli(['--input', input, '--out', out])
  await assert.rejects(
    runInventory(o, { hooks: { afterScan: () => writeFileSync(path.join(input, 'qs.zip'), zip(entriesOf(fixtures.t3()))) } }),
    /asset qs\.zip: changed or removed after it was read/
  )
  assert.ok(!existsSync(out))
})

test('markdown: hostile text from manifests is escaped; unknown and empty stay distinct', () => {
  assert.equal(md('<script>|x*`'), '&lt;script&gt;\\|x\\*\\`')
  assert.equal(md('a\nb'), 'a b')
  assert.equal(md(null), '—')
  const d = scratch()
  const hostile = manifest('template', '<img src=x onerror=alert(1)>|pipe', '1.0', { attrs: 'client="site"' })
  const input = writeInput(path.join(d, 'in'), { 'h.zip': zip(entriesOf(site({ templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/a.json': '{}' } }], customSql: customFor('tpl_t4', { styleTitle: '</td><script>x</script>' }) }))) })
  const out = path.join(d, 'out')
  assert.equal(cli(['--input', input, '--out', out]).status, 0)
  const text = readFileSync(path.join(out, 'inventory.md'), 'utf8')
  assert.ok(!/<script>|<\/td>/.test(text))
  assert.ok(text.includes('&lt;/td&gt;&lt;script&gt;'))
  void hostile
  // replayTables: never created ≠ created and empty
  const none = replayTables([])
  assert.equal(none.template_styles.known, false)
  const emptyTable = replayTables([{ label: 'x', parsed: { ops: [{ op: 'create', table: 'template_styles', prefix: '#__' }] } }])
  assert.deepEqual(emptyTable.template_styles, { known: true, rows: [] })
})

test('inventory.json is deterministic: two runs over the same input are byte-identical', () => {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'a.zip': zip(entriesOf(fixtures.t3())), 'b.zip': zip(entriesOf(fixtures.t4())) })
  assert.equal(cli(['--input', input, '--out', path.join(d, 'o1')]).status, 0)
  assert.equal(cli(['--input', input, '--out', path.join(d, 'o2')]).status, 0)
  for (const f of ['inventory.json', 'inventory.md']) assert.equal(readFileSync(path.join(d, 'o1', f), 'utf8'), readFileSync(path.join(d, 'o2', f), 'utf8'))
  assert.equal(typeof analyseQuickstart, 'function')
  assert.equal(typeof renderMarkdown, 'function')
})

// ---------------------------------------------------------------- releases (mocked gh) and baselines
/** A fake `gh`/`docker` on PATH, answering from files in `dir`. */
function fakeBin(dir, { gh = null, docker = null } = {}) {
  const bin = path.join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const node = process.execPath
  if (gh) {
    writeFileSync(path.join(dir, 'gh.json'), JSON.stringify(gh))
    writeFileSync(
      path.join(bin, 'gh'),
      `#!${node}\nconst fs=require('fs'),p=require('path');const cfg=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, 'gh.json'))},'utf8'));const a=process.argv.slice(2);\n` +
        `if(cfg.fail){process.stderr.write(cfg.fail+'\\n');process.exit(1)}\n` +
        `const tag=a[2];const rel=cfg.releases[tag];if(!rel){process.stderr.write('release not found\\n');process.exit(1)}\n` +
        `if(a[1]==='view'){process.stdout.write(JSON.stringify(rel.view));process.exit(0)}\n` +
        `if(a[1]==='download'){const dest=a[a.indexOf('-D')+1];for(let i=0;i<a.length;i++)if(a[i]==='-p'){const n=a[i+1];fs.mkdirSync(dest,{recursive:true});const b=Buffer.from(rel.files[n],'base64');if(rel.linkOut){const o=p.join(p.dirname(dest),'outside-'+n);fs.writeFileSync(o,b);fs.symlinkSync(o,p.join(dest,n))}else fs.writeFileSync(p.join(dest,n),b)}if(rel.linkDir){fs.renameSync(dest,dest+'-moved');fs.symlinkSync(dest+'-moved',dest)}process.exit(0)}\nprocess.exit(9)\n`
    )
    chmodSync(path.join(bin, 'gh'), 0o755)
  }
  if (docker) {
    writeFileSync(path.join(dir, 'docker.json'), JSON.stringify(docker))
    writeFileSync(
      path.join(bin, 'docker'),
      `#!${node}\nconst cfg=JSON.parse(require('fs').readFileSync(${JSON.stringify(path.join(dir, 'docker.json'))},'utf8'));const ref=process.argv[4];const i=cfg[ref];if(!i){process.stderr.write('No such image: '+ref+'\\n');process.exit(1)}process.stdout.write(JSON.stringify([i]))\n`
    )
    chmodSync(path.join(bin, 'docker'), 0o755)
  }
  return { PATH: `${bin}:${process.env.PATH}` }
}
const releaseOf = (tag, files, { digestOverride = {} } = {}) => ({
  view: {
    tagName: tag,
    assets: [
      ...Object.entries(files).map(([name, buf]) => ({ name, size: buf.length, digest: `sha256:${digestOverride[name] ?? sha(buf)}` })),
      { name: 'tracy_setting.json', size: 2, digest: `sha256:${sha(Buffer.from('{}'))}` }
    ]
  },
  files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, b.toString('base64')]))
})

test('release mode: tags are downloaded with a mocked gh, checked against the release digests, and bound to the answer for the tag asked', async () => {
  const d = scratch()
  const nova = zip(entriesOf(fixtures.t4()))
  const morgan = zip(entriesOf(fixtures.t3()))
  const env = fakeBin(d, {
    gh: { releases: { 'quickstart/x-nova/j6': releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }), 'quickstart/x-morgan/j6': releaseOf('quickstart/x-morgan/j6', { 'x-morgan-j6-quickstart.zip': morgan }) } }
  })
  const out = path.join(d, 'out')
  const keep = path.join(d, 'dl')
  const r = cli(['--release', 'quickstart/x-nova/j6', '--release', 'quickstart/x-morgan/j6', '--out', out, '--download-dir', keep], env)
  assert.equal(r.status, 0, r.stderr)
  const inv = readInv(out)
  assert.deepEqual(inv.quickstarts.map((q) => [q.id, q.tag.value, q.tag.source, q.framework]), [
    ['x-morgan-j6', 'quickstart/x-morgan/j6', 'release', 'T3'],
    ['x-nova-j6', 'quickstart/x-nova/j6', 'release', 'T4']
  ])
  assert.equal(inv.quickstarts[1].assets[0].sha256, sha(nova))
  assert.deepEqual(inv.quickstarts[1].otherReleaseAssets.map((a) => a.name), ['tracy_setting.json'])
  assert.ok(existsSync(path.join(keep, 'x-nova-j6', 'x-nova-j6-quickstart.zip')))

  // a download that does not match the release digest
  const bad = fakeBin(path.join(d, 'bad'), { gh: { releases: { 'quickstart/x-nova/j6': releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }, { digestOverride: { 'x-nova-j6-quickstart.zip': 'f'.repeat(64) } }) } } })
  let e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o2')], bad)
  assert.equal(e.status, 1)
  assert.match(e.stderr, /has SHA-256 [0-9a-f]{64}, the release says f{64}/)
  // truncated download (size differs from the release): the temporary directory is removed
  const tmpRoot = path.join(d, 'tmp')
  mkdirSync(tmpRoot)
  const short = releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova })
  short.files['x-nova-j6-quickstart.zip'] = nova.subarray(0, 100).toString('base64')
  const trunc = fakeBin(path.join(d, 'trunc'), { gh: { releases: { 'quickstart/x-nova/j6': short } } })
  e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o8')], { ...trunc, TMPDIR: tmpRoot })
  assert.equal(e.status, 1)
  assert.match(e.stderr, /is 100 bytes, the release says \d+ \(truncated or changed\)/)
  assert.deepEqual((await import('node:fs')).readdirSync(tmpRoot), [], 'temporary download directory removed')
  // two assets with one name
  const dupView = releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova })
  dupView.view.assets.push(dupView.view.assets[0])
  const dup = fakeBin(path.join(d, 'dup'), { gh: { releases: { 'quickstart/x-nova/j6': dupView } } })
  e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o9')], dup)
  assert.match(e.stderr, /two assets share a name/)
  // an answer about another tag
  const late = fakeBin(path.join(d, 'late'), { gh: { releases: { 'quickstart/x-nova/j6': { view: { tagName: 'quickstart/other/j6', assets: [] } } } } })
  e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o3')], late)
  assert.match(e.stderr, /answered for "quickstart\/other\/j6", not the tag asked/)
  // authentication failure / unavailable release
  const auth = fakeBin(path.join(d, 'auth'), { gh: { fail: 'HTTP 401: Bad credentials' } })
  e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o4')], auth)
  assert.match(e.stderr, /gh exited 1: HTTP 401: Bad credentials/)
  e = cli(['--release', 'quickstart/none/j6', '--out', path.join(d, 'o5')], env)
  assert.match(e.stderr, /release not found/)
  // malformed answer
  const junk = fakeBin(path.join(d, 'junk'), { gh: { releases: { 'quickstart/x-nova/j6': { view: 'not json object' } } } })
  e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o6')], junk)
  assert.equal(e.status, 1)
  // gh not installed
  const nogh = path.join(d, 'nogh')
  mkdirSync(nogh)
  symlinkSync(process.execPath, path.join(nogh, 'node'))
  e = spawnSync(process.execPath, [CLI, '--release', 'quickstart/x-nova/j6', '--out', path.join(d, 'o7')], { encoding: 'utf8', env: { ...process.env, PATH: nogh } })
  assert.match(e.stderr, /gh is not installed or not on PATH/)
  // a download left as a link, or a download directory swapped for one, is refused, not followed —
  // even though the bytes behind the link are the release's own
  for (const [o, how, re] of [
    ['o10', 'linkOut', /x-nova-j6-quickstart\.zip is not a regular file inside --input \(x-nova-j6-quickstart\.zip is a symlink, not followed\)/],
    ['o11', 'linkDir', /x-nova-j6-quickstart\.zip cannot be reached: .*x-nova-j6, on the resolved --input .* is a symlink now/]
  ]) {
    const rel = releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova })
    rel[how] = true
    const linked = fakeBin(path.join(d, how), { gh: { releases: { 'quickstart/x-nova/j6': rel } } })
    e = cli(['--release', 'quickstart/x-nova/j6', '--out', path.join(d, o), '--download-dir', path.join(d, `${how}-dl`)], linked)
    assert.equal(e.status, 1, e.stderr)
    assert.match(e.stderr, re)
  }
  for (const o of ['o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10', 'o11']) assert.ok(!existsSync(path.join(d, o)), `${o} created`)
})

/**
 * A git repository holding a copy of the tool (and the two modules it imports), so the commit
 * identity a baseline records does not depend on whether this checkout is committed.
 */
function toolRepo(d) {
  const repo = path.join(d, 'tool-repo')
  for (const rel of ['ingest/quickstart-inventory.mjs', 'ingest/quickstart-inventory-archive.py', 'ingest/source-font.mjs', 'lib/cli-args.mjs', 'lib/parity-acceptance.mjs', 'quickstart/lib.mjs', 'lib/wp-cli.mjs']) {
    mkdirSync(path.dirname(path.join(repo, 'scripts', rel)), { recursive: true })
    writeFileSync(path.join(repo, 'scripts', rel), readFileSync(path.join(HERE, '..', rel)))
  }
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-q')
  git('add', '.')
  git('commit', '-q', '-m', 'tool')
  const cliPath = path.join(repo, 'scripts', 'ingest', 'quickstart-inventory.mjs')
  return { root: repo, git, cli: (args, env = {}) => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 }) }
}

test('baseline: pair bound by release digests, image digests resolved or pinned, tool files in a commit; strict verification catches every drift', async () => {
  const d = scratch()
  const tool = toolRepo(d)
  const nova = zip(entriesOf(fixtures.t4()))
  const morgan = zip(entriesOf(fixtures.t3()))
  const input = writeInput(path.join(d, 'in'), { 'x-nova.zip': nova, 'x-morgan.zip': morgan, 'other.zip': zip(entriesOf(fixtures.gavick())) })
  const digest = 'sha256:' + 'a'.repeat(64)
  const env = fakeBin(d, {
    gh: { releases: { 'quickstart/x-nova/j6': releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }), 'quickstart/x-morgan/j6': releaseOf('quickstart/x-morgan/j6', { 'x-morgan-j6-quickstart.zip': morgan }) } },
    docker: { 'wordpress:php8.3-apache': { Id: digest, RepoDigests: [`wordpress@${digest}`] }, 'local:dev': { Id: digest, RepoDigests: [] } }
  })
  const out = path.join(d, 'out')
  const args = ['--input', input, '--out', out, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--verify-tags', '--baseline', 'x-nova,x-morgan']
  let r = tool.cli([...args, '--image', 'wordpress:php8.3-apache', '--image', `mariadb:11@sha256:${'b'.repeat(64)}`], env)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stderr, '')
  const bpath = path.join(out, 'baseline.json')
  const b = JSON.parse(readFileSync(bpath, 'utf8'))
  assert.equal(b.complete, true, JSON.stringify(b.gaps))
  assert.deepEqual(b.pair, ['x-nova', 'x-morgan'])
  assert.deepEqual(b.quickstarts.map((q) => [q.tag.value, q.tag.source, q.tag.bindings[0].releaseAsset, q.tag.bindings[0].sha256, q.framework]), [
    ['quickstart/x-nova/j6', 'release-digest', 'x-nova-j6-quickstart.zip', sha(nova), 'T4'],
    ['quickstart/x-morgan/j6', 'release-digest', 'x-morgan-j6-quickstart.zip', sha(morgan), 'T3']
  ])
  assert.deepEqual(b.runtimeImages.map((i) => [i.ref, i.digest, i.source]), [
    ['mariadb:11@sha256:' + 'b'.repeat(64), 'sha256:' + 'b'.repeat(64), 'declared'],
    ['wordpress:php8.3-apache', digest, 'docker image inspect']
  ])
  assert.equal(b.tool.gitHead, tool.git('rev-parse', 'HEAD'))
  assert.deepEqual(b.tool.identity, { kind: 'commit', commit: tool.git('rev-parse', 'HEAD') })
  assert.deepEqual(b.tool.implementationFiles.map((f) => f.state), ['committed', 'committed', 'committed'])
  assert.equal(b.inventorySha256, sha(readFileSync(path.join(out, 'inventory.json'))))
  const ok = tool.cli(['--verify-baseline', bpath, '--input', input])
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /verified/)

  // drift: each mutation is one named problem
  const invText = readFileSync(path.join(out, 'inventory.json'), 'utf8')
  const mutate = async (fn, inventory = invText) => {
    const copy = JSON.parse(JSON.stringify(b))
    fn(copy)
    return (await verifyBaseline(copy, input, { root: tool.root, inventory })).join('\n')
  }
  assert.equal(await mutate(() => {}), '')
  assert.match(await mutate((c) => (c.quickstarts[0].tag.value = c.quickstarts[1].tag.value)), /bound to both quickstarts/)
  assert.match(await mutate((c) => (c.quickstarts[0].tag.bindings[0].sha256 = 'c'.repeat(64))), /binding of x-nova\.zip carries c{64}/)
  assert.match(await mutate((c) => (c.quickstarts[0].tag.bindings[0].sha256 = null)), /release quickstart\/x-nova\/j6 gives no SHA-256 for x-nova-j6-quickstart\.zip/)
  assert.match(await mutate((c) => (c.quickstarts[0].tag.source = 'declared')), /is declared, not checked against the release digests/)
  // absent or empty bindings, and an asset no binding names
  assert.match(await mutate((c) => (c.quickstarts[0].tag.bindings = [])), /x-nova: tag quickstart\/x-nova\/j6 has no asset binding/)
  assert.match(await mutate((c) => delete c.quickstarts[1].tag.bindings), /x-morgan: tag quickstart\/x-morgan\/j6 has no asset binding/)
  assert.match(await mutate((c) => (c.quickstarts[0].tag.bindings[0].asset = 'elsewhere.zip')), /binding names elsewhere\.zip, which is not a baseline asset[\s\S]*asset x-nova\.zip is not bound/)
  assert.match(await mutate((c) => delete c.quickstarts[0].tag), /x-nova: no tag/)
  assert.match(await mutate((c) => (c.pair = ['x-morgan', 'x-nova'])), /exactly the pair, in order/)
  assert.match(await mutate((c) => (c.runtimeImages[1].digest = null)), /wordpress:php8\.3-apache: no immutable sha256 digest/)
  // the rule generation applies, applied again: an image digest of another repository, a pin that differs,
  // a HEAD that is missing or not the producing commit, a format that is not a known archive kind
  const evil = (c) => (c.runtimeImages[1].repoDigest = c.runtimeImages[1].repoDigest.replace(/^[^@]+/, 'evil/wordpress'))
  assert.match(await mutate(evil), /wordpress:php8\.3-apache: repository digest evil\/wordpress@sha256:[0-9a-f]{64} names another repository/)
  assert.match(await mutate((c) => (c.runtimeImages[0].ref = 'mariadb:11@sha256:' + 'c'.repeat(64))), /pinned digest differs from the recorded sha256:b{64}/)
  assert.match(await mutate((c) => delete c.tool.gitHead), /tool commit: git HEAD could not be read/)
  assert.match(await mutate((c) => (c.tool.gitHead = 'e'.repeat(40))), /tool: commit [0-9a-f]{40} is not the recorded HEAD e{40}[\s\S]*tool: HEAD e{40} is not in this repository/)
  assert.match(await mutate((c) => (c.quickstarts[0].format = 'unknown')), /x-nova: format unknown/)
  assert.match(await mutate((c) => delete c.quickstarts[1].format), /x-morgan: format undefined/)
  assert.match(await mutate((c) => (c.quickstarts[1].assets[0].sha256 = null)), /x-morgan: asset x-morgan\.zip carries no SHA-256 and size/)
  // …and generation reaches the same verdict from the same fields
  const inv = JSON.parse(readFileSync(path.join(out, 'inventory.json'), 'utf8'))
  const again = (images, toolOver = {}) => buildBaseline({ inventory: inv, pair: b.pair, images, tool: { ...b.tool, ...toolOver }, inventorySha256: b.inventorySha256, createdAt: b.createdAt })
  assert.equal(again(b.runtimeImages).complete, true, JSON.stringify(again(b.runtimeImages).gaps))
  const forged = JSON.parse(JSON.stringify(b))
  evil(forged)
  assert.match(again(forged.runtimeImages).gaps.join('\n'), /repository digest evil\/wordpress@sha256:[0-9a-f]{64} names another repository/)
  assert.deepEqual(again(b.runtimeImages, { gitHead: null }).gaps, ['tool commit: git HEAD could not be read'])
  const fmt = JSON.parse(JSON.stringify(inv))
  fmt.quickstarts.find((q) => q.id === 'x-nova').format = 'mystery'
  assert.match(buildBaseline({ inventory: fmt, pair: b.pair, images: b.runtimeImages, tool: b.tool }).gaps.join('\n'), /x-nova: format mystery/)
  assert.match(await mutate((c) => (c.tool.implementationFiles[0].sha256 = '0'.repeat(64))), /tool: scripts\/ingest\/quickstart-inventory\.mjs in commit [0-9a-f]{40} is [0-9a-f]{64}, the baseline recorded 0{64}/)
  assert.match(await mutate((c) => (c.tool.identity = { kind: 'none', why: 'x (unstaged) not in the index as written' })), /tool version: x \(unstaged\) not in the index as written — commit or stage/)
  assert.match(await mutate((c) => delete c.tool.identity), /tool version: not recorded/)
  assert.match(await mutate((c) => (c.tool.identity.commit = 'f'.repeat(40))), /tool: commit f{40} is not in this repository/)
  assert.match(await mutate((c) => (c.tool.identity.commit = 'nope')), /tool: commit identity carries no object id/)
  // a commit id given as a tree, and a commit that does not hold the tool
  const treeOfHead = tool.git('rev-parse', 'HEAD^{tree}')
  assert.match(await mutate((c) => (c.tool.identity.commit = treeOfHead)), new RegExp(`tool: commit ${treeOfHead} is not in this repository`))
  writeFileSync(path.join(tool.root, 'unrelated.txt'), 'x')
  tool.git('rm', '-q', '--cached', 'scripts/ingest/quickstart-inventory-archive.py')
  tool.git('add', 'unrelated.txt')
  tool.git('commit', '-q', '-m', 'drop the helper from the index')
  const without = tool.git('rev-parse', 'HEAD')
  tool.git('add', 'scripts/ingest/quickstart-inventory-archive.py')
  tool.git('commit', '-q', '-m', 'restore')
  assert.match(await mutate((c) => (c.tool.identity.commit = without)), new RegExp(`tool: commit ${without} does not hold scripts/ingest/quickstart-inventory-archive\\.py`))
  assert.match(await mutate((c) => (c.quickstarts[1].assets[0].path = '../x-morgan.zip')), /not relative to --input/)
  assert.match(await mutate((c) => (c.quickstarts[1].assets[0].path = 'a/b/x-morgan.zip')), /not relative to --input/)
  assert.match((await verifyBaseline({ schema: 'nope' }, input)).join('\n'), /not a tracy\.quickstart-baseline\/1/)

  // the inventory it was made from: hashed, unchanged, and saying the same of the pair
  assert.match(await mutate((c) => delete c.inventorySha256), /inventorySha256: the inventory the baseline was made from is not hashed/)
  assert.match(await mutate((c) => (c.inventorySha256 = 'nope')), /inventorySha256: the inventory the baseline was made from is not hashed/)
  assert.match(await mutate(() => {}, null), /inventory: no inventory\.json of the baseline's generation/)
  const editedInv = invText.replace('"T3"', '"T4"')
  assert.notEqual(editedInv, invText)
  assert.match(await mutate(() => {}, editedInv), new RegExp(`inventory: inventory\\.json is ${sha(editedInv)}, the baseline was made from ${b.inventorySha256}`))
  // a baseline edited with its inventory hash kept: its quickstart no longer is what the inventory says
  assert.match(await mutate((c) => (c.quickstarts[1].framework = 'T4')), /x-morgan: framework differ from the inventory the baseline was made from/)
  assert.match(await mutate((c) => (c.quickstarts[0].joomla = '9.9.9')), /x-nova: joomla differ from the inventory/)
  // …the same through the CLI: an edited inventory.json beside a copied baseline, or none at all
  const copyDir = path.join(d, 'copied')
  mkdirSync(copyDir)
  writeFileSync(path.join(copyDir, 'baseline.json'), JSON.stringify(b))
  let cv = tool.cli(['--verify-baseline', path.join(copyDir, 'baseline.json'), '--input', input])
  assert.equal(cv.status, 1)
  assert.match(cv.stderr, /inventory: no inventory\.json of the baseline's generation/)
  writeFileSync(path.join(copyDir, 'inventory.json'), editedInv)
  cv = tool.cli(['--verify-baseline', path.join(copyDir, 'baseline.json'), '--input', input])
  assert.equal(cv.status, 1)
  assert.match(cv.stderr, /inventory: inventory\.json is [0-9a-f]{64}, the baseline was made from/)
  writeFileSync(path.join(copyDir, 'inventory.json'), invText)
  cv = tool.cli(['--verify-baseline', path.join(copyDir, 'baseline.json'), '--input', input])
  assert.equal(cv.status, 0, cv.stderr)

  // a source reached through a symlinked directory or a symlinked file: never followed, even with the right bytes
  const outside = path.join(d, 'outside')
  mkdirSync(outside)
  writeFileSync(path.join(outside, 'x-nova.zip'), nova)
  symlinkSync(outside, path.join(input, 'link'))
  symlinkSync(path.join(outside, 'x-nova.zip'), path.join(input, 'nova-link.zip'))
  const relink = (p) => (c) => {
    c.quickstarts[0].assets[0].path = p
    c.quickstarts[0].tag.bindings[0].asset = p
  }
  assert.match(await mutate(relink('link/x-nova.zip')), /x-nova: source link\/x-nova\.zip is not a regular file inside --input \(link is a symlink, not followed\)/)
  assert.match(await mutate(relink('nova-link.zip')), /x-nova: source nova-link\.zip is not a regular file inside --input \(nova-link\.zip is a symlink, not followed\)/)
  assert.doesNotMatch(await mutate(relink('link/x-nova.zip')), /source link\/x-nova\.zip is [0-9a-f]{64}/)
  rmSync(path.join(input, 'link'))
  rmSync(path.join(input, 'nova-link.zip'))

  // a document of the wrong shape: named gaps, never a TypeError
  const shapes = [
    [(c) => (c.quickstarts = [null, null]), /quickstarts: not a list of objects/],
    [(c) => (c.quickstarts = {}), /quickstarts: not a list of objects/],
    [(c) => (c.quickstarts[0].assets = {}), /x-nova: assets are not a list of objects/],
    [(c) => (c.quickstarts[0].assets = [null]), /x-nova: assets are not a list of objects/],
    [(c) => (c.quickstarts[1].tag = 'quickstart/x-morgan/j6'), /x-morgan: tag is not an object/],
    [(c) => (c.quickstarts[1].tag.bindings = {}), /x-morgan: tag bindings are not a list of objects/],
    [(c) => (c.quickstarts[1].id = 5), /quickstarts\[1\]: id is not a plain name/],
    [(c) => (c.pair = 'x-nova,x-morgan'), /pair: not a list of quickstart ids/],
    [(c) => (c.runtimeImages = [null]), /runtimeImages: not a list of objects/],
    [(c) => (c.runtimeImages = {}), /runtimeImages: not a list of objects/],
    [(c) => (c.tool = null), /tool: not an object/],
    [(c) => (c.tool.implementationFiles = [null, 1]), /tool: implementation files are not a list of objects/],
    [(c) => (c.tool.identity = 'staged'), /tool: identity is not an object/],
    [(c) => (c.gaps = {}), /gaps: not a list of strings/]
  ]
  for (const [fn, want] of shapes) {
    assert.match(await mutate(fn), want)
    const copy = JSON.parse(JSON.stringify(b))
    fn(copy)
    assert.match(baselineGaps(copy).join('\n'), want)
  }
  assert.deepEqual(baselineGaps(null), ['baseline: not a JSON object'])
  assert.match((await verifyBaseline([], input)).join('\n'), /not a tracy\.quickstart-baseline\/1/)
  writeFileSync(path.join(copyDir, 'baseline.json'), JSON.stringify({ ...b, quickstarts: [null, null] }))
  cv = tool.cli(['--verify-baseline', path.join(copyDir, 'baseline.json'), '--input', input])
  assert.equal(cv.status, 1)
  assert.match(cv.stderr, /quickstarts: not a list of objects/)
  assert.doesNotMatch(cv.stderr, /TypeError/)
  // the tool edited after the baseline: the working file no longer matches
  writeFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), readFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), 'utf8') + '# edited\n')
  assert.match((await verifyBaseline(b, input, { root: tool.root, inventory: invText })).join('\n'), /tool: scripts\/ingest\/quickstart-inventory-archive\.py is [0-9a-f]{64}, the baseline was made with/)
  // a changed source on disk
  writeFileSync(path.join(input, 'x-morgan.zip'), zip(entriesOf(fixtures.gavick())))
  const bad = tool.cli(['--verify-baseline', bpath, '--input', input])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /x-morgan: source x-morgan\.zip is [0-9a-f]{64} \(\d+ bytes\), the baseline froze/)
  rmSync(path.join(input, 'x-nova.zip'))
  assert.match((await verifyBaseline(b, input, { root: tool.root, inventory: invText })).join('\n'), /source x-nova\.zip is missing/)
})

test('baseline: an archive name discovery accepts — spaces, non-ASCII letters — is one a baseline freezes and re-hashes; a control character is refused at discovery', async () => {
  const d = scratch()
  const tool = toolRepo(d)
  const nova = zip(entriesOf(fixtures.t4()))
  const morgan = zip(entriesOf(fixtures.t3()))
  const names = { 'x-nova/site backup.zip': nova, 'x-morgan/sao lưu – bản (1).zip': morgan } // language-allow: data: Vietnamese file name
  const input = writeInput(path.join(d, 'in'), names)
  const found = discoverLocal(input)
  assert.deepEqual(found.groups.flatMap((g) => g.assets.map((a) => a.rel)).sort(), Object.keys(names).sort())
  for (const g of found.groups) for (const a of g.assets) assert.ok(assetPathOk(a.rel), a.rel)
  const env = fakeBin(d, {
    gh: { releases: { 'quickstart/x-nova/j6': releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }), 'quickstart/x-morgan/j6': releaseOf('quickstart/x-morgan/j6', { 'x-morgan-j6-quickstart.zip': morgan }) } }
  })
  const out = path.join(d, 'out')
  const r = tool.cli(['--input', input, '--out', out, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--verify-tags', '--baseline', 'x-nova,x-morgan', '--image', `mariadb:11@sha256:${'b'.repeat(64)}`], env)
  assert.equal(r.status, 0, r.stderr)
  const b = JSON.parse(readFileSync(path.join(out, 'baseline.json'), 'utf8'))
  assert.equal(b.complete, true, JSON.stringify(b.gaps))
  assert.deepEqual(b.quickstarts.flatMap((q) => q.assets.map((a) => a.path)), ['x-nova/site backup.zip', 'x-morgan/sao lưu – bản (1).zip']) // language-allow: data: Vietnamese file name
  const v = tool.cli(['--verify-baseline', path.join(out, 'baseline.json'), '--input', input])
  assert.equal(v.status, 0, v.stderr)
  const real = fs.realpathSync(input)
  assert.equal(JSON.parse(helper('hash', real, 'x-nova/site backup.zip').stdout).sha256, sha(nova))
  // --input is resolved once: a trailing slash, a trailing /. and a symlink to the directory all name the
  // same root; the report gives the path as given and as resolved
  const link = path.join(d, 'in-link')
  symlinkSync(input, link)
  for (const given of [`${input}/`, `${input}/.`, link, `${link}/`, `${link}/.`]) {
    const vl = tool.cli(['--verify-baseline', path.join(out, 'baseline.json'), '--input', given])
    assert.equal(vl.status, 0, `${given}: ${vl.stderr}`)
    assert.ok(vl.stdout.includes(`re-hashed from --input ${path.resolve(given)}${path.resolve(given) === real ? '' : ` (resolved: ${real})`},`), vl.stdout)
    assert.deepEqual(await verifyBaseline(b, given, { root: tool.root, inventory: readFileSync(path.join(out, 'inventory.json'), 'utf8') }), [], given)
  }
  const outLink = path.join(d, 'out-link')
  const rl = tool.cli(['--input', `${link}/.`, '--out', outLink, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--verify-tags'], env)
  assert.equal(rl.status, 0, rl.stderr)
  const invLink = readInv(outLink)
  assert.deepEqual([invLink.source.input, invLink.source.inputResolved], [link, real])
  assert.ok(readFileSync(path.join(outLink, 'inventory.md'), 'utf8').includes(`(resolved: ${md(real)})`))
  assert.deepEqual(invLink.quickstarts, JSON.parse(readFileSync(path.join(out, 'inventory.json'), 'utf8')).quickstarts)
  // the resolved root is recorded once, under source; no asset carries it
  assert.ok(!JSON.stringify(invLink.quickstarts).includes(real))
  // the helper takes only the resolved root: a link, a trailing slash or /. on it is refused, not followed
  for (const [root, problem] of [[link, 'root-link'], [path.join(link, 'x-nova'), 'root-link'], [`${real}/`, 'root-not-canonical'], [`${real}/.`, 'root-not-canonical'], ['relative/dir', 'root-not-canonical']]) {
    for (const r of [helper('hash', root, 'x-morgan.zip'), helper('stat', root, 'x-morgan.zip'), helper('list', root)]) {
      assert.equal(r.status, 3, `${root}: ${r.stdout}`)
      assert.equal(JSON.parse(r.stderr.trim()).problem, problem, root)
    }
    const sc = helper('scan', root, 'x-nova/site backup.zip')
    assert.equal(sc.status, 3, root)
    assert.match(JSON.parse(sc.stderr.trim()).error, new RegExp(`cannot be read below the input root \\(${problem}`))
  }
  // a symlink inside --input to a directory outside with the same bytes: refused by discovery, and by
  // the verifier as a source path — never followed
  const copy = writeInput(path.join(d, 'copy'), names)
  symlinkSync(path.join(copy, 'x-nova'), path.join(input, 'x-out'))
  const inside = tool.cli(['--input', link, '--out', path.join(d, 'out-inside')])
  assert.equal(inside.status, 1)
  assert.match(inside.stderr, /--input .*in-link: x-out is a symlink — refused, not followed/)
  assert.ok(!existsSync(path.join(d, 'out-inside')))
  const moved = structuredClone(b)
  moved.quickstarts[0].assets[0].path = 'x-out/site backup.zip'
  moved.quickstarts[0].tag.bindings[0].asset = 'x-out/site backup.zip'
  assert.match((await verifyBaseline(moved, link, { root: tool.root, inventory: readFileSync(path.join(out, 'inventory.json'), 'utf8') })).join('\n'), /source x-out\/site backup\.zip is not a regular file inside --input \(x-out is a symlink, not followed\)/)
  const listed = JSON.parse(helper('list', real).stdout)
  assert.deepEqual(listed.entries.find((e) => e.name === 'x-out'), { name: 'x-out', kind: 'link' })
  rmSync(path.join(input, 'x-out'))
  // the one path form: what discovery cannot produce, a baseline does not accept
  for (const p of ['x-nova/site backup.zip', 'x-nova.zip', 'x-nova/ünïcode.tar.gz']) assert.ok(assetPathOk(p), p)
  for (const p of ['../x.zip', 'a/../x.zip', '/abs/x.zip', 'a/b/x.zip', 'x-nova/.hidden.zip', 'x-nova/x.txt', 'site backup.zip', 'x-nova/a\nb.zip', 'x-nova/a\u007fb.zip', '', 'x-nova/', null]) assert.equal(assetPathOk(p), false, JSON.stringify(p))
  writeFileSync(path.join(input, 'x-nova', 'bad\u0001name.zip'), nova)
  assert.throws(() => discoverLocal(input), /x-nova\/bad\\u0001name\.zip is an archive whose name holds a control character/)
})

test('baseline: a directory swapped for a symlink while a source is hashed never lets bytes from outside --input through', () => {
  const d = scratch()
  const bytes = zip(entriesOf(fixtures.t4()))
  const input = writeInput(path.join(d, 'in'), { 'x-nova/a.zip': bytes })
  const outside = writeInput(path.join(d, 'outside'), { 'a.zip': bytes })
  const insideIno = fs.statSync(path.join(input, 'x-nova', 'a.zip')).ino
  // the swapper keeps the inside directory aside and a symlink to identical bytes outside in its place, back and forth
  const swapper = spawn(process.execPath, ['-e', `
    const fs = require('node:fs')
    const [dir, aside, outside] = process.argv.slice(1)
    const until = Date.now() + 20000
    while (Date.now() < until) {
      try { fs.renameSync(dir, aside); fs.symlinkSync(outside, dir); fs.unlinkSync(dir); fs.renameSync(aside, dir) } catch {}
    }`, path.join(input, 'x-nova'), path.join(input, 'x-nova.aside'), outside], { stdio: 'ignore' })
  const seen = { hashed: 0, refused: 0 }
  try {
    for (let i = 0; i < 80; i++) {
      const r = helper('hash', fs.realpathSync(input), 'x-nova/a.zip')
      if (r.status === 0) {
        const got = JSON.parse(r.stdout)
        assert.equal(got.ino, insideIno, 'hashed a file that is not the one inside --input')
        assert.equal(got.sha256, sha(bytes))
        seen.hashed++
      } else {
        assert.equal(r.status, 3, r.stderr)
        assert.match(JSON.parse(r.stderr.trim()).problem, /^(missing|symlink|changed)$/)
        seen.refused++
      }
    }
  } finally {
    swapper.kill('SIGKILL')
  }
  assert.equal(seen.hashed + seen.refused, 80)
  // not relative, or through a link: refused before any byte is read
  for (const rel of ['/etc/hosts', '../outside/a.zip', 'x-nova/../x-nova/a.zip', 'x-nova//a.zip']) {
    const r = helper('hash', fs.realpathSync(input), rel)
    assert.equal(r.status, 3, rel)
    assert.equal(JSON.parse(r.stderr.trim()).problem, 'not-relative', rel)
  }
})

test('baseline: an unresolved image, a declared-only tag, a release without digests, uncommitted tool files or a wrong tag mapping leave it incomplete or refused', async () => {
  const d = scratch()
  const tool = toolRepo(d)
  const nova = zip(entriesOf(fixtures.t4()))
  const morgan = zip(entriesOf(fixtures.t3()))
  const input = writeInput(path.join(d, 'in'), { 'x-nova.zip': nova, 'x-morgan.zip': morgan })
  const env = fakeBin(d, {
    gh: { releases: { 'quickstart/x-nova/j6': releaseOf('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }), 'quickstart/x-morgan/j6': releaseOf('quickstart/x-morgan/j6', { 'x-morgan-j6-quickstart.zip': morgan }) } },
    docker: { 'local:dev': { Id: 'sha256:' + 'a'.repeat(64), RepoDigests: [] }, 'odd:1': { Id: 'sha256:' + 'a'.repeat(64), RepoDigests: ['odd@invalid'] } }
  })
  const pin = `mariadb:11@sha256:${'b'.repeat(64)}`
  // declared tags, a local-only image, an image docker does not have
  const out = path.join(d, 'out')
  let r = tool.cli(['--input', input, '--out', out, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--baseline', 'x-nova,x-morgan', '--image', 'local:dev', '--image', 'missing:1', '--image', 'odd:1'], env)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /baseline incomplete/)
  let b = JSON.parse(readFileSync(path.join(out, 'baseline.json'), 'utf8'))
  assert.equal(b.complete, false)
  let gaps = b.gaps.join('\n')
  assert.match(gaps, /x-nova: tag quickstart\/x-nova\/j6 is declared, not checked/)
  assert.match(gaps, /local:dev: no immutable sha256 digest \(the local image has no repository digest/)
  assert.match(gaps, /missing:1: no immutable sha256 digest \(docker image inspect exited 1: No such image/)
  // a repository digest docker gives that is not sha256:<64 hex> is no identity, at generation as at verification
  assert.match(gaps, /odd:1: no immutable sha256 digest \(docker gave a repository digest that is not sha256:<64 hex> \(odd@invalid\)\)/)
  assert.equal(b.runtimeImages.find((i) => i.ref === 'odd:1').digest, null)
  const v = tool.cli(['--verify-baseline', path.join(out, 'baseline.json'), '--input', input])
  assert.equal(v.status, 1)
  assert.match(v.stderr, /baseline says it is incomplete/)

  // a release that publishes no digest: downloaded and bound by name and size, never by the measured hash
  const nodigest = (tag, files) => {
    const rel = releaseOf(tag, files)
    for (const a of rel.view.assets) delete a.digest
    return rel
  }
  const envNo = fakeBin(path.join(d, 'nodigest'), { gh: { releases: { 'quickstart/x-nova/j6': nodigest('quickstart/x-nova/j6', { 'x-nova-j6-quickstart.zip': nova }), 'quickstart/x-morgan/j6': nodigest('quickstart/x-morgan/j6', { 'x-morgan-j6-quickstart.zip': morgan }) } } })
  const outNo = path.join(d, 'out-nodigest')
  const dl = path.join(d, 'dl')
  r = tool.cli(['--release', 'quickstart/x-nova/j6', '--release', 'quickstart/x-morgan/j6', '--download-dir', dl, '--out', outNo, '--baseline', 'x-nova-j6,x-morgan-j6', '--image', pin], envNo)
  assert.equal(r.status, 0, r.stderr)
  b = JSON.parse(readFileSync(path.join(outNo, 'baseline.json'), 'utf8'))
  assert.equal(b.complete, false)
  assert.deepEqual(b.quickstarts.map((q) => q.tag.bindings.map((x) => x.sha256)), [[null], [null]])
  assert.match(b.gaps.join('\n'), /x-nova-j6: release quickstart\/x-nova\/j6 gives no SHA-256 for x-nova-j6-quickstart\.zip — x-nova-j6\/x-nova-j6-quickstart\.zip is bound by name and size only/)
  const forced = { ...b, complete: true, gaps: [] }
  assert.match((await verifyBaseline(forced, dl, { root: tool.root, inventory: readFileSync(path.join(outNo, 'inventory.json'), 'utf8') })).join('\n'), /x-nova-j6: release quickstart\/x-nova\/j6 gives no SHA-256 for x-nova-j6-quickstart\.zip/)

  // tool files edited after the last commit: the baseline names a working tree, not a commit
  writeFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), readFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), 'utf8') + '# not committed\n')
  const outDirty = path.join(d, 'out-dirty')
  r = tool.cli(['--input', input, '--out', outDirty, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--verify-tags', '--baseline', 'x-nova,x-morgan', '--image', pin], env)
  assert.equal(r.status, 0, r.stderr)
  b = JSON.parse(readFileSync(path.join(outDirty, 'baseline.json'), 'utf8'))
  assert.equal(b.complete, false)
  assert.deepEqual(b.gaps, ['tool version: scripts/ingest/quickstart-inventory-archive.py (unstaged) not in the index as written — commit or stage the tool files and regenerate'])
  assert.equal(b.tool.dirty, true)
  assert.deepEqual(b.tool.identity.kind, 'none')
  const invDirty = readFileSync(path.join(outDirty, 'inventory.json'), 'utf8')
  gaps = (await verifyBaseline({ ...b, complete: true, gaps: [] }, input, { root: tool.root, inventory: invDirty })).join('\n')
  assert.match(gaps, /tool version: scripts\/ingest\/quickstart-inventory-archive\.py \(unstaged\) not in the index as written/)
  // …the same as a commit claimed for it: the commit holds other bytes
  gaps = (await verifyBaseline({ ...b, complete: true, gaps: [], tool: { ...b.tool, identity: { kind: 'commit', commit: tool.git('rev-parse', 'HEAD') } } }, input, { root: tool.root, inventory: invDirty })).join('\n')
  assert.match(gaps, /tool: scripts\/ingest\/quickstart-inventory-archive\.py in commit [0-9a-f]{40} is [0-9a-f]{64}, the baseline recorded/)

  // staged, not committed: the staged tree is the producing version, HEAD kept as context
  tool.git('add', 'scripts/ingest/quickstart-inventory-archive.py')
  const outStaged = path.join(d, 'out-staged')
  r = tool.cli(['--input', input, '--out', outStaged, '--tag', 'x-nova=quickstart/x-nova/j6', '--tag', 'x-morgan=quickstart/x-morgan/j6', '--verify-tags', '--baseline', 'x-nova,x-morgan', '--image', pin], env)
  assert.equal(r.status, 0, r.stderr)
  b = JSON.parse(readFileSync(path.join(outStaged, 'baseline.json'), 'utf8'))
  assert.equal(b.complete, true, JSON.stringify(b.gaps))
  assert.equal(b.tool.identity.kind, 'staged-tree')
  assert.equal(b.tool.identity.baseCommit, tool.git('rev-parse', 'HEAD'))
  assert.equal(b.tool.identity.tree, tool.git('write-tree'))
  assert.deepEqual(b.tool.implementationFiles.map((f) => f.state), ['committed', 'staged', 'committed'])
  const vs = tool.cli(['--verify-baseline', path.join(outStaged, 'baseline.json'), '--input', input])
  assert.equal(vs.status, 0, vs.stderr)
  // the staged tree must hold the recorded bytes: a forged tree, a tree without the file, other bytes
  const mutS = async (fn) => {
    const copy = JSON.parse(JSON.stringify(b))
    fn(copy)
    return (await verifyBaseline(copy, input, { root: tool.root, inventory: readFileSync(path.join(outStaged, 'inventory.json'), 'utf8') })).join('\n')
  }
  assert.equal(await mutS(() => {}), '')
  assert.match(await mutS((c) => (c.tool.identity.tree = 'e'.repeat(40))), /tool: tree e{40} is not in this repository/)
  assert.match(await mutS((c) => (c.tool.identity.tree = c.tool.identity.baseCommit)), /tool: tree [0-9a-f]{40} is not in this repository/)
  assert.match(await mutS((c) => (c.tool.identity.baseCommit = 'e'.repeat(40))), /base commit e{40} is not in this repository/)
  assert.match(await mutS((c) => delete c.tool.identity.baseCommit), /tool: staged-tree identity carries no base commit/)
  assert.match(await mutS((c) => (c.tool.identity.baseCommit = null)), /tool: staged-tree identity carries no base commit/)
  assert.match(await mutS((c) => (c.tool.identity.tree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904')), /tree [0-9a-f]{40} does not hold scripts\/ingest\/quickstart-inventory-archive\.py/)
  assert.match(await mutS((c) => (c.tool.identity.tree = tool.git('rev-parse', 'HEAD^{tree}'))), /quickstart-inventory-archive\.py in tree [0-9a-f]{40} is [0-9a-f]{64}, the baseline recorded/)
  // unstaged drift after the baseline: the working file no longer matches the staged tree's bytes
  writeFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), readFileSync(path.join(tool.root, 'scripts', 'ingest', 'quickstart-inventory-archive.py'), 'utf8') + '# drift\n')
  assert.match(await mutS(() => {}), /tool: scripts\/ingest\/quickstart-inventory-archive\.py is [0-9a-f]{64}, the baseline was made with/)
  tool.git('checkout', '--', 'scripts/ingest/quickstart-inventory-archive.py')

  // swapped mapping: refused before any output
  const out2 = path.join(d, 'out2')
  r = tool.cli(['--input', input, '--out', out2, '--tag', 'x-nova=quickstart/x-morgan/j6', '--tag', 'x-morgan=quickstart/x-nova/j6', '--verify-tags'], env)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /--tag x-(nova|morgan)=quickstart\/x-(morgan|nova)\/j6: no asset of release .* has the SHA-256/)
  assert.ok(!existsSync(out2))
})

// ---------------------------------------------------------------- source fonts (Phase 2)
const CHECK_CLI = path.join(HERE, '..', 'ingest', 'source-font.mjs')
const CREATE_MENU =
  'CREATE TABLE IF NOT EXISTS `#__menu` (\n  `id` int NOT NULL,\n  `menutype` varchar(24) NOT NULL,\n  `title` varchar(255) NOT NULL,\n  `alias` varchar(400) NOT NULL,\n  `path` varchar(1024) NOT NULL,\n  `link` varchar(1024) NOT NULL,\n  `type` varchar(16) NOT NULL,\n  `published` tinyint NOT NULL,\n  `parent_id` int NOT NULL,\n  `template_style_id` int NOT NULL,\n  `params` text NOT NULL,\n  `home` tinyint NOT NULL,\n  `language` char(7) NOT NULL,\n  `client_id` tinyint NOT NULL\n);\n'
const MENU_ROW = (id, p, style, home = 0, type = 'component') => `(${id},'mainmenu','T${id}','a${id}','${p}','index.php?x',${JSON.stringify(type).replace(/"/g, "'")},1,1,${style},'{\\"secret\\":\\"menu-secret\\"}',${home},'*',0)`
const GOOGLE_FONTS = JSON.stringify([{ name: 'Golos Text' }, { name: 'Mulish' }])
const GOOD_SITE = JSON.stringify({ body_font_family: 'Golos Text', heading_font_family: 'Golos Text' })
const sourceFontsSite = ({ siteJson, extra = {}, css = 'body{margin:0}', styleParams = '{\\"typelist-site\\":\\"default\\",\\"typelist-theme\\":\\"default\\",\\"password\\":\\"s3cret-in-params\\"}' } = {}) =>
  site({
    templates: [{ dir: 'tpl_t4', xml: T4_XML, files: { 'etc/layout/default.json': '{}', 'etc/site/default.json': siteJson, 'etc/theme/default.json': '{}', 'css/template.css': css, ...extra } }],
    plugins: [{ el: 't4', version: '2.6.1' }],
    extraFiles: { 'plugins/system/t4/admin/etc/googlefonts/fonts.json': GOOGLE_FONTS },
    baseSql:
      CREATE_STYLES +
      `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES (11,'tpl_t4',0,'1','T4 - Default',0,'','${styleParams}');\n` +
      CREATE_MENU +
      `INSERT INTO \`#__menu\` VALUES ${MENU_ROW(101, 'about', 0)},${MENU_ROW(102, 'team/people', 11)};\n` +
      'CREATE TABLE `#__modules_menu` (`moduleid` int, `menuid` int);\nINSERT INTO `#__modules_menu` VALUES (1, 0);\n' +
      CREATE_LANG +
      "INSERT INTO `#__languages` (`lang_id`, `asset_id`, `lang_code`, `title`, `title_native`, `sef`, `published`) VALUES (1,0,'en-GB','English','English','en',1);\n"
  })

function inventoryOf(files, args = []) {
  const d = scratch()
  const input = writeInput(path.join(d, 'in'), { 'qs.zip': zip(entriesOf(files)) })
  const out = path.join(d, 'out')
  const r = cli(['--input', input, '--out', out, ...args])
  assert.equal(r.status, 0, r.stderr)
  return { d, out, inv: readInv(out), file: path.join(out, 'inventory.json') }
}
const checkCli = (args) => spawnSync(process.execPath, [CHECK_CLI, 'check', ...args], { encoding: 'utf8', timeout: 60000 })

test('inventory: a T4 source with empty font keys is reported as a source-font finding; the check exits 1 and names the file and key', () => {
  const { inv, out, file, d } = inventoryOf(sourceFontsSite({ siteJson: JSON.stringify({ body_font_family: '', heading_font_family: '' }) }), [])
  const s = inv.quickstarts[0].sites[0]
  assert.equal(s.sourceFonts.complete, true, s.sourceFonts.gaps.join('; '))
  assert.deepEqual(s.sourceFonts.findings.map((f) => f.code), ['font-family-unset'])
  assert.equal(s.sourceFonts.findings[0].file, 'templates/tpl_t4/etc/site/default.json')
  assert.deepEqual(s.sourceFonts.usedStyles.map((x) => x.id), ['11'])
  assert.deepEqual(s.sourceFonts.menuRoutes.map((r) => [r.path, r.styleId]), [['about', '11'], ['team/people', '11']], 'style 0 is the default style')
  // the report is not an unknown of the inventory: the existing unknowns are the ones they were
  assert.ok(!inv.quickstarts[0].unknowns.some((u) => /font/i.test(u)))
  const r = checkCli(['--inventory', file])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /FAIL qs/)
  assert.match(r.stdout, /fault of the SOURCE template/)
  assert.match(r.stdout, /templates\/tpl_t4\/etc\/site\/default\.json/)
  assert.match(readFileSync(path.join(out, 'inventory.md'), 'utf8'), /FINDING source-font:static:tpl\\_t4:style-11:body:font-family-unset/)
  // a DECISIONS.md that names the key lets the check pass
  const dec = path.join(d, 'DECISIONS.md')
  writeFileSync(dec, '- D-4 The source ships no body font (source-font:static:tpl_t4:style-11:body:font-family-unset); recorded with the owner.\n')
  const ok = checkCli(['--inventory', file, '--decisions', dec])
  assert.equal(ok.status, 0, ok.stdout)
  assert.match(ok.stdout, /decided D-4/)
})

test('inventory: a T4 source that declares and loads its fonts passes the check', () => {
  const { file } = inventoryOf(sourceFontsSite({ siteJson: GOOD_SITE }))
  const r = checkCli(['--inventory', file])
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /PASS qs/)
})

test('inventory: only the profile names of a style\'s params and the menu columns the check needs leave the reader; no CSS text or secret does', () => {
  const css = 'body{margin:0} /* CSS-MARKER-9f3a */'
  const { out } = inventoryOf(sourceFontsSite({ siteJson: GOOD_SITE, css }))
  const raw = readFileSync(path.join(out, 'inventory.json'), 'utf8') + readFileSync(path.join(out, 'inventory.md'), 'utf8')
  for (const secret of ['CSS-MARKER-9f3a', 's3cret-in-params', 'menu-secret', 'Golos Text:']) assert.ok(!raw.includes(secret), secret)
  const s = JSON.parse(readFileSync(path.join(out, 'inventory.json'), 'utf8')).quickstarts[0].sites[0]
  assert.deepEqual(s.templateStyles.find((x) => x.id === '11').typelist, { 'typelist-site': 'default', 'typelist-theme': 'default' })
})

test('inventory: modules_menu (the module-to-page join table) is not the menu table', () => {
  const { inv } = inventoryOf(sourceFontsSite({ siteJson: GOOD_SITE }))
  const f = inv.quickstarts[0].sites[0].sourceFonts
  assert.equal(f.menuKnown, true)
  assert.deepEqual(f.menuRoutes.map((r) => r.path), ['about', 'team/people'], 'the join table\'s row (moduleid 1, menuid 0) is not a page')
})

test('inventory: a typography file over maxTextBytes is a named evidence gap, not a crash and not a pass', () => {
  const { inv, file } = inventoryOf(sourceFontsSite({ siteJson: GOOD_SITE, css: 'body{margin:0}' + ' '.repeat(2000) }), ['--limit', 'maxTextBytes=1000'])
  const f = inv.quickstarts[0].sites[0].sourceFonts
  assert.equal(f.complete, true, 'the template sheet is optional evidence for a family T4 loads from Google')
  const big = inventoryOf(sourceFontsSite({ siteJson: ' '.repeat(2000) + GOOD_SITE }), ['--limit', 'maxTextBytes=1000'])
  const g = big.inv.quickstarts[0].sites[0].sourceFonts
  assert.equal(g.complete, false)
  assert.match(g.gaps.join('\n'), /larger than 1000 bytes/)
  assert.equal(checkCli(['--inventory', big.file]).status, 1)
  void file
})

test('archive helper: a tar whose first entry is the root directory ./ is read, and the mariadb-dump sandbox header is a comment', () => {
  const d = scratch()
  const sql = '/*M!999999\\- enable the sandbox mode */ \n/*!40101 SET NAMES utf8mb4 */;\n' + CREATE_STYLES + `INSERT INTO \`#__template_styles\` ${STYLE_COLS} VALUES (1,'tpl_t4',0,'1','A',0,'','');\n`
  const file = path.join(d, 'dump.tar')
  writeFileSync(file, tar([{ name: './', dir: true }, { name: './db.sql', data: sql }]))
  const r = helperScan(file)
  assert.equal(r.status, 0, r.stderr)
  const scan = JSON.parse(r.stdout)
  const parsed = scan.containers[0].files['db.sql']
  assert.equal(parsed.statements.unrecognised, 0, JSON.stringify(parsed.statements))
  assert.ok(parsed.ops.some((o) => o.op === 'insert' && o.table === 'template_styles'))
})

test('inventory: dont_use_google_font with a local override sheet that @imports a nested sheet is read end to end — the loader is found, not reported missing', () => {
  const site = JSON.stringify({ body_font_family: 'Local Face', heading_font_family: 'Local Face', dont_use_google_font: '1' })
  const files = sourceFontsSite({
    siteJson: site,
    css: 'body{margin:0}',
    extra: {
      'local/css/template.css': '@import "fonts/local.css";',
      'local/css/fonts/local.css': '@font-face{font-family:"Local Face";src:url("../../../fonts/local.woff2")}',
      'fonts/local.woff2': 'x'
    }
  })
  const { inv, file } = inventoryOf(files)
  const f = inv.quickstarts[0].sites[0].sourceFonts
  assert.equal(f.complete, true, f.gaps.join('; '))
  assert.deepEqual(f.findings, [])
  assert.equal(f.styles.find((s) => s.used).roles.find((r) => r.role === 'body').via.kind, 'font-face')
  assert.equal(checkCli(['--inventory', file]).status, 0)
  // the same source without the nested file is a missing loader of the family, not a silent pass
  const gone = inventoryOf(sourceFontsSite({ siteJson: site, extra: { 'local/css/template.css': '@import "fonts/local.css";', 'local/css/fonts/local.css': '@font-face{font-family:"Local Face";src:url("../../fonts/gone.woff2")}' } }))
  assert.deepEqual(gone.inv.quickstarts[0].sites[0].sourceFonts.findings.map((x) => x.code).sort(), ['font-files-missing', 'font-files-missing'])
})

test('inventory: a bundled font file is bound by its bytes — the same file name with other bytes changes the report fingerprint', () => {
  const site = JSON.stringify({ body_font_family: 'Local Face', heading_font_family: 'Local Face', dont_use_google_font: '1' })
  const make = (bytes) => ({ siteJson: site, css: '@font-face{font-family:"Local Face";src:url("../fonts/local.woff2")}', extra: { 'fonts/local.woff2': bytes } })
  const a = inventoryOf(sourceFontsSite(make('font-bytes-one'))).inv.quickstarts[0].sites[0].sourceFonts
  const a2 = inventoryOf(sourceFontsSite(make('font-bytes-one'))).inv.quickstarts[0].sites[0].sourceFonts
  const b = inventoryOf(sourceFontsSite(make('font-bytes-two'))).inv.quickstarts[0].sites[0].sourceFonts
  assert.equal(a.complete, true, a.gaps.join('; '))
  assert.deepEqual(a.findings, [])
  assert.equal(a.fingerprint, a2.fingerprint)
  assert.notEqual(a.fingerprint, b.fingerprint)
})
