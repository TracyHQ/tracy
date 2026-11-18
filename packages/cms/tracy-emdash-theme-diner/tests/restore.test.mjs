// backup.sh → restore.sh round trip on disposable data, and restore's preflight on corrupt or
// foreign archives: nothing moves until the archive has been read, listed and its SQLite opened.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const Database = createRequire(path.join(ROOT, 'package.json'))('better-sqlite3')
const sh = (file, args, cwd = ROOT) => {
  const r = spawnSync(file, args, { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}
function site() {
  const d = mkdtempSync(path.join(tmpdir(), 'restore-'))
  mkdirSync(path.join(d, 'data'))
  mkdirSync(path.join(d, 'uploads'))
  const db = new Database(path.join(d, 'data/data.db'))
  db.exec("create table t(v text); insert into t values ('original')")
  db.close()
  writeFileSync(path.join(d, 'data/tracy-agent.token'), 'ec_pat_x')
  writeFileSync(path.join(d, 'data/seed-receipts.json'), '{"version":2}')
  writeFileSync(path.join(d, 'uploads/a.txt'), 'upload-a')
  return d
}
const rows = (d) => {
  const db = new Database(path.join(d, 'data/data.db'), { readonly: true })
  const r = db
    .prepare('select v from t')
    .all()
    .map((x) => x.v)
  db.close()
  return r
}
const restore = (d, archive) =>
  sh('bash', [path.join(ROOT, 'tools/restore.sh'), archive, path.join(d, 'data'), path.join(d, 'uploads')])
const noBeforeDirs = (d) =>
  assert.deepEqual(
    readdirSync(d).filter((n) => n.includes('before-restore')),
    []
  )
// A .tgz written member by member, in the order given: tar(1) chooses its own order and will not
// store a `..` member, and both matter to the two cases that use it. `null` content is a directory.
function tgz(file, entries) {
  const blocks = []
  for (const [name, content] of entries) {
    const body = Buffer.from(content ?? '')
    const head = Buffer.alloc(512)
    head.write(name, 0, 100)
    head.write(content === null ? '0000755\0' : '0000644\0', 100)
    head.write('0000000\0', 108)
    head.write('0000000\0', 116)
    head.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    head.write('00000000000\0', 136)
    head.write(content === null ? '5' : '0', 156)
    head.write('ustar\u000000', 257)
    head.write('        ', 148)
    const sum = head.reduce((a, b) => a + b, 0)
    head.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(head, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  writeFileSync(file, gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])))
}
// More listing than a pipe holds (64 KiB on Linux), all of it AFTER the line the preflight looks for.
const manyUploads = () =>
  Array.from({ length: 4000 }, (_, i) => [`./uploads/photo-${String(i).padStart(5, '0')}.jpg`, 'x'])

describe('backup → restore', () => {
  it('restores data.db, token, receipts and uploads; keeps the current state aside', () => {
    const d = site()
    const out = path.join(d, 'backups')
    const b = sh('bash', [
      path.join(ROOT, 'tools/backup.sh'),
      path.join(d, 'data'),
      path.join(d, 'uploads'),
      out
    ])
    assert.equal(b.code, 0, b.out)
    const archive = path.join(
      out,
      readdirSync(out).find((n) => n.endsWith('.tgz'))
    )
    const templateId = JSON.parse(readFileSync(path.join(ROOT, 'template.config.json'), 'utf8')).id
    assert.ok(path.basename(archive).startsWith(`${templateId}-`), archive)
    // the site moves on: a new row, an upload deleted, receipts changed
    const db = new Database(path.join(d, 'data/data.db'))
    db.exec("insert into t values ('after-backup')")
    db.close()
    rmSync(path.join(d, 'uploads/a.txt'))
    writeFileSync(path.join(d, 'data/seed-receipts.json'), '{}')
    const r = restore(d, archive)
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(rows(d), ['original'])
    assert.equal(readFileSync(path.join(d, 'uploads/a.txt'), 'utf8'), 'upload-a')
    assert.equal(readFileSync(path.join(d, 'data/seed-receipts.json'), 'utf8'), '{"version":2}')
    assert.equal(readFileSync(path.join(d, 'data/tracy-agent.token'), 'utf8'), 'ec_pat_x')
    const kept = readdirSync(d).filter((n) => n.startsWith('data.before-restore-'))
    assert.equal(kept.length, 1)
    const old = new Database(path.join(d, kept[0], 'data.db'), { readonly: true })
    assert.deepEqual(
      old
        .prepare('select v from t')
        .all()
        .map((x) => x.v),
      ['original', 'after-backup']
    )
    old.close()
  })
  it('refuses a file that is not a tar.gz; nothing moves', () => {
    const d = site()
    const bad = path.join(d, 'bad.tgz')
    writeFileSync(bad, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    const r = restore(d, bad)
    assert.notEqual(r.code, 0)
    assert.match(r.out, /not a readable/)
    assert.deepEqual(rows(d), ['original'])
    noBeforeDirs(d)
  })
  it('refuses an archive without data/data.db; nothing moves', () => {
    const d = site()
    const src = mkdtempSync(path.join(tmpdir(), 'arc-'))
    mkdirSync(path.join(src, 'data'))
    writeFileSync(path.join(src, 'data/other.txt'), 'x')
    const arc = path.join(d, 'foreign.tgz')
    assert.equal(sh('tar', ['-C', src, '-czf', arc, '.']).code, 0)
    const r = restore(d, arc)
    assert.notEqual(r.code, 0)
    assert.match(r.out, /no \.\/data\/data\.db/)
    assert.deepEqual(rows(d), ['original'])
    noBeforeDirs(d)
  })
  it('refuses an archive whose data.db is not SQLite; nothing moves', () => {
    const d = site()
    const src = mkdtempSync(path.join(tmpdir(), 'arc-'))
    mkdirSync(path.join(src, 'data'))
    writeFileSync(path.join(src, 'data/data.db'), 'this is not a database')
    const arc = path.join(d, 'garbage.tgz')
    assert.equal(sh('tar', ['-C', src, '-czf', arc, '.']).code, 0)
    const r = restore(d, arc)
    assert.notEqual(r.code, 0)
    assert.match(r.out, /not a valid SQLite database/)
    assert.deepEqual(rows(d), ['original'])
    noBeforeDirs(d)
  })
  it('refuses a truncated archive; nothing moves', () => {
    const d = site()
    const out = path.join(d, 'backups')
    sh('bash', [path.join(ROOT, 'tools/backup.sh'), path.join(d, 'data'), path.join(d, 'uploads'), out])
    const archive = path.join(
      out,
      readdirSync(out).find((n) => n.endsWith('.tgz'))
    )
    const bytes = readFileSync(archive)
    const cut = path.join(d, 'cut.tgz')
    writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length / 2)))
    const r = restore(d, cut)
    assert.notEqual(r.code, 0)
    assert.deepEqual(rows(d), ['original'])
    noBeforeDirs(d)
  })
  it('refuses to move aside a directory that holds a project, even when run from elsewhere', () => {
    const d = site()
    const out = path.join(d, 'backups')
    sh('bash', [path.join(ROOT, 'tools/backup.sh'), path.join(d, 'data'), path.join(d, 'uploads'), out])
    const archive = path.join(
      out,
      readdirSync(out).find((n) => n.endsWith('.tgz'))
    )
    // 🔒 DEEP ENOUGH THAT THE DEPTH GUARD IS NOT THE ONE THAT FIRES. This case is about the
    // "contains a project" refusal, and `restore.sh` checks depth FIRST: `[ "$depth" -lt 3 ]`.
    // On macOS `tmpdir()` resolves to `/private/var/folders/…` (depth 7) so the shallow guard never
    // fired and the test passed; on Linux it is `/tmp`, making `/tmp/tree-xxx` depth 2 — the depth
    // guard refuses, with a different message, and the assertion below can never match. The test was
    // green on every developer's Mac and red on every CI runner, for a reason that is about neither
    // the product nor the machine. One directory deeper and both platforms exercise the same guard.
    const tmproot = mkdtempSync(path.join(tmpdir(), 'tree-'))
    const tree = path.join(tmproot, 'holder', 'site')
    mkdirSync(path.join(tree, 'pkg-a'), { recursive: true })
    writeFileSync(path.join(tree, 'pkg-a/package.json'), '{}')
    const r = spawnSync(
      'bash',
      [path.join(ROOT, 'tools/restore.sh'), archive, tree, path.join(d, 'uploads')],
      { cwd: tmpdir(), encoding: 'utf8' }
    )
    assert.notEqual(r.status, 0)
    assert.match(r.stdout + r.stderr, /contains a project/)
    assert.deepEqual(readdirSync(tree), ['pkg-a'])
    assert.equal(existsSync(path.join(tree, 'pkg-a/package.json')), true)
    noBeforeDirs(d)
  })
  it('refuses dangerous data/uploads paths', () => {
    const d = site()
    const out = path.join(d, 'backups')
    sh('bash', [path.join(ROOT, 'tools/backup.sh'), path.join(d, 'data'), path.join(d, 'uploads'), out])
    const archive = path.join(
      out,
      readdirSync(out).find((n) => n.endsWith('.tgz'))
    )
    for (const bad of [
      '/tmp',
      '/private/tmp',
      '/Users',
      process.env.HOME,
      path.dirname(ROOT),
      ROOT,
      path.join(process.env.HOME, 'TracyHQ')
    ]) {
      // Whether the path exists is the MACHINE's business, not this test's: `~/TracyHQ` happens to
      // exist on the author's laptop and not on a fresh one. What restore owes is that it changes
      // nothing either way -- so compare existence before and after instead of demanding it be
      // there. Measured 2026-09-16 on a machine without it: the old assertion passed only because
      // restore.sh had just CREATED the directory, writing data.db and seed-receipts.json into the
      // home directory. That is the failure this case exists to catch, and it was catching it
      // backwards.
      const before = existsSync(bad)
      const r = sh('bash', [path.join(ROOT, 'tools/restore.sh'), archive, bad, path.join(d, 'uploads')])
      assert.notEqual(r.code, 0, bad)
      assert.match(r.out, /refusing to restore over/, bad)
      assert.equal(existsSync(bad), before, `${bad} must be left exactly as it was found`)
    }
    noBeforeDirs(d)
  })
  // 🔒 THE PREFLIGHT READS THE WHOLE LISTING (28/09/2026). `printf | grep -q` under `pipefail` failed
  // whenever grep matched before printf had written everything: always for a listing larger than a
  // pipe, and now and then for a small one on a busy CI runner, where the dangerous-paths case above
  // read "archive has no ./data/data.db" for a backup made a second earlier.
  it('restores a backup whose listing is larger than a pipe', () => {
    const d = site()
    const arc = path.join(d, 'big.tgz')
    tgz(arc, [
      ['./', null],
      ['./data/', null],
      ['./data/data.db', readFileSync(path.join(d, 'data/data.db'))],
      ['./uploads/', null],
      ...manyUploads()
    ])
    const r = restore(d, arc)
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(rows(d), ['original'])
    assert.equal(readdirSync(path.join(d, 'uploads')).length, 4000)
  })
  it('refuses a `..` member early in a listing larger than a pipe; nothing moves', () => {
    const d = site()
    const arc = path.join(d, 'dotdot.tgz')
    // data.db LAST, so the first check reads the whole listing and passes: what is left to catch
    // the `..` is the second check, which matches on the fourth line of 4000.
    tgz(arc, [
      ['./', null],
      ['./data/', null],
      ['./data/../../escaped.txt', 'x'],
      ['./uploads/', null],
      ...manyUploads(),
      ['./data/data.db', readFileSync(path.join(d, 'data/data.db'))]
    ])
    const r = restore(d, arc)
    assert.notEqual(r.code, 0)
    assert.match(r.out, /contains a path with \.\./)
    assert.deepEqual(rows(d), ['original'])
    assert.equal(existsSync(path.join(path.dirname(d), 'escaped.txt')), false)
    noBeforeDirs(d)
  })
})
