/**
 * What `/api/ops/llm/*` answers, and the calls the Model & AI screen makes.
 *
 * 🔒 THERE IS NO `apiKey` FIELD ON `Provider`, DELIBERATELY. The door never answers one — only
 * `keyHint` and `configured`. Typing the field that way means a screen cannot accidentally start
 * rendering a key because somebody added it to the payload later.
 */

export interface CatalogEntry {
  id: string
  name: string
  baseUrl: string
  apiKeyUrl: string
  keyPrefix?: string
  keyOptional?: boolean
  note?: string
}

export interface Provider {
  id: string
  presetId: string | null
  name: string
  baseUrl: string
  baseUrlOverridden: boolean
  apiKeyUrl: string | null
  keyOptional: boolean
  note: string | null
  configured: boolean
  keyHint: string | null
  /** A key sealed under a SESSION_SECRET this deployment no longer has. Its own state, because
   * the fix (type it again) differs from the fix for one that was never set. */
  keyUnreadable: boolean
  enabled: boolean
  providerAlias?: string
  modelAliases?: Record<string, string>
  models: ModelRow[]
  modelsReadAt: string | null
  revision: number
  effortOptions?: Record<string, { mode: 'selectable' | 'unknown' | 'unsupported'; choices: string[] }>
  updatedBy: string
  updatedAt: string
}

/**
 * 🔒 EVERY CAPABILITY IS THREE-STATE: `true` the provider says it can, `false` it says it cannot,
 * `null` it said nothing. `null` must never be drawn as `false` — only OpenRouter publishes this
 * shape today, so silence elsewhere would mark every model as incapable of everything.
 */
export type Capability = 'draws' | 'vision' | 'reasoning' | 'tools' | 'json'

export interface ModelRow {
  id: string
  name: string
  draws: boolean | null
  vision: boolean | null
  reasoning: boolean | null
  reasoningEfforts?: string[] | null
  tools: boolean | null
  json: boolean | null
  context: number | null
}

export interface CapabilityMeta {
  id: Capability
  label: string
  from: string
}

export interface Door {
  id: 'web' | 'assistant' | 'seedText' | 'seedImage' | 'vision' | 'woEditorial' | 'agent'
  label: string
  where: string
  blurb: string
  needsModel: boolean
  /** The door REFUSES a model the provider says lacks these. */
  requires?: Capability[]
  /** The screen WARNS; the door still saves. The difference is whether a machine can prove it. */
  prefers?: Capability[]
  drawsPictures?: boolean
  configurableEffort?: boolean
}

export interface Assignment {
  providerId: string
  model: string | null
  effort?: string | null
  updatedBy: string
  updatedAt: string
}

export interface LlmPayload {
  catalog: CatalogEntry[]
  doors: Door[]
  capabilities: CapabilityMeta[]
  providers: Provider[]
  assignments: Record<string, Assignment | null>
  writable: boolean
  visionTest?: {
    state: 'passed' | 'untested' | 'unavailable'
    model?: string
    error?: string
    active?: { id: string; requestKey: string; state: string } | null
    proof?: { id: string; fingerprint: string; digest: string; completedAt: string } | null
  }
}

export const testVision = (requestKey: string) =>
  call<{ id?: string; state?: string; error?: string; model?: string; costCents?: number | null }>(
    '/api/ops/llm/doors/vision/test',
    { method: 'POST', body: JSON.stringify({ requestKey }) }
  )

export interface ProbeResult {
  ok: boolean
  status: number
  detail: string | null
  latencyMs: number
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers
      }
    })
    if (!response.ok && response.status !== 200) {
      // A refusal still carries a body worth showing (`PROVIDER_IN_USE`, `PROVIDER_NOT_READY`).
      const body = await response.json().catch(() => null)
      return (body ?? null) as T | null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}

export const fetchLlm = () => call<LlmPayload>('/api/ops/llm')

export const saveProvider = (id: string, patch: Record<string, unknown>) =>
  call<{ provider: Provider } | { error: string }>(`/api/ops/llm/providers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  })

export const removeProvider = (id: string) =>
  call<{ error: string | null; doors: string[] }>(`/api/ops/llm/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })

export const testProvider = (id: string, model: string) =>
  call<ProbeResult & { error?: string }>(`/api/ops/llm/providers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    body: JSON.stringify({ model })
  })

export const listModels = (id: string) =>
  call<{
    models?: ModelRow[]
    error?: string
    status?: number
    detail?: string
  }>(`/api/ops/llm/providers/${encodeURIComponent(id)}/models`, { method: 'POST' })

export const assignDoor = (door: string, providerId: string, model: string | null, effort?: string) =>
  call<{
    assignments?: Record<string, Assignment | null>
    error?: string
    model?: string
    lacking?: Capability[]
  }>(`/api/ops/llm/doors/${encodeURIComponent(door)}`, {
    method: 'PUT',
    body: JSON.stringify({ providerId, ...(model ? { model } : {}), ...(effort ? { effort } : {}) })
  })

export const clearDoor = (door: string) =>
  call<{ assignments: Record<string, Assignment | null> }>(`/api/ops/llm/doors/${encodeURIComponent(door)}`, {
    method: 'DELETE'
  })

/** Send the keys down to the machine the agent and the seeder run on. */
export const pushKeys = () =>
  call<{ ok: boolean; wrote?: string[]; host?: string; code?: string; detail?: string }>(
    '/api/ops/llm/push',
    {
      method: 'POST',
      body: '{}'
    }
  )

/** Display names for models billed to this deployment. */
export const saveModelAliases = (id: string, aliases: Record<string, string>, providerAlias: string) =>
  call<{ aliases?: Record<string, string>; error?: string }>(
    `/api/ops/llm/providers/${encodeURIComponent(id)}/model-aliases`,
    {
      method: 'PUT',
      body: JSON.stringify({ aliases, providerAlias })
    }
  )
