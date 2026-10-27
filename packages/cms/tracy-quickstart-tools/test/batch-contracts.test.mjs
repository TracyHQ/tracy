import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  CARD_FILE,
  SAFE_EXTRACT,
  activeStands,
  capturesWithFullCoverage,
  cancelScope,
  checkScratchBase,
  heldStands,
  inflight,
  runState,
  teardownAll,
  discover,
  downloadAsset,
  prepareScratch,
  processTarget,
  nearestLowerProfile,
  profilesAt,
  HIDDEN_FILE,
  ProjectPool,
  MAX_ARCHIVE_ENTRIES,
  SETTING_FILE,
  StepError,
  checkJournal,
  checkNotes,
  choosePrefix,
  classify,
  deriveJoomlaParams,
  designSidecar,
  listReleases,
  missingBlockModules,
  must,
  parseTag,
  pool,
  projectInUse,
  publishProfile,
  quickstartManifest,
  readCoworkVersion,
  refusalSummary,
  renderNotes,
  run,
  safeExtract,
  sameProfile,
  selectCards,
  serialized,
  stagedScopeProblems,
  stageComponentBuild,
  summarize,
  validateOptions,
  wordpressCompose
} from '../batch-contracts.mjs'

// Every folder this file makes lives under one root, removed when the file ends, pass or fail.
// TRACY_TEST_ARTIFACTS only moves that root; nothing reads these folders after the run.
const ROOT = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACTS ?? tmpdir(), 'bc-test-'))
after(() => rmSync(ROOT, { recursive: true, force: true }))
const tmp = (prefix = 'bc-test-') => mkdtempSync(path.join(ROOT, prefix))
const SHA = 'a'.repeat(64)

// ── options: refused before anything is touched ──────────────────────────────────────────────

const GOOD = {
  baseline: 'HEAD',
  platform: 'all',
  repo: 'JoomlArt-Products/ja-products',
  jobs: '2',
  'project-prefix': 'tch-bc-test',
  'project-capacity': '40',
  'template-timeout-seconds': '1200',
  'cowork-source': '/abs/cowork',
  artifacts: '/abs/art'
}

test('good options pass and are parsed to numbers', () => {
  const { errors, value } = validateOptions('capture', GOOD)
  assert.deepEqual(errors, [])
  assert.equal(value.jobsN, 2)
  assert.equal(value.capacityN, 40)
})

test('every bad option is named, not just the first', () => {
  const { errors } = validateOptions('capture', {
    ...GOOD,
    platform: 'drupal',
    jobs: '0',
    'project-capacity': 'many',
    'project-prefix': 'X',
    'cowork-source': 'relative/path',
    artifacts: undefined,
    only: 'ja-spa,Bad Name',
    'template-timeout-seconds': '5',
    'cowork-version': 'v1'
  })
  const text = errors.join('\n')
  for (const needle of [
    '--platform',
    '--jobs',
    '--project-capacity',
    '--project-prefix',
    '--cowork-source',
    '--artifacts',
    '--only',
    '--template-timeout-seconds',
    '--cowork-version'
  ])
    assert.match(text, new RegExp(needle), `${needle} should be reported`)
})

test('jobs may not exceed the project pool, and a baseline must be a ref', () => {
  assert.match(
    validateOptions('capture', { ...GOOD, jobs: '4', 'project-capacity': '3' }).errors.join(),
    /--jobs cannot exceed/
  )
  assert.match(
    validateOptions('discover', { baseline: 'a b;rm', platform: 'all', repo: 'x/y' }).errors.join(),
    /--baseline/
  )
  assert.match(
    validateOptions('discover', { baseline: 'HEAD', platform: 'all', repo: 'not a repo' }).errors.join(),
    /--repo/
  )
})

test('--design takes slug=null or slug=id pairs only', () => {
  assert.deepEqual(validateOptions('capture', { ...GOOD, design: 'ja-kinetic=null,ja-x=ja-y' }).errors, [])
  assert.match(validateOptions('capture', { ...GOOD, design: 'ja-kinetic' }).errors.join(), /--design/)
})

test('verify-report needs its three files; unknown commands are errors', () => {
  assert.equal(validateOptions('verify-report', {}).errors.length, 3)
  assert.match(validateOptions('nope', {}).errors[0], /unknown command/)
})

// ── tags and discovery ───────────────────────────────────────────────────────────────────────

test('parseTag keeps Joomla j6 and WordPress wp7 and drops everything else', () => {
  assert.deepEqual(parseTag('quickstart/ja-essence/j6'), { slug: 'ja-essence', platform: 'joomla' })
  assert.deepEqual(parseTag('tracy-base/wp7'), { slug: 'tracy-base', platform: 'wordpress' })
  assert.equal(parseTag('tracy-base/emdash-0.x'), null)
  assert.equal(parseTag('quickstart/ja-essence/j6/extra'), null)
  assert.equal(parseTag('../etc/j6'), null)
  assert.equal(parseTag(''), null)
})

const batch = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i + 1, tag_name: `t${from + i + 1}/j6` }))

test('listReleases follows pages to the short one and returns every release', async () => {
  const pages = { 1: batch(2), 2: batch(2, 2), 3: batch(1, 4) }
  const asked = []
  const api = async (endpoint) => {
    asked.push(endpoint)
    return JSON.stringify(pages[Number(/[?&]page=(\d+)/.exec(endpoint)[1])])
  }
  const all = await listReleases('o/r', api, 2)
  assert.equal(all.length, 5)
  assert.equal(asked.length, 3)
})

test('listReleases fails when a page repeats a release, is not an array, or never ends', async () => {
  await assert.rejects(
    listReleases('o/r', async () => JSON.stringify(batch(2)), 2),
    /repeats/
  )
  await assert.rejects(
    listReleases('o/r', async () => '{"message":"rate limited"}', 2),
    /not an array/
  )
  let page = 0
  const endless = async () => JSON.stringify(batch(2, page++ * 2))
  await assert.rejects(listReleases('o/r', endless, 2), /did not end/)
})

const CARD = {
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'ja-essence',
  provider: 'JoomlArt',
  category: 'Editorial',
  blurb: 'x',
  image: 'ja-essence-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'ja-essence-home-1440.png' } }]
}
const SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'joomla',
  label: 'JA Essence',
  version: '1.0.0',
  cms: '6.1.1',
  template: 'ja_essence',
  install: { installer: { file: 'e.zip', sha256: SHA } }
}
const asset = (name, extra = {}) => ({ id: name.length, name, size: 10, digest: null, ...extra })
const release = (over = {}) => ({
  id: 1,
  tag_name: 'quickstart/ja-essence/j6',
  draft: false,
  prerelease: true,
  assets: [asset('e.zip'), asset(CARD_FILE), asset(SETTING_FILE)],
  ...over
})
const reader =
  (card = CARD, setting = SETTING) =>
  async (a) =>
    JSON.stringify(a.name === CARD_FILE ? card : setting)

test('a published card release with a valid card and setting is selected, pre-releases included', async () => {
  const { cards, excluded } = await selectCards([release()], reader(), ['joomla'])
  assert.equal(cards.length, 1)
  assert.equal(excluded.length, 0)
  assert.equal(cards[0].shape, 'installer')
  assert.equal(cards[0].version, '1.0.0')
  assert.equal(cards[0].prerelease, true)
})

test('drafts, hidden cards and missing cards are excluded; a bad card is broken, not dropped', async () => {
  const rels = [
    release({ id: 1, tag_name: 'quickstart/a/j6', draft: true }),
    release({
      id: 2,
      tag_name: 'quickstart/b/j6',
      assets: [asset('e.zip'), asset(CARD_FILE), asset(HIDDEN_FILE), asset(SETTING_FILE)]
    }),
    release({ id: 3, tag_name: 'quickstart/c/j6', assets: [asset('e.zip'), asset(SETTING_FILE)] }),
    release({ id: 4, tag_name: 'quickstart/d/j6' }),
    release({ id: 5, tag_name: 'quickstart/e/j6' }),
    release({ id: 6, tag_name: 'tracy-base/emdash-0.x' })
  ]
  const read = async (a) => {
    const owner = a.name === CARD_FILE
    return JSON.stringify(owner ? { ...CARD, provider: 'Nobody' } : SETTING)
  }
  const { cards, excluded, broken } = await selectCards(rels, read, ['joomla', 'wordpress'])
  assert.equal(cards.length, 0)
  assert.deepEqual(
    broken.map((b) => [b.tag, b.slug, b.platform]),
    [
      ['quickstart/d/j6', 'd', 'joomla'],
      ['quickstart/e/j6', 'e', 'joomla']
    ]
  )
  const reason = Object.fromEntries([...excluded, ...broken].map((e) => [e.tag, e.reason]))
  assert.equal(reason['quickstart/a/j6'], 'draft')
  assert.equal(reason['quickstart/b/j6'], 'card hidden')
  assert.equal(reason['quickstart/c/j6'], 'no card')
  assert.match(reason['quickstart/d/j6'], /invalid card/)
  assert.match(reason['tracy-base/emdash-0.x'], /out of scope/)
})

test('--without-card admits only the named releases with no card; every other rule still applies', async () => {
  const noCard = [asset('e.zip'), asset(SETTING_FILE)]
  const rels = [
    release({ id: 1, tag_name: 'quickstart/a/j6', assets: noCard }),
    release({ id: 2, tag_name: 'quickstart/b/j6', assets: noCard }),
    release({ id: 3, tag_name: 'quickstart/c/j6', draft: true, assets: noCard }),
    release({ id: 4, tag_name: 'quickstart/d/j6', assets: [asset('e.zip')] }),
    release({ id: 5, tag_name: 'quickstart/e/j6' })
  ]
  const named = new Set(['quickstart/a/j6', 'quickstart/c/j6', 'quickstart/d/j6', 'quickstart/e/j6'])
  const { cards, excluded, broken } = await selectCards(rels, reader(), ['joomla'], named)
  assert.deepEqual(
    cards.map((c) => [c.tag, c.cardless === true]),
    [
      ['quickstart/a/j6', true],
      ['quickstart/e/j6', false]
    ]
  )
  const reason = Object.fromEntries([...excluded, ...broken].map((e) => [e.tag, e.reason]))
  assert.equal(reason['quickstart/b/j6'], 'no card')
  assert.equal(reason['quickstart/c/j6'], 'draft')
  assert.match(reason['quickstart/d/j6'], /card without tracy_setting/)
  // Without the option nothing changes: a release with no card is excluded.
  const plain = await selectCards(rels, reader(), ['joomla'])
  assert.deepEqual(
    plain.cards.map((c) => c.tag),
    ['quickstart/e/j6']
  )
  assert.equal(plain.cards[0].cardless, undefined)
})

test('--without-card takes release tags only', () => {
  assert.deepEqual(
    validateOptions('discover', {
      baseline: 'HEAD',
      platform: 'all',
      repo: 'x/y',
      'without-card': 'quickstart/ja-fresco/j6,quickstart/ja-diner/j6'
    }).errors,
    []
  )
  assert.match(
    validateOptions('capture', { ...GOOD, 'without-card': 'ja-fresco' }).errors.join(),
    /--without-card/
  )
})

test('a setting that is invalid, replaced after it was cut, or for another platform is broken', async () => {
  const bad = (setting, digest) =>
    selectCards(
      [
        release({
          assets: [
            asset('e.zip', digest ? { digest: `sha256:${digest}` } : {}),
            asset(CARD_FILE),
            asset(SETTING_FILE)
          ]
        })
      ],
      reader(CARD, setting),
      ['joomla']
    )
  assert.match((await bad({ ...SETTING, version: 'one' })).broken[0].reason, /invalid tracy_setting/)
  assert.match((await bad(SETTING, 'b'.repeat(64))).broken[0].reason, /replaced after the setting was cut/)
  assert.match(
    (
      await bad({
        ...SETTING,
        platform: 'wordpress',
        install: { webroot: { file: 'w', sha256: SHA }, database: { file: 'd', sha256: SHA } }
      })
    ).broken[0].reason,
    /invalid tracy_setting|does not match the tag/
  )
})

test('a release whose card cannot be read is a thrown error, not a silent exclusion', async () => {
  const boom = async () => {
    throw new StepError('unknown', 'github', 'rate limited')
  }
  await assert.rejects(selectCards([release()], boom, ['joomla']), /rate limited/)
})

test('platforms outside the request are skipped without being counted as excluded', async () => {
  const { cards, excluded } = await selectCards([release()], reader(), ['wordpress'])
  assert.equal(cards.length, 0)
  assert.equal(excluded.length, 0)
})

test('classify gives every card exactly one state from the baseline profiles', async () => {
  const cards = [
    { slug: 'ja-spa', platform: 'joomla', version: '1.0.1' },
    { slug: 'ja-kinetic', platform: 'joomla', version: '1.0.2' },
    { slug: 'ja-essence', platform: 'joomla', version: '1.0.0' }
  ]
  const have = { 'ja-spa': ['1.0.0', '1.0.1'], 'ja-kinetic': ['1.0.0'] }
  const rows = await classify(cards, 'HEAD', async (_b, _p, slug) => have[slug] ?? [])
  assert.deepEqual(
    rows.map((r) => [r.slug, r.state]),
    [
      ['ja-essence', 'missing'],
      ['ja-kinetic', 'missing'],
      ['ja-spa', 'exists']
    ]
  )
  assert.deepEqual(rows.find((r) => r.slug === 'ja-kinetic').existingVersions, ['1.0.0'])
})

// ── the project pool ─────────────────────────────────────────────────────────────────────────

test('the pool hands out names in order, skips occupied ones for good and waits for a free one', async () => {
  const pool1 = new ProjectPool('p', 3, async (n) => n === 'p-01')
  assert.equal(await pool1.acquire(), 'p-02')
  assert.equal(await pool1.acquire(), 'p-03')
  assert.deepEqual(pool1.skipped, ['p-01'])
  let got = null
  const waiting = pool1.acquire().then((n) => (got = n))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(got, null, 'no free name: it waits')
  pool1.release('p-02')
  await waiting
  assert.equal(got, 'p-02')
})

test('a pool with every name occupied by others refuses instead of waiting forever', async () => {
  const p = new ProjectPool('p', 2, async () => true)
  await assert.rejects(p.acquire(), /no free compose project name/)
})

test('two pools sharing a lock folder never hand out the same name, and a dead owner is replaced', async () => {
  const locks = path.join(tmp(), 'locks')
  const a = new ProjectPool('p', 2, async () => false, locks)
  const b = new ProjectPool('p', 2, async () => false, locks)
  assert.equal(await a.acquire(), 'p-01')
  assert.equal(await b.acquire(), 'p-02')
  a.release('p-01')
  assert.equal(await b.acquire(), 'p-01')
  mkdirSync(path.join(locks, 'p-02'), { recursive: true })
  writeFileSync(path.join(locks, 'p-02', 'pid'), '999999')
  b.release('p-02')
  mkdirSync(path.join(locks, 'p-02'), { recursive: true })
  writeFileSync(path.join(locks, 'p-02', 'pid'), '999999')
  const c = new ProjectPool('p', 2, async () => false, locks)
  assert.equal(await c.acquire(), 'p-02', 'the lock of a dead process is taken over')
})

test('projectInUse asks Docker for containers, volumes and networks of exactly that project', async () => {
  const dir = tmp()
  const log = path.join(dir, 'calls.log')
  const shim = path.join(dir, 'docker')
  writeFileSync(
    shim,
    `#!/bin/sh\necho "$@" >> "${log}"\ncase "$1" in ps) [ "$FAKE_BUSY" = 1 ] && echo abc123;; esac\nexit 0\n`
  )
  chmodSync(shim, 0o755)
  const was = process.env.PATH
  process.env.PATH = `${dir}:${was}`
  try {
    assert.equal(await projectInUse('p-01'), false)
    process.env.FAKE_BUSY = '1'
    assert.equal(await projectInUse('p-01'), true)
  } finally {
    process.env.PATH = was
    delete process.env.FAKE_BUSY
  }
  const calls = readFileSync(log, 'utf8')
  assert.match(calls, /label=com.docker.compose.project=p-01/)
  assert.match(calls, /^volume ls/m)
  assert.match(calls, /^network ls/m)
})

test('pool() runs at most N at a time and keeps the order of its results', async () => {
  let live = 0
  let peak = 0
  const out = await pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
    live++
    peak = Math.max(peak, live)
    await new Promise((r) => setTimeout(r, 5 * (7 - n)))
    live--
    return n * 10
  })
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60])
  assert.equal(peak, 2)
})

// ── the process runner ───────────────────────────────────────────────────────────────────────

test('must() turns a non-zero exit, a timeout and an overflow into errors that name the step', async () => {
  await assert.rejects(must('s1', 'sh', ['-c', 'echo boom >&2; exit 3']), /s1: .*exited 3.*boom/)
  await assert.rejects(
    must('s2', 'sleep', ['5'], { timeoutMs: 100 }),
    (e) => e.kind === 'unknown' && /s2/.test(e.message)
  )
  await assert.rejects(
    must('s3', 'sh', ['-c', 'head -c 5000 /dev/zero'], { maxBytes: 100 }),
    /printed more than/
  )
  const ok = await must('s4', 'sh', ['-c', 'cat'], { input: 'hello' })
  assert.equal(ok.stdout, 'hello')
})

test('a command that cannot start is an unknown, not a verdict on the release', async () => {
  await assert.rejects(must('s', '/definitely/not/here', []), (e) => e.kind === 'unknown')
  await assert.rejects(run('/definitely/not/here', []), /ENOENT/)
})

// ── extraction ───────────────────────────────────────────────────────────────────────────────

const py = (code) => run('python3', ['-c', code])

test('safeExtract unpacks a normal tarball and refuses traversal, absolute paths, device files and oversize', async () => {
  const dir = tmp()
  const mk = async (name, body) => {
    const r = await py(
      `import tarfile,io,os,sys\nt=tarfile.open(${JSON.stringify(path.join(dir, name))},'w:gz')\n${body}\nt.close()`
    )
    assert.equal(r.code, 0, r.stderr)
    return path.join(dir, name)
  }
  const good = await mk(
    'good.tgz',
    "i=tarfile.TarInfo('a/b.txt');d=b'hi';i.size=len(d);t.addfile(i,io.BytesIO(d))"
  )
  await safeExtract(good, path.join(dir, 'out'))
  assert.equal(readFileSync(path.join(dir, 'out/a/b.txt'), 'utf8'), 'hi')
  const evil = await mk(
    'evil.tgz',
    "i=tarfile.TarInfo('../escape.txt');d=b'x';i.size=1;t.addfile(i,io.BytesIO(d))"
  )
  await assert.rejects(safeExtract(evil, path.join(dir, 'out2')), /refused/)
  assert.equal(existsSync(path.join(dir, 'escape.txt')), false)
  const abs = await mk(
    'abs.tgz',
    "i=tarfile.TarInfo('/tmp/bc-abs.txt');d=b'x';i.size=1;t.addfile(i,io.BytesIO(d))"
  )
  await assert.rejects(safeExtract(abs, path.join(dir, 'out3')), /refused/)
  const link = await mk(
    'link.tgz',
    "i=tarfile.TarInfo('l');i.type=tarfile.SYMTYPE;i.linkname='/etc/passwd';t.addfile(i)"
  )
  await assert.rejects(safeExtract(link, path.join(dir, 'out4')), /refused/)
  const fifo = await mk('fifo.tgz', "i=tarfile.TarInfo('f');i.type=tarfile.FIFOTYPE;t.addfile(i)")
  await assert.rejects(safeExtract(fifo, path.join(dir, 'out5')), /refused/)
  await assert.rejects(safeExtract(good, path.join(dir, 'out6'), 1), /refused/)
})

// The macOS system Python (3.9.6) has no tarfile `filter` argument, so the tar branch enforces the data
// filter by hand there. Both branches run here on the same archives: the hand one is forced by hiding
// `tarfile.data_filter`, the library one runs when this Python has it.
test('safeExtract applies the same tar policy with and without the library data filter', async (t) => {
  const dir = tmp()
  const mk = async (name, body) => {
    const r = await py(
      `import tarfile,io\nt=tarfile.open(${JSON.stringify(path.join(dir, name))},'w:gz')\ndef f(n,d=b'x',mode=0o644):\n  i=tarfile.TarInfo(n);i.size=len(d);i.mode=mode;t.addfile(i,io.BytesIO(d))\ndef ln(n,target,kind):\n  i=tarfile.TarInfo(n);i.type=kind;i.linkname=target;t.addfile(i)\n${body}\nt.close()`
    )
    assert.equal(r.code, 0, r.stderr)
    return path.join(dir, name)
  }
  const good = await mk(
    'good.tgz',
    [
      "i=tarfile.TarInfo('a');i.type=tarfile.DIRTYPE;i.mode=0o500;t.addfile(i)",
      "f('a/b.txt',b'hi',0o666)",
      "f('a/run.sh',b'#!',0o4777)",
      "ln('a/l','b.txt',tarfile.SYMTYPE)",
      "ln('a/h','a/b.txt',tarfile.LNKTYPE)",
      "f('a/c.txt',b'c',0o640)"
    ].join('\n')
  )
  const refused = {
    traversal: "f('../escape.txt')",
    absoluteSymlink: "ln('l','/etc/passwd',tarfile.SYMTYPE)",
    escapingSymlink: "ln('a/l','../../x',tarfile.SYMTYPE)",
    escapingHardLink: "ln('h','../x',tarfile.LNKTYPE)",
    absoluteHardLink: "ln('h','/etc/passwd',tarfile.LNKTYPE)",
    fifo: "i=tarfile.TarInfo('p');i.type=tarfile.FIFOTYPE;t.addfile(i)",
    device: "i=tarfile.TarInfo('c');i.type=tarfile.CHRTYPE;i.devmajor=1;i.devminor=3;t.addfile(i)"
  }
  const archives = {}
  for (const [k, body] of Object.entries(refused)) archives[k] = await mk(`${k}.tgz`, body)
  const branches = {
    // `import tarfile` in the script gets a view without `data_filter`, and a Python whose default
    // filter is `data` (3.14) is set back to trusting, so only the hand policy refuses.
    hand: [
      'import sys, tarfile, types',
      '_tarfile = tarfile',
      "if hasattr(tarfile, 'fully_trusted_filter'): tarfile.TarFile.extraction_filter = staticmethod(tarfile.fully_trusted_filter)",
      'class Old(types.ModuleType):',
      '  def __getattr__(self, k):',
      "    if k == 'data_filter': raise AttributeError(k)",
      '    return getattr(_tarfile, k)',
      "sys.modules['tarfile'] = Old('tarfile')",
      ''
    ].join('\n'),
    library: "import tarfile\nif not hasattr(tarfile, 'data_filter'): sys.exit(77)\n".replace(
      'sys.',
      '__import__("sys").'
    )
  }
  for (const [branch, prelude] of Object.entries(branches)) {
    const extract = (archive, dest) =>
      run('python3', ['-c', prelude + SAFE_EXTRACT, archive, dest, '1048576', '100'])
    const out = path.join(dir, `${branch}-good`)
    const r = await extract(good, out)
    if (r.code === 77) {
      t.diagnostic(`${branch}: this Python has no tarfile.data_filter`)
      continue
    }
    assert.equal(r.code, 0, `${branch}: ${r.stderr}`)
    const mode = (rel) => statSync(path.join(out, rel)).mode & 0o7777
    assert.equal(readFileSync(path.join(out, 'a/l'), 'utf8'), 'hi', branch)
    assert.equal(readFileSync(path.join(out, 'a/h'), 'utf8'), 'hi', branch)
    assert.equal(mode('a/b.txt'), 0o644, `${branch}: group/other write dropped`)
    assert.equal(mode('a/run.sh'), 0o755, `${branch}: setuid dropped`)
    assert.equal(mode('a/c.txt'), 0o640, branch)
    for (const [k, archive] of Object.entries(archives)) {
      const dest = path.join(dir, `${branch}-${k}`)
      const res = await extract(archive, dest)
      assert.notEqual(res.code, 0, `${branch} accepted ${k}`)
      assert.notEqual(res.code, 77, branch)
    }
    assert.equal(existsSync(path.join(dir, 'escape.txt')), false, branch)
  }
})

test('safeExtract reads zips too and refuses a zip symlink or a traversal path', async () => {
  const dir = tmp()
  const zip = path.join(dir, 'z.zip')
  let r = await py(
    `import zipfile\nz=zipfile.ZipFile(${JSON.stringify(zip)},'w')\nz.writestr('index.php','<?php')\nz.close()`
  )
  assert.equal(r.code, 0, r.stderr)
  await safeExtract(zip, path.join(dir, 'zo'))
  assert.equal(readFileSync(path.join(dir, 'zo/index.php'), 'utf8'), '<?php')
  const evil = path.join(dir, 'evil.zip')
  r = await py(
    `import zipfile\nz=zipfile.ZipFile(${JSON.stringify(evil)},'w')\nz.writestr('../x.php','x')\nz.close()`
  )
  await assert.rejects(safeExtract(evil, path.join(dir, 'zo2')), /refused/)
  const sym = path.join(dir, 'sym.zip')
  r = await py(
    `import zipfile\nz=zipfile.ZipFile(${JSON.stringify(sym)},'w')\ni=zipfile.ZipInfo('l');i.external_attr=(0o120777<<16)\nz.writestr(i,'/etc/passwd')\nz.close()`
  )
  await assert.rejects(safeExtract(sym, path.join(dir, 'zo3')), /refused/)
})

// ── Joomla parameter derivation ──────────────────────────────────────────────────────────────

const inv = (over = {}) => ({
  modules: [
    { client_id: '0', module: 'mod_ja_acm', title: '[Foo] Hero', note: '' },
    { client_id: '0', module: 'mod_custom', title: '[Foo] Footer', note: '' },
    { client_id: '0', module: 'mod_menu', title: 'Menu', note: '' }
  ],
  modules_menu: [],
  content: [{ language: '*' }],
  menu: [
    { client_id: '0', menutype: 'mainmenu', language: '*' },
    { client_id: '0', menutype: 'footer', language: '*' },
    { client_id: '0', menutype: '', language: '*' }
  ],
  template_styles: [
    { id: '1', client_id: '0', template: 'ja_foo', title: 'Foo' },
    { id: '2', client_id: '0', template: 'cassiopeia', title: 'C' }
  ],
  categories: [],
  viewlevels: [],
  usergroups: [],
  assets: [],
  ...over
})
const dirs =
  (...names) =>
  (rel) =>
    names.includes(rel)
const base = ['templates/ja_foo', 'plugins/system/t4', 'modules/mod_ja_acm', 'media']

test('Joomla parameters come from the inventory and the webroot, with their evidence', () => {
  const p = deriveJoomlaParams(inv(), { template: 'ja_foo' }, dirs(...base), () => true)
  assert.equal(p.menutypes, 'footer,mainmenu')
  assert.deepEqual(p.prefixCandidates, ['', '[Foo'])
  assert.equal(p.listItems, true)
  assert.equal(p.framework, 't4')
  assert.equal(p.fileRoots, base.join(','))
  assert.equal(p.identityNote, '')
  assert.deepEqual(p.evidence.menutypes, { footer: 1, mainmenu: 1 })
})

test('the identity note is passed only when a module carries tracy:identity', () => {
  const withNote = inv()
  withNote.modules.push({ client_id: '0', module: 'mod_custom', title: 'Id', note: 'tracy:identity' })
  assert.equal(
    deriveJoomlaParams(withNote, { template: 'ja_foo' }, dirs(...base), () => false).identityNote,
    'tracy:identity'
  )
})

test('file roots keep only folders the webroot really has', () => {
  const p = deriveJoomlaParams(
    inv(),
    { template: 'ja_foo' },
    dirs('templates/ja_foo', 'plugins/system/t3'),
    () => false
  )
  assert.equal(p.fileRoots, 'templates/ja_foo,plugins/system/t3')
  assert.equal(p.framework, 't3')
})

test('releases the single-language capture cannot describe are blocked with the reason', () => {
  const blockedWith = (i, setting, exists, pattern) => {
    assert.throws(
      () => deriveJoomlaParams(i, setting, exists, () => false),
      (e) => e instanceof StepError && e.kind === 'blocked' && pattern.test(e.message)
    )
  }
  blockedWith(inv(), { template: 'ja_foo' }, dirs('templates/ja_foo'), /neither plugins\/system\/t4 nor/)
  blockedWith(
    inv(),
    { template: 'ja_foo' },
    dirs('templates/ja_foo', 'plugins/system/t3', 'plugins/system/t4'),
    /both t3 and t4/
  )
  blockedWith(inv(), { template: 'ja_missing' }, dirs(...base), /not in the webroot/)
  blockedWith(inv(), { template: undefined }, dirs(...base), /no usable template/)
  blockedWith(inv({ template_styles: [] }), { template: 'ja_foo' }, dirs(...base), /no site template style/)
  blockedWith(inv({ menu: [] }), { template: 'ja_foo' }, dirs(...base), /no menu/)
  blockedWith(
    inv({ content: [{ language: 'en-GB' }, { language: 'fr-FR' }] }),
    { template: 'ja_foo' },
    dirs(...base),
    /2 languages/
  )
})

test('an inventory missing a table is a failure of the run, not of the release', () => {
  assert.throws(
    () =>
      deriveJoomlaParams({ ...inv(), menu: undefined }, { template: 'ja_foo' }, dirs(...base), () => false),
    (e) => e.kind === 'failed' && /no menu table/.test(e.message)
  )
})

test('a capture refusal is reduced to its own sentence, without our scratch paths', () => {
  const trace =
    'Traceback (most recent call last):\n  File "/x/capture-contract.py", line 83, in <module>\n    if not xml.exists():raise ValueError(f\'Missing ACM schema {xml}\')\n                        ^^^^^^^^\nValueError: Missing ACM schema /tmp/s/webroot/templates/ja_x/acm/teams/tmpl/style-1.xml\n'
  assert.equal(
    refusalSummary(trace, '/tmp/s/webroot'),
    'ValueError: Missing ACM schema <webroot>/templates/ja_x/acm/teams/tmpl/style-1.xml'
  )
  const listed = 'Contract not written:\n- module-5 (module) {} matches 2 rows\n    row 5: {}\n'
  assert.match(refusalSummary(listed, '/w'), /^Contract not written: \| - module-5/)
})

test('modules that use a block the template lacks are named with their state', () => {
  const cfg = (type) => JSON.stringify({ 'jatools-config': JSON.stringify({ ':type': type }) })
  const i = {
    modules: [
      {
        id: '7',
        client_id: '0',
        module: 'mod_ja_acm',
        title: 'Team',
        published: '0',
        params: cfg('t:teams')
      },
      {
        id: '8',
        client_id: '0',
        module: 'mod_ja_acm',
        title: 'Other',
        published: '1',
        params: cfg('t:hero')
      },
      { id: '9', client_id: '0', module: 'mod_ja_acm', title: 'Broken', published: '1', params: 'not json' }
    ]
  }
  assert.equal(
    missingBlockModules(i, 'Missing ACM schema /w/templates/t/acm/teams/tmpl/style-1.xml'),
    ' — used by 1 module(s): #7 "Team" published=0'
  )
  assert.equal(missingBlockModules(i, 'something else'), '')
})

test('the module prefix with the most slots wins, the empty prefix included, and a refusal blocks instead of narrowing', () => {
  assert.deepEqual(
    choosePrefix([
      ['', { slots: 6662 }],
      ['[Photographer', { slots: 6112 }]
    ]),
    { prefix: '' }
  )
  assert.deepEqual(
    choosePrefix([
      ['', { slots: 10 }],
      ['[Foo', { slots: 40 }]
    ]),
    { prefix: '[Foo' }
  )
  assert.deepEqual(
    choosePrefix([
      ['', { slots: 5 }],
      ['[Foo', { slots: 5 }]
    ]),
    { prefix: '' },
    'a tie keeps the broader prefix'
  )
  const blocked = choosePrefix([
    ['', { refused: 'Missing ACM schema' }],
    ['[About-us', { slots: 414 }]
  ])
  assert.equal(blocked.refusedBy, 'Missing ACM schema')
  assert.equal(blocked.prefix, '')
})

// ── the manifest a contract quotes ───────────────────────────────────────────────────────────

const CARDROW = {
  slug: 'ja-essence',
  tag: 'quickstart/ja-essence/j6',
  platform: 'joomla',
  version: '1.0.0',
  cms: '6.1.1',
  template: 'ja_essence',
  install: { installer: { file: 'e.zip', sha256: SHA } },
  assets: { 'e.zip': { size: 99 } }
}

test('the contract quotes the release manifest when there is one and builds one from the setting when not', () => {
  const built = quickstartManifest(CARDROW, null)
  assert.equal(built.manifest.release, 'quickstart/ja-essence/j6')
  assert.deepEqual(built.manifest.parts.installer, { file: 'e.zip', bytes: 99, sha256: SHA })
  assert.match(built.source, /built from tracy_setting/)
  const real = quickstartManifest(CARDROW, { version: '1.0.0', id: 'x' })
  assert.equal(
    real.manifest.release,
    'quickstart/ja-essence/j6',
    'a manifest with no release gets the tag it was downloaded from'
  )
  assert.throws(
    () => quickstartManifest(CARDROW, { version: '0.9.0' }),
    (e) => e.kind === 'blocked' && /0.9.0/.test(e.message)
  )
})

// ── publication ──────────────────────────────────────────────────────────────────────────────

const PROFILE = {
  'manifest.json': Buffer.from('{"a":1}\n'),
  'content-map.json': Buffer.from('{}\n'),
  'presentation-lock.json': Buffer.from('{}\n')
}
const NEW = { slug: 'ja-new', platform: 'joomla', version: '1.0.0' }
const SIDE = { schemaVersion: 'tracy-contract-design/v1', design: null }
const joomlaDir = (root) => path.join(root, 'packages/cms/tracy-joomla-quickstart/contracts')

test('publishProfile places the profile and its sidecar atomically', async () => {
  const root = tmp()
  const placed = await publishProfile({
    card: NEW,
    files: PROFILE,
    designJson: SIDE,
    gate: async () => {},
    root
  })
  const dir = path.join(root, placed.dir)
  assert.deepEqual(readdirSync(dir).sort(), ['content-map.json', 'manifest.json', 'presentation-lock.json'])
  assert.equal(JSON.parse(readFileSync(path.join(root, placed.sidecar), 'utf8')).design, null)
  assert.deepEqual(
    readdirSync(path.join(dir, '..')).filter((n) => n.includes('tmp')),
    []
  )
})

test('a failing gate takes away exactly what was added, and the folders it created', async () => {
  const root = tmp()
  await assert.rejects(
    publishProfile({
      card: NEW,
      files: PROFILE,
      designJson: SIDE,
      gate: async () => {
        throw new Error('gate red')
      },
      root
    }),
    /gate red/
  )
  assert.equal(existsSync(path.join(joomlaDir(root), 'ja-new')), false)
})

test('a failing gate leaves the released profiles of the same design untouched', async () => {
  const root = tmp()
  const old = path.join(joomlaDir(root), 'ja-new/j6/0.9.0')
  mkdirSync(old, { recursive: true })
  writeFileSync(path.join(old, 'manifest.json'), 'released')
  await assert.rejects(
    publishProfile({
      card: NEW,
      files: PROFILE,
      designJson: SIDE,
      gate: async () => {
        throw new Error('red')
      },
      root
    }),
    /red/
  )
  assert.equal(readFileSync(path.join(old, 'manifest.json'), 'utf8'), 'released')
  assert.equal(existsSync(path.join(joomlaDir(root), 'ja-new/j6/1.0.0')), false)
  assert.equal(existsSync(path.join(joomlaDir(root), 'ja-new/j6/1.0.0.design.json')), false)
})

test('an existing profile is never overwritten, even by an identical one', async () => {
  const root = tmp()
  await publishProfile({ card: NEW, files: PROFILE, designJson: SIDE, gate: async () => {}, root })
  await assert.rejects(
    publishProfile({
      card: NEW,
      files: { ...PROFILE, 'manifest.json': Buffer.from('other') },
      designJson: SIDE,
      gate: async () => {},
      root
    }),
    /never overwritten/
  )
  assert.equal(readFileSync(path.join(joomlaDir(root), 'ja-new/j6/1.0.0/manifest.json'), 'utf8'), '{"a":1}\n')
})

test('a version folder holding measurements only takes the profile and keeps the measurements', async () => {
  const root = tmp()
  const dir = path.join(joomlaDir(root), 'ja-new/j6/1.0.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'design-system-measurement.json'), 'measured')
  await assert.rejects(
    publishProfile({
      card: NEW,
      files: PROFILE,
      designJson: SIDE,
      gate: async () => {
        throw new Error('red')
      },
      root
    }),
    /red/
  )
  assert.deepEqual(readdirSync(dir), ['design-system-measurement.json'])
  assert.equal(existsSync(path.join(joomlaDir(root), 'ja-new/j6/1.0.0.design.json')), false)
  await publishProfile({ card: NEW, files: PROFILE, designJson: SIDE, gate: async () => {}, root })
  assert.deepEqual(readdirSync(dir).sort(), [
    'content-map.json',
    'design-system-measurement.json',
    'manifest.json',
    'presentation-lock.json'
  ])
  assert.equal(readFileSync(path.join(dir, 'design-system-measurement.json'), 'utf8'), 'measured')
  assert.deepEqual(
    readdirSync(path.join(dir, '..')).filter((n) => n.includes('tmp')),
    []
  )
})

test('a write that fails half way leaves no temp folder and no folder it created', async () => {
  const root = tmp()
  await assert.rejects(
    publishProfile({
      card: NEW,
      files: { 'manifest.json': 12345 },
      designJson: SIDE,
      gate: async () => {},
      root
    })
  )
  assert.equal(existsSync(path.join(joomlaDir(root), 'ja-new')), false)
})

test('serialized() runs publications one after the other even when the first fails', async () => {
  const order = []
  const a = serialized(async () => {
    order.push('a1')
    await new Promise((r) => setTimeout(r, 20))
    order.push('a2')
    throw new Error('a failed')
  })
  const b = serialized(async () => {
    order.push('b1')
    order.push('b2')
  })
  await assert.rejects(a, /a failed/)
  await b
  assert.deepEqual(order, ['a1', 'a2', 'b1', 'b2'])
})

test('profile comparison is byte for byte', () => {
  assert.equal(sameProfile(PROFILE, { ...PROFILE }), true)
  assert.equal(sameProfile(PROFILE, { ...PROFILE, 'content-map.json': Buffer.from('{ }\n') }), false)
  assert.equal(
    sameProfile(PROFILE, { ...PROFILE, 'superseded.json': Buffer.from('{}') }),
    false,
    'a file only one side has is a difference'
  )
  assert.equal(sameProfile({ ...PROFILE, 'superseded.json': Buffer.from('{}') }, PROFILE), false)
})

test('the design sidecar is null for a design the catalogue does not name and blocks for one it does', () => {
  assert.deepEqual(designSidecar('ja-no-such-design-zz', undefined).design, null)
  assert.throws(
    () => designSidecar('ja-kinetic', undefined),
    (e) => e.kind === 'blocked' && /--design ja-kinetic=null/.test(e.message)
  )
  assert.equal(designSidecar('ja-kinetic', 'ja-kinetic=null').design, null)
  assert.deepEqual(designSidecar('ja-kinetic', 'ja-kinetic=ja-kinetic').design, {
    id: 'ja-kinetic',
    source: 'catalog'
  })
  assert.throws(() => designSidecar('ja-kinetic', 'ja-kinetic=nothing-here'), /not a system of the catalogue/)
})

test('with no --design, the stored sidecar is the decision; a bad or conflicting one fails closed', () => {
  const dir = tmp()
  const write = (name, body) => {
    const f = path.join(dir, name)
    writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body))
    return f
  }
  const doc = (design) => ({ schemaVersion: 'tracy-contract-design/v1', design })
  assert.deepEqual(
    designSidecar('ja-kinetic', undefined, write('id.json', doc({ id: 'ja-kinetic', source: 'catalog' })))
      .design,
    { id: 'ja-kinetic', source: 'catalog' }
  )
  assert.equal(designSidecar('ja-kinetic', undefined, write('null.json', doc(null))).design, null)
  // an explicit decision still wins over the file, so a conflict shows up as a sidecar difference at compare
  assert.equal(
    designSidecar(
      'ja-kinetic',
      'ja-kinetic=null',
      write('id2.json', doc({ id: 'ja-kinetic', source: 'catalog' }))
    ).design,
    null
  )
  const bad = {
    empty: '',
    malformed: '{',
    array: '[]',
    schema: { schemaVersion: 'x', design: null },
    extra: { schemaVersion: 'tracy-contract-design/v1', design: null, more: 1 },
    shape: doc({ id: 'ja-kinetic' }),
    source: doc({ id: 'ja-kinetic', source: 'other' }),
    catalogue: doc({ id: 'nothing-here', source: 'catalog' })
  }
  for (const [name, body] of Object.entries(bad))
    assert.throws(
      () => designSidecar('ja-kinetic', undefined, write(`${name}.json`, body)),
      (e) => e.kind === 'failed' && e.step === 'design',
      name
    )
  assert.throws(
    () => designSidecar('ja-kinetic', undefined, path.join(dir, 'absent.json')),
    (e) => e.kind === 'failed'
  )
})

// ── WordPress stand, component version ───────────────────────────────────────────────────────

test('the WordPress stand mounts the one webroot into web and cli, and keeps cli out of `up`', () => {
  const y = wordpressCompose('pw', '/scratch/webroot', 'tr_')
  assert.equal(y.split("'/scratch/webroot:/var/www/html'").length - 1, 2)
  assert.match(y, /profiles: \['cli'\]/)
  assert.match(y, /WORDPRESS_TABLE_PREFIX: tr_/)
  assert.doesNotMatch(y, /ports:/)
})

test('the component version is read from the copy of the source, per platform', () => {
  const src = tmp()
  mkdirSync(path.join(src, 'joomla/cowork'), { recursive: true })
  mkdirSync(path.join(src, 'wordpress/cowork/claude-cowork'), { recursive: true })
  writeFileSync(
    path.join(src, 'joomla/cowork/pkg_claudecowork.xml'),
    '<extension><version>0.20.3</version></extension>'
  )
  writeFileSync(
    path.join(src, 'wordpress/cowork/claude-cowork/claude-cowork.php'),
    '<?php\n/**\n * Plugin Name: x\n * Version:     0.17.1\n */\n'
  )
  assert.equal(readCoworkVersion(src, 'joomla'), '0.20.3')
  assert.equal(readCoworkVersion(src, 'wordpress'), '0.17.1')
  assert.equal(readCoworkVersion(tmp(), 'joomla'), null)
})

// ── the report, the notes, the journal, the stage ────────────────────────────────────────────

const ROW = (over = {}) => ({
  template: 'ja-essence',
  platform: 'joomla',
  version: '1.0.0',
  shape: 'installer',
  status: 'delivered',
  capture: { entities: 148, slots: 1222, files: 4923, deterministic: true },
  gate: { ok: true },
  bind: { inspect: { slots: 1222 } },
  content: { http: 200, contents: 5 },
  seconds: 62,
  evidence: 'logs/joomla-ja-essence.log',
  ...over
})
const REPORT = (rows) => ({
  repo: 'o/r',
  baseline: 'HEAD',
  platforms: ['joomla'],
  releasesSeen: 94,
  cardReleases: 36,
  existing: [{ template: 'ja-spa', platform: 'joomla', version: '1.0.1' }],
  coworkVersions: { joomla: '0.20.3' },
  coworkSource: { head: 'abc', uncommittedPaths: 0 },
  rows,
  summary: summarize(rows)
})

test('the notes carry one row per report row and the totals, and the verifier catches a short table', () => {
  const rows = [
    ROW(),
    ROW({
      template: 'ja-kinetic',
      status: 'blocked',
      blocker: { step: 'design', message: 'needs a person' },
      capture: null,
      gate: null,
      bind: null,
      content: null
    })
  ]
  const report = REPORT(rows)
  const text = renderNotes(report)
  assert.deepEqual(
    checkNotes(`${text}\n| other | table | 1 |\n| ja-essence | 1.0.2 | 28/35 |\n`, report),
    [],
    'other tables in the notes are not rows of the report'
  )
  assert.match(text, /delivered 1, not delivered 1/)
  assert.match(text, /ja-kinetic\/joomla 1.0.0\*\* \(blocked\) — step `design`: needs a person/)
  const dropped = text
    .split('\n')
    .filter((l) => !l.startsWith('| ja-kinetic'))
    .join('\n')
  assert.match(checkNotes(dropped, report).join(), /1 rows|ja-kinetic/)
  assert.match(
    checkNotes(text.replace('delivered 1, not delivered 1', 'delivered 2, not delivered 0'), report).join(),
    /totals/
  )
})

test('the journal must have a valid date, an entry line and a Chạm ai line', () => {
  const ok =
    '- **Batch contracts** — Claude · #1 · `feat/batch-contracts` · 02/10/2026\n  **Chạm ai:** nobody yet\n'
  assert.deepEqual(checkJournal(ok, '2026-10-02-batch-content-contracts.md'), [])
  assert.match(checkJournal(ok, '2026-13-40-x.md').join(), /does not exist/)
  assert.match(checkJournal(ok, 'batch.md').join(), /not YYYY-MM-DD/)
  assert.match(checkJournal('just text', '2026-10-02-x.md').join(), /no entry line/)
  assert.match(checkJournal('- **a** — b · c · `d` · 02/10/2026', '2026-10-02-x.md').join(), /Chạm ai/)
})

test('only this task’s files may be staged', () => {
  const fine = [
    'packages/cms/tracy-quickstart-tools/batch-contracts.mjs',
    'packages/cms/tracy-quickstart-tools/test/batch-contracts.test.mjs',
    'packages/cms/tracy-wordpress-quickstart/scripts/capture-contract.mjs',
    'packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py',
    'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6/1.0.0/manifest.json',
    'packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6/1.0.0.design.json',
    'packages/cms/tracy-wordpress-quickstart/contracts/ja-nova/wp7/1.1.3/content-map.json',
    'tasks/batch-content-contracts.md',
    'tasks/nhat-ky/2026-10-02-batch-content-contracts.md'
  ]
  assert.deepEqual(stagedScopeProblems(fine), [])
  const bad = stagedScopeProblems([
    ...fine,
    'apps/tracy-web/src/server.js',
    'packages/cms/tracy-joomla-quickstart/contracts/../../x.json',
    'vendor/emdash/x'
  ])
  assert.equal(bad.length, 3)
})

// ── review round: run ownership, streamed I/O, discovery, archive bounds ─────────────────────

test('a card or setting that is public but unusable is a broken row, a missing setting included', async () => {
  const noSetting = release({
    id: 7,
    tag_name: 'quickstart/f/j6',
    assets: [asset('e.zip'), asset(CARD_FILE)]
  })
  const notJson = release({ id: 8, tag_name: 'quickstart/g/j6' })
  const read = async (a) => (a.name === CARD_FILE ? JSON.stringify(CARD) : 'not json')
  const { cards, broken } = await selectCards([noSetting, notJson], read, ['joomla'])
  assert.equal(cards.length, 0)
  assert.match(broken.find((b) => b.slug === 'f').reason, /without tracy_setting/)
  assert.match(broken.find((b) => b.slug === 'g').reason, /is not JSON/)
})

test('an unknown baseline stops discovery before any release is read', async () => {
  let called = false
  await assert.rejects(
    discover({ repo: 'o/r', baseline: 'no-such-ref-xyz', platform: 'all', api: async () => (called = true) }),
    /not a commit/
  )
  assert.equal(called, false)
  await assert.rejects(profilesAt('no-such-ref-xyz', 'joomla', 'ja-x'), /cannot read/)
  assert.deepEqual(await profilesAt('HEAD', 'joomla', 'no-such-design-xyz'), [])
  // ja-fresco/j6/1.0.1 holds only design-system-measurement.json: measured, never a profile.
  const fresco = await profilesAt('HEAD', 'joomla', 'ja-fresco')
  assert.ok(fresco.includes('1.0.2'))
  assert.ok(!fresco.includes('1.0.1'))
})

test('a file sink that cannot be written, or a stdin file that cannot be read, rejects instead of hanging or crashing', async () => {
  const dir = tmp()
  await assert.rejects(
    run('sh', ['-c', 'yes | head -c 100000'], { stdoutFile: path.join(dir, 'missing', 'out') }),
    (e) => e.io === true
  )
  await assert.rejects(
    run('cat', [], { stdinFile: path.join(dir, 'nope.sql'), timeoutMs: 10_000 }),
    (e) => e.io === true
  )
  await assert.rejects(
    must('s', 'cat', [], { stdinFile: path.join(dir, 'nope.sql'), timeoutMs: 10_000 }),
    /s: cat: i\/o failed/
  )
})

test('a file sink is capped while it streams, and uncapped when no cap is asked for', async () => {
  const dir = tmp()
  const out = path.join(dir, 'o')
  const capped = await run('sh', ['-c', 'head -c 100000 /dev/zero'], { stdoutFile: out, maxBytes: 1000 })
  assert.equal(capped.overflow, true)
  assert.ok(statSync(out).size <= 1000 + 65536)
  const free = await run('sh', ['-c', 'head -c 200000000 /dev/zero'], { stdoutFile: path.join(dir, 'f') })
  assert.equal(free.overflow, false)
  assert.equal(statSync(path.join(dir, 'f')).size, 200000000)
})

test('a stdin file is streamed to the command', async () => {
  const dir = tmp()
  writeFileSync(path.join(dir, 'in'), 'abc'.repeat(100000))
  const r = await run('wc', ['-c'], { stdinFile: path.join(dir, 'in') })
  assert.equal(Number(r.stdout.trim()), 300000)
})

test('downloadAsset caps the stream at the size the release states', async () => {
  const dir = tmp()
  let asked
  const api = async (_e, o) => {
    asked = o.maxBytes
    writeFileSync(o.stdoutFile, 'x'.repeat(20))
    return null
  }
  await assert.rejects(
    downloadAsset('o/r', { id: 1, size: 10 }, 'a.zip', path.join(dir, 'a.zip'), SHA, api),
    /does not match/
  )
  assert.equal(asked, 10)
  await assert.rejects(
    downloadAsset('o/r', { id: 1, size: undefined }, 'a.zip', path.join(dir, 'b.zip'), SHA, api),
    /no usable size/
  )
})

test('work under a cancel scope has its running command killed, and nothing new starts afterwards', async () => {
  const ac = new AbortController()
  const started = Date.now()
  const work = cancelScope.run({ signal: ac.signal }, async () => {
    const first = run('sleep', ['30'])
    await assert.rejects(first, (e) => e.cancelled === true)
    await assert.rejects(run('sleep', ['30']), (e) => e.cancelled === true)
    return 'stopped'
  })
  setTimeout(() => ac.abort(), 100)
  assert.equal(await work, 'stopped')
  assert.ok(Date.now() - started < 10_000)
  // Outside the scope, commands run as usual (teardown depends on it).
  assert.equal((await run('echo', ['ok'])).stdout.trim(), 'ok')
})

test('prepareScratch makes a fresh folder per run and refuses the repository and the artifacts', () => {
  const root = tmp()
  const base = path.join(root, 'base')
  const art = path.join(root, 'art')
  mkdirSync(art)
  const a = prepareScratch(base, art, 'tch-bc-x')
  const b = prepareScratch(base, art, 'tch-bc-x')
  assert.notEqual(a, b)
  assert.ok(readdirSync(base).filter((n) => n.startsWith('tch-bc-x-scratch-')).length === 2)
  assert.throws(() => prepareScratch(art, art, 'p'), /not be, or contain, --artifacts/)
  assert.throws(
    () => prepareScratch(root, art, 'p'),
    /not be, or contain/,
    'a base holding the artifacts is refused'
  )
  assert.throws(
    () => prepareScratch(path.join(art, 'sc'), art, 'p', path.join(art, 'sc', 'r.json')),
    /must not contain --report/
  )
  const under = prepareScratch(path.join(art, 'sc'), art, 'p', path.join(art, 'r.json'))
  assert.ok(under.startsWith(path.join(realpathSync(art), 'sc')), 'a scratch under the artifacts is allowed')
  const inRepo = path.join(process.cwd(), 'scratch-in-repo-must-not-appear')
  assert.throws(() => prepareScratch(inRepo, art, 'p'), /outside the repository/)
  assert.equal(existsSync(inRepo), false, 'a refused base is refused before anything is created')
  assert.throws(() => checkScratchBase(path.join(inRepo, 'a', 'b'), art), /outside the repository/)
  assert.equal(existsSync(inRepo), false)
  checkScratchBase(path.join(art, 'x', 'y'), art)
  assert.equal(existsSync(path.join(art, 'x')), false, 'judging a base creates nothing')
  assert.equal(existsSync(path.join(art)), true)
})

test('safeExtract refuses an archive with more entries than the cap, in both formats, before writing', async () => {
  assert.ok(MAX_ARCHIVE_ENTRIES >= 100_000)
  const dir = tmp()
  let r = await py(
    `import tarfile,io\nt=tarfile.open(${JSON.stringify(path.join(dir, 'many.tgz'))},'w:gz')\nfor n in range(20):\n  i=tarfile.TarInfo('d/f%d'%n);t.addfile(i,io.BytesIO(b''))\nt.close()`
  )
  assert.equal(r.code, 0, r.stderr)
  await assert.rejects(
    safeExtract(path.join(dir, 'many.tgz'), path.join(dir, 'o1'), 1024, 'extract', 10),
    /more than 10 entries/
  )
  assert.equal(existsSync(path.join(dir, 'o1/d')), false)
  r = await py(
    `import zipfile\nz=zipfile.ZipFile(${JSON.stringify(path.join(dir, 'many.zip'))},'w')\nfor n in range(20): z.writestr('f%d'%n,'')\nz.close()`
  )
  assert.equal(r.code, 0, r.stderr)
  await assert.rejects(
    safeExtract(path.join(dir, 'many.zip'), path.join(dir, 'o2'), 1024, 'extract', 10),
    /more than 10 entries/
  )
  assert.equal(existsSync(path.join(dir, 'o2/f0')), false)
  await safeExtract(path.join(dir, 'many.tgz'), path.join(dir, 'o3'), 1024, 'extract', 20)
  assert.equal(existsSync(path.join(dir, 'o3/d/f19')), true)
})

test('the notes check accepts a blocked row with no version (a broken card)', () => {
  const report = {
    rows: [
      {
        template: 'ja-x',
        platform: 'joomla',
        version: null,
        status: 'blocked',
        shape: null,
        evidence: null,
        seconds: 0,
        blocker: { step: 'discovery', message: 'bad card' }
      }
    ]
  }
  const text = '| ja-x | joomla | — | — | — | — | — | — | 0 | blocked | — |\n\ndelivered 0, not delivered 1'
  assert.deepEqual(checkNotes(text, report), [])
})

test('a command that closes its stdin early is reported, and a "successful" exit then fails the step', async () => {
  const big = 'x'.repeat(8 * 1024 * 1024)
  const r = await run('sh', ['-c', 'exit 0'], { input: big, timeoutMs: 10_000 })
  assert.equal(r.stdinClosedEarly, true)
  await assert.rejects(
    must('s', 'sh', ['-c', 'exit 0'], { input: big, timeoutMs: 10_000 }),
    /closed its input before it was all sent/
  )
  const dir = tmp()
  writeFileSync(path.join(dir, 'in'), big)
  await assert.rejects(
    must('s', 'true', [], { stdinFile: path.join(dir, 'in'), timeoutMs: 10_000 }),
    /closed its input/
  )
  const ok = await must('s', 'sh', ['-c', 'cat >/dev/null'], {
    stdinFile: path.join(dir, 'in'),
    timeoutMs: 10_000
  })
  assert.equal(ok.stdinClosedEarly, false)
  // A command that fails is still its own failure, with its own message.
  await assert.rejects(
    must('s', 'sh', ['-c', 'echo no >&2; exit 3'], { input: big, timeoutMs: 10_000 }),
    /exited 3/
  )
})

test('a zip whose central directory is out of proportion is refused before it is opened', async () => {
  const dir = tmp()
  const zip = path.join(dir, 'liar.zip')
  const r = await py(
    `import zipfile,struct\nz=zipfile.ZipFile(${JSON.stringify(zip)},'w')\nfor n in range(5): z.writestr('f%d'%n,'')\nz.close()\nb=bytearray(open(${JSON.stringify(zip)},'rb').read())\nstruct.pack_into('<I',b,len(b)-22+12,200*1024*1024)\nopen(${JSON.stringify(zip)},'wb').write(b)`
  )
  assert.equal(r.code, 0, r.stderr)
  await assert.rejects(
    safeExtract(zip, path.join(dir, 'o')),
    /central directory of \d+ bytes does not fit 5 entries/
  )
  assert.equal(existsSync(path.join(dir, 'o/f0')), false)
  writeFileSync(path.join(dir, 'junk.zip'), 'not a zip at all')
  await assert.rejects(safeExtract(path.join(dir, 'junk.zip'), path.join(dir, 'o2')), /not a zip|refused/)
})

test('teardownAll leaves a stand whose target did not stop, and names it', async () => {
  const calls = []
  const held = { name: 'tch-bc-test-held', down: async () => calls.push('held') }
  const free = { name: 'tch-bc-test-free', ownerStopped: true, down: async () => calls.push('free') }
  activeStands.set(held.name, held)
  activeStands.set(free.name, free)
  heldStands.add(held)
  try {
    const failures = await teardownAll()
    assert.deepEqual(calls, ['free'])
    assert.equal(failures.length, 1)
    assert.match(failures[0], /tch-bc-test-held kept up/)
  } finally {
    activeStands.delete(held.name)
    activeStands.delete(free.name)
    heldStands.delete(held)
  }
})

test('teardownAll keeps a stand whose owner never confirmed it stopped, on any path', async () => {
  const calls = []
  const s = { name: 'tch-bc-test-unowned', ownerStopped: false, down: async () => calls.push('down') }
  activeStands.set(s.name, s)
  try {
    const failures = await teardownAll()
    assert.deepEqual(calls, [])
    assert.match(failures[0], /tch-bc-test-unowned kept up/)
    s.ownerStopped = true
    assert.deepEqual(await teardownAll(), [])
    assert.deepEqual(calls, ['down'])
  } finally {
    activeStands.delete(s.name)
  }
})

test('R7 pool does not return while a sibling runs after one task failed, and signals the failure', async () => {
  const events = []
  let release
  const gate = new Promise((r) => (release = r))
  let told = 0
  const done = pool(
    ['a', 'b'],
    2,
    async (n) => {
      if (n === 'a') throw new Error('log constructor: ENOSPC')
      await gate
      events.push('sibling stopped')
    },
    { onError: () => told++ }
  ).then(
    () => events.push('pool resolved'),
    (e) => events.push(`pool rejected: ${e.message}`)
  )
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(events, [], 'pool must still be waiting for the sibling')
  assert.equal(told, 1)
  release()
  await done
  assert.deepEqual(events, ['sibling stopped', 'pool rejected: log constructor: ENOSPC'])
})

test('R5/R6 teardownAll takes no stand down while a target is in flight or a drain timed out', async () => {
  const calls = []
  const s = { name: 'tch-bc-test-live', ownerStopped: true, down: async () => calls.push('down') }
  activeStands.set(s.name, s)
  const p = new Promise(() => {})
  try {
    inflight.add(p)
    let failures = await teardownAll()
    assert.deepEqual(calls, [])
    assert.match(failures[0], /tch-bc-test-live kept up/)
    inflight.delete(p)
    runState.unsettled = true
    failures = await teardownAll()
    assert.deepEqual(calls, [])
    assert.equal(failures.length, 1)
    runState.unsettled = false
    failures = await teardownAll()
    assert.deepEqual(calls, ['down'])
  } finally {
    inflight.delete(p)
    runState.unsettled = false
    activeStands.delete(s.name)
  }
})

test('R7 a log that cannot be created fails only its own target, through processTarget, while a sibling runs', async () => {
  const artifacts = tmp('r7-log-')
  // The log of `broken` is a folder, so creating it fails the way a full disk would.
  mkdirSync(path.join(artifacts, 'logs', 'joomla-broken.log'), { recursive: true })
  const events = []
  let release
  const barrier = new Promise((r) => (release = r))
  const projects = {
    acquire: async () => {
      events.push('sibling holds a project')
      await barrier
      return 'tch-bc-test-01'
    },
    release: (name) => events.push(`released ${name}`)
  }
  const ctx = {
    projects,
    scratch: artifacts,
    cowork: { fingerprint: { checkout: path.join(artifacts, 'no-such-checkout'), head: 'x' } }
  }
  const o = { artifacts, timeoutN: 60, 'keep-scratch': true }
  const card = (slug) => ({
    slug,
    platform: 'joomla',
    tag: `${slug}-j6-1.0.0`,
    version: '1.0.0',
    shape: 'installer'
  })
  const done = pool([card('broken'), card('sibling')], 2, async (c) => {
    const row = await processTarget(c, o, ctx, 'verify')
    events.push(`${c.slug} settled ${row.status}`)
    return row
  }).then((rows) => {
    events.push('pool resolved')
    return rows
  })
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(
    events,
    ['sibling holds a project', 'broken settled failed'],
    'the broken target is a row, not a rejection'
  )
  release()
  const rows = await done
  assert.deepEqual(events.slice(2), ['released tch-bc-test-01', 'sibling settled failed', 'pool resolved'])
  assert.deepEqual(
    rows.map((r) => r.status),
    ['failed', 'failed']
  )
  assert.equal(rows[0].blocker.step, 'start')
  assert.match(rows[0].blocker.message, /EISDIR|illegal operation on a directory/)
  assert.equal(rows[1].blocker.step, 'cowork', 'the sibling ran on to its own result')
})

test('a component build folder carries the release-manifest script two levels above build.sh when the source has it', () => {
  const base = tmp('stage-build-')
  const src = path.join(base, 'src')
  mkdirSync(path.join(src, 'joomla/cowork'), { recursive: true })
  writeFileSync(path.join(src, 'joomla/cowork/build.sh'), 'node ../../scripts/release-manifest.mjs\n')
  const without = stageComponentBuild({ src }, 'joomla', path.join(base, 'a'))
  assert.equal(existsSync(path.join(without, 'build.sh')), true)
  assert.equal(
    existsSync(path.join(base, 'a/scripts')),
    false,
    'an older source has no script and none is invented'
  )
  mkdirSync(path.join(src, 'scripts'))
  writeFileSync(path.join(src, 'scripts/release-manifest.mjs'), '// manifest\n')
  const withScript = stageComponentBuild({ src }, 'joomla', path.join(base, 'b'))
  assert.equal(
    readFileSync(path.resolve(withScript, '../../scripts/release-manifest.mjs'), 'utf8'),
    '// manifest\n'
  )
  assert.equal(existsSync(path.resolve(withScript, '../../scripts/contract-assets.mjs')), false)
  writeFileSync(path.join(src, 'scripts/contract-assets.mjs'), '// assets\n')
  const withAssets = stageComponentBuild({ src }, 'joomla', path.join(base, 'c'))
  assert.equal(
    readFileSync(path.resolve(withAssets, '../../scripts/contract-assets.mjs'), 'utf8'),
    '// assets\n',
    'a slim-package source (0.24.55+) builds its contract assets with this script'
  )
  writeFileSync(path.join(src, 'scripts/joomla-own-media.mjs'), '// own media\n')
  const withOwnMedia = stageComponentBuild({ src }, 'joomla', path.join(base, 'd'))
  assert.equal(
    readFileSync(path.resolve(withOwnMedia, '../../scripts/joomla-own-media.mjs'), 'utf8'),
    '// own media\n',
    'a source from 0.24.58 on lists its own media with this script'
  )
})

test('--cache must be absolute', () => {
  const ok = { ...GOOD }
  assert.match(
    validateOptions('verify', { ...ok, cache: 'rel/cache' }).errors.join('\n'),
    /--cache must be an absolute path/
  )
})

test('a patch release is served by the nearest lower profile of its major (TCH #816)', () => {
  const root = tmp('bc-lower-')
  for (const v of ['1.0.0', '1.0.2', '1.1.3', '2.0.0']) {
    const dir = path.join(root, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-x/wp7', v)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'manifest.json'), '{}')
  }
  mkdirSync(path.join(root, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-x/wp7/1.1.4'), {
    recursive: true
  })
  assert.equal(nearestLowerProfile('wordpress', 'ja-x', '1.0.3', root), '1.0.2')
  assert.equal(
    nearestLowerProfile('wordpress', 'ja-x', '1.1.5', root),
    '1.1.3',
    'a version folder without a manifest is not a profile'
  )
  assert.equal(
    nearestLowerProfile('wordpress', 'ja-x', '1.0.0', root),
    null,
    'never the same or a higher version'
  )
  assert.equal(nearestLowerProfile('wordpress', 'ja-x', '3.0.0', root), null, 'never another major')
  assert.equal(nearestLowerProfile('wordpress', 'ja-x', 'next', root), null)
  assert.equal(nearestLowerProfile('wordpress', 'ja-y', '1.0.3', root), null)
})

test('a new profile is captured with --full-coverage; one in the tree with the rules it was made with', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'full-coverage-'))
  const at = path.join(dir, '1.0.2')
  assert.equal(capturesWithFullCoverage(at), true, 'no folder: a new profile')
  mkdirSync(at)
  writeFileSync(path.join(at, 'design-system-measurement.json'), '{}')
  assert.equal(capturesWithFullCoverage(at), true, 'measurements alone are not a profile')
  writeFileSync(path.join(at, 'manifest.json'), '{}')
  writeFileSync(path.join(at, 'content-map.json'), JSON.stringify({ slots: [{ key: 'a.0' }] }))
  assert.equal(capturesWithFullCoverage(at), false, 'captured before the rule: re-captured byte for byte')
  writeFileSync(
    path.join(at, 'content-map.json'),
    JSON.stringify({ slots: [{ key: 'a.0' }, { key: 'a.1', customize: 'keep' }] })
  )
  assert.equal(capturesWithFullCoverage(at), true, 'captured with the rule')
  rmSync(dir, { recursive: true, force: true })
})
