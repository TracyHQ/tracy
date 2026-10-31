/** Apply the operator's provider book to dsh's host-wide model catalog and selections. */
import { readProviders } from '../lib/llm-store.js'
import { forwardHttp } from './proxy.js'
import { modelWire } from '../lib/model-wire.js'
import { publicModelExport } from './model-export.js'

import {
  allowedModelProviders,
  aliasModelCatalog,
  restrictToAliasedModels,
  isDeploymentRoute,
  isApprovedDeploymentModel,
  ROUTE_OF,
  shownModelAlias,
  shownProviderAlias
} from '../lib/model-providers.js'
export { allowedModelProviders } from '../lib/model-providers.js'

/** Filter selectable routes together; retain the actual host default required by the RPC schema. */
export function filterModelCatalog(catalog, allowed) {
  return {
    ...catalog,
    groups: catalog.groups.filter((group) => allowed.has(group.id)),
    routableProviders: catalog.routableProviders.filter((id) => allowed.has(id)),
    failures: catalog.failures.filter((failure) => allowed.has(failure.id))
  }
}

/** Run after workspace admission; ordinary requests retain the streaming proxy unchanged. */
export async function forwardModelHttp(request, target, options, { pool, config, modelAccounts }) {
  const endpoint = target.pathname.match(/\/api\/session\/(modelCatalog|selectModel|modelLabels)$/)?.[1]
  const wire = modelWire(config.sessionSecret)
  if (target.pathname.endsWith('/api/session.export') && request.method === 'GET') {
    return publicModelExport(await forwardHttp(request, target, options), wire)
  }
  if (!endpoint || request.method !== 'POST') {
    if (request.method === 'POST' && target.pathname.endsWith('/api/$events/result')) {
      const value = await request
        .clone()
        .json()
        .catch(() => null)
      if (value) {
        const headers = new Headers(request.headers)
        headers.delete('content-length')
        request = new Request(request.url, {
          method: 'POST',
          headers,
          signal: request.signal,
          body: JSON.stringify(wire.decode(value))
        })
      }
    }
    const response = await forwardHttp(request, target, options)
    return /\/api\/(?:session\/|\$events\/)/.test(target.pathname)
      ? encodeModelResponse(response, wire)
      : response
  }
  const providers = pool ? await readProviders(pool, config.sessionSecret) : []
  if (endpoint === 'modelLabels') {
    const envelope = await request.json().catch(() => null)
    const selected = envelope?.payload?.args?.request
    const canonical =
      typeof selected?.provider === 'string' &&
      selected.provider.startsWith('tp_') &&
      typeof selected.model === 'string' &&
      selected.model.startsWith('tm_')
        ? wire.decode(selected)
        : null
    const source = providers.find(
      (provider) => provider.id === provider.presetId && ROUTE_OF[provider.id] === canonical?.provider
    )
    const value =
      source && typeof canonical.model === 'string'
        ? {
            providerName: shownProviderAlias(source) || source.name,
            modelName:
              shownModelAlias(source, canonical.model) ||
              source.models.find((model) => model.id === canonical.model)?.name ||
              null
          }
        : null
    return Response.json(
      {
        type: 'server-response',
        rpcId: envelope?.rpcId,
        result: { ok: true, value: value?.modelName ? value : null }
      },
      { headers: { 'cache-control': 'no-store' } }
    )
  }
  const allowed = allowedModelProviders(providers)
  const accounts = modelAccounts ? await modelAccounts() : { groups: [], failures: [] }
  for (const group of accounts.groups) allowed.add(group.id)
  if (endpoint === 'selectModel') {
    const envelope = await request
      .clone()
      .json()
      .catch(() => null)
    const selection = envelope?.payload?.args?.request
    const unavailable = () =>
      Response.json(
        {
          type: 'server-response',
          rpcId: envelope?.rpcId,
          result: {
            ok: false,
            error: {
              code: 'session/model-unavailable',
              message: 'This model is disabled or unavailable.',
              details: {}
            }
          }
        },
        { headers: { 'cache-control': 'no-store' } }
      )
    if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string')
      return unavailable()
    const canonical = [...allowed].find((id) => wire.providerId(id) === selection.provider)
    if (!canonical) return unavailable()
    if (wire.providerId(canonical) !== canonical) {
      // Resolve against the host's current catalog, not an operator cache or client-supplied ID.
      const catalogTarget = new URL(target)
      catalogTarget.pathname = catalogTarget.pathname.replace(/selectModel$/, 'modelCatalog')
      const headers = new Headers(request.headers)
      headers.delete('content-length')
      const lookup = new Request(request.url, {
        method: 'POST',
        headers,
        signal: request.signal,
        body: JSON.stringify({ ...envelope, method: 'session/modelCatalog', payload: { args: {} } })
      })
      const response = await forwardHttp(lookup, catalogTarget, options)
      const book = response.ok ? await response.json().catch(() => null) : null
      const group = book?.result?.ok && book.result.value?.groups?.find((group) => group.id === canonical)
      const model =
        group && group.models.find((model) => wire.modelId(canonical, model.id) === selection.model)
      if (!model) return unavailable()
      // Deployment routes expose only operator-approved (aliased) models; personal accounts are not gated.
      if (isDeploymentRoute(canonical) && !isApprovedDeploymentModel(providers, canonical, model.id))
        return unavailable()
      envelope.payload.args.request = { ...selection, provider: canonical, model: model.id }
      request = new Request(request.url, {
        method: request.method,
        headers,
        signal: request.signal,
        body: JSON.stringify(envelope)
      })
    }
  }
  const response = await forwardHttp(request, target, options)
  if (endpoint !== 'modelCatalog') return encodeModelResponse(response, wire, true)
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return response
  const envelope = await response.json()
  if (envelope.result?.ok && envelope.result.value) {
    const filtered = restrictToAliasedModels(filterModelCatalog(envelope.result.value, allowed), providers)
    filtered.groups = [...filtered.groups.filter((g) => !g.id.startsWith('seat-plan-')), ...accounts.groups]
    filtered.routableProviders = filtered.groups.map((g) => g.id)
    filtered.failures = [
      ...filtered.failures.filter((g) => !g.id.startsWith('seat-plan-')),
      ...accounts.failures
    ]
    envelope.result.value = wire.encode(aliasModelCatalog(filtered, providers))
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('cache-control', 'no-store')
  return Response.json(envelope, { status: response.status, headers })
}

/** Cover unary session snapshots and selection replies as well as the explicit catalog. */
async function encodeModelResponse(response, wire, selection = false) {
  if (!response.headers.get('content-type')?.includes('application/json')) return response
  const value = await response.json()
  if (selection && value.result?.ok === false) {
    value.result.error = {
      code: value.result.error?.code ?? 'session/model-unavailable',
      message: 'The model selection could not be applied.',
      details: {}
    }
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('cache-control', 'no-store')
  return Response.json(wire.encode(value), { status: response.status, headers })
}
