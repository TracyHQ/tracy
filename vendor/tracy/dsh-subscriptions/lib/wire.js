import { fetchWithTimeout } from "./http.js"
import { iterateSse, jsonSse } from './sse.js'
import { validationFromHttpError, validationRequiredError, googleRateLimitMessage, googleLicenseMessage } from './google-validation.js'

/**
 * @param {number} status
 * @param {string} [bodyText]
 * @param {string} [code]
 * @returns {Error & { status?: number, code?: string }}
 */
export function httpError(status, bodyText, code) {
  const snippet = String(bodyText || '').slice(0, 400)
  const err = /** @type {Error & { status?: number, code?: string }} */ (new Error(snippet ? `vendor http ${status}: ${snippet}` : `vendor http ${status}`))
  err.status = status
  if (code) {
    err.code = code
    return err
  }
  if (status === 429) err.code = 'RATE_LIMIT'
  else if (status === 402) err.code = 'QUOTA'
  else if (status === 401 || status === 403) err.code = 'VENDOR'
  else if (/quota|rate.?limit|usage.?limit|billing/i.test(snippet)) {
    err.code = status === 400 ? 'QUOTA' : 'RATE_LIMIT'
  } else err.code = 'VENDOR'
  return err
}

export function throwHttpError(status, bodyText) {
  const validation = validationFromHttpError(status, bodyText)
  if (validation) throw validationRequiredError(validation)
  const license = googleLicenseMessage(status, bodyText)
  if (license) {
    const err = httpError(status, bodyText, 'LICENSE_REQUIRED')
    err.message = `${license} (${err.message})`
    throw err
  }
  const hint = googleRateLimitMessage(status, bodyText)
  if (hint) {
    const err = httpError(status, bodyText, status === 429 ? 'RATE_LIMIT' : undefined)
    err.message = `${hint} (${err.message})`
    throw err
  }
  throw httpError(status, bodyText)
}

export async function readJson(res) {
  const text = await res.text()
  if (!res.ok) {
    const validation = validationFromHttpError(res.status, text)
    if (validation) throw validationRequiredError(validation)
    throw httpError(res.status, text)
  }
  try { return JSON.parse(text) } catch { return {} }
}

export function tokenBlobFromOAuth(json, extra) {
  const expiresIn = Number(json.expires_in) || 3600
  return {
    accessToken: json.access_token || json.accessToken || '',
    refreshToken: json.refresh_token || json.refreshToken || '',
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: json.id_token || json.idToken || '',
    ...(extra || {}),
  }
}

function toCount(v) {
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  return 0
}

/**
 * Normalizes vendor usage metadata into canonical DSH TokenUsage format.
 * Guarantees inputTokens and outputTokens are non-negative finite integer numbers (never NaN/undefined).
 * Calculates disjoint uncached input tokens where providers fold cache hits into total prompt tokens.
 * Returns null if raw is not an object or contains no token-related fields.
 */
export function toTokenUsage(raw) {
  if (!raw || typeof raw !== "object") return null

  const hasKnownField = (
    "inputTokens" in raw || "input_tokens" in raw || "promptTokens" in raw || "prompt_tokens" in raw || "input" in raw ||
    "outputTokens" in raw || "output_tokens" in raw || "completionTokens" in raw || "completion_tokens" in raw || "output" in raw ||
    "totalTokens" in raw || "total_tokens" in raw || "totalTokenCount" in raw ||
    "promptTokenCount" in raw || "candidatesTokenCount" in raw || "thoughtsTokenCount" in raw
  )
  if (!hasKnownField) return null

  const rawCached = toCount(
    raw.input_token_details?.cached_tokens ??
    raw.prompt_tokens_details?.cached_tokens ??
    raw.cache_read_input_tokens ??
    raw.cached_tokens ??
    raw.cacheReadTokens ??
    raw.cachedContentTokenCount
  )

  let inputTokens = 0
  if (raw.inputTokens !== undefined) {
    inputTokens = toCount(raw.inputTokens)
  } else if (raw.prompt_tokens !== undefined || raw.promptTokens !== undefined) {
    const prompt = toCount(raw.prompt_tokens ?? raw.promptTokens)
    inputTokens = rawCached > 0 && prompt >= rawCached ? prompt - rawCached : prompt
  } else if (raw.input_token_details?.cached_tokens !== undefined) {
    const prompt = toCount(raw.input_tokens ?? raw.input)
    inputTokens = rawCached > 0 && prompt >= rawCached ? prompt - rawCached : prompt
  } else if (raw.promptTokenCount !== undefined) {
    const prompt = toCount(raw.promptTokenCount)
    inputTokens = rawCached > 0 && prompt >= rawCached ? prompt - rawCached : prompt
  } else {
    inputTokens = toCount(raw.input_tokens ?? raw.input)
  }

  let outputTokens = 0
  if (raw.outputTokens !== undefined) {
    outputTokens = toCount(raw.outputTokens)
  } else {
    outputTokens = toCount(
      raw.completion_tokens ??
      raw.output_tokens ??
      raw.completionTokens ??
      raw.output ??
      raw.candidatesTokenCount
    )
  }

  const cacheWriteTokens = toCount(raw.cacheWriteTokens ?? raw.cache_creation_input_tokens)
  const reasoningTokens = toCount(
    raw.reasoningTokens ??
    raw.output_token_details?.reasoning_tokens ??
    raw.completion_tokens_details?.reasoning_tokens ??
    raw.reasoning_tokens ??
    raw.thoughtsTokenCount
  )
  const rawTotal = toCount(raw.totalTokens ?? raw.total_tokens ?? raw.totalTokenCount)

  const out = {
    inputTokens,
    outputTokens,
  }

  if (rawCached > 0 || raw.cacheReadTokens !== undefined || raw.cache_read_input_tokens !== undefined || raw.input_token_details?.cached_tokens !== undefined || raw.prompt_tokens_details?.cached_tokens !== undefined || raw.cachedContentTokenCount !== undefined) {
    out.cacheReadTokens = rawCached
  }
  if (cacheWriteTokens > 0 || raw.cacheWriteTokens !== undefined || raw.cache_creation_input_tokens !== undefined) {
    out.cacheWriteTokens = cacheWriteTokens
  }
  if (reasoningTokens > 0 || raw.reasoningTokens !== undefined || raw.output_token_details?.reasoning_tokens !== undefined || raw.completion_tokens_details?.reasoning_tokens !== undefined || raw.thoughtsTokenCount !== undefined) {
    out.reasoningTokens = reasoningTokens
  }
  if (rawTotal > 0 || raw.totalTokens !== undefined || raw.total_tokens !== undefined || raw.totalTokenCount !== undefined) {
    out.totalTokens = rawTotal > 0 ? rawTotal : (inputTokens + (out.cacheReadTokens || 0) + (out.cacheWriteTokens || 0) + outputTokens)
  }

  return out
}

function openBlock(kind, index) {
  return { kind, index, text: '', id: '', name: '' }
}

export async function* openaiChatStream(body) {
  let next = 0
  let textBlock = null
  const tools = new Map()
  let finish = { kind: 'stop' }
  let sawTerminal = false
  for await (const data of iterateSse(body)) {
    if (data === '[DONE]') {
      sawTerminal = true
      break
    }
    const json = jsonSse(data)
    if (!json) continue
    const choice = (json.choices && json.choices[0]) || {}
    const delta = choice.delta || json.delta || {}
    if (typeof delta.content === 'string' && delta.content) {
      if (!textBlock) {
        textBlock = openBlock('text', next++)
        yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
      }
      yield { type: 'text-delta', index: textBlock.index, text: delta.content }
    }
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      yield { type: 'reasoning-delta', index: 0, text: delta.reasoning_content }
    }
    for (const call of delta.tool_calls || []) {
      let block = tools.get(call.index)
      if (!block) {
        block = openBlock('tool-call', next++)
        tools.set(call.index, block)
        yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
      }
      if (call.id) block.id = call.id
      if (call.function && call.function.name) block.name = call.function.name
      const fragment = (call.function && call.function.arguments) || ''
      yield {
        type: 'tool-call-delta',
        index: block.index,
        id: String(block.id || `call_${block.index}`),
        ...(block.name ? { name: block.name } : {}),
        argumentsDelta: fragment,
      }
    }
    if (json.usage) yield { type: 'usage', usage: json.usage }
    if (choice.finish_reason) {
      sawTerminal = true
      if (choice.finish_reason === 'length') finish = { kind: 'max-tokens' }
      else if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call') finish = { kind: 'tool-calls' }
      else if (choice.finish_reason === 'content_filter') finish = { kind: 'error', failure: { code: 'CONTENT_FILTER', message: 'content filter triggered' } }
      else if (choice.finish_reason === 'stop') finish = { kind: 'stop' }
    }
  }
  if (!sawTerminal && (textBlock !== null || tools.size > 0)) {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'INCOMPLETE', message: 'stream terminated unexpectedly before finish_reason or terminal marker' } } }
    return
  }
  if (finish.kind === 'stop' && tools.size > 0) finish = { kind: 'tool-calls' }
  yield { type: 'finish', reason: finish }
}

export { streamResponses as codexResponsesStream } from './responses-stream.js'

export async function* anthropicStream(body) {
  let index = 0
  let textIndex = 0
  const toolCallIds = new Map()
  let finish = { kind: 'stop' }
  let sawTerminal = false
  let usageState = null
  let yieldedUsage = false
  for await (const data of iterateSse(body)) {
    if (data === '[DONE]') {
      sawTerminal = true
      break
    }
    const json = jsonSse(data)
    if (!json) continue
    if (json.type === 'message_start' && json.message && json.message.usage) {
      usageState = { ...(usageState || {}), ...json.message.usage }
    } else if (json.type === 'content_block_start') {
      const block = json.content_block || {}
      if (block.type === 'text') {
        textIndex = json.index ?? index++
        yield { type: 'block-start', index: textIndex, blockType: 'text' }
      } else if (block.type === 'tool_use') {
        const bIndex = json.index ?? index++
        const toolId = String(block.id || `toolu_${bIndex}`)
        toolCallIds.set(bIndex, toolId)
        yield { type: 'block-start', index: bIndex, blockType: 'tool-call' }
        yield {
          type: 'tool-call-delta',
          index: bIndex,
          id: toolId,
          name: block.name,
          argumentsDelta: '',
        }
      }
    } else if (json.type === 'content_block_delta') {
      const delta = json.delta || {}
      if (delta.type === 'text_delta' && delta.text) {
        yield { type: 'text-delta', index: json.index ?? textIndex, text: delta.text }
      } else if (delta.type === 'input_json_delta' && delta.partial_json) {
        const bIndex = json.index ?? 0
        const toolId = toolCallIds.get(bIndex) || `toolu_${bIndex}`
        yield {
          type: 'tool-call-delta',
          index: bIndex,
          id: toolId,
          argumentsDelta: delta.partial_json,
        }
      }
    } else if (json.type === 'message_delta') {
      sawTerminal = true
      if (json.delta && json.delta.stop_reason) {
        const sr = json.delta.stop_reason
        if (sr === 'tool_use') finish = { kind: 'tool-calls' }
        else if (sr === 'max_tokens') finish = { kind: 'max-tokens' }
        else finish = { kind: 'stop' }
      }
      if (json.usage) {
        usageState = { ...(usageState || {}), ...json.usage }
      }
      if (usageState) {
        const norm = toTokenUsage(usageState)
        yieldedUsage = true
        yield {
          type: 'usage',
          usage: {
            ...usageState,
            ...(norm || {}),
            input: norm ? norm.inputTokens : (Number(usageState.input_tokens ?? usageState.input ?? 0) || 0),
            output: norm ? norm.outputTokens : (Number(usageState.output_tokens ?? usageState.output ?? 0) || 0),
          },
        }
      }
    } else if (json.type === 'error') {
      sawTerminal = true
      const err = json.error || {}
      finish = { kind: 'error', failure: { code: String(err.type || 'ANTHROPIC_ERROR'), message: String(err.message || 'anthropic error') } }
    }
  }
  if (usageState && !yieldedUsage) {
    const norm = toTokenUsage(usageState)
    yield {
      type: 'usage',
      usage: {
        ...usageState,
        ...(norm || {}),
        input: norm ? norm.inputTokens : (Number(usageState.input_tokens ?? usageState.input ?? 0) || 0),
        output: norm ? norm.outputTokens : (Number(usageState.output_tokens ?? usageState.output ?? 0) || 0),
      },
    }
  }
  if (!sawTerminal && (index > 0 || textIndex > 0 || toolCallIds.size > 0)) {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'INCOMPLETE', message: 'stream terminated before message_delta' } } }
    return
  }
  if (finish.kind === 'stop' && toolCallIds.size > 0) finish = { kind: 'tool-calls' }
  yield { type: 'finish', reason: finish }
}

export async function* googleStream(body) {
  let index = 0
  let started = false
  let callCount = 0
  const functionCallIndexes = new Map()
  let finish = { kind: 'stop' }
  let sawTerminal = false
  for await (const data of iterateSse(body)) {
    if (data === '[DONE]') {
      sawTerminal = true
      break
    }
    const json = jsonSse(data)
    const wrapped = json && json.response ? json.response : json
    if (!wrapped) continue
    const cand = wrapped.candidates && wrapped.candidates[0]
    if (cand && cand.finishReason) {
      sawTerminal = true
      const fr = cand.finishReason
      if (fr === 'MAX_TOKENS') finish = { kind: 'max-tokens' }
      else if (fr === 'SAFETY' || fr === 'RECITATION' || fr === 'BLOCKLIST' || fr === 'PROHIBITED_CONTENT' || fr === 'SPII') {
        finish = { kind: 'error', failure: { code: fr, message: cand.finishMessage || fr } }
      } else if (fr === 'STOP') {
        finish = { kind: 'stop' }
      }
    }
    const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : []
    for (const part of parts) {
      if (part.text) {
        if (!started) {
          yield { type: 'block-start', index, blockType: 'text' }
          started = true
        }
        yield { type: 'text-delta', index, text: part.text }
      }
      if (part.functionCall) {
        const rawId = part.functionCall.id
        let callIndex
        let callId
        if (rawId && functionCallIndexes.has(rawId)) {
          callIndex = functionCallIndexes.get(rawId)
          callId = String(rawId)
        } else {
          callCount++
          callIndex = index + callCount
          callId = String(rawId || `gemini_call_${callCount}`)
          if (rawId) functionCallIndexes.set(rawId, callIndex)
          yield { type: 'block-start', index: callIndex, blockType: 'tool-call' }
        }
        yield {
          type: 'tool-call-delta',
          index: callIndex,
          id: callId,
          name: part.functionCall.name,
          argumentsDelta: JSON.stringify(part.functionCall.args || {}),
        }
      }
    }
    if (wrapped.usageMetadata) {
      const u = wrapped.usageMetadata
      const norm = toTokenUsage(u)
      yield {
        type: 'usage',
        usage: {
          ...u,
          ...(norm || {}),
          input: norm ? norm.inputTokens : (Number(u.promptTokenCount ?? 0) || 0),
          output: norm ? norm.outputTokens : (Number(u.candidatesTokenCount ?? 0) || 0),
        },
      }
    }
  }
  if (!sawTerminal && (started || callCount > 0)) {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'INCOMPLETE', message: 'stream terminated before finishReason' } } }
    return
  }
  if (finish.kind === 'stop' && (functionCallIndexes.size > 0 || callCount > 0)) {
    finish = { kind: 'tool-calls' }
  }
  yield { type: 'finish', reason: finish }
}

export async function formTokenRequest(url, params, fetchImpl, headers, { timeoutMs = 25000 } = {}) {
  const res = await fetchWithTimeout(fetchImpl || fetch, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...(headers || {}) },
    body: new URLSearchParams(params),
  }, { timeoutMs })
  return readJson(res)
}

export async function jsonTokenRequest(url, body, fetchImpl, headers, { timeoutMs = 25000 } = {}) {
  const res = await fetchWithTimeout(fetchImpl || fetch, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  }, { timeoutMs })
  return readJson(res)
}