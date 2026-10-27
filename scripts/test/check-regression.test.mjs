#!/usr/bin/env node
/**
 * The `Regression` gate. The decision (`judge`, `prKind`, `noneReason`) is pure, so its matrix runs
 * on inline data. One throwaway repository (under `$TCH_TEST_ARTIFACTS_DIR` when set, the OS temp
 * dir otherwise) covers what is a git behaviour and not a decision: a PASS commit on the branch,
 * one already on the target branch, and one that does not exist — each through the real script,
 * the way CI runs it.
 *
 *   node --test scripts/test/check-regression.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as gate from '../check-regression.mjs'
import { judge, noneReason, prKind } from '../check-regression.mjs'
import { envWithoutGitLocation } from '../check-push.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../check-regression.mjs')
const ENV = {
  ...envWithoutGitLocation(process.env),
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null'
}

/** A valid case object of the given kind. */
const kase = (id, kind = 'fix') => ({
  id,
  kind,
  title: 'A button stays enabled',
  // A PR-owned id names its pull request; a legacy id says nothing about it.
  pr: Number(/^REG-PR-(\d+)-/.exec(id)?.[1] ?? 1),
  area: 'site-changes/backup',
  cms: ['any'],
  needs: ['stand'],
  flaky_model: false,
  steps: ['Open the tab'],
  expect: ['button has no disabled attribute'],
  selectors: { button: '[data-backup-create]' },
  run: { cmd: ['node', '--test', 'x.test.mjs'] }
})

const changed = (id, kind) => ({
  path: `tests/regression/cases/${id}-x.json`,
  problems: [],
  value: kase(id, kind)
})
const pass = (id, where = 'branch') => ({ id, verdict: 'PASS', commit: 'abc1234', where })
const base = { body: '', changedCases: [], resultProblems: [], results: [] }

describe('kind of a pull request', () => {
  test('title prefix decides', () => {
    assert.equal(prKind('fix(site-tabs): x', 'whatever'), 'fix')
    assert.equal(prKind('feat: x', 'whatever'), 'feat')
    assert.equal(prKind('feat(api)!: x', 'whatever'), 'feat')
  })
  test('branch prefix decides when the title does not', () => {
    assert.equal(prKind('Update things', 'fix/button'), 'fix')
    assert.equal(prKind('Update things', 'feat/button'), 'feat')
  })
  test('fix wins over feat when title and branch disagree', () => {
    assert.equal(prKind('feat: x', 'fix/y'), 'fix')
    assert.equal(prKind('fix: x', 'feat/y'), 'fix')
  })
  test('docs, chore, ci, refactor are skipped', () => {
    assert.equal(prKind('docs: x', 'docs/y'), null)
    assert.equal(prKind('chore(deps): x', 'chore/y'), null)
    assert.equal(prKind('fixup: x', 'fixes-y'), null)
  })
})

describe('the none line', () => {
  test('reads the reason after the dash', () => {
    assert.equal(
      noneReason('### Regression\n\nRegression: none — test infrastructure only\n'),
      'test infrastructure only'
    )
    assert.equal(noneReason('Regression: none - plain hyphen reason'), 'plain hyphen reason')
  })
  test('ignores the example inside the template comment', () => {
    assert.equal(noneReason('<!--\nRegression: none — <reason>\n-->\n'), null)
  })
})

describe('the decision, on inline data', () => {
  test('a docs PR is skipped', () => {
    const r = judge({ ...base, kind: null })
    assert.equal(r.code, 0)
    assert.match(r.stdout, /skipped/)
  })

  test('a fix PR with no case is red and says what is missing', () => {
    const r = judge({ ...base, kind: 'fix' })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /adds\/edits no case with `kind: "fix"`/)
  })

  test('a fix PR with a fix case and a PASS on a branch commit is green', () => {
    const r = judge({ ...base, kind: 'fix', changedCases: [changed('REG-020')], results: [pass('REG-020')] })
    assert.equal(r.code, 0)
    assert.match(r.stdout, /REG-020/)
  })

  test('a case without any result is red', () => {
    const r = judge({ ...base, kind: 'fix', changedCases: [changed('REG-020')] })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /REG-020: no result line yet/)
  })

  test('a FAIL result does not count', () => {
    const results = [{ id: 'REG-020', verdict: 'FAIL', commit: 'abc1234', where: 'branch' }]
    const r = judge({ ...base, kind: 'fix', changedCases: [changed('REG-020')], results })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /no PASS line \(FAIL\)/)
  })

  test('a PASS on a foreign, a base or a missing commit is red', () => {
    for (const [where, words] of [
      ['foreign', /not in this branch history/],
      ['base', /already on the target branch/],
      ['missing', /does not exist in the repo/]
    ]) {
      const r = judge({
        ...base,
        kind: 'fix',
        changedCases: [changed('REG-020')],
        results: [pass('REG-020', where)]
      })
      assert.equal(r.code, 1, where)
      assert.match(r.stderr, words)
    }
  })

  test('a case of the other kind does not satisfy the gate', () => {
    const r = judge({
      ...base,
      kind: 'fix',
      changedCases: [changed('REG-020', 'feat')],
      results: [pass('REG-020')]
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /REG-020 changed, but with another kind/)
  })

  test('a feat PR with a reasoned none line is green', () => {
    const r = judge({ ...base, kind: 'feat', body: 'Regression: none — internal tooling, no user path' })
    assert.equal(r.code, 0)
    assert.match(r.stdout, /none — internal tooling/)
  })

  test('a feat none line with a short reason is red', () => {
    const r = judge({ ...base, kind: 'feat', body: 'Regression: none — n/a' })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /too short/)
  })

  test('a fix PR may not use none', () => {
    const r = judge({ ...base, kind: 'fix', body: 'Regression: none — cannot reproduce it anywhere at all' })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /only for feat/)
  })

  test('an invalid case file is red even with a PASS', () => {
    const bad = {
      path: 'tests/regression/cases/REG-020-x.json',
      problems: ['`steps` must be a non-empty list of strings']
    }
    const r = judge({
      ...base,
      kind: 'feat',
      body: 'Regression: none — long enough reason',
      changedCases: [bad]
    })
    assert.equal(r.code, 1)
    assert.match(r.stderr, /REG-020-x\.json: `steps`/)
  })
})

describe('a case file the diff touched, on inline data', () => {
  const NEW = 'REG-PR-912-backup-button'
  const file = (id, name = `${id}.json`) => `tests/regression/cases/${name}`
  const inspect = (over) =>
    gate.inspectCase({
      path: file(NEW),
      mode: '100644',
      added: true,
      read: () => JSON.stringify(kase(NEW)),
      ...over
    })

  test('an added case with a PR-owned id is accepted', () => {
    assert.deepEqual(inspect({}), { path: file(NEW), problems: [], value: kase(NEW) })
    assert.deepEqual(inspect({ mode: '100755' }).problems, [])
  })

  test('an added case with a legacy id is refused; the same case edited is accepted', () => {
    const legacy = {
      path: file('REG-020', 'REG-020-thing.json'),
      read: () => JSON.stringify(kase('REG-020'))
    }
    const added = inspect({ ...legacy, added: true })
    assert.equal(added.value, undefined)
    assert.match(added.problems.join('\n'), /a new case takes a PR-owned id: REG-PR-<PR number>-<slug>/)
    assert.match(added.problems.join('\n'), /REG-020 is a legacy number/)
    assert.deepEqual(inspect({ ...legacy, added: false }).problems, [])
    assert.deepEqual(inspect({ ...legacy, added: false }).value, kase('REG-020'))
  })

  test('a case the diff adds or edits carries its run script, unless it judges the model', () => {
    const { run: _drop, ...noRun } = kase(NEW)
    for (const added of [true, false]) {
      const r = inspect({ added, read: () => JSON.stringify(noRun) })
      assert.equal(r.value, undefined)
      assert.match(r.problems.join('\n'), /carries no `run`/)
    }
    assert.deepEqual(inspect({ read: () => JSON.stringify({ ...noRun, flaky_model: true }) }).problems, [])
  })

  test('a symlink or a submodule in the cases folder is refused without being read', () => {
    for (const mode of ['120000', '160000', '040000', '']) {
      const r = inspect({
        mode,
        read: () => {
          throw new Error('must not be read')
        }
      })
      assert.match(r.problems.join('\n'), /must be a regular file/, mode)
      assert.equal(r.value, undefined)
    }
  })

  test('malformed ids, a wrong file name, a wrong pr and broken JSON are problems', () => {
    for (const [name, text] of [
      ['REG-PR-912-Backup.json', JSON.stringify(kase('REG-PR-912-Backup'))],
      ['REG-12-thing.json', JSON.stringify(kase('REG-12'))],
      ['REG-PR-912-other.json', JSON.stringify(kase(NEW))],
      [`${NEW}.json`, JSON.stringify({ ...kase(NEW), pr: 913 })],
      [`${NEW}.json`, '{"id":'],
      [`${NEW}.json`, ''],
      ['notes.json', '{}']
    ]) {
      const r = inspect({ path: `tests/regression/cases/${name}`, read: () => text })
      assert.ok(r.problems.length > 0, name)
      assert.equal(r.value, undefined, name)
    }
  })

  test('an id another file at the head also carries is a problem on the touched case', () => {
    const touched = [
      inspect({}),
      inspect({
        path: file('REG-020', 'REG-020-mine.json'),
        added: false,
        read: () => JSON.stringify(kase('REG-020'))
      })
    ]
    const head = [
      { id: NEW, path: file(NEW) },
      { id: 'REG-020', path: file('REG-020', 'REG-020-mine.json') },
      { id: 'REG-020', path: file('REG-020', 'REG-020-theirs.json') },
      { id: 'REG-030', path: file('REG-030', 'REG-030-a.json') },
      { id: 'REG-030', path: file('REG-030', 'REG-030-b.json') }
    ]
    const [fresh, clash] = gate.flagDuplicates(touched, head)
    // REG-030 is duplicated too, but this diff did not touch it: it is not this pull request's finding.
    assert.deepEqual(fresh, touched[0])
    assert.equal(clash.value, undefined)
    assert.deepEqual(clash.problems, [
      'id REG-020 is also carried by tests/regression/cases/REG-020-theirs.json'
    ])
    assert.equal(judge({ ...base, kind: 'fix', changedCases: [clash], results: [pass('REG-020')] }).code, 1)
  })
})

describe('the real script on a throwaway repository', () => {
  const NEW = 'REG-PR-912-thing'
  const casePath = (id) => `tests/regression/cases/${id.startsWith('REG-PR-') ? id : `${id}-thing`}.json`

  /**
   * A repository with `main` (carrying the legacy case REG-010) and a `fix/x` branch that fixes
   * something; `addCase` then adds a case on the branch.
   * @param {import('node:test').TestContext} t - removes the repository at the end.
   */
  function fixture(t) {
    const root = process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()
    mkdirSync(root, { recursive: true })
    const dir = mkdtempSync(join(root, 'check-regression-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const git = (...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' }).trim()
    const write = (path, text) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const commit = (message) => {
      git('add', '-A')
      git('commit', '-q', '--allow-empty', '-m', message)
      return git('rev-parse', 'HEAD')
    }
    git('init', '-q', '-b', 'main')
    write('README.md', 'x\n')
    write(casePath('REG-010'), JSON.stringify(kase('REG-010')))
    let mainSha = commit('base')
    git('checkout', '-q', '-b', 'fix/x')
    write('src/fix.js', 'export const fixed = true\n')
    const fixSha = commit('fix: the thing')
    const addCase = (id = NEW, value = kase(id), path = casePath(id)) => {
      write(path, typeof value === 'string' ? value : JSON.stringify(value))
      return commit('test: add case')
    }
    let n = 0
    /** Commit one raw result line in a new result file. */
    const rawResult = (line) => {
      write(`tests/regression/results/2026-10-03-x${String(n++)}.jsonl`, `${line}\n`)
      return commit('test: record result')
    }
    const result = (sha, id = NEW, verdict = 'PASS') =>
      rawResult(
        JSON.stringify({ id, verdict, commit: sha, ran_at: '2026-10-03T00:00:00.000Z', evidence: 'x' })
      )
    /** Commit on `main` after the branch was cut, then come back to the branch. */
    const onMain = (work) => {
      git('checkout', '-q', 'main')
      work()
      mainSha = commit('main moves on')
      git('checkout', '-q', 'fix/x')
      return mainSha
    }
    const merge = () => {
      git('merge', '-q', '--no-ff', '-m', 'merge main', 'main')
      return git('rev-parse', 'HEAD')
    }
    /** Run the real gate on raw payload text. */
    const gateRaw = (text, env = ENV) => {
      const path = join(dir, '..', `${dir.split('/').pop()}-payload.json`)
      writeFileSync(path, text)
      t.after(() => rmSync(path, { force: true }))
      return spawnSync(process.execPath, [SCRIPT, path], { cwd: dir, env, encoding: 'utf8' })
    }
    const gate = (head = git('rev-parse', 'HEAD'), over = {}, env = ENV) =>
      gateRaw(
        JSON.stringify({
          pull_request: {
            title: 'fix: the thing',
            body: '',
            head: { ref: 'fix/x', sha: head },
            base: { sha: mainSha },
            ...over
          }
        }),
        env
      )
    return {
      dir,
      fixSha,
      addCase,
      result,
      rawResult,
      commit,
      write,
      git,
      onMain,
      merge,
      gate,
      gateRaw,
      mainSha: () => mainSha
    }
  }

  test('PASS on a commit of the branch is green, for a PR-owned id', (t) => {
    const f = fixture(t)
    f.addCase()
    const r = f.gate(f.result(f.fixSha))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /REG-PR-912-thing has a PASS/)
  })

  test('PASS on the target branch commit is red', (t) => {
    const f = fixture(t)
    f.addCase()
    const r = f.gate(f.result(f.mainSha()))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /already on the target branch/)
  })

  test('PASS on an unknown commit is red', (t) => {
    const f = fixture(t)
    f.addCase()
    const r = f.gate(f.result('0123456789abcdef0123456789abcdef01234567'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /does not exist in the repo/)
  })

  test('PASS on a commit outside the branch history is red', (t) => {
    const f = fixture(t)
    f.addCase()
    const foreign = f.onMain(() => f.write('later.md', 'x\n'))
    const r = f.gate(f.result(foreign))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /not in this branch history/)
  })

  test('no result, a FAIL, and a PASS for another id are red', (t) => {
    const f = fixture(t)
    f.addCase()
    const none = f.gate()
    assert.equal(none.status, 1)
    assert.match(none.stderr, /REG-PR-912-thing: no result line yet/)
    const other = f.gate(f.result(f.fixSha, 'REG-PR-912-thing-else'))
    assert.equal(other.status, 1)
    assert.match(other.stderr, /REG-PR-912-thing: no result line yet/)
    const failed = f.gate(f.result(f.fixSha, NEW, 'FAIL'))
    assert.equal(failed.status, 1)
    assert.match(failed.stderr, /no PASS line \(FAIL\)/)
  })

  test('a result line with a malformed id or verdict is reported and is not evidence', (t) => {
    for (const line of [
      { id: 'REG-PR-912-Thing', verdict: 'PASS' },
      { id: 'REG-PR-0912-thing', verdict: 'PASS' },
      { id: NEW, verdict: 'PASSED' },
      { id: NEW }
    ]) {
      const f = fixture(t)
      f.addCase()
      const r = f.gate(f.rawResult(JSON.stringify({ commit: f.fixSha, ran_at: 'x', evidence: 'y', ...line })))
      assert.equal(r.status, 1, JSON.stringify(line))
      assert.match(r.stderr, /results\/2026-10-03-x0\.jsonl: line 1:/, JSON.stringify(line))
    }
  })

  test('a fix may still not write none instead of a case', (t) => {
    const f = fixture(t)
    const r = f.gate(undefined, { body: 'Regression: none — cannot reproduce it anywhere at all' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /only for feat/)
  })

  test('a new case under a legacy number is red and says how to create it', (t) => {
    const f = fixture(t)
    f.addCase('REG-020')
    const r = f.gate(f.result(f.fixSha, 'REG-020'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /REG-020-thing\.json: a new case takes a PR-owned id/)
    assert.match(r.stderr, /tests\/regression\/create\.mjs --pr/)
  })

  test('editing a legacy case of the target branch keeps its id and is green with a branch PASS', (t) => {
    const f = fixture(t)
    f.write(casePath('REG-010'), JSON.stringify({ ...kase('REG-010'), title: 'Sharper wording' }))
    f.commit('test: sharpen the case')
    const r = f.gate(f.result(f.fixSha, 'REG-010'))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /REG-010 has a PASS/)
  })

  test('an edit cannot give an existing case another id', (t) => {
    for (const id of ['REG-011', 'REG-PR-912-thing']) {
      const f = fixture(t)
      f.write(casePath('REG-010'), JSON.stringify(kase(id)))
      f.commit('test: renumber')
      const r = f.gate(f.result(f.fixSha, id))
      assert.equal(r.status, 1, id)
      assert.match(r.stderr, /REG-010-thing\.json: file name must/, id)
    }
  })

  test('legacy cases the target branch gained meanwhile need nothing from this pull request', (t) => {
    const f = fixture(t)
    f.addCase()
    f.result(f.fixSha)
    // Another session merges two legacy cases while this branch is open; one edits REG-010.
    f.onMain(() => {
      f.write(casePath('REG-030'), JSON.stringify(kase('REG-030')))
      f.write(casePath('REG-031'), JSON.stringify(kase('REG-031', 'feat')))
      f.write(casePath('REG-010'), JSON.stringify({ ...kase('REG-010'), title: 'Edited on main' }))
    })
    // Before the branch takes the target in: judged against the moved target.
    const before = f.gate()
    assert.equal(before.status, 0, before.stderr)
    // After merging the target: its legacy cases are not this diff's, and ask for no evidence.
    const after = f.gate(f.merge())
    assert.equal(after.status, 0, after.stderr)
    assert.match(after.stdout, /^Regression: REG-PR-912-thing has a PASS/)
    assert.doesNotMatch(after.stdout + after.stderr, /REG-03[01]|REG-010/)
  })

  test('two pull requests with the same slug both pass after one merges', (t) => {
    const f = fixture(t)
    f.addCase()
    f.result(f.fixSha)
    f.onMain(() => f.write(casePath('REG-PR-913-thing'), JSON.stringify(kase('REG-PR-913-thing'))))
    const r = f.gate(f.merge())
    assert.equal(r.status, 0, r.stderr)
  })

  test('an id the target branch already carries in another file is red on this case', (t) => {
    const f = fixture(t)
    // Same legacy number, another slug: git sees two file names and merges without a conflict.
    f.write('tests/regression/cases/REG-010-mine.json', JSON.stringify(kase('REG-010')))
    f.commit('test: second file for REG-010')
    const r = f.gate(f.result(f.fixSha, 'REG-010'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /REG-010-mine\.json: a new case takes a PR-owned id/)
    // And an EDITED legacy case whose number is taken twice at the head:
    const g = fixture(t)
    g.onMain(() => g.write('tests/regression/cases/REG-010-theirs.json', JSON.stringify(kase('REG-010'))))
    g.write(casePath('REG-010'), JSON.stringify({ ...kase('REG-010'), title: 'Edited here' }))
    g.commit('test: edit')
    g.result(g.fixSha, 'REG-010')
    const clash = g.gate(g.merge())
    assert.equal(clash.status, 1)
    assert.match(
      clash.stderr,
      /REG-010-thing\.json: id REG-010 is also carried by tests\/regression\/cases\/REG-010-theirs\.json/
    )
  })

  test('a badly named or broken case file is red, never skipped', (t) => {
    for (const [path, value] of [
      // Not `-Thing`: on a case-insensitive disk (macOS) that is the fixture's own `-thing` file.
      ['tests/regression/cases/REG-PR-912-Upper.json', kase('REG-PR-912-Upper')],
      ['tests/regression/cases/REG-12-thing.json', kase('REG-12')],
      ['tests/regression/cases/REG-PR-912-thing-extra.json', kase(NEW)],
      ['tests/regression/cases/REG-PR-912-案.json', kase(NEW)],
      [casePath(NEW), { ...kase(NEW), pr: 913 }],
      [casePath(NEW), '{"id":"REG-PR-912-thing","ki'],
      [casePath(NEW), ''],
      ['tests/regression/cases/notes.json', {}]
    ]) {
      const f = fixture(t)
      f.addCase()
      f.addCase(NEW, value, path)
      const r = f.gate(f.result(f.fixSha))
      assert.equal(r.status, 1, path)
      assert.match(r.stderr, /Invalid regression case or result file/, path)
      assert.ok(r.stderr.includes(`- ${path}: `), `${path}\n${r.stderr}`)
    }
  })

  test('a case that is a symlink is red, added or retyped', (t) => {
    const added = fixture(t)
    added.write('outside.json', JSON.stringify(kase(NEW)))
    symlinkSync('../../../outside.json', join(added.dir, casePath(NEW)))
    added.commit('test: add a link')
    const a = added.gate(added.result(added.fixSha))
    assert.equal(a.status, 1)
    assert.match(a.stderr, /REG-PR-912-thing\.json: must be a regular file/)

    const retyped = fixture(t)
    retyped.write('outside.json', JSON.stringify(kase('REG-010')))
    rmSync(join(retyped.dir, casePath('REG-010')))
    symlinkSync('../../../outside.json', join(retyped.dir, casePath('REG-010')))
    retyped.commit('test: turn the case into a link')
    const b = retyped.gate(retyped.result(retyped.fixSha, 'REG-010'))
    assert.equal(b.status, 1)
    assert.match(b.stderr, /REG-010-thing\.json: must be a regular file/)
  })

  test('an unreadable or malformed payload exits 2, never green', (t) => {
    const f = fixture(t)
    f.addCase()
    f.result(f.fixSha)
    for (const payload of [
      '',
      '{',
      'null',
      '[]',
      '"x"',
      '{"pull_request":null}',
      '{"pull_request":"x"}',
      '{"pull_request":[]}'
    ]) {
      const r = f.gateRaw(payload)
      assert.equal(r.status, 2, payload)
      assert.match(r.stderr, /^check-regression: cannot read the payload or git/, payload)
      assert.equal(r.stdout, '', payload)
    }
    const missing = spawnSync(process.execPath, [SCRIPT, join(f.dir, 'no-such-payload.json')], {
      cwd: f.dir,
      env: ENV,
      encoding: 'utf8'
    })
    assert.equal(missing.status, 2)
    const fixWithoutShas = f.gate(undefined, { head: { ref: 'fix/x' }, base: {} })
    assert.equal(fixWithoutShas.status, 2)
  })

  test('a failing git command exits 2, never green', (t) => {
    const f = fixture(t)
    f.addCase()
    f.result(f.fixSha)
    const unknownBase = f.gate(undefined, { base: { sha: '0123456789abcdef0123456789abcdef01234567' } })
    assert.equal(unknownBase.status, 2)
    assert.match(unknownBase.stderr, /^check-regression: cannot read the payload or git/)
    const unknownHead = f.gate('0123456789abcdef0123456789abcdef01234567')
    assert.equal(unknownHead.status, 2)
    // Outside any repository at all.
    const outside = mkdtempSync(
      join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'check-regression-nogit-')
    )
    t.after(() => rmSync(outside, { recursive: true, force: true }))
    const payload = join(outside, 'payload.json')
    writeFileSync(
      payload,
      JSON.stringify({
        pull_request: {
          title: 'fix: x',
          body: '',
          head: { ref: 'fix/x', sha: f.fixSha },
          base: { sha: f.mainSha() }
        }
      })
    )
    const r = spawnSync(process.execPath, [SCRIPT, payload], {
      cwd: outside,
      env: { ...ENV, GIT_CEILING_DIRECTORIES: dirname(outside) },
      encoding: 'utf8'
    })
    assert.equal(r.status, 2)
  })

  test('a git that fails while placing a result commit exits 2, never green', (t) => {
    const f = fixture(t)
    f.addCase()
    f.result(f.fixSha)
    // A PASS on the target branch too: read as "not on the base", the failure would count it.
    const head = f.result(f.mainSha())
    // A `git` first on PATH that is the real one, except for the one question it is told to fail.
    const bin = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'check-regression-git-'))
    t.after(() => rmSync(bin, { recursive: true, force: true }))
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\n' +
        'if [ "$1 $2" = "$FAKE_GIT_QUESTION" ] && { [ -z "$FAKE_GIT_AGAINST" ] || [ "$4" = "$FAKE_GIT_AGAINST" ]; }; then\n' +
        '  if [ "$FAKE_GIT_HOW" = "signal" ]; then kill -KILL $$; fi\n' +
        '  echo "fatal: injected failure" >&2\n' +
        '  exit 128\n' +
        'fi\n' +
        'exec "$REAL_GIT" "$@"\n',
      { mode: 0o755 }
    )
    const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { env: ENV, encoding: 'utf8' }).trim()
    const failing = (question, against = '', how = 'exit') => ({
      ...ENV,
      PATH: `${bin}:${ENV.PATH}`,
      REAL_GIT: realGit,
      FAKE_GIT_QUESTION: question,
      FAKE_GIT_AGAINST: against,
      FAKE_GIT_HOW: how
    })
    // The wrapper changes nothing while it fails no question: red for the target-branch PASS alone
    // would be wrong here, the branch's own PASS makes this pull request green.
    const untouched = f.gate(head, {}, failing('no such'))
    assert.equal(untouched.status, 0, untouched.stderr)
    for (const [name, env] of [
      ['does the commit exist', failing('rev-parse --verify')],
      ['is it an ancestor of the head', failing('merge-base --is-ancestor', head)],
      ['is it an ancestor of the merge base', failing('merge-base --is-ancestor', f.mainSha())],
      ['killed by a signal', failing('merge-base --is-ancestor', f.mainSha(), 'signal')]
    ]) {
      const r = f.gate(head, {}, env)
      assert.equal(r.status, 2, `${name}: ${r.stdout}${r.stderr}`)
      assert.equal(r.stdout, '', name)
      assert.match(r.stderr, /^check-regression: cannot read the payload or git — git /, name)
    }
    // Only the target-branch PASS, and the base question fails: the old reading made this green.
    const g = fixture(t)
    g.addCase()
    const onlyBase = g.result(g.mainSha())
    assert.equal(g.gate(onlyBase).status, 1)
    const r = g.gate(onlyBase, {}, failing('merge-base --is-ancestor', g.mainSha()))
    assert.equal(r.status, 2, r.stdout + r.stderr)
  })

  test('an event that is not a pull request is skipped, as before', (t) => {
    const f = fixture(t)
    const r = f.gateRaw('{"ref":"refs/heads/develop"}')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /not a pull_request event — skipped/)
  })

  test('a docs pull request is skipped without reading git', (t) => {
    const root = process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()
    mkdirSync(root, { recursive: true })
    const dir = mkdtempSync(join(root, 'check-regression-docs-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const path = join(dir, 'payload.json')
    writeFileSync(
      path,
      JSON.stringify({
        pull_request: {
          title: 'docs: words',
          body: '',
          head: { ref: 'docs/x', sha: 'x' },
          base: { sha: 'y' }
        }
      })
    )
    const r = spawnSync(process.execPath, [SCRIPT, path], { cwd: dir, env: ENV, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /skipped/)
  })
})
