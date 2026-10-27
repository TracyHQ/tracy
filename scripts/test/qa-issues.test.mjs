// `publishIssues` and friends (scripts/qa/lib/issues.mjs) against a FAKE `gh` on PATH: which nights
// write to GitHub, what they write, and that a crash between intent and result never makes a second
// issue. No network: the fake answers from a JSON file and logs every call.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LABELS,
  createGh,
  fileLedger,
  ledgerState,
  publishIssues,
  readResponses,
  reconcile,
  scanSecrets,
  passesComment
} from '../qa/lib/issues.mjs'
import { literal } from '../qa/lib/literal.mjs'
import { CI_REPOSITORY } from '../ci/ci-repository.mjs'

const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const dir = process.env.FAKE_GH_DIR
const statePath = path.join(dir, 'state.json')
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const args = process.argv.slice(2)
let stdin = ''
try { stdin = fs.readFileSync(0, 'utf8') } catch {}
fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify({ args, stdin }) + '\\n')
const save = () => fs.writeFileSync(statePath, JSON.stringify(state))
const [a, b] = args
if (a === 'issue' && b === 'create') {
  if (state.failCreate) { process.stderr.write('HTTP 502'); process.exit(1) }
  const n = state.nextIssue++
  save()
  process.stdout.write('https://github.com/TracyHQ/tch/issues/' + n + '\\n')
} else if (a === 'issue' && b === 'edit') {
  const i = args.indexOf('--add-assignee')
  if (i >= 0 && (state.failAssign || []).includes(args[i + 1])) { process.stderr.write('could not assign'); process.exit(1) }
} else if (a === 'issue' && b === 'comment') {
  process.stdout.write('https://github.com/TracyHQ/tch/issues/' + args[2] + '#issuecomment-1\\n')
} else if (a === 'issue' && b === 'view') {
  process.stdout.write(JSON.stringify((state.view || {})[args[2]] || {}))
} else if (a === 'api') {
  const p = args[args.length - 1]
  const m = /issues\\/(\\d+)\\/comments/.exec(p)
  const items = m ? ((state.comments || {})[m[1]] || []) : (state.list || [])
  const pages = []
  for (let i = 0; i < items.length; i += 2) pages.push(items.slice(i, i + 2))
  process.stdout.write(JSON.stringify(pages.length ? pages : [[]]))
} else { process.stderr.write('fake gh: unknown ' + args.join(' ')); process.exit(2) }
`

function setup(state = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-issues-'))
  writeFileSync(join(dir, 'gh'), FAKE_GH)
  chmodSync(join(dir, 'gh'), 0o755)
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ nextIssue: 900, ...state }))
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_DIR: dir }
  const gh = createGh({ env })
  const ledger = fileLedger(join(dir, 'issues.jsonl'))
  let k = 0
  const deps = { gh, ledger, nonce: () => `n${++k}`, now: () => '2026-10-03T00:00:00Z' }
  const calls = () =>
    existsSync(join(dir, 'calls.jsonl'))
      ? readFileSync(join(dir, 'calls.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : []
  const creates = () => calls().filter((c) => c.args[0] === 'issue' && c.args[1] === 'create')
  const writes = () =>
    calls().filter((c) => c.args[0] === 'issue' && ['create', 'comment', 'edit'].includes(c.args[1]))
  return {
    dir,
    env,
    gh,
    ledger,
    deps,
    calls,
    creates,
    writes,
    done: () => rmSync(dir, { recursive: true, force: true })
  }
}

const pr = (number, extra = {}) => ({
  number,
  title: `PR ${number}`,
  body: `This PR makes the button blue on page ${number}.`,
  author: { login: `dev${number}` },
  mergedBy: 'lead',
  state: 'merged',
  ...extra
})
const redCase = (n, extra = {}) => ({
  id: `pr${n}-k1`,
  pr: n,
  quote: `makes the button blue on page ${n}`,
  expected: 'the button is blue',
  kind: `kind-${n}`,
  lanes: {
    sonnet: { status: 'red', testPath: `tests/pr${n}/sonnet/pr${n}-k1.test.mjs` },
    sol: { status: 'green' }
  },
  verdict: { conclusion: 'differs', observed: 'the button is red' },
  ...extra
})
const greenCase = (n) => ({
  id: `pr${n}-k1`,
  pr: n,
  quote: `makes the button blue on page ${n}`,
  expected: 'blue',
  lanes: { sonnet: { status: 'green' }, sol: { status: 'green' } }
})

/** `red` eligible PRs, padded with green PRs so the "more than half red" brake stays off. */
function night({ red = [], green = [], extra = {} } = {}) {
  const prs = [...red, ...green].map((n) => pr(n))
  const cases = [...red.map((n) => redCase(n)), ...green.map((n) => greenCase(n))]
  return {
    runId: '20261003a',
    sha: 'a1b2c3d4e5f6',
    standMatches: true,
    qaHome: '/nonexistent',
    prs,
    cases,
    ...extra
  }
}
const range = (from, n) => Array.from({ length: n }, (_, i) => from + i)

test('one eligible PR: one issue, labelled, assigned to the author, intent before result', () => {
  const t = setup()
  try {
    const s = publishIssues(night({ red: [745], green: [746, 747] }), t.deps)
    assert.equal(s.blocked, null)
    assert.deepEqual(s.created, [{ pr: 745, issue: 900, cases: ['pr745-k1'], assignee: 'dev745' }])
    const [create] = t.creates()
    assert.deepEqual(create.args.slice(0, 3), ['issue', 'create', '--repo'])
    assert.ok(create.args.includes(LABELS.base))
    assert.ok(!create.args.includes('--assignee'), 'created without an assignee, assigned after')
    assert.match(create.stdin, /<!-- daily-qa key=pr745 nonce=n1 -->/)
    assert.match(create.stdin, /- \[ \] \*\*pr745-k1\*\* — found by sonnet; sol: has a test, passes/)
    assert.match(create.stdin, /qa-tool\/scripts\/qa\/rerun sonnet 745 pr745-k1/)
    assert.doesNotMatch(create.stdin, /\{\{/)
    const edit = t.calls().find((c) => c.args[1] === 'edit')
    assert.deepEqual(edit.args.slice(-2), ['--add-assignee', 'dev745'])
    const lines = t.ledger.read()
    assert.deepEqual(
      lines.map((l) => `${l.t}:${l.op}`),
      ['intent:create', 'result:create', 'effect:assign']
    )
    assert.equal(lines[1].issue, 900)
  } finally {
    t.done()
  }
})

test('21 eligible PRs: over the cap of 20, no issue is created', () => {
  const t = setup()
  try {
    const s = publishIssues(night({ red: range(100, 21), green: range(200, 21) }), t.deps)
    assert.equal(t.creates().length, 0)
    assert.equal(s.notOpened.length, 21)
    assert.ok(s.notOpened.every((n) => n.reason === 'cap'))
  } finally {
    t.done()
  }
})

test('three PRs red the same way: brake, nothing written', () => {
  const t = setup()
  try {
    const input = night({ red: [1, 2, 3], green: range(10, 5) })
    for (const c of input.cases) if (c.pr <= 3) c.kind = 'ECONNREFUSED qa.tracy.test'
    const s = publishIssues(input, t.deps)
    assert.match(s.blocked, /same way/)
    assert.equal(t.writes().length, 0)
  } finally {
    t.done()
  }
})

test('more than half the PRs with tests are red at T: brake', () => {
  const t = setup()
  try {
    const s = publishIssues(night({ red: [1, 2, 3], green: [4, 5] }), t.deps)
    assert.match(s.blocked, /3 of 5/)
    assert.equal(t.writes().length, 0)
  } finally {
    t.done()
  }
})

test('core suite red: no issue and no comment, even for a PR that already has one', () => {
  const t = setup()
  try {
    t.ledger.append({ t: 'intent', op: 'create', key: 'pr745', pr: 745, nonce: 'old', cases: ['pr745-k1'] })
    t.ledger.append({ t: 'result', op: 'create', key: 'pr745', nonce: 'old', issue: 812, outcome: 'created' })
    const input = night({ red: [745, 746], green: range(10, 4), extra: { brakes: { coreRed: true } } })
    input.cases.push(redCase(745, { id: 'pr745-k2' }))
    const s = publishIssues(input, t.deps)
    assert.match(s.blocked, /core/)
    assert.equal(t.writes().length, 0)
    assert.equal(t.calls().length, 0)
  } finally {
    t.done()
  }
})

test('a PR that already has an issue gets ONE comment for its new case; the body is never edited', () => {
  const t = setup()
  try {
    t.ledger.append({ t: 'intent', op: 'create', key: 'pr745', pr: 745, nonce: 'old', cases: ['pr745-k1'] })
    t.ledger.append({ t: 'result', op: 'create', key: 'pr745', nonce: 'old', issue: 812, outcome: 'created' })
    const input = night({ red: [745], green: range(10, 3) })
    input.cases.push(redCase(745, { id: 'pr745-k2' }), redCase(745, { id: 'pr745-k3' }))
    const s = publishIssues(input, t.deps)
    assert.equal(t.creates().length, 0)
    const comments = t.calls().filter((c) => c.args[1] === 'comment')
    assert.equal(comments.length, 1)
    assert.equal(comments[0].args[2], '812')
    assert.match(comments[0].stdin, /pr745-k2/)
    assert.match(comments[0].stdin, /pr745-k3/)
    assert.doesNotMatch(comments[0].stdin, /\*\*pr745-k1\*\*/, 'the old case is not repeated')
    assert.equal(t.calls().filter((c) => c.args[1] === 'edit').length, 0)
    assert.deepEqual(s.commented, [{ pr: 745, issue: 812, cases: ['pr745-k2', 'pr745-k3'] }])
    // Run the same night again: nothing new to say.
    publishIssues(input, t.deps)
    assert.equal(t.calls().filter((c) => c.args[1] === 'comment').length, 1)
  } finally {
    t.done()
  }
})

test('hanging intent whose nonce is on GitHub: recorded as found, no second issue', () => {
  const list = [
    { number: 5, body: 'other' },
    { number: 6, body: 'x', pull_request: {} },
    { number: 812, body: '<!-- daily-qa key=pr745 nonce=lost -->\nbody' }
  ]
  const t = setup({ list })
  try {
    t.ledger.append({ t: 'intent', op: 'create', key: 'pr745', pr: 745, nonce: 'lost', cases: ['pr745-k1'] })
    const s = publishIssues(night({ red: [745], green: range(10, 3) }), t.deps)
    assert.deepEqual(s.reconciled.found, [{ key: 'pr745', issue: 812 }])
    assert.equal(t.creates().length, 0)
    const api = t.calls().find((c) => c.args[0] === 'api')
    assert.ok(api.args.includes('--paginate'), 'list API, every page')
    assert.match(api.args.at(-1), /issues\?labels=daily-qa&state=all/)
    assert.equal(ledgerState(t.ledger.read()).hanging.length, 0)
  } finally {
    t.done()
  }
})

test('hanging intent whose nonce is NOT on GitHub: closed as not-found, then exactly one issue', () => {
  const t = setup({ list: [{ number: 5, body: 'nothing here' }] })
  try {
    t.ledger.append({ t: 'intent', op: 'create', key: 'pr745', pr: 745, nonce: 'lost', cases: ['pr745-k1'] })
    const s = publishIssues(night({ red: [745], green: range(10, 3) }), t.deps)
    assert.deepEqual(s.reconciled.notFound, ['pr745'])
    assert.equal(t.creates().length, 1)
  } finally {
    t.done()
  }
})

test('unknown outcome of create leaves the intent hanging; the next night finds it instead of re-creating', () => {
  const t = setup({ failCreate: true })
  try {
    const s = publishIssues(night({ red: [745], green: range(10, 3) }), t.deps)
    assert.equal(s.unknown.length, 1)
    assert.equal(ledgerState(t.ledger.read()).hanging.length, 1)
    const nonce = ledgerState(t.ledger.read()).hanging[0].nonce
    writeFileSync(
      join(t.dir, 'state.json'),
      JSON.stringify({
        nextIssue: 950,
        list: [{ number: 901, body: `<!-- daily-qa key=pr745 nonce=${nonce} -->` }]
      })
    )
    const r = reconcile({ ledger: t.ledger, gh: t.gh })
    assert.deepEqual(r.found, [{ key: 'pr745', issue: 901 }])
    publishIssues(night({ red: [745], green: range(10, 3) }), t.deps)
    assert.equal(t.creates().length, 1, 'only the first, failed-looking attempt')
  } finally {
    t.done()
  }
})

test('both lanes red on the same case: one line naming both', () => {
  const t = setup()
  try {
    const input = night({ red: [745], green: range(10, 3) })
    input.cases[0].lanes.sol = { status: 'red' }
    publishIssues(input, t.deps)
    const body = t.creates()[0].stdin
    assert.equal(body.match(/- \[ \] \*\*pr745-k1\*\*/g).length, 1)
    assert.match(body, /found by sonnet and sol/)
  } finally {
    t.done()
  }
})

test('a bot author: label needs-owner, merger named, no assignee', () => {
  const t = setup()
  try {
    const input = night({ red: [745], green: range(10, 3) })
    input.prs[0].author = { login: 'dependabot[bot]', isBot: true }
    const s = publishIssues(input, t.deps)
    const edit = t.calls().find((c) => c.args[1] === 'edit')
    assert.deepEqual(edit.args.slice(-2), ['--add-label', LABELS.needsOwner])
    assert.match(t.creates()[0].stdin, /merged by: `lead`/)
    assert.deepEqual(s.unassigned, [{ pr: 745, issue: 900, reason: 'bot author' }])
  } finally {
    t.done()
  }
})

test('assignment fails: the issue stays open and is reported unassigned', () => {
  const t = setup({ failAssign: ['dev745'] })
  try {
    const s = publishIssues(night({ red: [745], green: range(10, 3) }), t.deps)
    assert.equal(s.created.length, 1)
    assert.deepEqual(s.unassigned, [{ pr: 745, issue: 900, reason: 'assign failed' }])
    assert.equal(t.ledger.read().at(-1).outcome, 'failed')
  } finally {
    t.done()
  }
})

test('a body that carries a sample cookie (plain, base64 or hex) or a session shape is not opened', () => {
  const cookie = 'tracy_sess_9f8e7d6c5b4a'
  for (const observed of [
    `cookie=${cookie}`,
    Buffer.from(cookie).toString('base64'),
    Buffer.from(cookie).toString('hex'),
    'v1.AbCdEfGhIjKl.MnOpQrStUvWx'
  ]) {
    const t = setup()
    try {
      const input = night({ red: [745], green: range(10, 3), extra: { secrets: [cookie] } })
      input.cases[0].verdict.observed = observed
      const s = publishIssues(input, t.deps)
      assert.equal(t.creates().length, 0, observed)
      assert.match(s.notOpened[0].reason, /^scanner: /)
    } finally {
      t.done()
    }
  }
  assert.deepEqual(scanSecrets('clean text', ['tracy_sess_9f8e7d6c5b4a']), [])
})

test('issues.off: nothing written, every case listed', () => {
  const t = setup()
  try {
    writeFileSync(join(t.dir, 'issues.off'), '')
    const s = publishIssues(night({ red: [745], green: range(10, 3), extra: { qaHome: t.dir } }), t.deps)
    assert.equal(s.blocked, 'switch: issues.off')
    assert.equal(t.calls().length, 0)
    assert.deepEqual(s.notOpened, [{ pr: 745, cases: ['pr745-k1'], reason: 'switch: issues.off' }])
  } finally {
    t.done()
  }
})

test('daily-qa:paused on the Daily QA issue: nothing written', () => {
  const t = setup({ view: { 77: { labels: [{ name: LABELS.base }, { name: LABELS.paused }] } } })
  try {
    const s = publishIssues(night({ red: [745], green: range(10, 3), extra: { dailyIssue: 77 } }), t.deps)
    assert.equal(s.blocked, `switch: ${LABELS.paused}`)
    assert.equal(t.writes().length, 0)
  } finally {
    t.done()
  }
})

test('calibration cases never become an issue, even when red and differs', () => {
  const t = setup()
  try {
    const input = night({ red: [745], green: range(10, 3) })
    input.prs[0].calibration = true
    const s = publishIssues(input, t.deps)
    assert.equal(t.creates().length, 0)
    assert.equal(s.rejected[0].reason, 'calibration case')
  } finally {
    t.done()
  }
})

test('eligibility: quote not verbatim, verify not differs, stand mismatch, reverted', () => {
  const t = setup()
  try {
    const input = night({ red: [1, 2, 3, 4], green: range(10, 5) })
    input.cases[0].quote = 'a sentence the PR never wrote'
    input.cases[1].verdict.conclusion = 'test-wrong'
    input.prs[2].state = 'reverted'
    input.cases[3].verdict.observed = ''
    const s = publishIssues(input, t.deps)
    assert.deepEqual(
      s.rejected.slice(0, 4).map((r) => r.reason),
      [
        'quote is not verbatim in the PR description',
        'verify: test-wrong',
        'reverted',
        'verify has no observation of its own'
      ]
    )
    assert.equal(t.creates().length, 0)
    const s2 = publishIssues(night({ red: [9], green: range(10, 3), extra: { standMatches: false } }), t.deps)
    assert.equal(s2.rejected[0].reason, 'stand does not match desired(T)')
  } finally {
    t.done()
  }
})

test('untrusted text cannot leave its code block in the issue body', () => {
  const t = setup()
  try {
    const input = night({ red: [745], green: range(10, 3) })
    input.cases[0].verdict.observed = '```\n@leeknowsai [x](https://evil.example) <img src=x>\n```'
    publishIssues(input, t.deps)
    const body = t.creates()[0].stdin
    assert.ok(body.includes(literal(input.cases[0].verdict.observed, { indent: '  ', maxLines: 20 })))
    assert.doesNotMatch(body, /^\s*```\s*\n\s*@leeknowsai/m)
  } finally {
    t.done()
  }
})

test('--dry-run prints the exact gh commands and bodies, calls nothing, writes no ledger line', () => {
  const t = setup()
  try {
    const printed = []
    const gh = createGh({ dryRun: true, env: t.env, print: (l) => printed.push(l) })
    const s = publishIssues(night({ red: [745], green: range(10, 3) }), { ...t.deps, gh })
    assert.equal(t.calls().length, 0)
    assert.equal(t.ledger.read().length, 0)
    assert.equal(s.created.length, 1)
    const out = printed.join('\n')
    const repo = CI_REPOSITORY.replace('/', '\\/')
    assert.match(
      out,
      new RegExp(`^\\$ gh issue create --repo ${repo} --title 'Daily QA: PR #745 differs`, 'm')
    )
    assert.match(out, /--- stdin ---\n<!-- daily-qa key=pr745/)
    assert.match(out, new RegExp(`^\\$ gh issue edit '<new>' --repo ${repo} --add-assignee dev745$`, 'm'))
  } finally {
    t.done()
  }
})

test('passesComment: one comment with a marker, intent and result', () => {
  const t = setup()
  try {
    passesComment(
      { issue: 812, key: 'pr745', caseId: 'pr745-k1', sha: 'abcdef123', runId: '20261005a' },
      t.deps
    )
    const c = t.calls()[0]
    assert.deepEqual(c.args.slice(0, 3), ['issue', 'comment', '812'])
    assert.match(c.stdin, /passes at `abcdef1`/)
    assert.deepEqual(
      t.ledger.read().map((l) => l.t),
      ['intent', 'result']
    )
  } finally {
    t.done()
  }
})

test('readResponses: writer comment (newest wins) > ticked box > label at close', () => {
  const view = {
    state: 'CLOSED',
    labels: [{ name: LABELS.base }, { name: LABELS.falsePositive }],
    body: [
      '<!-- daily-qa key=pr745 nonce=a -->',
      '- [x] **pr745-k1** — found by sonnet',
      '- [x] **pr745-k2** — found by sol',
      '- [ ] **pr745-k3** — found by sonnet',
      '- [ ] **pr745-k4** — found by sonnet',
      '`daily-qa: confirmed pr745-k4`'
    ].join('\n'),
    comments: [
      {
        body: 'daily-qa: confirmed pr745-k2',
        authorAssociation: 'MEMBER',
        createdAt: '2026-10-04T01:00:00Z'
      },
      {
        body: 'daily-qa: false-positive pr745-k2',
        authorAssociation: 'OWNER',
        createdAt: '2026-10-04T02:00:00Z'
      },
      { body: 'daily-qa: confirmed pr745-k3', authorAssociation: 'NONE', createdAt: '2026-10-04T03:00:00Z' },
      {
        body: '<!-- daily-qa key=pr745 nonce=b -->\n- [x] **pr745-k5** — found by sol\ndaily-qa: false-positive pr745-k5',
        authorAssociation: 'OWNER',
        createdAt: '2026-10-04T04:00:00Z'
      }
    ]
  }
  const r = readResponses(view, ['pr745-k1', 'pr745-k2', 'pr745-k3', 'pr745-k4', 'pr745-k5'])
  assert.deepEqual(Object.fromEntries(r), {
    'pr745-k2': { verdict: 'false-positive', source: 'comment' },
    'pr745-k1': { verdict: 'confirmed', source: 'checkbox' },
    'pr745-k5': { verdict: 'confirmed', source: 'checkbox' },
    'pr745-k3': { verdict: 'false-positive', source: 'label' },
    'pr745-k4': { verdict: 'false-positive', source: 'label' }
  })
  // An open issue: labels do not apply yet.
  const open = readResponses({ ...view, state: 'OPEN' }, ['pr745-k3'])
  assert.equal(open.size, 0)
})
