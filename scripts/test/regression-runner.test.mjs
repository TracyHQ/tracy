#!/usr/bin/env node
/**
 * The regression runner and the catalogue format (`tests/regression/`): argument parsing, case
 * selection, verdict parsing, result lines — and the real catalogue, which must load whole.
 * Nothing here starts Codex or a stand.
 *
 *   node --test scripts/test/regression-runner.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  formatResult,
  isCasePath,
  parseCase,
  parseResults,
  resultPath
} from '../../tests/regression/catalogue.mjs'
import {
  buildPrompt,
  codexArgs,
  devFit,
  devPlan,
  evidencePath,
  loadCatalogue,
  parseArgs,
  parseVerdict,
  selectCases,
  verdictReason
} from '../../tests/regression/run.mjs'
// Read through the namespace so this file still loads against a runner that lacks the export.
import * as runner from '../../tests/regression/run.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RUNNER = resolve(ROOT, 'tests/regression/run.mjs')

const kase = (over) => ({
  id: 'REG-001',
  kind: 'fix',
  title: 't',
  pr: 1,
  area: 'site-changes/backup',
  cms: ['em'],
  needs: ['stand'],
  flaky_model: false,
  steps: ['s'],
  expect: ['e'],
  selectors: {},
  ...over
})

describe('arguments', () => {
  test('a run needs a stand unless it is a dry run', () => {
    assert.throws(() => parseArgs([]), /--stand/)
    assert.equal(parseArgs(['--dry-run']).dryRun, true)
    assert.equal(parseArgs(['--stand', 'http://tracy.test:8080']).stand, 'http://tracy.test:8080')
  })
  test('lists split on commas and repeat', () => {
    const o = parseArgs(['--dry-run', '--id', 'REG-001,REG-002', '--id', 'REG-003', '--area', 'site-tools'])
    assert.deepEqual(o.ids, ['REG-001', 'REG-002', 'REG-003'])
    assert.deepEqual(o.areas, ['site-tools'])
  })
  test('unknown flags and bad kinds throw', () => {
    assert.throws(() => parseArgs(['--dry-run', '--nope']), /unknown flag/)
    assert.throws(() => parseArgs(['--dry-run', '--kind', 'docs']), /fix or feat/)
    assert.throws(() => parseArgs(['--dry-run', '--id']), /needs a value/)
  })
  test('--id takes whole ids of either form and refuses anything else', () => {
    assert.deepEqual(parseArgs(['--dry-run', '--id', 'REG-001, REG-PR-912-backup-button']).ids, [
      'REG-001',
      'REG-PR-912-backup-button'
    ])
    for (const value of [
      'REG-1',
      'REG-PR-912',
      'REG-PR-0-x',
      'REG-PR-912-Upper',
      'reg-001',
      'REG-001-x',
      '912',
      '*'
    ])
      assert.throws(() => parseArgs(['--dry-run', '--id', value]), /a case id looks like REG-PR-/, value)
    assert.throws(() => parseArgs(['--dry-run', '--id', 'REG-001,REG-PR-1']), /--id REG-PR-1:/)
    // An empty item is judged like any other, wherever it sits: nothing is dropped before the check.
    for (const empty of [
      ',',
      ' , ',
      ' ',
      'REG-001,',
      ',REG-001',
      'REG-001,,REG-002',
      'REG-001, ,REG-PR-912-backup-button',
      'REG-PR-912-backup-button,'
    ])
      assert.throws(
        () => parseArgs(['--dry-run', '--id', empty]),
        /--id .*\(empty item\).*: a case id looks like REG-PR-/,
        empty
      )
    assert.throws(() => parseArgs(['--dry-run', '--id', 'REG-001', '--id', 'REG-002,']), /\(empty item\)/)
  })
})

describe('selection', () => {
  const all = [
    kase({ id: 'REG-003', area: 'site-tools/joomla', cms: ['jo'], flaky_model: true }),
    kase({ id: 'REG-001' }),
    kase({ id: 'REG-002', kind: 'feat', area: 'site-changes/record', cms: ['any'] })
  ]
  const none = { ids: [], areas: [], kind: null, cms: null, noModel: false }
  test('no filter keeps all, sorted by id', () => {
    assert.deepEqual(
      selectCases(all, none).map((c) => c.id),
      ['REG-001', 'REG-002', 'REG-003']
    )
  })
  test('area matches a prefix on a path boundary', () => {
    assert.deepEqual(
      selectCases(all, { ...none, areas: ['site-changes'] }).map((c) => c.id),
      ['REG-001', 'REG-002']
    )
    assert.deepEqual(selectCases(all, { ...none, areas: ['site-change'] }), [])
  })
  test('kind, cms (any matches every CMS) and no-model filter', () => {
    assert.deepEqual(
      selectCases(all, { ...none, kind: 'feat' }).map((c) => c.id),
      ['REG-002']
    )
    assert.deepEqual(
      selectCases(all, { ...none, cms: 'jo' }).map((c) => c.id),
      ['REG-002', 'REG-003']
    )
    assert.deepEqual(
      selectCases(all, { ...none, noModel: true }).map((c) => c.id),
      ['REG-001', 'REG-002']
    )
  })
  test('ids', () => {
    assert.deepEqual(
      selectCases(all, { ...none, ids: ['REG-003'] }).map((c) => c.id),
      ['REG-003']
    )
  })
  const mixed = [
    ...all,
    kase({ id: 'REG-PR-100-backup', pr: 100 }),
    kase({ id: 'REG-PR-99-backup', pr: 99, kind: 'feat' }),
    kase({ id: 'REG-PR-99-backup-button', pr: 99 }),
    kase({ id: 'REG-PR-9-backup', pr: 9 })
  ]
  test('legacy and PR-owned cases sort together: legacy first, then by PR number', () => {
    assert.deepEqual(
      selectCases(mixed, none).map((c) => c.id),
      [
        'REG-001',
        'REG-002',
        'REG-003',
        'REG-PR-9-backup',
        'REG-PR-99-backup',
        'REG-PR-99-backup-button',
        'REG-PR-100-backup'
      ]
    )
  })
  test('an id selects exactly its case, never one that merely starts the same', () => {
    assert.deepEqual(
      selectCases(mixed, { ...none, ids: ['REG-PR-99-backup'] }).map((c) => c.id),
      ['REG-PR-99-backup']
    )
    assert.deepEqual(
      selectCases(mixed, { ...none, ids: ['REG-PR-9-backup', 'REG-001'] }).map((c) => c.id),
      ['REG-001', 'REG-PR-9-backup']
    )
    assert.deepEqual(selectCases(mixed, { ...none, ids: ['REG-PR-99-back'] }), [])
  })
  test('a requested id that selects nothing is named, with why', () => {
    const pick = (o) => runner.unmatchedIds(mixed, selectCases(mixed, { ...none, ...o }), o.ids)
    assert.deepEqual(pick({ ids: ['REG-001', 'REG-PR-99-backup'] }), [])
    assert.deepEqual(pick({ ids: ['REG-PR-99-back', 'REG-001', 'REG-999'] }), [
      'REG-PR-99-back: no such case in tests/regression/cases/',
      'REG-999: no such case in tests/regression/cases/'
    ])
    assert.deepEqual(pick({ ids: ['REG-PR-99-backup', 'REG-001'], kind: 'fix' }), [
      'REG-PR-99-backup: left out by the other filters (--area/--kind/--cms/--no-model)'
    ])
    assert.deepEqual(pick({ ids: [] }), [])
  })
})

describe('verdicts and result lines', () => {
  test('the last VERDICT line wins; none printed is BLOCKED', () => {
    assert.equal(parseVerdict('VERDICT: FAIL\nretry\nVERDICT: PASS\n'), 'PASS')
    assert.equal(parseVerdict('looks fine to me'), 'BLOCKED')
  })
  test('a result line round-trips through the parser', () => {
    const line = formatResult({
      id: 'REG-001',
      verdict: 'PASS',
      commit: 'abc1234',
      ranAt: new Date('2026-10-03T01:02:03Z'),
      evidence: 'x.log'
    })
    const { lines, problems } = parseResults(
      `${line}\n\nnot json\n{"id":"REG-002","verdict":"MAYBE","commit":"a","ran_at":"b"}\n`
    )
    assert.deepEqual(lines, [
      {
        id: 'REG-001',
        verdict: 'PASS',
        commit: 'abc1234',
        ran_at: '2026-10-03T01:02:03.000Z',
        evidence: 'x.log'
      }
    ])
    assert.deepEqual(problems, [
      'line 3: not valid JSON',
      'line 4: verdict must be one of PASS/FAIL/BLOCKED/NOT_RUN'
    ])
  })
  test('evidence is repo-relative inside the checkout and a bare file name outside it', () => {
    const inside = resolve(ROOT, 'tests/regression/.runs/2026-10-03-abc123456/REG-001.log')
    assert.equal(evidencePath(ROOT, inside), 'tests/regression/.runs/2026-10-03-abc123456/REG-001.log')
    for (const outside of [
      resolve(ROOT, '../elsewhere/2026-10-03-abc123456/REG-PR-1048-own-domain-routing.log'),
      resolve(ROOT, '../../REG-PR-1048-own-domain-routing.log'),
      resolve('/', 'evidence-root/run/REG-PR-1048-own-domain-routing.log')
    ])
      assert.equal(evidencePath(ROOT, outside), 'REG-PR-1048-own-domain-routing.log', outside)
    // A folder in the checkout whose name merely starts with two dots is still inside it.
    assert.equal(evidencePath(ROOT, resolve(ROOT, '..runs/REG-001.log')), '..runs/REG-001.log')
  })
  test('result file is named by UTC date and short commit', () => {
    assert.equal(
      resultPath(new Date('2026-10-03T23:30:00Z'), '0123456789abcdef'),
      'tests/regression/results/2026-10-03-012345678.jsonl'
    )
  })
  test('codex gets the fixed model, low effort and full sandbox', () => {
    const args = codexArgs('p', { model: 'gpt-6.1-sol', effort: 'low' })
    assert.deepEqual(args, [
      'exec',
      '-m',
      'gpt-6.1-sol',
      '-c',
      'model_reasoning_effort=low',
      '--sandbox',
      'danger-full-access',
      'p'
    ])
    assert.match(buildPrompt(kase({}), { stand: 'http://s', commit: 'c' }), /VERDICT: PASS[\s\S]*"REG-001"/)
  })
  test('another stand swaps the common setup file and the CDP endpoint', () => {
    const plain = buildPrompt(kase({}), { stand: 'http://s', commit: 'c' })
    assert.match(plain, /Common setup[\s\S]*127\.0\.0\.1:9222/)
    const o = parseArgs([
      '--stand',
      'https://d',
      '--common',
      'tests/regression/common-dev.md',
      '--cdp',
      'http://127.0.0.1:9391'
    ])
    const dev = buildPrompt(kase({}), { stand: 'https://d', commit: 'c', common: o.common, cdp: o.cdp })
    assert.match(dev, /read tests\/regression\/common-dev\.md in full/)
    assert.match(dev, /127\.0\.0\.1:9391/)
    assert.doesNotMatch(dev, /9222/)
  })
})

describe('profiles', () => {
  const LOCAL = [
    `You are a regression test runner for the Tracy repository (checkout: ${ROOT}).`,
    'The stand under test is http://s (this is O), running commit c.',
    'First read the section "Common setup (every case)" of tests/regression/README.md: a step that says',
    '"Common setup" means that section (O, COOKIE_DOMAIN, PG/WEB/HOST/DSH, seat cookies, api/pq/em).',
    'Run exactly the case below. Do not change any repository file and do not fix anything.',
    'Drive browsers only through `chrome-watch` (CDP on http://127.0.0.1:9222); do not close pages.',
    'Judge only by the `expect` items: every one must hold for PASS. If a precondition in `needs`',
    'cannot be met (no stand, no seat, no model key), the verdict is BLOCKED, not FAIL.',
    'End your answer with one line: `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: BLOCKED`,',
    'preceded by one line per expect item saying what you observed.',
    '',
    'Case:',
    JSON.stringify(kase({}), null, 2)
  ].join('\n')

  test('the profile defaults to local; dev and its run id are accepted, anything else throws', () => {
    assert.equal(parseArgs(['--dry-run']).profile, 'local')
    const o = parseArgs(['--dry-run', '--profile', 'dev', '--run-id', 'k1004ab'])
    assert.equal(o.profile, 'dev')
    assert.equal(o.runId, 'k1004ab')
    assert.throws(() => parseArgs(['--dry-run', '--profile', 'prod']), /local or dev/)
    assert.throws(() => parseArgs(['--dry-run', '--run-id', 'k1']), /--profile dev/)
  })
  test('the local prompt is byte-for-byte what it was before profiles existed', () => {
    assert.equal(buildPrompt(kase({}), { stand: 'http://s', commit: 'c' }), LOCAL)
    assert.equal(buildPrompt(kase({}), { stand: 'http://s', commit: 'c', profile: 'local' }), LOCAL)
  })
  test('dev changes exactly two sentences: where Common setup is, and how browsers are driven', () => {
    const local = LOCAL.split('\n')
    const dev = buildPrompt(kase({}), {
      stand: 'http://s',
      commit: 'c',
      profile: 'dev',
      envFile: '/q/REG-001/env.sh'
    }).split('\n')
    assert.equal(dev.length, local.length)
    const changed = local.flatMap((line, i) => (dev[i] === line ? [] : [i]))
    // Lines 2–3 are the Common setup sentence, line 5 the browser sentence.
    assert.deepEqual(changed, [2, 3, 5])
    assert.match(dev[2], /"Common setup — dev" of tests\/regression\/README\.md/)
    assert.match(dev[2], /`\. \/q\/REG-001\/env\.sh &&`/)
    assert.match(dev[3], /^"Common setup" means that section/)
    assert.equal(
      dev[5],
      "Drive browsers with the suite's own headless Chromium (Playwright, resolved the way `tests/e2e-dev/lib/browser.mjs` does); never use chrome-watch."
    )
  })
  test('devFit keeps what the runner can build on dev and names why it refuses the rest', () => {
    assert.deepEqual(devFit(kase({ needs: ['stand', 'seat:owner', 'seat:editor', 'viewport:360'] })), {
      ok: true
    })
    const why = (needs, over = {}) => {
      const f = devFit(kase({ needs, ...over }))
      return f.ok ? 'ok' : f.reason
    }
    assert.match(why([]), /checkout/)
    assert.match(why(['checkout']), /checkout/)
    assert.match(why(['stand:isolated-seats-route', 'playwright']), /stand built for this case/)
    assert.match(why(['stand', 'chrome-watch']), /chrome-watch/)
    assert.match(why(['stand', 'seat:tracy_admin']), /tracy_admin/)
    assert.match(why(['stand', 'site:create:em']), /creates its own site/)
    assert.match(why(['stand', 'fixture:ja-mood-site']), /named quickstart/)
    assert.equal(why(['stand', 'fixture:comment-row', 'model']), 'ok')
    assert.match(why(['stand', 'mailbox']), /no dev equivalent/)
    assert.match(why(['stand'], { area: 'wordpress-theme/wp-ja-nova' }), /theme/)
  })
  test('devPlan builds one site per site:<cms> need, else one of the first CMS, and the extra seats', () => {
    assert.deepEqual(devPlan(kase({ cms: ['any'], needs: ['stand', 'seat:owner'] })), {
      sites: ['wordpress'],
      seats: []
    })
    assert.deepEqual(devPlan(kase({ cms: ['jo', 'em'], needs: ['stand'] })), { sites: ['joomla'], seats: [] })
    assert.deepEqual(
      devPlan(
        kase({ cms: ['wp', 'jo'], needs: ['stand', 'site:wp', 'site:jo', 'seat:editor', 'seat:viewer'] })
      ),
      { sites: ['wordpress', 'joomla'], seats: ['b', 'c'] }
    )
  })
  test('the reason of a red verdict is what Codex observed just before it', () => {
    assert.equal(
      verdictReason('noise\nS1: ok\nS2: dialog never opened\n\nVERDICT: FAIL\n'),
      'noise / S1: ok / S2: dialog never opened'
    )
  })
  test('--dry-run --profile dev lists what dev runs and why not the rest', () => {
    const r = spawnSync(process.execPath, [RUNNER, '--dry-run', '--profile', 'dev'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.match(
      r.stdout,
      /REG-001 {2}site-changes\/backup {2}\[mechanism\] {2}sites: wordpress · seats: A owner/
    )
    assert.match(r.stdout, /case\(s\) would run on dev/)
    assert.match(r.stdout, /Not on dev \(\d+\):/)
  })
})

describe('the case format', () => {
  test('a case path is any .json directly under cases/ — a badly named one is judged, not skipped', () => {
    assert.equal(isCasePath('tests/regression/cases/REG-001-x.json'), true)
    assert.equal(isCasePath('tests/regression/cases/REG-PR-912-backup-button.json'), true)
    assert.equal(isCasePath('tests/regression/cases/README.json'), true)
    assert.equal(parseCase('{}', 'tests/regression/cases/README.json').ok, false)
    assert.equal(isCasePath('tests/regression/cases/README.md'), false)
    assert.equal(isCasePath('tests/regression/REG-001.json'), false)
  })
  test('the id must match the file name and every field is checked', () => {
    assert.equal(parseCase(JSON.stringify(kase({})), 'tests/regression/cases/REG-001-x.json').ok, true)
    const wrong = parseCase(JSON.stringify(kase({})), 'tests/regression/cases/REG-002-x.json')
    assert.equal(wrong.ok, false)
    const empty = parseCase(
      JSON.stringify(kase({ steps: [], cms: ['joomla'], flaky_model: 'no' })),
      'tests/regression/cases/REG-001-x.json'
    )
    assert.equal(empty.ok, false)
    assert.equal(empty.ok ? 0 : empty.problems.length, 3)
  })
})

describe('the real catalogue', () => {
  test('every case loads, ids are unique, and the first fourteen are there', () => {
    const cases = loadCatalogue(ROOT)
    const ids = cases.map((c) => c.id)
    for (let n = 1; n <= 14; n++)
      assert.ok(ids.includes(`REG-${String(n).padStart(3, '0')}`), `REG-${String(n).padStart(3, '0')}`)
  })
  test('--dry-run lists without a stand', () => {
    const r = spawnSync(process.execPath, [RUNNER, '--dry-run', '--area', 'site-changes/backup'], {
      encoding: 'utf8'
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /REG-001 {2}site-changes\/backup/)
    assert.match(r.stdout, /case\(s\) would run/)
  })
  const dry = (...args) => spawnSync(process.execPath, [RUNNER, '--dry-run', ...args], { encoding: 'utf8' })
  test('--id lists exactly the case asked for', () => {
    const r = dry('--id', 'REG-001')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^REG-001 {2}.*\n1 case\(s\) would run\.\n$/)
  })
  test('a well-formed --id that no case carries stops the run instead of listing nothing', () => {
    for (const id of ['REG-PR-999999999-no-such-case', 'REG-99999999']) {
      const r = dry('--id', `REG-001,${id}`)
      assert.equal(r.status, 2, id)
      assert.match(r.stderr, new RegExp(`${id}: no such case`))
      assert.doesNotMatch(r.stdout, /would run/)
    }
  })
  test('an --id the other filters leave out stops the run', () => {
    const other = loadCatalogue(ROOT).find((c) => c.id === 'REG-001')?.kind === 'fix' ? 'feat' : 'fix'
    const r = dry('--id', 'REG-001', '--kind', other)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /REG-001: left out by the other filters/)
  })
  test('a malformed or empty --id stops the run', () => {
    for (const value of ['REG-1', 'REG-PR-12-Upper', ',', 'REG-001,', ',REG-001', 'REG-001,,REG-002']) {
      const r = dry('--id', value)
      assert.equal(r.status, 2, value)
      assert.match(r.stderr, /run\.mjs: --id /)
    }
  })
  test('--profile dev refuses to start when a case asked for by id cannot run on dev', () => {
    const refused = loadCatalogue(ROOT).find((c) => !devFit(c).ok)
    assert.ok(refused, 'the catalogue has a case dev cannot run')
    // No dev machine is contacted: the refusal comes before the dev libraries are loaded.
    const r = spawnSync(
      process.execPath,
      [RUNNER, '--profile', 'dev', '--stand', 'https://dev.invalid', '--id', refused.id],
      { encoding: 'utf8', timeout: 30_000 }
    )
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, new RegExp(`--id asks for cases dev cannot run:\\s+${refused.id}: `))
  })
})
