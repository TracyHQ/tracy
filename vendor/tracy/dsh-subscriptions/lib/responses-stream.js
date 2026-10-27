import { iterateSse, jsonSse } from './sse.js'
import { httpError, toTokenUsage } from './wire.js'

function responsesFailure(code, message) {
  const text = String(message || code || 'responses failed')
  throw httpError(400, text, /quota|usage.?limit/i.test(text) ? 'QUOTA' : 'VENDOR')
}

export class ResponsesStreamTranslator {
  constructor() {
    this.blocks = new Map()
    this.order = []
    this.nextIndex = 0
    this.sawToolCall = false
    this.terminated = false
  }

  open(key, kind, callId = '', name) {
    const block = {
      index: this.nextIndex++,
      kind,
      text: '',
      callId,
      name,
    }
    this.blocks.set(key, block)
    this.order.push(block)
    return [{ type: 'block-start', index: block.index, blockType: kind }]
  }

  closeItem(itemId) {
    for (const key of [...this.blocks.keys()]) {
      if (key.startsWith(`${itemId}:`)) this.blocks.delete(key)
    }
  }

  push(event) {
    if (this.terminated) return []
    const chunks = []
    switch (event.type) {
      case 'response.output_item.added': {
        const item = event.item
        if (item?.type === 'function_call' && item.id !== undefined) {
          this.sawToolCall = true
          const callId = item.call_id ?? ''
          const start = this.open(`${item.id}:call`, 'tool-call', callId, item.name)
          chunks.push(...start)
          const block = this.blocks.get(`${item.id}:call`)
          chunks.push({
            type: 'tool-call-delta',
            index: block.index,
            id: callId,
            ...(item.name === undefined ? {} : { name: item.name }),
            argumentsDelta: '',
          })
        }
        return chunks
      }
      case 'response.output_text.delta': {
        const key = `${event.item_id ?? ''}:text:${String(event.content_index ?? 0)}`
        if (!this.blocks.has(key)) chunks.push(...this.open(key, 'text'))
        const block = this.blocks.get(key)
        const delta = event.delta ?? ''
        block.text += delta
        chunks.push({ type: 'text-delta', index: block.index, text: delta })
        return chunks
      }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta': {
        const sub = event.summary_index ?? event.content_index ?? 0
        const key = `${event.item_id ?? ''}:reason:${String(sub)}`
        if (!this.blocks.has(key)) chunks.push(...this.open(key, 'reasoning'))
        const block = this.blocks.get(key)
        const delta = event.delta ?? ''
        block.text += delta
        chunks.push({ type: 'reasoning-delta', index: block.index, text: delta })
        return chunks
      }
      case 'response.function_call_arguments.delta': {
        const key = `${event.item_id ?? ''}:call`
        if (!this.blocks.has(key)) {
          this.sawToolCall = true
          chunks.push(...this.open(key, 'tool-call'))
        }
        const block = this.blocks.get(key)
        const delta = event.delta ?? ''
        block.text += delta
        chunks.push({
          type: 'tool-call-delta',
          index: block.index,
          id: block.callId,
          ...(block.name === undefined ? {} : { name: block.name }),
          argumentsDelta: delta,
        })
        return chunks
      }
      case 'response.output_item.done': {
        const item = event.item
        if (item === undefined || item.id === undefined) return chunks
        if (item.type === 'function_call') {
          const key = `${item.id}:call`
          const block = this.blocks.get(key)
          if (block !== undefined && block.text.length === 0 && item.arguments !== undefined) {
            block.text = item.arguments
            chunks.push({
              type: 'tool-call-delta',
              index: block.index,
              id: block.callId,
              ...(block.name === undefined ? {} : { name: block.name }),
              argumentsDelta: item.arguments,
            })
          }
          this.blocks.delete(key)
        } else if (item.type === 'message') {
          const hasText = [...this.blocks.keys()].some((key) => key.startsWith(`${item.id}:text:`))
          if (!hasText) {
            for (const [partIndex, part] of (item.content ?? []).entries()) {
              if (part?.type !== 'output_text' || typeof part.text !== 'string' || part.text.length === 0) continue
              const key = `${item.id}:text:${partIndex}`
              chunks.push(...this.open(key, 'text'))
              const block = this.blocks.get(key)
              block.text = part.text
              chunks.push({ type: 'text-delta', index: block.index, text: part.text })
              this.blocks.delete(key)
            }
          }
          this.closeItem(item.id)
        } else {
          this.closeItem(item.id)
        }
        return chunks
      }
      case 'response.completed': {
        this.terminated = true
        const u = toTokenUsage(event.response?.usage)
        if (u) chunks.push({ type: 'usage', usage: u })
        chunks.push({ type: 'finish', reason: { kind: this.sawToolCall ? 'tool-calls' : 'stop' } })
        return chunks
      }
      case 'response.failed':
        responsesFailure(event.response?.error?.code, event.response?.error?.message)
        break
      case 'response.incomplete':
        responsesFailure(event.response?.incomplete_details?.reason, event.response?.error?.message
          || `incomplete response (${event.response?.incomplete_details?.reason ?? 'unknown'})`)
        break
      case 'error':
        responsesFailure(event.code, event.message)
        break
      default:
        return chunks
    }
    return chunks
  }
}

export async function* streamResponses(body) {
  const translator = new ResponsesStreamTranslator()
  for await (const data of iterateSse(body)) {
    const json = jsonSse(data)
    if (!json) continue
    const type = json.type || ''
    if (type === 'response.failed' || type === 'error') {
      const msg = (json.response && json.response.error && json.response.error.message)
        || json.message || json.error || 'responses failed'
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg)
      throw httpError(json.status || 400, text, /quota|usage.?limit/i.test(text) ? 'QUOTA' : 'VENDOR')
    }
    for (const chunk of translator.push(json)) yield chunk
    if (translator.terminated) return
  }
  if (!translator.terminated) {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'INCOMPLETE', message: 'stream terminated before response.completed' } } }
  }
}
