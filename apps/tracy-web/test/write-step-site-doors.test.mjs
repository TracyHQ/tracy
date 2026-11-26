// The site door of each CMS the write step writes (src/write-step/site-doors/index.js): the Joomla and EmDash doors send
// exactly the calls the seeder's own contract caller sends, the EmDash door answers itself what EmDash has no door for, and a
// run on a CMS with no door that writes stops before any call.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { seeder } from '../src/lib/seeder.js'
import { notOnPlatform, onPlatform, platformStop, siteDoorFor } from '../src/write-step/site-doors/index.js'
import { runWriteStep } from '../src/write-step/write-step.js'

const CONTRACT = 'harbour-test/j6/0.0.1'

/** A Claude Cowork for Joomla stand-in that keeps every call and answers inspect and apply. */
function recordingSite() {
  const calls = []
  const apply = async (call) => {
    calls.push(structuredClone(call))
    if (call.params?.operation === 'inspect')
      return {
        ok: true,
        contract: CONTRACT,
        revision: 'rev-1',
        slots: [{ key: 'block-1.0' }, { key: 'block-1.1' }]
      }
    if (call.params?.operation === 'apply') return { ok: true, revision: 'rev-2' }
    return { ok: false, error: 'UNKNOWN_OPERATION' }
  }
  return { apply, calls }
}

const MAPPING = {
  contract: CONTRACT,
  revision: 'rev-1',
  changes: { 'block-1.0': 'Harbour Kitchen', 'block-1.1': 'Fresh fish every morning' },
  evidence: {},
  emptyLinks: [],
  emptySlots: [],
  pending: []
}

test('the Joomla door writes the contract with the very calls the seeder caller sends', async () => {
  const door = siteDoorFor('joomla')
  assert.equal(door.platform, 'joomla')
  assert.equal(door.writes, true)

  const through = recordingSite()
  const answer = await door.applyContract({ apply: through.apply, siteKey: 'harbour', mapping: MAPPING })

  const direct = recordingSite()
  const { applyJoomlaContract } = await seeder('apply-joomla-contract')
  const expected = await applyJoomlaContract({ apply: direct.apply, siteKey: 'harbour', mapping: MAPPING })

  assert.deepEqual(through.calls, direct.calls)
  assert.deepEqual(answer, expected)
  assert.deepEqual(
    through.calls.map((c) => c.params.operation),
    ['inspect', 'apply']
  )
})

test("the Joomla door words a refusal in the plugin's own words, as the seeder does", async () => {
  const refused = { ok: false, error: 'CONTENT_CHANGED', message: 'Content changed since inspect' }
  const { doorRefusal } = await seeder('apply-joomla-contract')
  assert.equal(await siteDoorFor('joomla').refusal(refused), doorRefusal(refused))
})

test('the EmDash door writes the contract with the calls the seeder caller sends, in the same protocol', async () => {
  const door = siteDoorFor('emdash')
  assert.equal(door.platform, 'emdash')
  assert.equal(door.writes, true)
  const through = recordingSite()
  await door.applyContract({ apply: through.apply, siteKey: 'harbour', mapping: MAPPING })
  const direct = recordingSite()
  const { applyJoomlaContract } = await seeder('apply-joomla-contract')
  await applyJoomlaContract({ apply: direct.apply, siteKey: 'harbour', mapping: MAPPING })
  assert.deepEqual(through.calls, direct.calls)
})

test('🔒 on EmDash a call the Apply door has no door for is answered by name and never sent; on Joomla every call is sent', async () => {
  const site = recordingSite()
  const emdash = onPlatform({ apply: site.apply, other: 1 }, 'emdash')
  assert.equal(emdash.other, 1, 'the run door keeps its other doors')
  const answer = await emdash.apply({
    siteKey: 'harbour',
    action: 'content.update',
    params: { kind: 'menuItem', id: 3 }
  })
  assert.equal(answer.ok, false)
  assert.equal(answer.error, 'not_on_emdash')
  assert.match(answer.message, /EmDash has no door for content\.update menuItem yet/)
  await emdash.apply({ siteKey: 'harbour', action: 'template.siteSettings', params: { operation: 'set' } })
  assert.deepEqual(site.calls, [])
  await emdash.apply({ siteKey: 'harbour', action: 'content.contract', params: { operation: 'inspect' } })
  await emdash.apply({ siteKey: 'harbour', action: 'media.upload', params: {} })
  assert.deepEqual(
    site.calls.map((c) => c.action),
    ['content.contract', 'media.upload']
  )
  const joomla = { apply: site.apply }
  assert.equal(onPlatform(joomla, 'joomla'), joomla)
})

test('every CMS the write step knows has a door that writes; an unknown platform has none at all', () => {
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    assert.equal(siteDoorFor(platform).platform, platform)
    assert.equal(siteDoorFor(platform).writes, true)
  }
  assert.equal(siteDoorFor('drupal'), null)
  assert.equal(siteDoorFor(undefined), null)
})

test('a kit stops the write by its platform: none for the three CMS, a code for none', () => {
  assert.equal(platformStop({ ref: CONTRACT, platform: 'joomla' }), null)
  assert.equal(platformStop({ ref: 'tracy-diner/emdash-0.x/0.1.4', platform: 'emdash' }), null)
  assert.equal(platformStop({ ref: 'ja-diner/wp7/1.0.4', platform: 'wordpress' }), null)
  assert.equal(platformStop({ ref: 'x/1', platform: 'drupal' }).code, 'WRITE_STEP_KIT_PLATFORM')
  // A kit that names no platform is an error, never taken for Joomla.
  const none = platformStop({ ref: 'test-kit' })
  assert.equal(none.code, 'WRITE_STEP_KIT_PLATFORM')
  assert.match(none.reason, /test-kit/)
})

for (const [platform, code] of [[undefined, 'WRITE_STEP_KIT_PLATFORM']]) {
  test(`a write step run on a ${platform ?? 'platform-less'} kit stops with ${code} before any call or file read`, async () => {
    const site = recordingSite()
    const report = await runWriteStep({
      door: { apply: site.apply },
      siteKey: 'harbour',
      kit: { ref: 'ja-diner/wp7/1.0.4', doc: { contract: 'ja-diner/wp7/1.0.4' }, platform },
      contentMap: null,
      // Files that do not exist: a run that read them would stop on a file problem instead.
      files: { plan: '/nowhere/plan.json', copy: '/nowhere/site-copy.json' }
    })
    assert.equal(report.status, 'stopped')
    assert.equal(report.cause.code, code)
    assert.deepEqual(site.calls, [])
  })
}

test('on EmDash a line that failed only for want of a door is skipped and says so; any other failure stays', () => {
  const noDoor = {
    slot: 'page-home:title',
    status: 'failed',
    reason: 'the menu could not be read: not_on_emdash: EmDash has no door for content.list menuItem yet'
  }
  assert.deepEqual(notOnPlatform(noDoor, 'emdash'), {
    ...noDoor,
    status: 'skipped',
    reason: `not on EmDash yet: ${noDoor.reason}`
  })
  const closed = {
    slot: 'legal:privacy',
    status: 'failed',
    reason: 'the plugin on this site is older than page creation'
  }
  assert.equal(notOnPlatform(closed, 'emdash').status, 'skipped')
  // A refusal of the site itself is a failure on every platform, and nothing changes on Joomla.
  const refused = { slot: 'x', status: 'failed', reason: 'SLOT_BAD_URL: "Book" is no address' }
  assert.equal(notOnPlatform(refused, 'emdash'), refused)
  assert.equal(notOnPlatform(noDoor, 'joomla'), noDoor)
  assert.equal(notOnPlatform(closed, 'joomla'), closed)
  const written = { slot: 'y', status: 'written', reason: null }
  assert.equal(notOnPlatform(written, 'emdash'), written)
})
