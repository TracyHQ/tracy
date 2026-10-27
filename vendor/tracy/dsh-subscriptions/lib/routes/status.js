// #374: Sensitive GET routes protected by same-origin check
import { readFileSync } from 'node:fs'
import { getRecentAlerts, clearAlerts } from '../alerts.js'
import { normalizeSlots, vendorConfig } from '../accounts.js'
import { Config, plainConfig, publicConfig, restoreMaskedSecrets } from '../config-schema.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson, fetchWithTimeout, isTimeoutError } from '../http.js'
import { quotaSnapshot } from '../ratelimit.js'
import { PROVIDERS, displayName, droppedCredentialRefs, isProvider, oauthRef } from '../refs.js'
import { getVendor } from '../vendors/index.js'
import { uiOptions, vendorAllowed } from '../ui-options.js'

export function registerStatusRoutes(ctx, state) {
  const {
    accountsView,
    live,
    getSettingsApi,
    describeRow,
    syncCustomVendors,
    syncAdapter,
    stripLegacySlots,
    store,
    history,
    diagnosticsReport,
    pmL = (s) => s,
    pmE = (s) => s,
    fetchForRef,
  } = state

  let currentRevision = 1

  function getCurrentRevision() {
    const row = typeof describeRow === "function" ? describeRow() : null
    if (row && row.revision != null) {
      return row.revision
    }
    return currentRevision
  }

  async function configResponse() {
    return {
      ok: true,
      revision: getCurrentRevision(),
      config: publicConfig(live()),
      accounts: await accountsView(),
      providers: PROVIDERS.filter((id) => vendorAllowed(live(), id)).map((id) => ({ id, name: displayName(id) })),
    }
  }

  let pkgVersion = ''
  try { pkgVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || '' } catch { /* ignore */ }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/health',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      writeJson(res, 200, { ok: true, status: 'healthy', version: pkgVersion || 'unknown' })
    }),
  }), 'dsh-subscriptions: /health')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/config',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method === 'GET') {
        if (!isTrustedSettingsRequest(req, ctx)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
          return
        }
        writeJson(res, 200, await configResponse())
        return
      }
      if (req.method !== 'PUT') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or PUT' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'settings writes are same-origin only' } })
        return
      }
      if (!getSettingsApi()) {
        writeJson(res, 503, { ok: false, error: { code: 'settings', message: 'settings not ready' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      // #379: revision required and CAS conflict detection
      const rawRev = payload?.revision ?? payload?.config?.revision ?? req.headers?.['if-match']
      if (rawRev == null || (typeof rawRev === 'string' && rawRev.trim() === '')) {
        writeJson(res, 428, {
          ok: false,
          error: {
            code: 'precondition_required',
            message: 'revision is required for settings updates',
            currentRevision: getCurrentRevision(),
          },
        })
        return
      }
      const curRev = getCurrentRevision()
      let normalizedRaw = String(rawRev)
      if (normalizedRaw.startsWith('"') && normalizedRaw.endsWith('"')) {
        normalizedRaw = normalizedRaw.slice(1, -1)
      }
      if (curRev != null && String(normalizedRaw) !== String(curRev)) {
        writeJson(res, 409, {
          ok: false,
          error: {
            code: 'conflict',
            message: 'configuration has been modified concurrently',
            currentRevision: curRev,
          },
        })
        return
      }

      if (payload && typeof payload.config === 'object') payload = payload.config
      try {
        payload = restoreMaskedSecrets(payload, live())
        if (Array.isArray(payload.slots)) payload.slots = stripLegacySlots(payload.slots)
        const parsed = plainConfig(Config(payload))
        const dropped = droppedCredentialRefs(live().slots, parsed.slots)
        await getSettingsApi().replace(parsed, curRev)
        currentRevision++
        syncCustomVendors()
        for (const ref of dropped) {
          try { await store.clearRef(ref) } catch { /* best-effort cleanup */ }
        }
        await syncAdapter()
        writeJson(res, 200, await configResponse())
      } catch (e) {
        if (/conflict/i.test(String(e && e.message || ''))) {
          writeJson(res, 409, {
            ok: false,
            error: {
              code: 'conflict',
              message: String(e && e.message || e),
              currentRevision: getCurrentRevision(),
            },
          })
          return
        }
        writeJson(res, 400, { ok: false, error: { code: 'save', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /config')


  // Surface options the web client reads once at start, before it registers its slots.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/ui',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      writeJson(res, 200, { ok: true, ui: uiOptions(live()) })
    }),
  }), 'dsh-subscriptions: /ui')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/status',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method === 'DELETE') {
        if (!isTrustedSettingsRequest(req, ctx)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
          return
        }
        clearAlerts()
        writeJson(res, 200, { ok: true })
        return
      }
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or DELETE only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const logged = await store.loggedInProviders()
      // #66/#67: usagePercent (max across accounts) and expiresAt for the chip.
      const usage = {}
      const expires = {}
      const labels = {}
      for (const slot of normalizeSlots(live().slots)) {
        try {
          const info = await store.describeRef(slot.ref)
          if (info.usagePercent != null) {
            usage[slot.provider] = Math.max(usage[slot.provider] || 0, info.usagePercent)
          }
          // #67: subscription expiry date comes from the slot (entered in settings).
          if (slot.expiresAt) {
            expires[slot.provider] = Math.max(expires[slot.provider] || 0, slot.expiresAt)
            labels[slot.provider] = pmL(slot.label || info.label || slot.provider)
          }
        } catch { /* ignore status inspection error */ }
      }
      // #69/#72: active subscription = last successful request (newest first).
      let active = null
      const last = history.recent(1)
      if (last.length) {
        const lastRow = last[0]
        const accts = await store.listAccounts(lastRow.provider)
        const acct = accts.find((a) => a.ref === lastRow.ref) || accts[0]
        let plan = ''
        let index = acct && acct.ref ? Number(String(acct.ref).split('_').pop()) || null : null
        let status = 'ok'
        let windows = []
        try {
          const info = await store.describeRef(lastRow.ref)
          plan = info.paidTierName || ''
          if (info.validationUrl) status = 'verify'
          else if (info.cooldownUntil && info.cooldownUntil > Date.now()) status = 'cooldown'
          if (Array.isArray(info.usage)) {
            windows = info.usage
              .filter((w) => w && typeof w.usedPercent === 'number')
              .map((w) => ({ id: w.id || w.en || w.ru, label: w.en || w.ru || w.id, usedPercent: w.usedPercent }))
          }
        } catch { /* ignore status inspection error */ }
        active = {
          provider: lastRow.provider,
          index,
          model: lastRow.model || null,
          path: lastRow.path || null,
          plan,
          windows,
          usagePercent: usage[lastRow.provider] != null ? usage[lastRow.provider] : null,
          status,
          at: lastRow.ts,
        }
      }
      writeJson(res, 200, {
        ok: true,
        loggedIn: Object.fromEntries(PROVIDERS.map((id) => [id, logged.includes(id)])),
        usagePercent: usage,
        expiresAt: expires,
        labels,
        expiryNotifyDays: live().expiryNotifyDays,
        fastMode: !!live().codexFastMode,
        composerQuota: String(live().composerQuota || 'off'),
        active,
      })
    }),
  }), 'dsh-subscriptions: /status')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/diagnostics',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      writeJson(res, 200, { ok: true, report: await diagnosticsReport() })
    }),
  }), 'dsh-subscriptions: /diagnostics')


  // ponytail: cheap per-vendor probe; never sets cooldown, never returns tokens
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/check',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = payload.provider || payload.vendor
      const index = payload.index || (payload.accountIndex != null ? payload.accountIndex + 1 : 1)
      if (!isProvider(provider)) {
        writeJson(res, 200, { ok: false, provider, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const t0 = Date.now()
      const ref = oauthRef(provider, index)
      const info = await store.describeRef(ref)
      if (!info.configured) {
        writeJson(res, 200, { ok: false, provider, index: index, ref, error: { code: 'not_connected', message: 'not connected' } })
        return
      }
      let blob
      try { blob = await store.loadBlob(ref) } catch (e) {
        writeJson(res, 200, { ok: false, provider, index: index, ref, error: { code: 'auth', message: String(e && e.message || e) } })
        return
      }
      try { blob = await store.ensureFresh(provider, blob, ref) } catch (e) {
        writeJson(res, 200, {
          ok: false, provider, index: index, ref,
          email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null,
          quota: info.quota || null,
          error: { code: 'refresh', message: String(e && e.message || e) },
        })
        return
      }
      const vendor = getVendor(provider)
      if (typeof vendor.check !== 'function') {
        writeJson(res, 200, { ok: true, provider, index: index, ref, email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null, quota: info.quota || null })
        return
      }
      let capturedQuota = null
      const probeFetch = async (url, init = {}) => {
        const doFetch = (typeof fetchForRef === "function" && fetchForRef(ref)) || fetch
        const res2 = await fetchWithTimeout(doFetch, url, init, { timeoutMs: 15_000 })
        try {
          const snap = quotaSnapshot(provider, res2.headers, null, Date.now())
          if (snap) { capturedQuota = snap; store.rememberQuota(ref, snap) }
        } catch { /* ignore status inspection error */ }
        return res2
      }
      try {
        await vendor.check(blob, vendorConfig(provider, live()), probeFetch)
        const latencyMs = Date.now() - t0;
        writeJson(res, 200, { ok: true, provider, index: index, ref, latencyMs, email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null, quota: capturedQuota || info.quota || null, usagePercent: info.usagePercent ?? null })
      } catch (e) {
        const isTimeout = isTimeoutError(e)
        writeJson(res, 200, {
          ok: false, provider, index: index, ref,
          latencyMs: Date.now() - t0,
          email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null,
          quota: capturedQuota || info.quota || null,
          isTimeout,
          error: { code: isTimeout ? 'TIMEOUT' : (e && e.code ? e.code : 'VENDOR'), message: String(e && e.message || e).slice(0, 300) },
        })
      }
    }),
  }), 'dsh-subscriptions: /check')


  // #50: summary page /subscriptions (localhost-only).
  // #65: request and cost history (JSON).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/history',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const host = (req.headers.host || '').split(':')[0]
      if (host !== 'localhost' && host !== '127.0.0.1') {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'localhost only' } })
        return
      }
      const limit = Math.max(1, Math.min(Number(queryOf(req).get('limit') || '10'), 100))
      writeJson(res, 200, { ok: true, total: history.size(), items: history.recent(limit) })
    }),
  }), 'dsh-subscriptions: /history')

  // Telemetry summary route for UI stat cards (requests, latency, success rate)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/telemetry',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const summary = typeof history.telemetrySummary === 'function'
        ? history.telemetrySummary()
        : { totalRequests: history.size(), requests24h: 0, successRequests: 0, errorRequests: 0, successRate: 100, avgLatencyMs: 0 }
      writeJson(res, 200, { ok: true, telemetry: summary })
    }),
  }), 'dsh-subscriptions: /telemetry')

  // Live smoke ping test for active subscription providers
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/smoke',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload = {}
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore status inspection error */ }

      let provider = payload.provider
      let index = payload.index || 1

      if (!provider) {
        const accounts = await accountsView()
        const connected = accounts.find((a) => a.configured)
        if (connected) {
          provider = connected.provider
          index = connected.index || 1
        }
      }

      if (!provider || !isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'no_connected_accounts', message: 'No connected subscription account found to test' } })
        return
      }

      const ref = oauthRef(provider, index)
      const info = await store.describeRef(ref)
      if (!info.configured) {
        writeJson(res, 400, { ok: false, provider, index, ref, error: { code: 'not_connected', message: 'Account is not connected' } })
        return
      }

      const t0 = Date.now()
      let blob
      try {
        blob = await store.loadBlob(ref)
        blob = await store.ensureFresh(provider, blob, ref)
      } catch (e) {
        const latencyMs = Date.now() - t0
        history.add({ provider, ref, path: "/smoke", status: 401, ms: latencyMs })
        writeJson(res, 502, { ok: false, provider, index, ref, latencyMs, error: { code: 'auth_failed', message: String(e && e.message || e) } })
        return
      }

      const vendor = getVendor(provider)
      if (typeof vendor.check === 'function') {
        let capturedQuota = null
        const probeFetch = async (url, init = {}) => {
          const doFetch = (typeof fetchForRef === "function" && fetchForRef(ref)) || fetch
          const res2 = await fetchWithTimeout(doFetch, url, init, { timeoutMs: 15_000 })
          try {
            const snap = quotaSnapshot(provider, res2.headers, null, Date.now())
            if (snap) { capturedQuota = snap; store.rememberQuota(ref, snap) }
          } catch { /* ignore status inspection error */ }
          return res2
        }
        try {
          await vendor.check(blob, vendorConfig(provider, live()), probeFetch)
          const latencyMs = Date.now() - t0
          history.add({ provider, ref, path: "/smoke", status: 200, ms: latencyMs })
          writeJson(res, 200, {
            ok: true,
            provider,
            index,
            ref,
            latencyMs,
            label: pmL(blob.label),
            email: pmE(blob.email),
            quota: capturedQuota || info.quota || null,
            usagePercent: info.usagePercent ?? null,
          })
          return
        } catch (e) {
          const latencyMs = Date.now() - t0
          history.add({ provider, ref, path: "/smoke", status: 502, ms: latencyMs })
          writeJson(res, 502, {
            ok: false,
            provider,
            index,
            ref,
            latencyMs,
            error: { code: e && e.code ? e.code : 'VENDOR', message: String(e && e.message || e).slice(0, 300) },
          })
          return
        }
      }

      const latencyMs = Date.now() - t0
      history.add({ provider, ref, path: "/smoke", status: 200, ms: latencyMs })
      writeJson(res, 200, {
        ok: true,
        provider,
        index,
        ref,
        latencyMs,
        label: pmL(blob.label),
        email: pmE(blob.email),
        quota: info.quota || null,
      })
    }),
  }), 'dsh-subscriptions: /smoke')

  // #351: Quota and session alerts API
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/alerts',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const limit = Math.max(1, Math.min(Number(queryOf(req).get('limit') || '50'), 100))
      writeJson(res, 200, { ok: true, alerts: getRecentAlerts(limit) })
    }),
  }), 'dsh-subscriptions: /alerts')

}
