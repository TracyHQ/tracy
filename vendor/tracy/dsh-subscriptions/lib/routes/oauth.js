import { normalizeSlots, vendorConfig } from '../accounts.js'
import { escapeHtml, isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeHtml, writeJson } from '../http.js'
import { startLoopback } from '../loopback.js'
import { parseCallbackInput, requestOrigin } from '../oauth.js'
import { createPkce } from '../pkce.js'
import { displayName, isProvider, oauthRef } from '../refs.js'
import { getVendor } from '../vendors/index.js'
import { vendorAllowed, vendorNotAllowed } from '../ui-options.js'

export function registerOauthRoutes(ctx, state) {
  const {
    live,
    accountsView,
    syncAdapter,
    store,
    redirectFor,
    OK_HTML,
    refreshModels,
    pending,
    completeOAuth,
    fetchForRef,
    sweepPending,
    pmL,
  } = state


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/start',
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
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      if (!vendorAllowed(live(), provider)) {
        writeJson(res, 403, vendorNotAllowed(provider))
        return
      }
      const origin = requestOrigin(req)
      const redirectUri = redirectFor(provider, `${provider}:${index}`, origin)
      const pkce = await createPkce()
      pending.set(pkce.state, {
        provider,
        index,
        verifier: pkce.verifier,
        challenge: pkce.challenge,
        state: pkce.state,
        redirectUri,
        createdAt: Date.now(),
      })
      const cfg = { ...vendorConfig(provider, live()), redirectUri }
      let url
      try {
        url = getVendor(provider).authorizeUrl(cfg, pkce)
      } catch (err) {
        pending.delete(pkce.state)
        writeJson(res, 400, {
          ok: false,
          error: {
            code: 'missing_client_id',
            message: err.message || 'OAuth authorization configuration error',
          },
        })
        return
      }
      // #89: if redirect_uri is loopback - start a temporary catch server.
      let autoCatch = false
      if (live().autoLoopback) {
        try {
          const cb = new URL(redirectUri)
          if (cb.hostname === 'localhost' || cb.hostname === '127.0.0.1') {
            autoCatch = true
            startLoopback({
              redirectUri,
              onCode: async (params) => {
                const code = params.get('code') || ''
                const state = params.get('state') || ''
                if (!code) throw new Error('no code')
                await completeOAuth({ provider, index, code, state })
                return OK_HTML
              },
            }).catch(() => {})
          }
        } catch { autoCatch = false }
      }
      writeJson(res, 200, { ok: true, url, state: pkce.state, redirectUri, autoCatch })
    }),
  }), 'dsh-subscriptions: /oauth/start')


  // #90: Device-code login (headless/VPS). Codex-only: auth.openai.com mints an
  // authorization_code + code_verifier server-side; we finish with the normal
  // PKCE exchange using the device redirect URI. Device code stays server-side
  // in the pending map (same lifetime as PKCE pending rows).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/device/start',
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
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = String(body.provider || '')
      const index = Number(body.index || 1)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      if (!vendorAllowed(live(), provider)) {
        writeJson(res, 403, vendorNotAllowed(provider))
        return
      }
      const vendor = getVendor(provider)
      if (typeof vendor.deviceStart !== 'function') {
        writeJson(res, 400, { ok: false, error: { code: 'device', message: 'device login not supported for ' + provider } })
        return
      }
      try {
        const cfg = vendorConfig(provider, live())
        const start = await vendor.deviceStart(cfg, (fetchForRef(oauthRef(provider, index)) || fetch))
        const state = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
        sweepPending(Date.now())
        pending.set(state, {
          kind: 'device',
          provider,
          index,
          ref: oauthRef(provider, index),
          deviceAuthId: start.deviceAuthId,
          userCode: start.userCode,
          intervalMs: start.intervalMs,
          createdAt: Date.now(),
        })
        writeJson(res, 200, { ok: true, state, userCode: start.userCode, authUrl: start.authUrl, intervalMs: start.intervalMs })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: e && e.code || 'DEVICE', message: String(e && e.message || e).slice(0, 300) } })
      }
    }),
  }), 'dsh-subscriptions: /oauth/device/start')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/device/poll',
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
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const state = String(body.state || '')
      sweepPending(Date.now())
      const row = pending.get(state)
      if (!row || row.kind !== 'device') {
        writeJson(res, 404, { ok: false, error: { code: 'expired', message: 'device login session expired; start again' } })
        return
      }
      if (!vendorAllowed(live(), row.provider)) {
        pending.delete(state)
        writeJson(res, 403, vendorNotAllowed(row.provider))
        return
      }
      const vendor = getVendor(row.provider)
      try {
        const cfg = vendorConfig(row.provider, live())
        const out = await vendor.devicePoll(cfg, { deviceAuthId: row.deviceAuthId, userCode: row.userCode }, (fetchForRef(row.ref) || fetch))
        if (out.status !== 'authorized') {
          writeJson(res, 200, { ok: true, status: out.status })
          return
        }
        const slots = normalizeSlots(live().slots)
        const slot = slots.find((s) => s.ref === row.ref)
        const blob = out.blob
        if (slot && slot.label) blob.label = slot.label
        await store.saveBlob(row.ref, blob)
        pending.delete(state)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, status: 'authorized', ref: row.ref, label: pmL(blob.label || blob.email) || displayName(row.provider) })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: e && e.code || 'DEVICE', message: String(e && e.message || e).slice(0, 300) } })
      }
    }),
  }), 'dsh-subscriptions: /oauth/device/poll')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/callback',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const q = queryOf(req)
      const code = q.get('code') || ''
      const state = q.get('state') || ''
      const row = pending.get(state)
      if (!code || !row) {
        writeHtml(res, 400, '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Login session missing. Return to Settings and paste the redirected URL.</p>')
        return
      }
      try {
        await completeOAuth({ provider: row.provider, index: row.index, code, state })
        writeHtml(res, 200, '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>')
      } catch (e) {
        writeHtml(res, 400, `<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>${escapeHtml(String(e && e.message || e))}</p>`)
      }
    },
  }), 'dsh-subscriptions: /oauth/callback')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/complete',
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
      try { payload = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const parsed = parseCallbackInput(payload.url || payload.code || '')
      const provider = payload.provider
      const index = payload.index
      const code = parsed.code
      const state = parsed.state || payload.state || ''
      if (!code) {
        writeJson(res, 400, { ok: false, error: { code: 'code', message: 'paste the redirected URL or the code' } })
        return
      }
      try {
        const result = await completeOAuth({ provider, index, code, state })
        writeJson(res, 200, { ok: true, ...result, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'oauth', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /oauth/complete')
}
