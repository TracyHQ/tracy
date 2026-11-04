// The write step through its entry point (ADR 0044): frozen files in, orders to a fake site door and the write report out.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeChanges } from '../src/write-step/kit-slot-routes.js'
import { planClaims } from '../src/write-step/owner-table.js'
import { copy, KIT, plan, runStep as run, SITE } from './_write-step-run.mjs'

test('the site copy reaches the site in one contract call, and the report says so per slot', async () => {
  const { report, site, line } = await run()
  assert.equal(report.version, 'site-write-report/1')
  assert.equal(report.status, 'done')
  assert.equal(report.site, SITE)
  assert.equal(report.contract, 'demo-gym/j6/1.0.0')
  assert.equal(site.applies().length, 1)
  assert.equal(site.applies()[0].params.expected_revision, 'rev-1')
  assert.equal(site.held['module-2.1'], 'Train with a coach who knows you')
  assert.equal(site.held['module-1.1'], 'Join us')
  assert.deepEqual(
    { ...line('block-2.1') },
    {
      slot: 'block-2.1',
      key: 'module-2.1',
      owner: 'writer',
      status: 'written',
      reason: null,
      readBack: null,
      ordered: 'Train with a coach who knows you'
    }
  )
  assert.equal(line('block-1.1').owner, 'plan-label')
  assert.equal(report.counts.written, 9)
  assert.equal(report.counts.failed, 0)
})

test('the report carries input hashes and file names, never a path, and per-stage timings', async () => {
  let t = 0
  const { report } = await run({}, {}, { now: () => (t += 10) })
  assert.match(report.inputs.plan.sha256, /^[0-9a-f]{64}$/)
  assert.match(report.inputs.copy.sha256, /^[0-9a-f]{64}$/)
  assert.equal(report.inputs.plan.file, 'plan.json')
  for (const stage of ['check', 'inspect', 'write']) assert.equal(typeof report.timings[stage], 'number')
})

test('the plan owns hide decisions and link targets: a link the kit does not list is failed and names its target', async () => {
  const p = plan()
  p.pages[0].blocks[0].links = [{ link: 'block-2.link-1', leadsTo: 'page-about', labelSlot: 'block-2.1' }]
  const { report, line } = await run({ plan: p })
  assert.deepEqual(
    [line('block-2.3').owner, line('block-2.3').status],
    ['plan', 'hidden'],
    'a slot the plan hides'
  )
  assert.match(line('block-2.3').reason, /hid/)
  assert.deepEqual([line('block-2.link-1').owner, line('block-2.link-1').status], ['plan', 'failed'])
  assert.match(line('block-2.link-1').reason, /block-2\.link-1/)
  assert.equal(report.status, 'done')
})

test('extras with no path on this site are reported as skipped and never written', async () => {
  const { report, site } = await run()
  const parts = (part) => report.slots.filter((s) => s.part === part)
  assert.deepEqual(
    parts('alt').map((s) => [s.slot, s.status, s.owner]),
    [['block-2.f1', 'skipped', 'writer']]
  )
  assert.equal(parts('page-title').length, 3)
  assert.equal(parts('page-description').length, 3)
  assert.equal(parts('page-body').length, 2)
  assert.ok(report.slots.filter((s) => s.part).every((s) => s.status === 'skipped' && s.reason))
  assert.equal(site.updates().length, 0, 'the kit names no page, so nothing is put on a page')
  assert.equal(site.applies().length, 1)
  assert.equal(Object.keys(site.applies()[0].params.changes).length, 9)
})

test('an unknown slot id stops the run before the site is written, and the report names it', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-99.1', owner: 'writer', text: 'No such slot', factIds: [] })
  const { report, site } = await run({ copy: c })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'UNKNOWN_SLOT')
  assert.match(report.cause.reason, /block-99\.1/)
  assert.equal(site.applies().length, 0)
  assert.equal(report.counts.written, 0)
})

test('a slot the kit names only in a demo list, a link label, a page h1 or a setting slot is a kit slot', async () => {
  const kit = KIT()
  kit.doc.blocks[0].demoOwned = [{ id: 'block-2.91' }]
  kit.doc.blocks[0].links = [{ labelId: 'block-2.92' }]
  kit.doc.pages = [...(kit.doc.pages ?? []), { h1: { slot: 'block-2.93' } }]
  kit.doc.site = { ...kit.doc.site, settingSlots: [{ id: 'block-2.94' }] }
  const c = copy()
  for (const slot of ['block-2.91', 'block-2.92', 'block-2.93', 'block-2.94'])
    c.slots.push({ slot, owner: 'writer', text: 'Words for this slot', factIds: [] })
  const { report } = await run({ copy: c }, {}, { kit })
  // Past the kit check: the only one left to refuse them is the site, whose inspect here does not list them.
  assert.equal(report.cause.code, 'UNKNOWN_SLOT')
  assert.match(report.cause.reason, /the site does not have/i)
})

test('a slot the kit knows and the site does not stops the run with nothing written', async () => {
  const { report, site } = await run({}, { slots: [{ key: 'module-2.1', entity: 'module-2' }] })
  assert.equal(report.cause.code, 'UNKNOWN_SLOT')
  assert.match(report.cause.reason, /module-1\.1/)
  assert.equal(site.applies().length, 0)
})

for (const name of ['plan', 'copy']) {
  test(`a missing ${name} file stops the run with nothing asked of the site, and names the file`, async () => {
    const { report, site } = await run({ [name]: null })
    assert.equal(report.status, 'stopped')
    assert.equal(report.cause.code, 'MISSING_FILE')
    assert.match(report.cause.reason, new RegExp(`${name}\\.json`))
    assert.equal(site.calls.length, 0)
  })
}

test('a file that is not JSON, and a copy with a bad entry, stop the run', async () => {
  const broken = await run({ copy: '{not json' })
  assert.equal(broken.report.cause.code, 'BAD_FILE')
  assert.equal(broken.site.calls.length, 0)
  const c = copy()
  c.slots[0].owner = 'somebody'
  const bad = await run({ copy: c })
  assert.equal(bad.report.cause.code, 'BAD_FILE')
  assert.match(bad.report.cause.reason, /block-1\.1/)
  assert.equal(bad.site.calls.length, 0)
})

test('files made on another kit stop the run, naming both', async () => {
  const c = copy()
  c.fingerprint.kit = 'tracy-template-kit/2 other-gym/j6/2.0.0'
  const { report, site } = await run({ copy: c })
  assert.equal(report.cause.code, 'BAD_FILE')
  assert.match(report.cause.reason, /other-gym/)
  assert.match(report.cause.reason, /demo-gym\/j6\/1\.0\.0/)
  assert.equal(site.calls.length, 0)
})

test('a site that answers another contract stops the run, naming both', async () => {
  const { report, site } = await run({}, { contract: 'demo-gym/j6/9.9.9' })
  assert.equal(report.cause.code, 'CONTRACT_MISMATCH')
  assert.match(report.cause.reason, /9\.9\.9/)
  assert.match(report.cause.reason, /1\.0\.0/)
  assert.equal(site.applies().length, 0)
})

test('two owners with different content stop the run; the report names the slot and both files', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'Words the plan hides', factIds: [] })
  const { report, site } = await run({ copy: c })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'SLOT_DISPUTE')
  assert.match(report.cause.reason, /block-2\.3/)
  assert.deepEqual(report.disputes[0].slot, 'block-2.3')
  assert.deepEqual(report.disputes[0].claims.map((x) => x.file).sort(), ['copy.json', 'plan.json'])
  assert.equal(site.calls.length, 0)
})

test('the same slot twice in the copy with different words is a dispute; identical repeats are not', async () => {
  const twice = copy()
  twice.slots.push({ slot: 'block-1.1', owner: 'writer', text: 'Sign up', factIds: [] })
  const disputed = await run({ copy: twice })
  assert.equal(disputed.report.cause.code, 'SLOT_DISPUTE')
  const same = copy()
  same.slots.push({ ...same.slots[0], owner: 'writer' })
  const repeated = await run({ copy: same })
  assert.equal(repeated.report.status, 'done')
  assert.deepEqual(repeated.report.disputes, [])
  assert.equal(repeated.report.slots.filter((s) => s.slot === 'block-1.1').length, 1)
})

test('a slot in a kept block with no owner is reported and does not block', async () => {
  const c = copy()
  c.slots = c.slots.filter((s) => s.slot !== 'block-5.1')
  const { report, line } = await run({ copy: c })
  assert.equal(report.status, 'done')
  assert.deepEqual([line('block-5.1').owner, line('block-5.1').status], [null, 'skipped'])
  assert.ok(report.unowned.some((u) => u.slot === 'block-5.1' && u.block === 'block-5'))
  assert.ok(!report.unowned.some((u) => u.block === 'block-4'), 'a hidden block is not kept')
})

test('more slots than one contract call takes stops the run before the site is written', async () => {
  const c = copy()
  const extra = []
  for (let i = 0; i < 1501; i++) {
    c.slots.push({ slot: `block-5.${i + 100}`, owner: 'writer', text: 'x', factIds: [] })
    extra.push(`module-5.${i + 100}`)
  }
  const kit = KIT()
  kit.doc.blocks
    .find((b) => b.id === 'block-5')
    .slots.push(
      ...extra.map((_, i) => ({
        id: `block-5.${i + 100}`,
        type: 'text',
        role: 'x',
        sample: 'x',
        maxCharacters: 9
      }))
    )
  const { report, site } = await run({ copy: c }, { extraKeys: extra }, { kit })
  assert.equal(report.cause.code, 'TOO_MANY_SLOTS')
  assert.equal(site.applies().length, 0)
})

test('a cancel is honoured between phases: nothing is written after it', async () => {
  const beforeWrite = await run({}, {}, { isCancelled: async () => true })
  assert.equal(beforeWrite.report.status, 'cancelled')
  assert.equal(beforeWrite.site.calls.length, 0)
  const seen = []
  let asked = 0
  const late = await run(
    {},
    { refuse: { 'module-2.1': { code: 'SLOT_TOO_LONG' } } },
    { isCancelled: async () => ++asked > 3, onPhase: async (p) => void seen.push(p) }
  )
  assert.equal(late.report.status, 'cancelled')
  assert.equal(late.site.applies().length, 1)
  assert.equal(late.report.counts.written, 0)
  assert.deepEqual(seen, ['check', 'inspect', 'hide', 'write'])
})

test('a door that throws stops the run and the report carries the words', async () => {
  const door = {
    async apply() {
      throw new Error('connect ECONNREFUSED')
    }
  }
  const { report } = await run({}, {}, { door })
  assert.equal(report.status, 'stopped')
  assert.match(report.cause.reason, /ECONNREFUSED/)
})

test('another kit and contract id flow through with no change: nothing is pinned in the write step', async () => {
  const kit = {
    ref: 'made-up/x9/7.7.7',
    doc: { ...KIT().doc, contract: 'made-up/x9/7.7.7', kit: 'tracy-template-kit/2 made-up/x9/7.7.7' }
  }
  const p = plan()
  p.kit = 'tracy-template-kit/2 made-up/x9/7.7.7'
  const c = copy()
  c.fingerprint.kit = 'tracy-template-kit/2 made-up/x9/7.7.7'
  const { report } = await run({ plan: p, copy: c }, { contract: 'made-up/x9/7.7.7' }, { kit })
  assert.equal(report.status, 'done')
  assert.equal(report.contract, 'made-up/x9/7.7.7')
})

test('a menu item leaving the dropdown claims no slot the plan fills elsewhere', () => {
  const claims = planClaims(
    {
      plan: { pages: [] },
      hidden: new Set(),
      menuHide: [{ slot: 'menuItem-7.0' }, { slot: 'menuItem-8.0' }],
      filled: new Map([['menuItem-7.0', {}]])
    },
    'plan.json'
  )
  assert.deepEqual(
    claims.map((c) => c.slot),
    ['menuItem-8.0']
  )
})

test('an icon goes to its field as the class of the named network, and a setting slot is set aside', () => {
  const icon = (id, network, field) => ({ id, type: 'icon', network, field, fieldValue: `fa fa-${network}` })
  const kit = {
    site: { settingSlots: [{ id: 'contact-1.mobile' }] },
    blocks: [
      {
        lists: [
          {
            rows: [
              { slots: [icon('block-9.1.icon', 'facebook', 'block-9.3')] },
              { slots: [icon('block-9.2.icon', 'instagram', 'block-9.4')] }
            ]
          }
        ]
      }
    ]
  }
  const { changes, routed, deferred } = routeChanges(
    {
      'module-9.1.icon': 'Instagram',
      'module-9.2.icon': 'Myspace',
      'contact-1.mobile': '+1',
      'module-9.5': 'Kept'
    },
    kit,
    ['block-9.1.icon', 'block-9.2.icon', 'contact-1.mobile', 'block-9.5'].map((slot) => ({ slot }))
  )
  assert.deepEqual(changes, { 'module-9.3': 'fa fa-instagram', 'module-9.5': 'Kept' })
  assert.equal(routed.get('module-9.1.icon'), 'module-9.3')
  assert.match(deferred.get('module-9.2.icon'), /no icon for "Myspace"/)
  assert.match(deferred.get('contact-1.mobile'), /page settings/)
})
