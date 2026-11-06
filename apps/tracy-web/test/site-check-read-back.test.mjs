// The site check through its entry point (ADR 0044, decisions 7 and 8): a write report and a site door in, `site-check/1`
// out. The door is a fake that answers as the plugin does; every value is made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck, SITE_CHECK_GROUPS } from '../src/site-check/site-check.js'
import { withReadBack } from '../src/site-check/read-back.js'
import { checkSite, report, written } from './_site-check.mjs'
import { KIT, plan, copy, runStep } from './_write-step-run.mjs'

const check = (site, rep, over = {}) => runSiteCheck({ door: site.door, report: rep, ...over })
const group = (result, name = 'read-back') => result.groups.find((g) => g.name === name)
const failuresOf = (result) => group(result).failures

test('every written line holding what was ordered is green, with the reads it used listed', async () => {
  const site = checkSite({ 'module-2.1': 'Train with us', 'module-2.2': 'Join today' })
  const result = await check(
    site,
    report([
      written('block-2.1', 'module-2.1', 'Train with us'),
      written('block-2.2', 'module-2.2', 'Join today')
    ])
  )
  assert.equal(result.version, 'site-check/1')
  assert.equal(result.status, 'green')
  assert.equal(group(result).status, 'green')
  assert.equal(group(result).checked, 2)
  assert.deepEqual(group(result).reads, [{ read: 'content.contract inspect', lines: 2 }])
  assert.deepEqual(result.counts, { block: 0, warn: 0, unmeasured: 0, notApplicable: 3 })
})

test('a slot changed by hand is red, naming the page, the slot, the measured value and step 9', async () => {
  const site = checkSite({ 'module-2.1': 'Changed by hand', 'module-2.2': 'Join today' })
  const result = await check(
    site,
    report([
      written('block-2.1', 'module-2.1', 'Train with us'),
      written('block-2.2', 'module-2.2', 'Join today')
    ])
  )
  assert.equal(result.status, 'red')
  assert.deepEqual(failuresOf(result).length, 1)
  const [failure] = failuresOf(result)
  assert.equal(failure.group, 'read-back')
  assert.equal(failure.slot, 'block-2.1')
  assert.equal(failure.key, 'module-2.1')
  assert.equal(failure.page, 'home')
  assert.equal(failure.width, null)
  assert.equal(failure.measured, 'Changed by hand')
  assert.equal(failure.ordered, 'Train with us')
  assert.equal(failure.level, 'block')
  assert.equal(failure.causingStep, 9)
  assert.deepEqual(result.counts, { block: 1, warn: 0, unmeasured: 0, notApplicable: 3 })
})

test('a line the plugin refused stays red, in the plugin words, even when the site holds the ordered value', async () => {
  const refused = {
    ...written('block-2.1', 'module-2.1', 'Too long for its box'),
    status: 'failed',
    reason: 'SLOT_TOO_LONG: Content too long: module-2.1 (limit 10, actual 20)'
  }
  const result = await check(checkSite({ 'module-2.1': 'Too long for its box' }), report([refused]))
  assert.equal(result.status, 'red')
  const [failure] = failuresOf(result)
  assert.equal(failure.slot, 'block-2.1')
  assert.equal(failure.causingStep, 9)
  assert.match(failure.reason, /SLOT_TOO_LONG/)
  assert.equal(failure.measured, 'Too long for its box')
})

test('a red read-back stops the later groups and they say so', async () => {
  let ran = 0
  const later = {
    name: 'later',
    causingStep: 6,
    run: async () => {
      ran += 1
      return { checked: 1, failures: [] }
    }
  }
  const result = await check(
    checkSite({ 'module-2.1': 'Changed' }),
    report([written('block-2.1', 'module-2.1', 'Ordered')]),
    { groups: [...SITE_CHECK_GROUPS, later] }
  )
  assert.equal(ran, 0)
  assert.equal(group(result, 'later').status, 'not-run')
  assert.match(group(result, 'later').reason, /read-back/)
  assert.equal(result.status, 'red')
})

test('allGroups runs the later groups after a red read-back, says so, and the check stays red', async () => {
  let ran = 0
  const later = {
    name: 'later',
    causingStep: 6,
    run: async () => {
      ran += 1
      return { checked: 3, failures: [] }
    }
  }
  const result = await check(
    checkSite({ 'module-2.1': 'Changed' }),
    report([written('block-2.1', 'module-2.1', 'Ordered')]),
    { groups: [...SITE_CHECK_GROUPS, later], allGroups: true }
  )
  assert.equal(ran, 1)
  assert.equal(group(result, 'later').status, 'green')
  assert.equal(group(result, 'later').checked, 3)
  assert.match(group(result, 'later').ranDespite, /read-back is red/)
  assert.equal(result.allGroups, true)
  assert.equal(result.status, 'red')
})

test('allGroups never turns an unmeasured read-back green', async () => {
  const site = checkSite({}, { inspect: { ok: false, code: 'COMPONENT_UNREACHABLE', message: 'No answer' } })
  const later = { name: 'later', causingStep: 6, run: async () => ({ checked: 1, failures: [] }) }
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]), {
    groups: [...SITE_CHECK_GROUPS, later],
    allGroups: true
  })
  assert.equal(group(result, 'later').status, 'green')
  assert.equal(result.status, 'unmeasured')
})

test('a default run does not say allGroups, and a green read-back adds no ranDespite', async () => {
  const later = { name: 'later', causingStep: 6, run: async () => ({ checked: 1, failures: [] }) }
  const result = await check(
    checkSite({ 'module-2.1': 'Ordered' }),
    report([written('block-2.1', 'module-2.1', 'Ordered')]),
    { groups: [...SITE_CHECK_GROUPS, later], allGroups: true }
  )
  assert.equal(result.status, 'green')
  assert.equal(group(result, 'later').ranDespite, undefined)
  const plain = await check(
    checkSite({ 'module-2.1': 'Ordered' }),
    report([written('block-2.1', 'module-2.1', 'Ordered')]),
    { groups: [...SITE_CHECK_GROUPS, later] }
  )
  assert.equal(plain.allGroups, false)
})

test('a green read-back lets later groups run, and a later group is added without touching the check', async () => {
  const later = {
    name: 'later',
    causingStep: 6,
    run: async ({ read }) => {
      const reading = await read('content.contract', { operation: 'inspect' })
      return {
        checked: reading.slots.length,
        failures: [
          { page: 'home', slot: 'block-2.1', width: 390, measured: 'demo word', reason: 'blocks' },
          { page: 'home', slot: 'block-2.1', width: 1440, measured: 'tall', level: 'warn', causingStep: 8 }
        ]
      }
    }
  }
  const site = checkSite({ 'module-2.1': 'Ordered' })
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]), {
    groups: [...SITE_CHECK_GROUPS, later]
  })
  assert.equal(group(result).status, 'green')
  assert.equal(group(result, 'later').status, 'red')
  const [block, warn] = group(result, 'later').failures
  assert.deepEqual([block.level, block.causingStep, block.width, block.group], ['block', 6, 390, 'later'])
  assert.deepEqual([warn.level, warn.causingStep], ['warn', 8])
  assert.deepEqual(result.counts, { block: 1, warn: 1, unmeasured: 0, notApplicable: 3 })
  assert.equal(result.status, 'red')
  assert.equal(site.calls.length, 1, 'one inspect is shared by every group')
})

test('warnings alone keep a group and the check green', async () => {
  const warns = {
    name: 'warns',
    causingStep: 8,
    run: async () => ({
      checked: 1,
      failures: [{ page: 'home', slot: 'x', level: 'warn', measured: 'tall' }]
    })
  }
  const result = await check(checkSite({}), report([]), { groups: [warns] })
  assert.equal(result.status, 'green')
  assert.deepEqual(result.counts, { block: 0, warn: 1, unmeasured: 0, notApplicable: 0 })
})

test('nothing on the site changes: only inspect is asked, and a group cannot write through the check', async () => {
  const site = checkSite({ 'module-2.1': 'Ordered' })
  await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]))
  assert.deepEqual(
    site.calls.map((c) => [c.siteKey, c.action, c.params.operation]),
    [[report([]).site, 'content.contract', 'inspect']]
  )
  const writer = {
    name: 'writer',
    causingStep: 9,
    run: ({ read }) => read('content.contract', { operation: 'apply', changes: {} })
  }
  const result = await check(site, report([]), { groups: [writer] })
  assert.equal(group(result, 'writer').status, 'unmeasured')
  assert.equal(site.calls.length, 1)
})

for (const [name, type, ordered, held] of [
  [
    'a whole heading, where the site collapses spaces',
    { xpath: '/html/body/div' },
    'Train  with\nus ',
    'Train with us'
  ],
  ['joined paragraphs', {}, '((p))One((/p))\n((p))Two((/p))', '((p))One((/p))\n((p))Two((/p))'],
  [
    'joined bullets with line breaks read as spaces',
    { xpath: '/html/body/div' },
    '((ul))\n((li))One((/li))\n((/ul))',
    '((ul)) ((li))One((/li)) ((/ul))'
  ],
  [
    'a picture stored as Joomla writes media values',
    { type: 'image' },
    'images/a/b.jpg',
    'images/a/b.jpg#joomlaImage://local-images/a/b.jpg?width=8&height=6'
  ],
  ['a picture with a leading slash', { type: 'image' }, 'images/a/b.jpg', '/images/a/b.jpg'],
  [
    'an attribute reading an entity back as its character',
    { type: 'url', xpath: '/html/body/div/a/@href' },
    '/a?b=1&amp;c=2',
    '/a?b=1&c=2'
  ],
  [
    'a link the HTML saver percent-encodes',
    { type: 'url', xpath: '/html/body/div/a/@href' },
    'https://example.test/a{b}',
    'https://example.test/a%7Bb%7D'
  ]
])
  test(`the same value in another form is a match: ${name}`, async () => {
    const site = checkSite({ 'module-2.1': held }, { types: { 'module-2.1': type } })
    const result = await check(site, report([written('block-2.1', 'module-2.1', ordered)]))
    assert.deepEqual(failuresOf(result), [])
    assert.equal(result.status, 'green')
  })

for (const [name, type, ordered, held] of [
  ['two words run together', {}, 'Train with', 'Trainwith'],
  ['a word in another case', {}, 'Train', 'TRAIN'],
  [
    'another picture',
    { type: 'image' },
    'images/a.jpg',
    'images/b.jpg#joomlaImage://local-images/a.jpg?width=8&height=6'
  ],
  ['another link', { type: 'url' }, '/a', '/b'],
  ['an entity kept as text in a text node', { xpath: '/html/body/div/text()' }, 'A &amp; B', 'A & B'],
  ['a slot left on its demo value when something else was ordered', {}, 'New words', 'Demo words'],
  ['a slot left empty', {}, 'New words', '']
])
  test(`a real difference stays red: ${name}`, async () => {
    const site = checkSite({ 'module-2.1': held }, { types: { 'module-2.1': type } })
    const result = await check(site, report([written('block-2.1', 'module-2.1', ordered)]))
    assert.equal(failuresOf(result).length, 1)
    assert.equal(failuresOf(result)[0].measured, held)
  })

test('a written slot the site no longer has is red', async () => {
  const result = await check(checkSite({}), report([written('block-2.1', 'module-2.1', 'Ordered')]))
  assert.equal(failuresOf(result).length, 1)
  assert.equal(failuresOf(result)[0].measured, null)
  assert.match(failuresOf(result)[0].reason, /does not have/)
})

test('a written slot whose inspect entry carries no current value is red, not assumed good', async () => {
  const site = checkSite(
    {},
    {
      inspect: {
        ok: true,
        contract: report([]).contract,
        pages: [],
        slots: [{ key: 'module-2.1', entity: 'module-2' }]
      }
    }
  )
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]))
  assert.match(failuresOf(result)[0].reason, /no current value/)
  assert.equal(result.status, 'red')
})

test('a hidden line is green when the slot is empty and red while it still holds words', async () => {
  const hidden = { ...written('block-2.3', 'module-2.3'), status: 'hidden', ordered: undefined }
  assert.equal((await check(checkSite({ 'module-2.3': ' ' }), report([hidden]))).status, 'green')
  const red = await check(checkSite({ 'module-2.3': 'Demo words' }), report([hidden]))
  assert.equal(failuresOf(red)[0].measured, 'Demo words')
})

test('a hidden line gone with its block is read on the block: green unpublished, red while still published', async () => {
  const hidden = {
    ...written('block-4.1', 'module-4.1'),
    status: 'hidden',
    ordered: '0',
    readFrom: { action: 'content.get', params: { kind: 'module', id: 4 }, path: ['item', 'published'] }
  }
  const site = (published) =>
    checkSite(
      { 'module-4.1': 'Demo words stay in a row no page prints' },
      { answers: { 'content.get': { ok: true, item: { published } } } }
    )
  assert.equal((await check(site(0), report([hidden]))).status, 'green')
  const red = await check(site(1), report([hidden]))
  assert.equal(red.status, 'red')
  assert.match(failuresOf(red)[0].reason, /still published/)
  assert.equal(failuresOf(red)[0].measured, '1')
})

test('skipped lines are counted, not compared, and a read-back that compared none is unmeasured', async () => {
  const skipped = {
    ...written('block-2.4', 'module-2.4'),
    status: 'skipped',
    reason: 'not written yet',
    ordered: undefined
  }
  const result = await check(checkSite({ 'module-2.4': 'Demo words' }), report([skipped]))
  // Nothing compared is not green (ADR 0044, decision 27).
  assert.equal(result.status, 'unmeasured')
  assert.equal(group(result).status, 'unmeasured')
  assert.equal(group(result).checked, 0)
  assert.equal(group(result).skipped, 1)
})

test('a line written through another door names its read, and that read is used and listed', async () => {
  const name = written('site-name', null, 'Quay Studio', {
    part: 'brand',
    readFrom: { action: 'site.identity', params: { operation: 'read' }, path: ['fields', 'name'] }
  })
  const site = checkSite(
    { 'module-2.1': 'Ordered' },
    { answers: { 'site.identity': { ok: true, fields: { name: 'Other Name' } } } }
  )
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered'), name]))
  assert.deepEqual(group(result).reads, [
    { read: 'content.contract inspect', lines: 1 },
    { read: 'site.identity read', lines: 1 }
  ])
  assert.equal(failuresOf(result)[0].slot, 'site-name')
  assert.equal(failuresOf(result)[0].measured, 'Other Name')
  assert.equal(failuresOf(result)[0].page, null)
})

test('a written line with no read warns and is listed, so green never claims more than was read', async () => {
  const line = written('site-accent', null, '#123456', { part: 'brand' })
  const result = await check(checkSite({}), report([line]))
  assert.equal(result.status, 'green')
  assert.equal(failuresOf(result)[0].level, 'warn')
  assert.deepEqual(group(result).reads, [{ read: 'none', lines: 1, parts: ['brand'] }])
})

test('a report that did not finish is red and blames step 9', async () => {
  const result = await check(
    checkSite({}),
    report([], { status: 'stopped', cause: { code: 'REFUSED', reason: 'The plugin said no' } })
  )
  assert.equal(result.status, 'red')
  assert.equal(failuresOf(result)[0].causingStep, 9)
  assert.equal(failuresOf(result)[0].measured, 'stopped')
  assert.match(failuresOf(result)[0].reason, /REFUSED/)
})

test('a site answering another contract is red and no slot is compared', async () => {
  const site = checkSite({}, { inspect: { ok: true, contract: 'other/j6/9.9.9', pages: [], slots: [] } })
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]))
  assert.equal(failuresOf(result).length, 1)
  assert.equal(failuresOf(result)[0].measured, 'other/j6/9.9.9')
})

test('a site that does not answer is unmeasured: never green, and later groups do not run', async () => {
  const site = checkSite({}, { inspect: { ok: false, code: 'COMPONENT_UNREACHABLE', message: 'No answer' } })
  const later = { name: 'later', causingStep: 6, run: async () => ({ checked: 0, failures: [] }) }
  const result = await check(site, report([written('block-2.1', 'module-2.1', 'Ordered')]), {
    groups: [...SITE_CHECK_GROUPS, later]
  })
  assert.equal(result.status, 'unmeasured')
  assert.equal(group(result).status, 'unmeasured')
  assert.match(group(result).reason, /No answer/)
  assert.equal(group(result, 'later').status, 'not-run')
})

test('a report with no ordered values cannot be measured and says to run the write step again', async () => {
  const old = { ...written('block-2.1', 'module-2.1', 'x'), ordered: undefined }
  const result = await check(checkSite({ 'module-2.1': 'x' }), report([old]))
  assert.equal(result.status, 'unmeasured')
  assert.match(group(result).reason, /run the write step again/i)
})

test('the read-back results go on the report lines, and the check beside them', async () => {
  const rep = report([
    written('block-2.1', 'module-2.1', 'Ordered'),
    written('block-2.2', 'module-2.2', 'Ordered'),
    { ...written('block-2.3', 'module-2.3', 'Refused'), status: 'failed', reason: 'NO' },
    { ...written('block-2.4', 'module-2.4'), status: 'skipped', ordered: undefined }
  ])
  const site = checkSite({ 'module-2.1': 'Ordered', 'module-2.2': 'Changed', 'module-2.3': 'Demo' })
  const result = await check(site, rep)
  const after = withReadBack(rep, result)
  assert.deepEqual(
    after.slots.map((s) => s.readBack),
    ['match', 'differs', 'failed', null]
  )
  assert.equal(after.siteCheck.status, 'red')
  assert.equal(rep.slots[0].readBack, null, 'the report given in is left as it was')
})

// The real write step on a fake site, then the check on that same site: the report keeps what it ordered.
function afterWrite(site) {
  return {
    door: {
      async apply(call) {
        const answer = await site.door.apply(call)
        if (call.params.operation !== 'inspect') return answer
        return { ...answer, slots: answer.slots.map((s) => ({ ...s, current: site.held[s.key] ?? '' })) }
      }
    }
  }
}

test('a report from the write step reads back green on the site it wrote, and red after a hand edit', async () => {
  const { report: rep, site } = await runStep()
  assert.equal(rep.slots.find((s) => s.slot === 'block-2.1').ordered, 'Train with a coach who knows you')
  const green = await check(afterWrite(site), rep)
  assert.equal(green.status, 'green')
  assert.equal(group(green).checked, rep.counts.written + rep.counts.hidden)
  site.held['module-2.1'] = 'Changed by hand'
  const red = await check(afterWrite(site), rep)
  assert.equal(red.status, 'red')
  assert.deepEqual(
    failuresOf(red).map((f) => [f.slot, f.causingStep]),
    [['block-2.1', 9]]
  )
})

test('a slot the plugin refused in a real write keeps its order and turns the check red', async () => {
  const refuse = { 'module-2.1': { code: 'SLOT_TOO_LONG', message: 'Content too long' } }
  const { report: rep, site } = await runStep({}, { refuse })
  const line = rep.slots.find((s) => s.slot === 'block-2.1')
  assert.equal(line.status, 'failed')
  assert.equal(line.ordered, 'Train with a coach who knows you')
  const result = await check(afterWrite(site), rep)
  assert.equal(result.status, 'red')
  assert.deepEqual(
    failuresOf(result).map((f) => f.slot),
    ['block-2.1']
  )
})

test('an icon reads back from the text slot it was routed to, as the class it was turned into', async () => {
  const icon = {
    id: 'block-2.8',
    type: 'icon',
    network: 'quay',
    field: 'block-2.9',
    fieldValue: 'fa fa-quay'
  }
  const kit = KIT()
  kit.doc.blocks[0].lists = [
    { id: 'block-2.l', rows: [{ slots: [icon, { id: 'block-2.9', type: 'text' }] }] }
  ]
  const c = copy()
  c.slots.push({ slot: 'block-2.8', owner: 'writer', text: 'Quay', factIds: [] })
  const { report: rep, site } = await runStep(
    { plan: plan(), copy: c },
    { extraKeys: ['module-2.9'] },
    { kit }
  )
  const line = rep.slots.find((s) => s.slot === 'block-2.8')
  assert.equal(line.key, 'module-2.9')
  assert.equal(line.ordered, 'fa fa-quay')
  assert.equal((await check(afterWrite(site), rep)).status, 'green')
  site.held['module-2.9'] = 'fa fa-other'
  const [failure] = failuresOf(await check(afterWrite(site), rep))
  assert.deepEqual([failure.slot, failure.key, failure.measured], ['block-2.8', 'module-2.9', 'fa fa-other'])
})

test('a read that steps into a JSON column, or answers a number, is compared as words', async () => {
  const title = written('page-home:title', null, 'Quay Studio', {
    part: 'page-title',
    readFrom: {
      action: 'content.get',
      params: { kind: 'menuItem', id: 1 },
      path: ['item', 'params', 'page_title']
    }
  })
  const hide = written('menuItem-3', null, '0', {
    part: 'menu-hide',
    readFrom: { action: 'content.get', params: { kind: 'menuItem', id: 3 }, path: ['item', 'published'] }
  })
  const item = { params: JSON.stringify({ page_title: 'Quay Studio' }), published: 0 }
  const green = await check(
    checkSite({}, { answers: { 'content.get': { ok: true, item } } }),
    report([title, hide])
  )
  assert.equal(green.status, 'green')
  assert.equal(group(green).checked, 2)
  const stale = { params: JSON.stringify({ page_title: 'Demo' }), published: 1 }
  const red = await check(
    checkSite({}, { answers: { 'content.get': { ok: true, item: stale } } }),
    report([title, hide])
  )
  assert.deepEqual(
    failuresOf(red)
      .map((f) => f.measured)
      .sort(),
    ['1', 'Demo']
  )
})

test('a write report from the write step is read back whole: pages, settings and hidden items', async () => {
  const { report: written_, site } = await runStep(
    {},
    { records: [{ kind: 'menuItem', id: 101, published: 1, home: 1, path: 'home', params: '{}' }] },
    {
      kit: Object.assign(KIT(), {
        doc: { ...KIT().doc, pages: [{ id: 'page-home', path: '/' }] }
      })
    }
  )
  assert.equal(written_.slots.find((s) => s.slot === 'page-home:title').status, 'written')
  const result = await check(site, written_)
  const mine = (name) => group(result).lines?.[name]
  assert.equal(mine('page-home:title'), 'match')
  assert.equal(mine('page-home:description'), 'match')
})
