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

import { installSessionTitle, sessionTitleProvider, TITLE_PROVIDER_ID } from '../src/host/session-title.mjs'

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
