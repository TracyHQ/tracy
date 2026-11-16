/**
 * A change request's lines said from their codes' parameters (#609): `changedParams` and `notDoneParams` fill the
 * card's own sentence, and `notDoneReasons` puts a translated lead in before a line the model wrote. In English every
 * line reads exactly as the plan step wrote it. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/revision-lines.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { ownerValuesNotShown } from '../../../wo/website-opportunities/domain/plan-request-owner-apply.mjs'
import { bundleClient, translatorOf, viTablePath } from './bundle-client.mjs'

const viTable = JSON.parse(readFileSync(viTablePath, 'utf8'))
let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    export { english, en } from './strings'
    export { changedLineOf, notDoneLineOf } from './revision-lines'`))
})
after(() => done?.())
const vi = (key, vars) => translatorOf(viTable, lib.en)(key, vars)

test('a changed line is said from its params: the section by its code, the names counted, in each language', () => {
  const params = {
    section: 'gallery',
    label: 'Court photos',
    pageName: 'Home',
    names: [
      { name: 'Photo', count: 3 },
      { name: 'Video', count: 1 }
    ]
  }
  const server = 'The Court photos section of the Home page now shows 3 photos, Video.'
  // English: the plan's own label and sentence, word for word.
  assert.equal(lib.changedLineOf(lib.english, 'block-data', server, params), server)
  // Vietnamese: the section named by its code, the page and the names as the plan has them.
  const said = lib.changedLineOf(vi, 'block-data', server, params)
  assert.equal(
    said,
    vi('plan.revised.line.block-data', {
      section: viTable['plan.section.gallery'],
      page: 'Home',
      names: '3 photos, Video'
    })
  )
  assert.notEqual(said, server)
  // Params that do not fill the sentence keep the server's text, never a made up one.
  assert.equal(lib.changedLineOf(vi, 'block-data', server, { section: 'gallery' }), server)
  assert.equal(lib.changedLineOf(vi, 'some_new_code', server, params), server)
})

test('a not done line is said from its params, and in English reads as the plan step wrote it', () => {
  const revised = {
    pages: [{ id: 'home', blocks: [{ id: 'b1', data: ['name'] }] }],
    leftOut: [
      { item: 'contact-hours', kind: 'item', code: 'no_place_in_design', reason: 'No place shows it.' }
    ]
  }
  const [line] = ownerValuesNotShown(
    { values: [{ kind: 'contact.hours', value: 'Mo-Fr 07:00-19:00' }] },
    revised
  )
  assert.equal(line.code, 'owner_value_not_shown')
  const server = { what: line.what, why: line.why }
  assert.deepEqual(lib.notDoneLineOf(lib.english, line.code, server, line.params), server)
  const said = lib.notDoneLineOf(vi, line.code, server, line.params)
  assert.deepEqual(said, {
    what: vi('plan.revised.notDone.owner_value_not_shown.what', {
      label: viTable['plan.fact.contact.hours']
    }),
    why: viTable['plan.revised.notDone.owner_value_not_shown.why']
  })
  assert.notEqual(said.what, server.what)
})

test('a line the model wrote gets the lead in of its refusal kind in another language, never in English', () => {
  const line = { what: 'A members only area', why: 'There is no login on the site.' }
  for (const reason of ['no_recipe', 'no_data', 'fact_missing', 'kept_private', 'outside_plan']) {
    const lead = viTable[`plan.revised.notDone.reason.${reason}`]
    assert.ok(lead && lead !== lib.en[`plan.revised.notDone.reason.${reason}`], reason)
    assert.deepEqual(lib.notDoneLineOf(vi, null, line, null, reason), {
      what: line.what,
      why: `${lead} ${line.why}`
    })
    assert.deepEqual(lib.notDoneLineOf(lib.english, null, line, null, reason), line, reason)
  }
  // A kind outside Contract B's closed set, or none: the model's words alone.
  assert.deepEqual(lib.notDoneLineOf(vi, null, line, null, 'not_a_kind'), line)
  assert.deepEqual(lib.notDoneLineOf(vi, null, line, null, null), line)
})
