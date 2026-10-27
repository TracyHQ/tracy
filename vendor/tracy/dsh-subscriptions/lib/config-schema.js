import z from '@deepseek-ai/schemastery'
import { PROVIDERS } from './refs.js'

// Defensive polyfill for environments / runners with schemastery < 3.18.4
const proto = z?.Schema?.prototype || (typeof z?.number === "function" ? Object.getPrototypeOf(z.number()) : null)
if (proto && typeof proto.volatile !== "function") {
  proto.volatile = function volatile() {
    return typeof this.extra === "function" ? this.extra("volatile", true) : this
  }
}

export const Slot = z.object({
  provider: z.string().default('codex')
    .description('One of: codex, claude, grok, antigravity.'),
  index: z.number().default(1)
    .description('Account slot number. Credential ref is <PROVIDER>_OAUTH_<index>.'),
  label: z.string().default('')
    .description('Optional display label. Empty uses the account email after login.'),
  expiresAt: z.number().default(0)
    .description('#67 Optional subscription expiry timestamp (ms). When set and within expiryNotifyDays, the header chip shows the account and expiry date.'),
  proxyUrl: z.string().default('')
    .description('#88 Per-account proxy URL (http://, https://, socks5://). All requests for this account route through it. Empty = direct connection.'),
})

export const defaultSlots = PROVIDERS.map((provider) => ({ provider, index: 1, label: '' }))

// Unwrap Volatile boxes before any caller reads a value. A volatile field holds a box
// rather than its value, and the Loader mutates those boxes in place.
export function plainConfig(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(plainConfig)
  if (typeof value.get === 'function') return plainConfig(value.get())
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainConfig(v)]))
}

export const Config = z.object({
  cooldownMs: z.number().volatile().default(30 * 60 * 1000)
    .description('After RATE_LIMIT/QUOTA/429, skip that account for this many milliseconds.'),
  switchAtRemaining: z.number().volatile().default(0.01)
    .description('If remaining <= this (absolute or <1 fraction), treat as exhausted before request. 0 disables.'),
  refreshAheadMs: z.number().volatile().default(5 * 60 * 1000)
    .description('Background refresh when expiry within this many ms.'),
  refreshRetryMs: z.number().volatile().default(10 * 60 * 1000)
    .description('Do not retry background refresh more often than this after failure.'),
  probeIntervalMin: z.number().volatile().default(15)
    .description('Background health-check interval in minutes. 0 disables.'),
  notifyLimits: z.boolean().volatile().default(true)
    .description('Emit log notices when usage crosses 70/90/100% of a window.'),
  expiryNotifyDays: z.number().volatile().default(7)
    .description('#67 Warn in the header chip this many days before a subscription expiry (expiresAt). 0 disables.'),
  privacyMask: z.boolean().volatile().default(false)
    .description('#98 Hide personal data in the UI: emails show as j***n@example.com.'),
  slots: z.array(Slot).volatile().default(defaultSlots)
    .description('Account slots. Secrets are not stored here; only the credential ref names.'),
  useWebCallback: z.boolean().volatile().default(false)
    .description('When on, redirect_uri is this Web UI origin + /dsh-subscriptions/oauth/callback. When off, the vendor CLI registered redirect is used and you paste the redirected URL.'),
  autoLoopback: z.boolean().volatile().default(true)
    .description('#89 When on and the vendor redirect_uri is a loopback address (codex :1455, grok :56121), a temporary local server catches the OAuth callback automatically - no paste needed. Paste fallback stays available.'),
  ollamaBaseUrl: z.string().volatile().default('http://127.0.0.1:11434')
    .description('#91 Local Ollama base URL. Served as the ollama provider in the native model picker when reachable.'),
  ollamaFallback: z.boolean().volatile().default(true)
    .description('#91 When every account of a provider is exhausted, continue the chat on local Ollama instead of failing.'),
  ollamaFallbackModel: z.string().volatile().default('')
    .description('#91 Ollama model used for the fallback (for example qwen2.5-coder). Empty = first model from /api/tags.'),
  hideDeprecatedModels: z.boolean().volatile().default(false)
    .description('#94 Hide test/preview/beta/legacy model ids from the native model picker.'),
  codexClientId: z.string().volatile().default(''),
  codexVerbosity: z.string().volatile().default('')
    .description('#93 Response verbosity for Codex reasoning models: low, medium or high. Empty = protocol default.'),
  codexFastMode: z.boolean().volatile().default(false)
    .description('#92 Fast Mode for Codex: sends service_tier priority (1.5x speed billing tier) with every request.'),
  composerQuota: z.string().volatile().default('off')
    .description('#84 Composer quota indicator mode: off, percent, bar or forecast (predictive runway from a sliding window).'),
  cardPlacement: z.union(['plugins', 'settings', 'both', 'none']).volatile().default('plugins')
    .description('Where the settings card is registered: plugins (Plugins page, default), settings (its own entry in the Settings dialog), both, or none (the host draws its own surface over the same routes).'),
  headerPill: z.boolean().volatile().default(true)
    .description('Show the subscriptions pill in the chat header. Off also hides the alert toasts, which render inside the pill. Takes effect on page reload.'),
  slashCommands: z.boolean().volatile().default(true)
    .description('Register the /login and /logout composer commands. Takes effect on page reload.'),
  allowedVendors: z.array(z.string()).volatile().default([])
    .description('Vendor ids a user may connect (for example ["claude", "codex"]). Empty allows every vendor. The host refuses OAuth, imports and new credentials for any other vendor; accounts stored earlier keep working until logout.'),
  codexRedirectUri: z.string().volatile().default(''),
  codexBaseUrl: z.string().volatile().default(''),
  codexClientVersion: z.string().volatile().default('')
    .description('Codex CLI identity version for /models catalog gating (e.g. 0.160.0). Empty uses the built-in default.'),
  claudeClientId: z.string().volatile().default(''),
  claudeRedirectUri: z.string().volatile().default(''),
  grokClientId: z.string().volatile().default(''),
  grokRedirectUri: z.string().volatile().default(''),
  grokBaseUrl: z.string().volatile().default(''),
  grokClientVersion: z.string().volatile().default('')
    .description('Grok CLI identity version header. Empty uses the built-in default.'),
  antigravityClientId: z.string().volatile().default(''),
  antigravityClientSecret: z.string().role('secret').default('')
    .description('Google OAuth client secret for custom confidential clients or CLI tokens requiring secret refresh.'),
  antigravityRedirectUri: z.string().volatile().default(''),
  antigravityModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Antigravity.'),
  codexOriginator: z.string().volatile().default('')
    .description('Originator header for Codex API requests (e.g. codex_cli_rs).'),
  codexSystemPrefix: z.string().volatile().default('')
    .description('System prompt prefix for Codex.'),
  codexModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Codex.'),
  claudeSystemPrefix: z.string().volatile().default('')
    .description('System prompt prefix for Claude.'),
  claudeCcVersion: z.string().volatile().default('')
    .description('Claude Code version header for billing attribution (default: 2.1.289.7e2).'),
  claudeModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Claude.'),
  grokModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Grok.'),
  cascadingFallback: z.boolean().volatile().default(false)
    .description('#349 Opt-in cross-vendor fallback when all accounts of a provider are exhausted or rate limited.'),
  cascadingChain: z.any().volatile().default({})
    .description('#349 Custom cross-vendor fallback chains (e.g. { claude: ["copilot", "cursor"] }).'),
  webhookUrl: z.string().volatile().default('')
    .description('#351 External webhook URL to receive quota and session alerts (JSON POST).'),
  alertThresholds: z.array(z.number()).volatile().default([80, 90, 95])
    .description('#351 Quota usage percentage thresholds for firing alerts.'),
  enableToasts: z.boolean().volatile().default(true)
    .description('#510 In-app toast alerts for quarantine and quota threshold events.'),
  autoPacing: z.boolean().volatile().default(true)
    .description('#352 Predictive burn-rate load balancing between accounts.'),
  drainBeforeReset: z.boolean().volatile().default(false)
    .description('#485 Prioritize accounts with closest reset window to burn expiring quota first.'),
  drainSafetyPercent: z.number().volatile().default(5)
    .description('#485 Safety margin percent: avoid draining accounts below this threshold when alternatives exist.'),
  customVendors: z.array(z.any()).volatile().default([])
    .description('Declarative OpenAI-Responses-compatible providers. See README.'),
})

export function publicConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg
  const clone = { ...cfg }
  // #242, #252: redact secret fields before exposing config via GET /config.
  for (const key of Object.keys(clone)) {
    if (key.endsWith("ClientSecret") || key.endsWith("Secret")) {
      clone[key] = clone[key] ? "••••••" : ""
    }
  }

  // Redact credentials in slots (proxyUrl with user:pass)
  if (Array.isArray(clone.slots)) {
    clone.slots = clone.slots.map((s) => {
      if (!s || typeof s !== "object" || !s.proxyUrl) return s
      try {
        const u = new URL(s.proxyUrl)
        if (u.password || u.username) {
          const auth = u.username ? (u.password ? `${u.username}:${u.password}` : u.username) : `:${u.password}`
          const safeAuth = u.username ? `${u.username}:••••••` : `:••••••`
          return { ...s, proxyUrl: s.proxyUrl.replace(auth + "@", safeAuth + "@") }
        }
      } catch { /* ignore non-standard url */ }
      return s
    })
  }

  // Redact credentials in customVendors (apiKey, token, secret, Authorization headers)
  if (Array.isArray(clone.customVendors)) {
    clone.customVendors = clone.customVendors.map((cv) => {
      if (!cv || typeof cv !== "object") return cv
      const copy = { ...cv }
      if (copy.apiKey) copy.apiKey = "••••••"
      if (copy.token) copy.token = "••••••"
      if (copy.secret) copy.secret = "••••••"
      if (copy.clientSecret) copy.clientSecret = "••••••"
      if (copy.headers && typeof copy.headers === "object") {
        const h = { ...copy.headers }
        for (const hk of Object.keys(h)) {
          const lower = hk.toLowerCase()
          if (lower === "authorization" || lower.includes("key") || lower.includes("token") || lower.includes("secret")) {
            h[hk] = "••••••"
          }
        }
        copy.headers = h
      }
      return copy
    })
  }

  return clone
}

export function restoreMaskedSecrets(incoming, existing) {
  if (!incoming || typeof incoming !== "object") return incoming
  if (!existing || typeof existing !== "object") return incoming

  const out = { ...incoming }

  for (const key of Object.keys(out)) {
    if ((key.endsWith("ClientSecret") || key.endsWith("Secret")) && typeof out[key] === "string") {
      if (out[key].includes("••••")) {
        out[key] = existing[key] || ""
      }
    }
  }

  if (Array.isArray(out.slots) && Array.isArray(existing.slots)) {
    out.slots = out.slots.map((s) => {
      if (!s || typeof s !== "object" || typeof s.proxyUrl !== "string" || !s.proxyUrl.includes("••••")) return s
      const match = existing.slots.find((e) => e && e.provider === s.provider && Number(e.index) === Number(s.index))
      if (match && match.proxyUrl) {
        return { ...s, proxyUrl: match.proxyUrl }
      }
      return s
    })
  }

  if (Array.isArray(out.customVendors) && Array.isArray(existing.customVendors)) {
    out.customVendors = out.customVendors.map((cv) => {
      if (!cv || typeof cv !== "object") return cv
      const match = existing.customVendors.find((e) => e && e.id === cv.id)
      if (!match) return cv
      const copy = { ...cv }
      for (const f of ["apiKey", "token", "secret", "clientSecret"]) {
        if (typeof copy[f] === "string" && copy[f].includes("••••")) {
          copy[f] = match[f] || ""
        }
      }
      if (copy.headers && typeof copy.headers === "object" && match.headers && typeof match.headers === "object") {
        const h = { ...copy.headers }
        for (const hk of Object.keys(h)) {
          if (typeof h[hk] === "string" && h[hk].includes("••••")) {
            h[hk] = match.headers[hk] || ""
          }
        }
        copy.headers = h
      }
      return copy
    })
  }

  return out
}
