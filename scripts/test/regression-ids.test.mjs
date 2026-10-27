#!/usr/bin/env node
/**
 * Regression case ids (`tests/regression/catalogue.mjs`) and the allocator
 * (`tests/regression/create.mjs`): one grammar — legacy `REG-NNN` kept, new `REG-PR-<pr>-<slug>` —
 * read the same way by cases, file names, result lines and the catalogue loader; and a file
 * created exclusively, so two pull requests cannot take one id and one pull request cannot
 * overwrite a case.
 *
 * The allocator runs as a real process in a throwaway tree (under `$TCH_TEST_ARTIFACTS_DIR` when
 * set, the OS temp dir otherwise) holding copies of the two scripts: it writes next to itself, and
 * must never write into this checkout.
 *
 *   node --test scripts/test/regression-ids.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs, {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as catalogue from '../../tests/regression/catalogue.mjs'
import { loadCatalogue } from '../../tests/regression/run.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { CASES_DIR, RESULTS_DIR, formatResult, isCasePath, parseCase, parseResults } = catalogue

/** The allocator, loaded lazily so a tree without it fails each test instead of the whole file. */
const allocator = () => import('../../tests/regression/create.mjs')

/** Case fields without `id` and `pr` — what `--input` holds. */
const fields = (over) => ({
  kind: 'fix',
  title: 'A button stays enabled',
  area: 'site-changes/backup',
  cms: ['any'],
  needs: ['stand'],
  flaky_model: false,
  steps: ['Open the tab'],
  expect: ['button has no disabled attribute'],
  selectors: {},
  ...over
})
const kase = (id, pr, over) => ({ id, pr, ...fields(over) })

const MALFORMED_IDS = [
  '',
  'REG-',
  'REG-1',
  'REG-12',
  'reg-001',
  'REG-001 ',
  ' REG-001',
  'REG-001\n',
  'REG-001-x',
  'REG-PR',
  'REG-PR-',
  'REG-PR-12',
  'REG-PR-12-',
  'REG-PR--x',
  'REG-PR-0-x',
  'REG-PR-012-x',
  'REG-PR-1.5-x',
  'REG-PR--3-x',
  'REG-PR-9007199254740993-x',
  'REG-PR-12-X',
  'REG-PR-12-Backup',
  'REG-PR-12-a--b',
  'REG-PR-12-a-',
  'REG-PR-12--a',
  'REG-PR-12-a_b',
  'REG-PR-12-a.b',
  'REG-PR-12-a/b',
  'REG-PR-12-../x',
  'REG-PR-12-a b',
  'REG-PR-12-a\n',
  'REG-pr-12-a',
  'REG-PR-12-é'
]

/**
 * A throwaway repository root with an empty cases folder.
 * @param {import('node:test').TestContext} t - removes the tree at the end.
 * @param {{scripts?: boolean}} [options] - `scripts` copies the allocator and the catalogue in.
 * @returns {{root: string, cases: string, script: string}} paths.
 */
function tree(t, { scripts = false } = {}) {
  const base = process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'regression-ids-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cases = join(root, CASES_DIR)
  mkdirSync(cases, { recursive: true })
  if (scripts)
    for (const name of ['create.mjs', 'catalogue.mjs'])
      copyFileSync(join(ROOT, 'tests/regression', name), join(root, 'tests/regression', name))
  return { root, cases, script: join(root, 'tests/regression/create.mjs') }
}

describe('the id grammar', () => {
  test('a legacy id and a PR-owned id are both read, into their parts', () => {
    assert.deepEqual(catalogue.parseId('REG-001'), { form: 'legacy', number: 1 })
    assert.deepEqual(catalogue.parseId('REG-1234'), { form: 'legacy', number: 1234 })
    assert.deepEqual(catalogue.parseId('REG-PR-912-backup-button'), {
      form: 'pr',
      pr: 912,
      slug: 'backup-button'
    })
    assert.deepEqual(catalogue.parseId('REG-PR-12-3-x'), { form: 'pr', pr: 12, slug: '3-x' })
    assert.equal(catalogue.isCaseId('REG-PR-1-a'), true)
  })

  test('malformed ids are refused', () => {
    for (const id of [...MALFORMED_IDS, null, undefined, 12, ['REG-001']])
      assert.equal(catalogue.isCaseId(id), false, JSON.stringify(id))
  })

  test('an id is formed from a PR number and a slug, and reads back to the same parts', () => {
    assert.deepEqual(catalogue.prCaseId(912, 'backup-button'), {
      ok: true,
      id: 'REG-PR-912-backup-button',
      pr: 912
    })
    assert.deepEqual(catalogue.prCaseId('912', 'a1'), { ok: true, id: 'REG-PR-912-a1', pr: 912 })
    assert.deepEqual(catalogue.parseId(catalogue.prCaseId(7, 'x-9').id), { form: 'pr', pr: 7, slug: 'x-9' })
  })

  test('zero, negative, leading-zero, fractional, unsafe and non-numeric PR numbers form no id', () => {
    for (const pr of [
      0,
      -1,
      1.5,
      '0',
      '-1',
      '012',
      '1.5',
      '1e3',
      ' 12',
      '12 ',
      '',
      'x',
      '9007199254740993',
      2 ** 53,
      Number.NaN,
      null,
      undefined
    ])
      assert.equal(catalogue.prCaseId(pr, 'ok').ok, false, JSON.stringify(pr))
  })

  test('empty, uppercase, traversal and malformed slugs form no id', () => {
    for (const slug of [
      '',
      'A',
      'Backup',
      'a--b',
      '-a',
      'a-',
      'a_b',
      'a.b',
      '../x',
      'a/b',
      '..',
      'a b',
      'a\n',
      'é',
      null,
      undefined,
      3
    ])
      assert.equal(catalogue.prCaseId(12, slug).ok, false, JSON.stringify(slug))
  })

  test('ids sort legacy first by number, then by PR number, then by slug', () => {
    const ids = ['REG-PR-100-a', 'REG-1000', 'REG-PR-99-b', 'REG-002', 'REG-PR-99-a', 'REG-010']
    assert.deepEqual(ids.toSorted(catalogue.compareIds), [
      'REG-002',
      'REG-010',
      'REG-1000',
      'REG-PR-99-a',
      'REG-PR-99-b',
      'REG-PR-100-a'
    ])
  })
})

describe('a case and its file name', () => {
  test('a legacy case round-trips under its old file name', () => {
    const text = JSON.stringify(kase('REG-020', 5))
    for (const name of ['REG-020-thing.json', 'REG-020.json']) {
      const parsed = parseCase(text, `${CASES_DIR}${name}`)
      assert.equal(parsed.ok, true, name)
      assert.deepEqual(parsed.ok && parsed.value, kase('REG-020', 5))
    }
  })

  test('a PR-owned case round-trips in exactly <id>.json', () => {
    const value = kase('REG-PR-912-backup-button', 912)
    const parsed = parseCase(JSON.stringify(value), catalogue.casePath(value.id))
    assert.equal(catalogue.casePath(value.id), `${CASES_DIR}REG-PR-912-backup-button.json`)
    assert.equal(parsed.ok, true, JSON.stringify(parsed))
    assert.deepEqual(parsed.ok && parsed.value, value)
  })

  test('every .json in the cases folder is a candidate, whatever its name', () => {
    for (const name of ['REG-PR-912-backup-button.json', 'REG-001-x.json', 'REG-12-x.json', 'notes.json'])
      assert.equal(isCasePath(`${CASES_DIR}${name}`), true, name)
    assert.equal(isCasePath(`${CASES_DIR}sub/REG-PR-1-a.json`), false)
    assert.equal(isCasePath(`${CASES_DIR}REG-PR-1-a.md`), false)
    assert.equal(isCasePath('tests/regression/REG-PR-1-a.json'), false)
  })

  test('a PR-owned id in any other file name is refused', () => {
    const text = JSON.stringify(kase('REG-PR-912-backup', 912))
    for (const name of [
      'REG-PR-912-backup-extra.json',
      'REG-PR-912-backup-.json',
      'REG-PR-913-backup.json',
      'REG-PR-912-other.json',
      'backup.json'
    ]) {
      const parsed = parseCase(text, `${CASES_DIR}${name}`)
      assert.equal(parsed.ok, false, name)
      assert.match(
        parsed.ok ? '' : parsed.problems.join('\n'),
        /file name must be exactly REG-PR-912-backup\.json/
      )
    }
  })

  test('a legacy id in a file named for another id is refused', () => {
    const parsed = parseCase(JSON.stringify(kase('REG-020', 5)), `${CASES_DIR}REG-021-thing.json`)
    assert.equal(parsed.ok, false)
    assert.match(parsed.ok ? '' : parsed.problems.join('\n'), /file name must start with the id \(REG-020\)/)
  })

  test('the PR number in the id must be the case pr field', () => {
    const path = catalogue.casePath('REG-PR-912-backup')
    for (const pr of [913, 91, '912', 912.5, null, undefined, 0, -912]) {
      const parsed = parseCase(JSON.stringify(kase('REG-PR-912-backup', pr)), path)
      assert.equal(parsed.ok, false, JSON.stringify(pr))
      assert.match(parsed.ok ? '' : parsed.problems.join('\n'), /`pr` must be 912/)
    }
  })

  test('a legacy case does not have to name its number in pr', () => {
    assert.equal(parseCase(JSON.stringify(kase('REG-020', 912)), `${CASES_DIR}REG-020-x.json`).ok, true)
  })

  test('malformed ids, empty text, non-objects and missing fields are problems, never a case', () => {
    for (const id of MALFORMED_IDS) {
      const parsed = parseCase(JSON.stringify(kase(id, 12)), `${CASES_DIR}${id}.json`)
      assert.equal(parsed.ok, false, JSON.stringify(id))
      assert.match(parsed.ok ? '' : parsed.problems.join('\n'), /`id` must look like REG-PR-/)
    }
    const path = catalogue.casePath('REG-PR-1-a')
    for (const text of ['', '   ', '{', '[]', 'null', '"REG-PR-1-a"', '12', '{}'])
      assert.equal(parseCase(text, path).ok, false, JSON.stringify(text))
    for (const field of Object.keys(fields())) {
      const value = kase('REG-PR-1-a', 1)
      delete value[field]
      assert.equal(parseCase(JSON.stringify(value), path).ok, false, field)
    }
  })
})

describe('result lines', () => {
  const at = new Date('2026-10-04T01:02:03Z')
  const line = (id, verdict = 'PASS') =>
    formatResult({ id, verdict, commit: 'abc1234', ranAt: at, evidence: 'x.log' })

  test('legacy and PR-owned ids round-trip, and blank lines are still skipped', () => {
    const { lines, problems } = parseResults(
      `${line('REG-001')}\n\n   \n${line('REG-PR-912-backup-button', 'FAIL')}\n`
    )
    assert.deepEqual(problems, [])
    assert.deepEqual(
      lines.map((l) => [l.id, l.verdict, l.commit, l.ran_at, l.evidence]),
      [
        ['REG-001', 'PASS', 'abc1234', '2026-10-04T01:02:03.000Z', 'x.log'],
        ['REG-PR-912-backup-button', 'FAIL', 'abc1234', '2026-10-04T01:02:03.000Z', 'x.log']
      ]
    )
    assert.deepEqual(parseResults(''), { lines: [], problems: [] })
  })

  test('a line with a malformed id is reported and is not evidence', () => {
    const raw = (id) => JSON.stringify({ id, verdict: 'PASS', commit: 'abc1234', ran_at: 'x', evidence: 'y' })
    for (const id of MALFORMED_IDS) {
      const { lines, problems } = parseResults(`${raw(id)}\n`)
      assert.deepEqual(lines, [], JSON.stringify(id))
      assert.match(problems.join('\n'), /^line 1: id must look like REG-PR-/, JSON.stringify(id))
    }
  })

  test('non-object lines, missing fields and unknown verdicts are reported', () => {
    const { lines, problems } = parseResults(
      [
        'not json',
        'null',
        '[]',
        '{"id":"REG-001"}',
        '{"id":"REG-001","verdict":"MAYBE","commit":"a","ran_at":"b"}'
      ].join('\n')
    )
    assert.deepEqual(lines, [])
    assert.equal(problems.length, 5)
  })

  test('a result line is not written for a malformed id or an unknown verdict', () => {
    for (const id of MALFORMED_IDS)
      assert.throws(() => line(id), /result id must look like/, JSON.stringify(id))
    assert.throws(() => line('REG-001', 'MAYBE'), /verdict must be one of/)
  })

  test('the historical result files still parse whole', (t) => {
    const dir = join(ROOT, RESULTS_DIR)
    // The public export leaves run history out, so a fresh clone has none.
    if (!existsSync(dir)) return t.skip('no result history in this checkout')
    const files = readdirSync(dir).filter((name) => name.endsWith('.jsonl'))
    for (const name of files) {
      const { lines, problems } = parseResults(readFileSync(join(dir, name), 'utf8'))
      assert.deepEqual(problems, [], name)
      for (const l of lines) assert.equal(catalogue.isCaseId(l.id), true, `${name}: ${l.id}`)
    }
  })
})

describe('a combined catalogue', () => {
  const put = (dir, name, value) =>
    writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))

  test('legacy cases and two pull requests using one slug load together', (t) => {
    const { root, cases } = tree(t)
    put(cases, 'REG-020-thing.json', kase('REG-020', 5))
    put(cases, 'REG-021.json', kase('REG-021', 6))
    put(cases, 'REG-PR-100-same-slug.json', kase('REG-PR-100-same-slug', 100))
    put(cases, 'REG-PR-99-same-slug.json', kase('REG-PR-99-same-slug', 99))
    writeFileSync(join(cases, 'README.md'), 'not a case\n')
    assert.deepEqual(
      loadCatalogue(root)
        .map((c) => c.id)
        .toSorted(catalogue.compareIds),
      ['REG-020', 'REG-021', 'REG-PR-99-same-slug', 'REG-PR-100-same-slug']
    )
  })

  test('one id in two files is refused, naming both files', (t) => {
    const { root, cases } = tree(t)
    put(cases, 'REG-020-first.json', kase('REG-020', 5))
    put(cases, 'REG-020-second.json', kase('REG-020', 6))
    put(cases, 'REG-PR-9-ok.json', kase('REG-PR-9-ok', 9))
    assert.throws(
      () => loadCatalogue(root),
      /duplicate id REG-020: tests\/regression\/cases\/REG-020-first\.json, tests\/regression\/cases\/REG-020-second\.json/
    )
    assert.deepEqual(
      catalogue.duplicateIds([
        { id: 'REG-020', path: 'b' },
        { id: 'REG-PR-9-ok', path: 'c' },
        { id: 'REG-020', path: 'a' }
      ]),
      [{ id: 'REG-020', paths: ['a', 'b'] }]
    )
  })

  test('a malformed candidate is refused, not skipped', (t) => {
    for (const [name, value] of [
      ['REG-12-two-digits.json', kase('REG-12', 5)],
      ['REG-PR-12-Upper.json', kase('REG-PR-12-Upper', 12)],
      ['reg-pr-12-lower.json', kase('reg-pr-12-lower', 12)],
      ['REG-PR-12-wrong-pr.json', kase('REG-PR-12-wrong-pr', 13)],
      ['REG-PR-12-renamed.json', kase('REG-PR-12-original', 12)],
      ['notes.json', { hello: 'world' }],
      ['REG-PR-12-cut.json', '{"id":"REG-PR-12-cut","kind":"fix","ti'],
      ['REG-PR-12-empty.json', '']
    ]) {
      const { root, cases } = tree(t)
      put(cases, 'REG-020-thing.json', kase('REG-020', 5))
      put(cases, name, value)
      assert.throws(
        () => loadCatalogue(root),
        new RegExp(`catalogue is invalid:[\\s\\S]*${name.replaceAll('.', '\\.')}`),
        name
      )
    }
  })

  test('a case that is a symlink, a folder or a pipe is refused without being opened', (t) => {
    const make = {
      symlink: (cases, root) => {
        writeFileSync(join(root, 'outside.json'), JSON.stringify(kase('REG-PR-12-odd', 12)))
        symlinkSync(join(root, 'outside.json'), join(cases, 'REG-PR-12-odd.json'))
      },
      folder: (cases) => mkdirSync(join(cases, 'REG-PR-12-odd.json')),
      // Reading a FIFO nobody writes to blocks forever: the test would hang, not fail.
      pipe: (cases) => execFileSync('mkfifo', [join(cases, 'REG-PR-12-odd.json')])
    }
    for (const [what, create] of Object.entries(make)) {
      const { root, cases } = tree(t)
      create(cases, root)
      assert.throws(() => loadCatalogue(root), /REG-PR-12-odd\.json: must be a regular file/, what)
    }
  })

  test('the real catalogue loads whole and every id is in the grammar', () => {
    const cases = loadCatalogue(ROOT)
    assert.ok(cases.length > 0)
    for (const c of cases) assert.equal(catalogue.isCaseId(c.id), true, c.id)
    assert.ok(cases.some((c) => c.id === 'REG-001'))
  })
})

describe('the allocator, on text', () => {
  test('it forms the id and the path from the arguments and supplies id and pr', async () => {
    const { buildCase } = await allocator()
    const built = buildCase({
      pr: '912',
      slug: 'backup-button',
      inputText: JSON.stringify(fields({ evidence: 'e' }))
    })
    assert.equal(built.ok, true, JSON.stringify(built))
    assert.equal(built.id, 'REG-PR-912-backup-button')
    assert.equal(built.path, `${CASES_DIR}REG-PR-912-backup-button.json`)
    assert.deepEqual(JSON.parse(built.text), { ...kase('REG-PR-912-backup-button', 912), evidence: 'e' })
    assert.deepEqual(Object.keys(JSON.parse(built.text)).slice(0, 4), ['id', 'kind', 'title', 'pr'])
    assert.equal(parseCase(built.text, built.path).ok, true)
  })

  test('an input that already names the same id and pr is accepted; a different one is refused', async () => {
    const { buildCase } = await allocator()
    const same = JSON.stringify(kase('REG-PR-912-a', 912))
    assert.equal(buildCase({ pr: '912', slug: 'a', inputText: same }).ok, true)
    for (const over of [
      { id: 'REG-PR-912-b' },
      { id: 'REG-020' },
      { pr: 913 },
      { pr: '912' },
      { id: null },
      { pr: null }
    ]) {
      const built = buildCase({ pr: '912', slug: 'a', inputText: JSON.stringify({ ...fields(), ...over }) })
      assert.equal(built.ok, false, JSON.stringify(over))
      assert.match(built.problems.join('\n'), /--input says (id|pr)/, JSON.stringify(over))
    }
  })

  test('empty, malformed and non-object input, and missing fields, are refused', async () => {
    const { buildCase } = await allocator()
    for (const inputText of ['', '{', 'null', '[]', '"x"', '{}', JSON.stringify(fields({ steps: [] }))])
      assert.equal(buildCase({ pr: '912', slug: 'a', inputText }).ok, false, inputText)
  })
})

describe('the allocator, as a process', () => {
  /**
   * @param {string} script - the allocator copy.
   * @param {string[]} args - its arguments.
   * @returns {import('node:child_process').SpawnSyncReturns<string>} the finished process.
   */
  const run = (script, args) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20_000 })
  const input = (root, value = fields()) => {
    const path = join(root, 'input.json')
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }

  test('it creates exactly <id>.json, valid, and prints the id', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const r = run(script, ['--pr', '912', '--slug', 'backup-button', '--input', input(root)])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^REG-PR-912-backup-button\n/)
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-backup-button.json'])
    assert.deepEqual(
      loadCatalogue(root).map((c) => [c.id, c.pr]),
      [['REG-PR-912-backup-button', 912]]
    )
  })

  test('two pull requests take the same slug and both cases stay', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    for (const pr of ['912', '913'])
      assert.equal(run(script, ['--pr', pr, '--slug', 'same-slug', '--input', input(root)]).status, 0)
    assert.deepEqual(readdirSync(cases).toSorted(), [
      'REG-PR-912-same-slug.json',
      'REG-PR-913-same-slug.json'
    ])
    assert.equal(loadCatalogue(root).length, 2)
  })

  test('the same pull request reusing a slug is refused and the first case keeps its bytes', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    assert.equal(run(script, ['--pr', '912', '--slug', 'a', '--input', input(root)]).status, 0)
    const before = readFileSync(join(cases, 'REG-PR-912-a.json'), 'utf8')
    const again = run(script, [
      '--pr',
      '912',
      '--slug',
      'a',
      '--input',
      input(root, fields({ title: 'Another case' }))
    ])
    assert.equal(again.status, 2)
    assert.match(again.stderr, /already exists — nothing was written/)
    assert.equal(readFileSync(join(cases, 'REG-PR-912-a.json'), 'utf8'), before)
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-a.json'])
  })

  test('of eight runs racing for one id, exactly one creates it', async (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const inputs = Array.from({ length: 8 }, (_, i) => {
      const path = join(root, `input-${String(i)}.json`)
      writeFileSync(path, JSON.stringify(fields({ title: `Racer ${String(i)}` })))
      return path
    })
    const codes = await Promise.all(
      inputs.map(
        (path) =>
          new Promise((done, fail) => {
            const child = spawn(
              process.execPath,
              [script, '--pr', '912', '--slug', 'race', '--input', path],
              {
                stdio: 'ignore'
              }
            )
            child.on('error', fail)
            child.on('close', done)
          })
      )
    )
    assert.deepEqual(codes.toSorted(), [0, 2, 2, 2, 2, 2, 2, 2])
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-race.json'])
    // The file is one racer's case, whole: no interleaved or truncated write.
    const [only] = loadCatalogue(root)
    assert.match(only.title, /^Racer [0-7]$/)
  })

  test('missing, unknown, valueless and conflicting arguments write nothing', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const file = input(root)
    for (const [args, message] of [
      [[], /missing --pr, --slug, --input/],
      [['--pr', '912', '--slug', 'a'], /missing --input/],
      [['--slug', 'a', '--input', file], /missing --pr/],
      [['--pr', '912', '--input', file], /missing --slug/],
      [['--pr', '912', '--slug', 'a', '--input', file, '--force'], /unknown argument --force/],
      [['--pr', '912', '--slug', 'a', '--input', file, 'extra'], /unknown argument extra/],
      [['--pr', '912', '--slug', 'a', '--input'], /--input needs a value/],
      [['--pr', '--slug', 'a', '--input', file], /--pr needs a value/],
      [
        ['--pr', '912', '--pr', '913', '--slug', 'a', '--input', file],
        /--pr given twice with different values/
      ],
      [
        ['--pr', '912', '--slug', 'a', '--slug', 'b', '--input', file],
        /--slug given twice with different values/
      ]
    ]) {
      const r = run(script, args)
      assert.equal(r.status, 2, args.join(' '))
      assert.match(r.stderr, message, args.join(' '))
      assert.match(r.stderr, /usage: node tests\/regression\/create\.mjs/)
    }
    assert.deepEqual(readdirSync(cases), [])
  })

  test('a repeated argument with the same value is one argument', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    assert.equal(run(script, ['--pr', '912', '--pr', '912', '--slug', 'a', '--input', input(root)]).status, 0)
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-a.json'])
  })

  test('bad PR numbers and slugs write nothing, inside or outside the cases folder', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const file = input(root)
    for (const pr of ['0', '-1', '012', '1.5', '1e3', 'x', '9007199254740993'])
      assert.equal(run(script, ['--pr', pr, '--slug', 'a', '--input', file]).status, 2, pr)
    for (const slug of ['A', 'a--b', '-a', 'a-', 'a_b', '../escape', 'a/b', '..', 'a b'])
      assert.equal(run(script, ['--pr', '912', '--slug', slug, '--input', file]).status, 2, slug)
    assert.deepEqual(readdirSync(cases), [])
    assert.deepEqual(readdirSync(join(root, 'tests/regression')).toSorted(), [
      'cases',
      'catalogue.mjs',
      'create.mjs'
    ])
  })

  test('a missing, invalid or conflicting input writes nothing', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const args = (file) => ['--pr', '912', '--slug', 'a', '--input', file]
    assert.match(run(script, args(join(root, 'nope.json'))).stderr, /cannot read --input/)
    assert.match(run(script, args(input(root, ''))).stderr, /not valid JSON/)
    assert.match(run(script, args(input(root, '[]'))).stderr, /one JSON object/)
    assert.match(run(script, args(input(root, fields({ expect: [] })))).stderr, /`expect`/)
    assert.match(run(script, args(input(root, { ...fields(), id: 'REG-020' }))).stderr, /--input says id/)
    assert.match(run(script, args(input(root, { ...fields(), pr: 913 }))).stderr, /--input says pr/)
    assert.deepEqual(readdirSync(cases), [])
  })

  test('an input that is a symlink, a folder or a pipe is refused without blocking', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const real = input(root)
    symlinkSync(real, join(root, 'link.json'))
    mkdirSync(join(root, 'folder.json'))
    execFileSync('mkfifo', [join(root, 'pipe.json')])
    for (const [name, message] of [
      ['link.json', /it is a symbolic link/],
      ['folder.json', /not a regular file/],
      ['pipe.json', /not a regular file/]
    ]) {
      const r = run(script, ['--pr', '912', '--slug', 'a', '--input', join(root, name)])
      assert.equal(r.status, 2, `${name}: ${String(r.error ?? r.stderr)}`)
      assert.match(r.stderr, message, name)
    }
    assert.deepEqual(readdirSync(cases), [])
  })

  test('a symlink, a pipe or a folder already at the destination is neither followed nor overwritten', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    const target = join(root, 'target.json')
    const dest = (slug) => join(cases, `REG-PR-912-${slug}.json`)
    symlinkSync(target, dest('dangling'))
    writeFileSync(join(root, 'kept.json'), 'kept\n')
    symlinkSync(join(root, 'kept.json'), dest('linked'))
    execFileSync('mkfifo', [dest('pipe')])
    mkdirSync(dest('folder'))
    for (const slug of ['dangling', 'linked', 'pipe', 'folder']) {
      const r = run(script, ['--pr', '912', '--slug', slug, '--input', input(root)])
      assert.equal(r.status, 2, `${slug}: ${String(r.error ?? r.stderr)}`)
      assert.match(r.stderr, /already exists — nothing was written/, slug)
    }
    assert.equal(existsSync(target), false)
    assert.equal(readFileSync(join(root, 'kept.json'), 'utf8'), 'kept\n')
  })

  test('a cases folder that is a symlink is refused', (t) => {
    const { root, cases, script } = tree(t, { scripts: true })
    rmSync(cases, { recursive: true })
    mkdirSync(join(root, 'elsewhere'))
    symlinkSync(join(root, 'elsewhere'), cases.replace(/\/$/, ''))
    const r = run(script, ['--pr', '912', '--slug', 'a', '--input', input(root)])
    assert.equal(r.status, 2)
    assert.match(r.stderr, /is not a folder/)
    assert.deepEqual(readdirSync(join(root, 'elsewhere')), [])
  })
})

describe('the allocator when the disk fails', () => {
  /** A file system that fails one call; every other call is the real one. */
  const failing = (
    name,
    error = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  ) => ({
    ...fs,
    [name]: (...args) => {
      // A failed write that got some bytes out first: the worst case for a reader.
      if (name === 'writeFileSync') fs.writeSync(args[0], '{"id":"REG-PR-912-a","ki')
      throw error
    }
  })
  const arrange = (t) => {
    const { root, cases } = tree(t)
    writeFileSync(join(root, 'input.json'), JSON.stringify(fields()))
    return { root, cases, options: { root, pr: '912', slug: 'a', input: join(root, 'input.json') } }
  }

  test('a failed write removes the incomplete file it created', async (t) => {
    const { createCase } = await allocator()
    const { root, cases, options } = arrange(t)
    assert.throws(
      () => createCase(options, failing('writeFileSync')),
      /could not write .*incomplete file was removed/
    )
    assert.deepEqual(readdirSync(cases), [])
    assert.deepEqual(loadCatalogue(root), [])
  })

  test('a failed close removes the file it created', async (t) => {
    const { writeExclusive } = await allocator()
    const { cases } = arrange(t)
    const dest = join(cases, 'REG-PR-912-a.json')
    // Only the allocator's own descriptor fails to close.
    let calls = 0
    const io = {
      ...fs,
      closeSync: (fd) => {
        fs.closeSync(fd)
        if (calls++ === 0) throw new Error('EIO: i/o error')
      }
    }
    assert.throws(() => writeExclusive(dest, 'text\n', io), /could not write .*incomplete file was removed/)
    assert.deepEqual(readdirSync(cases), [])
  })

  test('a cleanup that fails too is reported, never claimed as done', async (t) => {
    const { writeExclusive, createCase } = await allocator()
    const { root, cases, options } = arrange(t)
    const dest = join(cases, 'REG-PR-912-a.json')
    const stuck = {
      unlinkSync: () => {
        throw new Error('EPERM: operation not permitted')
      }
    }
    // Write fails, then the removal fails: the half-written file is still there, and the error says so.
    assert.throws(
      () => createCase(options, { ...failing('writeFileSync'), ...stuck }),
      (error) => {
        assert.match(error.message, /could not write .*ENOSPC/)
        assert.match(
          error.message,
          /could NOT be removed \(EPERM: operation not permitted\): delete it by hand/
        )
        assert.doesNotMatch(error.message, /was removed/)
        return true
      }
    )
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-a.json'])
    // What is left is not a case: a reader refuses it instead of loading half a file.
    assert.throws(() => loadCatalogue(root), /REG-PR-912-a\.json/)
    rmSync(dest)
    // Close fails, then the removal fails.
    let calls = 0
    const closeFails = {
      ...fs,
      ...stuck,
      closeSync: (fd) => {
        fs.closeSync(fd)
        if (calls++ === 0) throw new Error('EIO: i/o error')
      }
    }
    assert.throws(
      () => writeExclusive(dest, 'text\n', closeFails),
      (error) =>
        /could not write .*EIO.*could NOT be removed/.test(error.message) &&
        !/was removed/.test(error.message)
    )
    assert.deepEqual(readdirSync(cases), ['REG-PR-912-a.json'])
  })

  test('a failed create leaves an existing file alone', async (t) => {
    const { createCase } = await allocator()
    const { cases, options } = arrange(t)
    const dest = join(cases, 'REG-PR-912-a.json')
    writeFileSync(dest, 'someone else wrote this\n')
    for (const io of [
      fs,
      failing('openSync', Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }))
    ]) {
      // With the real disk the destination exists; with the failing one the input cannot be opened.
      assert.throws(() => createCase(options, io), /already exists — nothing was written|cannot read --input/)
      assert.equal(readFileSync(dest, 'utf8'), 'someone else wrote this\n')
    }
  })

  test('a destination the disk refuses to create is an error that removes nothing', async (t) => {
    const { writeExclusive } = await allocator()
    const { cases } = arrange(t)
    const dest = join(cases, 'REG-PR-912-a.json')
    const denied = failing(
      'openSync',
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    )
    let unlinked = 0
    assert.throws(
      () => writeExclusive(dest, 'text\n', { ...denied, unlinkSync: () => unlinked++ }),
      /cannot create .*EACCES/
    )
    assert.equal(unlinked, 0)
  })

  test('a half-written case left by something else is refused by the reader', (t) => {
    const { root, cases } = arrange(t)
    writeFileSync(join(cases, 'REG-PR-912-a.json'), '{"id":"REG-PR-912-a","ki')
    assert.throws(() => loadCatalogue(root), /REG-PR-912-a\.json: not valid JSON/)
  })
})
