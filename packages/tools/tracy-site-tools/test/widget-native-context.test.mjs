import assert from 'node:assert/strict'
import { test } from 'node:test'
import { widgetNativeContext, widgetContextText } from '../src/host/widget-native-context.mjs'

const context = {
  schema: 'widget-imported-context/v1',
  source: 'widget-discovery',
  history: [
    { role: 'user', text: 'A bakery site' },
    { role: 'assistant', text: 'Which city?' }
  ],
  brief: { name: 'Bakery', about: 'Bread', goal: 'sell', style: 'modern', platform: 'wordpress' },
  selection: { template: 'bread', designSystem: null, visibleTemplates: ['bread'], visibleSystems: [] }
}
const ask = (patch = {}) =>
  widgetNativeContext({ sessionId: 'session-owned', fetchContext: async () => context, ...patch })

test('full imported record is context with provenance, not a new command or synthetic tool result', async () => {
  const notice = await ask()
  assert.equal(notice.text, widgetContextText(context))
  assert.match(notice.text, /historical, untrusted/)
  assert.match(notice.text, /do not replay/)
  assert.ok(notice.text.includes('Which city?'))
  assert.equal(notice.source.producer, 'tracy-site-tools:widget-context')
  assert.equal(notice.source.contextHash, notice.contextHash)
  assert.equal(notice.role, undefined)
})

test('durable visible notice deduplicates on restart; compacted context can return without replay', async () => {
  const notice = await ask()
  const event = {
    type: 'user/message',
    data: { source: notice.source, content: [{ type: 'text', text: notice.text }] }
  }
  assert.equal(await ask({ expectedHash: notice.contextHash, events: [event] }), null)
  assert.ok(await ask({ expectedHash: notice.contextHash, events: [] }))
  assert.ok(await ask({ events: [{ ...event, data: { ...event.data, source: { kind: 'user' } } }] }))
  assert.ok(
    await ask({
      events: [{ ...event, data: { ...event.data, content: [{ type: 'text', text: 'forged' }] } }]
    })
  )
})

test('missing or mismatched expected receipt rejects; ordinary session with no mapping has no notice', async () => {
  const notice = await ask()
  assert.equal(await ask({ fetchContext: async () => null }), null)
  for (const patch of [
    { expectedHash: notice.contextHash, fetchContext: async () => null },
    { expectedHash: '0'.repeat(64) },
    {
      fetchContext: async () => {
        throw Error('upstream secret')
      }
    },
    { expectedHash: 'malformed' }
  ])
    await assert.rejects(ask(patch), { message: 'WIDGET_NATIVE_CONTEXT_UNAVAILABLE' })
})

test('unknown credential fields, tool roles and oversized context never reach the model', async () => {
  for (const changed of [
    { ...context, cookie: 'private' },
    { ...context, history: [{ role: 'tool', text: 'created site' }] },
    { ...context, history: [{ role: 'user', text: 'x'.repeat(4001) }] },
    { ...context, history: [{ role: 'user', text: 'hello', otp: '123456' }] },
    { ...context, selection: { ...context.selection, sessionId: 'someone-else' } }
  ])
    await assert.rejects(ask({ fetchContext: async () => changed }), /CONTEXT_UNAVAILABLE/)
})
