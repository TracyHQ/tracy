/**
 * A dump read as its tables (`scripts/lib/dump_sections.py`): what lets "Sync from live" load into
 * its scratch schemas only the tables of the two live reads that differ. No database.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/dump-sections.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib', 'dump_sections.py')
const root = mkdtempSync(join(tmpdir(), 'dump-sections-'))
after(() => rmSync(root, { recursive: true, force: true }))

const run = (args, input = '') => {
  const done = spawnSync('python3', [TOOL, ...args], { input, encoding: 'utf8' })
  assert.equal(done.status, 0, done.stderr)
  return done.stdout
}
const digest = (dump) => JSON.parse(run(['digest'], dump))
let n = 0
/** The tables two dumps hold alike, `keep` aside. */
const same = (a, b, keep = []) => {
  const fa = join(root, `a${++n}.json`)
  const fb = join(root, `b${n}.json`)
  const fk = join(root, `k${n}.txt`)
  writeFileSync(fa, JSON.stringify(digest(a)))
  writeFileSync(fb, JSON.stringify(digest(b)))
  writeFileSync(fk, keep.join('\n'))
  return run(['same', fa, fb, '--keep', fk]).split('\n').filter(Boolean)
}

/** live-pull.mjs's format: a `-- table` line, the DROP and CREATE, then INSERTs as the engine cut them. */
const part = (t, inserts, create = `CREATE TABLE \`${t}\` (id int, v text);`) =>
  `-- table \`${t}\`\nDROP TABLE IF EXISTS \`${t}\`;\n${create}\n` +
  inserts.map((rows) => `INSERT INTO \`${t}\` VALUES ${rows.join(',')};\n`).join('')

test('a table whose rows came cut into other INSERTs is the same table; one row more is not', () => {
  const a = part('wp_a', [["(1,'x')", "(2,'y')"], ["(3,'z')"]]) + part('wp_b', [["(1,'b')"]])
  const b = part('wp_a', [["(1,'x')"], ["(2,'y')", "(3,'z')"]]) + part('wp_b', [["(1,'b')", "(2,'c')"]])
  assert.deepEqual(same(a, b), ['wp_a'])
})

test('a quote, a comma or a parenthesis inside a value is a value, not a cut', () => {
  // Each line is one whole statement (both writers escape a newline in a value): the rows are the
  // statements' VALUES lists in order, however many statements carry them.
  const other = (v) => part('u', [[`(${v})`]])
  const a = part('t', [["(1,'a),(b')", "(2,'c;')"]]) + other(1)
  const b = part('t', [["(1,'a),(b')"], ["(2,'c;')"]]) + other(2)
  assert.deepEqual(same(a, b), ['t'])
  assert.deepEqual(
    same(a, part('t', [["(1,'a'),(b')", "(2,'c;')"]]) + other(2)),
    [],
    'other bytes are other rows'
  )
})

test('never every table of a dump: a scratch schema with none reads as one the server refused', () => {
  const dump = part('t1', [['(1)']]) + part('t2', [['(2)']])
  assert.deepEqual(same(dump, dump), ['t1'])
})

test('another structure, a table one dump lacks, a kept table, a foreign key, a view: never left out', () => {
  const base = part('t1', [['(1)']]) + part('t2', [['(1)']]) + part('t3', [['(1)']]) + part('t4', [['(1)']])
  assert.deepEqual(
    same(base, part('t1', [['(1)']], 'CREATE TABLE `t1` (id bigint);') + part('t2', [['(1)']])),
    ['t2']
  )
  assert.deepEqual(same(base, base, ['t1', 't3']), ['t2', 't4'])
  const fk = (t, ref) =>
    part(
      t,
      [['(1)']],
      `CREATE TABLE \`${t}\` (id int,\n  CONSTRAINT f FOREIGN KEY (id) REFERENCES \`${ref}\` (id));`
    )
  const withFk = part('t1', [['(1)']]) + fk('t2', 't1') + part('t3', [['(1)']])
  assert.deepEqual(same(withFk, withFk), ['t3'], 'both ends of a foreign key load')
  const view = `${base}--\n-- Temporary table structure for view \`v\`\n--\nCREATE TABLE \`v\` (id int);\n`
  assert.deepEqual(same(view, view), [])
})

/** mariadb-dump's format: a head of settings, sections, routines and a tail. */
const section = (t, rows = '(1)') =>
  `--\n-- Table structure for table \`${t}\`\n--\n\nDROP TABLE IF EXISTS \`${t}\`;\nCREATE TABLE \`${t}\` (id int);\n\n` +
  `--\n-- Dumping data for table \`${t}\`\n--\n\nINSERT INTO \`${t}\` VALUES ${rows};\n`
const head = (db, names = 'utf8mb4') =>
  `-- MariaDB dump 10.19\n-- Host: localhost    Database: ${db}\n/*!40101 SET NAMES ${names} */;\n\n`
const tail =
  "--\n-- Dumping routines for database 'x'\n--\n/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;\n-- Dump completed on 2026-10-24\n"

test('two mariadb-dumps: the comments of their heads differ, their settings must not', () => {
  const a = head('live') + section('t1') + section('t2', '(2)') + tail
  const b = head('copy') + section('t1') + section('t2', '(3)') + tail.replace('10-24', '10-25')
  assert.deepEqual(same(a, b), ['t1'])
  assert.deepEqual(
    same(a, head('live', 'latin1') + section('t1') + tail),
    [],
    'another SET NAMES: nothing alike'
  )
})

test('cut --skip leaves the named tables out and everything else as it was; --only keeps only them', () => {
  const dump = head('live') + section('t1') + section('t2') + section('t3') + tail
  const list = join(root, 'skip.txt')
  writeFileSync(list, 't1\nt3\n')
  assert.equal(run(['cut', '--skip', list], dump), head('live') + section('t2') + tail)
  const only = run(['cut', '--only', list], dump)
  // The comment lines a section ends with are the next one's head: they go with the section.
  assert.equal(
    only,
    `${head('live')}${section('t1')}${section('t3')}--\n/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;\n-- Dump completed on 2026-10-24\n`
  )
  assert.doesNotMatch(only, /t2|Dumping routines/)
  const live = part('a', [['(1)']]) + part('b', [['(2)']]) + part('c', [['(3)']])
  writeFileSync(list, 'b\n')
  assert.equal(run(['cut', '--skip', list], live), part('a', [['(1)']]) + part('c', [['(3)']]))
  assert.equal(run(['cut', '--only', list], live), part('b', [['(2)']]))
})

test('split: each table in a file of its own, shared out by size among the loads, largest first; skipped tables left out', async () => {
  const { mkdirSync, readFileSync } = await import('node:fs')
  const big = Array.from({ length: 40 }, (_, i) => `(${i},'${'x'.repeat(40)}')`)
  const dump =
    part('wp_big', [big]) +
    part('wp_mid', [big.slice(0, 20)]) +
    part('wp_small', [["(1,'a')"]]) +
    part('wp_skip', [["(1,'s')"]])
  const out = join(root, 'split-1')
  mkdirSync(out)
  const skip = join(root, 'split-skip.txt')
  writeFileSync(skip, 'wp_skip\n')
  const loads = run(['split', '--streams', '2', '--out', out, '--skip', skip], dump)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' '))
  assert.equal(loads.length, 2)
  const tables = loads.map((paths) => paths.map((p) => /-- table `([^`]+)`/.exec(readFileSync(p, 'utf8'))[1]))
  // The largest alone on one load, the next two on the other: neither waits on the other's bytes.
  assert.deepEqual(tables, [['wp_big'], ['wp_mid', 'wp_small']])
  // Every part loads as the whole dump did, the skipped table nowhere.
  const joined = loads
    .flat()
    .map((p) => readFileSync(p, 'utf8'))
    .join('')
  assert.equal(
    joined,
    part('wp_big', [big]) + part('wp_mid', [big.slice(0, 20)]) + part('wp_small', [["(1,'a')"]])
  )
})

test('split refuses (3) a dump with no `-- table` line: statements load as they are, never nothing', async () => {
  const { mkdirSync } = await import('node:fs')
  const out = join(root, 'split-none')
  mkdirSync(out)
  const done = spawnSync('python3', [TOOL, 'split', '--streams', '2', '--out', out], {
    input: 'CREATE TABLE jos_content (id INT);\nINSERT INTO jos_content VALUES (1);\n',
    encoding: 'utf8'
  })
  assert.equal(done.status, 3, done.stderr)
})

test('split refuses (3) a dump that cannot load table by table side by side: LOCK TABLES, a view, a tail', async () => {
  const { mkdirSync } = await import('node:fs')
  for (const [i, tail] of [
    'LOCK TABLES `wp_a` WRITE;\n',
    '-- Temporary table structure for view `v`\n',
    "-- Dumping routines for database 'x'\n"
  ].entries()) {
    const out = join(root, `split-no-${i}`)
    mkdirSync(out)
    const done = spawnSync('python3', [TOOL, 'split', '--streams', '2', '--out', out], {
      input: part('wp_a', [["(1,'a')"]]) + tail,
      encoding: 'utf8'
    })
    assert.equal(done.status, 3, `${tail.trim()}: ${done.stderr}`)
  }
})
