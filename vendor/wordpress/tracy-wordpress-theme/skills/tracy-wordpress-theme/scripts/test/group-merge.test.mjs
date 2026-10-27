// group-merge.mjs: groups' record and file changes come back into the main tree once, by record id and declared
// ownership; every refusal names its rule and leaves main untouched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { MergeError, applyMerge, loadManifest, mergeRecordFile, planMerge, recover, runMerge } from '../visual/group-merge.mjs'
import { testDir } from './lib/test-root.mjs'

const SPEC = 'tasks/site/spec'
const THEME = 'pkg/overlays/x'
const baseFiles = () => ({
  [`${SPEC}/content.json`]: JSON.stringify({ site: { name: 'Fake' }, pages: [{ path: '/a', title: 'A' }, { path: '/b', title: 'B' }, { path: '/c', title: 'C' }], posts: [], categories: [{ wpSlug: 'news', name: 'News' }] }, null, 2) + '\n',
  [`${SPEC}/sections.json`]: JSON.stringify({ acm: [], custom: [{ id: 's1', text: 'one' }, { id: 's2', text: 'two' }], other: [] }, null, 2) + '\n',
  'tasks/site/review.config.json': JSON.stringify({ visual: { exceptions: [{ kind: 'k', match: 'm', decision: 'D-1' }] }, mega: false }, null, 2) + '\n',
  [`${THEME}/theme.json`]: '{"version":3}\n',
  [`${THEME}/templates/page-a.html`]: '<!-- a -->\n',
  [`${THEME}/templates/page-b.html`]: '<!-- b -->\n',
  [`${THEME}/patterns/a/hero.php`]: '<?php // a\n'
})
const manifest = (over = {}) => ({
  schemaVersion: 1,
  roots: ['tasks/site', 'pkg/overlays/x'],
  records: [{ file: `${SPEC}/content.json`, adapter: 'content' }, { file: `${SPEC}/sections.json`, adapter: 'sections' }, { file: 'tasks/site/review.config.json', adapter: 'review-config' }],
  frozen: [`${THEME}/theme.json`],
  groups: { g1: { owns: [`${THEME}/templates/page-a.html`, `${THEME}/patterns/a/`] }, g2: { owns: [`${THEME}/templates/page-b.html`] } },
  ...over
})
const put = (root, files) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
}
const readJ = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'))
const snapshot = (root) => {
  const out = {}
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) go(p)
      else out[path.relative(root, p)] = readFileSync(p, 'utf8')
    }
  }
  go(root)
  return out
}
/** base, main (a copy), and one copy per group id */
function trees(ids = ['g1', 'g2']) {
  const dir = testDir('gm')
  const base = path.join(dir, 'base')
  put(base, baseFiles())
  const main = path.join(dir, 'main')
  cpSync(base, main, { recursive: true })
  const groups = {}
  for (const id of ids) {
    groups[id] = path.join(dir, id)
    cpSync(base, groups[id], { recursive: true })
  }
  return { dir, base, main, groups, report: path.join(dir, 'merge-report.json') }
}
const edit = (root, rel, fn) => writeFileSync(path.join(root, rel), JSON.stringify(fn(readJ(root, rel)), null, 2) + '\n')
const refusal = (t, o = {}) => {
  const before = snapshot(t.main)
  let err
  try {
    runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, ...o })
  } catch (e) {
    err = e
  }
  assert.ok(err instanceof MergeError, `expected a refusal, got ${err?.stack ?? 'success'}`)
  assert.deepEqual(snapshot(t.main), before, 'a refusal changes no byte of main')
  return err
}

test('disjoint groups: both records of ONE json file, both owned files survive; shared files stay', () => {
  const t = trees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/a' ? { ...p, title: 'A from g1' } : p)) }))
  edit(t.groups.g2, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/b' ? { ...p, title: 'B from g2' } : p)) }))
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: '<!-- a changed -->\n', [`${THEME}/patterns/a/new.php`]: '<?php // new\n' })
  put(t.groups.g2, { [`${THEME}/templates/page-b.html`]: '<!-- b changed -->\n' })
  edit(t.groups.g2, `${SPEC}/sections.json`, (s) => ({ ...s, custom: [...s.custom, { id: 's3', text: 'added by g2' }] }))
  const r = runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report })
  assert.equal(r.status, 'merged')
  const c = readJ(t.main, `${SPEC}/content.json`)
  assert.deepEqual(c.pages.map((p) => p.title), ['A from g1', 'B from g2', 'C'])
  assert.deepEqual(c.site, { name: 'Fake' })
  assert.deepEqual(readJ(t.main, `${SPEC}/sections.json`).custom.map((x) => x.id), ['s1', 's2', 's3'])
  assert.equal(readFileSync(path.join(t.main, `${THEME}/templates/page-a.html`), 'utf8'), '<!-- a changed -->\n')
  assert.equal(readFileSync(path.join(t.main, `${THEME}/patterns/a/new.php`), 'utf8'), '<?php // new\n')
  assert.equal(readFileSync(path.join(t.main, `${THEME}/templates/page-b.html`), 'utf8'), '<!-- b changed -->\n')
  assert.equal(readFileSync(path.join(t.main, `${THEME}/theme.json`), 'utf8'), '{"version":3}\n')
  assert.ok(!existsSync(path.join(t.main, '.group-merge')), 'the lock is gone')
  const rep = readJ(t.dir, 'merge-report.json')
  assert.deepEqual(rep.groups.map((g) => g.id), ['g1', 'g2'])
  assert.deepEqual(rep.groups[0].records, [{ file: `${SPEC}/content.json`, collection: 'pages', key: 'path=/a', change: 'changed' }])
  assert.deepEqual(rep.groups[1].records.map((x) => `${x.collection}:${x.key}:${x.change}`), ['pages:path=/b:changed', 'custom:id=s3:added'])
  assert.deepEqual(rep.groups[0].files.map((f) => f.path).sort(), [`${THEME}/patterns/a/new.php`, `${THEME}/templates/page-a.html`])
  assert.deepEqual(rep.noopGroups, [])
  assert.ok(rep.applied)
})

test('two groups on one record are refused by name — even when both propose the same value', () => {
  const t = trees()
  for (const id of ['g1', 'g2']) edit(t.groups[id], `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/c' ? { ...p, title: 'Same' } : p)) }))
  const e = refusal(t)
  assert.deepEqual(e.conflicts.map((c) => [c.rule, c.groups, c.collection, c.record]), [['record-conflict', ['g1', 'g2'], 'pages', 'path=/c']])
  assert.match(e.message, /pages path=\/c: touched by groups g1 \(changed\) and g2 \(changed\)/)
  const rep = readJ(t.dir, 'merge-report.json')
  assert.equal(rep.status, 'refused')
  assert.equal(rep.applied, false)
})

test('a change by one group and a removal by another of one record conflict; two adds of one new key conflict', () => {
  const t = trees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.filter((p) => p.path !== '/a') }))
  edit(t.groups.g2, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/a' ? { ...p, title: 'x' } : p)) }))
  assert.match(refusal(t).message, /path=\/a: touched by groups g1 \(removed\) and g2 \(changed\)/)
  const u = trees()
  for (const id of ['g1', 'g2']) edit(u.groups[id], `${SPEC}/sections.json`, (s) => ({ ...s, custom: [...s.custom, { id: 'new', text: id }] }))
  assert.match(refusal(u).message, /custom id=new: touched by groups g1 \(added\) and g2 \(added\)/)
})

test('a file the group does not own is refused: unowned, owned by another group, frozen', () => {
  const t = trees()
  put(t.groups.g1, { [`${THEME}/templates/page-b.html`]: 'g1 takes g2 file\n', [`${THEME}/theme.json`]: '{"version":4}\n', [`${THEME}/templates/stray.html`]: 'nobody\n' })
  const e = refusal(t)
  const by = Object.fromEntries(e.conflicts.map((c) => [c.file, c]))
  assert.equal(by[`${THEME}/templates/page-b.html`].rule, 'unowned-file')
  assert.equal(by[`${THEME}/templates/page-b.html`].owner, 'g2')
  assert.equal(by[`${THEME}/theme.json`].rule, 'frozen-file')
  assert.equal(by[`${THEME}/templates/stray.html`].rule, 'unowned-file')
  // deleting an unowned file is a change as well
  const u = trees()
  rmFile(u.groups.g2, `${THEME}/templates/page-a.html`)
  assert.equal(refusal(u).conflicts[0].rule, 'unowned-file')
})
import { rmSync } from 'node:fs'
const rmFile = (root, rel) => rmSync(path.join(root, rel))

test('a group that changed nothing is a successful, explicit no-op', () => {
  const t = trees()
  put(t.groups.g2, { [`${THEME}/templates/page-b.html`]: '<!-- b changed -->\n' })
  const r = runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report })
  assert.deepEqual(r.noopGroups, ['g1'])
  assert.deepEqual(r.groups.find((g) => g.id === 'g1'), { id: 'g1', changed: false, noop: true, files: [], records: [] })
  assert.equal(readFileSync(path.join(t.main, `${THEME}/templates/page-b.html`), 'utf8'), '<!-- b changed -->\n')
  // every group a no-op: merged, nothing written
  const u = trees()
  const before = snapshot(u.main)
  assert.deepEqual(runMerge({ manifest: manifest(), base: u.base, main: u.main, groups: u.groups, report: u.report }).noopGroups, ['g1', 'g2'])
  assert.deepEqual(snapshot(u.main), before)
  // an empty group set is invalid, not a no-op
  assert.throws(() => planMerge({ manifest: manifest(), base: u.base, main: u.main, groups: {} }), /no --group/)
})

test('site-wide fields of a record file are the coordinator\'s: a group changing them is refused', () => {
  const t = trees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, site: { name: 'Renamed' } }))
  const e = refusal(t)
  assert.equal(e.conflicts[0].rule, 'shared-changed')
  assert.match(e.message, /changed site, outside the merged collections/)
  const u = trees()
  edit(u.groups.g1, 'tasks/site/review.config.json', (c) => ({ ...c, mega: { items: 1 } }))
  assert.equal(refusal(u).conflicts[0].rule, 'shared-changed')
})

test('exceptions merge by their composite key; a record file deleted or a collection dropped is refused', () => {
  const t = trees()
  edit(t.groups.g1, 'tasks/site/review.config.json', (c) => ({ ...c, visual: { exceptions: [...c.visual.exceptions, { kind: 'k2', match: 'm2', decision: 'D-2' }] } }))
  edit(t.groups.g2, 'tasks/site/review.config.json', (c) => ({ ...c, visual: { exceptions: [...c.visual.exceptions, { kind: 'k3', match: 'm3', decision: 'D-3' }] } }))
  runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report })
  assert.deepEqual(readJ(t.main, 'tasks/site/review.config.json').visual.exceptions.map((x) => x.kind), ['k', 'k2', 'k3'])
  const u = trees()
  for (const id of ['g1', 'g2']) edit(u.groups[id], 'tasks/site/review.config.json', (c) => ({ ...c, visual: { exceptions: [...c.visual.exceptions, { kind: 'same', match: 'm', decision: `D-${id}` }] } }))
  assert.match(refusal(u).message, /exceptions kind=same match=m.*touched by groups g1 \(added\) and g2 \(added\)/)
  const v = trees()
  rmFile(v.groups.g1, `${SPEC}/sections.json`)
  assert.equal(refusal(v).conflicts[0].rule, 'shared-changed')
  const w = trees()
  edit(w.groups.g1, `${SPEC}/content.json`, ({ pages: _p, ...c }) => c)
  assert.equal(refusal(w).conflicts[0].rule, 'shared-changed')
})

test('records are matched by their key, never by position: a missing or repeated key, or a reorder, is refused', () => {
  const t = trees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: [...c.pages, { title: 'no path' }] }))
  assert.equal(refusal(t).conflicts[0].rule, 'record-key')
  const u = trees()
  edit(u.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: [...c.pages, { path: '/a', title: 'dup' }] }))
  assert.match(refusal(u).message, /path=\/a appears twice/)
  const v = trees()
  edit(v.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: [...c.pages].reverse() }))
  assert.equal(refusal(v).conflicts[0].rule, 'record-order')
  // a baseline that is itself ambiguous cannot be merged
  const w = trees()
  const dup = JSON.stringify({ pages: [{ path: '/a' }, { path: '/a' }] })
  for (const root of [w.base, w.main, w.groups.g1, w.groups.g2]) writeFileSync(path.join(root, `${SPEC}/content.json`), dup)
  edit(w.groups.g1, `${SPEC}/content.json`, (c) => ({ pages: [...c.pages, { path: '/z' }] }))
  assert.match(refusal(w).message, /\(baseline\): path=\/a appears twice/)
})

test('baseline drift: a file main changed since the baseline, and a second application of the same merge, are refused', () => {
  const t = trees()
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: '<!-- g1 -->\n' })
  put(t.main, { [`${THEME}/templates/page-a.html`]: '<!-- hand edit -->\n' })
  const e = refusal(t)
  assert.equal(e.conflicts[0].rule, 'baseline-drift')
  const u = trees()
  edit(u.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/a' ? { ...p, title: 'once' } : p)) }))
  runMerge({ manifest: manifest(), base: u.base, main: u.main, groups: u.groups, report: u.report })
  edit(u.main, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/b' ? { ...p, title: 'intervening' } : p)) }))
  const again = refusal(u)
  assert.equal(again.conflicts[0].rule, 'baseline-drift')
  assert.equal(readJ(u.main, `${SPEC}/content.json`).pages[1].title, 'intervening')
})

test('ownership is one owner per file: duplicate, nested, frozen, record and out-of-root claims fail the manifest', () => {
  const bad = (groups, extra = {}) => assert.throws(() => loadManifest(manifest({ groups, ...extra })), MergeError)
  const msg = (groups, extra = {}) => {
    try {
      loadManifest(manifest({ groups, ...extra }))
    } catch (e) {
      return e.message
    }
    return ''
  }
  assert.match(msg({ g1: { owns: [`${THEME}/templates/page-a.html`] }, g2: { owns: [`${THEME}/templates/page-a.html`] } }), /g1 and g2 both own/)
  assert.match(msg({ g1: { owns: [`${THEME}/templates/`] }, g2: { owns: [`${THEME}/templates/page-a.html`] } }), /g1 and g2 both own/)
  assert.match(msg({ g1: { owns: [`${THEME}/theme.json`] } }), /frozen/)
  assert.match(msg({ g1: { owns: [`${SPEC}/content.json`] } }), /record file/)
  assert.match(msg({ g1: { owns: ['elsewhere/x.html'] } }), /under none of the roots/)
  bad({})
  bad({ 'bad id': { owns: [] } })
  bad({ g1: { owns: ['/etc/passwd'] } })
  bad({ g1: { owns: ['../x'] } })
  bad({ g1: { owns: [`${THEME}/../../x`] } })
  bad({ g1: { owns: ['a\\b'] } })
  bad({ g1: { owns: [''] } })
  assert.throws(() => loadManifest({ ...manifest(), schemaVersion: 2 }), /schemaVersion/)
  assert.throws(() => loadManifest({ ...manifest(), extra: 1 }), /unknown key/)
  assert.throws(() => loadManifest(null), /not an object/)
  assert.throws(() => loadManifest(manifest({ roots: [] })), /roots must be a non-empty list/)
  assert.throws(() => loadManifest(manifest({ roots: ['../up'] })), /escapes/)
  assert.throws(() => loadManifest(manifest({ records: [{ file: `${SPEC}/content.json` }] })), /adapter/)
  assert.throws(() => loadManifest(manifest({ records: [{ file: `${SPEC}/content.json`, adapter: 'nope' }] })), /unknown adapter/)
})

test('symlinks, FIFOs and unsafe paths are refused before anything is read through them or written', () => {
  const t = trees()
  symlinkSync('/etc/hosts', path.join(t.groups.g1, `${THEME}/templates/link.html`))
  assert.equal(refusal(t).conflicts[0].rule, 'unsafe-path')
  const u = trees()
  const fifo = spawnSync('mkfifo', [path.join(u.groups.g2, `${THEME}/templates/pipe.html`)])
  assert.equal(fifo.status, 0)
  const e = refusal(u)
  assert.equal(e.conflicts[0].rule, 'unsafe-path')
  assert.match(e.message, /special file/)
  // a symlinked directory in the middle of a root
  const v = trees()
  rmSync(path.join(v.groups.g1, 'tasks/site/spec'), { recursive: true })
  symlinkSync(path.join(v.dir, 'base'), path.join(v.groups.g1, 'tasks/site/spec'))
  assert.equal(refusal(v).conflicts[0].rule, 'unsafe-path')
  // a symlinked record file
  const w = trees()
  rmFile(w.groups.g1, `${SPEC}/content.json`)
  symlinkSync(path.join(w.base, `${SPEC}/content.json`), path.join(w.groups.g1, `${SPEC}/content.json`))
  assert.equal(refusal(w).conflicts[0].rule, 'unsafe-path')
})

test('a write that fails half way rolls main back and publishes no successful report', () => {
  const t = trees()
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: '1\n', [`${THEME}/patterns/a/one.php`]: '2\n' })
  edit(t.groups.g2, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/b' ? { ...p, title: 'x' } : p)) }))
  const before = snapshot(t.main)
  assert.throws(() => runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, hooks: { afterWrite: (n) => { if (n === 2) throw new Error('disk full') } } }), /disk full/)
  assert.deepEqual(snapshot(t.main), before)
  assert.ok(!existsSync(t.report), 'no report for a partial result')
  // …and the merge can then be run again
  assert.equal(runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report }).status, 'merged')
})

test('a lock left by another merge or a crash refuses the merge; --recover restores main from the backups', () => {
  const t = trees()
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: 'g1\n' })
  mkdirSync(path.join(t.main, '.group-merge'))
  const e = refusal(t)
  assert.match(e.message, /another merge is running, or one was interrupted/)
  assert.equal(e.conflicts[0].rule, 'locked')
  rmSync(path.join(t.main, '.group-merge'), { recursive: true })
  // simulate a crash after the first write: run applyMerge with a hook that kills the rollback by throwing in recover path
  const plan = planMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups })
  const dir = path.join(t.main, '.group-merge')
  mkdirSync(dir)
  writeFileSync(path.join(dir, 'b0'), readFileSync(path.join(t.main, `${THEME}/templates/page-a.html`)))
  writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ files: [{ path: `${THEME}/templates/page-a.html`, backup: 'b0' }, { path: `${THEME}/templates/new.html`, backup: null }] }))
  writeFileSync(path.join(t.main, `${THEME}/templates/page-a.html`), 'half written\n')
  writeFileSync(path.join(t.main, `${THEME}/templates/new.html`), 'half\n')
  assert.deepEqual(recover(t.main), [`${THEME}/templates/page-a.html`, `${THEME}/templates/new.html`])
  assert.equal(readFileSync(path.join(t.main, `${THEME}/templates/page-a.html`), 'utf8'), '<!-- a -->\n')
  assert.ok(!existsSync(path.join(t.main, `${THEME}/templates/new.html`)))
  assert.ok(!existsSync(dir))
  assert.equal(plan.report.status, 'merged')
  assert.throws(() => recover(t.main), /nothing to recover/)
})

test('main changing between plan and write (a competing merge) is caught under the lock', () => {
  const t = trees()
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: 'g1\n' })
  const plan = planMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups })
  put(t.main, { [`${THEME}/templates/page-a.html`]: 'competitor\n' })
  assert.throws(() => applyMerge({ writes: plan.writes, main: t.main, expect: plan.report.baseline }), /main changed while the merge was planned/)
  assert.equal(readFileSync(path.join(t.main, `${THEME}/templates/page-a.html`), 'utf8'), 'competitor\n')
  assert.ok(!existsSync(path.join(t.main, '.group-merge')))
})

test('dry run writes the report but not main; json formatting and trailing newline of the baseline are kept', () => {
  const t = trees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => ({ ...c, pages: c.pages.map((p) => (p.path === '/a' ? { ...p, title: 'd' } : p)) }))
  const before = snapshot(t.main)
  const r = runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, dryRun: true })
  assert.equal(r.applied, false)
  assert.deepEqual(snapshot(t.main), before)
  runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report })
  const text = readFileSync(path.join(t.main, `${SPEC}/content.json`), 'utf8')
  assert.ok(text.endsWith('}\n'))
  assert.match(text, /\n {2}"site"/)
  // pure merge: a group that only re-indented the file changes nothing
  const out = mergeRecordFile({ file: 'f.json', collections: { pages: ['path'] }, baseText: '{"pages":[{"path":"/a"}]}', groups: [{ id: 'g1', text: '{ "pages": [ {"path": "/a"} ] }' }] })
  assert.equal(out.text, '{"pages":[{"path":"/a"}]}')
})

test('CLI: usage errors exit 2 before any mutation; a refusal exits 1; success exits 0', () => {
  const t = trees()
  const mf = path.join(t.dir, 'ownership.json')
  writeFileSync(mf, JSON.stringify(manifest()))
  const cli = (...a) => spawnSync(process.execPath, [new URL('../visual/group-merge.mjs', import.meta.url).pathname, ...a], { encoding: 'utf8' })
  const ok = ['--manifest', mf, '--base', t.base, '--main', t.main, '--group', `g1=${t.groups.g1}`, '--group', `g2=${t.groups.g2}`, '--report', t.report]
  const before = snapshot(t.main)
  for (const bad of [[], ['--nope'], ['--manifest'], ['--manifest', mf], ok.slice(0, -2), [...ok, '--base', t.base], [...ok, '--group', `g1=${t.groups.g1}`], [...ok.slice(0, 8), '--group', 'g1', ...ok.slice(10)], ['--manifest', path.join(t.dir, 'none.json'), ...ok.slice(2)], ['--recover'], ['--recover', '--main', t.main, '--base', t.base]]) {
    const r = cli(...bad)
    assert.equal(r.status, 2, `${bad.join(' ')}: ${r.stderr}`)
    assert.match(r.stderr, /group-merge:/)
  }
  assert.deepEqual(snapshot(t.main), before)
  assert.equal(cli(...ok.filter((_, i) => i < 6 || i > 9)).status, 2, 'no --group at all is a usage error')
  put(t.groups.g1, { [`${THEME}/templates/page-b.html`]: 'steal\n' })
  const refused = cli(...ok)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /\[unowned-file\]/)
  put(t.groups.g1, { [`${THEME}/templates/page-b.html`]: '<!-- b -->\n' })
  put(t.groups.g1, { [`${THEME}/templates/page-a.html`]: 'mine\n' })
  const done = cli(...ok)
  assert.equal(done.status, 0, done.stderr)
  assert.match(done.stdout, /merged 2 group\(s\): 0 record\(s\), 1 file\(s\); no-op: g2/)
})

// ── the identities of the real spec shapes, and the merge as one transaction ──
const REAL = {
  site: { name: 'Fake' },
  pages: [{ path: null, slug: 'about', locale: 'en', title: 'About' }, { path: '/team', slug: 'team', locale: 'en', title: 'Team' }, { slug: 'contact', locale: 'en', title: 'Contact' }, { file: 'x.html', title: 'X' }],
  posts: [{ slug: 'first', locale: 'en', title: 'First' }, { slug: 'second', locale: 'en', title: 'Second' }, { slug: 'first', locale: 'ru', title: 'Первый' }, { path: '/n/third', slug: 'third', title: 'Third', joomla: { articleId: '7' } }],
  categories: [{ wpSlug: 'news', locale: 'en', title: 'News' }, { wpSlug: 'news', locale: 'ru', title: 'Новости' }],
  authors: [{ id: 'u1', name: 'Una' }, { id: 'u2', name: 'Dos' }],
  images: [{ file: 'a.jpg', alt: 'a' }, { file: 'b.jpg', alt: 'b' }],
  archives: [{ path: '/news', view: 'category', title: 'News' }, { file: 'arch.html', view: 'home', title: 'Home' }]
}
function realTrees() {
  const t = trees()
  for (const root of [t.base, t.main, ...Object.values(t.groups)]) put(root, { [`${SPEC}/content.json`]: JSON.stringify(REAL, null, 2) + '\n' })
  return t
}
const setTitle = (field, pick, title) => (c) => ({ ...c, [field]: c[field].map((r) => (pick(r) ? { ...r, title } : r)) })

test('real spec shapes: a page without path, posts without path, one slug in two locales, authors, images, archives — each its own record', () => {
  const t = realTrees()
  edit(t.groups.g1, `${SPEC}/content.json`, (c) => setTitle('pages', (r) => r.path === null, 'About 1')(setTitle('posts', (r) => r.slug === 'first' && r.locale === 'en', 'First 1')(setTitle('categories', (r) => r.locale === 'ru', 'Новости 1')(setTitle('authors', (r) => r.id === 'u1', 'Una 1')(c)))))
  edit(t.groups.g2, `${SPEC}/content.json`, (c) => setTitle('pages', (r) => r.slug === 'contact', 'Contact 2')(setTitle('posts', (r) => r.locale === 'ru', 'Первый 2')(setTitle('categories', (r) => r.locale === 'en', 'News 2')(setTitle('images', (r) => r.file === 'b.jpg', 'b2')(setTitle('archives', (r) => r.file === 'arch.html', 'Home 2')(setTitle('posts', (r) => r.joomla?.articleId === '7', 'Third 2')(c)))))))
  const r = runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report })
  assert.equal(r.status, 'merged')
  const c = readJ(t.main, `${SPEC}/content.json`)
  assert.deepEqual(c.pages.map((p) => p.title), ['About 1', 'Team', 'Contact 2', 'X'])
  assert.deepEqual(c.posts.map((p) => p.title), ['First 1', 'Second', 'Первый 2', 'Third 2'])
  assert.deepEqual(c.categories.map((p) => p.title), ['News 2', 'Новости 1'])
  assert.deepEqual(c.authors.map((p) => p.title), ['Una 1', undefined])
  assert.deepEqual(c.images.map((p) => p.alt), ['a', 'b'])
  assert.equal(c.images[1].title, 'b2')
  assert.equal(c.archives[1].title, 'Home 2')
  const keys = r.groups.flatMap((g) => g.records.map((x) => `${g.id}:${x.collection}:${x.key}`))
  assert.ok(keys.includes('g1:categories:locale=ru wpSlug=news'), keys.join(' | '))
  assert.ok(keys.includes('g1:pages:locale=en slug=about'), keys.join(' | '))
})

test('real spec shapes: the same slug-only post, the same locale-less category slug or the same author id edited by two groups is a named conflict', () => {
  for (const [field, pick, rule] of [['posts', (r) => r.slug === 'second', 'slug=second'], ['pages', (r) => r.slug === 'contact', 'slug=contact'], ['authors', (r) => r.id === 'u2', 'id=u2'], ['categories', (r) => r.locale === 'ru', 'wpSlug=news']]) {
    const t = realTrees()
    edit(t.groups.g1, `${SPEC}/content.json`, (c) => setTitle(field, pick, 'one')(c))
    edit(t.groups.g2, `${SPEC}/content.json`, (c) => setTitle(field, pick, 'two')(c))
    const e = refusal(t)
    assert.ok(e.conflicts.some((x) => x.rule === 'record-conflict' && x.message.includes(rule) && x.groups.length === 2), `${field}: ${e.message}`)
  }
})

test('keys: a record with none of its identities is refused by name; alternatives and optional fields are validated in a manifest', () => {
  const t = realTrees()
  for (const root of [t.base, t.main, ...Object.values(t.groups)]) edit(root, `${SPEC}/content.json`, (c) => ({ ...c, pages: [...c.pages, { title: 'anonymous' }] }))
  edit(t.groups.g1, `${SPEC}/content.json`, setTitle('pages', (r) => r.path === '/team', 'Team 1'))
  assert.match(refusal(t).message, /\[4\] has none of the identities/)
  const ok = (k) => loadManifest(manifest({ records: [{ file: `${SPEC}/content.json`, collections: { pages: k } }] }))
  assert.deepEqual(ok([['locale?', 'path'], ['slug']]).records.get(`${SPEC}/content.json`).pages.map((a) => a.fields), [['locale?', 'path'], ['slug']])
  assert.deepEqual(ok(['kind', 'match']).records.get(`${SPEC}/content.json`).pages.map((a) => a.fields), [['kind', 'match']])
  for (const bad of [[['locale?']], [[]], [['a b']], [[1]], []]) assert.throws(() => ok(bad), /needs a dotted name and a key field/, JSON.stringify(bad))
})

const lockDir = (t) => path.join(t.main, '.group-merge')
const g1File = `${THEME}/templates/page-a.html`
test('a failing report publication rolls every file back and leaves no report and no lock', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n' })
  put(t.groups.g2, { [`${THEME}/templates/page-b.html`]: 'g2\n' })
  const before = snapshot(t.main)
  assert.throws(() => runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, hooks: { beforePublish: () => { throw new Error('report disk full') } } }), /report disk full/)
  assert.deepEqual(snapshot(t.main), before)
  assert.ok(!existsSync(t.report), 'the report of a rolled-back merge is withdrawn')
  assert.ok(!existsSync(lockDir(t)))
  assert.equal(runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report }).status, 'merged')
})

test('the lock is held until the report is written: recovery refuses a running merge, and never reverts files it then reports merged', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n' })
  let seen
  runMerge({
    manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report,
    hooks: { afterWrite: () => { seen = existsSync(lockDir(t)) && readJ(lockDir(t), 'journal.json').pid === process.pid } }
  })
  assert.ok(seen, 'the journal names the merge that owns the lock')
  // a live owner (another process) is refused, whatever the journal says it did
  const t2 = trees()
  put(t2.groups.g1, { [g1File]: 'g1\n' })
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'])
  try {
    const dir = lockDir(t2)
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: sleeper.pid, at: 'now', state: 'writing', files: [] }))
    assert.throws(() => recover(t2.main), /still running and owns/)
    assert.ok(existsSync(path.join(dir, 'journal.json')), 'the journal of a live merge is kept')
    // …and a merge started now finds the lock too
    assert.match(refusal(t2).message, /another merge is running/)
    sleeper.kill()
  } finally {
    sleeper.kill()
  }
})

test('a finished-but-unreleased journal only releases the lock; a half-done one also withdraws its own report, not another\'s', () => {
  const t = trees()
  const dir = lockDir(t)
  mkdirSync(dir)
  writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'complete', files: [{ path: g1File, backup: null }] }))
  assert.deepEqual(recover(t.main), [])
  assert.ok(existsSync(path.join(t.main, g1File)), 'a complete merge is not reverted')
  assert.ok(!existsSync(dir))
  mkdirSync(dir)
  writeFileSync(t.report, JSON.stringify({ mergeId: 'other' }))
  writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', mergeId: 'mine', report: t.report, files: [] }))
  recover(t.main)
  assert.ok(existsSync(t.report), 'another merge\'s report is not ours to remove')
  mkdirSync(dir)
  writeFileSync(t.report, JSON.stringify({ mergeId: 'mine' }))
  writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', mergeId: 'mine', report: t.report, files: [] }))
  recover(t.main)
  assert.ok(!existsSync(t.report))
})

test('a rollback that fails keeps the lock, the journal and the backups; --recover then finishes it', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n', [`${THEME}/patterns/a/one.php`]: 'one\n' })
  const e = (() => {
    try {
      runMerge({
        manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report,
        hooks: { afterWrite: (n) => { if (n === 2) { rmSync(path.join(lockDir(t), 'b1')); throw new Error('boom') } } }
      })
    } catch (err) {
      return err
    }
  })()
  assert.ok(e instanceof MergeError && e.conflicts.some((c) => c.rule === 'rollback-failed'), String(e))
  assert.match(e.message, /run --recover/)
  assert.ok(existsSync(lockDir(t)), 'the lock stays')
  assert.equal(readJ(lockDir(t), 'journal.json').state, 'rollback-failed')
  assert.ok(!existsSync(t.report))
  // a second merge is refused while the lock stands; recovery restores from the (re-supplied) backup
  assert.throws(() => applyMerge({ writes: new Map(), main: t.main }), /another merge is running/)
  writeFileSync(path.join(lockDir(t), 'b1'), '<!-- a -->\n')
  recover(t.main)
  assert.ok(!existsSync(lockDir(t)))
  assert.equal(readFileSync(path.join(t.main, g1File), 'utf8'), '<!-- a -->\n')
  assert.ok(!existsSync(path.join(t.main, `${THEME}/patterns/a/one.php`)))
})

const addTo = (field, rec) => (c) => ({ ...c, [field]: [...(c[field] ?? []), rec] })
const withAssets = (t) => {
  const seed = (c) => ({ ...c, images: [{ file: 'logo.png', original: 'img/a/logo.png', alt: 'A' }, { file: 'logo.png', original: 'img/b/logo.png', alt: 'B' }], assets: [{ file: 'deck.pdf', original: 'decks/deck.pdf', kind: 'document' }, { file: 'deck.pdf', original: 'decks/old/deck.pdf', kind: 'document' }] })
  for (const root of [t.base, t.main, ...Object.values(t.groups)]) edit(root, `${SPEC}/content.json`, seed)
  return t
}

test('images and assets: the source path is the identity — one file name from two folders is two records, and an asset edit merges', () => {
  const t = withAssets(realTrees())
  edit(t.groups.g1, `${SPEC}/content.json`, setTitle('images', (r) => r.original === 'img/a/logo.png', 'A1'))
  edit(t.groups.g2, `${SPEC}/content.json`, (c) => setTitle('images', (r) => r.original === 'img/b/logo.png', 'B2')({ ...c, assets: c.assets.map((a) => (a.original === 'decks/old/deck.pdf' ? { ...a, title: 'old' } : a)) }))
  assert.equal(runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report }).status, 'merged')
  const c = readJ(t.main, `${SPEC}/content.json`)
  assert.deepEqual(c.images.map((x) => x.title), ['A1', 'B2'])
  assert.deepEqual(c.assets.map((x) => x.title), [undefined, 'old'])
  // the same asset edited by two groups is a named conflict
  const u = withAssets(realTrees())
  for (const [id, v] of [['g1', 'x'], ['g2', 'y']]) edit(u.groups[id], `${SPEC}/content.json`, (c2) => ({ ...c2, assets: c2.assets.map((a) => (a.original === 'decks/deck.pdf' ? { ...a, title: v } : a)) }))
  assert.ok(refusal(u).conflicts.some((x) => x.rule === 'record-conflict' && x.collection === 'assets' && x.record.includes('original=decks/deck.pdf')))
})

test('one record under two identities: a page added by g1 with a path and by g2 with the same slug is a named conflict; so are unprovable adds', () => {
  // aliases: the existing page carries path and slug; g1 changes it, g2 adds a record that answers to its slug
  const t = realTrees()
  edit(t.groups.g1, `${SPEC}/content.json`, setTitle('pages', (r) => r.path === '/team', 'Team 1'))
  edit(t.groups.g2, `${SPEC}/content.json`, addTo('pages', { slug: 'team', locale: 'en', title: 'Team again' }))
  const e = refusal(t)
  assert.ok(e.conflicts.some((x) => /share the locale\?\+slug identity/.test(x.message)), e.message)
  // two additions keyed by different alternatives (path vs slug only) cannot be proved distinct: refused by name
  const u = realTrees()
  edit(u.groups.g1, `${SPEC}/content.json`, addTo('pages', { path: '/new', locale: 'en', title: 'New 1' }))
  edit(u.groups.g2, `${SPEC}/content.json`, addTo('pages', { slug: 'new', locale: 'en', title: 'New 2' }))
  const e2 = refusal(u)
  assert.ok(e2.conflicts.some((x) => x.rule === 'record-conflict' && /cannot be proved distinct/.test(x.message)), e2.message)
  // two different new pages under the SAME identity field are disjoint and merge
  const v = realTrees()
  edit(v.groups.g1, `${SPEC}/content.json`, addTo('pages', { path: '/n1', locale: 'en', title: 'N1' }))
  edit(v.groups.g2, `${SPEC}/content.json`, addTo('pages', { path: '/n2', locale: 'en', title: 'N2' }))
  assert.equal(runMerge({ manifest: manifest(), base: v.base, main: v.main, groups: v.groups, report: v.report }).status, 'merged')
  assert.deepEqual(readJ(v.main, `${SPEC}/content.json`).pages.slice(-2).map((p) => p.title), ['N1', 'N2'])
})

test('every unique identity holds over the complete result: same locale+slug under different paths, duplicates in one list, a collision with an unchanged record', () => {
  const content = `${SPEC}/content.json`
  // two groups add pages with different paths but one locale and slug: they compete for one WordPress identity
  const a = realTrees()
  edit(a.groups.g1, content, addTo('pages', { path: '/x/news', slug: 'news', locale: 'en', title: 'News 1' }))
  edit(a.groups.g2, content, addTo('pages', { path: '/y/news', slug: 'news', locale: 'en', title: 'News 2' }))
  const ea = refusal(a)
  assert.ok(ea.conflicts.some((x) => x.rule === 'record-conflict' && /share the locale\?\+slug identity locale=en slug=news/.test(x.message) && x.groups.join() === 'g1,g2'), ea.message)
  // the same slug in another locale is another record
  const b = realTrees()
  edit(b.groups.g1, content, addTo('pages', { path: '/x/news', slug: 'news', locale: 'en', title: 'News 1' }))
  edit(b.groups.g2, content, addTo('pages', { path: '/fr/news', slug: 'news', locale: 'fr', title: 'Actu' }))
  assert.equal(runMerge({ manifest: manifest(), base: b.base, main: b.main, groups: b.groups, report: b.report }).status, 'merged')
  // a group's own list with two records under one alias is refused by name
  const c = realTrees()
  edit(c.groups.g1, content, addTo('pages', { path: '/p1', slug: 'dup', locale: 'en', title: 'D1' }))
  edit(c.groups.g1, content, addTo('pages', { path: '/p2', slug: 'dup', locale: 'en', title: 'D2' }))
  assert.ok(refusal(c).conflicts.some((x) => x.rule === 'record-key' && /share the locale\?\+slug identity/.test(x.message)))
  // a changed record whose slug becomes one of an UNCHANGED record's
  const d = realTrees()
  edit(d.groups.g1, content, (j) => ({ ...j, pages: j.pages.map((r) => (r.path === '/team' ? { ...r, slug: 'contact' } : r)) }))
  edit(d.groups.g2, content, addTo('pages', { path: '/g2-only', locale: 'en', title: 'G2' }))
  assert.ok(refusal(d).conflicts.some((x) => /share the locale\?\+slug identity locale=en slug=contact/.test(x.message)))
  // …and another group's change colliding with an unchanged record is caught on the merged result, naming both groups
  const f = realTrees()
  edit(f.groups.g1, content, addTo('pages', { slug: 'later', locale: 'en', title: 'L' }))
  edit(f.groups.g2, content, (j) => ({ ...j, pages: [...j.pages, { path: '/zz', slug: 'later', locale: 'en', title: 'Z' }] }))
  assert.ok(refusal(f).conflicts.some((x) => x.groups?.join() === 'g1,g2' && /slug=later/.test(x.message)))
})

test('recovery is exclusive: a live recovery refuses a second one, an abandoned claim is taken over, and one journal is replayed once', () => {
  const t = trees()
  const dir = lockDir(t)
  mkdirSync(dir)
  writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', mergeId: 'm', report: null, files: [{ path: g1File, backup: null }] }))
  put(t.main, { [g1File]: 'half\n' })
  // another live recovery owns the claim (this very process is alive)
  mkdirSync(path.join(dir, 'recovering'))
  writeFileSync(path.join(dir, 'recovering', 'owner.json'), JSON.stringify({ pid: process.pid, at: 'now' }))
  assert.throws(() => recover(t.main), (e) => e instanceof MergeError && e.conflicts[0].rule === 'locked' && /already running/.test(e.message))
  assert.ok(existsSync(path.join(t.main, g1File)) && existsSync(dir), 'the refused recovery touched nothing')
  // its owner is gone: the claim is NOT taken over or renamed — the interrupted recovery's journal and backups stay for offline repair
  writeFileSync(path.join(dir, 'recovering', 'owner.json'), JSON.stringify({ pid: 999999999, at: 'then' }))
  assert.throws(() => recover(t.main), (e) => e instanceof MergeError && e.conflicts[0].rule === 'locked' && /interrupted.*offline|not taken over/.test(e.message))
  assert.ok(existsSync(path.join(dir, 'recovering', 'owner.json')) && existsSync(path.join(dir, 'journal.json')) && existsSync(path.join(t.main, g1File)), 'nothing renamed, nothing restored')
  assert.deepEqual(readdirSync(dir).sort(), ['journal.json', 'recovering'])
  // once a person has cleared the claim, one recovery replays the journal once
  rmSync(path.join(dir, 'recovering'), { recursive: true })
  assert.deepEqual(recover(t.main), [g1File])
  assert.ok(!existsSync(path.join(t.main, g1File)) && !existsSync(dir))
  // a second recovery after the first finished has nothing to do and says so
  assert.throws(() => recover(t.main), /nothing to recover/)
})

test('one owner from planning to publication: a dry run or refusal cannot interleave with a merge, nor publish over its report', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n' })
  let inner
  const r = runMerge({
    manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report,
    hooks: {
      afterPublish: () => {
        // the report is on disk, the lock is still held: a dry run (or a refusal) of another process is refused, writes nothing
        try { runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, dryRun: true }) } catch (e) { inner = e }
      }
    }
  })
  assert.equal(r.status, 'merged')
  assert.ok(inner instanceof MergeError && inner.conflicts[0].rule === 'locked', String(inner))
  assert.equal(readJ(path.dirname(t.report), path.basename(t.report)).mergeId, r.mergeId)
  assert.ok(!existsSync(`${t.report}.not-applied.json`))
  // a dry run against a held lock (a merge in flight, or a crash's leftover) is refused before it writes a byte
  const u = trees()
  mkdirSync(lockDir(u))
  writeFileSync(path.join(lockDir(u), 'journal.json'), JSON.stringify({ pid: process.pid, state: 'writing', files: [] }))
  for (const o of [{ dryRun: true }, {}]) assert.throws(() => runMerge({ manifest: manifest(), base: u.base, main: u.main, groups: u.groups, report: u.report, ...o }), (e) => e instanceof MergeError && e.conflicts[0].rule === 'locked')
  assert.ok(!existsSync(u.report) && existsSync(lockDir(u)))
  // the lock is released after a refusal and a dry run, whatever they wrote
  const v = trees()
  put(v.groups.g1, { [`${THEME}/templates/page-b.html`]: 'not mine\n' })
  assert.throws(() => runMerge({ manifest: manifest(), base: v.base, main: v.main, groups: v.groups, report: v.report }), /unowned-file/)
  assert.ok(!existsSync(lockDir(v)) && existsSync(v.report))
})

test('every planned input is rechecked before applying and before the commit: base, group, manifest or main drift rolls back with no merged report', () => {
  const drift = (mutate, expectRe, withManifestFile = false) => {
    const t = trees()
    put(t.groups.g1, { [g1File]: 'g1\n' })
    put(t.groups.g2, { [`${THEME}/templates/page-b.html`]: 'g2\n' })
    const mf = path.join(t.dir, 'ownership.json')
    writeFileSync(mf, JSON.stringify(manifest()))
    const before = snapshot(t.main)
    assert.throws(() => runMerge({ manifest: manifest(), ...(withManifestFile ? { manifestFile: mf } : {}), base: t.base, main: t.main, groups: t.groups, report: t.report, hooks: { afterWrite: (n) => { if (n === 1) mutate(t, mf) } } }), expectRe)
    const after = snapshot(t.main)
    delete after[`${THEME}/templates/page-new.html`] // the other writer's own file is not ours to remove
    assert.deepEqual(after, before, 'main restored')
    assert.ok(!existsSync(lockDir(t)) && !existsSync(t.report), 'no lock, no merged report')
  }
  drift((t) => put(t.base, { [`${THEME}/templates/page-a.html`]: 'base moved\n' }), /input changed.*before-commit.*baseline/)
  drift((t) => put(t.groups.g2, { [`${THEME}/templates/page-b.html`]: 'g2 moved\n' }), /input changed.*group g2/)
  drift((t) => put(t.main, { [`${THEME}/templates/page-new.html`]: 'hand edit\n' }), /input changed.*main/)
  drift((t, mf) => writeFileSync(mf, JSON.stringify(manifest({ frozen: [] }))), /--manifest .* changed/, true)
})

test('a report that did not commit never replaces an earlier complete one: refusals and dry runs write beside it, a failed merge restores it', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n' })
  assert.equal(runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report }).status, 'merged')
  const first = readFileSync(t.report, 'utf8')
  // a refusal (baseline drift: the same merge again) and a dry run leave the earlier report byte for byte
  assert.throws(() => runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report }), MergeError)
  assert.equal(readFileSync(t.report, 'utf8'), first)
  assert.ok(existsSync(`${t.report}.not-applied.json`), 'the refusal report is written beside')
  assert.equal(readJ(path.dirname(t.report), `${path.basename(t.report)}.not-applied.json`).applied, false)
  // a merge that fails while publishing restores the earlier complete report
  const u = trees()
  put(u.groups.g1, { [g1File]: 'g1\n' })
  writeFileSync(u.report, JSON.stringify({ mergeId: 'earlier', applied: true, status: 'merged' }))
  const before = readFileSync(u.report, 'utf8')
  assert.throws(() => runMerge({ manifest: manifest(), base: u.base, main: u.main, groups: u.groups, report: u.report, hooks: { beforePublish: () => { throw new Error('boom') } } }), /boom/)
  assert.equal(readFileSync(u.report, 'utf8'), before)
  assert.ok(!existsSync(lockDir(u)))
  // a crash after publishing: the published report IS the commit — recovery releases the lock and reverts nothing (below)
  const w = trees()
  put(w.groups.g1, { [g1File]: 'g1\n' })
  writeFileSync(w.report, JSON.stringify({ mergeId: 'earlier', applied: true }))
  const was = readFileSync(w.report, 'utf8')
  const d = lockDir(w)
  mkdirSync(d)
  writeFileSync(path.join(d, 'report.prev'), was)
  writeFileSync(w.report, JSON.stringify({ mergeId: 'mine', applied: true }))
  writeFileSync(path.join(d, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', mergeId: 'mine', report: w.report, reportBackup: true, files: [] }))
  assert.deepEqual(recover(w.main), [])
  assert.equal(readJ(path.dirname(w.report), path.basename(w.report)).mergeId, 'mine')
  // …but a crash BEFORE the publication (the journal's report is still the earlier one) gives the earlier report back
  const x = trees()
  const xd = lockDir(x)
  mkdirSync(xd)
  writeFileSync(x.report, JSON.stringify({ mergeId: 'earlier', applied: true }))
  writeFileSync(path.join(xd, 'report.prev'), readFileSync(x.report))
  writeFileSync(path.join(xd, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', mergeId: 'mine', report: x.report, reportBackup: true, files: [] }))
  recover(x.main)
  assert.equal(readJ(path.dirname(x.report), path.basename(x.report)).mergeId, 'earlier')
})

test('the commit boundary is the published report: a failure after it keeps files and report, the lock stays, recovery only releases it', () => {
  const t = trees()
  put(t.groups.g1, { [g1File]: 'g1\n' })
  const e = (() => {
    try {
      runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, hooks: { afterPublish: () => { throw new Error('disk gone') } } })
    } catch (err) {
      return err
    }
  })()
  assert.ok(e instanceof MergeError && e.conflicts[0].rule === 'committed-lock-kept', String(e))
  assert.equal(readFileSync(path.join(t.main, g1File), 'utf8'), 'g1\n', 'the files stay merged')
  const mergeId = readJ(path.dirname(t.report), path.basename(t.report)).mergeId
  assert.ok(existsSync(lockDir(t)))
  // another merge is refused while the lock stands; recovery (the owner is this process, which has finished) releases it and reverts nothing
  assert.throws(() => runMerge({ manifest: manifest(), base: t.base, main: t.main, groups: t.groups, report: t.report, dryRun: true }), (x) => x.conflicts[0].rule === 'locked')
  assert.deepEqual(recover(t.main), [])
  assert.equal(readFileSync(path.join(t.main, g1File), 'utf8'), 'g1\n')
  assert.equal(readJ(path.dirname(t.report), path.basename(t.report)).mergeId, mergeId)
  assert.ok(!existsSync(lockDir(t)))
})

test('recovery refuses every live owner, even one whose rollback failed; a manifest edited after it was parsed is refused', () => {
  const t = trees()
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'])
  try {
    const dir = lockDir(t)
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: sleeper.pid, state: 'rollback-failed', files: [] }))
    assert.throws(() => recover(t.main), /still running and owns/)
  } finally {
    sleeper.kill()
  }
  const u = trees()
  put(u.groups.g1, { [g1File]: 'g1\n' })
  const file = path.join(path.dirname(u.base), 'ownership.json')
  writeFileSync(file, JSON.stringify(manifest({ frozen: [] })))
  assert.throws(() => runMerge({ manifest: manifest(), manifestFile: file, base: u.base, main: u.main, groups: u.groups, report: u.report }), /changed after it was read/)
  assert.ok(!existsSync(lockDir(u)) && !existsSync(u.report))
  writeFileSync(file, JSON.stringify(manifest()))
  assert.equal(runMerge({ manifest: manifest(), manifestFile: file, base: u.base, main: u.main, groups: u.groups, report: u.report }).status, 'merged')
})

test('recovery reads nothing it should not: a FIFO or symlink journal, a backup name that leaves the lock, a linked report parent', () => {
  const t = trees()
  const dir = lockDir(t)
  mkdirSync(dir)
  // a journal that is a symlink is never followed
  writeFileSync(path.join(path.dirname(t.main), 'outside.json'), JSON.stringify({ pid: 999999999, state: 'writing', files: [] }))
  symlinkSync(path.join(path.dirname(t.main), 'outside.json'), path.join(dir, 'journal.json'))
  assert.throws(() => recover(t.main), /not readable/)
  assert.ok(existsSync(dir), 'the lock is kept')
  rmSync(path.join(dir, 'journal.json'))
  // a FIFO journal does not block
  if (spawnSync('mkfifo', [path.join(dir, 'journal.json')]).status === 0) {
    assert.throws(() => recover(t.main), /not readable/)
    rmSync(path.join(dir, 'journal.json'))
  }
  // a backup name is b<n> inside the lock — never a path
  for (const backup of ['../outside', '../../x', 'b0/../../y', '/etc/passwd']) {
    writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ pid: 999999999, state: 'writing', files: [{ path: g1File, backup }] }))
    assert.throws(() => recover(t.main), /not readable/, backup)
    assert.ok(existsSync(path.join(dir, 'journal.json')))
  }
  // the report's directory is a symlink: nothing is written through it
  const u = trees()
  put(u.groups.g1, { [g1File]: 'g1\n' })
  const real = path.join(path.dirname(u.base), 'real-out')
  mkdirSync(real)
  const link = path.join(path.dirname(u.base), 'link-out')
  symlinkSync(real, link)
  assert.throws(() => runMerge({ manifest: manifest(), base: u.base, main: u.main, groups: u.groups, report: path.join(link, 'r.json') }), (e) => e instanceof MergeError && e.conflicts[0].rule === 'unsafe-path')
  assert.deepEqual(readdirSync(real), [])
  assert.deepEqual(snapshot(u.main), snapshot(u.base))
  // a report path that is itself a symlink is refused before a lock is taken
  const v = trees()
  symlinkSync(path.join(real, 'x.json'), v.report)
  assert.throws(() => runMerge({ manifest: manifest(), base: v.base, main: v.main, groups: v.groups, report: v.report }), (e) => e instanceof MergeError && e.conflicts[0].rule === 'unsafe-path')
  assert.ok(!existsSync(lockDir(v)))
})

test('records and frozen paths outside every root are refused: an edit there would be a silent no-op', () => {
  assert.throws(() => loadManifest(manifest({ records: [{ file: 'elsewhere/content.json', adapter: 'content' }] })), /under none of the roots/)
  assert.throws(() => loadManifest(manifest({ frozen: ['elsewhere/theme.json'] })), /frozen elsewhere\/theme.json is under none of the roots/)
  assert.throws(() => loadManifest(manifest({ frozen: ['elsewhere/'] })), /under none of the roots/)
  assert.ok(loadManifest(manifest()))
})
