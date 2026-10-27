import { publicConfig } from './config-schema.js'
import { PROVIDERS, displayName } from './refs.js'
import { vendorAllowed } from './ui-options.js'
import { escapeHtml, isLoopback, writeHtml, writeJson } from './http.js'
import { registerStatusRoutes } from './routes/status.js'
import { registerOauthRoutes } from './routes/oauth.js'
import { registerAccountsRoutes } from './routes/accounts.js'
import { registerProxyRoutes } from './routes/proxy.js'
import { registerPluginUpdater } from './updater.js'

export function registerRoutes(ctx, state) {
  const {
    accountsView,
    live,
  } = state

  async function configResponse() {
    return {
      ok: true,
      config: publicConfig(live()),
      accounts: await accountsView(),
      providers: PROVIDERS.filter((id) => vendorAllowed(live(), id)).map((id) => ({ id, name: displayName(id) })),
    }
  }

  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/dsh-subscriptions/update',
    aliases: [
      '/api/@goodandready/dsh-subscriptions/update',
      '/api/dsh-subscriptions/update',
    ],
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
  }), 'dsh-subscriptions: /update')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/subscriptions',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const host = (req.headers.host || '').split(':')[0]
      const remote = req.socket?.remoteAddress
      if (!isLoopback(host) || (remote && !isLoopback(remote))) {
        writeHtml(res, 403, '<!doctype html><meta charset="utf-8"><p>Subscriptions overview is localhost-only.</p>')
        return
      }
      let cfg, accounts
      try {
        const out = await configResponse()
        cfg = out.config
        accounts = out.accounts || []
      } catch (e) {
        writeHtml(res, 500, '<!doctype html><meta charset="utf-8"><p>Failed to load: ' + escapeHtml(String(e && e.message || e)) + '</p>')
        return
      }
      const rows = accounts.map((a) => {
        const pct = a.usagePercent != null ? a.usagePercent : (a.quota && a.quota.usedPercent) || null
        const rem = a.quota && a.quota.remaining != null ? a.quota.remaining : null
        const lim = a.quota && a.quota.limit != null ? a.quota.limit : null
        const reset = a.quota && a.quota.resetAt ? new Date(a.quota.resetAt).toLocaleString() : ''
        const status = a.validationUrl ? 'verify' : (a.cooldownUntil && a.cooldownUntil > Date.now() ? 'cooldown' : (a.configured ? 'ok' : 'none'))
        return '<tr><td>' + escapeHtml(a.provider) + '</td><td>' + (a.index||1) + '</td>' +
          '<td>' + escapeHtml(a.label || a.email || '') + '</td><td>' + status + '</td>' +
          '<td>' + (pct != null ? Math.round(pct) + '%' : '—') + '</td>' +
          '<td>' + (rem != null ? (rem + (lim != null ? '/' + lim : '')) : '—') + '</td>' +
          '<td>' + escapeHtml(reset) + '</td><td>' + escapeHtml(a.refreshError || '') + '</td></tr>'
      })
      const body = rows.length
        ? '<div class="grid">' + rows.join('') + '</div>'
        : '<p class="empty">No accounts connected yet.</p>'
      const slots = cfg.slots || []
      const connected = accounts.filter((a) => a.configured).length
      writeHtml(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscriptions</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0d1117;color:#e6edf3}
h1{font-size:20px} .dim{color:#8b949e;font-size:13px}
.stats{display:flex;gap:24px;margin:16px 0;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{border:1px solid #30363d;border-radius:10px;padding:14px;background:#161b22}
.card b{display:block;margin-bottom:4px}
.status{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid #30363d}
.status.ok{color:#3fb950;border-color:#238636} .status.none{color:#8b949e}
.status.cooldown{color:#d29922;border-color:#9e6a03} .status.verify{color:#d29922;border-color:#9e6a03}
.meta{color:#8b949e;font-size:12px}
</style></head><body>
<h1>Subscriptions</h1>
<div class="dim">/subscriptions — localhost only</div>
<div class="stats"><span><b>${connected}</b> connected</span><span><b>${accounts.length}</b> accounts</span><span><b>${slots.length}</b> slots</span></div>
${body}
<h2>History</h2>
<div class="dim">last 10 · <a href="/dsh-subscriptions/history?limit=100">show 100</a></div>
<div class="hist" id="hist"></div>
<script>
fetch('/dsh-subscriptions/history?limit=10').then(r=>r.json()).then(d=>{
  const el=document.getElementById('hist')
  if(!d||!d.items||!d.items.length){el.textContent='No requests yet.';return}
  el.innerHTML='<table class="grid"><tr><th>time</th><th>provider</th><th>model</th><th>path</th><th>status</th></tr>'+
    d.items.map(i=>'<tr><td>'+new Date(i.ts).toLocaleString()+'</td><td>'+esc(i.provider)+'</td><td>'+esc(i.model||'')+'</td><td>'+esc(i.path)+'</td><td>'+i.status+'</td></tr>').join('')+'</table>'
}).catch(()=>{})
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script>
</body></html>`)
    },
  }), 'dsh-subscriptions: /subscriptions')

  registerStatusRoutes(ctx, state)
  registerOauthRoutes(ctx, state)
  registerAccountsRoutes(ctx, state)
  registerProxyRoutes(ctx, state)
}
