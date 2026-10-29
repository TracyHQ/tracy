// What a planned post body that changed its frame is told (`agent-demo.js` `bodyFrameMessage`): a read every CMS has.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bodyFrameMessage } from '../src/opportunities-build/agent-demo.js'

test('a Joomla article is pointed at the frozen record, never at a WordPress-only outline read', () => {
  const said = bodyFrameMessage({ key: 'article/10', identity: { kind: 'article', id: 10 } })
  assert.match(said, /tracy_demo \{operation:"structure\.read", record:"article\/10"\}/)
  assert.doesNotMatch(said, /outline/)
})

test('a WordPress post is pointed at the frozen record and its numbered blocks', () => {
  const said = bodyFrameMessage({ key: 'post/39', identity: { kind: 'post', id: 39 } })
  assert.match(said, /record:"post\/39"/)
  assert.match(said, /content\.get \{kind:"post", id, outline:true\} numbers its blocks/)
})

test('an EmDash entry is pointed at the frozen record', () => {
  const said = bodyFrameMessage({ key: 'posts/01M5AJ2WE8@en', identity: { collection: 'posts' } })
  assert.match(said, /record:"posts\/01M5AJ2WE8@en"/)
  assert.doesNotMatch(said, /outline/)
})
