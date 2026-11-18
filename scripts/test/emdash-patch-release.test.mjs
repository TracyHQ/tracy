// scripts/emdash-patch-release.mjs: a patch-only release cut from the published assets of an EmDash quickstart.
// The lockfile rewrite is held to what pnpm wrote for #684 on every theme; the cut is run on a small release made
// here in the shape tools/release.mjs publishes, and checked the way a host and Tracy read it.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyDistribution } from '../../packages/cms/tracy-emdash-theme-base/tools/distribution.mjs'
import { validateSetting } from '../../packages/site/tracy-site-build-core/src/tracy-setting.mjs'
import {
  cut,
  lockedVersions,
  notesFor,
  parseSums,
  patchDockerfile,
  patchHash,
  patchLockfile,
  patchWorkspace,
  workspaceBlockOf
} from '../emdash-patch-release.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const THEME = path.join(ROOT, 'packages/cms/tracy-emdash-theme-base')
const PATCHES = path.join(ROOT, 'patches')
const sha = (/** @type {string | Buffer} */ b) => createHash('sha256').update(b).digest('hex')
const temps = []
const temp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'epr-test-'))
  temps.push(d)
  return d
}
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true })
})

const HASHES = Object.fromEntries(
  ['picomatch@2.3.2', 'picomatch@4.0.7'].map((k) => [
    k,
    patchHash(readFileSync(path.join(PATCHES, `${k}.patch`)))
  ])
)

test('patchLockfile gives back, byte for byte, the lockfile pnpm wrote for the patches on every theme', () => {
  const themes = readdirSync(path.join(ROOT, 'packages/cms')).filter((d) =>
    d.startsWith('tracy-emdash-theme-')
  )
  assert.ok(themes.length >= 5)
  for (const t of themes) {
    const written = readFileSync(path.join(ROOT, 'packages/cms', t, 'pnpm-lock.yaml'), 'utf8')
    assert.match(written, /^patchedDependencies:/m, t)
    const unpatched = written
      .replace(/^patchedDependencies:\n(?: {2}.*\n)+\n/m, '')
      .replace(/\(patch_hash=[a-f0-9]{64}\)/g, '')
    assert.deepEqual(lockedVersions(unpatched, 'picomatch'), ['2.3.2', '4.0.7'], t)
    assert.equal(patchLockfile(unpatched, HASHES), written, t)
  }
})

test('the patch hash is the sha256 of the patch file, the one the develop lockfiles record', () => {
  const lock = readFileSync(path.join(THEME, 'pnpm-lock.yaml'), 'utf8')
  for (const [k, h] of Object.entries(HASHES)) assert.ok(lock.includes(`  ${k}: ${h}`), k)
})

test('patchLockfile patches importer versions and refuses a lockfile that already has patches', () => {
  const lock = [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    '      picomatch:',
    '        specifier: 4.0.7',
    '        version: 4.0.7',
    '',
    'packages:',
    '',
    '  picomatch@4.0.7:',
    '    resolution: {integrity: sha512-x}',
    '',
    'snapshots:',
    '',
    '  picomatch@4.0.7: {}',
    ''
  ].join('\n')
  const out = patchLockfile(lock, { 'picomatch@4.0.7': 'a'.repeat(64) })
  assert.match(out, /^patchedDependencies:\n {2}picomatch@4\.0\.7: a{64}\n\nimporters:/m)
  assert.match(out, / {8}version: 4\.0\.7\(patch_hash=a{64}\)\n/)
  assert.match(
    out,
    /^ {2}picomatch@4\.0\.7:\n {4}resolution/m,
    'the packages section names the registry tarball'
  )
  assert.match(out, /^ {2}picomatch@4\.0\.7\(patch_hash=a{64}\): \{\}$/m)
  assert.throws(() => patchLockfile(out, { 'picomatch@4.0.7': 'a'.repeat(64) }), /already has/)
})

test('the workspace block and the Dockerfile lines are the develop ones, put where #684 put them', () => {
  const block = workspaceBlockOf(readFileSync(path.join(THEME, 'pnpm-workspace.yaml'), 'utf8'))
  assert.match(block, /^# picomatch has GHSA-fc5q-39xc-vjpf/)
  const ws = patchWorkspace('packages:\n  - .\n', block, ['picomatch@4.0.7'])
  assert.match(ws, /patchedDependencies:\n {2}picomatch@4\.0\.7: patches\/picomatch@4\.0\.7\.patch\n$/)
  assert.doesNotMatch(ws, /2\.3\.2/, 'only the patches the lockfile needs')
  const dev = readFileSync(path.join(THEME, 'Dockerfile'), 'utf8')
  const unpatched = dev.replace(/\n# patches\/ holds[^\n]*\n[^\n]*\nCOPY patches \.\/patches/, '')
  assert.notEqual(unpatched, dev)
  assert.equal(patchDockerfile(unpatched, dev), dev)
  assert.throws(() => patchDockerfile(dev, dev), /already copies/)
})

/** A release in the shape tools/release.mjs publishes, for `version` of tracy-base. */
function publishedRelease({ version = '0.5.6', lockVersions = ['2.3.2', '4.0.7'] } = {}) {
  const dir = temp()
  const app = path.join(dir, 'app')
  const pub = path.join(dir, 'pub')
  mkdirSync(path.join(app, 'docs/generated'), { recursive: true })
  mkdirSync(pub)
  const w = (/** @type {string} */ f, /** @type {string} */ t) => writeFileSync(path.join(app, f), t)
  w(
    'package.json',
    `{\n  "name": "@tracy/emdash-theme-base",\n  "version": "${version}",\n  "dependencies": {\n    "emdash": "1.1.0"\n  }\n}\n`
  )
  w(
    'template.config.json',
    `{\n  "id": "tracy-base",\n  "label": "Tracy Base",\n  "version": "${version}",\n  "locales": ["en"]\n}\n`
  )
  const lock = [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    '      fdir:',
    '        specifier: 6.5.0',
    `        version: 6.5.0(picomatch@${lockVersions.at(-1)})`,
    '',
    'packages:',
    '',
    ...lockVersions.flatMap((v) => [`  picomatch@${v}:`, '    resolution: {integrity: sha512-x}', '']),
    '  request-light@0.5.6:',
    '    resolution: {integrity: sha512-y}',
    '',
    'snapshots:',
    '',
    `  fdir@6.5.0(picomatch@${lockVersions.at(-1)}):`,
    '    optionalDependencies:',
    `      picomatch: ${lockVersions.at(-1)}`,
    '',
    ...lockVersions.flatMap((v) => [`  picomatch@${v}: {}`, '']),
    '  request-light@0.5.6: {}',
    ''
  ].join('\n')
  w('pnpm-lock.yaml', lock)
  w('pnpm-workspace.yaml', 'packages:\n  - .\nminimumReleaseAge: 1440\n')
  const dev = readFileSync(path.join(THEME, 'Dockerfile'), 'utf8')
  w(
    'Dockerfile',
    dev
      .replace(/\n# patches\/ holds[^\n]*\n[^\n]*\nCOPY patches \.\/patches/, '')
      .replace(/io\.tracy\.template\.version="[^"]+"/, `io.tracy.template.version="${version}"`)
  )
  w('AGENTS.md', `Template \`tracy-base\` (npm \`@tracy/emdash-theme-base\` ${version}): a studio site.\n`)
  w('README.md', '# Tracy Base\n')
  const h = (/** @type {string} */ f) => `sha256:${sha(readFileSync(path.join(app, f)))}`
  w(
    'docs/generated/inventory.json',
    `{\n  "template": {\n    "id": "tracy-base",\n    "version": "${version}"\n  },\n  "inputs": {\n    "package.json": "${h('package.json')}",\n    "pnpm-lock.yaml": "${h('pnpm-lock.yaml')}"\n  }\n}\n`
  )
  w(
    'artifact.json',
    `{\n\t"templateId": "tracy-base",\n\t"version": "${version}",\n\t"package": {\n\t\t"name": "@tracy/emdash-theme-base",\n\t\t"version": "${version}"\n\t},\n\t"cms": {\n\t\t"name": "emdash",\n\t\t"version": "1.1.0"\n\t},\n\t"checksums": {\n\t\t"AGENTS.md": "${h('AGENTS.md')}",\n\t\t"docs/generated/inventory.json": "${h('docs/generated/inventory.json')}",\n\t\t"template.config.json": "${h('template.config.json')}",\n\t\t"pnpm-lock.yaml": "${h('pnpm-lock.yaml')}"\n\t}\n}\n`
  )
  const files = execFileSync('find', ['.', '-type', 'f'], { cwd: app, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((f) => f.slice(2))
    .sort()
  const checksums = Object.fromEntries(files.map((f) => [f, h(f)]))
  const artifactHash = `sha256:${sha(JSON.stringify(checksums))}`
  w(
    'distribution.json',
    `${JSON.stringify({ schemaVersion: 1, contractHash: 'sha256:c0', checksums, artifactHash }, null, 2)}\n`
  )
  const zip = `tracy-base-emdash-quickstart-${version}.zip`
  const state = `tracy-base-emdash-state-${version}.tar.gz`
  execFileSync('zip', ['-q', '-r', '-X', path.join(pub, zip), '.'], { cwd: app })
  const st = path.join(dir, 'state')
  mkdirSync(path.join(st, 'data'), { recursive: true })
  mkdirSync(path.join(st, 'uploads'))
  writeFileSync(path.join(st, 'data/data.db'), 'SQLite format 3\0')
  writeFileSync(
    path.join(st, 'data/seed-receipts.json'),
    `{\n  "template": "tracy-base",\n  "version": "${version}"\n}\n`
  )
  execFileSync('tar', ['-czf', path.join(pub, state), '-C', st, 'data', 'uploads'])
  const p = (/** @type {string} */ f, /** @type {string} */ t) => writeFileSync(path.join(pub, f), t)
  const asset = (/** @type {string} */ f) => ({
    file: f,
    bytes: readFileSync(path.join(pub, f)).length,
    sha256: sha(readFileSync(path.join(pub, f)))
  })
  const manifest = {
    schemaVersion: 'tracy-quickstart/v1',
    product: 'tracy-base',
    version,
    release: 'tracy-base/emdash-0.x',
    repository: 'JoomlArt-Products/joomlart-products',
    cms: { name: 'emdash', version: '1.1.0' },
    artifact: zip,
    ...asset(zip),
    templateVersion: version,
    template: { artifactHash, contractHash: 'sha256:c0', files: files.length },
    state: { ...asset(state), media: 0 },
    gates: { distribution: 'pass', browser: 'pending' },
    receipts: {}
  }
  p('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  p(
    'VERIFICATION.json',
    `${JSON.stringify({ release: manifest.release, version, report: { status: 'pending', node: 'v24.21.0' }, artifactHash, contractHash: 'sha256:c0', gates: { distribution: { status: 'pass' }, browser: { status: 'pending', reason: 'No browser measurements requested' } } }, null, 2)}\n`
  )
  p(
    'README.md',
    `## Tracy Base ${version} for EmDash 1.1.0\n\nTracy quickstart.\n\n### Install\n\n\`\`\`\nunzip ${zip} -d tracy-base-emdash && cd tracy-base-emdash\ntar -xzf ../${state}\ndocker build -t tracy-base-emdash:${version} . && docker run -d tracy-base-emdash:${version}\n\`\`\`\n\n### Files\n\n| File | Bytes | SHA-256 |\n|---|---:|---|\n| ${zip} | ${manifest.bytes} | ${manifest.sha256} |\n| ${state} | ${manifest.state.bytes} | ${manifest.state.sha256} |\n`
  )
  p('LICENSE', 'GPL-3.0-or-later\n')
  p('tracy_site_question.json', '{}\n')
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'emdash',
    label: 'Tracy Base',
    version,
    cms: '1.1.0',
    install: {
      source: { file: zip, sha256: manifest.sha256 },
      state: { file: state, sha256: manifest.state.sha256 }
    },
    template: 'tracy-base',
    languages: ['en']
  }
  p('tracy_setting.json', `${JSON.stringify(setting, null, 2)}\n`)
  const listed = [
    'manifest.json',
    'VERIFICATION.json',
    'README.md',
    'LICENSE',
    zip,
    state,
    'tracy_setting.json',
    'tracy_site_question.json'
  ]
  p('SHA256SUMS', `${listed.map((f) => `${sha(readFileSync(path.join(pub, f)))}  ${f}`).join('\n')}\n`)
  return { dir, pub, manifest }
}

test('cut: the new zip carries the patch and the version, verifies, and the release files name it', () => {
  const { dir, pub, manifest } = publishedRelease()
  const out = path.join(dir, 'tracy-base-0.5.9')
  const report = cut({ from: pub, version: '0.5.9', out, themeDir: THEME, patchesDir: PATCHES })
  const zip = 'tracy-base-emdash-quickstart-0.5.9.zip'
  const state = 'tracy-base-emdash-state-0.5.9.tar.gz'
  assert.deepEqual(
    readdirSync(out).sort(),
    ['README.md', 'SHA256SUMS', 'VERIFICATION.json', 'manifest.json', state, zip, 'tracy_setting.json'].sort()
  )
  assert.ok(existsSync(`${out}.report.json`))

  const app = path.join(dir, 'unzipped')
  execFileSync('unzip', ['-q', path.join(out, zip), '-d', app])
  const v = verifyDistribution(app)
  assert.deepEqual(v.errors, [])
  const m = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'))
  assert.equal(m.template.artifactHash, v.artifactHash, 'what emdash_build_image compares')
  assert.equal(m.version, '0.5.9')
  assert.equal(m.templateVersion, '0.5.9')
  assert.equal(m.artifact, zip)
  assert.equal(m.state.file, state)
  assert.equal(m.state.sha256, manifest.state.sha256, 'the state is the published bytes')
  assert.equal(m.patchRelease.of, '0.5.6')
  assert.deepEqual(m.gates, manifest.gates)

  const read = (/** @type {string} */ f) => readFileSync(path.join(app, f), 'utf8')
  assert.equal(JSON.parse(read('package.json')).version, '0.5.9')
  assert.equal(JSON.parse(read('template.config.json')).version, '0.5.9')
  assert.match(read('Dockerfile'), /io\.tracy\.template\.version="0\.5\.9"/)
  assert.match(
    read('Dockerfile'),
    /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\/\n# patches\/ holds[^\n]*\n[^\n]*\nCOPY patches \.\/patches\n/
  )
  assert.match(read('AGENTS.md'), /`@tracy\/emdash-theme-base` 0\.5\.9\)/)
  assert.match(read('pnpm-workspace.yaml'), /^minimumReleaseAge: 1440\n# picomatch has GHSA/m)
  assert.match(
    read('pnpm-lock.yaml'),
    /^patchedDependencies:\n {2}picomatch@2\.3\.2: [a-f0-9]{64}\n {2}picomatch@4\.0\.7: [a-f0-9]{64}\n\nimporters:/m
  )
  assert.equal(
    read('patches/picomatch@4.0.7.patch'),
    readFileSync(path.join(PATCHES, 'picomatch@4.0.7.patch'), 'utf8')
  )
  const artifact = JSON.parse(read('artifact.json'))
  assert.equal(artifact.version, '0.5.9')
  assert.equal(artifact.package.version, '0.5.9')
  assert.equal(JSON.parse(read('docs/generated/inventory.json')).template.version, '0.5.9')
  // the sha256 statements about changed files are true again, transitively (inventory → artifact.json)
  for (const [f, h] of Object.entries(artifact.checksums))
    assert.equal(h, `sha256:${sha(readFileSync(path.join(app, f)))}`, f)
  for (const [f, h] of Object.entries(JSON.parse(read('docs/generated/inventory.json')).inputs))
    assert.equal(h, `sha256:${sha(readFileSync(path.join(app, f)))}`, f)
  assert.match(read('README.md'), /^# Tracy Base\n$/, 'files the patch does not touch keep their bytes')

  // what is left of 0.5.6 in the zip is the lockfile's request-light@0.5.6, and the report says why
  assert.deepEqual(
    report.oldVersionLeftInZip.map((h) => [h.file, h.reason !== null]),
    [
      ['pnpm-lock.yaml', true],
      ['pnpm-lock.yaml', true]
    ]
  )
  assert.deepEqual(
    report.oldVersionInState.map((h) => h.file),
    ['data/seed-receipts.json']
  )
  assert.deepEqual(report.untouched, ['LICENSE', 'tracy_site_question.json'])

  // SHA256SUMS checks over the tag as it will be: the uploaded files plus the untouched ones
  for (const [f, want] of parseSums(readFileSync(path.join(out, 'SHA256SUMS'), 'utf8')))
    assert.equal(sha(readFileSync(path.join(existsSync(path.join(out, f)) ? out : pub, f))), want, f)
  const setting = JSON.parse(readFileSync(path.join(out, 'tracy_setting.json'), 'utf8'))
  assert.deepEqual(validateSetting(setting, { assets: [...readdirSync(out), ...readdirSync(pub)] }), [])
  assert.equal(setting.version, '0.5.9')
  assert.equal(setting.install.source.sha256, m.sha256)

  const notes = readFileSync(path.join(out, 'README.md'), 'utf8')
  assert.match(notes, /^## Tracy Base 0\.5\.9 for EmDash 1\.1\.0\n/)
  assert.match(notes, /Security patch release of 0\.5\.6\*\* \(GHSA-fc5q-39xc-vjpf/)
  assert.ok(notes.includes(`| ${zip} | ${m.bytes} | ${m.sha256} |`))
  assert.ok(!notes.includes('quickstart-0.5.6.zip'))
  assert.match(
    notes,
    /docker build -t tracy-base-emdash:0\.5\.9 \. && docker run -d tracy-base-emdash:0\.5\.9\n/
  )
  assert.deepEqual(report.oldVersionInNotes, [], 'only the security paragraph names 0.5.6')
  for (const f of readdirSync(out))
    if (/\.(md|json)$/.test(f)) assert.ok(!readFileSync(path.join(out, f), 'utf8').includes('{{'), f)
  assert.equal(
    JSON.parse(readFileSync(path.join(out, 'VERIFICATION.json'), 'utf8')).artifactHash,
    v.artifactHash
  )
})

test('cut refuses what it cannot cut honestly', () => {
  const a = publishedRelease({ lockVersions: ['4.0.6'] })
  assert.throws(
    () =>
      cut({
        from: a.pub,
        version: '0.5.9',
        out: path.join(a.dir, 'o'),
        themeDir: THEME,
        patchesDir: PATCHES
      }),
    /resolves picomatch@4\.0\.6 and .* has no patch/
  )
  const b = publishedRelease()
  writeFileSync(path.join(b.pub, 'LICENSE'), 'changed\n')
  assert.throws(
    () =>
      cut({
        from: b.pub,
        version: '0.5.9',
        out: path.join(b.dir, 'o'),
        themeDir: THEME,
        patchesDir: PATCHES
      }),
    /LICENSE does not match SHA256SUMS/
  )
  const c = publishedRelease()
  assert.throws(
    () =>
      cut({
        from: c.pub,
        version: '0.5.6',
        out: path.join(c.dir, 'o'),
        themeDir: THEME,
        patchesDir: PATCHES
      }),
    /is the published version/
  )
  mkdirSync(path.join(c.dir, 'o'))
  assert.throws(
    () =>
      cut({
        from: c.pub,
        version: '0.5.9',
        out: path.join(c.dir, 'o'),
        themeDir: THEME,
        patchesDir: PATCHES
      }),
    /must be new/
  )
})

/** SHA256SUMS of `pub` written again over the files it lists, less `drop`. */
function resum(pub, drop = []) {
  const names = parseSums(readFileSync(path.join(pub, 'SHA256SUMS'), 'utf8'))
    .map(([f]) => f)
    .filter((f) => !drop.includes(f))
  writeFileSync(
    path.join(pub, 'SHA256SUMS'),
    `${names.map((f) => `${sha(readFileSync(path.join(pub, f)))}  ${f}`).join('\n')}\n`
  )
}
const editJson = (/** @type {string} */ file, /** @type {(d: any) => void} */ edit) => {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  edit(d)
  writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`)
}
const cutTo = (/** @type {{ pub: string, dir: string }} */ r, themeDir = THEME) =>
  cut({ from: r.pub, version: '0.5.9', out: path.join(r.dir, 'o'), themeDir, patchesDir: PATCHES })

test('cut refuses a file it reads or carries that SHA256SUMS does not list, naming it', () => {
  for (const f of ['VERIFICATION.json', 'README.md', 'tracy_setting.json', 'manifest.json']) {
    const r = publishedRelease()
    // the reviewer's input: the file dropped from the sums, and changed
    if (f === 'VERIFICATION.json')
      editJson(path.join(r.pub, f), (d) => {
        d.gates.contracts = { status: 'fail' }
      })
    resum(r.pub, [f])
    assert.throws(() => cutTo(r), new RegExp(`SHA256SUMS does not list ${f.replace('.', '\\.')}`), f)
  }
})

test('cut refuses a release whose aggregate status is not what its gates add up to, or whose receipt disagrees', () => {
  // the reviewer's input: report.status set to fail, SHA256SUMS updated to match
  const cases = [
    [
      (d) => {
        d.report.status = 'fail'
      },
      /report\.status is fail, its gates add up to pending/
    ],
    [
      (d) => {
        delete d.report
      },
      /report\.status is undefined/
    ],
    [
      (d) => {
        d.report.status = 'pass'
      },
      /report\.status is pass, its gates add up to pending/
    ]
  ]
  for (const [edit, refusal] of cases) {
    const r = publishedRelease()
    editJson(path.join(r.pub, 'VERIFICATION.json'), edit)
    resum(r.pub)
    assert.throws(() => cutTo(r), refusal)
  }
  // every gate passed: the aggregate must say pass
  const p = publishedRelease()
  editJson(path.join(p.pub, 'VERIFICATION.json'), (d) => {
    d.gates.browser = { status: 'pass' }
  })
  editJson(path.join(p.pub, 'manifest.json'), (d) => {
    d.gates.browser = 'pass'
  })
  resum(p.pub)
  assert.throws(() => cutTo(p), /report\.status is pending, its gates add up to pass/)
  // a receipt that restates its gate otherwise
  const q = publishedRelease()
  editJson(path.join(q.pub, 'manifest.json'), (d) => {
    d.receipts = { distribution: { reviewer: 'x', method: 'y', status: 'fail' } }
  })
  resum(q.pub)
  assert.throws(() => cutTo(q), /the receipt of distribution says fail, the gate pass/)
})

test('cut refuses a release whose recorded gates did not pass, or whose two records disagree', () => {
  const a = publishedRelease()
  editJson(path.join(a.pub, 'VERIFICATION.json'), (d) => {
    d.gates.contracts = { status: 'fail' }
  })
  editJson(path.join(a.pub, 'manifest.json'), (d) => {
    d.gates.contracts = 'fail'
  })
  resum(a.pub)
  assert.throws(() => cutTo(a), /gate contracts is fail/)
  const b = publishedRelease()
  editJson(path.join(b.pub, 'VERIFICATION.json'), (d) => {
    d.gates.browser = { status: 'pass' }
  })
  resum(b.pub)
  assert.throws(() => cutTo(b), /disagree on the gates/)
  // pending is what three published releases carry: accepted, and said in the manifest
  const c = publishedRelease()
  cutTo(c)
  const m = JSON.parse(readFileSync(path.join(c.dir, 'o', 'manifest.json'), 'utf8'))
  assert.match(m.patchRelease.gates, /1 pass, 1 pending/)
})

/** A kit zip as the kit pack writes it: `template-kit.json` and the images, every entry dated 2020-01-01. */
function kitZip(file, json, images) {
  const d = temp()
  writeFileSync(path.join(d, 'template-kit.json'), json)
  mkdirSync(path.join(d, 'shots'))
  for (const [p, bytes] of Object.entries(images)) writeFileSync(path.join(d, p), bytes)
  execFileSync(
    'touch',
    [
      '-d',
      '2020-01-01T00:00:00Z',
      ...execFileSync('find', ['.', '-type', 'f'], { cwd: d, encoding: 'utf8' }).split('\n').filter(Boolean)
    ],
    { cwd: d }
  )
  execFileSync('zip', ['-q', '-X', '-r', file, '.'], { cwd: d, env: { ...process.env, TZ: 'UTC' } })
}

test('cut checks the published kit and carries it with the new contract template-kit.json', () => {
  const theme = temp()
  for (const f of ['pnpm-workspace.yaml', 'Dockerfile'])
    writeFileSync(path.join(theme, f), readFileSync(path.join(THEME, f)))
  const png = Buffer.from('not really a png')
  const kitDoc = (v) =>
    `${JSON.stringify({ contract: `tracy-base/emdash-0.x/${v}`, quickstart: { version: v }, images: [{ id: 'home', path: 'shots/home.png', sha256: sha(png) }] }, null, 2)}\n`
  for (const v of ['0.5.6', '0.5.9']) {
    mkdirSync(path.join(theme, 'contracts', v), { recursive: true })
    writeFileSync(path.join(theme, 'contracts', v, 'template-kit.json'), kitDoc(v))
  }
  const kitName = 'template-kit-tracy-base-0.5.6.zip'
  const a = publishedRelease()
  assert.throws(() => cutTo(a, theme), /download template-kit-tracy-base-0\.5\.6\.zip/)
  // the reviewer's input: not a zip
  writeFileSync(path.join(a.pub, kitName), 'invalid zip')
  assert.throws(() => cutTo(a, theme), /template-kit-tracy-base-0\.5\.6\.zip is not a zip/)
  // a kit whose json is not the contract's
  rmSync(path.join(a.pub, kitName))
  kitZip(path.join(a.pub, kitName), kitDoc('0.5.5'), { 'shots/home.png': png })
  assert.throws(() => cutTo(a, theme), /not the contract's, byte for byte/)
  // a kit whose picture is not the bytes it lists
  rmSync(path.join(a.pub, kitName))
  kitZip(path.join(a.pub, kitName), kitDoc('0.5.6'), { 'shots/home.png': 'other bytes' })
  assert.throws(() => cutTo(a, theme), /image shots\/home\.png is missing or not the bytes/)
  // a kit without its json
  rmSync(path.join(a.pub, kitName))
  kitZip(path.join(a.pub, kitName), kitDoc('0.5.6'), { 'shots/home.png': png })
  execFileSync('zip', ['-q', '-d', path.join(a.pub, kitName), 'template-kit.json'])
  assert.throws(() => cutTo(a, theme), /has 0 template-kit\.json entries/)
  // the published kit: carried, its json now the 0.5.9 contract's, its picture untouched
  rmSync(path.join(a.pub, kitName))
  kitZip(path.join(a.pub, kitName), kitDoc('0.5.6'), { 'shots/home.png': png })
  const report = cutTo(a, theme)
  const kit = path.join(a.dir, 'o', 'template-kit-tracy-base-0.5.9.zip')
  assert.equal(execFileSync('unzip', ['-p', kit, 'template-kit.json'], { encoding: 'utf8' }), kitDoc('0.5.9'))
  assert.ok(execFileSync('unzip', ['-p', kit, 'shots/home.png']).equals(png))
  assert.deepEqual(
    execFileSync('unzip', ['-Z1', kit], { encoding: 'utf8' }).split('\n').filter(Boolean).sort(),
    ['shots/', 'shots/home.png', 'template-kit.json']
  )
  assert.match(report.kit.templateKitJson, /rewritten with contracts\/0\.5\.9/)
  // the same json in both contracts: the kit is copied byte for byte
  writeFileSync(path.join(theme, 'contracts/0.5.9/template-kit.json'), kitDoc('0.5.6'))
  const b = publishedRelease()
  kitZip(path.join(b.pub, kitName), kitDoc('0.5.6'), { 'shots/home.png': png })
  const r2 = cutTo(b, theme)
  assert.ok(
    readFileSync(path.join(b.dir, 'o', 'template-kit-tracy-base-0.5.9.zip')).equals(
      readFileSync(path.join(b.pub, kitName))
    )
  )
  assert.match(r2.kit.templateKitJson, /copied as is/)
})

test('notesFor reports a mention of the old version it does not know how to move', () => {
  const manifest = {
    product: 'tracy-base',
    artifact: 'a.zip',
    state: { file: 's.tgz', sha256: 'b'.repeat(64) },
    sha256: 'a'.repeat(64),
    bytes: 1
  }
  const r = notesFor(
    '## Tracy Base 0.5.6 for EmDash 1.1.0\n\nFixed since 0.5.5, the same as 0.5.6 on 10.5.6.\n',
    {
      manifest,
      old: '0.5.6',
      to: '0.5.9',
      zipName: 'n.zip',
      stateName: 'n.tgz',
      z: { sha256: 'c'.repeat(64), bytes: 2 },
      s: { sha256: 'b'.repeat(64) },
      patches: { 'picomatch@4.0.7': 'h' },
      advisory: 'GHSA-fc5q-39xc-vjpf'
    }
  )
  assert.match(
    r.text,
    /^## Tracy Base 0\.5\.9 for EmDash 1\.1\.0\n\n\*\*Security patch release of 0\.5\.6\*\*/
  )
  assert.deepEqual(r.left, ['Fixed since 0.5.5, the same as 0.5.6 on 10.5.6.'])
  assert.throws(
    () =>
      notesFor('## Tracy Base 0.5.5 for EmDash 1.1.0\n', {
        manifest,
        old: '0.5.6',
        to: '0.5.9',
        zipName: 'n',
        stateName: 'n',
        z: { sha256: 'c', bytes: 1 },
        s: { sha256: 'b' },
        patches: {},
        advisory: 'x'
      }),
    /heading/
  )
})

test('the same published release cuts the same bytes, whenever and wherever it is cut', () => {
  const r = publishedRelease()
  const one = path.join(r.dir, 'one')
  cut({ from: r.pub, version: '0.5.9', out: one, themeDir: THEME, patchesDir: PATCHES })
  const two = path.join(r.dir, 'two')
  cut({
    from: r.pub,
    version: '0.5.9',
    out: two,
    themeDir: THEME,
    patchesDir: PATCHES,
    report: path.join(r.dir, 'two.json')
  })
  for (const f of readdirSync(one))
    assert.ok(readFileSync(path.join(one, f)).equals(readFileSync(path.join(two, f))), f)
  const dates = execFileSync('unzip', ['-l', path.join(one, 'tracy-base-emdash-quickstart-0.5.9.zip')], {
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC' }
  })
  // every entry the cut wrote is dated 2020-01-01 (the clock never enters the bytes); the others keep the published time
  for (const f of [
    'package.json',
    'template.config.json',
    'Dockerfile',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'distribution.json',
    'artifact.json',
    'docs/generated/inventory.json',
    'AGENTS.md',
    'patches/',
    'patches/picomatch@2.3.2.patch',
    'patches/picomatch@4.0.7.patch'
  ])
    assert.match(dates, new RegExp(`2020-01-01 00:00 +${f.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\n`), f)
  assert.doesNotMatch(dates, /2020-01-01 00:00 +README\.md\n/)
})
