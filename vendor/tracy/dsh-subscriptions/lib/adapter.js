import { fetchWithTimeout } from "./http.js"
import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { displayName } from './refs.js'
import { getVendor } from './vendors/index.js'
import { modelCatalog } from './messages.js'
import { streamWithRotation } from './stream-rotate.js'
import { checkQuotaThresholds } from './alerts.js'
import { pickFetch } from './proxy.js'
import { quotaSnapshot, parseBody } from './ratelimit.js'
import { toTokenUsage } from './wire.js'
import { isSwitchableError } from './rotate.js'

// #94: heuristic for test/preview/beta/legacy model ids.
function isDeprecatedId(id) {
  return /(^|[-_:])(test|preview|dev|alpha|beta|snapshot|experimental|legacy|deprecated)([-_:]|$)/i.test(id)
}

function asLlmError(err) {
  if (err instanceof LlmError) return err
  const code = (err && err.code) || 'VENDOR'
  const message = String((err && err.message) || err || 'vendor error')
  try {
    const out = new LlmError(message, code)
    if (err && err.validationUrl) out.validationUrl = err.validationUrl
    return out
  } catch {
    return err
  }
}

export class SubscriptionAdapter extends LlmAdapter {
  constructor(deps) {
    super()
    this.deps = deps
    this.disposed = false
  }

  dispose() {
    this.disposed = true
  }

  providerInfo(provider) {
    return { id: provider, name: displayName(provider) }
  }

  providerRetryPolicy() {
    return undefined
  }

  async listModels(provider) {
    const accounts = await this.deps.listAccounts(provider)
    const targetAccount = accounts.find((a) => a.hasToken)
    let models = null
    if (targetAccount) {
      const cfg = this.deps.vendorConfig(provider)
      const baseFetch = pickFetch(this.deps, targetAccount.ref)
      const listModelsFetch = (url, init, opts) =>
        fetchWithTimeout(baseFetch, url, init, { timeoutMs: 15000, ...(opts || {}) })
      try {
        const blob = await this.deps.ensureFresh(
          provider,
          await this.deps.loadBlob(targetAccount.ref),
          targetAccount.ref,
        )
        const live = await getVendor(provider).listModels(blob, cfg, listModelsFetch)
        if (Array.isArray(live) && live.length) models = live
      } catch { /* use built-in catalog */ }
    }
    if (!models) {
      const cfg = this.deps.vendorConfig(provider)
      models = modelCatalog(provider, cfg ? cfg.models : undefined)
    }
    // #94: optionally hide test/preview/beta/legacy ids from the picker.
    if (typeof this.deps.hideDeprecatedModels === 'function' && this.deps.hideDeprecatedModels()) {
      models = models.filter((m) => !isDeprecatedId(String((m && m.id) || '')))
    }
    // Defensive: ensure every model has the provider field set
    models = models.map((m) => (m ? { ...m, provider: (!m.provider || m.provider === "custom") ? provider : m.provider } : m))
    return models
  }

  imageRequestPricing() {
    return undefined
  }

  async resolveModel(provider, model) {
    const rows = await this.listModels(provider)
    const found = rows.find((row) => row && row.id === model)
    if (found) {
      return {
        provider,
        id: model,
        name: found.name || model,
        ...(found.description ? { description: found.description } : {}),
        ...(found.inputModalities ? { inputModalities: found.inputModalities } : {}),
        ...(found.contextWindow ? { context: { contextWindow: found.contextWindow } } : {}),
        ...(found.reasoning ? { reasoning: found.reasoning } : {}),
      }
    }
    return { provider, id: model, name: model }
  }

  async prepareCall(provider, model, signal) {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: (options) => this.stream(options),
    }
  }

  async *stream(options, visited = new Set()) {
    const provider = options.provider
    const deps = this.deps
    let yieldedAny = false
    try {
      if (typeof deps.refreshUsage === 'function') {
        try {
          const p = deps.refreshUsage(provider)
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch { /* fire-and-forget background usage refresh */ }
      }
      const effectiveAutoPacing = options.autoPacing !== undefined
        ? options.autoPacing
        : (typeof deps.autoPacing === 'function' ? deps.autoPacing() : (deps.autoPacing ?? true))
      const effectiveDrainBeforeReset = options.drainBeforeReset !== undefined
        ? options.drainBeforeReset
        : (typeof deps.drainBeforeReset === 'function' ? deps.drainBeforeReset() : (deps.drainBeforeReset ?? false))
      const effectiveDrainSafetyPercent = options.drainSafetyPercent !== undefined
        ? options.drainSafetyPercent
        : (typeof deps.drainSafetyPercent === 'function' ? deps.drainSafetyPercent() : (deps.drainSafetyPercent ?? 5))
      const streamOptions = {
        ...options,
        autoPacing: effectiveAutoPacing,
        drainBeforeReset: effectiveDrainBeforeReset,
        drainSafetyPercent: effectiveDrainSafetyPercent,
      }
      for await (const event of streamWithRotation({
        accounts: await deps.listAccounts(provider),
        nowMs: () => Date.now(),
        cooldownMs: deps.cooldownMs(),
        switchAtRemaining: typeof deps.switchAtRemaining === 'function' ? deps.switchAtRemaining() : (deps.switchAtRemaining ?? 0),
        options: streamOptions,
        webhookUrl: typeof deps.webhookUrl === 'function' ? deps.webhookUrl() : deps.webhookUrl,
        fetchImpl: deps.fetchImpl || fetch,
        onCooldown: (account) => {
          if (typeof deps.rememberCooldown === 'function') deps.rememberCooldown(account.ref, account.cooldownUntil, account.cooldownFamilies || null)
          if (typeof deps.rememberQuarantine === 'function') {
            const currentQ = typeof deps.getQuarantine === 'function' ? deps.getQuarantine(account.ref) : null
            if (currentQ && currentQ.attempts && currentQ.attempts > 1) {
              deps.rememberQuarantine(account.ref, currentQ.reason, currentQ.until, currentQ.attempts)
            } else {
              deps.rememberQuarantine(account.ref, account.quarantineReason || 'RATE_LIMIT', account.quarantineUntil || account.cooldownUntil, account.quarantineAttempts || 1)
            }
          }
          if (typeof deps.recordSwitch === 'function') deps.recordSwitch(account.ref)
        },
        streamOnce: async function* (account, opts) {
          const t0 = Date.now()
          let firstChunkTime = null
          let outputTokens = 0
          let inputTokens = 0
          let reasoningTokens = 0
          let cacheReadTokens = 0
          let cacheWriteTokens = 0
          let approxChars = 0
          let completed = false
          let sawFinish = false
          let finishReason = null
          let errorCaught = null
          let finalized = false
          let blob = null

          const finalizeOnce = (outcome, extraStatus) => {
            if (finalized) return
            finalized = true

            if (!outputTokens && approxChars > 0) {
              outputTokens = Math.max(1, Math.round(approxChars / 4))
            }

            const totalMs = Date.now() - t0
            const ttftMs = firstChunkTime !== null ? Math.max(0, firstChunkTime - t0) : null
            const genMs = (firstChunkTime !== null && totalMs > ttftMs) ? (totalMs - ttftMs) : 0
            const tps = (outputTokens > 0 && genMs > 0)
              ? Math.round((outputTokens / (genMs / 1000)) * 10) / 10
              : null

            let status = 200
            if (outcome === 'error') {
              status = extraStatus || (errorCaught && (errorCaught.status || errorCaught.statusCode)) || (errorCaught && errorCaught.code === 'QUOTA' ? 429 : 500)
            } else if (outcome === 'cancel') {
              status = 499
            } else if (outcome === 'runaway') {
              status = 200
            }

            if (outcome === 'success') {
              if (typeof deps.recordSuccess === 'function') deps.recordSuccess(account.ref)
            }

            if (typeof deps.recordHistory === 'function') {
              try {
                deps.recordHistory({
                  provider,
                  ref: account.ref,
                  model: (opts && opts.model) || null,
                  path: '/responses',
                  method: 'POST',
                  status,
                  outcome,
                  ms: totalMs,
                  ttftMs,
                  tps,
                  inputTokens: inputTokens || undefined,
                  outputTokens: outputTokens || undefined,
                  reasoningTokens: reasoningTokens || undefined,
                  cacheReadTokens: cacheReadTokens || undefined,
                  cacheWriteTokens: cacheWriteTokens || undefined,
                  kind: 'stream',
                  ...(outcome === 'error' && errorCaught ? { error: errorCaught.message || String(errorCaught) } : {}),
                  ...(outcome === 'runaway' ? { reason: finishReason || (opts && opts._runawayState && opts._runawayState.reason) || 'runaway_loop_detected' } : {}),
                })
              } catch { /* ignore quota capture failure */ }
            }
          }

          const vendor = getVendor(provider)
          // ponytail: capture x-ratelimit headers without touching vendors
          const baseFetch = pickFetch(deps, account.ref)
          const quotaFetch = async (url, init) => {
            const res = await fetchWithTimeout(baseFetch, url, init, { timeoutMs: 60000, stream: true })
            try {
              const snap = quotaSnapshot(provider, res.headers, null, Date.now())
              if (snap && typeof deps.rememberQuota === "function") {
                deps.rememberQuota(account.ref, snap)
                if (snap.usedPercent != null) {
                  const th = typeof deps.alertThresholds === 'function' ? deps.alertThresholds() : deps.alertThresholds
                  const wh = typeof deps.webhookUrl === 'function' ? deps.webhookUrl() : deps.webhookUrl
                  checkQuotaThresholds({
                    ref: account.ref,
                    provider,
                    usedPercent: snap.usedPercent,
                    thresholds: th,
                    webhookUrl: wh,
                    fetchImpl: deps.fetchImpl || fetch,
                  })
                }
              }
            } catch { /* ignore quota capture failure */ }
            if (!res.ok && res.clone) {
              try {
                const textPromise = res.clone().text()
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
                const txt = await Promise.race([textPromise, timeoutPromise])
                let j=null; try { j = JSON.parse(txt) } catch { j = null }
                if (j) {
                  const b = parseBody(provider, j, Date.now())
                  if (b) {
                    const snap2 = quotaSnapshot(provider, res.headers, j, Date.now())
                    if (snap2) {
                      deps.rememberQuota(account.ref, snap2)
                      if (snap2.usedPercent != null) {
                        const th = typeof deps.alertThresholds === 'function' ? deps.alertThresholds() : deps.alertThresholds
                        const wh = typeof deps.webhookUrl === 'function' ? deps.webhookUrl() : deps.webhookUrl
                        checkQuotaThresholds({
                          ref: account.ref,
                          provider,
                          usedPercent: snap2.usedPercent,
                          thresholds: th,
                          webhookUrl: wh,
                          fetchImpl: deps.fetchImpl || fetch,
                        })
                      }
                    }
                  }
                }
              } catch { /* ignore quota capture failure */ }
            }
            return res
          }

          try {
            // Warmup probe check for accounts returning from quarantine (#350)
            if (typeof deps.probeWarmup === "function") {
              const qUntil = Number(account.quarantineUntil || 0)
              if (qUntil > 0 && qUntil <= Date.now()) {
                const probeFetch = typeof deps.fetchForRef === 'function'
                  ? deps.fetchForRef(account.ref)
                  : (typeof deps.fetchFor === 'function' ? deps.fetchFor(account.ref) : (deps.fetchImpl || fetch))
                const probeCfg = typeof deps.vendorConfig === 'function' ? (deps.vendorConfig(provider) || {}) : {}
                const probeResult = await deps.probeWarmup(account.ref, async () => {
                  if (vendor && typeof vendor.check === "function") {
                    const probeBlob = await deps.ensureFresh(provider, await deps.loadBlob(account.ref), account.ref)
                    await vendor.check(probeBlob, probeCfg, probeFetch)
                  }
                })
                if (probeResult && !probeResult.success) {
                  const err = probeResult.error || new Error("warmup probe failed")
                  err.code = "QUOTA"
                  err.isWarmupProbeFailure = true
                  err.warmupAccount = probeResult.account
                  throw err
                }
              }
            }

            blob = await deps.ensureFresh(provider, await deps.loadBlob(account.ref), account.ref)
            if (typeof deps.rememberRequest === 'function') deps.rememberRequest(account.ref)
            for await (const chunk of vendor.streamOnce({
              blob,
              options: opts,
              fetchImpl: quotaFetch,
              headers: attributionHeaders(),
              config: deps.vendorConfig(provider),
              signal: opts.signal,
              saveBlob: (next) => deps.saveBlob(account.ref, next),
            })) {
              if (firstChunkTime === null) {
                firstChunkTime = Date.now()
              }
              if (chunk && typeof chunk === 'object') {
                if (chunk.type === 'finish') {
                  sawFinish = true
                  finishReason = chunk.reason
                } else if (chunk.type === 'usage' && chunk.usage) {
                  const u = toTokenUsage(chunk.usage)
                  if (u && typeof u.outputTokens === 'number' && u.outputTokens > 0) {
                    outputTokens = u.outputTokens
                  }
                  if (u && typeof u.inputTokens === 'number') {
                    inputTokens = u.inputTokens
                  }
                  if (u && typeof u.reasoningTokens === 'number') {
                    reasoningTokens = u.reasoningTokens
                  }
                  if (u && typeof u.cacheReadTokens === 'number') {
                    cacheReadTokens = u.cacheReadTokens
                  }
                  if (u && typeof u.cacheWriteTokens === 'number') {
                    cacheWriteTokens = u.cacheWriteTokens
                  }
                } else if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                  approxChars += chunk.text.length
                }
              }
              yield chunk
            }
            completed = true
          } catch (err) {
            errorCaught = err
            if (err && (err.code === 'QUOTA' || err.code === 'QUOTA_EXCEEDED' || err.status === 429)) {
              if (typeof deps.recordExhaust === 'function') deps.recordExhaust(account.ref)
            } else if (err && (err.status === 401 || err.status === 403 || err.code === 'TOKEN_REVOKED' || err.code === 'BROKEN')) {
              if (typeof deps.recordBroken === 'function') deps.recordBroken(account.ref)
            }
            if (err && err.code === 'VALIDATION_REQUIRED' && err.validationUrl && blob) {
              await deps.saveBlob(account.ref, {
                ...blob,
                validationUrl: err.validationUrl,
                validationMessage: String(err.message || ''),
              })
            }
            throw err
          } finally {
            const isFinishError = finishReason && (
              finishReason.kind === 'error' ||
              finishReason === 'error' ||
              (typeof finishReason === 'object' && Boolean(finishReason.failure))
            )
            if (errorCaught || isFinishError) {
              if (!errorCaught && isFinishError) {
                errorCaught = new Error(
                  typeof finishReason === 'object' && finishReason.failure
                    ? (finishReason.failure.message || finishReason.failure.code || 'stream finished with error')
                    : 'stream finished with error'
                )
              }
              finalizeOnce('error')
            } else if (opts && opts._runawayState && opts._runawayState.tripped) {
              finalizeOnce('runaway')
            } else if (completed || sawFinish) {
              finalizeOnce('success')
            } else if (opts && opts.signal && opts.signal.aborted) {
              finalizeOnce('cancel', 499)
            } else {
              finalizeOnce('cancel', 499)
            }
          }
        },
      })) {
        if (event && event.type === 'usage') {
          const safeUsage = toTokenUsage(event.usage)
          if (!safeUsage) continue
          yieldedAny = true
          yield { ...event, usage: safeUsage }
          continue
        }
        yieldedAny = true
        yield event
      }
      return
    } catch (err) {
      // #349 & #361: opt-in cascading cross-vendor fallback with abort and cycle checks
      if (!yieldedAny && !options.signal?.aborted && isSwitchableError(err) && typeof deps.cascadingFallback === 'function') {
        try {
          for await (const event of deps.cascadingFallback({ options, provider, err, visited })) {
            yieldedAny = true
            yield event
          }
          return
        } catch (cascadeErr) {
          err = cascadeErr
        }
      }
      // #91: when the whole pool is exhausted and nothing has been streamed
      // yet, continue seamlessly on local Ollama instead of failing the chat.
      if (!yieldedAny && !options.signal?.aborted && typeof deps.ollamaFallback === 'function') {
        yield* deps.ollamaFallback({ options, provider, err })
        return
      }
      throw asLlmError(err)
    }
  }
}