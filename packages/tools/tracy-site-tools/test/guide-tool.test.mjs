import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUIDE_DESCRIPTION,
  GUIDE_PARAMETERS,
  guideAnswer,
  guideCall,
  guideUnavailable
} from '../src/host/guide-tool.mjs'
import { DEFERRED_NAMES } from '../src/host/deferred-tools.mjs'
import { PLATFORM_ONLY_TOOLS } from '../src/host/surface.mjs'

test('the description is short and the same for every site, role and switch', () => {
  assert.ok(GUIDE_DESCRIPTION.length <= 520, `${GUIDE_DESCRIPTION.length} characters`)
  assert.ok(GUIDE_DESCRIPTION.startsWith('tracy_guide:'))
  // A fact about THIS site, role or deployment would change the bytes mid-conversation (cache rule CS1).
  for (const word of ['/site/', '.tracy.', 'localhost', 'trk_', 'shop1'])
    assert.ok(!GUIDE_DESCRIPTION.includes(word), word)
  assert.deepEqual(Object.keys(GUIDE_PARAMETERS.properties).sort(), ['q', 'recheck', 'topic'])
})

test('it is sent from the first step: not deferred and not hidden for a platform', () => {
  assert.ok(!DEFERRED_NAMES.includes('tracy_guide'))
  assert.ok(!Object.hasOwn(PLATFORM_ONLY_TOOLS, 'tracy_guide'))
})

test('a call needs a question or a topic, and says how to ask', () => {
  const none = guideCall({})
  assert.equal(none.ok, false)
  assert.match(none.next, /\{q:/)
  assert.equal(guideCall(undefined).ok, false)
})

test('the question is passed on, trimmed and cut; query is accepted for q', () => {
  assert.equal(guideCall({ q: '  how do I connect my domain  ' }).query, 'q=how+do+I+connect+my+domain')
  assert.equal(guideCall({ query: 'dns' }).query, 'q=dns')
  assert.equal(guideCall({ q: 'x'.repeat(900) }).query.length, 'q='.length + 400)
  assert.equal(guideCall({ topic: 'own-domain' }).query, 'topic=own-domain')
  assert.equal(guideCall({ q: 'dns', recheck: true }).query, 'q=dns&recheck=1')
  assert.equal(guideCall({ q: 'dns', recheck: 'yes' }).query, 'q=dns')
})

test('a miss is an answer that says do not know, never an invention', () => {
  const miss = guideAnswer({ articles: [], topics: [{ id: 'publish', title: 'Publish' }] })
  assert.equal(miss.ok, true)
  assert.equal(miss.found, false)
  assert.match(miss.next, /do not know/)
  assert.match(miss.next, /Discord/)
  assert.deepEqual(miss.topics, [{ id: 'publish', title: 'Publish' }])
  assert.equal(guideAnswer(null).found, false)
})

test("a hit carries the steps, this site's state, who may do it and the link", () => {
  const answer = guideAnswer({
    role: 'editor',
    articles: [
      {
        id: 'own-domain',
        title: 'Connect your own domain (DNS)',
        body: 'steps',
        roleNote: 'Ask an Owner.',
        state: ['www.example.com: NOT CONNECTED YET'],
        recheck: { done: false, reason: 'NOT_SITE_OWNER' },
        screen: {
          label: 'Connect your own domain (DNS)',
          href: 'https://x.test/s/?tab=tracy:site-publish&site=s'
        }
      }
    ]
  })
  assert.equal(answer.found, true)
  const a = answer.articles[0]
  assert.equal(a.guide, 'steps')
  assert.equal(a.who, 'Ask an Owner.')
  assert.deepEqual(a.thisSite, ['www.example.com: NOT CONNECTED YET'])
  assert.equal(a.screen.href, 'https://x.test/s/?tab=tracy:site-publish&site=s')
  assert.match(answer.next, /Markdown link/)
})

test('every failure is an answer with a next that stops the agent guessing', () => {
  for (const code of ['NO_SESSION', 'GUIDE_DOOR_MISSING', 'GUIDE_UNREACHABLE', 'NOBODY_TO_ACT_AS']) {
    const a = guideUnavailable(code)
    assert.equal(a.ok, false)
    assert.equal(a.code, code)
    assert.match(a.next, /Do not describe Tracy's screens or DNS steps from memory/)
  }
})
