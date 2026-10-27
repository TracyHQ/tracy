// Phase 10 quickstart tools — decisions tested on fixtures, no Docker, no WordPress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  parseArgs,
  UsageError,
  classifyPrune,
  renderQuickstartConfig,
  renderRestoreConfig,
  defineLiteral,
  readDefine,
  generateSalt,
  walkWebroot,
  excludeReason,
  sumsText,
  parseSums,
  checkSums,
  readPack,
  readRegularBytes,
  sha256File,
  compareParity,
  readRoutes,
  readRouteExpectations,
  routeExpectations,
  isRenderableStatus,
  SECRET_PATTERNS,
  SALT_CONSTANTS,
  DB_CONSTANTS,
  PLACEHOLDER_URL,
  STOCK_DEFINES,
  configDefines,
  rootStrangers,
  namedBy
} from '../quickstart/lib.mjs'
import { testDir } from './lib/test-root.mjs'
import { acceptedConfig as rendered, officialConfig, webrootTar } from './lib/webroot-tar.mjs'
import { diffSnapshots } from '../verify-render.mjs'
import { slugOf, buildWebrootTar, checkWebrootTar } from '../quickstart/pack.mjs'
import { buildVerification, readmeText, notesTemplate, ghCommand, titleFor } from '../quickstart/release.mjs'
import { DEFAULT_SELECTORS, initScriptFor, measurePack } from '../quickstart/verify-parity.mjs'
import { initScriptFor as sharedInitScriptFor } from '../lib/browser.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const FX = path.join(HERE, 'fixtures', 'quickstart')
const QS = path.join(HERE, '..', 'quickstart')
const tmp = () => mkdtempSync(path.join(tmpdir(), 'qs-test-'))
const dockerConfig = readFileSync(path.join(FX, 'wp-config.docker.php'), 'utf8')

// ---------------------------------------------------------------- parseArgs
test('parseArgs: values, defaults, booleans, repeats, camelCase, unknown and required', () => {
  const spec = {
    '--site-url': { required: true },
    '--prefix': { default: 'tr_' },
    '--apply': { value: false },
    '--exclude': { repeat: true }
  }
  const o = parseArgs(['--site-url', 'http://a', '--apply', '--exclude', 'x', '--exclude=y'], spec)
  assert.equal(o.siteUrl, 'http://a')
  assert.equal(o.prefix, 'tr_')
  assert.equal(o.apply, true)
  assert.deepEqual(o.exclude, ['x', 'y'])
  assert.throws(() => parseArgs(['--nope'], spec), UsageError)
  assert.throws(() => parseArgs([], spec), /--site-url is required/)
})

// ---------------------------------------------------------------- prune classification
test('classifyPrune: a dirty stand yields one PRUNE per build trace, each with a removal', () => {
  const rows = classifyPrune(JSON.parse(readFileSync(path.join(FX, 'facts.dirty.json'), 'utf8')))
  const prune = rows.filter((r) => r.verdict === 'PRUNE')
  const items = prune.map((r) => `${r.area}:${r.item}`)
  // Transients are KEEP on the stand (WordPress rewrites them on every load); the dump scrub drops them.
  for (const t of ['_transient_doing_cron', '_transient_timeout_doing_cron', '_site_transient_update_core'])
    assert.equal(rows.find((r) => r.item === t)?.verdict, 'KEEP', t)
  for (const expected of [
    'option:tracy_style',
    'option:claude_cowork_token',
    'post:revision:#41 About',
    'post:auto-draft:#52',
    'post:trash:#60 Old hero',
    'user:lee',
    'session:tracyagent',
    'file:wp-content/debug.log',
    'file:.DS_Store'
  ])
    assert.ok(items.includes(expected), `expected PRUNE ${expected} in ${items.join(', ')}`)
  assert.equal(prune.length, 9)
  assert.ok(
    prune.every((r) => r.remove),
    'every PRUNE carries a removal'
  )
  const lee = prune.find((r) => r.item === 'lee')
  assert.deepEqual(lee.remove.wp, ['user', 'delete', '2', '--reassign=1', '--yes'])
  const rev = prune.find((r) => r.area === 'post:revision')
  assert.ok(rev.remove.wp.includes('--force'), 'a revision cannot be trashed, so --force')
  assert.equal(rows.find((r) => r.area === 'user' && r.item === 'tracyagent').verdict, 'KEEP')
  // The status the row carries decides: `wp post list --post_status=trash` answered with two
  // PUBLISHED posts on wp-tracy-business (15/09) and `--apply` force-deleted the site's two
  // featured articles — the header promises a published post is never touched.
  const lied = rows.find((r) => r.item.includes('#61'))
  assert.equal(lied.verdict, 'KEEP', 'a published post listed as trash is kept')
  assert.equal(lied.remove, undefined, 'and carries no removal')
  // An author the spec declares is content: deleting the user reassigns its posts to the admin and
  // the shipped quickstart shows a byline no source page has (measured 15/09 on wp-tracy-business,
  // where the article read "tracyagent" after the prune).
  const withKeep = classifyPrune({
    ...JSON.parse(readFileSync(path.join(FX, 'facts.dirty.json'), 'utf8')),
    keepUsers: ['lee']
  })
  const keptAuthor = withKeep.find((r) => r.area === 'user' && r.item === 'lee')
  assert.equal(keptAuthor.verdict, 'KEEP')
  assert.equal(keptAuthor.remove, undefined)
  assert.equal(
    rows.find((r) => r.area === 'option' && r.item === 'siteurl').verdict,
    'KEEP',
    'the stand URL is what export-db rewrites'
  )
})

test('classifyPrune: a clean stand has no PRUNE and no UNKNOWN', () => {
  const rows = classifyPrune(JSON.parse(readFileSync(path.join(FX, 'facts.clean.json'), 'utf8')))
  assert.equal(rows.filter((r) => r.verdict !== 'KEEP').length, 0)
})

test('classifyPrune: siteurl that is neither the stand nor the placeholder is PRUNE; a missing admin is UNKNOWN', () => {
  const facts = JSON.parse(readFileSync(path.join(FX, 'facts.clean.json'), 'utf8'))
  facts.options.home = 'https://real-customer.example'
  facts.admin = 'nobody'
  const rows = classifyPrune(facts)
  assert.equal(rows.find((r) => r.item === 'home').verdict, 'PRUNE')
  assert.equal(rows.find((r) => r.area === 'user' && r.item === 'nobody').verdict, 'UNKNOWN')
  assert.equal(
    rows.find((r) => r.item === 'tracyagent').verdict,
    'PRUNE',
    'without a declared admin every user is a stranger'
  )
})

// ---------------------------------------------------------------- wp-config rewrite
test('renderQuickstartConfig: placeholders, literal prefix, fresh salts, no getenv_docker, no eval', () => {
  const { source, salts } = renderQuickstartConfig(dockerConfig, { prefix: 'tr_' })
  for (const c of DB_CONSTANTS) assert.equal(defineLiteral(source, c), `{{${c}}}`)
  assert.match(source, /^\$table_prefix = 'tr_';$/m)
  for (const s of SALT_CONSTANTS) {
    assert.equal(defineLiteral(source, s), salts[s])
    assert.equal(salts[s].length, 64)
    assert.ok(
      !source.includes(`fixture000000000000000000000000000000000${SALT_CONSTANTS.indexOf(s) + 1}`),
      `${s} of the stand must not survive`
    )
  }
  assert.equal(readDefine(source, 'WP_DEBUG'), 'false')
  assert.equal(defineLiteral(source, 'DB_CHARSET'), 'utf8mb4')
  assert.ok(
    !/getenv_docker\(\s*['"$]/.test(source) && !/function getenv_docker/.test(source),
    'no getenv_docker call or definition left'
  )
  assert.ok(!/eval\(/.test(source), 'the WORDPRESS_CONFIG_EXTRA eval block is gone')
  assert.ok(/HTTP_X_FORWARDED_PROTO/.test(source), 'the reverse-proxy block passes through')
  assert.ok(/That's all, stop editing/.test(source))
  assert.ok(/require_once ABSPATH/.test(source))
})

test('renderQuickstartConfig: refuses a config without direct DB defines or without the marker', () => {
  assert.throws(() => renderQuickstartConfig(dockerConfig.replace(/define\( 'DB_HOST'.*\n/, '')), /DB_HOST/)
  assert.throws(
    () => renderQuickstartConfig(dockerConfig.replace("That's all, stop editing", 'nope')),
    /marker/
  )
})

test('renderQuickstartConfig: a CRLF file (the docker image writes one) renders the same, LF out', () => {
  const crlf = dockerConfig.replace(/\n/g, '\r\n')
  const { source } = renderQuickstartConfig(crlf, {
    prefix: 'tr_',
    salts: Object.fromEntries(SALT_CONSTANTS.map((n) => [n, 'x'.repeat(64)]))
  })
  assert.ok(!source.includes('\r'))
  assert.ok(!/function getenv_docker/.test(source))
  assert.equal(defineLiteral(source, 'DB_NAME'), '{{DB_NAME}}')
})

// The stand edit Kinetic 1.0.0 shipped (25/09): its first Install demo could not fetch the cowork plugin.
const standOnly =
  "/* Local stand only: no egress here, so WordPress must not block on update and API calls. */\n" +
  "define( 'WP_HTTP_BLOCK_EXTERNAL', true );\ndefine( 'AUTOMATIC_UPDATER_DISABLED', true );\n"
const kineticConfig = dockerConfig.replace('/* Add any custom values', standOnly + '/* Add any custom values')

test('renderQuickstartConfig: the stock file defines exactly the stock settings', () => {
  assert.deepEqual(configDefines(dockerConfig).sort(), [...STOCK_DEFINES].sort())
})

test('renderQuickstartConfig: refuses a define beyond the stock set, names it and where a stand-only one goes', () => {
  assert.throws(
    () => renderQuickstartConfig(kineticConfig),
    (e) =>
      /WP_HTTP_BLOCK_EXTERNAL, AUTOMATIC_UPDATER_DISABLED/.test(e.message) &&
      /WORDPRESS_CONFIG_EXTRA/.test(e.message) &&
      /--keep-define/.test(e.message)
  )
  // one the design needs, declared, ships as it is; an undeclared one still stops
  assert.throws(() => renderQuickstartConfig(kineticConfig, { keepDefines: ['WP_HTTP_BLOCK_EXTERNAL'] }), /AUTOMATIC_UPDATER_DISABLED/)
  const kept = renderQuickstartConfig(kineticConfig, { keepDefines: ['WP_HTTP_BLOCK_EXTERNAL', 'AUTOMATIC_UPDATER_DISABLED'] })
  assert.equal(readDefine(kept.source, 'WP_HTTP_BLOCK_EXTERNAL'), 'true')
  // a commented-out define defines nothing
  assert.doesNotThrow(() => renderQuickstartConfig(dockerConfig.replace('/* Add any custom values', "// define( 'WP_CACHE', true );\n/* Add any custom values")))
})

test('generateSalt: 64 chars from the WordPress alphabet, never a quote or backslash', () => {
  for (let i = 0; i < 20; i++) {
    const s = generateSalt()
    assert.equal(s.length, 64)
    assert.ok(!/['\\]/.test(s))
  }
  assert.notEqual(generateSalt(), generateSalt())
})

test('renderRestoreConfig mirrors render_wp_config.py: four defines replaced, WP_HOME/WP_SITEURL inserted before the marker', () => {
  const shipped = renderQuickstartConfig(dockerConfig).source
  const out = renderRestoreConfig(
    shipped,
    { host: 'verify-db', user: 'root', password: "p'w\\d", name: 'wp' },
    'http://127.0.0.1:8228'
  )
  assert.equal(defineLiteral(out, 'DB_HOST'), 'verify-db')
  assert.equal(defineLiteral(out, 'DB_PASSWORD'), "p'w\\d")
  assert.equal(defineLiteral(out, 'WP_HOME'), 'http://127.0.0.1:8228')
  assert.ok(
    out.indexOf("define('WP_SITEURL'") < out.indexOf("That's all"),
    'inserted ahead of wp-settings.php'
  )
})

test('renderQuickstartConfig: a webroot restored into a stand packs again — the restore\'s WP_HOME/WP_SITEURL lines are not the design\'s', () => {
  const shipped = renderQuickstartConfig(dockerConfig).source
  const restored = renderRestoreConfig(shipped, { host: 'verify-db', user: 'root', password: 'pw', name: 'wp' }, 'http://127.0.0.1:8228')
  assert.match(restored, /WP_HOME/)
  const again = renderQuickstartConfig(restored).source
  assert.ok(!/WP_HOME|WP_SITEURL/.test(again))
  assert.throws(() => renderQuickstartConfig(restored.replace("define('WP_HOME'", "define('WP_CONTENT_URL'")), /WP_CONTENT_URL/)
  assert.match(renderQuickstartConfig(restored, { keepDefines: ['WP_HOME'] }).source, /WP_HOME/)
})

test('the fleet render_wp_config.py accepts the shipped wp-config.php shape', (t) => {
  // Walk up looking for the fleet script rather than counting directories: this skill sits at
  // `.agents/skills/<name>/` in one checkout and `vendor/wordpress/<repo>/skills/<name>/` in
  // another, and a fixed `../../../..` silently turns the check into a skip when it moves.
  const script = (() => {
    const rel = 'packages/fleet/tracy-fleet-operation/scripts/provision/render_wp_config.py'
    for (let dir = HERE; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, rel)
      if (existsSync(candidate)) return candidate
      if (path.dirname(dir) === dir) return candidate
    }
  })()
  const py = spawnSync('python3', ['--version'])
  if (!existsSync(script) || py.status !== 0)
    return t.skip('render_wp_config.py or python3 not reachable from this checkout')
  const dir = tmp()
  const src = path.join(dir, 'wp-config.source.php')
  const out = path.join(dir, 'wp-config.php')
  writeFileSync(src, renderQuickstartConfig(dockerConfig).source)
  // `--table-prefix` is the prefix the fleet reads from the imported database (required since the
  // fleet stopped trusting the file's own statement); the shipped config states `tr_`.
  const render = (prefix) => {
    const r = spawnSync(
      'python3',
      [
        script,
        '--source',
        src,
        '--out',
        out,
        '--db-host',
        'db',
        '--db-user',
        'root',
        '--db-password',
        'secret',
        '--db-name',
        'wordpress',
        '--site-url',
        'https://x.tracy.ai',
        '--table-prefix',
        prefix
      ],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    return readFileSync(out, 'utf8')
  }
  try {
    const rendered = render('tr_')
    assert.equal(defineLiteral(rendered, 'DB_NAME'), 'wordpress')
    assert.equal(defineLiteral(rendered, 'DB_HOST'), 'db')
    assert.equal(defineLiteral(rendered, 'WP_HOME'), 'https://x.tracy.ai')
    assert.match(rendered, /^\$table_prefix = 'tr_';$/m, 'the prefix line the fleet fallback reads')
    // The database named no prefix: the file's own literal is kept.
    assert.match(render(''), /^\$table_prefix = 'tr_';$/m, 'an empty answer keeps the stated prefix')
    // The database holds another prefix: the file is made to say so, and nothing else moves.
    const other = render('site7_')
    assert.match(other, /^\$table_prefix = 'site7_';$/m, 'a non-default prefix is written as stated')
    assert.equal(other.replace("'site7_'", "'tr_'"), rendered)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- webroot walk and tar
function fakeWebroot() {
  const root = tmp()
  const w = (rel, body = '') => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  w('index.php', '<?php // wp')
  w('wp-config.php', dockerConfig)
  w('wp-content/themes/tracy-base/style.css', '/* theme */')
  w('wp-content/debug.log', 'PHP Notice')
  w('wp-content/upgrade/tmp-pkg/x.php', '')
  w('wp-content/cache/page.html', '')
  w('.DS_Store', '')
  w('wp-content/plugins/._sidecar', '')
  w('node_modules/x/index.js', '')
  w('.git/HEAD', 'ref')
  w('.env', 'SECRET=1')
  w('wp-content/uploads/apply.json', '{}')
  w('wp-config-docker.php', '')
  mkdirSync(path.join(root, 'wp-content/uploads/2026'), { recursive: true })
  return root
}

test('walkWebroot: the prune list is left out with a reason, empty directories are kept', () => {
  const root = fakeWebroot()
  const { kept, dropped } = walkWebroot(root)
  const keptRel = kept.map((k) => k.rel)
  const droppedRel = dropped.map((d) => d.rel)
  for (const rel of [
    'wp-content/debug.log',
    'wp-content/upgrade/tmp-pkg',
    'wp-content/cache',
    '.DS_Store',
    'wp-content/plugins/._sidecar',
    'node_modules',
    '.git',
    '.env',
    'wp-content/uploads/apply.json',
    'wp-config-docker.php'
  ])
    assert.ok(droppedRel.includes(rel), `${rel} must be dropped (dropped: ${droppedRel.join(', ')})`)
  assert.ok(keptRel.includes('wp-content/upgrade'), 'the upgrade dir itself ships (empty)')
  assert.ok(keptRel.includes('wp-content/uploads/2026'), 'an empty upload dir ships')
  assert.ok(keptRel.includes('wp-content/themes/tracy-base/style.css'))
  assert.equal(
    excludeReason('wp-content/plugins/akismet/cache/index.php'),
    null,
    'a plugin dir named cache is not wp-content/cache'
  )
  rmSync(root, { recursive: true, force: true })
})

test('buildWebrootTar + checkWebrootTar: plain members, rewritten wp-config.php, nothing from the prune list', () => {
  const root = fakeWebroot()
  const dir = tmp()
  const out = path.join(dir, 'w.tar.gz')
  const rendered = renderQuickstartConfig(officialConfig)
  const built = buildWebrootTar({ webroot: root, out, config: rendered.source })
  assert.ok(built.members > 3)
  const check = checkWebrootTar(out, { standConfig: officialConfig, placeholders: rendered.placeholders })
  assert.deepEqual(check.problems, [])
  const entries = spawnSync('tar', ['-tzf', out], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
  assert.ok(entries.includes('wp-config.php'))
  assert.ok(entries.includes('index.php'))
  assert.ok(
    entries.some((e) => /^wp-content\/uploads\/2026\/?$/.test(e)),
    'empty dir member'
  )
  assert.ok(
    !entries.some((e) =>
      /debug\.log|\.DS_Store|\._|node_modules|\.git\/|^\.env$|apply\.json|wp-config-docker/.test(e)
    ),
    entries.join('\n')
  )
  assert.ok(!entries.some((e) => e.startsWith('/') || e.startsWith('./')), 'no leading ./ or /')
  const shipped = spawnSync('tar', ['-xzOf', out, 'wp-config.php'], { encoding: 'utf8' }).stdout
  assert.equal(defineLiteral(shipped, 'DB_NAME'), '{{DB_NAME}}')
  // the check itself catches a stand salt that leaked
  const leaked = path.join(dir, 'leak.tar.gz')
  buildWebrootTar({
    webroot: root,
    out: leaked,
    config: dockerConfig.replace(/getenv_docker\('WORDPRESS_DB_NAME', 'wordpress'\)/, "'{{DB_NAME}}'")
  })
  const bad = checkWebrootTar(leaked, { standConfig: dockerConfig, placeholders: rendered.placeholders })
  assert.ok(
    bad.problems.some((p) => /AUTH_KEY shipped|getenv_docker/.test(p)),
    bad.problems.join('; ')
  )
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('buildWebrootTar refuses a root entry WordPress does not ship; --keep-root lets a declared one through; checkWebrootTar flags both gates on an archive', () => {
  const root = fakeWebroot()
  const dir = tmp()
  // Three of Kinetic 1.0.0's 49: a probe page, a probe folder, a wp-config.php copy the .bak rule missed.
  writeFileSync(path.join(root, 'reseed-1034.html'), '<html>')
  mkdirSync(path.join(root, 'r2-probe'))
  writeFileSync(path.join(root, 'r2-probe', 'page-438.html'), '<html>')
  writeFileSync(path.join(root, 'wp-config.php.bak-step3'), dockerConfig)
  const strangers = ['r2-probe', 'reseed-1034.html', 'wp-config.php.bak-step3']
  const rendered = renderQuickstartConfig(officialConfig)
  const out = path.join(dir, 'w.tar.gz')
  assert.throws(
    () => buildWebrootTar({ webroot: root, out, config: rendered.source }),
    (e) => {
      assert.deepEqual(e.strangers, strangers)
      return /3 entries.*--keep-root/.test(e.message)
    }
  )
  assert.ok(!existsSync(out), 'nothing archived')
  // what the prune list drops at the root (.env, .git, wp-config-docker.php…) is not a stranger
  assert.deepEqual(rootStrangers(walkWebroot(root).kept.map((k) => k.rel)), strangers)
  buildWebrootTar({ webroot: root, out, config: rendered.source, keepRoot: strangers })
  const opts = { standConfig: officialConfig, placeholders: rendered.placeholders }
  assert.deepEqual(checkWebrootTar(out, { ...opts, keepRoot: strangers }).problems, [])
  assert.deepEqual(
    checkWebrootTar(out, opts).problems,
    strangers.map((s) => `root entry WordPress does not ship: ${s}`)
  )
  // an archive whose wp-config.php carries a define beyond the stock set
  const extra = path.join(dir, 'extra.tar.gz')
  const kept = renderQuickstartConfig(kineticConfig, { keepDefines: ['WP_HTTP_BLOCK_EXTERNAL', 'AUTOMATIC_UPDATER_DISABLED'] })
  buildWebrootTar({ webroot: root, out: extra, config: kept.source, keepRoot: strangers })
  const problems = checkWebrootTar(extra, { standConfig: kineticConfig, placeholders: kept.placeholders, keepRoot: strangers, keepDefines: ['AUTOMATIC_UPDATER_DISABLED'] }).problems
  assert.deepEqual(problems.filter((p) => !/differs from the accepted form/.test(p)), ['WP_HTTP_BLOCK_EXTERNAL defined in the shipped wp-config.php, not a stock setting'])
  assert.equal(problems.filter((p) => /differs from the accepted form/.test(p)).length, 1, 'a kept define is still a difference from the accepted form')
  assert.deepEqual(rootStrangers(['./', './index.php', 'wp-admin/', './x/y']), ['x'], 'tar listing shapes')
  rmSync(root, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

test('namedBy: every content, meta, term meta, option or theme file text naming a root entry, with the text before it', () => {
  const refs = {
    content: [{ ID: 12, post_type: 'page', post_content: '<a href="https://quickstart.invalid/r2-probe/page-438.html">x</a>' }],
    meta: [{ post_id: 3, meta_key: 'hero', meta_value: 'https:\\/\\/x\\/uploads\\/2026\\/09\\/bento.webp' }],
    termmeta: [],
    options: [{ option_name: 'blogname', option_value: 'reseed-1034.html.old' }],
    files: [{ rel: 'wp-content/themes/t/parts/footer.html', text: 'see reseed-1034.html' }]
  }
  const probe = namedBy('r2-probe', refs)
  assert.equal(probe.length, 1)
  assert.match(probe[0], /^page #12 \(….*quickstart\.invalid\/r2-probe\)$/)
  // an uploads path ending in the same name is reported too — the text shows it is the uploads copy
  assert.match(namedBy('bento.webp', refs)[0], /^meta hero of #3 .*uploads\/2026\/09\/bento\.webp\)$/)
  assert.deepEqual(namedBy('reseed-1034.html', refs).map((h) => h.split(' (')[0]), ['option blogname', 'theme file wp-content/themes/t/parts/footer.html'])
  assert.deepEqual(namedBy('probe', refs), [], 'part of a longer name is not the name')
  assert.deepEqual(namedBy('wp-config.php.bak-step3', refs), [])
})

test('slugOf turns a quickstart id into the asset prefix', () => {
  assert.equal(slugOf('tracy-base/wp7'), 'tracy-base-wp7')
  assert.equal(slugOf('Tracy Apple/j6'), 'tracy-apple-j6')
})

// ---------------------------------------------------------------- sums
test('readPack / measurePack: every pack file is read through a descriptor that follows no link and waits on no FIFO — also one swapped in after a check', () => {
  const build = (dir) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'w.tar.gz'), 'webroot bytes')
    writeFileSync(path.join(dir, 'd.sql.gz'), 'database bytes')
    const manifest = {
      schemaVersion: 'tracy-quickstart/v1',
      id: 'x/wp7',
      version: '1.0.0',
      wpVersion: '7.0',
      theme: { name: 'vega' },
      platform: 'wordpress',
      webroot: { file: 'w.tar.gz', sha256: sha256File(path.join(dir, 'w.tar.gz')) },
      database: { file: 'd.sql.gz', sha256: sha256File(path.join(dir, 'd.sql.gz')) }
    }
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(path.join(dir, 'SHA256SUMS'), sumsText(['manifest.json', 'w.tar.gz', 'd.sql.gz'].map((file) => ({ file, sha256: sha256File(path.join(dir, file)) }))))
    return dir
  }
  const root = tmp()
  try {
    const good = build(path.join(root, 'good'))
    const m = measurePack(good)
    assert.equal(m.webrootArchive, m.manifest.webroot.sha256)
    assert.equal(m.databaseArchive, m.manifest.database.sha256)
    assert.equal(m.manifestSha, sha256File(path.join(good, 'manifest.json')))
    const fifo = spawnSync('mkfifo', [path.join(root, 'probe')]).status === 0
    const cases = [
      ['SHA256SUMS', 'link', /no readable SHA256SUMS: .*SHA256SUMS is a symlink, not a regular file/],
      ['manifest.json', 'link', /SHA256SUMS mismatch: manifest\.json \(.*manifest\.json is a symlink, not a regular file\)/],
      ['w.tar.gz', 'link', /SHA256SUMS mismatch: w\.tar\.gz \(.*is a symlink/],
      ['SHA256SUMS', 'dir', /SHA256SUMS is not a regular file/],
      ['d.sql.gz', 'dir', /SHA256SUMS mismatch: d\.sql\.gz \(.*is not a regular file\)/],
      ...(fifo
        ? [
            ['SHA256SUMS', 'fifo', /SHA256SUMS is not a regular file/],
            ['manifest.json', 'fifo', /manifest\.json is not a regular file/],
            ['d.sql.gz', 'fifo', /d\.sql\.gz is not a regular file/]
          ]
        : [])
    ]
    const swap = (file, kind) => {
      const real = `${file}.real`
      writeFileSync(real, readFileSync(file))
      rmSync(file)
      if (kind === 'link') symlinkSync(real, file)
      else if (kind === 'dir') mkdirSync(file)
      else assert.equal(spawnSync('mkfifo', [file]).status, 0)
    }
    for (const [i, [name, kind, pattern]] of cases.entries()) {
      // static: the file is already a link, a directory or a FIFO when the pack is read
      const pack = build(path.join(root, `s${i}`))
      swap(path.join(pack, name), kind)
      assert.throws(() => readPack(pack), pattern, `${name} as a ${kind}`)
      assert.throws(() => measurePack(pack), pattern, `verify: ${name} as a ${kind}`)
      // replaced: a caller's own check saw a regular file, then the file was swapped before the read
      const later = build(path.join(root, `r${i}`))
      assert.ok(lstatSync(path.join(later, name)).isFile(), 'the check a caller makes passes')
      swap(path.join(later, name), kind)
      assert.throws(() => readPack(later), pattern, `${name} swapped for a ${kind} after the check`)
    }
    // an archive swapped after readPack read the sums: verify's own hash refuses it, never blocks
    if (fifo) {
      const pack = build(path.join(root, 'after'))
      assert.equal(readPack(pack).manifest.database.file, 'd.sql.gz')
      swap(path.join(pack, 'd.sql.gz'), 'fifo')
      assert.throws(() => sha256File(path.join(pack, 'd.sql.gz')), /d\.sql\.gz is not a regular file/)
    }
    assert.throws(() => readRegularBytes(path.join(root, 'nope')), (e) => e.code === 'ENOENT')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('SHA256SUMS: sha256sum layout, round trip, tamper detected', () => {
  const dir = tmp()
  writeFileSync(path.join(dir, 'a.txt'), 'alpha')
  writeFileSync(path.join(dir, 'b.txt'), 'beta')
  const text = sumsText(['a.txt', 'b.txt'].map((f) => ({ file: f, sha256: sha256File(path.join(dir, f)) })))
  assert.match(text, /^[0-9a-f]{64}  a\.txt\n[0-9a-f]{64}  b\.txt\n$/)
  assert.equal(parseSums(text).length, 2)
  assert.deepEqual(checkSums(dir, text), [])
  writeFileSync(path.join(dir, 'b.txt'), 'gamma')
  assert.equal(checkSums(dir, text)[0].file, 'b.txt')
  rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- export-db.sh (fake wp)
test('export-db.sh: placeholder in, stand URL out (both spellings), scrub appended, gzip written', () => {
  const dir = tmp()
  const out = path.join(dir, 'db.sql.gz')
  const r = spawnSync(
    'bash',
    [
      path.join(QS, 'export-db.sh'),
      '--wp',
      path.join(FX, 'fake-wp.sh'),
      '--site-url',
      'http://127.0.0.1:8227',
      '--out',
      out
    ],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const sql = spawnSync('gzip', ['-dc', out], { encoding: 'utf8' }).stdout
  assert.ok(!sql.includes('127.0.0.1:8227'), 'no stand address, JSON-escaped spelling included')
  assert.ok(
    sql.includes('https:\\\\/\\\\/quickstart.invalid\\\\/wp-content'),
    'the SQL-escaped JSON spelling became the placeholder'
  )
  assert.ok(!sql.includes('fixturehash'), 'the hash is gone from the INSERT text')
  assert.ok(!sql.includes('session_tokens'), 'the session row is gone')
  const kept = spawnSync(
    'bash',
    [
      path.join(QS, 'export-db.sh'),
      '--wp',
      path.join(FX, 'fake-wp.sh'),
      '--site-url',
      'http://127.0.0.1:8227',
      '--out',
      out,
      '--keep-passwords'
    ],
    { encoding: 'utf8' }
  )
  assert.equal(kept.status, 0)
  assert.ok(
    spawnSync('gzip', ['-dc', out], { encoding: 'utf8' }).stdout.includes('fixturehash'),
    '--keep-passwords keeps the hash'
  )
  assert.equal(spawnSync('bash', [path.join(QS, 'export-db.sh'), '--help']).status, 0)
  assert.equal(spawnSync('bash', [path.join(QS, 'export-db.sh')]).status, 2)
  rmSync(dir, { recursive: true, force: true })
})

test('scrub-sql.py: passwords and activation keys blanked in the INSERT text, session rows dropped, other rows byte-stable', () => {
  const dir = tmp()
  const f = path.join(dir, 'd.sql')
  const src = readFileSync(path.join(FX, 'scrub.sql'), 'utf8')
  writeFileSync(f, src)
  const r = spawnSync('python3', [path.join(QS, 'scrub-sql.py'), '--file', f, '--prefix', 'tr_'], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /3 password\/activation values blanked, 2 session rows dropped/)
  const out = readFileSync(f, 'utf8')
  assert.ok(!/\$wp\$|\$P\$|1700000000:abc/.test(out))
  assert.ok(!out.includes('session_tokens'))
  assert.match(
    out,
    /\('1', 'tracyagent', '', 'a@example.com', '', 'Tracy'\),\n\('2', 'lee', '', 'l@example.com', '', 'Lee'\);/
  )
  assert.match(
    out,
    /INSERT INTO `tr_usermeta` \(`umeta_id`, `user_id`, `meta_key`, `meta_value`\) VALUES \n\('1', '1', 'nickname', 'tracyagent'\);/
  )
  assert.ok(
    out.includes(src.split('\n').slice(0, 2).join('\n')),
    'the post row with newlines, parens, escaped quotes is untouched'
  )
  assert.ok(out.includes("('1', 'siteurl', 'https://quickstart.invalid');"))
  writeFileSync(f, src)
  const keep = spawnSync(
    'python3',
    [path.join(QS, 'scrub-sql.py'), '--file', f, '--prefix', 'tr_', '--keep-passwords'],
    { encoding: 'utf8' }
  )
  assert.equal(keep.status, 0)
  assert.ok(readFileSync(f, 'utf8').includes('$wp$2y$10$abcdefghijklmnopqrstuv'))
  assert.ok(!readFileSync(f, 'utf8').includes('session_tokens'), 'sessions go even with --keep-passwords')
  assert.equal(
    spawnSync('python3', [path.join(QS, 'scrub-sql.py'), '--file', f, '--prefix', 'wp_']).status,
    1,
    'no users table for that prefix'
  )
  rmSync(dir, { recursive: true, force: true })
})

test('export-db.sh: a wrong prefix is refused', () => {
  const dir = tmp()
  const r = spawnSync(
    'bash',
    [
      path.join(QS, 'export-db.sh'),
      '--wp',
      path.join(FX, 'fake-wp.sh'),
      '--site-url',
      'http://127.0.0.1:8227',
      '--out',
      path.join(dir, 'x.gz'),
      '--prefix',
      'wp_'
    ],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no CREATE TABLE `wp_/)
  rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- secret-scan.sh
function makePack(dir, { config, sql, extraFiles = {} }) {
  const root = path.join(dir, 'root')
  mkdirSync(path.join(root, 'wp-content'), { recursive: true })
  writeFileSync(path.join(root, 'index.php'), '<?php')
  writeFileSync(path.join(root, 'wp-config.php'), config)
  for (const [rel, body] of Object.entries(extraFiles)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  const pack = path.join(dir, 'pack')
  mkdirSync(pack)
  const files = spawnSync('find', ['.', '-type', 'f'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n')
    .filter(Boolean)
    .map((f) => f.slice(2))
  spawnSync('tar', ['-czf', path.join(pack, 'x-webroot-1.0.0.tar.gz'), '-C', root, ...files], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }
  })
  writeFileSync(path.join(dir, 'd.sql'), sql)
  spawnSync('sh', [
    '-c',
    `gzip -c "${path.join(dir, 'd.sql')}" > "${path.join(pack, 'x-database-1.0.0.sql.gz')}"`
  ])
  return pack
}
const scan = (pack, ...args) =>
  spawnSync('bash', [path.join(QS, 'secret-scan.sh'), '--pack', pack, ...args], { encoding: 'utf8' })
const cleanSql =
  "CREATE TABLE `tr_options` (`a` int);\nINSERT INTO `tr_options` VALUES (1,'home','https://quickstart.invalid');\nUPDATE `tr_users` SET user_pass = '';\n"

test('secret-scan.sh: a clean pack passes', () => {
  const dir = tmp()
  const pack = makePack(dir, { config: renderQuickstartConfig(dockerConfig).source, sql: cleanSql })
  const r = scan(
    pack,
    '--site-url',
    'http://127.0.0.1:8227',
    '--stand-config',
    path.join(FX, 'wp-config.docker.php')
  )
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /compared 8 stand salts/)
  rmSync(dir, { recursive: true, force: true })
})

test('secret-scan.sh: each leak is named and blocks', () => {
  const cases = [
    {
      name: 'stand url in sql',
      sql: cleanSql + "INSERT INTO `tr_options` VALUES (2,'x','http://127.0.0.1:8227/a');\n",
      expect: /stand address/
    },
    {
      name: 'escaped stand host in sql',
      sql: cleanSql + "INSERT INTO `tr_posts` VALUES (2,'http:\\/\\/127.0.0.1:8227\\/a');\n",
      expect: /JSON-escaped/
    },
    {
      name: 'session',
      sql: cleanSql + "INSERT INTO `tr_usermeta` VALUES (1,1,'session_tokens','a:0:{}');\n",
      expect: /login session/
    },
    {
      name: 'cowork token',
      sql: cleanSql + "INSERT INTO `tr_options` VALUES (3,'claude_cowork_token','abc');\n",
      expect: /Cowork token/
    },
    {
      name: 'password hash',
      sql:
        cleanSql +
        "INSERT INTO `tr_users` VALUES (1,'a','$wp$2y$10$abcdefghijklmnopqrstuvwxyz0123456789');\n",
      expect: /password hash/
    },
    {
      name: 'api key in sql',
      sql: cleanSql + "INSERT INTO `tr_options` VALUES (4,'k','sk-ant-api03-abcdefghijklmnopqrstuvwxyz');\n",
      expect: /anthropic key/
    },
    { name: 'unrewritten docker config', config: dockerConfig, expect: /getenv_docker|placeholder/ },
    {
      name: 'stand salt shipped',
      config: renderQuickstartConfig(dockerConfig).source.replace(
        /define\( 'AUTH_KEY',\s*'[^']*'/,
        "define( 'AUTH_KEY',         'fixture0000000000000000000000000000000001'"
      ),
      expect: /stand's AUTH_KEY/
    },
    { name: 'env file in webroot', extraFiles: { '.env': 'X=1' }, expect: /env file/ },
    { name: 'debug.log in webroot', extraFiles: { 'wp-content/debug.log': 'x' }, expect: /debug log/ },
    {
      name: 'github token in a file',
      extraFiles: { 'wp-content/themes/t/x.php': 'ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD' },
      expect: /github token/
    }
  ]
  for (const c of cases) {
    const dir = tmp()
    const pack = makePack(dir, {
      config: c.config ?? renderQuickstartConfig(dockerConfig).source,
      sql: c.sql ?? cleanSql,
      extraFiles: c.extraFiles
    })
    const r = scan(
      pack,
      '--site-url',
      'http://127.0.0.1:8227',
      '--stand-config',
      path.join(FX, 'wp-config.docker.php')
    )
    assert.equal(r.status, 1, `${c.name}: expected block\n${r.stdout}`)
    assert.match(r.stdout, c.expect, c.name)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secret-scan.sh: --allow-hashes and --env-file', () => {
  const dir = tmp()
  const hashed = cleanSql + "INSERT INTO `tr_users` VALUES (1,'a','$P$Babcdefghijklmnopqrstuvwxyz012');\n"
  const pack = makePack(dir, {
    config: renderQuickstartConfig(dockerConfig).source,
    sql: hashed + "INSERT INTO `tr_options` VALUES (9,'x','hunter2hunter2');\n"
  })
  assert.equal(scan(pack).status, 1)
  assert.equal(scan(pack, '--allow-hashes').status, 0)
  writeFileSync(path.join(dir, '.env'), 'MARIADB_ROOT_PASSWORD=hunter2hunter2\nSHORT=ab\n')
  const r = scan(pack, '--allow-hashes', '--env-file', path.join(dir, '.env'))
  assert.equal(r.status, 1)
  assert.match(r.stdout, /value of MARIADB_ROOT_PASSWORD/)
  assert.equal(spawnSync('bash', [path.join(QS, 'secret-scan.sh'), '--help']).status, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('secret-scan.sh greps the same API-key patterns lib.mjs exports', () => {
  const script = readFileSync(path.join(QS, 'secret-scan.sh'), 'utf8')
  const block = script.match(/<<'PATTERNS'\n([\s\S]*?)\nPATTERNS/)[1]
  const inScript = block.split('\n').map((l) => l.split('|')[1])
  const keyPatterns = SECRET_PATTERNS.filter((p) => !/cowork|session/.test(p.name)).map((p) => p.re.source)
  assert.deepEqual(inScript, keyPatterns)
})

// ---------------------------------------------------------------- parity diff
test('compareParity: routes, counts, presence and computed styles, tolerance through diffSnapshots', () => {
  const a = {
    routes: { '/': 200, '/about': 200, '/x': 404 },
    counts: { 'post:page': 40, 'option:stylesheet': 'tracy-base' },
    styles: {
      '/|1440|light': {
        body: { color: 'rgb(29, 29, 31)', 'font-size': '17px' },
        h1: { color: 'rgb(0, 0, 0)' }
      }
    }
  }
  const same = JSON.parse(JSON.stringify(a))
  same.styles['/|1440|light'].body.color = 'rgb(31, 31, 33)'
  const ok = compareParity(a, same, { diff: diffSnapshots, tolerance: 8, expected: { '/x': 404 } })
  assert.equal(ok.ok, true)
  assert.equal(ok.styles.checked, 3)
  assert.deepEqual(ok.styles.perAxis, { '/|1440|light': 3 }, 'the checks are recorded per axis')
  const b = {
    routes: { '/': 200, '/about': 301, '/x': 404 },
    counts: { 'post:page': 39, 'option:stylesheet': 'tracy-base' },
    styles: { '/|1440|light': { body: { color: 'rgb(255, 255, 255)', 'font-size': '17px' } } }
  }
  const r = compareParity(a, b, { diff: diffSnapshots, tolerance: 8 })
  assert.equal(r.ok, false)
  assert.deepEqual(
    r.routes.find((x) => x.path === '/about'),
    { path: '/about', expected: 200, a: 200, b: 301, ok: false }
  )
  assert.equal(r.routes.find((x) => x.path === '/x').ok, false, 'the same undeclared 404 on both sides proves nothing')
  assert.equal(r.counts.find((c) => c.name === 'post:page').ok, false)
  assert.ok(r.styles.mismatches.some((m) => m.selector === 'h1' && m.property === 'presence'))
  assert.ok(r.styles.mismatches.some((m) => m.selector === 'body' && m.property === 'color'))
  // an axis captured empty on both stands is counted as an axis and records 0 checks of its own
  const empty = compareParity({ routes: {}, styles: { ...a.styles, '/|390|dark': {} } }, { routes: {}, styles: { ...same.styles, '/|390|dark': {} } }, { diff: diffSnapshots, tolerance: 8 })
  assert.equal(empty.styles.axes, 2)
  assert.deepEqual(empty.styles.perAxis, { '/|1440|light': 3, '/|390|dark': 0 })
})

test('compareParity without styles or counts is routes only', () => {
  const r = compareParity({ routes: { '/': 200 } }, { routes: { '/': 200 } })
  assert.equal(r.ok, true)
  assert.equal(r.styles.axes, 0)
})

test('compareParity (#60): a route matches only when both stands answer the status it is declared to answer', () => {
  const expected = new Map([['/404', 404], ['/old', 301]])
  const rows = (a, b) => compareParity({ routes: a }, { routes: b }, { expected }).routes
  const [home, missing, moved] = rows({ '/': 200, '/404': 404, '/old': 301 }, { '/': 200, '/404': 404, '/old': 301 })
  assert.deepEqual([home.ok, missing.ok, moved.ok], [true, true, true])
  assert.deepEqual(missing, { path: '/404', expected: 404, a: 404, b: 404, ok: true })
  assert.equal(rows({ '/404': 200 }, { '/404': 200 })[0].ok, false, 'a declared 404 page answering 200 on both is not the declaration')
  assert.equal(rows({ '/404': 404 }, { '/404': 200 })[0].ok, false)
  assert.equal(rows({ '/404': 410 }, { '/404': 410 })[0].ok, false, 'another error status is not the one declared')
  assert.equal(rows({ '/': 500 }, { '/': 500 })[0].ok, false, 'the same 500 on both stands is not parity')
  assert.equal(rows({ '/': 404 }, { '/': 404 })[0].ok, false, 'an undeclared route must answer 200')
  const failed = rows({ '/': 'error: fetch failed' }, { '/': 'error: fetch failed' })[0]
  assert.deepEqual([failed.expected, failed.ok], [200, false], 'the same failed request on both stands is not parity')
  assert.equal(rows({ '/old': 200 }, { '/old': 200 })[0].ok, false, 'a declared redirect answering 200 is not the declaration')
  assert.equal(compareParity({ routes: { '/404': 404 } }, { routes: { '/404': 404 } }, { expected: { '/404': 404 } }).ok, true, 'expected may be an object too')
})

test('routeExpectations / readRouteExpectations (#60): the declared status of each route, 200 by default; nonsense is refused', () => {
  // the page map of a port with its error page: view 404, synthetic
  assert.deepEqual(routeExpectations([{ path: '/about' }, { path: '/404', view: '404', synthetic: true }, { path: '/gone', status: '410' }, { path: '/moved', status: 301 }]), [
    { path: '/', expected: 200 },
    { path: '/about', expected: 200 },
    { path: '/404', expected: 404 },
    { path: '/gone', expected: 410 },
    { path: '/moved', expected: 301 }
  ])
  assert.deepEqual(routeExpectations([{ path: '/x', status: 200 }, { route: '/y' }, { file: 'no-path.html' }, '/x']), [{ path: '/', expected: 200 }, { path: '/x', expected: 200 }, { path: '/y', expected: 200 }], 'a path entry without a status declares 200; an entry without a path is not a route')
  assert.throws(() => routeExpectations([{ path: '/a', status: 'soon' }]), /declares status "soon"/)
  assert.throws(() => routeExpectations([{ path: '/a', status: 204 }]), /not 200, a 3xx, a 4xx or a 5xx/)
  assert.throws(() => routeExpectations([{ path: '/a', status: 404.5 }]), /declares status 404.5/)
  assert.throws(() => routeExpectations([{ path: '/a', status: 700 }]), /declares status 700/)
  assert.throws(() => routeExpectations([{ path: '/a' }, { path: '/a', view: '404' }]), /\/a is declared twice, answering 200 and 404/)
  assert.throws(() => routeExpectations([{ path: 'about' }]), /is not a \/path/)
  // a path URL resolution would take to another origin, or that no request line carries as written
  // …or that is recorded as one path while another is requested: a fragment is never sent, a dot
  // segment is resolved away, an unencoded character or an empty query is sent rewritten
  for (const bad of ['//evil.test/x', '///x', '/\\evil.test', '/a b', '/a\nb', '/a\tb', '/404#x', '/#', '/a/../404', '/./404', '/a/%2e%2e/404', '/a/..', '/café', '/a?', '/a?b c']) // language-allow: data: accented path
    assert.throws(() => routeExpectations([{ path: bad }]), /is not a \/path on the stand/, JSON.stringify(bad))
  assert.throws(() => readRouteExpectations('/,//evil.test'), /is not a \/path on the stand/, 'a comma list is held to the same')
  assert.deepEqual(routeExpectations(['/?s=x', '/a/b/']).map((r) => r.path), ['/', '/?s=x', '/a/b/'], 'a query and a trailing slash stay part of the route')
  assert.throws(() => routeExpectations([7]), /entry 0 is not a path/)
  assert.throws(() => routeExpectations(undefined, 'map'), /map: no pages\[\] or routes\[\] list/)
  assert.deepEqual([200, 404, 500].map(isRenderableStatus), [true, true, true])
  assert.deepEqual([301, 302, null, undefined].map(isRenderableStatus), [false, false, false, false], 'a redirect draws no page of its own')

  const dir = tmp()
  try {
    const map = path.join(dir, 'page-map.json')
    writeFileSync(map, JSON.stringify({ pages: [{ path: '/' }, { path: '/404', view: '404', synthetic: true }] }))
    assert.deepEqual(readRouteExpectations(map), [{ path: '/', expected: 200 }, { path: '/404', expected: 404 }])
    assert.deepEqual(readRouteExpectations('/a,/b'), [{ path: '/', expected: 200 }, { path: '/a', expected: 200 }, { path: '/b', expected: 200 }])
    assert.throws(() => readRouteExpectations(path.join(dir, 'page-mpa.json')), /no such file, and not a list of \/paths/, 'a mistyped page map is not a route')
    assert.throws(() => readRouteExpectations('about,contact'), /not a list of \/paths/)
    assert.throws(() => readRouteExpectations(''), /not a list of \/paths/)
    writeFileSync(path.join(dir, 'bad.json'), '{"pages": [')
    assert.throws(() => readRouteExpectations(path.join(dir, 'bad.json')), /not valid JSON/)
    if (process.getuid?.() !== 0) {
      writeFileSync(path.join(dir, 'locked.json'), '[]')
      chmodSync(path.join(dir, 'locked.json'), 0o000)
      assert.throws(() => readRouteExpectations(path.join(dir, 'locked.json')), /locked\.json: cannot be read \(EACCES\)/, 'an unreadable file is not called invalid JSON')
    }
    writeFileSync(path.join(dir, 'empty.json'), '{}')
    assert.throws(() => readRouteExpectations(path.join(dir, 'empty.json')), /no pages\[\] or routes\[\] list/)
    // an existing directory or FIFO is refused, never read as the route its path spells, and a FIFO
    // nothing writes to is not waited on; `/` alone is the front page
    mkdirSync(path.join(dir, 'maps'))
    assert.throws(() => readRouteExpectations(path.join(dir, 'maps')), /maps: is a directory, not a routes file/)
    if (spawnSync('mkfifo', [path.join(dir, 'routes-fifo')]).status === 0)
      assert.throws(() => readRouteExpectations(path.join(dir, 'routes-fifo')), /routes-fifo: is not a regular file/)
    assert.deepEqual(readRouteExpectations('/'), [{ path: '/', expected: 200 }])
    assert.deepEqual(routeExpectations(['/a%20b', '/caf%C3%A9', '/?s=a%20b']).map((r) => r.path), ['/', '/a%20b', '/caf%C3%A9', '/?s=a%20b'], 'a path already encoded is requested as written')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readRoutes: page-map, list JSON, comma list — deduplicated, / first', () => {
  assert.deepEqual(readRoutes(path.join(FX, 'page-map.min.json')), ['/', '/about', '/contact'])
  assert.deepEqual(readRoutes('/a,/b,/a'), ['/', '/a', '/b'])
  const dir = tmp()
  writeFileSync(path.join(dir, 'r.json'), JSON.stringify([{ path: '/x' }, '/y']))
  assert.deepEqual(readRoutes(path.join(dir, 'r.json')), ['/', '/x', '/y'])
  rmSync(dir, { recursive: true, force: true })
})

test('verify-parity: the dark hook is the one shoot.mjs uses; the first .acm-* section is a selector', () => {
  assert.equal(initScriptFor, sharedInitScriptFor, 'one hook grammar, lib/browser.mjs')
  assert.match(initScriptFor('attr:data-theme=dark'), /setAttribute\("data-theme", "dark"\)/)
  assert.ok(DEFAULT_SELECTORS.includes('[class*="acm-"]'))
  assert.throws(() => initScriptFor('nope:x'), /unknown dark hook/)
})

// ---------------------------------------------------------------- release
const manifest = {
  id: 'tracy-base/wp7',
  version: '1.0.0',
  platform: 'wordpress',
  wpVersion: '7.1',
  phpVersion: '8.3.33',
  prefix: 'tr_',
  placeholderUrl: PLACEHOLDER_URL,
  theme: { name: 'tracy-base', version: '1.0.0' },
  plugins: [],
  counts: { page: 40 },
  webroot: { file: 'tracy-base-wp7-webroot-1.0.0.tar.gz', bytes: 1, sha256: 'a' },
  database: { file: 'tracy-base-wp7-database-1.0.0.sql.gz', bytes: 1, sha256: 'b' },
  passwordsBlanked: true
}
const parity = {
  a: 'http://127.0.0.1:8227',
  b: 'http://127.0.0.1:8228',
  generatedAt: 't',
  ok: true,
  routes: [{ path: '/', a: 200, b: 200, ok: true }],
  counts: [],
  styles: {
    axes: 4,
    checked: 10,
    mismatches: [],
    viewports: '1440x900,390x844',
    themes: ['light', 'dark'],
    selectors: DEFAULT_SELECTORS,
    tolerance: 8
  },
  summary: {
    routes: 1,
    routesMatching: 1,
    routes200: 1,
    counts: 0,
    countsMatching: 0,
    axes: 4,
    styleChecks: 10,
    styleMismatches: 0
  }
}

test('release: title, VERIFICATION shape, README restore commands, notes template, gh command', () => {
  assert.equal(titleFor(manifest), 'Quickstart: Tracy Base / WordPress 7')
  const v = buildVerification({
    manifest,
    parity,
    restoreReport: { steps: [{ name: 'extract' }], finishedAt: 'x' }
  })
  assert.equal(v.release, 'tracy-base/wp7')
  assert.equal(v.parity.routes.both200, 1)
  assert.equal(v.restoration.steps.length, 1)
  assert.equal(v.restoration.placeholderUrl, PLACEHOLDER_URL)
  const readme = readmeText(manifest, { repo: 'JoomlArt-Products/ja-products' })
  assert.match(readme, /wp search-replace 'https:\/\/quickstart\.invalid'/)
  assert.match(readme, /render_wp_config\.py/)
  assert.match(readme, /wp user update tracyagent --user_pass/)
  const notes = notesTemplate(manifest, v)
  assert.match(notes, /\{\{ONE_LINE_WHAT_THIS_IS\}\}/)
  assert.match(notes, /1\/1 routes answer their declared status on both stands \(1 of them 200\)/)
  const cmd = ghCommand({
    tag: 'tracy-base/wp7',
    repo: 'JoomlArt-Products/ja-products',
    title: 'Quickstart: Tracy Base / WordPress 7',
    notesFile: '/r/release-notes.md',
    assets: ['/r/a.tar.gz', "/r/it's.zip"]
  })
  assert.equal(
    cmd,
    `gh release create 'tracy-base/wp7' -R JoomlArt-Products/ja-products --draft --title 'Quickstart: Tracy Base / WordPress 7' --notes-file '/r/release-notes.md' '/r/a.tar.gz' '/r/it'\\''s.zip'`
  )
})

test('every quickstart tool answers --help with exit 0, and every one that runs something has --timeout', () => {
  const timeouts = { 'prune-audit.mjs': 900, 'pack.mjs': 1800, 'restore.mjs': 1800, 'release.mjs': 900, 'cycle.mjs': 3600 }
  for (const tool of ['prune-audit.mjs', 'pack.mjs', 'restore.mjs', 'verify-parity.mjs', 'release.mjs', 'cycle.mjs']) {
    const r = spawnSync('node', [path.join(QS, tool), '--help'], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${tool}: ${r.stderr}`)
    assert.match(r.stdout, /usage:/)
    if (timeouts[tool]) assert.match(r.stdout, new RegExp(`--timeout <s>.*\\(default: ${timeouts[tool]}\\)`), `${tool} lists --timeout`)
  }
  const r = spawnSync('node', [path.join(QS, 'pack.mjs')], { encoding: 'utf8' })
  assert.equal(r.status, 2, 'missing required flags is a usage error')
})

test('applyPrune: post deletions go in one wp call per batch; the rest stay one call each', async () => {
  const { applyPrune } = await import('../quickstart/prune-audit.mjs')
  const calls = []
  // The re-read before deletion (lib.mjs ownersPhp) finds every post as the audit saw it.
  const now = { users: [], posts: Array.from({ length: 120 }, (_, i) => ({ ID: String(i + 1), post_type: 'revision', post_status: 'inherit' })) }
  const wp = (args) => (args[0] === 'eval' ? { status: 0, stdout: `__TRACY_OWNERS__${JSON.stringify(now)}`, stderr: '' } : calls.push(args))
  const rows = [
    ...Array.from({ length: 120 }, (_, i) => ({ verdict: 'PRUNE', remove: { wp: ['post', 'delete', String(i + 1), '--force'], expect: { post_type: 'revision', post_status: 'inherit' } } })),
    { verdict: 'PRUNE', remove: { wp: ['transient', 'delete', 'x'] } },
    { verdict: 'KEEP', remove: { wp: ['post', 'delete', '999', '--force'] } }
  ]
  applyPrune(rows, { wp, webroot: '.', batch: 50 })
  const deletes = calls.filter((c) => c[0] === 'post')
  assert.equal(deletes.length, 3, '120 ids in batches of 50 → 3 calls')
  assert.equal(deletes[0].length, 50 + 3)
  assert.deepEqual(deletes[2].slice(0, 2), ['post', 'delete'])
  assert.equal(deletes[2].at(-1), '--force')
  assert.equal(calls.filter((c) => c[0] === 'transient').length, 1)
  assert.equal(rows.filter((r) => r.verdict === 'REMOVED').length, 121)
  assert.equal(rows.at(-1).verdict, 'KEEP')
})

// ---------------------------------------------------------------- the shipped wp-config.php is the accepted form
const SALTS = Object.fromEntries(SALT_CONSTANTS.map((n, i) => [n, `salt-${i}-${'x'.repeat(30)}`]))

/** The problems checkWebrootTar finds in an archive of a fake webroot that ships `config`; `placeholders` are what the pack expects in the DB defines. */
function configProblems(config, { placeholders = renderQuickstartConfig(officialConfig).placeholders } = {}) {
  const root = fakeWebroot()
  const dir = testDir('qs-config')
  const out = path.join(dir, 'w.tar.gz')
  buildWebrootTar({ webroot: root, out, config })
  const r = checkWebrootTar(out, { standConfig: officialConfig, placeholders })
  rmSync(root, { recursive: true, force: true })
  return r.problems
}

test('checkWebrootTar: the accepted wp-config.php passes, with the sites\' own DB values, keys, salts, table prefix and line endings', () => {
  const accepted = renderQuickstartConfig(officialConfig).source
  assert.deepEqual(configProblems(accepted), [])
  assert.deepEqual(configProblems(accepted.replace(/\n/g, '\r\n')), [])
  const placeholders = { DB_NAME: 'site_db', DB_USER: "it's", DB_PASSWORD: 'a\\\\b', DB_HOST: 'db.example:3306' }
  const own = renderQuickstartConfig(officialConfig, { prefix: 'site9_', salts: SALTS, placeholders }).source
  assert.deepEqual(configProblems(own, { placeholders }), [])
})

test('checkWebrootTar: the official image file rendered is accepted, and the abridged test fixture rendered is refused at the line where it departs', () => {
  assert.deepEqual(configProblems(renderQuickstartConfig(officialConfig).source), [])
  const abridged = configProblems(renderQuickstartConfig(dockerConfig).source)
  assert.equal(abridged.length, 1)
  assert.match(abridged[0], /^archive wp-config\.php differs from the accepted form at line 3: /)
})

test('checkWebrootTar: a wp-config.php that differs from the accepted form anywhere else is refused, naming wp-config.php and the line', () => {
  const accepted = renderQuickstartConfig(officialConfig).source
  const proxy = /if \(isset\(\$_SERVER\['HTTP_X_FORWARDED_PROTO'\][\s\S]*?\n}\n/
  const cases = {
    comment: accepted.replace('<?php\n', '<?php\n// edited\n'),
    spacing: accepted.replace("define( 'DB_COLLATE'", "define(  'DB_COLLATE'"),
    charset: accepted.replace("'utf8mb4'", "'utf8'"),
    collate: accepted.replace("define( 'DB_COLLATE', '' )", "define( 'DB_COLLATE', 'utf8_general_ci' )"),
    debug: accepted.replace('define( \'WP_DEBUG\', false )', 'define( \'WP_DEBUG\', true )'),
    noProxy: accepted.replace(proxy, ''),
    proxyOff: accepted.replace("$_SERVER['HTTPS'] = 'on'", "$_SERVER['HTTPS'] = 'off'"),
    proxyDead: accepted.replace(proxy, (m) => `if (false):\n${m}endif;\n`),
    earlyReturn: accepted.replace(proxy, (m) => `if (true) { return; }\n${m}`),
    guardReturns: accepted.replace("define( 'ABSPATH', __DIR__ . '/' );", 'return;'),
    trailing: `${accepted}phpinfo();\n`,
    noRequire: accepted.replace(/require_once ABSPATH[^\n]*\n/, ''),
    decoyString: accepted.replace('<?php\n', "<?php\n$x = \"require_once ABSPATH . 'wp-settings.php';\";\n"),
    extraDefine: accepted.replace("define( 'WP_DEBUG', false );", "define( 'WP_DEBUG', false );\ndefine( 'WP_HTTP_BLOCK_EXTERNAL', true );"),
    prefixExpression: accepted.replace("'tr_'", "'tr_' . evil()"),
    saltExpression: accepted.replace(/define\( 'AUTH_KEY',(\s+)'[^']*'/, "define( 'AUTH_KEY',$1phpinfo()"),
    saltTwoValues: accepted.replace(/define\( 'NONCE_SALT',(\s+)'[^']*'/, "define( 'NONCE_SALT',$1'a','b'"),
    truncated: accepted.split('\n').slice(0, 30).join('\n'),
    empty: ''
  }
  for (const [name, config] of Object.entries(cases)) {
    assert.notEqual(config, accepted, `${name}: the case was built`)
    const wrong = configProblems(config).filter((p) => /wp-config\.php/.test(p) && /differs from the accepted form/.test(p))
    assert.equal(wrong.length, 1, `${name}: ${wrong.join(' | ')}`)
    assert.match(wrong[0], /archive wp-config\.php differs from the accepted form(?: at line \d+|: it ends at line)/, name)
  }
})

test('checkWebrootTar: wp-config.php is one regular file under one canonical name with valid UTF-8 — a second spelling, a link, a directory and a stray byte are refused', () => {
  const dir = testDir('qs-config-member')
  const placeholders = renderQuickstartConfig(officialConfig).placeholders
  const configLines = (tarBytes) => {
    const out = path.join(dir, 'm.tar.gz')
    writeFileSync(out, tarBytes)
    return checkWebrootTar(out, { standConfig: officialConfig, placeholders }).problems.filter((p) => /wp-config|restore will not extract/.test(p))
  }
  assert.deepEqual(configLines(webrootTar()), [])
  assert.ok(configLines(webrootTar({ 'wp-config.php': null, './wp-config.php': rendered })).some((p) => /unsafe path "\.\/wp-config\.php"/.test(p)))
  assert.ok(configLines(webrootTar({ '././wp-config.php': rendered })).some((p) => /unsafe path "\.\/\.\/wp-config\.php"/.test(p)))
  assert.ok(configLines(webrootTar({ 'a/../readme.txt': 'x' })).some((p) => /unsafe path "a\/\.\.\/readme\.txt"/.test(p)))
  assert.ok(configLines(webrootTar({ 'a.txt': 'x', 'a.txt/': 'y' })).some((p) => /duplicate a\.txt/.test(p)))
  assert.ok(configLines(webrootTar({ link: { type: '2', linkname: 'wp-config.php' } })).some((p) => /symlink link/.test(p)))
  assert.ok(configLines(webrootTar({ 'f.txt': 'x', 'f.txt/i.txt': 'y' })).some((p) => /f\.txt\/i\.txt is below f\.txt/.test(p)))
  const bad = Buffer.concat([Buffer.from(rendered.replace("'tr_'", "'tr_")), Buffer.from([0xff, 0xfe]), Buffer.from("';\n" + rendered.slice(rendered.indexOf('\n', rendered.indexOf("$table_prefix")) + 1))])
  assert.ok(configLines(webrootTar({ 'wp-config.php': bad })).includes('archive: wp-config.php is not valid UTF-8'))
})

test('pack.mjs: a stand wp-config.php that is a link or a FIFO is refused by name, with or without --config', () => {
  const dir = testDir('qs-pack-config-type')
  const root = fakeWebroot()
  const standFile = path.join(root, 'wp-config.php')
  rmSync(standFile, { force: true })
  const real = path.join(dir, 'real.php')
  writeFileSync(real, officialConfig)
  const stub = path.join(dir, 'wp.mjs')
  writeFileSync(stub, "const a = process.argv.slice(2).join(' ')\nif (a === 'option get siteurl') console.log('http://stand.test')\nelse if (a === 'core version') console.log('7.0')\nelse if (a === 'option get stylesheet') console.log('tracy-base')\nelse if (/^theme list/.test(a)) console.log('[{\"name\":\"tracy-base\",\"status\":\"active\",\"version\":\"1.0.0\"}]')\nelse if (/^plugin list/.test(a)) console.log('[]')\nelse if (/PHP_VERSION/.test(a)) console.log('8.3.0')\nelse if (/wpdb->prefix/.test(a)) console.log('tr_')\nelse if (/--format=count$/.test(a)) console.log(0)\nelse process.exit(1)\n")
  const run = (out) =>
    spawnSync(process.execPath, [path.join(HERE, '..', 'quickstart', 'pack.mjs'), '--webroot', root, '--wp', `${process.execPath} ${stub}`, '--site-url', 'http://stand.test', '--out', out, '--id', 'tracy-base/wp7', '--version', '1.0.0', '--prefix', 'tr_', '--skip-secret-scan', '--config', real], { encoding: 'utf8', timeout: 30000 })
  symlinkSync(real, standFile)
  const linked = run(path.join(dir, 'a'))
  assert.notEqual(linked.status, 0)
  assert.match(linked.stderr + linked.stdout, /wp-config\.php/)
  rmSync(standFile)
  assert.equal(spawnSync('mkfifo', [standFile]).status, 0)
  const fifo = run(path.join(dir, 'b'))
  assert.notEqual(fifo.status, 0)
  assert.match(fifo.stderr + fifo.stdout, /wp-config\.php/)
  rmSync(root, { recursive: true, force: true })
})

test('pack.mjs --config ships the accepted form in place of the stand\'s wp-config.php, which is left as it was; without it a stand with a wrong file is refused', () => {
  const dir = testDir('qs-pack-config')
  const stub = path.join(dir, 'wp.mjs')
  const answers = {
    'option get siteurl': 'http://stand.test',
    'core version': '7.0',
    'eval echo PHP_VERSION;': '8.3.0',
    'option get stylesheet': 'tracy-base',
    'theme list --fields=name,status,version --format=json': '[{"name":"tracy-base","status":"active","version":"1.0.0"}]',
    'plugin list --fields=name,status,version --format=json': '[]',
    'eval global $wpdb; echo $wpdb->prefix;': 'tr_'
  }
  writeFileSync(stub, `const a = process.argv.slice(2).join(' ')\nconst answers = ${JSON.stringify(answers)}\nif (a in answers) console.log(answers[a])\nelse if (/--format=count$/.test(a)) console.log(0)\nelse process.exit(1)\n`)
  const root = fakeWebroot()
  const standFile = path.join(root, 'wp-config.php')
  writeFileSync(standFile, officialConfig.replace("'utf8mb4'", "'utf8'"))
  const run = (out, ...extra) =>
    spawnSync(process.execPath, [path.join(HERE, '..', 'quickstart', 'pack.mjs'), '--webroot', root, '--wp', `${process.execPath} ${stub}`, '--site-url', 'http://stand.test', '--out', out, '--id', 'tracy-base/wp7', '--version', '1.0.0', '--prefix', 'tr_', '--skip-secret-scan', ...extra], { encoding: 'utf8' })
  const archive = (out) => path.join(out, 'tracy-base-wp7-webroot-1.0.0.tar.gz')
  const refused = run(path.join(dir, 'refused'))
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr + refused.stdout, /archive wp-config\.php differs from the accepted form at line 47/)
  assert.ok(!existsSync(archive(path.join(dir, 'refused'))), 'a refused archive is not left')
  const good = path.join(dir, 'good.php')
  writeFileSync(good, officialConfig)
  const shipped = run(path.join(dir, 'shipped'), '--config', good)
  // the database export has no stand behind the stub and ends the run after the archive is written and checked
  assert.match(shipped.stdout, /archiving the webroot/)
  assert.doesNotMatch(shipped.stderr + shipped.stdout, /differs from the accepted form/)
  assert.ok(existsSync(archive(path.join(dir, 'shipped'))))
  const cfg = spawnSync('tar', ['-xzOf', archive(path.join(dir, 'shipped')), 'wp-config.php'], { encoding: 'utf8' }).stdout
  assert.match(cfg, /define\( 'DB_CHARSET', 'utf8mb4' \);/)
  assert.doesNotMatch(cfg, /getenv_docker\(\s*'|fixture0000/)
  assert.equal(readFileSync(standFile, 'utf8'), officialConfig.replace("'utf8mb4'", "'utf8'"), 'the stand\'s file is not edited')
  // a --config that is not there, or is not the accepted form, ships nothing
  const missing = run(path.join(dir, 'missing'), '--config', path.join(dir, 'nowhere.php'))
  assert.notEqual(missing.status, 0)
  assert.ok(!existsSync(archive(path.join(dir, 'missing'))))
  writeFileSync(good, `${officialConfig}\n// extra\n`)
  const extra = run(path.join(dir, 'extra'), '--config', good)
  assert.notEqual(extra.status, 0)
  assert.match(extra.stderr + extra.stdout, /differs from the accepted form/)
  assert.ok(!existsSync(archive(path.join(dir, 'extra'))))
  rmSync(root, { recursive: true, force: true })
})
