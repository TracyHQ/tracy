// `visual-qa.mjs findings`: a read-only, filterable one-line-per-finding view of visual.json. Filters combine before the
// limit, identities are the report positions (cluster member keys), duplicates stay, open and accepted are told apart,
// a crop is named only when the report records one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { DEFAULT_LIMIT, findingRows, findingsCli, formatFinding } from '../visual/findings-query.mjs'
import { clusterFindings } from '../visual/cluster.mjs'

const QA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'visual', 'visual-qa.mjs')
const dup = { kind: 'parity-mismatch', element: 'h3.t "x"', deltas: [{ property: 'color' }], reason: 'colour differs' }
const report = () => ({
  pages: [
    {
      id: 'home',
      axes: [
        { variant: '1440-light', width: 1440, theme: 'light', tiles: ['shots/home--1440-light/1.png'], findings: [dup, dup, { kind: 'image-missing', element: 'img.hero', property: 'src', expected: '/a.png', observed: null }], accepted: [{ ...dup, exception: { reason: 'r', decision: 'D-3' } }] },
        { variant: '390-dark', width: 390, theme: 'dark', tiles: ['shots/home--390-dark/1.png', 'shots/home--390-dark/2.png'], findings: [{ kind: 'overflow', what: 'x\nscrolls', tile: 'shots/home--390-dark/2.png' }], accepted: [] }
      ]
    },
    { id: 'about', axes: [{ variant: '1440-light', width: 1440, theme: 'light', findings: [{ kind: 'axis-error' }], accepted: [] }] }
  ]
})
const capture = (args) => {
  const out = [], err = []
  const code = findingsCli(args, { out: (l) => out.push(l), err: (l) => err.push(l) })
  return { code, out, err }
}
const write = (dir, r = report()) => {
  const file = path.join(dir, 'visual.json')
  writeFileSync(file, JSON.stringify(r))
  return file
}

let tmpCount = 0
function writeTmp(r) {
  const dir = testDir(`vf-${tmpCount++}`)
  return write(dir, r)
}

test('rows: report order, positional ids, duplicates retained, open vs accepted, width/scheme from the axis', () => {
  const rows = findingRows(report())
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.slice(0, 4).map((r) => [r.id, r.status]), [
    ['home|1440-light|findings#0', 'open'],
    ['home|1440-light|findings#1', 'open'],
    ['home|1440-light|findings#2', 'open'],
    ['home|1440-light|accepted#0', 'accepted']
  ])
  assert.equal(rows[0].reason, rows[1].reason, 'two identical findings are two rows')
  assert.equal(rows[0].viewport, '1440/light')
  assert.equal(rows[4].viewport, '390/dark')
  assert.match(rows[3].reason, /\[accepted: D-3\]$/)
  assert.match(rows[2].reason, /^image-missing img\.hero src: "\/a\.png" -> null$/)
})

test('rows: the identity is the cluster member key, so a row finds the finding in the report', () => {
  const r = report()
  const keys = clusterFindings(r.pages).clusters.flatMap((c) => c.members.map((m) => m.key))
  const ids = new Set(findingRows(r).map((x) => x.id))
  for (const k of keys) assert.ok(ids.has(k), k)
  const [page, axis, where] = findingRows(r)[3].id.split('|')
  const [list, index] = where.split('#')
  assert.deepEqual(r.pages.find((p) => p.id === page).axes.find((a) => a.variant === axis)[list][Number(index)].exception.decision, 'D-3')
})

test('rows: filters combine and apply before the limit', () => {
  const r = report()
  assert.equal(findingRows(r, { page: 'home' }).length, 5)
  assert.equal(findingRows(r, { axis: '1440-light' }).length, 5)
  assert.equal(findingRows(r, { page: 'home', axis: '1440-light', status: 'open' }).length, 3)
  assert.equal(findingRows(r, { status: 'accepted' }).length, 1)
  assert.equal(findingRows(r, { page: 'nope' }).length, 0)
  const limited = capture(['--page', 'home', '--axis', '1440-light', '--open', '--limit', '2', writeTmp(r)])
  assert.equal(limited.code, 0)
  assert.equal(limited.out.length, 3)
  assert.equal(limited.out.at(-1), '# 2 of 3 finding(s) shown — narrow with --page/--axis/--open or raise --limit')
})

test('crop: the report’s own tile, else the axis’ only tile, else unavailable — never a guess among several', () => {
  const rows = findingRows(report())
  assert.equal(rows[0].crop, 'shots/home--1440-light/1.png', 'one tile on the axis')
  assert.equal(rows[4].crop, 'shots/home--390-dark/2.png', 'the finding names its tile')
  const several = findingRows({ pages: [{ id: 'p', axes: [{ variant: 'v', tiles: ['s/1.png', 's/2.png'], findings: [{ kind: 'k' }] }] }] })[0]
  assert.equal(several.crop, 'unavailable (the axis has 2 tiles in s/)')
  assert.equal(rows[5].crop, 'unavailable', 'no tiles recorded')
})

test('CLI output: tab-separated, one physical line per finding, control characters flattened, default limit', () => {
  const lines = capture([writeTmp(report())]).out
  assert.equal(lines.length, 7)
  const f = lines[4].split('\t')
  assert.equal(f.length, 7)
  assert.deepEqual(f.slice(0, 5), ['home|390-dark|findings#0', 'home', '390-dark', '390/dark', 'open'])
  assert.equal(f[5], 'overflow: x scrolls')
  assert.equal(lines[6], '# 6 of 6 finding(s) shown')
  const many = { pages: [{ id: 'p', axes: [{ variant: 'v', findings: Array.from({ length: DEFAULT_LIMIT + 7 }, (_, i) => ({ kind: 'k', reason: `r${i}` })), accepted: [] }] }] }
  const out = capture([writeTmp(many)]).out
  assert.equal(out.length, DEFAULT_LIMIT + 1)
  assert.match(out.at(-1), new RegExp(`^# ${DEFAULT_LIMIT} of ${DEFAULT_LIMIT + 7} finding`))
  assert.equal(formatFinding({ id: 'a\tb', page: 'p', axis: 'v', viewport: '1/x', status: 'open', reason: 'l1\nl2', crop: 'c' }).split('\n').length, 1)
})

test('identity and path fields are exact however long; control characters are encoded reversibly, prose is bounded', () => {
  const long = 'p'.repeat(300)
  const r = { pages: [{ id: `${long}\nx`, axes: [{ variant: 'v\tw', tiles: [`shots/${'d'.repeat(250)}/1.png`], findings: [{ kind: 'k', reason: 'r'.repeat(400) }], accepted: [] }] }] }
  const [row] = findingRows(r)
  const cells = formatFinding(row).split('\t')
  assert.equal(cells.length, 7)
  assert.equal(decodeURIComponent(cells[0]), row.id)
  assert.equal(decodeURIComponent(cells[1]), row.page)
  assert.equal(decodeURIComponent(cells[2]), 'v\tw')
  assert.equal(decodeURIComponent(cells[6]), row.crop)
  assert.ok(cells[5].length <= 140)
  assert.ok(cells[0].length > 300)
  assert.ok(!formatFinding(row).includes('\n'))
})

test('CLI: a run directory or a file; bad input is exit 2 with nothing on stdout; the query writes nothing and starts nothing', () => {
  const dir = testDir('vf-cli')
  const file = write(dir)
  const before = readdirSync(dir).map((f) => [f, statSync(path.join(dir, f)).mtimeMs])
  const run = (...args) => spawnSync(process.execPath, [QA, 'findings', ...args], { encoding: 'utf8', timeout: 60000 })
  const viaDir = run(dir, '--page', 'about')
  assert.equal(viaDir.status, 0, viaDir.stderr)
  assert.equal(viaDir.stdout.split('\n')[0].split('\t')[0], 'about|1440-light|findings#0')
  assert.equal(run(file, '--page', 'about').stdout, viaDir.stdout)
  assert.deepEqual(readdirSync(dir).map((f) => [f, statSync(path.join(dir, f)).mtimeMs]), before)
  // a successful query is exit 0 whatever it finds (the verdict belongs to the gates)
  assert.equal(run(file, '--page', 'nope').status, 0)
  const notJson = path.join(dir, 'bad.json')
  writeFileSync(notJson, '{')
  mkdirSync(path.join(dir, 'empty'))
  writeFileSync(path.join(dir, 'nopages.json'), '{}')
  for (const bad of [[], [path.join(dir, 'missing.json')], [notJson], [path.join(dir, 'empty')], [path.join(dir, 'nopages.json')], [file, '--limit', '0'], [file, '--limit', 'x'], [file, '--open', '--accepted'], [file, '--bogus'], [file, '--page'], [file, 'extra'], [file, '--page', 'a', '--page', 'b']]) {
    const r = run(...bad)
    assert.equal(r.status, 2, JSON.stringify(bad))
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /^visual-qa/)
  }
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pages.length, 2)
})
