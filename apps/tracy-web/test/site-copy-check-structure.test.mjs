import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHECKER_VERSION, checkCopy, failureListText } from '../src/site-writer/copy-check/check-copy.js'
import { brief, breaks, ruleOf, check, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

test('the passing copy passes every rule and the version is frozen', () => {
  const r = check(copy())
  assert.equal(CHECKER_VERSION, 'site-copy-check/1')
  assert.deepEqual(
    r.rules.map((x) => `${x.id}:${x.status}`),
    ['W01', 'W02', 'W03', 'W04', 'W05', 'W06', 'W07', 'W08', 'W09', 'W10', 'W11'].map((id) => `${id}:pass`)
  )
  assert.equal(r.meta.checker, 'site-copy-check/1')
  assert.deepEqual(check(copy()), r)
  assert.equal(failureListText(r), '')
})

test('W01 fails a copy file that does not match site-copy/1, and nothing throws', () => {
  const w01 = (mutate, detail) => {
    const c = copy()
    mutate(c)
    const r = ruleOf(c, 'W01')
    assert.equal(r.status, 'fail')
    assert.ok(
      r.failures.some((f) => detail.test(f.detail)),
      r.failures.map((f) => f.detail).join('\n')
    )
  }
  w01((c) => {
    c.slots[1].owner = 'robot'
  }, /owner/)
  w01((c) => {
    delete c.fingerprint.planSha256
  }, /planSha256/)
  w01((c) => {
    c.version = 'site-copy/2'
  }, /version/)
  w01((c) => {
    c.notebook = [{ page: 'page-home' }]
  }, /notebook/)
  w01((c) => {
    c.returns = [{ slot: 'block-3.6' }]
  }, /returns/)
  breaks(
    'W01',
    (c) => {
      c.fingerprint.kit = ''
    },
    /fingerprint\.kit/
  )
  for (const bad of [
    null,
    'x',
    [],
    {},
    { slots: 'no' },
    { version: 'site-copy/1', slots: [null, 3, { text: 5 }], alts: {}, seo: [[]] }
  ]) {
    const r = checkCopy({ copy: bad, plan: plan(), kit: kit(), brief: brief() })
    assert.equal(r.rules.find((x) => x.id === 'W01').status, 'fail')
  }
  const r = checkCopy({ copy: copy(), plan: null, kit: kit(), brief: brief() })
  assert.ok(r.inputErrors.length)
})

test('W02 fails missing, duplicate, hidden, unknown and altered label slots; a returned slot may be absent', () => {
  breaks(
    'W02',
    (c) => {
      c.slots = c.slots.filter((s) => s.slot !== 'block-3.6')
    },
    /block-3\.6.*missing/
  )
  breaks(
    'W02',
    (c) => {
      c.slots.push({ ...slotOf(c, 'block-3.1'), text: 'Our members' })
    },
    /block-3\.1.*twice/
  )
  breaks(
    'W02',
    (c) => {
      c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'hidden text', factIds: [] })
    },
    /block-2\.3.*hidden/
  )
  breaks(
    'W02',
    (c) => {
      c.slots.push({ slot: 'block-9.9', owner: 'writer', text: 'x', factIds: [] })
    },
    /block-9\.9.*unknown/
  )
  breaks(
    'W02',
    (c) => {
      slotOf(c, 'block-1.1').text = 'Join now'
    },
    /block-1\.1.*Join us/
  )
  breaks(
    'W02',
    (c) => {
      slotOf(c, 'block-2.1').owner = 'plan-label'
    },
    /block-2\.1.*owner/
  )
  const c = copy()
  c.slots = c.slots.filter((s) => s.slot !== 'block-3.6')
  c.returns = [{ slot: 'block-3.6', reason: 'the brief has no second review' }]
  assert.equal(check(c).rules.find((x) => x.id === 'W02').status, 'pass')
})

test('W03 fails text over the limit, under the demo floor, empty, or with too many paragraphs', () => {
  breaks(
    'W03',
    (c) => {
      slotOf(c, 'block-2.1').text = 'Train with a coach who knows you by name now'
    },
    /block-2\.1.*44.*40/
  )
  breaks(
    'W03',
    (c) => {
      slotOf(c, 'block-2.2').text = 'Small classes.'
    },
    /block-2\.2.*14.*56/
  )
  breaks(
    'W03',
    (c) => {
      slotOf(c, 'block-2.2').text = ['One.', 'Two.', 'Three.', 'Four.']
    },
    /block-2\.2.*4 paragraphs.*3/
  )
  breaks(
    'W03',
    (c) => {
      slotOf(c, 'block-3.1').text = ''
    },
    /block-3\.1.*empty/
  )
  const c = copy()
  slotOf(c, 'block-2.2').text = [
    'Small group classes run every day.',
    'Open 06:00 to 21:00, Monday to Saturday.',
    'Call +000 555 0100 to reserve.'
  ]
  assert.equal(check(c).rules.find((x) => x.id === 'W03').status, 'pass')
})

test('the failure list text names slot, rule and measured numbers', () => {
  const c = copy()
  slotOf(c, 'block-2.1').text = 'Train with a coach who knows you by name now'
  const t = failureListText(check(c))
  assert.match(t, /^W03 \| .* \| block-2\.1 \| .*44.*40.*\n$/)
})

test('oddly shaped plan, kit and brief parts never throw', () => {
  for (const odd of [
    {},
    { pages: 'x', sharedBlocks: [null, 3] },
    { pages: [{ blocks: [{ copy: 'x', lists: [null] }] }] }
  ]) {
    const r = checkCopy({
      copy: copy(),
      plan: odd,
      kit: { blocks: [null, { slots: 5 }] },
      brief: { facts: 'x', missing: [7] }
    })
    assert.equal(r.rules.length, 11)
  }
})
