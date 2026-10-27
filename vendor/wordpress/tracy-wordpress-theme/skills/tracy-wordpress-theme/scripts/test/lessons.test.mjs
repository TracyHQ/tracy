// lessons.mjs scan/show: every detector on a positive and a negative fixture
// (fixtures/lessons/cases.json), the stdout/stderr/exit contract, and inputs that must never read
// as a clean scan — bad flags, unreadable or hostile files, saved source pages that cannot be
// compared, failing archive listings. The scan reads directories only: no test serves it a page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DETECTORS, InputError, blockCalls, loadCatalog, readRegular, report, scan, tree } from '../lib/lessons.mjs'
import { main } from '../lessons.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FX = path.join(HERE, 'fixtures', 'lessons')
const CLI = path.join(HERE, '..', 'lessons.mjs')
const CASES = JSON.parse(fs.readFileSync(path.join(FX, 'cases.json'), 'utf8'))
const CATALOG = loadCatalog()
const SPEC = { traps: path.join(FX, 'spec-traps'), clean: path.join(FX, 'spec-clean') }
const THEME = { traps: path.join(FX, 'theme-traps'), clean: path.join(FX, 'theme-clean') }
const HIGH = { bavail: 1e7, bsize: 4096 }
const LOW = { bavail: 10, bsize: 4096 }

const SCRATCH = fs.mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'lessons-test-'))
test.after(() => fs.rmSync(SCRATCH, { recursive: true, force: true }))
const scratch = (name) => fs.mkdtempSync(path.join(SCRATCH, `${name}-`))
const copyTree = (from, name) => {
  const to = path.join(scratch(name), 'tree')
  fs.cpSync(from, to, { recursive: true })
  return to
}
const writeJson = (file, v) => fs.writeFileSync(file, JSON.stringify(v))

const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const bsdTar = /bsdtar|libarchive/.test(spawnSync('tar', ['--version'], { encoding: 'utf8' }).stdout)
const OWNER = bsdTar ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'] : ['--owner=0', '--group=0', '--numeric-owner']

/** A quickstart pack whose webroot archive carries `mode` ('0600': the stand's modes; 'policy'). */
function makePack(mode, { webrootBytes = null, extraMember = null } = {}) {
  const dir = scratch(`pack-${mode}`)
  const root = path.join(dir, 'webroot')
  const pack = path.join(dir, 'pack')
  fs.mkdirSync(path.join(root, 'wp-content', 'themes', 'x'), { recursive: true })
  fs.mkdirSync(pack)
  const files = ['index.php', 'wp-config.php', 'wp-content/themes/x/style.css']
  for (const f of files) fs.writeFileSync(path.join(root, f), '<?php\n')
  const [fm, dm] = mode === '0600' ? [0o600, 0o700] : [0o644, 0o755]
  for (const d of ['wp-content', 'wp-content/themes', 'wp-content/themes/x']) fs.chmodSync(path.join(root, d), dm)
  for (const f of files) fs.chmodSync(path.join(root, f), fm)
  if (extraMember === 'symlink') fs.symlinkSync('index.php', path.join(root, 'link.php'))
  const tarFile = path.join(pack, 'webroot.tar.gz')
  if (webrootBytes) fs.writeFileSync(tarFile, webrootBytes)
  else {
    const members = ['index.php', 'wp-config.php', 'wp-content', ...(extraMember === 'symlink' ? ['link.php'] : [])]
    const r = spawnSync('tar', [...OWNER, '-czf', tarFile, '-C', root, ...members], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
  }
  fs.writeFileSync(path.join(pack, 'database.sql.gz'), gzipSync('-- fixture\n'))
  writeJson(path.join(pack, 'manifest.json'), {
    schemaVersion: 'tracy-quickstart/v1',
    platform: 'wordpress',
    id: 'fixture',
    version: '1.0.0',
    wpVersion: '6.8',
    theme: { name: 'x' },
    webroot: { file: 'webroot.tar.gz', sha256: sha(tarFile) },
    database: { file: 'database.sql.gz', sha256: sha(path.join(pack, 'database.sql.gz')) }
  })
  fs.writeFileSync(path.join(pack, 'SHA256SUMS'), ['manifest.json', 'webroot.tar.gz', 'database.sql.gz'].map((f) => `${sha(path.join(pack, f))}  ${f}`).join('\n') + '\n')
  return pack
}

/** The state a scan gave one lesson: unresolved | resolved | unknown | skipped | na. */
function stateOf(res, id) {
  for (const k of ['unresolved', 'resolved', 'unknown', 'skipped', 'guidance']) if (res[k].some((r) => r.id === id)) return k
  return 'na'
}
const only = (detector) => CATALOG.filter((r) => r.when === detector)

async function runCase(detector, side) {
  const c = CASES[detector][side]
  const pick = side === 'positive' ? 'traps' : 'clean'
  const opts = { spec: SPEC[pick], theme: THEME[pick], catalog: only(detector), statfs: () => (c.statfs === 'low' ? LOW : HIGH) }
  if (c.pack) opts.pack = makePack(c.pack)
  return scan(opts)
}

/** A saved copy of a source site: `pages` maps a file under it to its HTML. */
function savedSource(pages) {
  const dir = path.join(scratch('source'), 'site')
  for (const [rel, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), html)
  }
  return dir
}

// ---------------------------------------------------------------- detectors, positive and negative

for (const detector of Object.keys(DETECTORS)) {
  test(`detector ${detector}: positive fixture is unresolved, negative fixture is not`, async () => {
    assert.ok(CASES[detector]?.positive && CASES[detector]?.negative, `cases.json has both sides for ${detector}`)
    const ids = only(detector).map((r) => r.id)
    assert.ok(ids.length, `a lesson uses ${detector}`)
    const pos = await runCase(detector, 'positive')
    for (const id of ids) assert.equal(stateOf(pos, id), 'unresolved', `${id} on the positive fixture: ${JSON.stringify(pos.unknown)}`)
    const neg = await runCase(detector, 'negative')
    for (const id of ids) assert.equal(stateOf(neg, id), CASES[detector].negative.expect, `${id} on the negative fixture: ${JSON.stringify(neg.unknown)}`)
  })
}

test('detectors: a spec-pack straight from from-joomla (no trap) reads na or resolved, never unknown', async () => {
  const res = await scan({ spec: SPEC.clean, theme: THEME.clean, catalog: CATALOG, statfs: () => HIGH })
  assert.deepEqual(res.unknown, [])
  assert.deepEqual(res.unresolved, [])
})

test('detector pack-modes: a symlink member is off the policy; a corrupt archive is unknown, not clean', async () => {
  const link = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: makePack('policy', { extraMember: 'symlink' }), catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(link, 'L-089'), 'unresolved')
  assert.match(link.unresolved[0].detail, /symlink/)
  const corrupt = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: makePack('policy', { webrootBytes: Buffer.from('not a tar archive') }), catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(corrupt, 'L-089'), 'unknown')
  assert.equal(report(corrupt).code, 2)
})

test('detector pack-modes: unsafe, duplicate or linked member names from the lister are off the policy, never extracted', async () => {
  const pack = makePack('policy')
  const row = (name, type = 'file', mode = 0o644) => ({ name, type, mode, uid: 0, gid: 0, uname: 'root', gname: 'root', size: 1, linkname: type === 'symlink' ? '/etc/passwd' : '', pax: [] })
  for (const [rows, why] of [
    [[row('index.php'), row('../evil.php')], /not a canonical relative path/],
    [[row('/abs.php')], /an absolute path/],
    [[row('index.php'), row('index.php')], /duplicate member/],
    [[row('link', 'symlink', 0o777)], /unsupported member symlink/]
  ]) {
    const res = await scan({ spec: SPEC.clean, theme: THEME.clean, pack, catalog: only('pack-modes'), statfs: () => HIGH, archiveSpawn: () => ({ status: 0, stdout: JSON.stringify(rows), stderr: '' }) })
    assert.equal(stateOf(res, 'L-089'), 'unresolved', String(why))
    assert.match(res.unresolved[0].detail, why)
  }
})

test('detector pack-modes: a pack whose sums do not hold is unknown and named', async () => {
  const pack = makePack('policy')
  fs.appendFileSync(path.join(pack, 'webroot.tar.gz'), 'x')
  const res = await scan({ spec: SPEC.clean, theme: THEME.clean, pack, catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(res, 'L-089'), 'unknown')
  assert.match(res.unknown[0].detail, /SHA256SUMS mismatch/)
})

test('detector pack-modes: the lister failing, timing out, flooding or answering nonsense is unknown with a bounded diagnostic', async () => {
  const pack = makePack('policy')
  const cases = [
    [() => ({ error: Object.assign(new Error('spawnSync python3 ENOENT'), { code: 'ENOENT' }) }), /could not run/],
    [() => ({ error: Object.assign(new Error('spawnSync python3 ETIMEDOUT'), { code: 'ETIMEDOUT' }) }), /timed out/],
    [() => ({ error: Object.assign(new Error('spawnSync python3 ENOBUFS'), { code: 'ENOBUFS' }) }), /ENOBUFS/],
    [() => ({ status: 3, stdout: '', stderr: `archive broken\n${'x'.repeat(5000)}` }), /archive broken/],
    [() => ({ status: 0, stdout: 'not json', stderr: '' }), /JSON|Unexpected/],
    [() => ({ status: 0, stdout: '{"a":1}', stderr: '' }), /not iterable|no member list/]
  ]
  for (const [spawn, why] of cases) {
    const res = await scan({ spec: SPEC.clean, theme: THEME.clean, pack, catalog: only('pack-modes'), statfs: () => HIGH, archiveSpawn: spawn })
    assert.equal(stateOf(res, 'L-089'), 'unknown', String(why))
    assert.match(res.unknown[0].detail, why)
    assert.ok(res.unknown[0].detail.length <= 300, 'the diagnostic is bounded')
    assert.equal(report(res).code, 2)
  }
})

// ---------------------------------------------------------------- output and exit contract

test('scan: stdout is only `id · sym · fix` lines — unresolved then guidance, sorted, each id once, no banner', async () => {
  const { stdout, stderr, code } = await main(['scan', '--spec', SPEC.traps, '--theme', THEME.traps], { statfs: () => HIGH })
  assert.equal(code, 1)
  const ids = stdout.map((l) => l.split(' · ')[0])
  for (const l of stdout) assert.match(l, /^L-\d{3} · [^·]+ · .+$/)
  assert.equal(new Set(ids).size, ids.length, 'no id twice')
  const byId = new Map(CATALOG.map((r) => [r.id, r]))
  const guidance = ids.filter((id) => byId.get(id).when === 'always')
  const unresolved = ids.filter((id) => byId.get(id).when !== 'always')
  assert.deepEqual(ids, [...unresolved, ...guidance], 'unresolved lines come before guidance')
  assert.deepEqual(unresolved, [...unresolved].sort())
  assert.deepEqual(guidance, [...guidance].sort())
  for (const id of unresolved) assert.equal(stdout.find((l) => l.startsWith(id)), `${id} · ${byId.get(id).sym} · ${byId.get(id).fix}`)
  assert.ok(!ids.some((id) => byId.get(id).status === 'fixed-in-code'), 'fixed-in-code history is never printed')
  assert.match(stderr[0], /^lessons: \d+ unresolved · \d+ guidance/)
  assert.ok(stderr.some((l) => /not checked \(no --pack\): L-089/.test(l)), 'optional inputs left out are named on stderr')
  assert.ok(stderr.includes('  left to live-page tools, not scanned: L-007 (review/contrast-audit), L-012 (visual/visual-qa)'), stderr.join('\n'))
  assert.ok(!ids.includes('L-007') && !ids.includes('L-012'), 'a lesson left to its tool is never a stdout line')
})

test('scan: the order and the lines do not depend on the catalog order or on the run', async () => {
  const a = await main(['scan', '--spec', SPEC.traps, '--theme', THEME.traps], { statfs: () => HIGH })
  const b = await main(['scan', '--spec', SPEC.traps, '--theme', THEME.traps], { statfs: () => HIGH })
  // The file stays ascending (parseCatalog refuses it otherwise); the scan is fed the records reversed.
  const c = report(await scan({ spec: SPEC.traps, theme: THEME.traps, catalog: [...CATALOG].reverse(), statfs: () => HIGH }))
  assert.deepEqual(b, a)
  assert.deepEqual(c.stdout, a.stdout)
  assert.deepEqual(c.stderr, a.stderr)
  assert.ok(a.stdout.some((l) => l.startsWith('L-058 ')) && a.stdout.some((l) => l.startsWith('L-048 ')))
})

test('scan: exit 0 when nothing is unresolved, 1 when a lesson is — through the real process', () => {
  const run = (spec, theme) => spawnSync(process.execPath, [CLI, 'scan', '--spec', spec, '--theme', theme], { encoding: 'utf8' })
  // The host-disk lesson reads this machine; both runs see the same disk, so it moves neither verdict.
  const clean = run(SPEC.clean, THEME.clean)
  const traps = run(SPEC.traps, THEME.traps)
  const disk = /unresolved L-004/.test(clean.stderr)
  assert.equal(clean.status, disk ? 1 : 0, clean.stderr)
  assert.equal(traps.status, 1, traps.stderr)
  assert.ok(traps.stdout.split('\n').filter(Boolean).every((l) => /^L-\d{3} · /.test(l)))
  assert.doesNotMatch(traps.stdout, /lessons:/, 'the summary is on stderr')
})

test('scan: an unknown detector wins over an unresolved one — exit 2, the unresolved lines still printed', async () => {
  const pack = makePack('policy', { webrootBytes: Buffer.from('garbage') })
  const { stdout, stderr, code } = await main(['scan', '--spec', SPEC.traps, '--theme', THEME.traps, '--pack', pack], { statfs: () => HIGH })
  assert.equal(code, 2)
  assert.ok(stdout.some((l) => l.startsWith('L-058 ')))
  assert.ok(stderr.some((l) => /unknown L-089: pack-modes:/.test(l)))
})

test('show: one record, its kind, its code and test pointers, and where to read more', async () => {
  const { stdout, code } = await main(['show', 'L-058'])
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(stdout[0]), CATALOG.find((r) => r.id === 'L-058'))
  assert.ok(stdout.includes('fix: scripts/ingest/from-joomla.mjs — wpSlug'))
  assert.ok(stdout.some((l) => /^read: references\/gotchas\.md §58 — Two categories/.test(l)))
  assert.ok(stdout.includes('read: https://github.com/JoomlArt-Products/tracy-wordpress-theme/issues/10'))
  const split = await main(['show', 'L-046'])
  assert.ok(split.stdout.includes(`also: L-101 · ${CATALOG.find((r) => r.id === 'L-101').sym}`), 'the other defect of gotcha 46')
  assert.ok(!stdout.some((l) => l.startsWith('also:')), 'gotcha 58 holds one defect')
  const tool = await main(['show', 'L-012'])
  assert.ok(tool.stdout.includes('kind: tool'))
  assert.ok(tool.stdout.includes('tool: scripts/visual/visual-qa.mjs — the live-page check; the scan does not run it'))
  const multi = await main(['show', 'L-050'])
  for (const id of ['L-112', 'L-113']) assert.ok(multi.stdout.includes(`also: ${id} · ${CATALOG.find((r) => r.id === id).sym}`), `gotcha 50 also holds ${id}`)
  const guide = await main(['show', 'L-100'])
  assert.ok(guide.stdout.includes('kind: guidance'))
  assert.ok(guide.stdout.includes('read: https://github.com/JoomlArt-Products/tracy-wordpress-theme/pull/36'))
})

test('usage: bad commands, flags, values and URLs exit 2 before anything is read', async () => {
  const bad = [
    [[], /a command is required/],
    [['check'], /unknown command/],
    [['scan'], /--spec is required/],
    [['scan', '--spec', SPEC.clean], /--theme is required/],
    [['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--speck', 'x'], /unknown argument/],
    [['scan', '--spec', SPEC.clean, '--spec', SPEC.clean, '--theme', THEME.clean], /--spec given twice/],
    [['scan', '--spec', '--theme', THEME.clean], /--spec needs a value/],
    [['scan', '--spec', SPEC.clean, '--theme'], /--theme needs a value/],
    [['scan', '--spec', SPEC.clean, '--theme', THEME.clean, 'extra'], /unknown argument/],
    // The scan loads no page: a live site is no input it takes, and --source is a directory.
    [['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--site', 'http://127.0.0.1/'], /unknown argument "--site"/],
    [['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', 'https://example.com/'], /--source https:\/\/example\.com\/: does not exist/],
    [['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', path.join(SPEC.clean, 'page-map.json')], /--source .*: is not a regular file, not a directory|is .* not a directory/],
    [['show'], /exactly one lesson id/],
    [['show', 'L-001', 'L-002'], /exactly one lesson id/],
    [['show', 'L-1'], /not a lesson id/],
    [['show', 'L-999'], /no lesson L-999/]
  ]
  for (const [argv, why] of bad) {
    const r = await main(argv)
    assert.equal(r.code, 2, argv.join(' '))
    assert.deepEqual(r.stdout, [])
    assert.match(r.stderr[0], why, argv.join(' '))
  }
})

// ---------------------------------------------------------------- inputs that cannot be read

test('inputs: a missing, file, symlinked or foreign directory is exit 2 naming the flag', async () => {
  const dir = scratch('roots')
  fs.writeFileSync(path.join(dir, 'file'), 'x')
  fs.symlinkSync(SPEC.clean, path.join(dir, 'link'))
  fs.mkdirSync(path.join(dir, 'empty'))
  const cases = [
    [['--spec', path.join(dir, 'nope'), '--theme', THEME.clean], /--spec .*does not exist/],
    [['--spec', path.join(dir, 'file'), '--theme', THEME.clean], /--spec .*not a directory/],
    [['--spec', path.join(dir, 'link'), '--theme', THEME.clean], /--spec .*a symlink/],
    [['--spec', path.join(dir, 'empty'), '--theme', THEME.clean], /page-map\.json is missing/],
    [['--spec', SPEC.clean, '--theme', path.join(dir, 'empty')], /style\.css is missing/],
    [['--spec', SPEC.clean, '--theme', THEME.clean, '--pack', path.join(dir, 'nope')], /--pack .*does not exist/]
  ]
  for (const [argv, why] of cases) {
    const r = await main(['scan', ...argv])
    assert.equal(r.code, 2, argv.join(' '))
    assert.match(r.stderr[0], why)
  }
})

test('inputs: an empty, truncated or malformed spec file is unknown, never an empty clean scan', async () => {
  for (const [name, body, why] of [
    ['empty', '', /content\.json is empty/],
    ['truncated', '{"categories": [', /content\.json is not JSON/],
    ['shape', '{"pages": [], "posts": [], "categories": {"a": 1}}', /content\.json has no categories list/],
    ['object', '{}', /content\.json has no pages list/],
    ['holes', '{"pages": [null], "posts": [], "categories": []}', /content\.json has a pages entry that is not an object/],
    ['list', '[]', /content\.json is not a JSON object/],
    ['null', 'null', /content\.json is not a JSON object/]
  ]) {
    const spec = copyTree(SPEC.clean, name)
    fs.writeFileSync(path.join(spec, 'content.json'), body)
    const r = await main(['scan', '--spec', spec, '--theme', THEME.clean], { statfs: () => HIGH })
    assert.equal(r.code, 2, name)
    assert.ok(r.stderr.some((l) => why.test(l)), `${name}: ${r.stderr.join('\n')}`)
  }
  // The files every scan needs, and the other spec files, in a shape no detector can call clean.
  for (const [name, flag, file, body, why] of [
    ['pagemap-cut', 'spec', 'page-map.json', '{', /page-map\.json is not JSON/],
    ['pagemap-empty', 'spec', 'page-map.json', '{}', /page-map\.json has no pages list/],
    ['pagemap-none', 'spec', 'page-map.json', '{"pages": []}', /page-map\.json has no pages$/],
    ['pagemap-path', 'spec', 'page-map.json', '{"pages": [{"file": "a.html"}]}', /page-map\.json has a page whose path does not start with \//],
    ['sections', 'spec', 'sections.json', '{}', /sections\.json has no custom list/],
    ['model', 'spec', 'site-model.json', '{"records": {}}', /site-model\.json has no records list/],
    ['style-empty', 'theme', 'style.css', '', /style\.css has no Theme Name header/],
    ['style-other', 'theme', 'style.css', 'body { color: red }\n', /style\.css has no Theme Name header/],
    ['theme-json', 'theme', 'theme.json', '[]', /theme\.json is not a JSON object/],
    // The JSON literal null is a file that is there, never an absent one.
    ['sections-null', 'spec', 'sections.json', 'null', /sections\.json is not a JSON object/],
    ['model-null', 'spec', 'site-model.json', 'null', /site-model\.json is not a JSON object/],
    ['theme-json-null', 'theme', 'theme.json', 'null', /theme\.json is not a JSON object/],
    ['theme-json-gone', 'theme', 'theme.json', undefined, /theme\.json is missing/]
  ]) {
    const dirs = { spec: SPEC.clean, theme: THEME.clean }
    dirs[flag] = copyTree(dirs[flag], name)
    if (body === undefined) fs.rmSync(path.join(dirs[flag], file))
    else fs.writeFileSync(path.join(dirs[flag], file), body)
    const r = await main(['scan', '--spec', dirs.spec, '--theme', dirs.theme], { statfs: () => HIGH })
    assert.equal(r.code, 2, name)
    assert.ok(r.stderr.some((l) => why.test(l)), `${name}: ${r.stderr.join('\n')}`)
  }
  // theme.json is read even when every detector that needs it is skipped (no content.json).
  const skeleton = copyTree(SPEC.clean, 'skeleton-bad-theme')
  fs.rmSync(path.join(skeleton, 'content.json'))
  for (const [name, body, why] of [['gone', undefined, /theme\.json is missing/], ['null', 'null', /theme\.json is not a JSON object/]]) {
    const theme = copyTree(THEME.clean, `skeleton-theme-${name}`)
    if (body === undefined) fs.rmSync(path.join(theme, 'theme.json'))
    else fs.writeFileSync(path.join(theme, 'theme.json'), body)
    const r = await main(['scan', '--spec', skeleton, '--theme', theme], { statfs: () => HIGH })
    assert.equal(r.code, 2, name)
    assert.ok(r.stderr.some((l) => why.test(l)), `${name}: ${r.stderr.join('\n')}`)
  }
})

test('inputs: a symlink, FIFO or socket inside the theme is refused before it is opened', async () => {
  const withLink = copyTree(THEME.clean, 'tlink')
  fs.symlinkSync('/etc/hosts', path.join(withLink, 'inc', 'hosts.php'))
  const withFifo = copyTree(THEME.clean, 'tfifo')
  assert.equal(spawnSync('mkfifo', [path.join(withFifo, 'inc', 'pipe.php')]).status, 0)
  const linkedFile = copyTree(SPEC.clean, 'slink')
  fs.rmSync(path.join(linkedFile, 'content.json'))
  fs.symlinkSync(path.join(SPEC.traps, 'content.json'), path.join(linkedFile, 'content.json'))
  const t0 = Date.now()
  for (const [argv, why] of [
    [['--spec', SPEC.clean, '--theme', withLink], /hosts\.php is a symlink/],
    [['--spec', SPEC.clean, '--theme', withFifo], /pipe\.php is a FIFO/],
    [['--spec', linkedFile, '--theme', THEME.clean], /content\.json is a symlink/]
  ]) {
    const r = await main(['scan', ...argv], { statfs: () => HIGH })
    assert.equal(r.code, 2, argv.join(' '))
    assert.ok(r.stderr.some((l) => why.test(l)), r.stderr.join('\n'))
  }
  assert.ok(Date.now() - t0 < 20000, 'a FIFO never blocks the scan')
})

test('inputs: oversized files, too many entries and deep nesting are unknown at the documented limits', async () => {
  const big = copyTree(SPEC.clean, 'big')
  fs.truncateSync(path.join(big, 'content.json'), 2048)
  const deep = copyTree(THEME.clean, 'deep')
  let d = path.join(deep, 'inc')
  for (let i = 0; i < 6; i++) fs.mkdirSync((d = path.join(d, `d${i}`)))
  const wide = copyTree(THEME.clean, 'wide')
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(wide, 'inc', `f${i}.txt`), '')
  // A spec JSON file is read before any detector runs: past the limit, the scan stops (exit 2).
  await assert.rejects(scan({ spec: big, theme: THEME.clean, catalog: CATALOG, statfs: () => HIGH, limits: { fileBytes: 1024 } }), /content\.json is 2048 bytes \(limit 1024\)/)
  const limits = { walkDepth: 4, walkEntries: 30 }
  for (const [spec, theme, why] of [
    [SPEC.clean, deep, /nested deeper than 4 levels/],
    [SPEC.clean, wide, /more than 30 entries/]
  ]) {
    const res = await scan({ spec, theme, catalog: CATALOG, statfs: () => HIGH, limits })
    assert.equal(report(res).code, 2)
    assert.ok(res.unknown.some((r) => why.test(r.detail)), `${why}: ${JSON.stringify(res.unknown)}`)
  }
})

test('inputs: a file replaced or grown while it is read is refused', () => {
  const dir = scratch('mutate')
  const f = path.join(dir, 'content.json')
  fs.writeFileSync(f, '{"a":1}')
  assert.throws(
    () =>
      readRegular(f, 1024, {
        afterLstat: () => {
          fs.rmSync(f)
          fs.writeFileSync(f, '{"b":2}')
        }
      }),
    /replaced while it was read/
  )
  fs.writeFileSync(f, '{"a":1}')
  assert.throws(() => readRegular(f, 1024, { afterRead: () => fs.appendFileSync(f, ' ') }), /changed while it was read/)
  assert.throws(() => readRegular(dir, 1024), InputError)
  assert.throws(() => readRegular(f, 1024, { afterLstat: () => fs.rmSync(f) }), /ENOENT/)
})

test('inputs: a path that would leave the declared root is refused; a missing optional file is absent, not empty', () => {
  const t = tree(SPEC.clean, '--spec')
  for (const rel of ['../spec-traps/content.json', '/etc/hosts', 'a/../content.json', 'a//b', './content.json']) assert.throws(() => t.file(rel), /is not a path inside it/, rel)
  assert.equal(t.file('no-such.json'), null)
  assert.equal(t.json('no-such.json'), null)
  assert.equal(t.file('page-map.json/x'), null)
})

test('inputs: hostile HTML is parsed, never run; control characters never reach the terminal; paths are argv', async () => {
  const spec = copyTree(SPEC.traps, 'hostile $(touch pwned); x')
  const sections = JSON.parse(fs.readFileSync(path.join(spec, 'sections.json'), 'utf8'))
  sections.custom[0].html = `<script>globalThis.__lessonsPwned = 1</script><img src=x onerror="globalThis.__lessonsPwned = 2">${sections.custom[0].html}`
  writeJson(path.join(spec, 'sections.json'), sections)
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  content.categories[0].wpSlug = content.categories[1].wpSlug = 'sec\u001b[31mred\u0007'
  writeJson(path.join(spec, 'content.json'), content)
  const r = await main(['scan', '--spec', spec, '--theme', THEME.traps], { statfs: () => HIGH })
  assert.equal(globalThis.__lessonsPwned, undefined)
  assert.equal(r.code, 1)
  const all = [...r.stdout, ...r.stderr].join('\n')
  assert.doesNotMatch(all, /[\u0000-\u0009\u000b-\u001f\u007f]/, 'no control character printed')
  assert.ok(all.includes('sec\\u001b[31mred\\u0007'), 'the slug is shown escaped')
  assert.equal(fs.existsSync(path.join(process.cwd(), 'pwned')), false)
  const pack = makePack('0600')
  const odd = path.join(scratch('pack dir; $(id)'), 'p')
  fs.cpSync(pack, odd, { recursive: true })
  const res = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: odd, catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(res, 'L-089'), 'unresolved')
})

// ---------------------------------------------------------------- optional inputs

test('inputs: an optional input not given is out of scope; one given that cannot be read is exit 2', async () => {
  const none = await main(['scan', '--spec', SPEC.clean, '--theme', THEME.clean], { statfs: () => HIGH })
  assert.equal(none.code, 0)
  assert.ok(none.stderr.some((l) => /not checked \(no --pack\): L-089/.test(l)))
  // spec-clean has no page from a Joomla article: no detector reads --source, and it is still checked.
  const empty = scratch('empty-source')
  const r = await main(['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', empty], { statfs: () => HIGH })
  assert.equal(r.code, 2)
  assert.match(r.stderr[0], /--source .*: holds no saved \.html page/)
  const linked = path.join(scratch('linked-source'), 'link')
  fs.symlinkSync(savedSource({ 'index.html': '<html></html>' }), linked)
  const l = await main(['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', linked], { statfs: () => HIGH })
  assert.equal(l.code, 2)
  assert.match(l.stderr[0], /--source .*: is a symlink, not a directory/)
  const inner = savedSource({ 'index.html': '<html></html>' })
  fs.symlinkSync('/etc', path.join(inner, 'etc'))
  const i = await main(['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', inner], { statfs: () => HIGH })
  assert.equal(i.code, 2)
  assert.match(i.stderr[0], /--source: etc is a symlink; the scan reads regular files and directories only/)
  const ok = await main(['scan', '--spec', SPEC.clean, '--theme', THEME.clean, '--source', savedSource({ 'index.html': '<html><body>Home</body></html>' })], { statfs: () => HIGH })
  assert.equal(ok.code, 0, ok.stderr.join('\n'))
})

test('detectors spec-list-class, spec-li-img: each source list is compared with the block of its own words', async () => {
  const spec = copyTree(SPEC.clean, 'lists')
  const sections = JSON.parse(fs.readFileSync(path.join(spec, 'sections.json'), 'utf8'))
  // Two lists: the first keeps list-special and gains an icon, the second loses both. Pooled, the
  // class and the image count would still match.
  sections.custom = [
    {
      id: '150',
      html: '<ul class="list-special"><li>One</li></ul><ul class="list-special"><li><img src="/i.png">Two</li></ul>',
      blocks:
        '<!-- wp:list {"className":"list-special"} --><ul class="wp-block-list list-special"><li><img src="/wp-content/uploads/i.png" alt="">One</li></ul><!-- /wp:list -->' +
        '<!-- wp:list --><ul class="wp-block-list"><li>Two</li></ul><!-- /wp:list -->',
      images: []
    }
  ]
  writeJson(path.join(spec, 'sections.json'), sections)
  const res = await scan({ spec, theme: THEME.clean, catalog: [...only('spec-list-class'), ...only('spec-li-img')], statfs: () => HIGH })
  assert.equal(stateOf(res, 'L-048'), 'unresolved')
  assert.match(res.unresolved.find((r) => r.id === 'L-048').detail, /module 150 list 2: list-special/)
  assert.equal(stateOf(res, 'L-055'), 'unresolved')
  assert.match(res.unresolved.find((r) => r.id === 'L-055').detail, /module 150 list 2: 1 → 0/)
  // A source list whose words no block list has is lost, not skipped.
  sections.custom[0].blocks = '<!-- wp:paragraph --><p>One Two</p><!-- /wp:paragraph -->'
  writeJson(path.join(spec, 'sections.json'), sections)
  const gone = await scan({ spec, theme: THEME.clean, catalog: only('spec-list-class'), statfs: () => HIGH })
  assert.match(gone.unresolved[0].detail, /no block list of these words/)
})

test('detectors spec-list-class, spec-li-img: a page from a Joomla article is compared through the saved --source page, and named when it is not given', async () => {
  const spec = copyTree(SPEC.clean, 'article-page')
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  content.pages.push({
    slug: 'database-security',
    path: '/services/database-security',
    joomlaPath: '/services/database-security',
    joomla: { articleId: 13 },
    content: '<!-- wp:list --><ul class="wp-block-list"><li>Audits</li></ul><!-- /wp:list -->',
    images: []
  })
  writeJson(path.join(spec, 'content.json'), content)
  const page = content.pages.at(-1)
  const catalog = [...only('spec-list-class'), ...only('spec-li-img')]
  const run = (source) => scan({ spec, theme: THEME.clean, source, catalog, statfs: () => HIGH })
  // Without --source the module and the post still pair cleanly, but a clean part is no clean
  // whole: the lessons are not checked, and say why.
  const without = await run(null)
  for (const id of ['L-048', 'L-055']) assert.equal(stateOf(without, id), 'skipped', id)
  assert.match(without.skipped[0].detail, /no --source: 1 page\(s\) from Joomla articles/)
  assert.equal(report(without).code, 0)
  const article = '<html><body><nav><ul class="menu"><li>Home</li></ul></nav><div itemprop="articleBody"><ul class="my-4 list-special"><li><img src="/t.png">Audits</li></ul></div></body></html>'
  // Either name wget writes for the path is read: <path>.html and <path>/index.html.
  for (const rel of ['services/database-security.html', 'services/database-security/index.html']) {
    const res = await run(savedSource({ 'index.html': '<html></html>', [rel]: article }))
    assert.equal(stateOf(res, 'L-048'), 'unresolved', rel)
    assert.match(res.unresolved.find((r) => r.id === 'L-048').detail, /page \/services\/database-security list 1: my-4/)
    assert.equal(stateOf(res, 'L-055'), 'unresolved', rel)
    assert.ok(!res.unresolved.some((r) => /menu/.test(r.detail)), 'only the article body is compared, not the navigation')
  }
  const kept = article.replace('<ul class="my-4 list-special"><li><img src="/t.png">Audits</li></ul>', '<ul><li>Audits</li></ul>')
  const clean = await run(savedSource({ 'services/database-security.html': kept }))
  assert.deepEqual([stateOf(clean, 'L-048'), stateOf(clean, 'L-055')], ['resolved', 'resolved'])
  // A page not saved, saved under both names, or saved without an article body cannot be compared:
  // unknown, never resolved on the pairs that did work.
  const cannot = [
    [{ 'index.html': '<html></html>' }, /no services\/database-security\.html or services\/database-security\/index\.html saved/],
    [{ 'services/database-security.html': article, 'services/database-security/index.html': article }, /both .* are saved/],
    [{ 'services/database-security.html': '<html><body><main><ul class="list-special"><li>Audits</li></ul></main></body></html>' }, /services\/database-security\.html has no article body/]
  ]
  for (const [pages, why] of cannot) {
    const r = await run(savedSource(pages))
    for (const id of ['L-048', 'L-055']) assert.equal(stateOf(r, id), 'unknown', `${id} ${why}`)
    assert.match(r.unknown[0].detail, why)
  }
  // A page whose article the source never prints carries droppedContent (from-joomla, skip_component_content):
  // its saved page has no article body to compare, and that is no refusal (ja-restaurant S-36).
  page.droppedContent = page.content
  writeJson(path.join(spec, 'content.json'), content)
  const dropped = await run(savedSource({ 'services/database-security.html': '<html><body><main><p>Masthead only</p></main></body></html>' }))
  assert.deepEqual([stateOf(dropped, 'L-048'), stateOf(dropped, 'L-055')], ['resolved', 'resolved'])
  delete page.droppedContent
  // Every bodiless page is named in the one refusal, not the first alone.
  content.pages.push({ ...page, slug: 'offers', path: '/offers', joomlaPath: '/offers', joomla: { articleId: 14 } })
  writeJson(path.join(spec, 'content.json'), content)
  const bodiless = '<html><body><main><p>Modules only</p></main></body></html>'
  const both = await run(savedSource({ 'services/database-security.html': bodiless, 'offers.html': bodiless }))
  assert.match(both.unknown[0].detail, /services\/database-security\.html, offers\.html have no article body/)
  content.pages.pop()
  writeJson(path.join(spec, 'content.json'), content)
  // A joomlaPath no saved file can have is never turned into one: it cannot leave --source.
  const source = savedSource({ 'services/database-security.html': article, 'x.html': article })
  for (const at of ['//127.0.0.1:1/x', '/\\127.0.0.1/x', 'services/relative', 'https://example.com/x', '/a/../x', '/./x', '/x?view=article', '/x#top', 42]) {
    page.joomlaPath = at
    writeJson(path.join(spec, 'content.json'), content)
    const r = await run(source)
    assert.equal(stateOf(r, 'L-048'), 'unknown', String(at))
    assert.match(r.unknown[0].detail, /is no site path a saved page can have/, String(at))
  }
})

test('detectors spec-list-class, spec-li-img: source HTML with a list and nothing to compare it with is unknown', async () => {
  const catalog = [...only('spec-list-class'), ...only('spec-li-img')]
  const noBlocks = copyTree(SPEC.clean, 'no-blocks')
  const sections = JSON.parse(fs.readFileSync(path.join(noBlocks, 'sections.json'), 'utf8'))
  sections.custom.push({ id: '151', html: '<ul class="list-special"><li>Lost</li></ul>', images: [] })
  writeJson(path.join(noBlocks, 'sections.json'), sections)
  const a = await scan({ spec: noBlocks, theme: THEME.clean, catalog, statfs: () => HIGH })
  for (const id of ['L-048', 'L-055']) assert.equal(stateOf(a, id), 'unknown', id)
  assert.match(a.unknown[0].detail, /module 151 has html with a list and no blocks/)
  // A module without a list and without blocks has nothing to compare: not a reason to stop.
  sections.custom.at(-1).html = '<p>Only words</p>'
  writeJson(path.join(noBlocks, 'sections.json'), sections)
  assert.equal(stateOf(await scan({ spec: noBlocks, theme: THEME.clean, catalog: only('spec-list-class'), statfs: () => HIGH }), 'L-048'), 'resolved')
  const noTarget = copyTree(SPEC.clean, 'no-target')
  const model = JSON.parse(fs.readFileSync(path.join(noTarget, 'site-model.json'), 'utf8'))
  model.records.push({ type: 'posts', slug: 'no-such-post', values: { title: 'No such post', body: '<ul class="list-special"><li>X</li></ul>' } })
  writeJson(path.join(noTarget, 'site-model.json'), model)
  const b = await scan({ spec: noTarget, theme: THEME.clean, catalog, statfs: () => HIGH })
  assert.equal(stateOf(b, 'L-048'), 'unknown')
  assert.match(b.unknown[0].detail, /post no-such-post has no content\.json post of that slug or title/)
})

test('detectors: a spec-pack without the files a detector reads is not checked — named on stderr, never "no trap"', async () => {
  const spec = scratch('skeleton')
  fs.copyFileSync(path.join(SPEC.clean, 'page-map.json'), path.join(spec, 'page-map.json'))
  const res = await scan({ spec, theme: THEME.clean, catalog: CATALOG, statfs: () => HIGH })
  const specOnly = Object.entries(DETECTORS).filter(([, d]) => d.files).map(([id]) => id)
  assert.deepEqual(specOnly, ['spec-cat-slug', 'spec-list-class', 'spec-li-img', 'spec-img-pct', 'spec-post-template', 'spec-template-file', 'spec-orphan-modules'])
  for (const id of specOnly) for (const r of only(id)) assert.equal(stateOf(res, r.id), 'skipped', `${r.id} (${id})`)
  const { stderr, code } = report(res)
  assert.equal(code, 0)
  assert.ok(stderr.some((l) => /not checked \(no content\.json in --spec\): L-058, L-088, L-104/.test(l)), stderr.join('\n'))
  assert.ok(stderr.some((l) => /not checked \(no content\.json, sections\.json in --spec\): L-010, L-048, L-055, L-095/.test(l)), stderr.join('\n'))
  // One file of the two there is not enough: the one missing is named, the rest is not read as clean.
  const half = copyTree(SPEC.traps, 'half')
  fs.rmSync(path.join(half, 'sections.json'))
  const h = await scan({ spec: half, theme: THEME.clean, catalog: [...only('spec-img-pct'), ...only('spec-list-class')], statfs: () => HIGH })
  for (const id of ['L-095', 'L-048']) assert.match(h.skipped.find((r) => r.id === id)?.detail ?? '', /^no sections\.json in --spec$/, id)
  // No site-model.json (a from-html spec-pack): module lists are compared, page and post bodies are named as not.
  const noModel = copyTree(SPEC.clean, 'no-model')
  fs.rmSync(path.join(noModel, 'site-model.json'))
  const m = await scan({ spec: noModel, theme: THEME.clean, catalog: only('spec-list-class'), statfs: () => HIGH })
  assert.equal(stateOf(m, 'L-048'), 'skipped')
  assert.match(m.skipped[0].detail, /no site-model\.json in --spec: page and post bodies not compared/)
})

test('detector spec-template-file: a page-map view is no template file; a declared template is', async () => {
  const spec = copyTree(SPEC.clean, 'views')
  const pm = JSON.parse(fs.readFileSync(path.join(spec, 'page-map.json'), 'utf8'))
  pm.pages.push({ file: 'login.html', view: 'page-login', path: '/login' })
  writeJson(path.join(spec, 'page-map.json'), pm)
  const served = await scan({ spec, theme: THEME.clean, catalog: only('spec-template-file'), statfs: () => HIGH })
  assert.equal(stateOf(served, 'L-104'), 'resolved', 'page-login is served by page.html — nothing to report')
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  content.pages[1].meta._wp_page_template = 'page-login'
  writeJson(path.join(spec, 'content.json'), content)
  const declared = await scan({ spec, theme: THEME.clean, catalog: only('spec-template-file'), statfs: () => HIGH })
  assert.equal(stateOf(declared, 'L-104'), 'unresolved')
  assert.match(declared.unresolved[0].detail, /templates\/page-login\.html \(pages about\)/)
})

test('detectors spec-template-file, spec-post-template: "default" selects the template hierarchy, no file', async () => {
  const spec = copyTree(SPEC.clean, 'default-template')
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  for (const p of content.pages) p.meta = { ...(p.meta ?? {}), _wp_page_template: 'default' }
  content.posts = (content.posts ?? []).map((p) => ({ ...p, meta: { ...(p.meta ?? {}), _wp_page_template: 'default' } }))
  assert.ok(content.posts.length, 'the fixture has a post')
  writeJson(path.join(spec, 'content.json'), content)
  const res = await scan({ spec, theme: THEME.clean, catalog: [...only('spec-template-file'), ...only('spec-post-template')], statfs: () => HIGH })
  assert.deepEqual(res.unresolved, [])
  assert.deepEqual(res.unknown, [])
  assert.equal(stateOf(res, 'L-104'), 'resolved', 'the theme\'s own customTemplates still have their files')
  for (const r of only('spec-post-template')) assert.equal(stateOf(res, r.id), 'na', r.id)
})

test('detector theme-block-path: only a guard on that block\'s own path counts', async () => {
  const withGuard = (php) => {
    const t = copyTree(THEME.traps, 'guard')
    fs.writeFileSync(path.join(t, 'inc', 'extra.php'), php)
    return t
  }
  const run = async (php) => stateOf(await scan({ spec: SPEC.clean, theme: withGuard(php), catalog: only('theme-block-path'), statfs: () => HIGH }), 'L-006')
  const call = "register_block_type( get_theme_file_path( 'blocks/mega-menu' ) );"
  assert.equal(await run(`<?php\nif ( file_exists( get_theme_file_path( 'blocks/hero/block.json' ) ) ) { register_block_type( get_theme_file_path( 'blocks/hero' ) ); }\n${call}\n`), 'unresolved', 'a guard on another block')
  assert.equal(await run(`<?php\n$f = get_theme_file_path( 'assets/x.json' );\nif ( is_readable( $f ) ) {}\n${call}\n`), 'unresolved', 'a guard on another file')
  assert.equal(await run(`<?php\nif ( is_readable( get_theme_file_path( 'blocks/mega-menu/block.json' ) ) ) {\n  ${call}\n}\n`), 'resolved')
  // A check on the right path that does not guard the call: after it, in the other branch,
  // negated, or- ed with something else, in a comment or a string.
  const own = "file_exists( get_theme_file_path( 'blocks/mega-menu/block.json' ) )"
  for (const [php, why] of [
    [`<?php\n${call}\nif ( ${own} ) { echo 1; }\n`, 'after the call'],
    [`<?php\nif ( ${own} ) { echo 1; } else { ${call} }\n`, 'in the else branch'],
    [`<?php\nif ( ! ${own} ) { ${call} }\n`, 'negated'],
    [`<?php\nif ( ${own} || $force ) { ${call} }\n`, 'or-ed'],
    [`<?php\n// if ( ${own} ) {\n${call}\n`, 'in a comment'],
    [`<?php\n$s = 'if ( file_exists( "blocks/mega-menu" ) ) {';\n${call}\n`, 'in a string']
  ])
    assert.equal(await run(php), 'unresolved', why)
  // Guards that do hold: brace-less, one term of an &&, an outer if around an inner one.
  for (const php of [`<?php\nif ( ${own} ) ${call}\n`, `<?php\nif ( $on && ${own} ) {\n${call}\n}\n`, `<?php\nif ( ${own} ) { if ( $on ) { ${call} } }\n`])
    assert.equal(await run(php), 'resolved', php)
  assert.deepEqual(blockCalls(`<?php\n${call}\n`), [{ name: 'mega-menu', json: 'blocks/mega-menu/block.json', guarded: false }])
  // PHP the scan cannot read to its end is unknown, not a pass.
  const t = withGuard(`<?php\n$s = 'unterminated;\n${call}\n`)
  const res = await scan({ spec: SPEC.clean, theme: t, catalog: only('theme-block-path'), statfs: () => HIGH })
  assert.equal(stateOf(res, 'L-006'), 'unknown')
  assert.match(res.unknown[0].detail, /inc\/extra\.php: an unterminated string/)
})

test('inputs: a directory swapped during a read — for a link, or for another directory — is refused', () => {
  const root = copyTree(SPEC.clean, 'race')
  const outside = scratch('outside')
  fs.mkdirSync(path.join(root, 'reference'))
  fs.writeFileSync(path.join(root, 'reference', 'a.html'), 'inside')
  fs.writeFileSync(path.join(outside, 'a.html'), 'outside')
  const swap = () => {
    fs.renameSync(path.join(root, 'reference'), path.join(root, 'reference.real'))
    fs.symlinkSync(outside, path.join(root, 'reference'))
  }
  const back = () => {
    fs.rmSync(path.join(root, 'reference'))
    fs.renameSync(path.join(root, 'reference.real'), path.join(root, 'reference'))
  }
  // Swapped for a link after the walk: the open follows it to another inode — refused, even when
  // the link is gone again before anything else looks.
  assert.throws(() => tree(root, '--spec', undefined, { afterWalk: swap }).file('reference/a.html'), /replaced while it was read/)
  back()
  // Swapped for another directory after the open: the second walk no longer reaches the open file.
  const other = path.join(root, 'other')
  fs.mkdirSync(other)
  fs.writeFileSync(path.join(other, 'a.html'), 'other')
  assert.throws(
    () =>
      tree(root, '--spec', undefined, {
        afterOpen: () => {
          fs.renameSync(path.join(root, 'reference'), path.join(root, 'reference.real'))
          fs.renameSync(other, path.join(root, 'reference'))
        }
      }).file('reference/a.html'),
    /moved while it was read/
  )
  fs.renameSync(path.join(root, 'reference'), other)
  fs.renameSync(path.join(root, 'reference.real'), path.join(root, 'reference'))
  assert.equal(tree(root, '--spec').file('reference/a.html'), 'inside')
})

test('inputs: a directory swapped for a link while the tree is listed is never read, and the working directory comes back', () => {
  const root = copyTree(SPEC.clean, 'list-race')
  const outside = scratch('list-outside')
  fs.mkdirSync(path.join(root, 'reference'))
  fs.writeFileSync(path.join(root, 'reference', 'a.html'), 'inside')
  fs.writeFileSync(path.join(outside, 'secret.html'), 'outside')
  const home = process.cwd()
  let swapped = false
  const hooks = {
    beforeEnter: (rel) => {
      if (rel !== 'reference' || swapped) return
      swapped = true
      fs.renameSync(path.join(root, 'reference'), path.join(root, 'reference.real'))
      fs.symlinkSync(outside, path.join(root, 'reference'))
    }
  }
  assert.throws(() => tree(root, '--spec', undefined, hooks).list(), /reference was replaced while it was listed/)
  assert.equal(process.cwd(), home)
  fs.rmSync(path.join(root, 'reference'))
  fs.renameSync(path.join(root, 'reference.real'), path.join(root, 'reference'))
  const listed = tree(root, '--spec').list()
  assert.ok(listed.includes('reference/a.html') && !listed.some((f) => /secret/.test(f)), listed.join(' '))
  assert.equal(process.cwd(), home)
})

test('detector pack-modes: the pack is read without links and hashed within its limit', async () => {
  const linked = makePack('policy')
  const real = path.join(path.dirname(linked), 'SHA256SUMS.real')
  fs.renameSync(path.join(linked, 'SHA256SUMS'), real)
  fs.symlinkSync(real, path.join(linked, 'SHA256SUMS'))
  const a = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: linked, catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(a, 'L-089'), 'unknown')
  assert.match(a.unknown[0].detail, /SHA256SUMS is a symlink/)
  const archive = makePack('policy')
  const tarFile = path.join(archive, 'webroot.tar.gz')
  const elsewhere = path.join(path.dirname(archive), 'w.tar.gz')
  fs.renameSync(tarFile, elsewhere)
  fs.symlinkSync(elsewhere, tarFile)
  const b = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: archive, catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(b, 'L-089'), 'unknown')
  assert.match(b.unknown[0].detail, /webroot\.tar\.gz is a symlink/)
  const big = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: makePack('policy'), catalog: only('pack-modes'), statfs: () => HIGH, limits: { packBytes: 16 } })
  assert.equal(stateOf(big, 'L-089'), 'unknown')
  assert.match(big.unknown[0].detail, /bytes \(limit 16\)/)
  // The limit is for the pack's archives in all, not per file.
  const both = makePack('policy')
  const webroot = fs.statSync(path.join(both, 'webroot.tar.gz')).size
  const total = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: both, catalog: only('pack-modes'), statfs: () => HIGH, limits: { packBytes: webroot + 1 } })
  assert.equal(stateOf(total, 'L-089'), 'unknown')
  assert.match(total.unknown[0].detail, /database\.sql\.gz is \d+ bytes \(limit 1 left of \d+ for the pack\)/)
  const late = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: makePack('policy'), catalog: only('pack-modes'), statfs: () => HIGH, limits: { packTimeoutMs: -1 } })
  assert.match(late.unknown[0].detail, /not hashed within the pack's time limit/)
  // SHA256SUMS naming more than the manifest and its two archives is refused before any hashing:
  // a list of names cannot make the scan read more.
  const extra = makePack('policy')
  fs.writeFileSync(path.join(extra, 'big.bin'), 'x')
  fs.appendFileSync(path.join(extra, 'SHA256SUMS'), `${sha(path.join(extra, 'big.bin'))}  big.bin\n`)
  const more = await scan({ spec: SPEC.clean, theme: THEME.clean, pack: extra, catalog: only('pack-modes'), statfs: () => HIGH })
  assert.equal(stateOf(more, 'L-089'), 'unknown')
  assert.match(more.unknown[0].detail, /SHA256SUMS names files the manifest does not: big\.bin/)
})

// ---------------------------------------------------------------- catalog read by the CLI

test('catalog: a missing, empty, truncated or invalid catalog is exit 2 naming the problem', async () => {
  const dir = scratch('catalog')
  const good = fs.readFileSync(path.join(HERE, '..', '..', 'references', 'lessons.jsonl'), 'utf8')
  const first = good.split('\n')[0]
  const cases = [
    ['missing', null, /cannot be read/],
    ['empty', '', /is empty/],
    ['truncated', good.slice(0, -1), /does not end with a newline/],
    ['malformed', `${first.slice(0, -2)}\n`, /not JSON/],
    ['duplicate', `${first}\n${first}\n`, /duplicate id L-001/],
    ['detector', `${first.replace('"always"', '"no-such-detector"')}\n`, /is no detector/],
    ['control', `${first.replace('Repo formatter', 'Repo\\u001bformatter')}\n`, /control character/],
    ['pointer', `${good.split('\n').find((l) => l.includes('"L-013"')).replace('http-parity#samePath', 'http-parity#noSuchSymbolAnywhere')}\n`, /pointers that do not resolve:.*L-013 fix: "noSuchSymbolAnywhere" is not in scripts\/http-parity\.mjs/]
  ]
  for (const [name, body, why] of cases) {
    const file = path.join(dir, `${name}.jsonl`)
    if (body !== null) fs.writeFileSync(file, body)
    const r = await main(['show', 'L-001'], { catalogFile: file })
    assert.equal(r.code, 2, name)
    assert.match(r.stderr[0], why, name)
  }
})

test('detector theme-block-path: the guard and the call are read only in exact path forms, the whole argument', async () => {
  const at = (from, file, php) => {
    const t = copyTree(from, 'forms')
    fs.writeFileSync(path.join(t, file), php)
    return t
  }
  const run = async (t) => scan({ spec: SPEC.clean, theme: t, catalog: only('theme-block-path'), statfs: () => HIGH })
  const call = "register_block_type( get_theme_file_path( 'blocks/mega-menu' ) );"
  // A check on a longer expression that only contains the path tests another file: no guard.
  for (const guard of [
    "file_exists( get_theme_file_path( 'blocks/mega-menu/block.json' ) . '.bak' )",
    "file_exists( get_theme_file_path( 'blocks/mega-menu/block.json.bak' ) )",
    "is_readable( $base . '/blocks/mega-menu/block.json' )",
    "file_exists( __DIR__ . '/blocks/mega-menu/block.json' )",
    // The block directory, in any form: it can be there while its block.json is not.
    "file_exists( get_stylesheet_directory() . '/blocks/mega-menu' )",
    "FILE_EXISTS( dirname( __DIR__ ) . '/blocks/mega-menu/' )",
    "is_readable( get_theme_file_path( 'blocks/mega-menu' ) )"
  ])
    assert.equal(stateOf(await run(at(THEME.traps, 'inc/extra.php', `<?php\nif ( ${guard} ) { ${call} }\n`)), 'L-006'), 'unresolved', guard)
  // The block.json in another exact form guards it: a base directory function, or __DIR__ one level up.
  for (const guard of [
    "is_readable( get_template_directory() . '/blocks/mega-menu/block.json' )",
    "file_exists( get_stylesheet_directory() . '/blocks/mega-menu/block.json' )",
    "FILE_EXISTS( dirname( __DIR__ ) . '/blocks/mega-menu//block.json' )"
  ])
    assert.equal(stateOf(await run(at(THEME.traps, 'inc/extra.php', `<?php\nif ( ${guard} ) { ${call} }\n`)), 'L-006'), 'resolved', guard)
  // The directory is there, its block.json is not, and the guard checks the directory: the call
  // still registers a block with no metadata.
  const dirOnly = at(THEME.traps, 'inc/extra.php', `<?php\nif ( file_exists( get_theme_file_path( 'blocks/mega-menu' ) ) ) { ${call} }\n`)
  fs.mkdirSync(path.join(dirOnly, 'blocks', 'mega-menu'), { recursive: true })
  fs.writeFileSync(path.join(dirOnly, 'blocks', 'mega-menu', 'render.php'), '<?php\n')
  const dirRes = await run(dirOnly)
  assert.equal(stateOf(dirRes, 'L-006'), 'unresolved')
  assert.match(dirRes.unresolved[0].detail, /inc\/extra\.php: blocks\/mega-menu\/block\.json/)
  // __DIR__ is the directory of the file: from inc/ it names inc/blocks, which is missing even
  // though the theme's blocks/mega-menu is there.
  const inInc = await run(at(THEME.clean, 'inc/extra.php', "<?php\nregister_block_type( __DIR__ . '/blocks/mega-menu' );\n"))
  assert.equal(stateOf(inInc, 'L-006'), 'unresolved')
  assert.match(inInc.unresolved[0].detail, /inc\/extra\.php: inc\/blocks\/mega-menu\/block\.json/)
  assert.equal(stateOf(await run(at(THEME.clean, 'inc/extra.php', "<?php\nregister_block_type( dirname( __DIR__ ) . '/blocks/mega-menu', array( 'x' => 1 ) );\n")), 'L-006'), 'resolved')
  // A registered path the scan cannot read is unknown, never a pass; one leaving the theme too.
  for (const php of ["<?php\nregister_block_type( $dir . '/blocks/mega-menu' );\n", "<?php\nregister_block_type( dirname( __DIR__ ) . '/blocks/mega-menu' );\n"]) {
    const res = await run(at(THEME.clean, 'functions.php', php))
    assert.equal(stateOf(res, 'L-006'), 'unknown', php)
    assert.match(res.unknown[0].detail, /--theme functions\.php: .*(neither a block name nor a path form the scan reads|leaves the theme)/)
  }
})

test('detectors spec-list-class, spec-li-img: a finding on one page still names the page not compared', async () => {
  const spec = copyTree(SPEC.traps, 'partial')
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  content.pages.push({ slug: 'db', path: '/db', joomlaPath: '/db', joomla: { articleId: 13 }, content: '<!-- wp:list --><ul class="wp-block-list"><li>Audits</li></ul><!-- /wp:list -->', images: [] })
  writeJson(path.join(spec, 'content.json'), content)
  const res = await scan({ spec, theme: THEME.clean, catalog: [...only('spec-list-class'), ...only('spec-li-img')], statfs: () => HIGH })
  for (const id of ['L-048', 'L-055']) {
    assert.equal(stateOf(res, id), 'unresolved', id)
    assert.match(res.skipped.find((r) => r.id === id)?.detail ?? '', /no --source: 1 page\(s\) from Joomla articles/, id)
  }
  const { stdout, stderr, code } = report(res)
  assert.equal(code, 1)
  assert.equal(new Set(stdout).size, stdout.length, 'each id once on stdout')
  assert.ok(stderr.some((l) => /not checked \(no --source: 1 page\(s\) from Joomla articles.*\): L-048, L-055/.test(l)), stderr.join('\n'))
})

test('detector spec-img-pct: the spec-wide content.json images table is read, as the seeder reads it', async () => {
  const spec = copyTree(SPEC.clean, 'global-images')
  const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
  for (const k of ['pages', 'posts']) for (const p of content[k]) p.images = []
  const sections = JSON.parse(fs.readFileSync(path.join(spec, 'sections.json'), 'utf8'))
  for (const m of sections.custom) m.images = []
  writeJson(path.join(spec, 'sections.json'), sections)
  content.images = [{ file: 'caf%C3%A9.jpg', src: '/images/caf%C3%A9.jpg' }]
  writeJson(path.join(spec, 'content.json'), content)
  const res = await scan({ spec, theme: THEME.clean, catalog: only('spec-img-pct'), statfs: () => HIGH })
  assert.equal(stateOf(res, 'L-095'), 'unresolved')
  assert.match(res.unresolved[0].detail, /content\.json images: caf%C3%A9\.jpg/)
  content.images = [{ file: 'café.jpg', src: '/images/caf%C3%A9.jpg' }] // language-allow: data: accented file name
  writeJson(path.join(spec, 'content.json'), content)
  assert.equal(stateOf(await scan({ spec, theme: THEME.clean, catalog: only('spec-img-pct'), statfs: () => HIGH }), 'L-095'), 'resolved')
  content.images = ['caf%C3%A9.jpg']
  writeJson(path.join(spec, 'content.json'), content)
  const bad = await scan({ spec, theme: THEME.clean, catalog: only('spec-img-pct'), statfs: () => HIGH })
  assert.equal(stateOf(bad, 'L-095'), 'unknown')
  assert.match(bad.unknown[0].detail, /content\.json images holds an entry that is not an object/)
})

test('detector theme-block-path: every register_block_type call is a block name, a path it reads, or unknown', async () => {
  const at = (php) => {
    const t = copyTree(THEME.clean, 'calls')
    fs.writeFileSync(path.join(t, 'functions.php'), php)
    return t
  }
  const run = async (php) => scan({ spec: SPEC.clean, theme: at(php), catalog: only('theme-block-path'), statfs: () => HIGH })
  // A path in a variable, a call, an object: which block.json is registered cannot be read.
  for (const arg of ['$blockPath', "tracy_block_dir( 'mega-menu' )", "new WP_Block_Type( 'tracy/x' )", "'tracy/' . $name", "'./blocks/mega-menu'", "'blocks/mega-menu/block.json'"]) {
    const res = await run(`<?php\nregister_block_type( ${arg} );\n`)
    assert.equal(stateOf(res, 'L-006'), 'unknown', arg)
    assert.match(res.unknown[0].detail, /neither a block name nor a path form the scan reads/, arg)
  }
  // One literal namespace/name is a block type name WordPress registers without a file — so is
  // 'blocks/mega-menu': register_block_type() reads a path only when file_exists() finds it from
  // the working directory of the request, the webroot.
  const named = await run("<?php\nregister_block_type( 'tracy/notice', array( 'render_callback' => 'x' ) );\n")
  assert.equal(stateOf(named, 'L-006'), 'resolved', 'the theme-clean block in inc/ still counts; the name reads no file')
  // _from_metadata always reads a path; a path outside blocks/ is checked like any other.
  assert.equal(stateOf(await run("<?php\nregister_block_type_from_metadata( 'tracy/notice' );\n"), 'L-006'), 'unknown')
  const build = await run("<?php\nregister_block_type_from_metadata( get_theme_file_path( 'build/notice' ) );\n")
  assert.equal(stateOf(build, 'L-006'), 'unresolved')
  assert.match(build.unresolved[0].detail, /functions\.php: build\/notice\/block\.json/)
})

test('detector spec-orphan-modules: a module is seeded by a section-stack entry holding its text; one drawn only through a pattern is unknown; a slot position never seeds one', async () => {
  const at = (page, acm) => {
    const spec = copyTree(SPEC.traps, 'orphan')
    const content = JSON.parse(fs.readFileSync(path.join(spec, 'content.json'), 'utf8'))
    Object.assign(content.pages[0], { contentKind: 'sections', content: [{ kind: 'section', moduleId: '105' }] }, page)
    writeJson(path.join(spec, 'content.json'), content)
    const sections = JSON.parse(fs.readFileSync(path.join(spec, 'sections.json'), 'utf8'))
    if (acm !== undefined) sections.acm = acm
    writeJson(path.join(spec, 'sections.json'), sections)
    return spec
  }
  const run = async (page, acm) => scan({ spec: at(page, acm), theme: THEME.clean, catalog: only('spec-orphan-modules'), statfs: () => HIGH })
  const inst = (o = {}) => ({ id: '201', published: true, scope: 'page', position: 'landing-1', ordering: 1, pages: [{ wpPath: '/' }], type: 'features', style: 'style-1', fields: {}, items: [], ...o })
  // Seeded whatever the theme holds: a section entry with its HTML (its last fallback is a core/html
  // block of it), an html entry with its blocks.
  for (const entry of [{ kind: 'section', moduleId: '201', html: '<p>Promo</p>' }, { kind: 'html', moduleId: '201', blocks: '<!-- wp:paragraph --><p>Promo</p><!-- /wp:paragraph -->' }]) {
    const res = await run({ content: [entry] })
    assert.equal(stateOf(res, 'L-010'), 'unresolved', entry.kind)
    assert.match(res.unresolved[0].detail, /\/ \(entry 201\)/)
  }
  // Drawn only through a pattern patterns.map.json maps and the site registers — an ACM instance of
  // the page (with or without type and style), an entry without its text: no scan input says
  // whether it renders, so unknown and named, never a finding.
  for (const [page, acm] of [
    [{}, [inst()]],
    [{}, [inst({ type: undefined, style: undefined })]],
    [{ content: [{ kind: 'section', moduleId: '201' }] }, undefined],
    [{ content: [{ kind: 'html', moduleId: '201', blocks: '  ' }] }, undefined]
  ]) {
    const res = await run(page, acm)
    assert.equal(stateOf(res, 'L-010'), 'unknown', JSON.stringify([page, acm]))
    assert.match(res.unknown[0].detail, /patterns\.map\.json maps them to a pattern the site registers, on \/ \((acm|entry) 201\)/)
    assert.equal(report(res).code, 2)
  }
  // A finding on one module and no verdict on another: the finding is printed, the other is
  // unknown (not "not checked" — the input was given), and unknown wins the exit code.
  const two = at({ content: [{ kind: 'section', moduleId: '201', html: '<p>Promo</p>' }], orphaned: [{ position: 'landing-1', module: '201' }, { position: 'landing-1', module: '202' }] }, [inst({ id: '202' })])
  const mixed = await scan({ spec: two, theme: THEME.clean, catalog: only('spec-orphan-modules'), statfs: () => HIGH })
  assert.equal(stateOf(mixed, 'L-010'), 'unresolved')
  assert.match(mixed.unresolved[0].detail, /\/ \(entry 201\)/)
  assert.ok(mixed.unknown.some((u) => u.id === 'L-010' && /acm 202/.test(u.detail)))
  assert.ok(!mixed.skipped.some((s) => s.id === 'L-010'))
  const mixedOut = report(mixed)
  assert.equal(mixedOut.code, 2)
  assert.deepEqual(mixedOut.stdout.filter((l) => l.startsWith('L-010')).length, 1)
  assert.ok(mixedOut.stderr.some((l) => /unknown L-010: .*acm 202/.test(l)))
  // Not seeded: a slot at the orphaned position — in an entry, in contentMarkup beside an entry
  // list, spaced or not — draws only instances assigned to the page, and there is none; a
  // `position` attribute on any other block is nothing the seeder reads.
  for (const page of [
    { content: [{ kind: 'slot', position: 'landing-1', modules: ['201'] }] },
    { contentMarkup: '<!-- wp:tracy-base/slot {"position": "landing-1"} /-->' },
    { contentKind: 'blocks', content: '<!-- wp:tracy-base/slot {"position":"landing-1"} /-->' },
    { contentKind: 'blocks', content: '<!-- wp:group {"position":"landing-1"} --><div class="wp-block-group"></div><!-- /wp:group -->' }
  ])
    assert.equal(stateOf(await run(page), 'L-010'), 'resolved', JSON.stringify(page))
  // An instance unpublished, of another scope or assigned to another page is not drawn here.
  for (const o of [{ published: false }, { scope: 'site' }, { pages: [{ wpPath: '/about' }] }]) assert.equal(stateOf(await run({}, [inst(o)]), 'L-010'), 'resolved', JSON.stringify(o))
  // A page or sections.json the seeder cannot read decides nothing: a list under "blocks", text
  // under "sections", an acm that is no list, an instance without its pages.
  for (const [page, acmList, why] of [
    [{ contentKind: 'blocks', content: [{ kind: 'section', moduleId: '201' }] }, undefined, /contentKind "blocks" with a list content/],
    [{ content: '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->' }, undefined, /contentKind "sections" with string content/],
    [{}, { id: '201' }, /sections\.json acm is not a list/],
    [{}, [inst({ pages: null })], /sections\.json acm: /]
  ]) {
    const res = await run(page, acmList)
    assert.equal(stateOf(res, 'L-010'), 'unknown', String(why))
    assert.match(res.unknown[0].detail, why)
  }
})

test('detector pack-modes: a listing the audit cannot read — empty, too long, or a row off its schema — is unknown, never clean or a finding', async () => {
  const pack = makePack('policy')
  const row = (o = {}) => ({ name: 'index.php', type: 'file', mode: 0o644, uid: 0, gid: 0, uname: 'root', gname: 'root', size: 1, linkname: '', pax: [], ...o })
  const run = (rows, limits = {}) => scan({ spec: SPEC.clean, theme: THEME.clean, pack, catalog: only('pack-modes'), statfs: () => HIGH, limits, archiveSpawn: () => ({ status: 0, stdout: JSON.stringify(rows), stderr: '' }) })
  for (const [rows, why, limits] of [
    [[], /no member/],
    [[row(), row({ name: 'wp-load.php' })], /2 members \(limit 1\)/, { archiveMembers: 1 }],
    [[row({ mode: undefined })], /row 0 has mode/],
    [[row(), row({ mode: '644' })], /row 1 has mode/],
    [[row({ mode: 0o644 + 0.5 })], /has mode/],
    [[row({ mode: -1 })], /has mode/],
    [[row({ mode: 0o1000000 })], /has mode/],
    [[row({ uid: '0' })], /uid\/gid/],
    [[row({ name: '' })], /has no name/],
    [[row({ type: 'socket' })], /has type/],
    [[row({ linkname: null })], /linkname/],
    [[row({ pax: 'SCHILY.xattr' })], /pax/],
    [[null], /is not an object/]
  ]) {
    const res = await run(rows, limits)
    assert.equal(stateOf(res, 'L-089'), 'unknown', String(why))
    assert.match(res.unknown[0].detail, why)
    assert.equal(report(res).code, 2)
  }
  // A mode carrying the file type bits is audited on its permission bits, as the audit masks them.
  assert.equal(stateOf(await run([row({ mode: 0o100644 }), row({ name: 'wp-content/', type: 'dir', mode: 0o40755 })]), 'L-089'), 'resolved')
  assert.equal(stateOf(await run([row({ mode: 0o100600 })]), 'L-089'), 'unresolved')
})
