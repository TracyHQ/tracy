import { exportVault, importVault } from '../vault.js'
import { normalizeSlots, vendorConfig } from '../accounts.js'
import { getVendor } from '../vendors/index.js'
import { notifyQuarantineEntered, notifyQuarantineReleased } from '../alerts.js'
import { Config, plainConfig, publicConfig } from '../config-schema.js'
import { decryptWithPassphrase, encryptWithPassphrase } from '../crypto.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson } from '../http.js'
import { discoverLocalCliSessions, loadLocalCliBlob } from '../import-auth.js'
import { isProvider, oauthRef, parseOauthRef } from '../refs.js'
import { vendorAllowed, vendorNotAllowed } from '../ui-options.js'

export function registerAccountsRoutes(ctx, state) {
  const {
    live,
    accountsView,
    getSettingsApi,
    syncCustomVendors,
    syncAdapter,
    stripLegacySlots,
    store,
    refreshModels,
    refForSlot,
    resetCredits,
  } = state



  // Issue #509: Manual park to quarantine
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/quarantine/park',
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
      const provider = String(payload.provider || '')
      const index = Number(payload.index || 1)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const ref = refForSlot(provider, index)
      if (!ref) {
        writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } })
        return
      }
      const durationMs = Math.min(Math.max(60 * 1000, Number(payload.durationMs) || 3600 * 1000), 48 * 3600 * 1000)
      const reason = String(payload.reason || 'MANUAL_PARK').slice(0, 64)
      const until = Date.now() + durationMs

      store.rememberQuarantine(ref, reason, until, 1)
      notifyQuarantineEntered({ ref, provider, reason, until, webhookUrl: live().webhookUrl })
      await syncAdapter()

      writeJson(res, 200, { ok: true, ref, quarantineUntil: until, quarantineReason: reason, accounts: await accountsView() })
    }),
  }), 'dsh-subscriptions: /quarantine/park')

  // Issue #509: Force probe warmup or release quarantine
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/quarantine/probe',
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
      const provider = String(payload.provider || '')
      const index = Number(payload.index || 1)
      const forceRelease = Boolean(payload.release)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const ref = refForSlot(provider, index)
      if (!ref) {
        writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } })
        return
      }

      if (forceRelease) {
        store.releaseQuarantine(ref)
        notifyQuarantineReleased({ ref, provider, webhookUrl: live().webhookUrl })
        await syncAdapter()
        writeJson(res, 200, { ok: true, success: true, released: true, accounts: await accountsView() })
        return
      }

      const probeFn = async (r) => {
        const blob = await store.loadBlob(r)
        if (!blob) throw new Error('no credentials for slot')
        let vendor = null
        try {
          vendor = getVendor(provider)
        } catch (err) {
          ctx.logger?.debug?.('getVendor(%s) probe failed: %s', provider, err?.message)
        }
        if (vendor && typeof vendor.check === 'function') {
          const cfg = vendorConfig(provider, live())
          const fetchImpl = typeof state.fetchForRef === 'function' ? state.fetchForRef(r) : fetch
          await vendor.check(blob, cfg, fetchImpl)
        }
      }

      const result = await store.probeWarmup(ref, probeFn, true)
      if (result.success) {
        notifyQuarantineReleased({ ref, provider, webhookUrl: live().webhookUrl })
      }
      await syncAdapter()

      writeJson(res, 200, {
        ok: true,
        success: Boolean(result.success),
        error: result.error ? String(result.error.message || result.error).slice(0, 200) : null,
        accounts: await accountsView(),
      })
    }),
  }), 'dsh-subscriptions: /quarantine/probe')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const q = queryOf(req)
      const provider = q.get('provider') || ''
      const index = Number(q.get('index') || '1')
      const ref = refForSlot(provider, index)
      if (!ref) { writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } }); return }
      try {
        writeJson(res, 200, { ok: true, ...(await resetCredits.inspect(ref)) })
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/prepare',
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
      try { payload = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const ref = refForSlot(String(payload.provider || ''), Number(payload.index) || 1)
      if (!ref) { writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } }); return }
      try {
        writeJson(res, 200, { ok: true, ...(await resetCredits.prepare(ref)) })
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits/prepare')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/consume',
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
      try { payload = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      try {
        const result = await resetCredits.consume({ challengeId: payload.challengeId, acknowledged: payload.acknowledged })
        writeJson(res, 200, { ok: true, result })
        refreshModels().catch(() => {})
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits/consume')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/discover-local',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      try {
        const detected = await discoverLocalCliSessions()
        writeJson(res, 200, { ok: true, detected })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /discover-local')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-local',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body
      try {
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
      } catch {
        body = null
      }
      const rawProv = body && body.provider
      const prov = (rawProv === 'claude-cli') ? 'claude' : rawProv
      if (!prov || !isProvider(prov)) {
        writeJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'unknown or missing provider' } })
        return
      }
      if (!vendorAllowed(live(), prov)) {
        writeJson(res, 403, vendorNotAllowed(prov))
        return
      }
      const idxNum = Number(body.index) || 1
      if (!Number.isInteger(idxNum) || idxNum < 1 || idxNum > 99) {
        writeJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'invalid account index' } })
        return
      }
      try {
        const blob = await loadLocalCliBlob(prov)
        const idx = idxNum
        const curSlots = Array.isArray(live().slots) ? live().slots.slice() : []
        const exists = curSlots.some((s) => s && s.provider === prov && Number(s.index) === idx)
        if (!exists && getSettingsApi()) {
          const nextSlots = curSlots.concat([{
            provider: prov,
            index: idx,
            label: blob.email || '',
          }])
          const parsed = plainConfig(Config({ ...live(), slots: stripLegacySlots(nextSlots) }))
          await getSettingsApi().replace(parsed)
          syncCustomVendors()
        }
        const slot = normalizeSlots(live().slots).find((s) => s.provider === prov && s.index === idx)
        const ref = slot ? slot.ref : oauthRef(prov, idx)
        await store.saveBlob(ref, blob)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, {
          ok: true,
          ref,
          provider: prov,
          email: blob.email || '',
          accounts: await accountsView(),
          config: publicConfig(live()),
        })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /import-local')


  // Export of the encrypted token bundle. Tokens are never logged.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/export',
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
      const passphrase = String(payload.passphrase || '').trim()
      if (!passphrase || passphrase.length < 12) {
        writeJson(res, 400, { ok: false, error: { code: 'passphrase', message: 'passphrase must be at least 12 characters' } })
        return
      }
      const algorithm = payload.algorithm === 'scrypt' ? 'scrypt' : (payload.algorithm === 'scrypt-v2' || payload.algorithm === 'scrypt-hardened' ? payload.algorithm : 'pbkdf2')
      try {
        const accounts = []
        for (const slot of normalizeSlots(live().slots)) {
          try {
            const blob = await store.loadBlob(slot.ref)
            accounts.push({ ref: slot.ref, provider: slot.provider, index: slot.index, label: slot.label || blob.label || '', blob })
          } catch { /* skip missing */ }
        }
        if (!accounts.length) {
          writeJson(res, 200, { ok: false, error: { code: 'empty', message: 'no connected accounts' } })
          return
        }
        const bundle = JSON.stringify({ v: 1, exportedAt: Date.now(), accounts })
        const encrypted = encryptWithPassphrase(bundle, passphrase, { algorithm })
        writeJson(res, 200, { ok: true, payload: encrypted, count: accounts.length })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: 'export', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /export')


  // Import of the encrypted bundle.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import',
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
      try { payload = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const { passphrase, payload: encrypted } = payload
      if (!passphrase || !encrypted) {
        writeJson(res, 400, { ok: false, error: { code: 'params', message: 'passphrase and payload are required' } })
        return
      }
      let bundle
      try {
        bundle = JSON.parse(decryptWithPassphrase(encrypted, passphrase))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'decrypt', message: 'wrong passphrase or corrupted bundle' } })
        return
      }
      if (!bundle || !Array.isArray(bundle.accounts)) {
        writeJson(res, 400, { ok: false, error: { code: 'format', message: 'invalid bundle format' } })
        return
      }
      let imported = 0
      for (const row of bundle.accounts) {
        try {
          if (!row || typeof row.ref !== 'string' || !parseOauthRef(row.ref) || !row.blob) continue
          await store.saveBlob(row.ref, row.blob)
          imported++
        } catch { /* skip broken */ }
      }
      await syncAdapter()
      writeJson(res, 200, { ok: true, imported, total: bundle.accounts.length, accounts: await accountsView() })
    }),
  }), 'dsh-subscriptions: /import')


  // #45: import an existing refresh token / API key without an OAuth flow.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-token',
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
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = payload.provider
      const index = Number(payload.index || '1')
      const refreshToken = payload.refreshToken
      const apiKey = payload.apiKey
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      if (!vendorAllowed(live(), provider)) {
        writeJson(res, 403, vendorNotAllowed(provider))
        return
      }
      if (!Number.isInteger(index) || index < 1 || index > 99) {
        writeJson(res, 400, { ok: false, error: { code: 'index', message: 'account index must be an integer between 1 and 99' } })
        return
      }
      if (!refreshToken && !apiKey) {
        writeJson(res, 400, { ok: false, error: { code: 'token', message: 'refreshToken or apiKey is required' } })
        return
      }
      try {
        const ref = oauthRef(provider, index)
        const blob = { accessToken: apiKey || refreshToken, refreshToken: refreshToken || apiKey }
        if (apiKey) { blob.apiKey = apiKey; blob.apiKeyOnly = true }
        await store.saveBlob(ref, blob)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, ref, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'import', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /import-token')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/logout',
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
      try {
        const ref = oauthRef(payload.provider, payload.index)
        await store.clearRef(ref)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, ref, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'logout', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /logout')

  const handleVaultExport = safeJsonHandler(async (req, res) => {
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
    const passphrase = payload.passphrase
    const algorithm = payload.algorithm || 'pbkdf2'
    try {
      const slots = live().slots || []
      const blobs = {}
      for (const slot of normalizeSlots(slots)) {
        try {
          const blob = await store.loadBlob(slot.ref)
          if (blob) blobs[slot.ref] = blob
        } catch { /* ignore */ }
      }
      const result = exportVault({ slots, blobs, algorithm }, passphrase)
      writeJson(res, 200, result)
    } catch (e) {
      writeJson(res, 400, { ok: false, error: { code: 'vault_export', message: String(e && e.message || e) } })
    }
  })

  // #353 & #396: Encrypted Vault export
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/export',
    handler: handleVaultExport,
  }), 'dsh-subscriptions: /vault/export')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/export-backup',
    handler: handleVaultExport,
  }), 'dsh-subscriptions: /export-backup')

  const handleVaultImport = safeJsonHandler(async (req, res) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
      return
    }
    if (!isTrustedSettingsRequest(req, ctx)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
      return
    }
    let payload
    try { payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}') } catch {
      writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
      return
    }
    const { passphrase, vault } = payload
    try {
      const opened = importVault(vault, passphrase)
      // Accounts of vendors outside allowedVendors are skipped whole (slot and blob).
      const allowedRef = (ref) => { const o = parseOauthRef(ref); return !o || vendorAllowed(live(), o.provider) }
      const result = {
        ...opened,
        slots: opened.slots.filter((s) => vendorAllowed(live(), s.provider)),
        blobs: Object.fromEntries(Object.entries(opened.blobs).filter(([ref]) => allowedRef(ref))),
      }
      const skipped = Math.max(opened.slots.length - result.slots.length,
        Object.keys(opened.blobs).length - Object.keys(result.blobs).length)
      const settings = getSettingsApi()
      let parsed
      if (result.slots.length) {
        if (!settings) throw new Error('settings are unavailable for vault import')
        const curSlots = Array.isArray(live().slots) ? live().slots.slice() : []
        for (const s of result.slots) {
          const idx = curSlots.findIndex((c) => c.provider === s.provider && Number(c.index) === Number(s.index))
          if (idx >= 0) {
            curSlots[idx] = { ...curSlots[idx], ...s }
          } else {
            curSlots.push(s)
          }
        }
        parsed = plainConfig(Config({ ...live(), slots: stripLegacySlots(curSlots) }))
      }
      let blobCount = 0
      for (const [ref, blob] of Object.entries(result.blobs)) {
        await store.saveBlob(ref, blob)
        blobCount++
      }
      if (parsed) {
        await settings.replace(parsed)
        syncCustomVendors()
      }
      await syncAdapter()
      refreshModels().catch(() => {})
      writeJson(res, 200, {
        ok: true,
        slotCount: result.slots.length,
        blobCount,
        skipped,
        exportedAt: result.exportedAt,
        accounts: await accountsView(),
      })
    } catch (e) {
      writeJson(res, 400, { ok: false, error: { code: 'vault_import', message: String(e && e.message || e) } })
    }
  })

  // #353 & #396: Encrypted Vault import
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/import',
    handler: handleVaultImport,
  }), 'dsh-subscriptions: /vault/import')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-backup',
    handler: handleVaultImport,
  }), 'dsh-subscriptions: /import-backup')

}
