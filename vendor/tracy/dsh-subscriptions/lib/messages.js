import { createHash } from 'node:crypto'
import { extractImages, toOpenAiImage, toAnthropicImage, toGeminiImage, toCodexImage } from './images.js'
import { normalizeTools } from './tools-normalizer.js'
import { geminiFunctionDeclarations } from './gemini-schema.js'

function flattenText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && (block.type === 'text' || block.type === 'reasoning'))
    .map((block) => block.text || '')
    .join('')
}

function toolResults(content) {
  if (!Array.isArray(content)) return []
  return content.filter((b) => b && (b.type === 'tool-result' || b.type === 'tool_result' || b.type === 'function_call_output'))
}

function toolCalls(content) {
  if (!Array.isArray(content)) return []
  return content.filter((b) => b && (b.type === 'tool-call' || b.type === 'tool_use' || b.type === 'function_call'))
}

export function normalizeCodexCallId(id) {
  const str = String(id || "");
  if (!str || str.length <= 64) return str;
  const hash = createHash("sha256").update(str).digest("hex").slice(0, 16);
  return str.slice(0, 47) + "_" + hash;
}

export function openaiMessages(options) {
  const out = []
  if (options.system) out.push({ role: 'system', content: options.system })
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      const calls = [
        ...toolCalls(message.content).map((block) => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: block.arguments || '{}' },
        })),
        ...((message.tool_calls || message.toolCalls || []).map((c) => ({
          id: c.id || c.call_id,
          type: 'function',
          function: {
            name: c.name || (c.function && c.function.name),
            arguments: typeof c.arguments === 'string' ? c.arguments : (c.function && c.function.arguments) || '{}',
          },
        }))),
      ]
      out.push({
        role: 'assistant',
        content: flattenText(message.content) || (calls.length ? null : ''),
        ...(calls.length ? { tool_calls: calls } : {}),
      })
      continue
    }
    if (message.role === 'tool') {
      const toolCallId = String(message.toolCallId || message.tool_call_id || message.call_id || message.id || '')
      const content = typeof message.content === 'string'
        ? message.content
        : (flattenText(message.content) || JSON.stringify(message.content || ''))
      out.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: content || '(no output)',
      })
      continue
    }
    const results = toolResults(message.content)
    const text = flattenText(message.content)
    const images = extractImages(message.content)
    if (images.length) {
      const parts = []
      if (text) parts.push({ type: 'text', text })
      for (const img of images) {
        const blk = toOpenAiImage(img)
        if (blk) parts.push(blk)
      }
      out.push({ role: 'user', content: parts })
    } else if (text || !results.length) {
      out.push({ role: 'user', content: text })
    }
    for (const result of results) {
      out.push({
        role: 'tool',
        tool_call_id: String(result.toolCallId || result.tool_call_id || result.call_id || result.id || ''),
        content: typeof result.content === 'string' ? result.content : (flattenText(result.content) || '(no output)'),
      })
    }
  }
  return out
}

export function openaiTools(options) {
  const tools = normalizeTools(options && options.tools)
  if (!tools) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function reconcileResponsesInput(items) {
  const result = []
  const callsSeen = new Set()
  const outputsSeen = new Set()

  for (const it of items) {
    if (it && it.type === 'function_call_output' && it.call_id) {
      outputsSeen.add(it.call_id)
    }
  }

  const pendingCalls = []
  for (const it of items) {
    if (!it) continue
    if (it.type === 'function_call') {
      if (it.call_id) {
        callsSeen.add(it.call_id)
        if (!outputsSeen.has(it.call_id)) {
          pendingCalls.push(it.call_id)
        }
      }
      result.push(it)
      continue
    }
    if (it.type === 'function_call_output') {
      // Drop orphan output if no matching preceding call
      if (it.call_id && callsSeen.has(it.call_id)) {
        result.push(it)
      }
      continue
    }
    // Flush synthetic outputs for any calls that did not get output before user/assistant turn
    while (pendingCalls.length) {
      const orphanId = pendingCalls.shift()
      result.push({
        type: 'function_call_output',
        call_id: orphanId,
        output: '{"status":"interrupted"}',
      })
    }
    result.push(it)
  }

  while (pendingCalls.length) {
    const orphanId = pendingCalls.shift()
    result.push({
      type: 'function_call_output',
      call_id: orphanId,
      output: '{"status":"interrupted"}',
    })
  }

  if (!result.length) {
    result.push({ role: 'user', content: [{ type: 'input_text', text: '' }] })
  }
  return result
}

export function normalizeSystemPrefix(parts) {
  if (!Array.isArray(parts)) return ""
  return parts
    .map((p) => {
      if (!p) return ""
      const s = typeof p === "string" ? p : (p.text || String(p))
      return s.replace(/\r\n/g, "\n").trim()
    })
    .filter(Boolean)
    .join("\n\n")
}

export function codexResponsesBody(options, fallbackInstructions, vendorCfg) {
  const systemParts = []
  if (options.system) systemParts.push(options.system)
  const rawInput = []
  let pendingRole = null
  let pendingContent = []
  function flush() {
    if (!pendingRole) return
    const type = pendingRole === 'assistant' ? 'output_text' : 'input_text'
    rawInput.push({
      role: pendingRole,
      content: pendingContent.length ? pendingContent : [{ type, text: '' }],
    })
    pendingRole = null
    pendingContent = []
  }
  function addText(role, text) {
    const type = role === 'assistant' ? 'output_text' : 'input_text'
    if (pendingRole && pendingRole !== role) flush()
    pendingRole = role
    if (text) pendingContent.push({ type, text })
  }
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      systemParts.push(flattenText(message.content))
      continue
    }
    if (message.role === 'assistant') {
      const text = flattenText(message.content)
      if (text) addText('assistant', text)
      const calls = [
        ...toolCalls(message.content),
        ...((message.tool_calls || message.toolCalls || []).map((c) => ({
          id: c.id || c.call_id,
          name: c.name || (c.function && c.function.name),
          arguments: typeof c.arguments === 'string' ? c.arguments : (c.function && c.function.arguments) || c.arguments || '{}',
        }))),
      ]
      for (const call of calls) {
        if (!call.id) continue
        flush()
        rawInput.push({
          type: 'function_call',
          call_id: normalizeCodexCallId(call.id),
          name: call.name,
          arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
        })
      }
      continue
    }
    if (message.role === 'tool') {
      flush()
      const callId = String(message.toolCallId || message.tool_call_id || message.call_id || message.id || '')
      const outText = typeof message.content === 'string'
        ? message.content
        : (flattenText(message.content) || JSON.stringify(message.content || ''))
      if (callId) {
        rawInput.push({
          type: 'function_call_output',
          call_id: normalizeCodexCallId(callId),
          output: outText,
        })
      }
      continue
    }
    const results = toolResults(message.content)
    const text = flattenText(message.content)
    if (text) addText('user', text)
    const images = extractImages(message.content)
    for (const img of images) {
      const blk = toCodexImage(img)
      if (blk) {
        if (pendingRole && pendingRole !== 'user') flush()
        pendingRole = 'user'
        pendingContent.push(blk)
      }
    }
    for (const result of results) {
      flush()
      const callId = String(result.toolCallId || result.tool_call_id || result.call_id || result.id || '')
      const outText = typeof result.content === 'string'
        ? result.content
        : (flattenText(result.content) || (result.output != null ? (typeof result.output === 'string' ? result.output : JSON.stringify(result.output)) : ''))
      if (callId) {
        rawInput.push({
          type: 'function_call_output',
          call_id: normalizeCodexCallId(callId),
          output: outText,
        })
      }
    }
  }
  flush()
  const input = reconcileResponsesInput(rawInput)
  const tools = openaiTools(options)
  const responsesTools = tools && tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))
  const instructions = normalizeSystemPrefix(systemParts) || (fallbackInstructions ? fallbackInstructions.replace(/\r\n/g, "\n").trim() : undefined)
  return {
    model: options.model,
    stream: true,
    store: false,
    instructions,
    input,
    ...(responsesTools && responsesTools.length ? { tools: responsesTools } : {}),
    // #93: reasoning effort chosen in the native picker flows to the protocol.
    ...(options.reasoningEffort ? { reasoning: { effort: String(options.reasoningEffort) } } : {}),
    // #93: verbosity comes from the codexVerbosity setting (low/medium/high).
    ...(vendorCfg && /^(low|medium|high)$/.test(String(vendorCfg.verbosity || ''))
      ? { text: { verbosity: String(vendorCfg.verbosity) } } : {}),
    // #92: Fast Mode = 1.5x speed billing tier on the Codex backend.
    ...(vendorCfg && vendorCfg.fastMode ? { service_tier: 'priority' } : {}),
    ...(options.maxTokens != null ? { max_output_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }
}

export function anthropicPayload(options, extraSystem) {
  const systemParts = []
  if (extraSystem) systemParts.push(extraSystem)
  if (options.system) systemParts.push(options.system)
  const messages = []
  for (const message of options.messages || []) {
    if (message.role === "system") {
      systemParts.push(flattenText(message.content))
      continue
    }
    if (message.role === "assistant") {
      const blocks = []
      const text = flattenText(message.content)
      if (text) blocks.push({ type: "text", text })
      const calls = [
        ...toolCalls(message.content),
        ...((message.tool_calls || message.toolCalls || []).map((c) => ({
          id: c.id || c.call_id,
          name: c.name || (c.function && c.function.name),
          arguments: c.arguments || (c.function && c.function.arguments) || "{}",
        }))),
      ]
      for (const call of calls) {
        if (!call.id) continue
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: safeJson(call.arguments),
        })
      }
      messages.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] })
      continue
    }
    if (message.role === "tool") {
      const toolUseId = String(message.toolCallId || message.tool_call_id || message.tool_use_id || message.id || "")
      const content = typeof message.content === "string"
        ? message.content
        : (flattenText(message.content) || JSON.stringify(message.content || ""))
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolUseId,
          content: content || "",
        }],
      })
      continue
    }
    const blocks = []
    const text = flattenText(message.content)
    if (text) blocks.push({ type: "text", text })
    const images = extractImages(message.content)
    for (const img of images) {
      const blk = toAnthropicImage(img)
      if (blk) blocks.push(blk)
    }
    for (const result of toolResults(message.content)) {
      const toolUseId = String(result.toolCallId || result.tool_call_id || result.tool_use_id || result.id || "")
      const content = typeof result.content === "string"
        ? result.content
        : (flattenText(result.content) || (result.output != null ? (typeof result.output === "string" ? result.output : JSON.stringify(result.output)) : ""))
      blocks.push({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: content || "",
      })
    }
    messages.push({ role: "user", content: blocks.length ? blocks : [{ type: "text", text: "" }] })
  }

  const useCacheControl = options.cacheControl !== false
  const systemText = normalizeSystemPrefix(systemParts)
  let system
  if (systemText) {
    if (useCacheControl) {
      system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
    } else {
      system = systemText
    }
  }

  const normTools = normalizeTools(options.tools)
  const tools = normTools
    ? normTools.map((tool, idx) => {
      const item = {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }
      if (useCacheControl && idx === normTools.length - 1) {
        item.cache_control = { type: "ephemeral" }
      }
      return item
    })
    : undefined

  if (useCacheControl) {
    const userTurnIndices = []
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "user") {
        userTurnIndices.push(i)
      }
    }
    if (userTurnIndices.length >= 2) {
      const targetIdx = userTurnIndices[userTurnIndices.length - 2]
      const targetMsg = messages[targetIdx]
      if (Array.isArray(targetMsg.content) && targetMsg.content.length > 0) {
        const lastBlockIdx = targetMsg.content.length - 1
        const lastBlock = targetMsg.content[lastBlockIdx]
        targetMsg.content[lastBlockIdx] = {
          ...lastBlock,
          cache_control: { type: "ephemeral" },
        }
      }
    }
  }

  return {
    model: options.model,
    max_tokens: options.maxTokens || 8192,
    stream: true,
    ...(system ? { system } : {}),
    messages,
    ...(tools && tools.length ? { tools } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }
}

export function googleContents(options) {
  const contents = []
  const systemParts = []
  if (options.system) systemParts.push({ text: options.system })
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      systemParts.push({ text: flattenText(message.content) })
      continue
    }
    if (message.role === 'tool') {
      const name = message.toolName || message.name || 'tool'
      const output = typeof message.content === 'string'
        ? message.content
        : (flattenText(message.content) || JSON.stringify(message.content || ''))
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name,
            response: { output },
          },
        }],
      })
      continue
    }
    const role = message.role === 'assistant' ? 'model' : 'user'
    const parts = []
    const text = flattenText(message.content)
    if (text) parts.push({ text })
    const images = extractImages(message.content)
    for (const img of images) {
      const blk = toGeminiImage(img)
      if (blk) parts.push(blk)
    }
    const calls = [
      ...toolCalls(message.content),
      ...((message.tool_calls || message.toolCalls || []).map((c) => ({
        name: c.name || (c.function && c.function.name),
        arguments: c.arguments || (c.function && c.function.arguments) || '{}',
      }))),
    ]
    for (const call of calls) {
      parts.push({ functionCall: { name: call.name, args: safeJson(call.arguments) } })
    }
    for (const result of toolResults(message.content)) {
      const name = result.toolName || result.name || 'tool'
      const output = typeof result.content === 'string'
        ? result.content
        : (flattenText(result.content) || (result.output != null ? (typeof result.output === 'string' ? result.output : JSON.stringify(result.output)) : ''))
      parts.push({
        functionResponse: {
          name,
          response: { output },
        },
      })
    }
    if (!parts.length) parts.push({ text: '' })
    contents.push({ role, parts })
  }
  const declarations = geminiFunctionDeclarations(options.tools)
  const tools = declarations ? [{ functionDeclarations: declarations }] : undefined
  return {
    contents,
    ...(() => {
      const systemText = normalizeSystemPrefix(systemParts)
      return systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}
    })(),
    ...(tools ? { tools } : {}),
    generationConfig: {
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null ? { maxOutputTokens: options.maxTokens } : {}),
    },
  }
}

function safeJson(text) {
  if (typeof text === 'object' && text !== null) return text
  try { return JSON.parse(text) } catch { return {} }
}

export function modelCatalog(provider, list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const entry of list) {
    if (!entry) continue
    if (typeof entry === 'string') {
      out.push({ provider, id: entry, name: entry })
      continue
    }
    if (typeof entry === 'object') {
      const id = entry.id || entry.slug || entry.name
      if (!id) continue
      out.push({
        provider,
        id,
        name: entry.name || entry.display_name || id,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.contextWindow || entry.context_window ? { contextWindow: entry.contextWindow || entry.context_window } : {}),
        ...(entry.reasoning != null ? { reasoning: entry.reasoning } : {}),
        ...(entry.inputModalities || entry.input_modalities ? { inputModalities: entry.inputModalities || entry.input_modalities } : {}),
      })
    }
  }
  return out
}
