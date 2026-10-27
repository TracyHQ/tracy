import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openaiChatStream, anthropicStream, googleStream } from '../lib/wire.js'

test('openaiChatStream: canonical finish reason mapping (#448)', async () => {
  // 1. stop
  const streamStop = ['data: ' + JSON.stringify({ choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }] }) + '\n\n'].join('')
  const chunksStop = []
  for await (const c of openaiChatStream(streamStop)) chunksStop.push(c)
  const finishStop = chunksStop.find(c => c.type === 'finish')
  assert.deepEqual(finishStop?.reason, { kind: 'stop' })

  // 2. tool_calls -> tool-calls (not "tool")
  const streamTool = [
    'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'f', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }) + '\n\n'
  ].join('')
  const chunksTool = []
  for await (const c of openaiChatStream(streamTool)) chunksTool.push(c)
  const finishTool = chunksTool.find(c => c.type === 'finish')
  assert.deepEqual(finishTool?.reason, { kind: 'tool-calls' })

  // 3. length -> max-tokens (not "length")
  const streamLength = ['data: ' + JSON.stringify({ choices: [{ delta: { content: 'cut off' }, finish_reason: 'length' }] }) + '\n\n'].join('')
  const chunksLength = []
  for await (const c of openaiChatStream(streamLength)) chunksLength.push(c)
  const finishLength = chunksLength.find(c => c.type === 'finish')
  assert.deepEqual(finishLength?.reason, { kind: 'max-tokens' })

  // 4. content_filter -> error
  const streamFilter = ['data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'content_filter' }] }) + '\n\n'].join('')
  const chunksFilter = []
  for await (const c of openaiChatStream(streamFilter)) chunksFilter.push(c)
  const finishFilter = chunksFilter.find(c => c.type === 'finish')
  assert.equal(finishFilter?.reason?.kind, 'error')
})

test('anthropicStream: canonical finish reason mapping (#448)', async () => {
  // 1. end_turn -> stop
  const streamEnd = [
    'data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + '\n\n'
  ].join('')
  const chunksEnd = []
  for await (const c of anthropicStream(streamEnd)) chunksEnd.push(c)
  assert.deepEqual(chunksEnd.find(c => c.type === 'finish')?.reason, { kind: 'stop' })

  // 2. tool_use -> tool-calls
  const streamTool = [
    'data: ' + JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'calc' } }) + '\n\n',
    'data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }) + '\n\n'
  ].join('')
  const chunksTool = []
  for await (const c of anthropicStream(streamTool)) chunksTool.push(c)
  assert.deepEqual(chunksTool.find(c => c.type === 'finish')?.reason, { kind: 'tool-calls' })

  // 3. max_tokens -> max-tokens
  const streamMax = [
    'data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }) + '\n\n'
  ].join('')
  const chunksMax = []
  for await (const c of anthropicStream(streamMax)) chunksMax.push(c)
  assert.deepEqual(chunksMax.find(c => c.type === 'finish')?.reason, { kind: 'max-tokens' })

  // 4. error event -> error
  const streamErr = [
    'data: ' + JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) + '\n\n'
  ].join('')
  const chunksErr = []
  for await (const c of anthropicStream(streamErr)) chunksErr.push(c)
  assert.equal(chunksErr.find(c => c.type === 'finish')?.reason?.kind, 'error')
})

test('googleStream: canonical finish reason mapping (#448)', async () => {
  // 1. STOP -> stop
  const streamStop = [
    'data: ' + JSON.stringify({ response: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hi' }] } }] } }) + '\n\n'
  ].join('')
  const chunksStop = []
  for await (const c of googleStream(streamStop)) chunksStop.push(c)
  assert.deepEqual(chunksStop.find(c => c.type === 'finish')?.reason, { kind: 'stop' })

  // 2. MAX_TOKENS -> max-tokens
  const streamMax = [
    'data: ' + JSON.stringify({ response: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'cut' }] } }] } }) + '\n\n'
  ].join('')
  const chunksMax = []
  for await (const c of googleStream(streamMax)) chunksMax.push(c)
  assert.deepEqual(chunksMax.find(c => c.type === 'finish')?.reason, { kind: 'max-tokens' })

  // 3. functionCall -> tool-calls
  const streamFunc = [
    'data: ' + JSON.stringify({
      response: {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ functionCall: { name: 'get_time', args: {} } }] }
        }]
      }
    }) + '\n\n'
  ].join('')
  const chunksFunc = []
  for await (const c of googleStream(streamFunc)) chunksFunc.push(c)
  assert.deepEqual(chunksFunc.find(c => c.type === 'finish')?.reason, { kind: 'tool-calls' })

  // 4. SAFETY -> error
  const streamSafety = [
    'data: ' + JSON.stringify({
      response: {
        candidates: [{
          finishReason: 'SAFETY',
          finishMessage: 'Blocked by safety filters'
        }]
      }
    }) + '\n\n'
  ].join('')
  const chunksSafety = []
  for await (const c of googleStream(streamSafety)) chunksSafety.push(c)
  const finishSafety = chunksSafety.find(c => c.type === 'finish')
  assert.equal(finishSafety?.reason?.kind, 'error')
  assert.equal(finishSafety?.reason?.failure?.code, 'SAFETY')
})
