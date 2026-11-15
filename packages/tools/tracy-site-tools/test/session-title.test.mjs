/**
 * The conversation title Tracy's composition asks the model for (acceptance F13: an English comment
 * came back titled "更新主页服务文本与标题").
 *
 * Measured 29/09 on the local stand, 194 model titles: all 5 in Chinese came from Browser-tab comment
 * turns, whose one user message is the person's request followed by `tracy-element` blocks and a
 * long `tracy_site` instruction line — the page's words and Tracy's, not the customer's. dsh's
 * provider handed all of it to the title model as "the human message".
 *
 * The seam is the provider dsh's `sessionTitle` service calls (`generate(request)`); the model is the
 * boundary, faked here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { conversationOf, handoffMessageOf } from '../../../../apps/tracy-web/src/build-draft/handoff.js'
import {
  HANDOFF_TITLE,
  installSessionTitle,
  sessionTitleProvider,
  TITLE_PROVIDER_ID
} from '../src/host/session-title.mjs'

const ROUTE = { provider: 'deepseek-official', model: 'deepseek-flash' }

/** A fake `ctx.llm` that answers `title` and records every request it was given. */
function fakeLlm(title) {
  const calls = []
  return {
    calls,
    stream(options) {
      calls.push(options)
      return (async function* () {
        yield { type: 'text-delta', text: title }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    }
  }
}

function request(messages) {
  return { session: { id: 's1' }, messages, route: ROUTE, signal: new AbortController().signal }
}

const COMMENT_TURN = [
  '1. Change this heading to: Core services Q2w1304',
  '',
  '```tracy-element',
  '<mentioned-element n="1" url="http://site.test/en/" status="resolved" kind="record">',
  'text: Four core service lines',
  '</mentioned-element>',
  '```',
  'The elements above are numbered (n) like the comments before them: pass `comment: <n>` on every `tracy_site` call.'
].join('\n')

test("a comment turn: the title model reads the person's words, not the picked element or Tracy's hint", async () => {
  const llm = fakeLlm('Update core services heading')
  const result = await sessionTitleProvider(llm).generate(request([{ seq: 11, text: COMMENT_TURN }]))
  assert.equal(result.title, 'Update core services heading')
  assert.deepEqual(result.messageSeqs, [11])
  assert.deepEqual(result.model, ROUTE)
  assert.equal(llm.calls.length, 1)
  const sent = JSON.stringify(llm.calls[0].messages)
  assert.match(sent, /Core services Q2w1304/)
  assert.doesNotMatch(sent, /tracy-element|mentioned-element|tracy_site|Four core service lines/)
  assert.equal(llm.calls[0].provider, ROUTE.provider)
  assert.equal(llm.calls[0].model, ROUTE.model)
  assert.equal(llm.calls[0].purpose, 'session-title')
})

test("a Chinese title for English words is refused, so dsh keeps its title from the person's own words", async () => {
  const llm = fakeLlm('更新主页服务文本与标题')
  await assert.rejects(
    sessionTitleProvider(llm).generate(request([{ seq: 11, text: COMMENT_TURN }])),
    /not written in/
  )
})

test('a Japanese or Korean title for Vietnamese words is refused too; a Vietnamese one is kept', async () => {
  const words = [{ seq: 3, text: 'Đổi tiêu đề trang chủ thành: Dịch vụ chính' }]
  for (const title of ['ホームの見出しを変更', '홈 제목 변경']) {
    await assert.rejects(sessionTitleProvider(fakeLlm(title)).generate(request(words)), /not written in/)
  }
  const kept = await sessionTitleProvider(fakeLlm('Đổi tiêu đề trang chủ')).generate(request(words))
  assert.equal(kept.title, 'Đổi tiêu đề trang chủ')
})

test('a Chinese title for Chinese words is kept', async () => {
  const result = await sessionTitleProvider(fakeLlm('更新首页标题')).generate(
    request([{ seq: 5, text: '把首页的标题改成：核心服务' }])
  )
  assert.equal(result.title, '更新首页标题')
})

test('a message that is only a picked element is skipped; none with words left is refused, not guessed', async () => {
  const onlyBlock = COMMENT_TURN.split('\n').slice(2).join('\n')
  const llm = fakeLlm('Rename the menu item')
  const result = await sessionTitleProvider(llm).generate(
    request([
      { seq: 11, text: onlyBlock },
      { seq: 14, text: 'Rename this menu item to Services' }
    ])
  )
  assert.deepEqual(result.messageSeqs, [14])
  await assert.rejects(
    sessionTitleProvider(fakeLlm('x')).generate(request([{ seq: 11, text: onlyBlock }])),
    /no words of the person/
  )
})

test('a model failure is a rejection, never an empty title', async () => {
  const llm = {
    stream: () =>
      (async function* () {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'no credit' } } }
      })()
  }
  await assert.rejects(sessionTitleProvider(llm).generate(request([{ seq: 1, text: 'Hello' }])), /QUOTA/)
})

// A build chat's hand off (#611): the site chat's first message is ONE fenced `tracy-build-handoff` block, one JSON line
// (`apps/tracy-web/src/build-draft/handoff.js`), whose conversation and `keepOffSite` may name what the owner keeps
// off the site. The block format is pinned here by hand as well as written by the real writer.
const HELD = 'Odalys Pemberton-Quill'
const SITE_NAME = 'Quillmere Pottery'
const handoffBlock = (value) => `\`\`\`tracy-build-handoff\n${JSON.stringify(value)}\n\`\`\``
const handoffBody = (site) => ({
  schema: 'tracy-build-handoff/v1',
  source: 'build-handoff',
  requestId: 'build-handoff:5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  note: 'Only the plan is approved.',
  site,
  plan: { id: 'plan-1', revision: 2 },
  conversation: [
    { speaker: 'owner', text: `My studio is ${SITE_NAME}. My partner ${HELD} wants to stay off the site.` },
    { speaker: 'build-agent', text: `Understood, ${HELD} stays off the site.` }
  ],
  keepOffSite: [HELD]
})

test('a hand off message is titled with the site name it shows, never from the block, and no model is asked', async () => {
  for (const text of [
    handoffBlock(handoffBody({ siteKey: 'quillmere.localhost', name: SITE_NAME })),
    handoffMessageOf({
      conversation: conversationOf([
        { role: 'user', text: `My partner ${HELD} wants to stay off the site.` },
        { role: 'assistant', text: 'Understood.' }
      ]),
      plan: { id: 'plan-1', revision: 2 },
      siteKey: 'quillmere.localhost',
      name: SITE_NAME,
      keepOffSite: [HELD],
      requestId: 'build-handoff:5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b'
    })
  ]) {
    assert.ok(
      Buffer.byteLength(text.slice(0, text.indexOf(HELD)), 'utf8') < 4096,
      'the held name is in the first bytes'
    )
    const llm = fakeLlm(`Site for ${HELD}`)
    const result = await sessionTitleProvider(llm).generate(request([{ seq: 4, text }]))
    assert.equal(result.title, SITE_NAME)
    assert.deepEqual(result.messageSeqs, [4])
    assert.equal(llm.calls.length, 0, 'the block never reaches the title model')
  }
})

test('a hand off that shows no site name gets a plain fixed title', async () => {
  const llm = fakeLlm(`Site for ${HELD}`)
  const text = handoffBlock(handoffBody({ siteKey: 'my-site.localhost' }))
  const result = await sessionTitleProvider(llm).generate(request([{ seq: 1, text }]))
  assert.equal(result.title, HANDOFF_TITLE)
  assert.ok(!result.title.includes(HELD))
  assert.equal(llm.calls.length, 0)
})

test("a block pasted after the person's words is cut whole: the model reads only the words", async () => {
  const llm = fakeLlm('Pottery opening hours')
  const body = handoffBody({ siteKey: 'quillmere.localhost' })
  body.schema = 'other/v1'
  const text = `Change the opening hours\n${handoffBlock(body)}\nplease`
  const result = await sessionTitleProvider(llm).generate(request([{ seq: 2, text }]))
  assert.equal(result.title, 'Pottery opening hours')
  const sent = JSON.stringify(llm.calls[0].messages)
  assert.match(sent, /Change the opening hours/)
  assert.match(sent, /please/)
  assert.ok(!sent.includes(HELD), 'nothing of the block reaches the title model')
  assert.doesNotMatch(sent, /tracy-build-handoff/)
})

test('installSessionTitle registers the provider once both services are there, first prompt only', () => {
  const registered = []
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['sessionTitle', 'llm'])
      callback({ sessionTitle: { register: (p) => registered.push(p) }, llm: fakeLlm('t') })
    }
  }
  installSessionTitle(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, TITLE_PROVIDER_ID)
  assert.equal(registered[0].automatic, 'first-prompt')
})
