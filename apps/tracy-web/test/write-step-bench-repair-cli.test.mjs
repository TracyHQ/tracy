// The write step bench's `run --repair --out <dir>` (#448): step 9 whole through the one step 9 entry point, with step 9b
// reaching Tracy's site agent as the bench site's owner. The site door, the stores and the agent are fakes; the kit is the
// invented one of the run tests, in a temporary contract folder.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
import { benchPageUrl, benchRepairAgent } from '../src/write-step-bench-repair-agent.js'
import { memoryStore } from './_write-step-bench.mjs'
import { fakeAgent } from './_write-step-nine-repair.mjs'
import { fakeSite, frozenFiles, KIT, memoryRunStore, SITE } from './_write-step-run.mjs'

const contractDir = mkdtempSync(path.join(tmpdir(), 'write-step-contract-'))
const made = {
  ...KIT().doc,
  kit: 'tracy-template-kit/2',
  tool: 'template-kit 3.1.0',
  quickstart: { version: '1.0.0' },
  images: [{ id: 'block-1-1440', path: 'images/block-1-1440.jpg', sha256: 'e'.repeat(64) }]
}
writeFileSync(path.join(contractDir, 'template-kit.json'), JSON.stringify(made))
const index = new Map([
  ['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir: contractDir, platform: 'joomla' }]
])
const outDir = mkdtempSync(path.join(tmpdir(), 'write-step-nine-out-'))
after(() => {
  rmSync(contractDir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
})

const benchSite = {
  id: 'site-1',
  label: SITE.split('.')[0],
  siteKey: SITE,
  status: 'ready',
  contract: 'demo-gym/j6/1.0.0'
}

function harness({ makeRepairAgent } = {}) {
  const out = []
  const err = []
  const runs = memoryRunStore()
  const site = fakeSite()
  const cli = (argv) =>
    runCli(argv, {
      runs,
      store: memoryStore([benchSite]),
      index,
      makeDoor: () => site.door,
      ...(makeRepairAgent ? { makeRepairAgent } : {}),
      baselines: { read: async () => null },
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      sleep: async () => {}
    })
  return { cli, out, err, runs }
}

const args = (files, over) => [
  'run',
  '--site',
  SITE,
  '--kit',
  'demo-gym/j6/1.0.0',
  '--plan-file',
  files.plan,
  '--copy-file',
  files.copy,
  '--account',
  'bench@example.test',
  ...over
]

test('run --repair needs --out, and a bench given no site agent refuses before anything is written', async () => {
  const frozen = frozenFiles()
  try {
    const h = harness()
    assert.equal(await h.cli(args(frozen.files, ['--repair'])), 2)
    assert.equal(await h.cli(args(frozen.files, ['--repair', '--out', outDir])), 1)
    assert.match(h.err.join('\n'), /REPAIR_UNWIRED/)
    assert.deepEqual(await h.runs.list({ limit: 5 }), [], 'no run was begun')
  } finally {
    frozen.done()
  }
})

test('run --repair runs step 9 whole on the bench site as its owner and writes the step outputs into --out', async () => {
  const frozen = frozenFiles()
  const asked = []
  try {
    const h = harness({
      makeRepairAgent: async (input) => {
        asked.push(input)
        return fakeAgent()
      }
    })
    const code = await h.cli(args(frozen.files, ['--repair', '--out', outDir]))
    assert.equal(code, 1, 'the bench has no browser host, so its unmeasured page checks cannot pass')
    assert.match(h.err.join('\n'), /STEP_NINE_CHECK_FAILED/)
    assert.deepEqual(asked, [{ siteKey: SITE, account: 'bench@example.test' }])
    for (const file of [
      'site-write-report.json',
      'first-site-check.json',
      'site-check.json',
      'repair-pass.json'
    ])
      assert.ok(existsSync(path.join(outDir, file)), file)
    const first = JSON.parse(readFileSync(path.join(outDir, 'first-site-check.json'), 'utf8'))
    assert.equal(first.allGroups, true, 'the first check runs the page groups whatever read-back says')
    const repair = JSON.parse(readFileSync(path.join(outDir, 'repair-pass.json'), 'utf8'))
    assert.equal(repair.version, 'repair-pass/1')
    assert.ok(
      h.out.some((l) => l.startsWith('step 9b: ')),
      h.out.join('\n')
    )
    const [run] = await h.runs.list({ limit: 1 })
    assert.ok(run.report.siteCheck, 'the run keeps the site check handed over')
  } finally {
    frozen.done()
  }
})

/** The bench site door, faked for the agent's own calls: comment requests (rate limited `limited` times) and Apply. */
function agentDoor({ limited = 0, apply = () => ({ status: 'resolved', levels: [] }) } = {}) {
  const calls = { requests: 0, apply: [] }
  return {
    calls,
    async requests(_siteKey, body) {
      calls.requests += 1
      if (calls.requests <= limited) return { ok: false, code: 'COMMENT_RATE_LIMIT', retryAfter: 60 }
      return { ok: true, requests: body.items.map((_, i) => ({ id: `r${i}`, n: i + 1 })) }
    },
    async apply(input) {
      calls.apply.push(input)
      return apply(input)
    }
  }
}

const ITEM = { url: 'https://site.example/', element: { selector: '' }, text: 'Fix it.' }

test("the bench agent's rate limit wait counts against the step's time: it never waits past the time left", async () => {
  const slept = []
  const sleep = async (ms) => slept.push(ms)
  const short = benchRepairAgent({ door: agentDoor({ limited: 1 }), siteKey: SITE, sleep })
  await assert.rejects(
    short.request({ sessionId: 's', requestId: 'r', items: [ITEM], timeLeftMs: 30_000 }),
    /COMMENT_RATE_LIMIT/
  )
  assert.deepEqual(slept, [], 'no wait it has no time for')
  const long = benchRepairAgent({ door: agentDoor({ limited: 1 }), siteKey: SITE, sleep })
  const { numbers } = await long.request({
    sessionId: 's',
    requestId: 'r',
    items: [ITEM],
    timeLeftMs: 120_000
  })
  assert.deepEqual(numbers, [1])
  assert.deepEqual(slept, [60_000])
})

test('the bench agent locates an element through the Apply door, as the popover does', async () => {
  const door = agentDoor()
  const agent = benchRepairAgent({ door, siteKey: SITE })
  const answer = await agent.locate({ url: 'https://site.example/', text: 'Our story', marks: [] })
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(door.calls.apply, [
    {
      siteKey: SITE,
      action: 'content.locate',
      params: { url: 'https://site.example/', text: 'Our story', marks: [] }
    }
  ])
})

test("a comment's page address is the page as the Joomla site serves it, on the site's public address", () => {
  const origin = 'https://quay.sites.example'
  assert.equal(benchPageUrl(origin, '/'), 'https://quay.sites.example/')
  assert.equal(benchPageUrl(origin, '/about'), 'https://quay.sites.example/index.php/about')
  assert.equal(benchPageUrl(origin, '/index.php/about'), 'https://quay.sites.example/index.php/about')
  assert.throws(() => benchPageUrl(null, '/about'), /before the session is open/)
})

/** The site turn records, faked: `site_turn` rows and `site_write` rows, answered by the table each query reads. */
const recordsPool = ({ turns, writes }) => ({
  async query(sql) {
    if (/from site_turn/.test(sql)) return { rows: turns }
    if (/from site_write/.test(sql)) return { rows: writes }
    throw new Error(`unexpected query: ${sql}`)
  }
})

test('a turn that only changed design files is read with its file change, so step 9b judges it and can undo it', async () => {
  // A look change (CSS in the template's files): Git moments, no database write.
  const pool = recordsPool({
    turns: [
      {
        turn_id: 'sess-1:1',
        rpc_id: 'step9b-run-1',
        state: 'closed',
        token_usage: { costUsd: 0.05 },
        files: 2,
        head_sha: 'abc1234'
      }
    ],
    writes: []
  })
  const agent = benchRepairAgent({ pool, door: agentDoor(), siteKey: SITE })
  const [turn] = await agent.turns({ sessionId: 'sess-1', requestIds: ['step9b-run-1'] })
  assert.deepEqual(turn.changes, [
    { action: 'files', outcome: 'ok', target: null, via: 'files', files: 2, headSha: 'abc1234' }
  ])
  assert.equal(turn.costUsd, 0.05)
})
