// The write step bench's `run --repair --out <dir>` (#448): step 9 whole through the one step 9 entry point, with step 9b
// reaching Tracy's site agent as the bench site's owner. The site door, the stores and the agent are fakes; the kit is the
// invented one of the run tests, in a temporary contract folder.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
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
    assert.equal(code, 0, h.err.join('\n'))
    assert.deepEqual(asked, [{ siteKey: SITE, account: 'bench@example.test' }])
    for (const file of [
      'site-write-report.json',
      'first-site-check.json',
      'site-check.json',
      'repair-pass.json'
    ])
      assert.ok(existsSync(path.join(outDir, file)), file)
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
