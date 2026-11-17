// The plan card speaks the language the owner chats in (#575 walk: a Vietnamese chat read English section reasons):
// the composer's model is told that language, and asked to write its owner facing sentences in it. Site content
// (labels) stays in the site's language. The invented florist on the JA Boxing block store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-composer-owner-language.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { PLAN_COMPOSER_PROMPT, planComposerRequest } from '../domain/plan-composer-request.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { INPUT } from './fixtures/write-order/boxing-gate.mjs'

const userOf = (input) => JSON.parse(planComposerRequest(composerContextOf(input)).user)

test('the model reads the language the owner chats in beside the site language', () => {
  const user = userOf({ ...INPUT, profile: boxingProfile(), ownerLanguage: 'vi' })
  assert.equal(user.language, 'en')
  assert.equal(user.ownerLanguage, 'vi')
})

test('no owner language, or one that is not a two letter code, is not sent', () => {
  assert.equal('ownerLanguage' in userOf({ ...INPUT, profile: boxingProfile() }), false)
  assert.equal(
    'ownerLanguage' in userOf({ ...INPUT, profile: boxingProfile(), ownerLanguage: 'Vietnamese' }),
    false
  )
})

test('the prompt asks for the owner facing sentences in that language and for ids as item', () => {
  assert.match(
    PLAN_COMPOSER_PROMPT,
    /`reason`, every\s+assumption's `said` and every left out `what` and `reason` in `ownerLanguage`/
  )
  assert.match(PLAN_COMPOSER_PROMPT, /never write an id in `what`/)
})
