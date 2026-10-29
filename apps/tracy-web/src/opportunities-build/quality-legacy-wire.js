/** Bound legacy requests without changing their prompts, tools, thinking or image versions. */
import { createHash } from 'node:crypto'
import { pictureFeatures } from '../lib/picture-cut.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { qualityHash } from './quality-dossier.js'
import { boundedQualityPrice } from './quality-price.js'

const imageInfo = imageInfoWith({ pictureFeatures })

const fail = (code, details) => Object.assign(new Error(code), { code, ...(details ? { details } : {}) })
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const integer = (n) => Number.isSafeInteger(n) && n >= 0

export async function legacyRequestBudget(body, config, { measure = imageInfo, now = Date.now } = {}) {
  if (
    !body ||
    !config.acceptedModels?.includes(body.model) ||
    !integer(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > 384000
  )
    throw fail('LEGACY_MODEL_OR_OUTPUT_UNSUPPORTED')
  config = { ...config, price: boundedQualityPrice(config.price, { now }) }
  const bodyHash = qualityHash(body),
    requestBytes = Buffer.byteLength(JSON.stringify(body))
  if (requestBytes > 48 * 1024 * 1024) throw fail('QUALITY_REQUEST_BYTES_LIMIT')
  // Native replay extensions contain attachment references, not provider image blocks.
  // Only protocol content positions can authorize pixels or Files references.
  const view = structuredClone(body),
    imageInputs = []
  const contentBlocks = (blocks, at) => {
    if (!Array.isArray(blocks)) return
    for (const [index, block] of blocks.entries()) {
      if (!block || typeof block !== 'object') continue
      const location = `${at}[${index}]`
      if (
        block.file_id !== undefined ||
        ['file', 'file_id'].includes(block.type) ||
        block.source?.type === 'file' ||
        block.source?.file_id !== undefined
      )
        throw fail('LEGACY_REMOTE_FILE_FORBIDDEN')
      if (block.type === 'image') imageInputs.push({ block, at: location })
      else if (block.type === 'tool_result') contentBlocks(block.content, `${location}.content`)
    }
  }
  for (const [index, message] of (Array.isArray(view.messages) ? view.messages : []).entries())
    contentBlocks(message?.content, `$.messages[${index}].content`)
  contentBlocks(view.system, '$.system')
  // Promise.all preserves occurrence order even when decoding finishes out of order.
  const images = await Promise.all(
    imageInputs.map(async ({ block, at }) => {
      const source = block.source
      if (
        source?.type !== 'base64' ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(source.media_type) ||
        !/^[A-Za-z0-9+/]+=*$/.test(source.data ?? '')
      )
        throw fail('LEGACY_IMAGE_SOURCE_UNSUPPORTED', {
          at,
          sourceType: ['base64', 'file', 'url'].includes(source?.type) ? source.type : 'other',
          mediaType: /^image\/[a-z+.-]+$/.test(source?.media_type ?? '') ? source.media_type : 'other',
          dataType: typeof source?.data,
          dataLength: typeof source?.data === 'string' ? source.data.length : null,
          validBase64: typeof source?.data === 'string' && /^[A-Za-z0-9+/]+=*$/.test(source.data)
        })
      const bytes = Buffer.from(source.data, 'base64')
      if (bytes.length > 32 * 1024 * 1024) throw fail('LEGACY_IMAGE_BYTES_LIMIT')
      const info = await measure(bytes)
      if (!integer(info.width) || !integer(info.height) || info.width < 1 || info.height < 1)
        throw fail('LEGACY_IMAGE_DIMENSIONS')
      const image = {
        sha256: hash(bytes),
        mime: source.media_type,
        bytes: bytes.length,
        width: info.width,
        height: info.height
      }
      block.source = { ...source, data: '' }
      return image
    })
  )
  const sideLimit = images.length >= 15 ? 4096 : 8192
  if (images.length > 600 || images.some((i) => i.width > sideLimit || i.height > sideLimit))
    throw fail('LEGACY_IMAGE_DIMENSIONS')
  if (images.length && config.capabilities?.vision !== true) throw fail('QUALITY_VISION_UNSUPPORTED')
  const serverTools = (body.tools ?? []).filter((t) => t.type && t.type !== 'custom')
  if (
    serverTools.some(
      (t) => t.type !== 'web_search_20250305' || !integer(t.max_uses) || t.max_uses < 1 || t.max_uses > 5
    ) ||
    (serverTools.length &&
      (config.price.searchCentsPerUse !== 0 || now() >= Date.parse(config.price.searchValidUntil)))
  )
    throw fail('LEGACY_TOOL_PRICE_UNKNOWN')
  const maxInputTokens =
    Buffer.byteLength(JSON.stringify(view)) + 2048 + images.length * (config.price.maxImageTokens + 128)
  if (maxInputTokens + body.max_tokens > 1000000) throw fail('QUALITY_INPUT_LIMIT')
  return {
    bodyHash,
    ...(config.price.warning
      ? { priceWarning: config.price.warning, costBasis: config.price.costBasis }
      : {}),
    requestBytes,
    maxInputTokens,
    maxOutputTokens: body.max_tokens,
    images,
    thinking: body.thinking ?? null,
    reasoningEffort: body.reasoning_effort ?? body.output_config?.effort ?? null,
    serverToolMaxUses: serverTools.reduce((n, t) => n + t.max_uses, 0),
    maxCents: Math.ceil(
      (maxInputTokens * config.price.inputCentsPerM + body.max_tokens * config.price.outputCentsPerM) /
        1000000
    )
  }
}

/** Inspect only cumulative usage and request identity; never retain text or thinking events. */
export function legacyMessagesUsage() {
  let pending = '',
    usage = {},
    requestId = null,
    model = null,
    complete = false,
    started = false,
    delta = false
  const accept = (event) => {
    if (complete) throw fail('LEGACY_STREAM_AFTER_STOP')
    if (event.type === 'error') throw fail('LEGACY_PROVIDER_STREAM_ERROR')
    if (event.type === 'message_start') {
      if (started) throw fail('LEGACY_STREAM_DUPLICATE_START')
      started = true
      requestId = event.message?.id ?? null
      model = event.message?.model ?? null
      usage = { ...event.message?.usage }
    }
    if (event.type === 'message_delta') {
      usage = { ...usage, ...event.usage }
      delta = true
    }
    if (event.type === 'message_stop') complete = started && delta
  }
  const frame = (raw) => {
    const data = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n')
    if (!data) return
    try {
      accept(JSON.parse(data))
    } catch (e) {
      throw fail(e.code ?? 'LEGACY_STREAM_JSON_INVALID')
    }
  }
  const decoder = new TextDecoder()
  return {
    push(bytes) {
      pending = (pending + decoder.decode(bytes, { stream: true })).replaceAll('\r\n', '\n')
      let end
      while ((end = pending.indexOf('\n\n')) >= 0) {
        frame(pending.slice(0, end))
        pending = pending.slice(end + 2)
      }
      if (pending.length > 2 * 1024 * 1024) throw fail('LEGACY_STREAM_FRAME_LIMIT')
    },
    // Native Messages consumers stop at message_stop; this does not claim transport EOF.
    ready() {
      return complete && !pending.trim() ? { usage: { ...usage }, requestId, model } : null
    },
    finish() {
      pending += decoder.decode()
      if (pending.trim()) frame(pending)
      pending = ''
      if (!complete) throw fail('LEGACY_STREAM_INCOMPLETE')
      return { usage, requestId, model }
    }
  }
}

export function legacyUsageCost(receipt, config, { flavor = 'messages' } = {}) {
  const started = Date.parse(receipt.startedAt)
  if (
    !Number.isFinite(started) ||
    !config.acceptedModels?.includes(receipt.model) ||
    started >= Date.parse(config.price.validUntil)
  )
    return null
  const u = receipt.usage
  if (!u) return null
  const input = flavor === 'chat' ? u.prompt_tokens : u.input_tokens,
    output = flavor === 'chat' ? u.completion_tokens : u.output_tokens,
    hit = flavor === 'chat' ? (u.prompt_cache_hit_tokens ?? 0) : (u.cache_read_input_tokens ?? 0),
    created = flavor === 'chat' ? 0 : (u.cache_creation_input_tokens ?? 0)
  if (![input, output, hit, created].every(integer) || (flavor === 'chat' && hit > input)) return null
  const miss = flavor === 'chat' ? input - hit : input + created
  return (
    (miss * config.price.inputCentsPerM +
      hit * config.price.cacheCentsPerM +
      output * config.price.outputCentsPerM) /
    1000000
  )
}
