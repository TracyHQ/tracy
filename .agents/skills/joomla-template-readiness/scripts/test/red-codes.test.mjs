// Red codes of the three gaps met on 2026-11-08 (faults.md F15 to F17), each shown failing on a broken input and
// passing on a good one. F15 and F16 are server facts with no offline checker: the code is the line the demo update
// prints, read by `failureReason` (what /ops shows). F17 is read by the language policy checker on the branch.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const { failureReason } = await import(join(ROOT, 'apps/tracy-web/src/lib/demo-sites.js'))
const { checkRange } = await import(join(ROOT, 'scripts/check-language-policy.mjs'))

const NOT_ON_DISK = '!! contract profile wren-example/j6/1.0.0: not on disk — the site cannot be bound to it'
const FETCH_504 =
  '!! contract-fetch: profile wren-example/j6/1.0.0 could not be put on disk: fetch failed: download failed: The requested URL returned error: 504'
const log = (...lines) => ({
  output: ['==> installing the Cowork component', ...lines, '[stage]    41s  +2s    x'].join('\n')
})

test('F15: a sticky 5xx on the download route is read as the reason, not hidden', () => {
  assert.match(failureReason(log(FETCH_504, NOT_ON_DISK)) ?? '', /returned error: 504/)
})

test('F16: an old provisioner log shows only "not on disk" (red); a fixed one names the cause (green)', () => {
  const old = failureReason(log(NOT_ON_DISK)) ?? ''
  assert.match(old, /not on disk/)
  assert.doesNotMatch(old, /contract-fetch/)
  assert.match(
    failureReason(log(FETCH_504, NOT_ON_DISK)) ?? '',
    /^contract-fetch: profile .* could not be put on disk/
  )
  assert.equal(failureReason(log('==> done')), null)
})

const KIT_PATH = 'packages/cms/tracy-joomla-quickstart/contracts/wren-example/j6/1.0.0/template-kit.json'
function kitRepo(t, body) {
  const root = mkdtempSync(join(tmpdir(), 'red-codes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...a) =>
    execFileSync(
      'git',
      [
        '-C',
        root,
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.test',
        ...a
      ],
      {
        encoding: 'utf8'
      }
    ).trim()
  git('init', '--quiet', '-b', 'main')
  writeFileSync(join(root, 'README.md'), 'English guide.\n')
  git('add', 'README.md')
  git('commit', '--quiet', '-m', 'chore: initial snapshot')
  const base = git('rev-parse', 'HEAD')
  const path = KIT_PATH
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), body)
  git('add', path)
  git('commit', '--quiet', '-m', 'feat: add the example template kit')
  const head = git('rev-parse', 'HEAD')
  const oid = git('rev-parse', `HEAD:${path}`)
  return { root, base, head, path, oid }
}
const policy = (lines = []) => ({
  version: 1,
  translations: [],
  captured: [
    {
      path: 'packages/cms/tracy-joomla-quickstart/contracts/*/*/*/template-kit.json',
      reason: 'Captured demo kits.'
    }
  ],
  lines,
  objects: []
})

test('F17: a large ASCII kit passes with no exemption; a Vietnamese value is a finding until an exact line allowance', (t) => {
  const run = (k, p) => checkRange({ repo: k.root, base: k.base, head: k.head, policy: p }).findings
  const big = kitRepo(
    t,
    `[\n${'  "English demo line for a large captured kit.",\n'.repeat(400_000)}  "end"\n]\n`
  )
  assert.deepEqual(run(big, policy()), [])
  const line = '  "sample": "Try the c\u00e0 ph\u00ea tr\u1ee9ng at Wren Example Cafe."'
  const viet = kitRepo(t, `{\n${line}\n}\n`)
  const red = run(viet, policy())
  assert.ok(red.some((f) => f.path === KIT_PATH && f.problem === 'Vietnamese text in captured content'))
  const sha256 = createHash('sha256').update(line).digest('hex')
  const allowed = policy([{ path: KIT_PATH, sha256, count: 1, reason: 'Reviewed verbatim demo paragraph.' }])
  assert.deepEqual(run(viet, allowed), [])
})

// F18 (faults.md): a contract folder without demo-baseline.json is red for acceptance, even when the readiness piece
// only warns (a release already shown on Design inspiration) and even when demo-baseline-policy.json does not opt the
// template in. Found on 2026-11-09: JA Voyara 1.0.12 was accepted on /ops with no baseline beside its contract.

const F18_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const f18 = async () => {
  const web = (p) => import(join(F18_ROOT, 'apps/tracy-web', p))
  const [
    { DEMO_BASELINE_CHECK },
    { BASELINE_FILE, BASELINE_SCHEMA },
    { exitCodeOf },
    pins,
    verdict,
    contracts
  ] = await Promise.all([
    web('src/lib/template-readiness/demo-baseline-check.js'),
    web('src/lib/template-kit/demo-baseline-file.js'),
    web('scripts/template-readiness.mjs'),
    web('src/lib/template-readiness/pinned-release.js'),
    web('src/lib/template-readiness/verdict.js'),
    web('src/lib/contracts.js')
  ])
  return { DEMO_BASELINE_CHECK, BASELINE_FILE, BASELINE_SCHEMA, exitCodeOf, pins, verdict, contracts }
}

const F18_TAG = 'quickstart/wren-example/j6'
const F18_ID = 'wren-example/j6/1.0.0'
const f18Release = () => ({
  tag: F18_TAG,
  kind: 'quickstart',
  platform: 'joomla',
  setting: { platform: 'joomla', version: '1.0.0', template: 'wren-example' },
  choosable: true,
  // Already shown on Design inspiration: the piece only warns here.
  inspiration: { template: 'wren-example' },
  inspirationHidden: false
})

test('F18: a published release without demo-baseline.json warns, and a warn is red for acceptance', async (t) => {
  const { DEMO_BASELINE_CHECK, BASELINE_FILE, BASELINE_SCHEMA, exitCodeOf } = await f18()
  const dir = mkdtempSync(join(tmpdir(), 'red-codes-f18-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const world = { contracts: new Map([[`${F18_TAG}@1.0.0`, { id: F18_ID, dir, platform: 'joomla' }]]) }
  const missing = DEMO_BASELINE_CHECK.judge(f18Release(), world)
  assert.deepEqual([missing.state, missing.code], ['warn', 'demo-baseline-missing'])
  assert.equal(exitCodeOf([{ piece: 'demo-baseline', ...missing }]), 1, 'a warn is not accepted')
  const doc = {
    schema: BASELINE_SCHEMA,
    quickstart: F18_ID,
    source: 'host',
    texts: ['Wren tours'],
    labels: []
  }
  writeFileSync(join(dir, BASELINE_FILE), JSON.stringify({ ...doc, pictures: { files: [], shas: [] } }))
  const recorded = DEMO_BASELINE_CHECK.judge(f18Release(), world)
  assert.deepEqual([recorded.state, recorded.code], ['done', 'demo-baseline-recorded'])
  assert.equal(exitCodeOf([{ piece: 'demo-baseline', ...recorded }]), 0)
})

test('F18: every template brought to the JA Boxing level carries the baseline of its pinned version', async () => {
  const { DEMO_BASELINE_CHECK, pins, verdict, contracts } = await f18()
  const index = contracts.defaultContracts()
  for (const name of ['ja-boxing', 'ja-diner', 'ja-voyara']) {
    const rel = pins.releaseOfPin(pins.latestPin(name), index)
    const judged = verdict.readinessVerdict(rel, {
      contracts: index,
      server: false,
      checks: [DEMO_BASELINE_CHECK]
    })
    const piece = judged.pieces.find((p) => p.piece === 'demo-baseline')
    assert.deepEqual([name, piece.state, piece.code], [name, 'done', 'demo-baseline-recorded'])
  }
})

test('F18: the skill makes the recorded baseline a done criterion, whatever the policy file or a warn says', () => {
  const skill = readFileSync(join(F18_ROOT, '.agents/skills/joomla-template-readiness/SKILL.md'), 'utf8')
  const done = skill.slice(skill.indexOf('## 6. Done'))
  assert.match(done, /demo-baseline-recorded/)
  assert.match(done, /demo-baseline-policy\.json/)
  assert.match(done, /warn/)
})
