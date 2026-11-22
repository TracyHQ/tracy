import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import {
  causesOf,
  sampleFaults,
  hostCodeOf,
  FINAL_FAULTS,
  MAX_WRITE_DIAGNOSTICS_BYTES,
  refusalOf,
  stepNineDiagnostics,
  unmeasuredCode
} from '../src/step-chain-write-diagnostics.js'

for (const status of ['done', 'stopped']) {
  test(`the terminal chain retains structured write diagnostics when ${status}`, async () => {
    const diagnostics = { version: 1, write: { status, causeCode: null }, firstCheck: null }
    const answer = async () => ({ value: {}, usd: 0 })
    const engine = createStepChainEngine({
      applyFor: () => async () => ({}),
      steps: {
        kit: answer,
        brand: answer,
        plan: answer,
        copy: answer,
        pictures: answer,
        write: async () => ({ value: { report: { status, counts: { written: 1 } }, diagnostics }, usd: 0 })
      }
    })
    const ctx = { runId: 'diagnostic-test', signal: new AbortController().signal }
    const prepared = await engine.prepare(ctx)
    const result = await engine.apply(ctx, prepared)
    assert.deepEqual(result.chain.steps.find((s) => s.step === 'write').diagnostics, diagnostics)
    assert.equal(result.chain.ending, status === 'done' ? 'complete' : 'soft-failure')
  })
}

test('a failed final check retains fault identities and skipped repairs without private prose', () => {
  const privateText = 'Bearer private-secret /Users/example/private prompt@example.test'
  const group = {
    name: 'read-back',
    status: 'red',
    checked: 2,
    ms: 25,
    reason: privateText,
    failures: [
      {
        group: 'read-back',
        page: '/about',
        slot: 'module-111.0',
        reason: privateText,
        measured: privateText,
        level: 'block'
      }
    ]
  }
  const check = { status: 'red', counts: { block: 1, warn: 0 }, groups: [group] }
  const diagnostic = stepNineDiagnostics({
    report: {
      status: 'stopped',
      writeStatus: 'done',
      cause: { code: 'STEP_NINE_CHECK_FAILED', reason: privateText }
    },
    firstCheck: check,
    siteCheck: check,
    writersSettled: false,
    repair: {
      status: 'incomplete',
      reason: privateText,
      errors: [privateText],
      turns: [{ text: privateText }],
      sessions: [privateText],
      remaining: [privateText],
      checks: 2,
      skipped: [{ ...group.failures[0], code: 'not-visible', reason: privateText }],
      timeline: [{ stage: 'first-check', startMs: 12, endMs: 37, privateText }]
    }
  })
  assert.equal(diagnostic.write.causeCode, 'STEP_NINE_CHECK_FAILED')
  assert.equal(diagnostic.finalCheck.groups[0].name, 'read-back')
  assert.equal(diagnostic.finalCheck.faults[0].slot, 'module-111.0')
  assert.equal(diagnostic.finalCheck.faults[0].page, '/about')
  assert.equal(diagnostic.repair.skipped[0].code, 'not-visible')
  assert.equal(diagnostic.repair.turnCount, 1)
  assert.equal(diagnostic.repair.errorCount, 1)
  assert.equal(diagnostic.writersSettled, false)
  assert.equal(JSON.stringify(diagnostic).includes(privateText), false)
  // The final check's fault keeps its reason, with the secret, the path and the address masked.
  const reason = diagnostic.finalCheck.faults[0].reason
  for (const secret of ['private-secret', '/Users/example', 'prompt@example.test'])
    assert.equal(JSON.stringify(diagnostic).includes(secret), false, secret)
  assert.equal(reason, 'Bearer … …path… …@…')
  // The first check's faults keep none.
  assert.equal('reason' in diagnostic.firstCheck.faults[0], false)
})

test('an early stopped write records its cause without pretending a site check ran', () => {
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped', cause: { code: 'STEP_NINE_BASELINE_UNPROVEN' } },
    writersSettled: true
  })
  assert.equal(diagnostic.write.causeCode, 'STEP_NINE_BASELINE_UNPROVEN')
  assert.equal(diagnostic.firstCheck, null)
  assert.equal(diagnostic.finalCheck, null)
  assert.equal(diagnostic.repair, null)
})

test('zero-turn unmeasured checks remain distinct from a passing nothing-to-send repair', () => {
  const check = {
    status: 'unmeasured',
    counts: { unmeasured: 1, block: 0 },
    groups: [{ name: 'read-back', status: 'unmeasured', checked: 0, failures: [] }]
  }
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped', writeStatus: 'done', cause: { code: 'STEP_NINE_CHECK_FAILED' } },
    firstCheck: check,
    siteCheck: check,
    repair: {
      status: 'incomplete',
      turns: [],
      skipped: [],
      notSent: [{ page: '/', faults: 1, reason: 'time-limit' }]
    }
  })
  assert.equal(diagnostic.finalCheck.status, 'unmeasured')
  assert.equal(diagnostic.finalCheck.groups[0].checked, 0)
  assert.equal(diagnostic.finalCheck.faults.length, 0)
  assert.equal(diagnostic.repair.status, 'incomplete')
  assert.equal(diagnostic.repair.turnCount, 0)
  assert.equal(diagnostic.repair.notSent[0].code, 'time-limit')
  assert.equal(
    stepNineDiagnostics({ repair: { status: 'nothing-to-send' } }).repair.status,
    'nothing-to-send'
  )
})

test('oversized and hostile reports remain bounded without losing overall failure counts', () => {
  const failures = Array.from({ length: 400 }, () => ({
    page: '/Users/example/private',
    slot: '/tmp/secret',
    kind: 'Bearer secret',
    reason: 'private'
  }))
  const check = {
    status: 'red',
    counts: { block: 400 },
    groups: Array.from({ length: 100 }, () => ({ name: 'read-back', status: 'red', checked: 400, failures }))
  }
  const diagnostic = stepNineDiagnostics({
    report: { status: 'stopped' },
    firstCheck: check,
    siteCheck: check
  })
  assert.ok(Buffer.byteLength(JSON.stringify(diagnostic)) <= MAX_WRITE_DIAGNOSTICS_BYTES)
  assert.equal(diagnostic.truncated, true)
  assert.equal(diagnostic.finalCheck.counts.block, 400)
  assert.equal(diagnostic.finalCheck.groupCount, 100)
  assert.equal(JSON.stringify(diagnostic).includes('/Users'), false)
  assert.equal(JSON.stringify(diagnostic).includes('Bearer secret'), false)
})

test('page and slot shapes are read in linear time and keep their meaning', () => {
  const kept = (page, slot) => {
    const check = {
      status: 'red',
      counts: { block: 1 },
      groups: [{ name: 'read-back', status: 'red', checked: 1, failures: [{ page, slot }] }]
    }
    const [fault] = stepNineDiagnostics({ report: { status: 'stopped' }, siteCheck: check }).finalCheck.faults
    return [fault.page, fault.slot]
  }
  assert.deepEqual(kept('/', 'module-1'), ['/', 'module-1'])
  assert.deepEqual(kept('/blog/post-1/', 'menu-0--x.y:z'), ['/blog/post-1/', 'menu-0--x.y:z'])
  assert.deepEqual(kept('//double', 'menu-0-'), [null, null])
  assert.deepEqual(kept('/a/../b', 'menu-0-.x'), [null, null])
  const started = performance.now()
  assert.deepEqual(kept(`/${'-'.repeat(158)}!`, `menu-0-${'--'.repeat(45)}!`), [null, null])
  assert.ok(performance.now() - started < 200)
})

test('an unmeasured group says why as a fixed code and the host error code, never its words', () => {
  const unmeasured = (name, reason) => ({
    name,
    status: 'unmeasured',
    checked: 0,
    ms: 1,
    reason,
    failures: []
  })
  const check = {
    status: 'unmeasured',
    counts: { block: 0, unmeasured: 4 },
    groups: [
      unmeasured('demo-words', 'The host gave no verdicts: HOST_PAGE_TIMEOUT'),
      unmeasured('demo-pictures', 'The host gave no verdicts: the browser crashed at /Users/someone/private'),
      unmeasured(
        'read-back',
        'Nothing was measured (0 checked), and the group gave no reason it does not apply.'
      ),
      unmeasured('page-slug', 'content.list  was refused: Bearer private-secret'),
      { name: 'reachable-pages', status: 'green', checked: 5, ms: 76, reason: 'not stored', failures: [] }
    ]
  }
  const d = stepNineDiagnostics({ report: { status: 'stopped' }, firstCheck: check, siteCheck: check })
  assert.deepEqual(
    d.finalCheck.groups.map((g) => [g.name, g.why ?? null, g.hostCode ?? null]),
    [
      ['demo-words', 'host-no-verdicts', 'HOST_PAGE_TIMEOUT'],
      ['demo-pictures', 'host-no-verdicts', null],
      ['read-back', 'nothing-checked', null],
      ['page-slug', 'read-refused', null],
      ['reachable-pages', null, null]
    ]
  )
  const text = JSON.stringify(d)
  for (const words of ['browser crashed', '/Users/someone', 'private-secret', 'not stored'])
    assert.equal(text.includes(words), false, words)
})

test('the unmeasured reasons of the site check are sorted into their codes', () => {
  assert.equal(
    unmeasuredCode('No host was given, and only the host has a browser to read the pages.'),
    'no-host'
  )
  assert.equal(unmeasuredCode('The site lists no page, so there was nothing to open.'), 'no-pages')
  assert.equal(unmeasuredCode('The host could not judge demo-words: no page.'), 'host-skipped')
  assert.equal(
    unmeasuredCode('The host answered no main headings, so this was not measured.'),
    'host-no-reading'
  )
  assert.equal(
    unmeasuredCode('No kit was given, so which page shows which picture is not known.'),
    'missing-input'
  )
  assert.equal(unmeasuredCode('the operation timed out'), 'timeout')
  assert.equal(unmeasuredCode('something new'), 'other')
  assert.equal(unmeasuredCode(undefined), null)
  assert.equal(hostCodeOf('The host gave no verdicts: no answer'), null)
})

test("each group's failures are counted by the build step that causes them, as step names", () => {
  const fail = (causingStep) => ({ causingStep, reason: 'words never stored', level: 'block' })
  const causes = causesOf([
    { name: 'unaddressable-items', status: 'red', failures: [fail(8), fail(8), fail(6)] },
    { name: 'read-back', status: 'red', causingStep: 9, failures: [{}, fail(3)] },
    { name: 'reachable-pages', status: 'green', failures: [] },
    { name: 'not-a-group', status: 'red', failures: [fail(9)] }
  ])
  assert.deepEqual(causes, {
    'unaddressable-items': { pictures: 2, copy: 1 },
    'read-back': { write: 1, planner: 1 }
  })
  const d = stepNineDiagnostics({
    report: { status: 'stopped' },
    siteCheck: {
      status: 'red',
      counts: { block: 3 },
      groups: [{ name: 'unaddressable-items', status: 'red', failures: [fail(8), fail(8), fail(0)] }]
    }
  })
  assert.deepEqual(d.finalCheck.causes, { 'unaddressable-items': { pictures: 2, template: 1 } })
  // The causes are step names only; the reason stays on the final check's faults alone, masked.
  assert.equal(JSON.stringify(d.finalCheck.causes).includes('words'), false)
  assert.deepEqual(
    d.finalCheck.faults.map((f) => f.reason),
    ['words never stored', 'words never stored', 'words never stored']
  )
})

test('the faults kept are taken in turn from every group, so a group listed late is seen too', () => {
  const failures = (group, n) =>
    Array.from({ length: n }, (_, i) => ({ slot: `article-${group.length}.${i}`, level: 'block' }))
  const groups = [
    { name: 'unaddressable-items', status: 'red', failures: failures('unaddressable-items', 30) },
    { name: 'read-back', status: 'red', failures: failures('read-back', 3) },
    { name: 'alt-matches-picture', status: 'red', failures: failures('alt-matches-picture', 2) }
  ]
  assert.deepEqual(
    sampleFaults(groups)
      .slice(0, 7)
      .map((f) => f.group),
    [
      'unaddressable-items',
      'read-back',
      'alt-matches-picture',
      'unaddressable-items',
      'read-back',
      'alt-matches-picture',
      'unaddressable-items'
    ]
  )
  const d = stepNineDiagnostics({
    report: { status: 'stopped' },
    siteCheck: { status: 'red', counts: { block: 35 }, groups }
  })
  const kept = new Set(d.finalCheck.faults.map((f) => f.group))
  assert.ok(kept.has('read-back') && kept.has('alt-matches-picture'), [...kept].join(', '))
})

test('a refused read keeps its action, operation and the plugin code, never the message', () => {
  const unmeasured = (name, reason) => ({
    name,
    status: 'unmeasured',
    checked: 0,
    ms: 1,
    reason,
    failures: []
  })
  const check = {
    status: 'unmeasured',
    counts: { block: 0, unmeasured: 3 },
    groups: [
      unmeasured(
        'read-back',
        'contract inspect was refused (writer_busy): another writer holds site private-site'
      ),
      unmeasured('demo-words', 'content.list  was refused (no-code): Bearer private-secret'),
      unmeasured('page-slug', 'content.list  was refused: an older wording')
    ]
  }
  const d = stepNineDiagnostics({ report: { status: 'stopped' }, firstCheck: check, siteCheck: check })
  assert.deepEqual(
    d.finalCheck.groups.map((g) => [g.name, g.why, g.refused ?? null]),
    [
      ['read-back', 'read-refused', { action: 'contract', operation: 'inspect', code: 'writer_busy' }],
      ['demo-words', 'read-refused', { action: 'content.list', operation: null, code: 'no-code' }],
      ['page-slug', 'read-refused', null]
    ]
  )
  const text = JSON.stringify(d)
  for (const words of ['private-site', 'private-secret', 'another writer'])
    assert.equal(text.includes(words), false, words)
  assert.equal(refusalOf('something else'), null)
})

test('the final check keeps up to sixty faults taken in turn by group, each with why it failed, within the size bound', () => {
  const groups = ['text-fill', 'read-back', 'demo-words'].map((name) => ({
    name,
    status: 'red',
    checked: 40,
    failures: Array.from({ length: 40 }, (_, i) => ({
      page: '/',
      slot: `block-${i}.1`,
      level: 'block',
      reason: `The text of block-${i}.1 fills 41% of its box, under the 60% floor: "Our hand-made pastries"`
    }))
  }))
  const check = { status: 'red', counts: { block: 120 }, groups }
  const d = stepNineDiagnostics({ report: { status: 'stopped' }, firstCheck: check, siteCheck: check })
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= MAX_WRITE_DIAGNOSTICS_BYTES)
  const kept = d.finalCheck.faults
  assert.ok(kept.length >= 40 && kept.length <= FINAL_FAULTS, `${kept.length} faults`)
  assert.deepEqual(new Set(kept.map((f) => f.group)), new Set(['text-fill', 'read-back', 'demo-words']))
  assert.equal(kept[0].reason, 'The text of block-0.1 fills 41% of its box, under the 60% floor: "…"')
  assert.equal(JSON.stringify(d).includes('pastries'), false)
})
