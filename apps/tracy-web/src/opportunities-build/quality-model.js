/** Job roles use the operator's existing assignments. Credentials never enter an input or receipt. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { effortOptions } from '../lib/llm-effort.js'
import { lookupDoor } from '../lib/llm-store.js'
import { currentVisionProof, VISION_TEST_PROFILE, visionFingerprint } from '../lib/llm-vision-test.js'
import { QUALITY_POLICY, qualityHash } from './quality-dossier.js'

const prices = JSON.parse(readFileSync(new URL('./quality-prices.json', import.meta.url)))
const fail = (code) => Object.assign(new Error(code), { code })
const DOORS = Object.freeze({
  facts: 'woEditorial',
  observations: 'vision',
  plan: 'woEditorial',
  review: 'vision',
  'vision-test': 'vision'
})

export async function qualityModelFor({ pool, secret, role, now = Date.now }) {
  if (!DOORS[role]) throw fail('QUALITY_MODEL_ROLE')
  const door = await lookupDoor(pool, DOORS[role], secret)
  if (door.state !== 'ok') throw fail('QUALITY_MODEL_UNCONFIGURED')
  const { providerId, baseUrl, model, apiKey } = door.credential
  const metadata = door.snapshot.metadata
  const readsImages = DOORS[role] === 'vision'
  if (!metadata || metadata.reasoning !== true || (readsImages && metadata.vision !== true))
    throw fail('QUALITY_MODEL_CAPABILITY_UNKNOWN')
  const host = new URL(baseUrl).hostname
  const rate = prices.endpointHost === host ? prices.models[model] : null
  if (!rate || now() >= Date.parse(prices.validUntil)) throw fail('QUALITY_PRICE_UNKNOWN')
  const options = effortOptions({ presetId: door.snapshot.presetId, baseUrl, metadata })
  const effort = readsImages ? 'high' : door.snapshot.effort
  if (!effort || !options.choices.includes(effort)) throw fail('QUALITY_EFFORT_UNSUPPORTED')
  const config = {
    providerId,
    endpointHost: host,
    endpointHash: qualityHash(baseUrl.replace(/\/+$/, '')),
    model,
    role,
    reasoning: { enabled: true, effort, parameter: options.parameter, profile: options.profile },
    door: DOORS[role],
    capabilities: { reasoning: true, vision: metadata.vision === true },
    registry: { ...door.snapshot, metadata: undefined, capabilitiesHash: qualityHash(metadata) },
    requestProfile: readsImages ? VISION_TEST_PROFILE : 'wo-editorial-thinking-json/1',
    price: {
      ...rate,
      source: prices.source,
      verifiedAt: prices.verifiedAt,
      validUntil: prices.validUntil,
      maxImageTokens: prices.maxImageTokens,
      costBasis: 'verified-peak-upper-bound'
    },
    promptVersion: QUALITY_POLICY
  }
  if (readsImages) {
    config.visionFingerprint = visionFingerprint({ snapshot: door.snapshot, baseUrl, model })
    if (role !== 'vision-test') {
      config.visionProof = await currentVisionProof({ pool, fingerprint: config.visionFingerprint, now })
      if (!config.visionProof) throw fail('QUALITY_VISION_PIXEL_TEST_REQUIRED')
    }
  }
  return { config: { ...config, hash: qualityHash(config) }, credential: { apiKey, baseUrl } }
}

export function qualityCallBudget({
  config,
  system,
  input,
  images = [],
  maxTokens,
  maxInputTokens,
  maxImages
}) {
  if (
    !Number.isInteger(maxTokens) ||
    maxTokens < 128 ||
    maxTokens > 32000 ||
    !Number.isInteger(maxInputTokens) ||
    maxInputTokens < 1
  )
    throw fail('QUALITY_TOKEN_BUDGET')
  if (!Number.isInteger(maxImages) || maxImages < 0 || images.length > maxImages)
    throw fail('QUALITY_IMAGE_BUDGET')
  if (images.length && !config.capabilities.vision) throw fail('QUALITY_VISION_UNSUPPORTED')
  if (['observations', 'review', 'vision-test'].includes(config.role) && !images.length)
    throw fail('QUALITY_VISION_INPUT_MISSING')
  for (const image of images)
    if (
      !image.id ||
      !/^[a-f0-9]{64}$/.test(image.sha256 ?? '') ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl ?? '')
    )
      throw fail('QUALITY_IMAGE_INPUT')
  for (const image of images)
    if (
      createHash('sha256')
        .update(Buffer.from(image.dataUrl.split(',')[1], 'base64'))
        .digest('hex') !== image.sha256
    )
      throw fail('QUALITY_IMAGE_HASH_MISMATCH')
  // The provider counts inline base64 toward its 48 MiB body limit. Refuse before dispatch,
  // rather than paying for a request whose valid individual pictures cannot fit together.
  const bodyBytes =
    Buffer.byteLength(system + JSON.stringify(input), 'utf8') +
    4096 +
    images.reduce((n, image) => n + Buffer.byteLength(image.dataUrl, 'utf8') + 256, 0)
  if (bodyBytes > 48 * 1024 * 1024) throw fail('QUALITY_REQUEST_BYTES_LIMIT')
  // A byte per text token, plus framing and the documented per-image upper bound, is conservative.
  const maxInput =
    Buffer.byteLength(system + JSON.stringify(input), 'utf8') +
    2048 +
    images.length * (config.price.maxImageTokens + 128)
  if (maxInput > maxInputTokens || maxInput + maxTokens > 1_000_000) throw fail('QUALITY_INPUT_LIMIT')
  const maxCents = Math.ceil(
    (maxInput * config.price.inputCentsPerM + maxTokens * config.price.outputCentsPerM) / 1_000_000
  )
  return {
    maxCents,
    maxInputTokens: maxInput,
    maxOutputTokens: maxTokens,
    maxImages: images.length,
    reasoningEffort: config.reasoning?.effort,
    modelConfigHash: config.hash,
    requestBytes: bodyBytes
  }
}

/** One bounded reasoning call with real pixels. JSON/schema failures still return their paid receipt. */
export async function callQualityModel({
  model,
  system,
  input,
  images = [],
  budget,
  signal,
  fetchImpl = fetch,
  now = Date.now
}) {
  const started = now()
  const providerTimeoutMs = model.config.executionProfile?.providerTimeoutMs ?? 180000
  if (
    (providerTimeoutMs !== 180000 && providerTimeoutMs !== 600000) ||
    (model.config.executionProfile?.providerTimeoutMs && budget.providerTimeoutMs !== providerTimeoutMs)
  )
    throw fail('QUALITY_REQUEST_PROFILE_MISMATCH')
  if (
    !model.config.reasoning?.enabled ||
    model.config.reasoning.parameter !== 'reasoning_effort' ||
    model.config.reasoning.profile !== 'deepseek-chat-thinking/1' ||
    !['low', 'high', 'max'].includes(model.config.reasoning.effort) ||
    budget.reasoningEffort !== model.config.reasoning.effort ||
    budget.modelConfigHash !== model.config.hash
  )
    throw fail('QUALITY_REQUEST_PROFILE_MISMATCH')
  const content = [{ type: 'text', text: JSON.stringify(input) }]
  for (const image of images)
    content.push(
      { type: 'text', text: `Image ${image.id}; SHA256 ${image.sha256}` },
      { type: 'image_url', image_url: { url: image.dataUrl, detail: 'original' } }
    )
  const response = await fetchImpl(`${model.credential.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${model.credential.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.config.model,
      max_tokens: budget.maxOutputTokens,
      thinking: { type: 'enabled' },
      reasoning_effort: model.config.reasoning.effort,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content }
      ]
    }),
    signal: AbortSignal.any([AbortSignal.timeout(providerTimeoutMs), ...(signal ? [signal] : [])])
  })
  if (!response.ok)
    throw Object.assign(new Error(`QUALITY_PROVIDER_HTTP_${response.status}`), {
      code: `QUALITY_PROVIDER_HTTP_${response.status}`
    })
  const body = await response.json()
  const receipt = {
    modelConfigHash: model.config.hash,
    model: body.model ?? null,
    endpointHost: model.config.endpointHost,
    requestId: body.id ?? null,
    usage: body.usage ?? null,
    durationMs: now() - started,
    startedAt: new Date(started).toISOString(),
    reasoning: 'enabled',
    reasoningEffort: model.config.reasoning.effort,
    requestProfile: model.config.reasoning.profile,
    budget,
    costBasis: 'usage-at-verified-peak-upper-bound',
    imageHashes: images.map(({ id, sha256 }) => ({ id, sha256 })),
    calls: 1
  }
  let result = null,
    error = null
  if (body.choices?.[0]?.finish_reason === 'length') error = 'QUALITY_MODEL_TRUNCATED'
  else
    try {
      result = JSON.parse(body.choices?.[0]?.message?.content ?? '')
    } catch {
      error = 'QUALITY_MODEL_JSON_INVALID'
    }
  // Do not retain reasoning_content: only the decision and usage are evidence.
  return { result, error, receipt }
}

export function qualityUsageCost(answer, config) {
  const u = answer.receipt?.usage
  if (answer.receipt?.model !== config.model) return null
  if (
    !Number.isInteger(u?.prompt_tokens) ||
    u.prompt_tokens < 0 ||
    !Number.isInteger(u?.completion_tokens) ||
    u.completion_tokens < 0
  )
    return null
  const hit = u.prompt_cache_hit_tokens ?? 0
  if (!Number.isInteger(hit) || hit < 0 || hit > u.prompt_tokens) return null
  const at = new Date(answer.receipt.startedAt)
  if (!Number.isFinite(at.getTime()) || at.getTime() >= Date.parse(config.price.validUntil)) return null
  // A client timestamp does not establish the provider's billing window at a price boundary.
  // Keep the verified peak upper bound until a provider billing receipt proves a lower charge.
  return (
    ((u.prompt_tokens - hit) * config.price.inputCentsPerM +
      hit * config.price.cacheCentsPerM +
      u.completion_tokens * config.price.outputCentsPerM) /
    1_000_000
  )
}
