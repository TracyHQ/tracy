import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { globToRegExp, parseNameStatus } from '../lib/affected.mjs'
import { makeGit, treeFingerprint } from '../lib/git.mjs'
import { cli, tmpDir } from './helpers.mjs'

const ALL = ['static', 'unit', 'api', 'infra', 'ui', 'flows', 'harness', 'cms', 'mail', 'related']

async function makeRepo() {
  const dir = await tmpDir('repo')
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.test',
        '-c',
        'commit.gpgsign=false',
        ...args
      ],
      { encoding: 'utf8' }
    ).trim()
  git('init', '-q')
  const write = async (rel, text) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
    await fs.writeFile(path.join(dir, rel), text)
  }
  await write('apps/tracy-web/src/lib/session.js', '1')
  await write('old/name.txt', 'renamed content that is long enough to be detected as a rename')
  await write('keep.md', 'k')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  return { dir, git, write, base }
}

async function affected(repo, extra = [], overrides = {}) {
  const inventoryDir = overrides.inventoryDir ?? (await tmpDir('inventory'))
  const layersDir = await tmpDir('no-layers')
  return cli(['affected', '--base', repo.base, '--head', 'HEAD', ...extra], {
    git: makeGit(repo.dir),
    layersDir,
    inventoryDir,
    ...overrides
  })
}

const MAP = {
  schema_version: '1',
  rules: [
    {
      id: 'session',
      paths: ['apps/tracy-web/src/lib/session.js'],
      layers: ['api', 'flows'],
      reason: 'session cookie'
    },
    { id: 'docs', paths: ['**/*.md'], layers: ['static'], reason: 'docs gate' },
    { id: 'moved', paths: ['new/**', 'old/**'], layers: ['infra'], reason: 'moved tree' }
  ]
}

test('glob matching: ** crosses directories, * stays in one segment', () => {
  assert.ok(globToRegExp('a/**/b.js').test('a/b.js'))
  assert.ok(globToRegExp('a/**/b.js').test('a/x/y/b.js'))
  assert.ok(globToRegExp('a/*.js').test('a/b.js'))
  assert.ok(!globToRegExp('a/*.js').test('a/x/b.js'))
  assert.ok(globToRegExp('pkg/**').test('pkg/deep/file'))
  assert.ok(!globToRegExp('a.js').test('abjs'))
})

test('git name-status parser is NUL-delimited and rejects garbage', () => {
  assert.deepEqual(parseNameStatus('M\0a b.js\0D\0dir/with\nnewline.txt\0'), [
    'a b.js',
    'dir/with\nnewline.txt'
  ])
  assert.throws(() => parseNameStatus('Z\0x\0'), /unparseable/)
  assert.throws(() => parseNameStatus('M\0'), /unparseable/)
})

test('affected maps changed paths to layers and prints which path pulled each in', async () => {
  const repo = await makeRepo()
  await repo.write('apps/tracy-web/src/lib/session.js', '2')
  repo.git('commit', '-qam', 'change session')
  const inventoryDir = await tmpDir('inventory')
  await fs.writeFile(path.join(inventoryDir, 'affected-map.json'), JSON.stringify(MAP))
  const r = await affected(repo, [], { inventoryDir })
  assert.equal(r.code, 3, r.err)
  assert.match(
    r.out,
    /layer api:\n\s+- apps\/tracy-web\/src\/lib\/session\.js \(rule session: session cookie\)/
  )
  assert.match(r.out, /layer flows:/)
  assert.doesNotMatch(r.out, /layer ui:/)
})

test('an unmapped path widens scope to every layer (never "no tests")', async () => {
  const repo = await makeRepo()
  await repo.write('apps/tracy-web/src/lib/session.js', '2')
  await repo.write('mystery/file.bin', 'x')
  repo.git('add', '.')
  repo.git('commit', '-qm', 'two changes')
  const inventoryDir = await tmpDir('inventory')
  await fs.writeFile(path.join(inventoryDir, 'affected-map.json'), JSON.stringify(MAP))
  const r = await affected(repo, [], { inventoryDir })
  assert.equal(r.code, 3, 'selected layers are run; absent ones are MISSING, never passed')
  assert.match(r.out, /unmapped path widens scope to all layers: mystery\/file\.bin/)
  for (const layer of ALL) assert.match(r.out, new RegExp(`layer ${layer}:`), layer)
})

test('a rename pulls in both the old and the new path', async () => {
  const repo = await makeRepo()
  await fs.mkdir(path.join(repo.dir, 'new'))
  repo.git('mv', 'old/name.txt', 'new/name.txt')
  repo.git('commit', '-qm', 'rename')
  const inventoryDir = await tmpDir('inventory')
  await fs.writeFile(
    path.join(inventoryDir, 'affected-map.json'),
    JSON.stringify({
      ...MAP,
      rules: [
        { id: 'old', paths: ['old/**'], layers: ['cms'], reason: 'old side' },
        { id: 'new', paths: ['new/**'], layers: ['mail'], reason: 'new side' }
      ]
    })
  )
  const r = await affected(repo, [], { inventoryDir })
  assert.match(r.out, /layer cms:/)
  assert.match(r.out, /layer mail:/)
})

test('missing map falls back to all layers and says why', async () => {
  const repo = await makeRepo()
  await repo.write('keep.md', 'changed')
  repo.git('commit', '-qam', 'doc')
  const r = await affected(repo)
  assert.equal(r.code, 3)
  assert.match(r.out, /affected-map\.json is absent/)
  for (const layer of ALL) assert.match(r.out, new RegExp(`layer ${layer}:`))
})

test('invalid or incompatible map is an error (exit 2), not an empty selection', async () => {
  const repo = await makeRepo()
  await repo.write('keep.md', 'changed')
  repo.git('commit', '-qam', 'doc')
  for (const content of [
    '{',
    JSON.stringify({
      schema_version: '1',
      rules: [{ id: 'x', paths: ['a'], layers: ['nope'], reason: 'r' }]
    }),
    JSON.stringify({ rules: [] }),
    '[]'
  ]) {
    const inventoryDir = await tmpDir('inventory')
    await fs.writeFile(path.join(inventoryDir, 'affected-map.json'), content)
    const r = await affected(repo, [], { inventoryDir })
    assert.equal(r.code, 2, content)
    assert.doesNotMatch(r.out, /layer /)
  }
})

test('unresolvable revisions fail closed; option-like refs are rejected before git runs', async () => {
  const repo = await makeRepo()
  const missing = await cli(
    ['affected', '--base', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', '--head', 'HEAD'],
    { git: makeGit(repo.dir), layersDir: await tmpDir('l'), inventoryDir: await tmpDir('i') }
  )
  assert.equal(missing.code, 2)
  assert.match(missing.err, /cannot resolve/)
  for (const ref of ['--output=/tmp/x', '-p', '--help']) {
    const r = await cli(['affected', '--base', ref, '--head', 'HEAD'], { git: makeGit(repo.dir) })
    assert.equal(r.code, 2, ref)
  }
})

test('an unchanged range selects nothing and says the diff was empty', async () => {
  const repo = await makeRepo()
  const r = await affected(repo)
  assert.equal(r.code, 0)
  assert.match(r.out, /0 changed path/)
  assert.match(r.out, /no layer selected/)
})

test('affected runs the selected layers that exist and reports the others missing', async () => {
  const repo = await makeRepo()
  await repo.write('keep.md', 'changed')
  repo.git('commit', '-qam', 'doc')
  const inventoryDir = await tmpDir('inventory')
  await fs.writeFile(
    path.join(inventoryDir, 'affected-map.json'),
    JSON.stringify({
      schema_version: '1',
      rules: [{ id: 'd', paths: ['**/*.md'], layers: ['static', 'api'], reason: 'docs' }]
    })
  )
  const r = await affected(repo, [], { inventoryDir })
  assert.equal(r.code, 3)
  assert.match(r.out, /static: MISSING/)
  assert.match(r.out, /api: MISSING/)
})

test('treeFingerprint follows content: edits, new files and deletions change it, a commit does not', async () => {
  const repo = await makeRepo()
  const fp = () => treeFingerprint(makeGit(repo.dir), repo.dir)
  const clean = await fp()
  assert.match(clean, /^[0-9a-f]{64}$/)
  assert.equal(await fp(), clean)
  await repo.write('apps/tracy-web/src/lib/session.js', '2')
  const edited = await fp()
  assert.notEqual(edited, clean, 'an unstaged edit changes the fingerprint')
  repo.git('add', '.')
  repo.git('commit', '-q', '-m', 'commit the edit')
  assert.equal(await fp(), edited, 'committing the same content keeps it')
  await repo.write('untracked.txt', 'x')
  const added = await fp()
  assert.notEqual(added, edited, 'an untracked file changes it')
  await fs.rm(path.join(repo.dir, 'keep.md'))
  assert.notEqual(await fp(), added, 'a deleted tracked file changes it')
  await assert.rejects(
    treeFingerprint(makeGit(path.join(repo.dir, 'nope')), repo.dir),
    /cannot list the tree/
  )
})
