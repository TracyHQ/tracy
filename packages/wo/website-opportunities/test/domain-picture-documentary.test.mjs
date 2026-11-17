// A picture of something that happened is never drawn (#575 pictures gap audit, port 8; the step chain's documentary
// rule #548, `site-pictures/picture-check/inputs-index.js` `documentaryFrame`: a frame grounded in the business's
// posts or in what was observed is never drawn). An event or a post shows the business's own photo or stays empty.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-documentary.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GENERATED_PICTURE_ROLES, generationOf } from '../domain/picture-roles.mjs'

test('an event or an article picture is never generated, with the documentary reason', () => {
  for (const role of ['event.image', 'article.image']) {
    assert.deepEqual(generationOf(role), { may: false, reason: 'documentary_not_drawn' })
    assert.ok(!GENERATED_PICTURE_ROLES.includes(role))
  }
})
