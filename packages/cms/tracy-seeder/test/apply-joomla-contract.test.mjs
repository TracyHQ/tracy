import assert from 'node:assert/strict'
import test from 'node:test'
import { applyJoomlaContract } from '../src/apply-joomla-contract.mjs'

const state = {
  ok: true,
  contract: 'apple/1',
  revision: 'rev1',
  pages: [],
  slots: [{ key: 'hero.title', entity: 'hero' }]
}
const mapping = { contract: 'apple/1', revision: 'rev1', changes: { 'hero.title': 'Customer title' } }
test('contract adapter uses only the guarded door and preserves its receipt', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return call.params.operation === 'inspect' ? state : { ok: true, ids: [178] }
  }
  const result = await applyJoomlaContract({ apply, siteKey: 'customer.test', mapping })
  assert.deepEqual(result.ids, [178])
  assert.deepEqual(
    calls.map((c) => c.action),
    ['content.contract', 'content.contract']
  )
  assert.equal(calls[1].params.expected_revision, 'rev1')
  assert.deepEqual(calls[1].params.changes, mapping.changes)
})
test('drift and missing facts stop before any write, with no legacy fallback', async () => {
  for (const candidate of [
    { ...mapping, revision: '' },
    { ...mapping, changes: { published: '0' } },
    { ...mapping, pending: ['customer pricing'] }
  ]) {
    const calls = []
    await assert.rejects(() =>
      applyJoomlaContract({
        siteKey: 'customer.test',
        mapping: candidate,
        apply: async (call) => {
          calls.push(call)
          return state
        }
      })
    )
    assert.equal(calls.length, 1)
  }
})
test('dry run produces a reviewable request without writing', async () => {
  const calls = []
  const result = await applyJoomlaContract({
    siteKey: 'customer.test',
    mapping,
    dry: true,
    apply: async (call) => {
      calls.push(call)
      return state
    }
  })
  assert.equal(calls.length, 1)
  assert.match(result.params.apply_id, /^contract-/)
})

test('lost reply retry keeps its original request and revision for cowork replay', async () => {
  const calls = []
  await applyJoomlaContract({
    siteKey: 'customer.test',
    mapping,
    apply: async (call) => {
      calls.push(call)
      return call.params.operation === 'inspect' ? { ...state, revision: 'rev2' } : { ok: true, ids: [178] }
    }
  })
  assert.equal(calls[1].params.expected_revision, 'rev1')
})

test('a mapping that names a translated copy is refused before any write', async () => {
  // The planner never produces one; a hand-written --copy file could. Either way the seed must not
  // put brief-language copy into another edition.
  const state = {
    contract: 'test/v1',
    revision: 'r',
    slots: [
      { key: 'hero.title', entity: 'module-1', sample: 'Demo', maxCharacters: 80 },
      {
        key: 'zh-TW::hero.title',
        entity: 'zh-TW::module-1',
        sample: 'Demo',
        maxCharacters: 80,
        sourceKey: 'hero.title',
        translates: true
      }
    ]
  }
  const calls = []
  const apply = async (c) => {
    calls.push(c)
    return c.params?.operation === 'inspect' ? { ok: true, ...state } : { ok: true }
  }
  await assert.rejects(
    () =>
      applyJoomlaContract({
        apply,
        siteKey: 'x.example',
        mapping: {
          contract: 'test/v1',
          revision: 'r',
          changes: { 'zh-TW::hero.title': 'Fresh bread' },
          pending: []
        }
      }),
    /does not write a translated copy: zh-TW::hero\.title/
  )
  assert.ok(
    calls.every((c) => c.params?.operation !== 'apply'),
    'nothing was applied'
  )
})
test('an apply the site did not answer cleanly says so, not that the contract is missing', async () => {
  // Measured 23/09/2026 on `j-h0n2f4`: PHP died at its 30-second limit mid-apply, tracy-web relayed
  // `COMPONENT_BAD_RESPONSE` with the site's 500, and the stage read "Content contract unavailable"
  // — for a site whose contract was fine and whose writes had landed.
  const apply = async (call) =>
    call.params.operation === 'inspect'
      ? state
      : { ok: false, code: 'COMPONENT_BAD_RESPONSE', status: 500, httpStatus: 502 }
  await assert.rejects(
    () => applyJoomlaContract({ apply, siteKey: 'customer.test', mapping }),
    (error) =>
      !/contract unavailable/i.test(error.message) &&
      /COMPONENT_BAD_RESPONSE/.test(error.message) &&
      /HTTP 500/.test(error.message) &&
      /may have landed/.test(error.message)
  )
})

// 🔒 A LINK TAKEN OFF IS NAMED, NOT WRITTEN EMPTY (TCH #1013, Claude Cowork for Joomla 0.24.4). `empty_links` names link slots
// whose layout the component reviewed (inspect marks them `emptyLink`); it may stand alone, and it joins the request id only
// when sent, so a mapping without it replays under the id it always had.
const linkState = {
  ...state,
  slots: [
    { key: 'hero.title', entity: 'hero' },
    { key: 'hero.link', entity: 'hero', type: 'url', emptyLink: 'hidden' },
    { key: 'row.link', entity: 'row', type: 'url' }
  ]
}
const linkDoor = (calls) => async (call) => {
  calls.push(call)
  return call.params.operation === 'inspect' ? linkState : { ok: true }
}

test('links to take off are sent as empty_links, alone or beside changes', async () => {
  const calls = []
  await applyJoomlaContract({
    siteKey: 'customer.test',
    mapping: { contract: 'apple/1', revision: 'rev1', changes: {}, emptyLinks: ['hero.link'] },
    apply: linkDoor(calls)
  })
  assert.deepEqual(calls[1].params.empty_links, ['hero.link'])
  assert.equal(calls[1].params.changes, undefined, 'nothing else is sent')
  const both = []
  await applyJoomlaContract({
    siteKey: 'customer.test',
    mapping: { ...mapping, emptyLinks: ['hero.link'] },
    apply: linkDoor(both)
  })
  assert.deepEqual(both[1].params.changes, mapping.changes)
  assert.deepEqual(both[1].params.empty_links, ['hero.link'])
  assert.notEqual(both[1].params.request_id, calls[1].params.request_id)
})

test('a mapping without links to take off keeps the request it always had', async () => {
  const before = []
  const after = []
  await applyJoomlaContract({ siteKey: 'customer.test', mapping, apply: linkDoor(before) })
  await applyJoomlaContract({
    siteKey: 'customer.test',
    mapping: { ...mapping, emptyLinks: [] },
    apply: linkDoor(after)
  })
  assert.equal(after[1].params.request_id, before[1].params.request_id)
  assert.equal('empty_links' in after[1].params, false)
})

test('a link the site has not marked, or one also changed, is refused by name before any write', async () => {
  for (const [candidate, words] of [
    [{ ...mapping, changes: {}, emptyLinks: ['row.link'] }, /row\.link/],
    [{ ...mapping, changes: { 'hero.link': '/x' }, emptyLinks: ['hero.link'] }, /hero\.link/],
    [{ ...mapping, changes: {}, emptyLinks: [] }, /no customer content/]
  ]) {
    const calls = []
    await assert.rejects(
      () => applyJoomlaContract({ siteKey: 'customer.test', mapping: candidate, apply: linkDoor(calls) }),
      words
    )
    assert.equal(calls.length, 1)
  }
})
