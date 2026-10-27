import test from 'node:test'
import assert from 'node:assert/strict'
import { coinedIn, lastReply, verdict } from '../hooks/reply-vocabulary.mjs'
import { COINED } from '../lib/coined-words.mjs'

// The word under test comes from the table itself, so this file never spells it.
const W = COINED[0].word

const line = (o) => JSON.stringify(o)
const user = (text) => line({ type: 'user', message: { role: 'user', content: text } })
const toolResult = () =>
  line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: `${W} log` }] }
  })
const said = (text) =>
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })

test('a coined word in prose is found, with its replacement', () => {
  const hits = coinedIn(`Pin the WordPress ${W} to 0.14.1.`)
  assert.equal(hits.length, 1)
  assert.match(hits[0].instead, /Claude Cowork plugin/)
})

test('code spans and fenced blocks are data, not prose: legacy keys may be quoted', () => {
  assert.deepEqual(coinedIn(`Old releases name the part \`install.${W}\`.`), [])
  assert.deepEqual(coinedIn(`\`\`\`json\n{"${W}Floor": "0.16"}\n\`\`\`\nDone.`), [])
})

test('the reply is every assistant text since the last message a person typed, tool output excluded', () => {
  const transcript = [
    said(`earlier ${W} talk`),
    user('question'),
    said('Looking.'),
    toolResult(),
    said('The plugin Claude Cowork answered.')
  ].join('\n')
  assert.equal(lastReply(transcript), 'Looking.\nThe plugin Claude Cowork answered.')
})

test('verdict blocks a reply with the word once, and never loops', () => {
  const t = [user('q'), said(`The ${W} is pinned.`)].join('\n')
  const v = verdict(t, false)
  assert.equal(v.decision, 'block')
  assert.ok(v.reason.includes(W))
  assert.equal(verdict(t, true), null, 'stop_hook_active: the rewrite is not checked again')
  assert.equal(verdict([user('q'), said('All clear.')].join('\n'), false), null)
})
