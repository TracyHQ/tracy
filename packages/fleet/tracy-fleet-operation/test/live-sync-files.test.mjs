/**
 * "Sync from live", the files half (`scripts/lib/live_sync.py files`, plan
 * tasks/ke-hoach-dong-bo-tu-live.md §3.2): three commits of a site's webroot repo — the live site as
 * last read (base), the copy (ours), the live site as read now (theirs) — merged into one tree, with
 * git plumbing only. Runs everywhere: git and python3, no docker.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-files.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ENGINE = join(here, '..', 'scripts', 'lib', 'live_sync.py')

const root = mkdtempSync(join(tmpdir(), 'live-sync-files-'))
after(() => rmSync(root, { recursive: true, force: true }))
const REPO = join(root, 'repo.git')
execFileSync('git', ['init', '--quiet', '--bare', REPO])

const git = (args, opts = {}) =>
  execFileSync('git', ['-c', 'gc.auto=0', `--git-dir=${REPO}`, ...args], { encoding: 'utf8', ...opts }).trim()

let snapshots = 0
/** A commit whose tree is exactly `files` (path → string or Buffer). */
function commit(files) {
  const work = join(root, `w${++snapshots}`)
  mkdirSync(work)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true })
    writeFileSync(join(work, path), body)
  }
  const env = { ...process.env, GIT_INDEX_FILE: join(root, `index${snapshots}`) }
  git([`--work-tree=${work}`, 'add', '-A', '-f'], { env })
  const tree = git(['write-tree'], { env })
  return git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit-tree', tree, '-m', `s${snapshots}`])
}

function merge(base, ours, theirs, { platform = 'joomla', decisions, prefer } = {}) {
  const args = [
    ENGINE,
    'files',
    '--repo',
    REPO,
    '--base',
    base,
    '--ours',
    ours,
    '--theirs',
    theirs,
    '--platform',
    platform
  ]
  if (prefer) args.push('--prefer', prefer)
  if (decisions) {
    const file = join(root, `decisions${++snapshots}.json`)
    writeFileSync(file, JSON.stringify(decisions))
    args.push('--decisions', file)
  }
  const done = spawnSync('python3', args, { encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout.trim().split('\n').pop())
}

const read = (tree, path) => {
  const done = spawnSync('git', [`--git-dir=${REPO}`, 'cat-file', 'blob', `${tree}:${path}`], {
    encoding: 'utf8'
  })
  return done.status === 0 ? done.stdout : null
}

const CONFIG = (settings) =>
  `<?php\nclass JConfig {\n${Object.entries(settings)
    .map(([k, v]) => `\tpublic $${k} = ${v};`)
    .join('\n')}\n}\n`

test('each side keeps what only it changed; a file both changed in different places merges', () => {
  const lines = (n, edit = {}) =>
    Array.from({ length: n }, (_, i) => edit[i] ?? `line ${i}`).join('\n') + '\n'
  const base = commit({
    'templates/t4/css/custom.css': lines(20),
    'index.php': '<?php // live\n',
    'images/old.png': 'png-old',
    'media/gone.js': 'x'
  })
  const ours = commit({
    'templates/t4/css/custom.css': lines(20, { 2: '.btn { color: red } /* Tracy */' }),
    'index.php': '<?php // live\n',
    'images/old.png': 'png-old',
    'media/gone.js': 'x',
    'templates/t4/css/tracy-fix.css': '.fix{}'
  })
  const theirs = commit({
    'templates/t4/css/custom.css': lines(20, { 17: '.nav { gap: 2px } /* customer */' }),
    'index.php': '<?php // live, edited by the customer\n',
    'images/old.png': 'png-old',
    'images/new.png': 'png-new'
  })
  const answer = merge(base, ours, theirs)
  assert.deepEqual(answer.conflicts, [])
  const css = read(answer.tree, 'templates/t4/css/custom.css')
  assert.match(css, /Tracy/)
  assert.match(css, /customer/)
  assert.equal(read(answer.tree, 'index.php'), '<?php // live, edited by the customer\n')
  assert.equal(read(answer.tree, 'images/new.png'), 'png-new')
  assert.equal(read(answer.tree, 'templates/t4/css/tracy-fix.css'), '.fix{}')
  assert.equal(read(answer.tree, 'media/gone.js'), null, 'deleted on the live site, untouched on the copy')
})

test('the same lines changed on both sides are a conflict: the copy stays until a decision', () => {
  const base = commit({ 'a.css': 'a {}\n' })
  const ours = commit({ 'a.css': 'a { color: red }\n' })
  const theirs = commit({ 'a.css': 'a { color: blue }\n' })
  const first = merge(base, ours, theirs)
  assert.equal(first.conflicts.length, 1)
  const [conflict] = first.conflicts
  assert.equal(conflict.id, 'file:a.css')
  assert.equal(conflict.reason, 'both-changed')
  assert.equal(read(first.tree, 'a.css'), 'a { color: red }\n')
  const draft = git(['cat-file', 'blob', conflict.draft])
  assert.match(draft, /<<<<<<< ours/)
  const second = merge(base, ours, theirs, { decisions: { 'file:a.css': 'theirs' } })
  assert.deepEqual(second.conflicts, [])
  assert.equal(read(second.tree, 'a.css'), 'a { color: blue }\n')
})

test('a binary file, or a file one side deleted and the other changed, is a conflict', () => {
  const base = commit({ 'logo.png': Buffer.from([0, 1, 2]), 'old.php': 'a' })
  const ours = commit({ 'logo.png': Buffer.from([0, 1, 3]), 'old.php': 'b' })
  const theirs = commit({ 'logo.png': Buffer.from([0, 1, 4]) })
  const answer = merge(base, ours, theirs)
  assert.deepEqual(
    answer.conflicts.map((c) => [c.id, c.reason]),
    [
      ['file:logo.png', 'binary'],
      ['file:old.php', 'delete-modify']
    ]
  )
  assert.equal(read(answer.tree, 'old.php'), 'b')
})

test("Tracy's own files keep the copy's version whatever the live site carries", () => {
  const base = commit({ 'components/com_claudecowork/cowork.php': 'v1' })
  const ours = commit({ 'components/com_claudecowork/cowork.php': 'v2' })
  const theirs = commit({ 'components/com_claudecowork/cowork.php': 'v1-patched' })
  const answer = merge(base, ours, theirs)
  assert.deepEqual(answer.conflicts, [])
  assert.equal(read(answer.tree, 'components/com_claudecowork/cowork.php'), 'v2')
  // …even when the copy never touched it.
  const untouched = merge(base, base, theirs)
  assert.equal(read(untouched.tree, 'components/com_claudecowork/cowork.php'), 'v1')
})

test("configuration.php merges setting by setting; the environment's settings stay the copy's", () => {
  const live = {
    host: "'localhost'",
    password: "'live-secret'",
    db: "'live_db'",
    live_site: "''",
    secret: "'live-signing'",
    force_ssl: '2',
    sitename: "'Shop'",
    MetaDesc: "'old'",
    MetaKeys: "''",
    offset: "'UTC'"
  }
  const copy = {
    ...live,
    host: "'db'",
    password: "'copy-secret'",
    db: "'joomla'",
    live_site: "'https://shop-com.tracy.ai'",
    secret: "'fresh'",
    force_ssl: '2',
    MetaKeys: "'tracy, seo'"
  }
  const now = {
    ...live,
    password: "'rotated-live'",
    sitename: "'Shop & Co'",
    MetaDesc: "'new description'",
    MetaKeys: "'customer, keys'",
    debug: 'true'
  }
  delete now.offset
  const base = commit({ 'configuration.php': CONFIG(live) })
  const ours = commit({ 'configuration.php': CONFIG(copy) })
  const theirs = commit({ 'configuration.php': CONFIG(now) })
  const answer = merge(base, ours, theirs)
  const text = read(answer.tree, 'configuration.php')
  assert.match(text, /public \$password = 'copy-secret';/)
  assert.match(text, /public \$live_site = 'https:\/\/shop-com\.tracy\.ai';/)
  assert.match(text, /public \$secret = 'fresh';/)
  assert.match(text, /public \$sitename = 'Shop & Co';/)
  assert.match(text, /public \$MetaDesc = 'new description';/)
  assert.match(text, /public \$debug = true;/)
  assert.doesNotMatch(text, /\$offset/)
  assert.match(
    text,
    /public \$MetaKeys = 'tracy, seo';/,
    'both changed it: the copy keeps its own until decided'
  )
  assert.equal(answer.conflicts.length, 1)
  assert.equal(answer.conflicts[0].kind, 'settings')
  assert.deepEqual(
    answer.conflicts[0].settings.map((s) => [s.id, s.ours, s.theirs]),
    [['file:configuration.php#MetaKeys', "'tracy, seo'", "'customer, keys'"]]
  )
  const decided = merge(base, ours, theirs, { decisions: { 'file:configuration.php#MetaKeys': 'theirs' } })
  assert.deepEqual(decided.conflicts, [])
  assert.match(read(decided.tree, 'configuration.php'), /public \$MetaKeys = 'customer, keys';/)
  // The copy never touched the file, the live site did: still setting by setting, never the whole
  // file (found by test/live-sync-flow.test.mjs: the copy came up with the live database's password).
  const untouched = merge(base, base, theirs)
  const untouchedText = read(untouched.tree, 'configuration.php')
  assert.match(
    untouchedText,
    /public \$password = 'live-secret';/,
    'base is the copy here: its own value stays'
  )
  assert.match(untouchedText, /public \$sitename = 'Shop & Co';/)
  const built = commit({ 'configuration.php': CONFIG(copy) })
  const fromBuilt = merge(built, built, theirs)
  const builtText = read(fromBuilt.tree, 'configuration.php')
  assert.match(builtText, /public \$password = 'copy-secret';/)
  assert.match(builtText, /public \$host = 'db';/)
  assert.match(builtText, /public \$sitename = 'Shop & Co';/)
  assert.deepEqual(fromBuilt.conflicts, [])
  // The whole file can never be taken from the live site: its password is the live database's.
  const whole = merge(base, ours, theirs, { decisions: { 'file:configuration.php': 'theirs' } })
  assert.match(read(whole.tree, 'configuration.php'), /public \$password = 'copy-secret';/)
})

test('--prefer ours: the clashing lines are Tracy’s, the rest of the live file comes over, nothing is left open', () => {
  const lines = (edit = {}) => Array.from({ length: 12 }, (_, i) => edit[i] ?? `line ${i}`).join('\n') + '\n'
  const base = commit({ 'a.css': lines(), 'logo.png': Buffer.from([0, 1, 2]), 'old.php': 'a' })
  const ours = commit({ 'a.css': lines({ 2: 'ours 2' }), 'logo.png': Buffer.from([0, 1, 3]), 'old.php': 'b' })
  const theirs = commit({
    'a.css': lines({ 2: 'theirs 2', 9: 'theirs 9' }),
    'logo.png': Buffer.from([0, 1, 4])
  })
  const answer = merge(base, ours, theirs, { prefer: 'ours' })
  assert.deepEqual(answer.conflicts, [])
  assert.deepEqual(
    answer.kept.map((c) => [c.id, c.reason]),
    [
      ['file:a.css', 'both-changed'],
      ['file:logo.png', 'binary'],
      ['file:old.php', 'delete-modify']
    ]
  )
  assert.ok(answer.kept.every((c) => !('draft' in c)))
  assert.equal(read(answer.tree, 'a.css'), lines({ 2: 'ours 2', 9: 'theirs 9' }))
  assert.equal(read(answer.tree, 'old.php'), 'b')
})

test('--prefer ours: rules both sides appended to a CSS file all stay, the copy’s first; the customer’s after a line Tracy removed too', () => {
  const css = (...extra) => ['.a { color: red }', '.b { color: blue }', ...extra].join('\n') + '\n'
  const base = commit({ 'user.css': css('.old { margin: 0 }') })
  // The agent changed the last line and appended a rule; the customer appended two after it.
  const ours = commit({ 'user.css': css('.old { margin: 4px } /* Tracy */', '.tracy { gap: 8px }') })
  const theirs = commit({
    'user.css': css('.old { margin: 0 }', '.customer-1 { gap: 1px }', '.customer-2 { gap: 2px }')
  })
  const answer = merge(base, ours, theirs, { prefer: 'ours' })
  assert.deepEqual(answer.conflicts, [])
  assert.equal(
    read(answer.tree, 'user.css'),
    css(
      '.old { margin: 4px } /* Tracy */',
      '.tracy { gap: 8px }',
      '.customer-1 { gap: 1px }',
      '.customer-2 { gap: 2px }'
    )
  )
  // Both changed the same line: the copy's line stays, and the live one is not added beside it.
  const clash = merge(
    base,
    commit({ 'user.css': css('.old { margin: 9px }') }),
    commit({ 'user.css': css('.old { margin: 1px }') }),
    { prefer: 'ours' }
  )
  assert.equal(read(clash.tree, 'user.css'), css('.old { margin: 9px }'))
})

test('--prefer ours: a file merged line by line counts as merged, a clash in it or not (#1648)', () => {
  const lines = (edit = {}) => Array.from({ length: 12 }, (_, i) => edit[i] ?? `line ${i}`).join('\n') + '\n'
  const base = commit({ 'custom.css': lines() })
  const ours = commit({ 'custom.css': lines({ 2: 'ours 2' }) })
  const theirs = commit({ 'custom.css': lines({ 2: 'theirs 2', 9: 'theirs 9' }) })
  const answer = merge(base, ours, theirs, { prefer: 'ours' })
  assert.equal(read(answer.tree, 'custom.css'), lines({ 2: 'ours 2', 9: 'theirs 9' }))
  assert.deepEqual(
    answer.kept.map((c) => c.id),
    ['file:custom.css']
  )
  assert.equal(answer.counts.merged, 1, 'the live line 9 came over: the file was merged')
})

test('--prefer ours: rules the customer only appended beside Tracy’s are all in the file, so nothing is listed as kept', () => {
  const css = (...extra) => ['.a { color: red }', '.b { color: blue }', ...extra].join('\n') + '\n'
  const base = commit({ 'user.css': css('.old { margin: 0 }') })
  const ours = commit({ 'user.css': css('.old { margin: 4px }', '.tracy { gap: 8px }') })
  const theirs = commit({ 'user.css': css('.old { margin: 0 }', '.customer { gap: 1px }') })
  const answer = merge(base, ours, theirs, { prefer: 'ours' })
  assert.equal(
    read(answer.tree, 'user.css'),
    css('.old { margin: 4px }', '.tracy { gap: 8px }', '.customer { gap: 1px }')
  )
  assert.deepEqual(answer.kept, [])
  assert.equal(answer.counts.merged, 1)
})

test('--prefer ours: configuration.php’s clashes are kept one setting at a time, each with both values (#1648)', () => {
  const live = { host: "'localhost'", sitename: "'Shop'", MetaDesc: "'old'" }
  const base = commit({ 'configuration.php': CONFIG(live) })
  const ours = commit({ 'configuration.php': CONFIG({ ...live, host: "'db'", sitename: "'Shop (Tracy)'" }) })
  const theirs = commit({
    'configuration.php': CONFIG({ ...live, sitename: "'Shop & Co'", MetaDesc: "'new'" })
  })
  const answer = merge(base, ours, theirs, { prefer: 'ours' })
  assert.deepEqual(answer.kept, [
    {
      id: 'file:configuration.php#sitename',
      kind: 'setting',
      path: 'configuration.php',
      setting: 'sitename',
      base: "'Shop'",
      ours: "'Shop (Tracy)'",
      theirs: "'Shop & Co'"
    }
  ])
  assert.match(read(answer.tree, 'configuration.php'), /public \$MetaDesc = 'new';/)
})

test('a live read whose files are the base’s: the copy’s own tree, whatever the copy did', () => {
  const base = commit({ 'index.php': 'a\n', 'configuration.php': CONFIG({ sitename: "'Live'" }) })
  const ours = commit({
    'index.php': 'a\nb\n',
    'configuration.php': CONFIG({ sitename: "'Copy'" }),
    'templates/t/css/site.css': 'x {}\n'
  })
  // A second commit of the same tree: what a read that found no file moved is built on.
  const theirs = git([
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit-tree',
    `${base}^{tree}`,
    '-m',
    'same'
  ])
  const got = merge(base, ours, theirs, { prefer: 'ours' })
  assert.equal(got.tree, git(['rev-parse', `${ours}^{tree}`]))
  assert.deepEqual(got.counts, { fromTheirs: 0, merged: 0, tracyOwned: 0 })
  assert.deepEqual(got.conflicts, [])
})

test('stat-manifest: the listed files named by the blobs of the tree where the sizes agree, none read', () => {
  const tree = commit({
    'index.php': 'abc\n',
    'configuration.php': '<?php // the copy\n',
    'img/a.png': 'png'
  })
  const stat = join(root, 'stat.json')
  writeFileSync(
    stat,
    JSON.stringify({
      'index.php': { size: 4, mtime: 10 },
      'configuration.php': { size: 3, mtime: 11 },
      'img/new.png': { size: 2, mtime: 12 }
    })
  )
  const done = spawnSync(
    'python3',
    [ENGINE, 'stat-manifest', '--repo', REPO, '--rev', tree, '--stat', stat],
    {
      encoding: 'utf8'
    }
  )
  assert.equal(done.status, 0, done.stderr)
  assert.deepEqual(JSON.parse(done.stdout), {
    'index.php': { size: 4, mtime: 10, sha1: `git:${git(['rev-parse', `${tree}:index.php`])}` },
    'configuration.php': { size: 3, mtime: 11 },
    'img/new.png': { size: 2, mtime: 12 }
  })
})
