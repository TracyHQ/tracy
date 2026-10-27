// road-precheck.mjs: the pilot-stage ask of the TracyHQ TCQR/TDSR checkers. The pure parts (image check and build,
// severity classification, verdict, provisional folder) run on fakes; one test runs the real CLI on a folder with no
// assets to prove the wiring and the exit code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleProvisional, checkPrereq, classify, findRepo, standImage, verdict } from '../quickstart/road-precheck.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '../quickstart/road-precheck.mjs')
const IMAGE = 'tracy/web-wordpress:php8.3-apache-20260923-r1'

function fakeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  mkdirSync(path.join(root, 'scripts'))
  mkdirSync(path.join(root, 'packages/design/tracy-ds-slot/scripts'), { recursive: true })
  writeFileSync(path.join(root, 'scripts/template-design-system-readiness.mjs'), '')
  writeFileSync(path.join(root, 'scripts/template-customization-question-readiness.mjs'), '')
  writeFileSync(path.join(root, 'packages/design/tracy-ds-slot/scripts/stand.mjs'), `const IMAGES = {\n  wordpress: '${IMAGE}',\n  db: 'mariadb:11'\n}\n`)
  return root
}

test('standImage reads the tag stand.mjs starts, else IMAGE_TAGS', () => {
  const repo = fakeRepo()
  try {
    assert.equal(standImage(repo), IMAGE)
    rmSync(path.join(repo, 'packages/design/tracy-ds-slot/scripts/stand.mjs'))
    mkdirSync(path.join(repo, 'packages/fleet/tracy-fleet-operation/web'), { recursive: true })
    writeFileSync(path.join(repo, 'packages/fleet/tracy-fleet-operation/web/IMAGE_TAGS'), 'wordpress=tracy/web-wordpress:x-1\n')
    assert.equal(standImage(repo), 'tracy/web-wordpress:x-1')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('checkPrereq: present image passes, missing is reported with the build command, --build builds it', () => {
  const repo = fakeRepo()
  try {
    const present = checkPrereq(repo, { run: () => ({ status: 0 }) })
    assert.deepEqual([present.ok, present.present, present.built], [true, true, false])

    const missing = checkPrereq(repo, { run: () => ({ status: 1 }) })
    assert.equal(missing.ok, false)
    assert.match(missing.note, /DEFAULTS_ONLY=1 bash web\/build\.sh wordpress/)

    const calls = []
    let built = false
    const run = (cmd, args, opts) => {
      calls.push([cmd, ...args])
      if (cmd === 'bash') {
        built = true
        assert.equal(opts.env.DEFAULTS_ONLY, '1')
        assert.match(opts.cwd, /packages\/fleet\/tracy-fleet-operation$/)
        return { status: 0 }
      }
      return { status: built ? 0 : 1 }
    }
    const result = checkPrereq(repo, { build: true, run })
    assert.deepEqual([result.ok, result.built], [true, true])
    assert.deepEqual(calls.map((c) => c[0]), ['docker', 'bash', 'docker'])

    const failing = checkPrereq(repo, { build: true, run: (cmd) => ({ status: cmd === 'bash' ? 3 : 1 }) })
    assert.equal(failing.ok, false)
    assert.match(failing.note, /failed/)

    assert.equal(checkPrereq(repo, { run: () => ({ error: new Error('ENOENT') }) }).ok, false)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

const severity = {
  rules: {
    'ABOUT-1': { group: 'must-fix' },
    'SLOT-1': { group: 'worth-fixing' },
    'CSS-2': { group: 'worth-fixing' },
    'TPL-1': { group: 'must-fix', question: 'Preview' },
    'IDENT-1': { group: 'worth-fixing', question: 'Built site' }
  },
  unmeasuredPreview: { group: 'must-fix' }
}
const report = (results) => ({ results: results.map((r) => ({ owner: 'template', message: `${r.id} message`, ...r })) })

test('classify: must-fix and unnamed rules block, worth-fixing warns, SLOT-* always blocks', () => {
  const lines = classify(
    'tcqr',
    report([
      { id: 'ABOUT-1', status: 'fail' },
      { id: 'NEW-9', status: 'fail' },
      { id: 'CSS-2', status: 'fail' },
      { id: 'SLOT-1', status: 'fail' },
      { id: 'REL-3', status: 'pass' }
    ]),
    severity,
    'pilot'
  )
  const level = Object.fromEntries(lines.map((l) => [l.id, l.level]))
  assert.deepEqual(level, { 'ABOUT-1': 'blocker', 'NEW-9': 'blocker', 'CSS-2': 'warn', 'SLOT-1': 'blocker' })
  assert.equal(verdict(lines).blocked, true)
  assert.equal(verdict(lines.filter((l) => l.level === 'warn')).blocked, false)
})

test('classify: SLOT-1 missing blocks at the pilot; a draft marked not ready is pending at the pilot and blocks at release', () => {
  const missing = report([{ id: 'SLOT-1', status: 'fail', message: 'No slot contract names wordpress/wp-ja-x' }])
  assert.equal(classify('tdsr', missing, severity, 'pilot')[0].level, 'blocker')
  const draft = report([{ id: 'SLOT-1', status: 'fail', message: 'templates/wordpress-wp-ja-x.json is marked not ready: draft' }])
  assert.equal(classify('tdsr', draft, severity, 'pilot')[0].level, 'pending')
  assert.equal(classify('tdsr', draft, severity, 'release')[0].level, 'blocker')
})

test('classify: unmeasured is pending at the pilot, a preview rule blocks at release (ds-not-at-probe), a built-site one only warns', () => {
  const r = report([
    { id: 'TPL-1', status: 'unmeasured' },
    { id: 'IDENT-1', status: 'unmeasured' }
  ])
  const pilot = classify('tdsr', r, severity, 'pilot')
  assert.deepEqual(pilot.map((l) => l.level), ['pending', 'pending'])
  assert.equal(verdict(pilot).blocked, false)
  const release = classify('tdsr', r, severity, 'release')
  assert.deepEqual(Object.fromEntries(release.map((l) => [l.id, l.level])), { 'TPL-1': 'blocker', 'IDENT-1': 'warn' })
  assert.equal(verdict(release).blocked, true)
})

test('classify: a rule failing only because tracy_site_pages.json is not built yet is pending, others still block', () => {
  const r = report([
    { id: 'REL-2', status: 'fail', message: 'the release carries no tracy_site_pages.json.' },
    { id: 'ABOUT-1', status: 'fail' }
  ])
  const lines = classify('tcqr', r, severity, 'pilot', { sitePagesMissing: true })
  assert.deepEqual(Object.fromEntries(lines.map((l) => [l.id, l.level])), { 'REL-2': 'pending', 'ABOUT-1': 'blocker' })
  // at the release stage a missing tracy_site_pages.json is REL-2's real failure
  const release = classify('tcqr', r, severity, 'release', { sitePagesMissing: true })
  assert.equal(release[0].level, 'blocker')
  const asked = classify('tcqr', r, severity, 'pilot')
  assert.equal(asked[0].level, 'blocker')
})

test('assembleProvisional writes a valid setting and takes the pack archives', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    const pack = path.join(dir, 'pack')
    mkdirSync(pack)
    writeFileSync(path.join(pack, 'ja-x-wp7-webroot-1.0.0.tar.gz'), 'w')
    writeFileSync(path.join(pack, 'ja-x-wp7-database-1.0.0.sql.gz'), 'd')
    writeFileSync(path.join(dir, 'wp-ja-x-1.0.0.zip'), 'z')
    const out = path.join(dir, 'out')
    mkdirSync(out)
    const { inputs } = assembleProvisional(out, { slug: 'ja-x', version: '1.0.0', themeZip: path.join(dir, 'wp-ja-x-1.0.0.zip'), pack })
    assert.deepEqual(inputs, { themeZip: true, webroot: true, database: true, sitePages: false, settingTemplate: false, roles: false })
    const setting = JSON.parse(readFileSync(path.join(out, 'tracy_setting.json'), 'utf8'))
    assert.equal(setting.install.database.file, 'ja-x-wp7-database-1.0.0.sql.gz')
    assert.match(setting.install.database.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(readdirSync(out).sort(), ['ja-x-wp7-database-1.0.0.sql.gz', 'ja-x-wp7-webroot-1.0.0.tar.gz', 'tracy_setting.json', 'wp-ja-x-1.0.0.zip'])

    const bare = path.join(dir, 'bare')
    mkdirSync(bare)
    assert.equal(assembleProvisional(bare, { slug: 'ja-x', version: '1.0.0', themeZip: path.join(dir, 'wp-ja-x-1.0.0.zip') }).inputs.database, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assembleProvisional takes only the pack archives of the requested version', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    const pack = path.join(dir, 'pack')
    mkdirSync(pack)
    for (const v of ['1.0.0', '1.1.0']) {
      writeFileSync(path.join(pack, `ja-x-wp7-webroot-${v}.tar.gz`), `w${v}`)
      writeFileSync(path.join(pack, `ja-x-wp7-database-${v}.sql.gz`), `d${v}`)
    }
    writeFileSync(path.join(dir, 'wp-ja-x-1.1.0.zip'), 'z')
    const zip = path.join(dir, 'wp-ja-x-1.1.0.zip')
    const out = path.join(dir, 'out')
    mkdirSync(out)
    assembleProvisional(out, { slug: 'ja-x', version: '1.1.0', themeZip: zip, pack })
    assert.deepEqual(readdirSync(out).sort(), ['ja-x-wp7-database-1.1.0.sql.gz', 'ja-x-wp7-webroot-1.1.0.tar.gz', 'tracy_setting.json', 'wp-ja-x-1.1.0.zip'])
    // a version the pack does not hold is refused, naming what it holds, never silently another version
    const other = path.join(dir, 'other')
    mkdirSync(other)
    assert.throws(() => assembleProvisional(other, { slug: 'ja-x', version: '1.2.0', themeZip: zip, pack }), /no webroot archive ja-x-wp7-webroot-1\.2\.0\.tar\.gz .*1\.0\.0/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assembleProvisional takes the requested slug from a pack that holds two products at one version', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    const pack = path.join(dir, 'pack')
    mkdirSync(pack)
    for (const slug of ['ja-a', 'ja-z']) {
      writeFileSync(path.join(pack, `${slug}-wp7-webroot-1.1.0.tar.gz`), `w-${slug}`)
      writeFileSync(path.join(pack, `${slug}-wp7-database-1.1.0.sql.gz`), `d-${slug}`)
    }
    const zip = path.join(dir, 'wp-ja-z-1.1.0.zip')
    writeFileSync(zip, 'z')
    const out = path.join(dir, 'out')
    mkdirSync(out)
    assembleProvisional(out, { slug: 'ja-z', version: '1.1.0', themeZip: zip, pack })
    assert.deepEqual(readdirSync(out).sort(), ['ja-z-wp7-database-1.1.0.sql.gz', 'ja-z-wp7-webroot-1.1.0.tar.gz', 'tracy_setting.json', 'wp-ja-z-1.1.0.zip'])
    assert.equal(readFileSync(path.join(out, 'ja-z-wp7-webroot-1.1.0.tar.gz'), 'utf8'), 'w-ja-z')
    const none = path.join(dir, 'none')
    mkdirSync(none)
    assert.throws(() => assembleProvisional(none, { slug: 'ja-q', version: '1.1.0', themeZip: zip, pack }), /no webroot archive ja-q-wp7-webroot-1\.1\.0\.tar\.gz .*ja-a-wp7/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assembleProvisional rewrites a published setting template to the pilot version, archives and hashes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    const pack = path.join(dir, 'pack')
    mkdirSync(pack)
    writeFileSync(path.join(pack, 'ja-x-wp7-webroot-1.1.0.tar.gz'), 'w')
    writeFileSync(path.join(pack, 'ja-x-wp7-database-1.1.0.sql.gz'), 'd')
    const zip = path.join(dir, 'wp-ja-x-1.1.0.zip')
    writeFileSync(zip, 'z')
    const template = path.join(dir, 'published.json')
    const old = { schemaVersion: 'tracy-setting/v1', platform: 'wordpress', label: 'JA X', version: '1.0.0', cms: '7', install: { webroot: { file: 'ja-x-wp7-webroot-1.0.0.tar.gz', sha256: 'a'.repeat(64) }, database: { file: 'ja-x-wp7-database-1.0.0.sql.gz', sha256: 'b'.repeat(64) } }, template: 'ja-x' }
    writeFileSync(template, JSON.stringify(old))
    const out = path.join(dir, 'out')
    mkdirSync(out)
    assembleProvisional(out, { slug: 'ja-x', version: '1.1.0', themeZip: zip, pack, settingTemplate: template })
    const setting = JSON.parse(readFileSync(path.join(out, 'tracy_setting.json'), 'utf8'))
    assert.equal(setting.version, '1.1.0')
    assert.equal(setting.label, 'JA X')
    assert.equal(setting.install.webroot.file, 'ja-x-wp7-webroot-1.1.0.tar.gz')
    assert.notEqual(setting.install.database.sha256, 'b'.repeat(64))
    // no archives given and the template is of another version: names move to the version, hashes are zero (not the old ones)
    const bare = path.join(dir, 'bare')
    mkdirSync(bare)
    assembleProvisional(bare, { slug: 'ja-x', version: '1.1.0', themeZip: zip, settingTemplate: template })
    const stale = JSON.parse(readFileSync(path.join(bare, 'tracy_setting.json'), 'utf8'))
    assert.deepEqual([stale.version, stale.install.webroot.file, stale.install.webroot.sha256], ['1.1.0', 'ja-x-wp7-webroot-1.1.0.tar.gz', '0'.repeat(64)])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findRepo refuses a folder that holds no checkers', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    assert.throws(() => findRepo(empty), /does not hold/)
    const repo = fakeRepo()
    try {
      assert.equal(findRepo(repo), path.resolve(repo))
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('CLI: a release folder with no setting cannot be identified (exit 2); no mode is a usage error (exit 2)', (t) => {
  let repo
  try {
    repo = findRepo(undefined)
  } catch {
    return t.skip('not inside a TracyHQ checkout')
  }
  const empty = mkdtempSync(path.join(tmpdir(), 'road-precheck-test-'))
  try {
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--tch', repo, ...args], { encoding: 'utf8' })
    const none = run()
    assert.equal(none.status, 2)
    assert.match(none.stderr, /usage error/)
    const unreadable = run('--release', empty, '--tag', 'quickstart/ja-x/wp7')
    assert.equal(unreadable.status, 2)
    assert.match(unreadable.stderr, /no tracy_setting\.json/)
    // assembling a provisional folder without --version is refused: a default would judge the wrong release
    const zip = path.join(empty, 'wp-ja-x-1.1.0.zip')
    writeFileSync(zip, 'z')
    const noVersion = run('--theme-zip', zip, '--slug', 'ja-x')
    assert.equal(noVersion.status, 2)
    assert.match(noVersion.stderr, /needs --version/)
    assert.equal(existsSync(empty), true)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})
