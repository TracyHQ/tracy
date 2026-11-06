// The finisher's "style one block" order (#421, spec #418; ADR 0044, decision 30), driven through the step 9 bench's
// `finish` the way an operator does, on the same invented written site as write-step-bench-finish.test.mjs, plus the kit's
// head injection module behind the module door. Only what comes out is asserted: the module's content, the site's writes,
// the repair log and the look guard's findings.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../src/write-step-bench-cli.js'
import {
  FINISHER_STYLE_END,
  FINISHER_STYLE_START,
  finisherRulesIn,
  styleRule,
  withFinisherRule
} from '../src/lib/finisher-style.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { kitIndex, memoryStore } from './_write-step-bench.mjs'
import {
  BLOCKS,
  benchSite,
  fakeCapture,
  finding,
  heldAtStart,
  PAGES,
  scriptedDoor,
  writtenRun,
  writtenSite
} from './_write-step-finisher.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

/** The kit's head injection block: module 9, holding the tab icons between the brand markers. */
const HEAD_MODULE = 9
const HEAD =
  '<!-- tracy-brand-head:start -->\n<link rel="icon" type="image/png" sizes="32x32" href="/images/icon-32.png">\n<!-- tracy-brand-head:end -->'
const SITE = { head: { injection: { position: { block: `block-${HEAD_MODULE}` }, maxBytes: 65535 } } }

const kits = kitIndex({ tool: 'template-kit 3.1.0', blocks: BLOCKS, pages: PAGES, site: SITE })
const dirs = []
after(() => {
  kits.done()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** The written site with the head module behind `content.get` and `content.update`; `updates` records the module writes. */
function siteWithHead(head = HEAD) {
  const site = writtenSite(heldAtStart())
  const module = { content: head }
  const updates = []
  const inner = site.door.apply
  site.door.apply = async (call) => {
    const { action, params } = call
    if ((action === 'content.get' || action === 'content.update') && params.id !== HEAD_MODULE)
      return { ok: false, error: 'not_found', message: `no module ${params.id}` }
    if (action === 'content.get') return { ok: true, item: { id: HEAD_MODULE, content: module.content } }
    if (action === 'content.update') {
      if (!params.apply_id) return { ok: false, error: 'bad_params', message: 'apply_id required' }
      updates.push({ applyId: params.apply_id, content: params.fields.content })
      module.content = params.fields.content
      return { ok: true }
    }
    return inner(call)
  }
  return { ...site, module, updates }
}

async function finish({ finder, fixer, checker, head = HEAD }) {
  const site = siteWithHead(head)
  const shots = fakeCapture({ held: site.held })
  const out = []
  const err = []
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-finish-style-'))
  dirs.push(dir)
  const code = await runCli(['finish', '--run', 'run-1', '--account', 'bench@example.test', '--out', dir], {
    runs: memoryRunStore([writtenRun()]),
    store: memoryStore([benchSite()]),
    index: kits.index,
    makeDoor: () => site.door,
    makeCapture: async () => shots.capture,
    makeFinisherDoors: async () => ({
      finder: scriptedDoor('Finisher finder', finder).door,
      fixer: scriptedDoor('Finisher fixer', fixer).door,
      checker: scriptedDoor('Finisher checker', checker).door
    }),
    out: (l) => out.push(l),
    err: (l) => err.push(l)
  })
  const logFile = path.join(dir, 'repair-log.json')
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null
  return { code, out, err, site, log }
}

const unreadable = (over = {}) =>
  finding('unreadable-text', { seen: 'the white heading sits on a light photo and cannot be read', ...over })
const styleOrder = (over = {}) => ({
  kind: 'style-block',
  block: 'block-2',
  target: 'h2',
  styles: { color: '#ffffff', 'text-shadow': '0 1px 3px rgba(0,0,0,0.7)' },
  ...over
})

test('text over a picture is repaired with an allowed style in the head block and kept when the checker says better', async () => {
  const run = await finish({
    finder: [unreadable(), finding()],
    fixer: [styleOrder()],
    checker: [{ verdict: 'better', reason: 'the heading reads on the photo' }]
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  // The rule is written to the head module only: no slot's words change.
  assert.deepEqual(run.site.writes, [])
  assert.equal(run.site.updates.length, 1)
  assert.match(run.site.updates[0].applyId, /^finisher-style-/)
  const content = run.site.module.content
  assert.ok(content.startsWith(HEAD), 'the brand block is kept as it was')
  assert.ok(content.includes(FINISHER_STYLE_START) && content.includes(FINISHER_STYLE_END))
  const rule = finisherRulesIn(content).get('block-2')
  assert.match(rule, /#Mod2 h2,\[id\^="acm-"\]\[id\$="-2"\] h2\{color:#ffffff!important;text-shadow:/)
  const [record] = run.log.records
  assert.equal(record.outcome, 'kept')
  assert.equal(record.faultKind, 'unreadable-text')
  assert.equal(record.block, 'block-2')
  assert.equal(record.slot, 'block-2.1')
  assert.equal(record.applyId, run.site.updates[0].applyId)
  assert.equal(record.crops.by, 'block')
})

test('every banned declaration is refused by code, nothing is written, and the refusal is logged', async () => {
  const banned = [
    { display: 'none' },
    { visibility: 'hidden' },
    { opacity: '0' },
    { height: '0' },
    { 'max-height': '0' },
    { position: 'absolute', left: '-9999px' },
    { transform: 'translateX(-200vw)' },
    { 'text-indent': '-9999px' },
    { 'margin-left': '-5000px' },
    { color: 'transparent' },
    { color: 'rgba(0,0,0,0)' },
    { 'font-size': '0' },
    { background: 'url(/images/x.png)' },
    { color: '#fff;display:none' }
  ]
  for (const styles of banned) {
    const run = await finish({
      finder: [unreadable(), finding()],
      fixer: [styleOrder({ styles: { 'line-height': '1.4', ...styles } })],
      checker: []
    })
    assert.equal(run.code, 0, run.err.join('\n'))
    assert.deepEqual(run.site.updates, [], JSON.stringify(styles))
    assert.deepEqual(run.site.writes, [])
    assert.equal(run.site.module.content, HEAD)
    const [record] = run.log.records
    assert.equal(record.outcome, 'dropped', JSON.stringify(styles))
    assert.match(record.reason, /^refused by the style allow list: /)
    assert.match(record.reason, new RegExp(Object.keys(styles).at(-1)))
  }
})

test('undoing a style repair puts back only that block’s rule as it was, and another block’s rule stays', async () => {
  const other = styleRule({ block: 'block-3', target: null, styles: { 'overflow-wrap': 'anywhere' } }).line
  // Block 2 already held a rule of an earlier repair: the undo puts it back as it was.
  const earlier = styleRule({ block: 'block-2', target: null, styles: { 'line-height': '1.5' } }).line
  const head = withFinisherRule(withFinisherRule(HEAD, 'block-3', other), 'block-2', earlier)
  const run = await finish({
    finder: [unreadable(), finding()],
    fixer: [styleOrder()],
    checker: [{ verdict: 'not better', reason: 'the shadow blurs the letters' }],
    head
  })
  assert.equal(run.code, 0, run.err.join('\n'))
  assert.equal(run.site.updates.length, 2)
  assert.notEqual(run.site.updates[1].applyId, run.site.updates[0].applyId)
  assert.equal(run.site.module.content, head)
  assert.equal(finisherRulesIn(run.site.updates[0].content).get('block-2') === earlier, false)
  assert.equal(finisherRulesIn(run.site.module.content).get('block-2'), earlier)
  assert.equal(finisherRulesIn(run.site.module.content).get('block-3'), other)
  const [record] = run.log.records
  assert.equal(record.outcome, 'undone')
  assert.equal(record.reason, 'the shadow blurs the letters')
})

test('a later content edit of the block leaves its style rule in place', async () => {
  const run = await finish({
    finder: [unreadable(), finding()],
    fixer: [styleOrder()],
    checker: [{ verdict: 'better', reason: 'the heading reads on the photo' }]
  })
  const kept = run.site.module.content
  const inspect = await run.site.door.apply({
    siteKey: 's',
    action: 'content.contract',
    params: { operation: 'inspect' }
  })
  const edit = await run.site.door.apply({
    siteKey: 's',
    action: 'content.contract',
    params: {
      operation: 'apply',
      expected_revision: inspect.revision,
      apply_id: 'owner-edit-1',
      changes: { 'module-2.1': 'Boxing classes for every age' }
    }
  })
  assert.equal(edit.ok, true)
  assert.equal(run.site.held['module-2.1'], 'Boxing classes for every age')
  assert.equal(run.site.module.content, kept)
  assert.ok(finisherRulesIn(run.site.module.content).has('block-2'))
})

test('a style order for a block other than the fault’s is dropped, and so is one for a raw markup fault', async () => {
  const elsewhere = await finish({
    finder: [unreadable(), finding()],
    fixer: [styleOrder({ block: 'block-3' })],
    checker: []
  })
  assert.equal(elsewhere.log.records[0].outcome, 'dropped')
  assert.match(elsewhere.log.records[0].reason, /the finder named a slot of block-2/)
  const wrongKind = await finish({ finder: [finding(), finding()], fixer: [styleOrder()], checker: [] })
  assert.match(wrongKind.log.records[0].reason, /a style-block order does not repair a raw-markup fault/)
  assert.deepEqual([...elsewhere.site.updates, ...wrongKind.site.updates], [])
})

test('the look guard lets the finisher style block hold allow list rules, and nothing else', async () => {
  const kit = { site: SITE }
  const write = async (content) => {
    const guard = lookGuard({ kit })
    const module = { content: HEAD }
    const door = guard.door({
      async apply({ action, params }) {
        if (action === 'content.get') return { ok: true, item: { id: params.id, content: module.content } }
        module.content = params.fields.content
        return { ok: true }
      }
    })
    await door.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: HEAD_MODULE } })
    await door.apply({
      siteKey: 's',
      action: 'content.update',
      params: { apply_id: 'x', kind: 'module', id: HEAD_MODULE, fields: { content } }
    })
    return guard.findings()
  }
  const line = styleRule({ block: 'block-2', target: 'h2', styles: { color: '#ffffff' } }).line
  assert.deepEqual(await write(withFinisherRule(HEAD, 'block-2', line)), [])
  const rogue = line.replace('color:#ffffff', 'display:none')
  const found = await write(withFinisherRule(HEAD, 'block-2', rogue))
  assert.equal(found.length, 1)
  assert.match(found[0].reason, /finisher style block/)
})

test('a style that takes content off the page another way is refused: text the colour of its ground, huge or negative spacing, any opacity', async () => {
  const refused = [
    [{ color: '#ffffff', 'background-color': '#ffffff' }, /color.*too close to the background/],
    [{ color: '#777777', background: '#888888' }, /too close to the background/],
    [{ color: 'rgb(20, 20, 20)', 'background-color': '#000' }, /too close to the background/],
    [{ padding: '200px' }, /padding: 200px: .*over/],
    [{ 'margin-top': '10em' }, /margin-top: 10em: .*over/],
    [{ 'padding-left': '50vw' }, /padding-left: 50vw: /],
    [{ 'letter-spacing': '100px' }, /letter-spacing: 100px: .*over/],
    [{ 'letter-spacing': '-1px' }, /letter-spacing: -1px: .*negative/],
    [{ 'word-spacing': '-0.2em' }, /word-spacing: -0.2em: .*negative/],
    [{ opacity: '0.9' }, /opacity: 0.9: /]
  ]
  for (const [styles, why] of refused) {
    const run = await finish({
      finder: [unreadable(), finding()],
      fixer: [styleOrder({ styles: { 'line-height': '1.4', ...styles } })],
      checker: []
    })
    assert.equal(run.code, 0, run.err.join('\n'))
    assert.deepEqual(run.site.updates, [], JSON.stringify(styles))
    const [record] = run.log.records
    assert.equal(record.outcome, 'dropped', JSON.stringify(styles))
    assert.match(record.reason, /^refused by the style allow list: /)
    assert.match(record.reason, why)
  }
})

test('a readable colour pair, sane spacing and a gradient backing layer are still written', async () => {
  const run = await finish({
    finder: [unreadable(), finding()],
    fixer: [
      styleOrder({
        styles: {
          color: '#ffffff',
          'background-color': 'rgba(0,0,0,0.6)',
          padding: '12px 1em',
          'letter-spacing': '0.05em',
          margin: '0 auto'
        }
      })
    ],
    checker: [{ verdict: 'better', reason: 'reads' }]
  })
  assert.equal(run.log.records[0].outcome, 'kept', run.log.records[0].reason)
  assert.equal(run.site.updates.length, 1)
})
