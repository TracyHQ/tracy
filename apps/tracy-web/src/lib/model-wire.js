import { createHmac } from 'node:crypto'
import { ROUTE_OF } from './model-providers.js'

const wires = new Map()
const deploymentRoutes = new Set(Object.values(ROUTE_OF))

/** Stable opaque public IDs. The deployment secret and canonical routes stay on the server. */
export function modelWire(secret) {
  if (typeof secret !== 'string' || !secret) throw new Error('Model wire requires a deployment secret')
  if (wires.has(secret)) return wires.get(secret)
  const emittedModels = new Map()
  const digest = (kind, parts) =>
    `${kind}_${createHmac('sha256', secret)
      .update(JSON.stringify(['tracy-model-wire-v1', kind, ...parts]))
      .digest('base64url')}`
  const providerId = (provider) => (deploymentRoutes.has(provider) ? digest('tp', [provider]) : provider)
  const modelId = (provider, model) => {
    if (!deploymentRoutes.has(provider)) return model
    const id = digest('tm', [provider, model])
    emittedModels.set(id, { provider, model })
    return id
  }

  // Transform structured routing fields only. User messages and tool contents are not redacted.
  function encode(value, field = '') {
    if (Array.isArray(value)) return value.map((child) => encode(child, field))
    if (value === null || typeof value !== 'object') return value
    const out = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        encode(child, value.type === 'model/selection' && key === 'data' ? 'selection' : key)
      ])
    )
    if (
      ['', 'config', 'selection', 'selected', 'default', 'lastUsed', 'next', 'pending', 'details'].includes(
        field
      ) &&
      typeof value.provider === 'string' &&
      deploymentRoutes.has(value.provider)
    ) {
      out.provider = providerId(value.provider)
      if (typeof value.model === 'string') out.model = modelId(value.provider, value.model)
    }
    if (Array.isArray(value.groups) && Array.isArray(value.routableProviders)) {
      out.groups = value.groups.map((group) =>
        deploymentRoutes.has(group.id)
          ? {
              ...encode(group),
              id: providerId(group.id),
              models: group.models.map((model) => ({ ...encode(model), id: modelId(group.id, model.id) }))
            }
          : encode(group)
      )
      out.routableProviders = value.routableProviders.map(providerId)
      out.failures = (value.failures ?? []).map((failure) =>
        deploymentRoutes.has(failure.id)
          ? {
              ...failure,
              id: providerId(failure.id),
              message: 'Model list is temporarily unavailable.'
            }
          : encode(failure)
      )
    }
    return out
  }
  // Forwarded Remote event replies may return a config previously sent over the stream.
  // Decode only server-emitted routes; explicit selections still validate against a fresh catalog.
  function decode(value, field = '') {
    if (Array.isArray(value)) return value.map((child) => decode(child, field))
    if (value === null || typeof value !== 'object') return value
    const out = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child, key)]))
    const provider = [...deploymentRoutes].find((route) => providerId(route) === value.provider)
    const model = emittedModels.get(value.model)
    if (
      ['', 'config', 'selection', 'selected', 'default', 'lastUsed', 'next', 'pending'].includes(field) &&
      provider &&
      model?.provider === provider
    ) {
      out.provider = provider
      out.model = model.model
    }
    return out
  }
  const wire = { providerId, modelId, encode, decode }
  wires.set(secret, wire)
  return wire
}
