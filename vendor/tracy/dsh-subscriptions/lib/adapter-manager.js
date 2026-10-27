import { SubscriptionAdapter } from './adapter.js'
import { resolveFallbackVendor, mapFallbackModel } from './cascade.js'
import { normalizeSlots, vendorConfig } from './accounts.js'
import { PROVIDERS, isProvider, oauthRef } from './refs.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { getVendor } from './vendors/index.js'
import { Config, plainConfig } from './config-schema.js'

export function createAdapterManager({
  ctx,
  live,
  store,
  logger,
  fetch,
  fetchForRef,
  recordHistory,
  getSettingsApi,
  syncCustomVendors,
  syncOllama,
  stripLegacySlots,
  ollamaFallback,
}) {
  let handle
  let adapterDisposed = false
  let retryTimer
  let registeredByUs = new Set()

  function disposeAdapterHandle(h) {
    if (!h) return
    try {
      if (typeof h === 'function') h()
      else if (typeof h.dispose === 'function') h.dispose()
    } catch (err) {
      if (logger && logger.debug) logger.debug('[dsh-subscriptions] dispose handle error: ' + (err && err.message || err))
    }
  }

  const adapter = new SubscriptionAdapter({
    listAccounts: (provider) => store.listAccounts(provider),
    loadBlob: (ref) => store.loadBlob(ref),
    ensureFresh: (provider, blob, ref) => store.ensureFresh(provider, blob, ref),
    vendorConfig: (provider) => vendorConfig(provider, live()),
    cooldownMs: () => live().cooldownMs,
    autoPacing: () => live().autoPacing,
    drainBeforeReset: () => live().drainBeforeReset,
    drainSafetyPercent: () => live().drainSafetyPercent,
    switchAtRemaining: () => live().switchAtRemaining,
    rememberCooldown: (ref, until, families) => store.rememberCooldown(ref, until, families),
    rememberQuarantine: (ref, reason, until, attempts) => store.rememberQuarantine(ref, reason, until, attempts),
    getQuarantine: (ref) => store.getQuarantine(ref),
    probeWarmup: (ref, fn) => store.probeWarmup(ref, fn),
    rememberQuota: (ref, snap) => store.rememberQuota(ref, snap),
    getQuota: (ref) => store.getQuota(ref),
    refreshUsage: (provider) => store.refreshUsage(provider),
    saveBlob: (ref, blob) => store.saveBlob(ref, blob),
    alertThresholds: () => live().alertThresholds,
    webhookUrl: () => live().webhookUrl,
    rememberRequest: (ref) => store.rememberRequest(ref),
    recordSuccess: (ref) => store.recordSuccess(ref),
    recordSwitch: (ref) => store.recordSwitch(ref),
    recordExhaust: (ref) => store.recordExhaust(ref),
    recordBroken: (ref) => store.recordBroken(ref),
    recordHistory,
    fetchImpl: fetch,
    fetchForRef,
    hideDeprecatedModels: () => Boolean(live().hideDeprecatedModels),
    cascadingFallback: (...args) => cascadeFallbackStream(...args),
    ollamaFallback: typeof ollamaFallback === 'function' ? ollamaFallback : async function* ({ err }) { yield { type: 'finish', reason: { kind: 'error', failure: { code: err?.code || 'RATE_LIMIT', message: err?.message || 'all subscription accounts exhausted' } } } },
  })

  async function* cascadeFallbackStream({ options, provider, err, visited = new Set() }) {
    const cfg = live()
    if (!cfg.cascadingFallback) throw err
    const logged = await store.loggedInProviders()
    const loggedList = Array.isArray(logged) ? logged : Object.keys(logged || {}).filter((p) => logged[p])
    const available = loggedList.filter((p) => p !== provider)
    visited.add(provider)
    const nextVendor = resolveFallbackVendor(provider, available, cfg.cascadingChain, visited)
    if (!nextVendor) throw err
    visited.add(nextVendor)
    const targetModel = mapFallbackModel(provider, options && options.model, nextVendor)
    if (logger && logger.warn) {
      logger.warn('[dsh-subscriptions] ' + provider + ': all accounts exhausted, cascading fallback to ' + nextVendor + '/' + targetModel)
    }
    yield* adapter.stream({ ...options, provider: nextVendor, model: targetModel }, visited)
    try {
      recordHistory({
        provider: nextVendor,
        ref: String(nextVendor).toUpperCase() + '_CASCADE_FALLBACK',
        model: targetModel,
        path: '/v1/chat/completions',
        method: 'POST',
        status: 200,
        kind: 'cascade',
      })
    } catch { /* ignore cascade history recording error */ }
  }

  async function syncAdapter() {
    if (adapterDisposed) return
    const desired = await store.loggedInProviders()
    if (adapterDisposed) return
    const globalProviders = ctx.llm && typeof ctx.llm.listProviders === 'function'
      ? ctx.llm.listProviders().map((p) => p.id)
      : []
    const globalSet = new Set(globalProviders)

    const claimable = desired.filter((p) => !globalSet.has(p) || registeredByUs.has(p))
    const skipped = desired.filter((p) => globalSet.has(p) && !registeredByUs.has(p))

    if (skipped.length && logger && logger.info) {
      logger.info(`[dsh-subscriptions] syncAdapter skipping already-bound providers: ${skipped.join(', ')}`)
    }

    if (adapterDisposed) return
    if (!handle && claimable.length) {
      if (ctx.llm && typeof ctx.llm.registerAdapter === 'function') {
        handle = ctx.llm.registerAdapter(claimable, adapter)
        registeredByUs = new Set(claimable)
      }
      return
    }
    if (!handle) {
      registeredByUs.clear()
      return
    }
    if (!claimable.length) {
      disposeAdapterHandle(handle)
      handle = undefined
      registeredByUs.clear()
      return
    }
    if (typeof handle.replace === 'function') {
      try {
        handle.replace(claimable)
        registeredByUs = new Set(claimable)
        return
      } catch (err) {
        if (logger && logger.warn) logger.warn('[dsh-subscriptions] handle.replace failed: ' + (err && err.message || err))
        disposeAdapterHandle(handle)
        handle = undefined
        registeredByUs.clear()
      }
    } else {
      disposeAdapterHandle(handle)
      handle = undefined
      registeredByUs.clear()
    }

    const currentGlobal = new Set((ctx.llm && typeof ctx.llm.listProviders === 'function' ? ctx.llm.listProviders() : []).map((p) => p.id))
    const reClaimable = desired.filter((p) => !currentGlobal.has(p))
    if (reClaimable.length) {
      if (ctx.llm && typeof ctx.llm.registerAdapter === 'function') {
        handle = ctx.llm.registerAdapter(reClaimable, adapter)
        registeredByUs = new Set(reClaimable)
      }
    }
  }

  async function reconcileSlots() {
    const api = getSettingsApi()
    if (!api || typeof api.replace !== 'function') return
    const creds = ctx.credentials
    if (!creds || typeof creds.describe !== 'function') return

    try {
      const existing = normalizeSlots(live().slots)
      const existingRefs = new Set(existing.map((s) => s.ref))
      const candidateProviders = PROVIDERS.filter((p) => isProvider(p))
      const candidates = []
      for (const provider of candidateProviders) {
        for (let index = 1; index <= 10; index++) {
          const ref = oauthRef(provider, index)
          if (!existingRefs.has(ref)) {
            candidates.push({ provider, index, ref })
          }
        }
      }

      const additionResults = await Promise.all(
        candidates.map(async ({ provider, index, ref }) => {
          let d
          try {
            d = await creds.describe(credentialRef(ref))
          } catch (err) {
            if (logger && logger.debug) logger.debug(`[dsh-subscriptions reconcile] describe ${ref} error: ` + (err && err.message || err))
            return null
          }
          if (d && d.configured) {
            let label = d.label || ''
            try {
              const blob = await store.loadBlob(ref).catch(() => null)
              if (blob && (blob.email || blob.label)) {
                label = blob.email || blob.label || label
              }
            } catch (loadErr) {
              if (logger && logger.debug) logger.debug(`[dsh-subscriptions reconcile] loadBlob ${ref} error: ` + (loadErr && loadErr.message || loadErr))
            }
            return { provider, index, label }
          }
          return null
        })
      )
      const additions = additionResults.filter(Boolean)

      if (!additions.length) return
      if (logger && logger.info) {
        logger.info(`[dsh-subscriptions reconcile] restoring orphaned vault slots: ${additions.map((a) => `${a.provider}#${a.index}`).join(', ')}`)
      }
      const currentSlots = Array.isArray(live().slots) ? live().slots : []
      const newSlots = [...currentSlots, ...additions]
      const parsed = plainConfig(Config({ ...live(), slots: stripLegacySlots(newSlots) }))
      await api.replace(parsed)
      syncCustomVendors()
      await syncAdapter()
      refreshModels().catch((err) => {
        if (logger && logger.debug) logger.debug('[dsh-subscriptions reconcile] refreshModels error: ' + (err && err.message || err))
      })
    } catch (e) {
      if (logger && logger.warn) {
        logger.warn('[dsh-subscriptions reconcile] failed: ' + (e && e.message || e))
      }
    }
  }

  let lastModelRefresh = 0
  const providerModelCache = new Map()

  async function refreshModels() {
    if (Date.now() - lastModelRefresh < 60 * 1000) return
    lastModelRefresh = Date.now()
    const providers = await store.loggedInProviders()
    for (const provider of providers) {
      try {
        const slot = normalizeSlots(live().slots).find((x) => x.provider === provider)
        if (!slot) continue
        const blob = await store.loadBlob(slot.ref).catch(() => null)
        if (!blob) continue
        const fresh = await store.ensureFresh(provider, blob, slot.ref)
        const cfg = vendorConfig(provider, live())
        const liveModels = await getVendor(provider).listModels(fresh, cfg, fetch).catch(() => null)
        if (Array.isArray(liveModels) && liveModels.length) {
          providerModelCache.set(provider, liveModels)
        }
      } catch { /* best-effort */ }
    }
  }

  function registerAdapterLifecycle() {
    return ctx.effect(() => {
      syncAdapter().catch((err) => {
        if (logger && logger.debug) logger.debug('[dsh-subscriptions] syncAdapter initial error: ' + (err && err.message || err))
      })
      if (syncOllama) {
        syncOllama().catch((err) => {
          if (logger && logger.debug) logger.debug('[dsh-subscriptions] syncOllama initial error: ' + (err && err.message || err))
        })
      }
      reconcileSlots().catch((err) => {
        if (logger && logger.debug) logger.debug('[dsh-subscriptions] reconcileSlots effect error: ' + (err && err.message || err))
      })

      let retries = 0
      const scheduleRetry = () => {
        if (adapterDisposed || retries >= 30) return
        retryTimer = setTimeout(retrySync, 1000)
        if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref()
      }
      const retrySync = async () => {
        if (adapterDisposed) return
        try {
          const loggedIn = await store.loggedInProviders()
          if (!loggedIn.length) return
          const registered = ctx.llm && typeof ctx.llm.listProviders === 'function'
            ? ctx.llm.listProviders().map((p) => p.id)
            : []
          const regSet = new Set(registered)
          const pending = loggedIn.filter((p) => !regSet.has(p))
          if (pending.length === 0) return
          retries += 1
          await syncAdapter()
          if (retries < 30) {
            scheduleRetry()
          }
        } catch (err) {
          if (logger && logger.debug) logger.debug('[dsh-subscriptions] retrySync error: ' + (err && err.message || err))
          if (retries < 30) {
            scheduleRetry()
          }
        }
      }
      scheduleRetry()

      // #75: eager usage refresh at startup so the windows (5h/7d) land in the blob immediately
      const eager = async () => {
        try {
          const uniqueProviders = new Set(normalizeSlots(live().slots).map((s) => s.provider).filter(Boolean))
          for (const provider of uniqueProviders) {
            store.refreshUsage(provider).catch((err) => {
              if (logger && logger.debug) logger.debug('[dsh-subscriptions] eager usage error: ' + (err && err.message || err))
            })
          }
        } catch (err) {
          if (logger && logger.debug) logger.debug('[dsh-subscriptions] eager refresh error: ' + (err && err.message || err))
        }
      }
      eager()

      return () => {
        adapterDisposed = true
        if (retryTimer) clearTimeout(retryTimer)
        if (handle) {
          disposeAdapterHandle(handle)
          handle = undefined
          registeredByUs.clear()
        }
      }
    }, 'dsh-subscriptions: llm adapter')
  }

  return {
    adapter,
    syncAdapter,
    reconcileSlots,
    refreshModels,
    cascadeFallbackStream,
    registerAdapterLifecycle,
    dispose: () => {
      adapterDisposed = true
      adapter.dispose()
      if (retryTimer) clearTimeout(retryTimer)
      if (handle) {
        disposeAdapterHandle(handle)
        handle = undefined
        registeredByUs.clear()
      }
    },
  }
}
