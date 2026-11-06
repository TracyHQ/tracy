// Step 9 of the live build (#424, spec #418): the write, then the finisher through its one entry point, with the first site
// check running beside the finder and the build keeping the final check. The write runs for real on the invented frozen files
// and fake site of _write-step-run.mjs; the finisher's doors, the capture and the site check are fakes. Only what comes out,
// and the order things happened in, is asserted.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { BASELINE_FILE } from '../src/lib/template-kit/demo-baseline-file.js'
import { runStepNine } from '../src/write-step-nine.js'
import { kitIndex } from './_write-step-bench.mjs'
import { fakeCapture } from './_write-step-finisher.mjs'
import { CONTRACT, fakeSite, frozenFiles, KIT, SITE } from './_write-step-run.mjs'

/** A model door that finds nothing and records when it was asked. */
const quietDoor = (label, events) => ({
  ok: true,
  label,
  model: 'deepseek-flash',
  providerId: 'deepseek',
  images: true,
  async ask() {
    events.push(`${label} asked`)
    return { text: JSON.stringify({ faults: [] }), costUsd: 0.01 }
  }
})

const check = (name) => ({
  version: 'site-check/1',
  name,
  status: 'green',
  allGroups: false,
  counts: { block: 0, warn: 0, unmeasured: 0 },
  groups: [{ name: 'read-back', status: 'green', checked: 1, failures: [], lines: {} }]
})

async function stepNine({ over = {}, script = {}, input = {}, finisherOver = {}, finalCheck = null } = {}) {
  const site = fakeSite(script)
  // The written site lists its home page, the one page the finisher shoots here.
  const apply = site.door.apply
  site.door.apply = async (call) => {
    const answer = await apply(call)
    return call.action === 'content.contract' && call.params?.operation === 'inspect' && answer?.ok
      ? { ...answer, pages: [{ route: 'home', entity: 'menuItem-101' }] }
      : answer
  }
  const frozen = frozenFiles(over)
  const events = []
  const baselinesRead = []
  const checks = []
  try {
    const result = await runStepNine({
      write: {
        door: site.door,
        siteKey: SITE,
        kit: KIT(),
        contentMap: null,
        files: frozen.files,
        sleep: async () => {}
      },
      finisher: {
        doors: {
          finder: quietDoor('finder', events),
          fixer: quietDoor('fixer', events),
          checker: quietDoor('checker', events)
        },
        capture: fakeCapture().capture,
        saveFile: async () => {},
        ...finisherOver
      },
      checkSite: async (report, options) => {
        const name = checks.length ? 'final' : 'first'
        events.push(`${name} check started`)
        checks.push({ report, options })
        if (name === 'final' && finalCheck) return finalCheck()
        // The first check takes a while: it ends once the finder was asked, or after a bounded wait when it never is.
        for (let i = 0; i < 500 && name === 'first' && !events.includes('finder asked'); i++)
          await new Promise((resolve) => setImmediate(resolve))
        events.push(`${name} check done`)
        return check(name)
      },
      baselines: {
        read: async (contract) => {
          baselinesRead.push(contract)
          return { contract, kind: 'demo-baseline' }
        }
      },
      ...input
    })
    return { result, events, checks, baselinesRead, site }
  } finally {
    frozen.done()
  }
}

test('step 9 writes, then finishes: the first site check runs beside the finder and the build keeps the final check', async () => {
  const { result, events, checks, baselinesRead } = await stepNine()
  assert.equal(result.report.status, 'done')
  assert.equal(result.finisher, null)
  assert.ok(result.repairLog, 'the finisher ran and kept its log')
  // The first check starts before the finder is asked and ends after it: they run side by side.
  const at = (e) => events.indexOf(e)
  assert.ok(at('first check started') < at('finder asked'), events.join(', '))
  assert.ok(at('finder asked') < at('first check done'), events.join(', '))
  assert.ok(at('final check started') > at('first check done'))
  assert.equal(result.siteCheck.name, 'final')
  assert.equal(result.report.siteCheck.name, 'final', "the build's site check report is the final run's")
  // With no fault the finisher writes nothing, so the final check measures the report as written.
  assert.equal(result.repairLog.counts.kept, 0)
  // Every check of the step measures against the demo baseline of the contract the site was made from.
  assert.deepEqual(baselinesRead, [CONTRACT])
  for (const { options } of checks) assert.equal(options.baseline.contract, CONTRACT)
})

test('a write that stops never reaches the finisher, and no site check runs on a site half written', async () => {
  const { result, events, checks } = await stepNine({ script: { contract: 'another/j6/9.9.9' } })
  assert.notEqual(result.report.status, 'done')
  assert.equal(result.siteCheck, null)
  assert.deepEqual(events, [])
  assert.deepEqual(checks, [])
})

test('with no baseline lookup given, step 9 reads the demo baseline committed beside the contract (#428)', async () => {
  const kits = kitIndex({ contract: CONTRACT })
  try {
    const [contract] = [...kits.index.values()]
    writeFileSync(
      path.join(contract.dir, BASELINE_FILE),
      JSON.stringify({
        schema: 'demo-baseline/1',
        quickstart: CONTRACT,
        source: 'host',
        texts: ['0123456789abcdef'],
        labels: [],
        pictures: { files: [], shas: [] },
        unread: []
      })
    )
    const { checks } = await stepNine({ input: { baselines: undefined, contracts: kits.index } })
    assert.ok(checks.length >= 2)
    for (const { options } of checks) assert.deepEqual(options.baseline?.texts, ['0123456789abcdef'])
  } finally {
    kits.done()
  }
})

test('a finisher that throws still delivers the written site, with the first site check and why', async () => {
  const { result, checks } = await stepNine({
    finisherOver: {
      saveFile: async () => {
        throw new Error('the disk is full')
      }
    }
  })
  assert.equal(result.report.status, 'done')
  assert.deepEqual(result.finisher, { code: 'FINISHER_FAILED', reason: 'the disk is full' })
  assert.equal(result.siteCheck.name, 'first')
  assert.equal(result.report.siteCheck.name, 'first')
  assert.equal(result.repairLog, null)
  assert.equal(checks.length, 1, 'no final check runs on a finisher that failed')
})

test('a final site check that does not end in the time kept for it leaves the first check, and says so', async () => {
  let fire = null
  const { result } = await stepNine({
    finisherOver: {
      timer: (done) => {
        fire = done
        return () => {}
      }
    },
    finalCheck: () => {
      setImmediate(() => fire?.())
      return new Promise(() => {})
    }
  })
  assert.equal(result.report.status, 'done')
  assert.equal(result.finisher.code, 'FINAL_CHECK_MISSING')
  assert.match(result.finisher.reason, /final site check did not end in time/)
  assert.equal(result.siteCheck.name, 'first')
  assert.ok(result.repairLog, 'the repair log is kept')
})

test("every site call of step 9 goes through the write's door: a door handed to the finisher is never used", async () => {
  const { result, site } = await stepNine({
    finisherOver: {
      door: {
        apply: async () => {
          throw new Error('a second door was used')
        }
      }
    }
  })
  assert.equal(result.finisher, null)
  const writeCalls = site.calls.filter((c) => c.params?.operation === 'apply').length
  assert.ok(writeCalls > 0)
  // The finisher read the written site through the same door, after the write.
  const inspects = site.calls.filter((c) => c.params?.operation === 'inspect')
  assert.ok(
    site.calls.lastIndexOf(inspects.at(-1)) > site.calls.findIndex((c) => c.params?.operation === 'apply')
  )
})
