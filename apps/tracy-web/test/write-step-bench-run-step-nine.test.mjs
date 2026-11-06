// The write step bench's `run --out <dir>` (#424 review, spec #418): step 9 whole, as the build runs it, through the one
// step 9 path: the write, then the finisher, and the final site check kept on the run. The site door, the stores, the
// capture and the model doors are fakes; the kit is a made-up one in a temporary contract folder.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
import { memoryStore } from './_write-step-bench.mjs'
import { fakeCapture } from './_write-step-finisher.mjs'
import { fakeSite, frozenFiles, KIT, memoryRunStore, SITE } from './_write-step-run.mjs'

const contractDir = mkdtempSync(path.join(tmpdir(), 'write-step-nine-contract-'))
const outDir = mkdtempSync(path.join(tmpdir(), 'write-step-nine-out-'))
writeFileSync(
  path.join(contractDir, 'template-kit.json'),
  JSON.stringify({
    ...KIT().doc,
    kit: 'tracy-template-kit/2',
    tool: 'template-kit 3.1.0',
    quickstart: { version: '1.0.0' },
    images: [{ id: 'block-1-1440', path: 'images/block-1-1440.jpg', sha256: 'e'.repeat(64) }]
  })
)
const index = new Map([
  ['demo-gym/j6@1.0.0', { id: 'demo-gym/j6/1.0.0', dir: contractDir, platform: 'joomla' }]
])
after(() => {
  rmSync(contractDir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
})

/** A model door that finds nothing and counts its calls. */
const quietDoor = (label, asked) => ({
  ok: true,
  label,
  model: 'deepseek-flash',
  providerId: 'deepseek',
  images: true,
  async ask() {
    asked.push(label)
    return { text: JSON.stringify({ faults: [] }), costUsd: 0.01 }
  }
})

async function run({ wired = true } = {}) {
  const site = fakeSite()
  // The written site lists its home page, the one page the finisher shoots here.
  const apply = site.door.apply
  site.door.apply = async (call) => {
    const answer = await apply(call)
    return call.action === 'content.contract' && call.params?.operation === 'inspect' && answer?.ok
      ? { ...answer, pages: [{ route: 'home', entity: 'menuItem-101' }] }
      : answer
  }
  const frozen = frozenFiles()
  const asked = []
  const out = []
  const err = []
  const runs = memoryRunStore()
  const dir = path.join(outDir, String(Math.random()).slice(2))
  try {
    const code = await runCli(
      [
        'run',
        '--site',
        SITE,
        '--kit',
        'demo-gym/j6/1.0.0',
        '--account',
        'bench@example.test',
        '--plan-file',
        frozen.files.plan,
        '--copy-file',
        frozen.files.copy,
        '--out',
        dir
      ],
      {
        runs,
        store: memoryStore([
          { id: 'site-1', label: SITE.slice(0, SITE.indexOf('.')), siteKey: SITE, status: 'ready' }
        ]),
        index,
        makeDoor: () => site.door,
        ...(wired
          ? {
              makeCapture: async () => fakeCapture().capture,
              makeFinisherDoors: async () => ({
                finder: quietDoor('finder', asked),
                fixer: quietDoor('fixer', asked),
                checker: quietDoor('checker', asked)
              })
            }
          : {}),
        out: (l) => out.push(l),
        err: (l) => err.push(l),
        sleep: async () => {}
      }
    )
    return { code, out, err, runs, site, asked, dir }
  } finally {
    frozen.done()
  }
}

test('run --out is step 9 whole: the write, then the finisher, and the final site check kept on the run', async () => {
  const r = await run()
  assert.equal(r.code, 0, r.err.join('\n'))
  assert.ok(r.site.applies().length > 0, 'the write wrote the site')
  assert.deepEqual(r.asked, ['finder'], 'the finisher looked at the written page')
  assert.ok(existsSync(path.join(r.dir, 'repair-log.json')))
  const log = JSON.parse(readFileSync(path.join(r.dir, 'repair-log.json'), 'utf8'))
  assert.equal(log.version, 'repair-log/1')
  const [row] = r.runs.rows
  assert.equal(row.status, 'done')
  assert.ok(row.report.siteCheck, 'the run keeps the final site check')
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(r.dir, 'site-check.json'), 'utf8')),
    row.report.siteCheck
  )
  assert.ok(
    r.out.some((l) => /^finisher: \d+ found, 0 kept/.test(l)),
    r.out.join('\n')
  )
})

test('run --out on a bench given no finisher doors refuses before anything is written', async () => {
  const r = await run({ wired: false })
  assert.equal(r.code, 1)
  assert.match(r.err.join('\n'), /^FINISHER_UNWIRED/)
  assert.deepEqual(r.site.applies(), [])
  assert.deepEqual(r.runs.rows, [])
})
